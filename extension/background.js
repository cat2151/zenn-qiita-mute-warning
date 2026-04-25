const DEBUG_FLAG_KEY = 'zmw_debug_mode_enabled';
const LOG_PREFIX = '[ZMW:bg]';
let debugEnabled = false;

const debugReady = chrome.storage.local.get([DEBUG_FLAG_KEY]).then(result => {
  debugEnabled = Boolean(result[DEBUG_FLAG_KEY]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && DEBUG_FLAG_KEY in changes) {
    debugEnabled = Boolean(changes[DEBUG_FLAG_KEY].newValue);
  }
});

const debugLog = (level, ...args) => {
  debugReady.then(() => {
    if (!debugEnabled) return;
    (console[level] || console.log)(LOG_PREFIX, ...args);
  });
};

const log  = (...args) => debugLog('log', ...args);
const warn = (...args) => debugLog('warn', ...args);
const err  = (...args) => debugLog('error', ...args);

const ZENN_CACHE_KEY      = 'zenn_muted_usernames';
const QIITA_CACHE_KEY     = 'qiita_muted_usernames';
const ZENN_LOCAL_MUTES_KEY = 'zenn_local_muted_usernames';
const ZENN_TIMESTAMP_KEY  = 'zenn_muted_usernames_updated_at';
const QIITA_TIMESTAMP_KEY = 'qiita_muted_usernames_updated_at';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeZennUsername(value) {
  const text = String(value || '').trim();
  const urlMatch = text.match(/^(?:https?:\/\/)?zenn\.dev\/([^/?#]+)/i);
  const username = (urlMatch ? urlMatch[1] : text).replace(/^@+/, '').trim();
  if (!username || /[\s/?#]/.test(username)) return '';
  return username;
}

function uniqueUsernames(values) {
  const seen = new Set();
  const usernames = [];
  for (const value of values || []) {
    const username = normalizeZennUsername(value);
    const key = username.toLowerCase();
    if (!username || seen.has(key)) continue;
    seen.add(key);
    usernames.push(username);
  }
  return usernames;
}

function mergeUsernames(...lists) {
  return uniqueUsernames(lists.flat());
}

async function getZennLocalMutedUsernames() {
  const result = await chrome.storage.local.get([ZENN_LOCAL_MUTES_KEY]);
  return uniqueUsernames(result[ZENN_LOCAL_MUTES_KEY] || []);
}

async function setZennLocalMutedUsernames(usernames) {
  const normalized = uniqueUsernames(usernames);
  await chrome.storage.local.set({ [ZENN_LOCAL_MUTES_KEY]: normalized });
  return normalized;
}

async function addZennLocalMutedUsername(value) {
  const username = normalizeZennUsername(value);
  if (!username) return { ok: false, error: 'invalid_username', usernames: await getZennLocalMutedUsernames() };

  const current = await getZennLocalMutedUsernames();
  const next = mergeUsernames(current, [username]);
  await chrome.storage.local.set({ [ZENN_LOCAL_MUTES_KEY]: next });
  return { ok: true, username, added: next.length !== current.length, usernames: next };
}

async function removeZennLocalMutedUsername(value) {
  const username = normalizeZennUsername(value);
  const current = await getZennLocalMutedUsernames();
  const removeKey = username.toLowerCase();
  const next = current.filter(name => name.toLowerCase() !== removeKey);
  await chrome.storage.local.set({ [ZENN_LOCAL_MUTES_KEY]: next });
  return { ok: true, username, removed: next.length !== current.length, usernames: next };
}

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
    const keys = message.site === 'zenn' ? [cacheKey, ZENN_LOCAL_MUTES_KEY] : [cacheKey];
    chrome.storage.local.get(keys).then(result => {
      const remoteUsernames = result[cacheKey] || [];
      const localUsernames = message.site === 'zenn' ? result[ZENN_LOCAL_MUTES_KEY] || [] : [];
      const usernames = message.site === 'zenn'
        ? mergeUsernames(remoteUsernames, localUsernames)
        : remoteUsernames;
      log(`GET_MUTED_USERNAMES(${message.site}) 応答: remote=${remoteUsernames.length}件 local=${localUsernames.length}件 total=${usernames.length}件`);
      sendResponse({ usernames });
    });
    return true;
  }

  if (message.type === 'GET_ZENN_LOCAL_MUTED_USERNAMES') {
    getZennLocalMutedUsernames().then(usernames => {
      log(`GET_ZENN_LOCAL_MUTED_USERNAMES 応答: ${usernames.length}件`);
      sendResponse({ usernames });
    });
    return true;
  }

  if (message.type === 'ADD_ZENN_LOCAL_MUTE') {
    addZennLocalMutedUsername(message.username).then(result => {
      log(`ADD_ZENN_LOCAL_MUTE: username=${result.username || ''} ok=${result.ok} added=${Boolean(result.added)}`);
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'REMOVE_ZENN_LOCAL_MUTE') {
    removeZennLocalMutedUsername(message.username).then(result => {
      log(`REMOVE_ZENN_LOCAL_MUTE: username=${result.username || ''} removed=${Boolean(result.removed)}`);
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'SET_ZENN_LOCAL_MUTED_USERNAMES') {
    setZennLocalMutedUsernames(message.usernames || []).then(usernames => {
      log(`SET_ZENN_LOCAL_MUTED_USERNAMES: ${usernames.length}件保存`);
      sendResponse({ ok: true, usernames });
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
  if (tab.url?.startsWith('https://bsky.app/')) {
    log(`Blueskyタブ更新: ${tab.url}`);
    refreshIfNeeded('zenn');
  }
});
