const CACHE_KEY = 'zenn_muted_usernames';
const CACHE_TIMESTAMP_KEY = 'zenn_muted_usernames_updated_at';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1日

const log  = (...args) => console.log('[ZMW:bg]', ...args);
const warn = (...args) => console.warn('[ZMW:bg]', ...args);
const err  = (...args) => console.error('[ZMW:bg]', ...args);

async function fetchAllMutedUsernames() {
  const usernames = new Set();
  let page = 1;

  while (true) {
    log(`API fetch page=${page}`);
    const res = await fetch(`https://zenn.dev/api/me/mutes?page=${page}`, {
      credentials: 'include'
    });

    log(`page=${page} status=${res.status}`);

    if (!res.ok) {
      warn(`API error: ${res.status} (未ログインの可能性あり)`);
      break;
    }

    const data = await res.json();
    log(`page=${page} response:`, data);
    const mutes = data.mutes || [];

    if (mutes.length === 0) {
      log(`page=${page} mutes空 → ページネーション終了`);
      break;
    }

    for (const m of mutes) {
      if (m.muted_user?.username) {
        usernames.add(m.muted_user.username);
      }
    }

    log(`page=${page} 累計ミュート数=${usernames.size}`);
    page++;
  }

  return Array.from(usernames);
}

async function refreshIfNeeded() {
  const result = await chrome.storage.local.get([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
  const lastUpdated = result[CACHE_TIMESTAMP_KEY] || 0;
  const now = Date.now();
  const age = Math.round((now - lastUpdated) / 1000);

  log(`キャッシュ確認: age=${age}s, cached=${result[CACHE_KEY]?.length ?? 'なし'}件`);

  if (now - lastUpdated < CACHE_TTL_MS && result[CACHE_KEY]) {
    log('キャッシュ有効 → スキップ');
    return;
  }

  log('キャッシュ期限切れ or 未取得 → fetch開始');
  try {
    const usernames = await fetchAllMutedUsernames();
    await chrome.storage.local.set({
      [CACHE_KEY]: usernames,
      [CACHE_TIMESTAMP_KEY]: now
    });
    log(`ミュートリスト更新完了: ${usernames.length}件`, usernames);
  } catch (e) {
    err('ミュートリスト取得失敗:', e);
  }
}

// content scriptからの要求に応答
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log(`メッセージ受信: type=${message.type}`, sender.tab?.url);

  if (message.type === 'GET_MUTED_USERNAMES') {
    chrome.storage.local.get([CACHE_KEY]).then(result => {
      const usernames = result[CACHE_KEY] || [];
      log(`GET_MUTED_USERNAMES 応答: ${usernames.length}件`, usernames);
      sendResponse({ usernames });
    });
    return true; // 非同期応答
  }

  if (message.type === 'FORCE_REFRESH') {
    log('FORCE_REFRESH 開始');
    fetchAllMutedUsernames().then(usernames => {
      chrome.storage.local.set({
        [CACHE_KEY]: usernames,
        [CACHE_TIMESTAMP_KEY]: Date.now()
      });
      log(`FORCE_REFRESH 完了: ${usernames.length}件`);
      sendResponse({ usernames });
    });
    return true;
  }
});

// タブ更新時にキャッシュ鮮度チェック
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('https://zenn.dev/')) {
    log(`タブ更新検知: ${tab.url}`);
    refreshIfNeeded();
  }
});
