const log  = (...args) => console.log('[ZMW:bg]', ...args);
const warn = (...args) => console.warn('[ZMW:bg]', ...args);
const err  = (...args) => console.error('[ZMW:bg]', ...args);

const ZENN_CACHE_KEY      = 'zenn_muted_usernames';
const QIITA_CACHE_KEY     = 'qiita_muted_usernames';
const ZENN_TIMESTAMP_KEY  = 'zenn_muted_usernames_updated_at';
const QIITA_TIMESTAMP_KEY = 'qiita_muted_usernames_updated_at';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ---- Zenn ----
async function fetchZennMutedUsernames() {
  const usernames = new Set();
  let page = 1;
  while (true) {
    log(`Zenn API fetch page=${page}`);
    const res = await fetch(`https://zenn.dev/api/me/mutes?page=${page}`, { credentials: 'include' });
    log(`Zenn page=${page} status=${res.status}`);
    if (!res.ok) { warn(`Zenn API error: ${res.status}`); break; }
    const data = await res.json();
    const mutes = data.mutes || [];
    if (mutes.length === 0) { log('Zenn ページネーション終了'); break; }
    for (const m of mutes) { if (m.muted_user?.username) usernames.add(m.muted_user.username); }
    log(`Zenn page=${page} 累計=${usernames.size}件`);
    page++;
  }
  return Array.from(usernames);
}

// ---- Qiita ----
async function fetchQiitaMutedUsernames(csrfToken) {
  log(`Qiita GraphQL fetch csrfToken=${csrfToken ? '有り' : '無し'}`);
  const headers = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch('https://qiita.com/graphql', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      operationName: 'GetMutingUsers',
      variables: {},
      query: `query GetMutingUsers {
  viewer {
    ...MutingUsers
    __typename
  }
}
fragment MutingUsers on Viewer {
  mutingUsers {
    urlName
    __typename
  }
  __typename
}`
    })
  });
  log(`Qiita GraphQL status=${res.status}`);
  if (!res.ok) { warn(`Qiita API error: ${res.status}`); return []; }
  const data = await res.json();
  const users = data?.data?.viewer?.mutingUsers || [];
  const usernames = users.map(u => u.urlName).filter(Boolean);
  log(`Qiita ミュートリスト: ${usernames.length}件`);
  return usernames;
}

// ---- キャッシュ更新 ----
async function refreshIfNeeded(site, csrfToken) {
  const cacheKey     = site === 'qiita' ? QIITA_CACHE_KEY     : ZENN_CACHE_KEY;
  const timestampKey = site === 'qiita' ? QIITA_TIMESTAMP_KEY : ZENN_TIMESTAMP_KEY;

  const result = await chrome.storage.local.get([cacheKey, timestampKey]);
  const lastUpdated = result[timestampKey] || 0;
  const now = Date.now();
  const age = Math.round((now - lastUpdated) / 1000);

  log(`${site} キャッシュ: age=${age}s, cached=${result[cacheKey]?.length ?? 'なし'}件`);

  if (now - lastUpdated < CACHE_TTL_MS && result[cacheKey]?.length > 0) {
    log(`${site} キャッシュ有効 → スキップ`);
    return;
  }

  log(`${site} キャッシュ期限切れまたは空 → fetch開始`);
  try {
    const usernames = site === 'qiita'
      ? await fetchQiitaMutedUsernames(csrfToken)
      : await fetchZennMutedUsernames();
    await chrome.storage.local.set({ [cacheKey]: usernames, [timestampKey]: now });
    log(`${site} ミュートリスト更新完了: ${usernames.length}件`);
  } catch (e) {
    err(`${site} ミュートリスト取得失敗:`, e);
  }
}

// ---- メッセージ受信 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log(`メッセージ受信: type=${message.type} site=${message.site}`);

  if (message.type === 'GET_MUTED_USERNAMES') {
    const cacheKey = message.site === 'qiita' ? QIITA_CACHE_KEY : ZENN_CACHE_KEY;
    chrome.storage.local.get([cacheKey]).then(result => {
      const usernames = result[cacheKey] || [];
      log(`GET_MUTED_USERNAMES(${message.site}) 応答: ${usernames.length}件`);
      sendResponse({ usernames });
    });
    return true;
  }

  if (message.type === 'SAVE_QIITA_MUTES') {
    chrome.storage.local.set({
      [QIITA_CACHE_KEY]: message.usernames,
      [QIITA_TIMESTAMP_KEY]: Date.now()
    }).then(() => {
      log(`SAVE_QIITA_MUTES: ${message.usernames.length}件保存`);
      sendResponse({});
    });
    return true;
  }

  if (message.type === 'REFRESH_IF_NEEDED') {
    refreshIfNeeded(message.site, message.csrfToken).then(() => sendResponse({}));
    return true;
  }

  if (message.type === 'FORCE_REFRESH') {
    const fetchFn = message.site === 'qiita'
      ? () => fetchQiitaMutedUsernames(message.csrfToken)
      : fetchZennMutedUsernames;
    const cacheKey     = message.site === 'qiita' ? QIITA_CACHE_KEY     : ZENN_CACHE_KEY;
    const timestampKey = message.site === 'qiita' ? QIITA_TIMESTAMP_KEY : ZENN_TIMESTAMP_KEY;
    fetchFn().then(usernames => {
      chrome.storage.local.set({ [cacheKey]: usernames, [timestampKey]: Date.now() });
      log(`FORCE_REFRESH(${message.site}) 完了: ${usernames.length}件`);
      sendResponse({ usernames });
    });
    return true;
  }
});

// ---- タブ更新時にキャッシュ鮮度チェック ----
// Qiitaはcsrftoken不要でタブ更新チェックはZennのみ。
// Qiitaはcontent scriptからREFRESH_IF_NEEDEDで呼ぶ。
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (tab.url?.startsWith('https://zenn.dev/')) {
    log(`Zennタブ更新: ${tab.url}`);
    refreshIfNeeded('zenn');
  }
});
