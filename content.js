const DEBUG_FLAG_KEY = 'zmw_debug_mode_enabled';
const LOG_PREFIX = '[ZMW:content]';
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

// ---- サイト判定 ----
const SITE = location.hostname.includes('qiita.com') ? 'qiita' : 'zenn';
log(`サイト: ${SITE}`);

// ---- 著者username取得 ----
function getAuthorUsername() {
  if (SITE === 'zenn') {
    // DOMを優先（Publication記事対応）
    const domCandidates = [
      '[class*="ArticleHeader_metaUserName"]',
      '[class*="ArticleHeader_avatar"]',
      '[class*="ArticleHeader_author"]',
      '[class*="authorLink"]',
    ];
    for (const selector of domCandidates) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const href = el.tagName === 'A' ? el.getAttribute('href') : el.querySelector('a')?.getAttribute('href');
      const m = href?.match(/^\/([^\/]+)$/);
      if (m) { log(`Zenn DOMから著者: selector="${selector}" username="${m[1]}"`); return m[1]; }
    }
    // フォールバック: URL
    const match = location.pathname.match(/^\/([^\/]+)\/(articles|books)\//);
    if (match) { log(`Zenn URLから著者: "${match[1]}"`); return match[1]; }
    return null;
  }

  if (SITE === 'qiita') {
    // Qiita記事URL: /username/items/slug
    const match = location.pathname.match(/^\/([^\/]+)\/items\//);
    if (match) { log(`Qiita URLから著者: "${match[1]}"`); return match[1]; }
    return null;
  }
}

// ---- 記事ページ判定 ----
function isArticlePage() {
  if (SITE === 'zenn')  return /^\/[^\/]+\/(articles|books)\//.test(location.pathname);
  if (SITE === 'qiita') return /^\/[^\/]+\/items\//.test(location.pathname);
  return false;
}

// ---- 警告バナー ----
function removeWarning() {
  const el = document.getElementById('zmw-warning-banner');
  if (el) { el.remove(); document.body.style.marginTop = ''; }
}

function showWarning(username) {
  if (document.getElementById('zmw-warning-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'zmw-warning-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
    background: #b91c1c; color: #fff; padding: 12px 20px;
    font-size: 14px; font-family: sans-serif;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  const message = document.createElement('span');
  message.textContent = `⚠️ このページの著者 @${username} はミュートしているユーザーです。`;

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;align-items:center;';

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'このまま読む';
  dismissBtn.style.cssText = `
    background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5);
    color: #fff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
  `;
  dismissBtn.addEventListener('click', () => { banner.remove(); document.body.style.marginTop = ''; });

  const backBtn = document.createElement('button');
  backBtn.textContent = '← 戻る';
  backBtn.style.cssText = `
    background: #fff; border: none; color: #b91c1c;
    padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;
  `;
  backBtn.addEventListener('click', () => history.back());

  actions.appendChild(dismissBtn);
  actions.appendChild(backBtn);
  banner.appendChild(message);
  banner.appendChild(actions);
  document.body.prepend(banner);
  document.body.style.marginTop = `${banner.offsetHeight}px`;
}

// ---- Qiitaミュートリストをcontent scriptからfetchするFetch ----
async function fetchQiitaMutedUsernamesFromContent() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const csrfToken = meta?.getAttribute('content') || null;
  log(`Qiita CSRFトークン: ${csrfToken ? '取得成功' : '取得失敗'}`);

  const res = await fetch('https://qiita.com/graphql', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: JSON.stringify({
      operationName: 'GetMutingUsers',
      variables: {},
      query: `query GetMutingUsers {
  viewer {
    mutingUsers {
      urlName
      __typename
    }
    __typename
  }
}`
    })
  });
  log(`Qiita GraphQL status=${res.status}`);
  if (!res.ok) { warn(`Qiita fetch失敗: ${res.status}`); return []; }
  const data = await res.json();
  const users = data?.data?.viewer?.mutingUsers || [];
  const usernames = users.map(u => u.urlName).filter(Boolean);
  log(`Qiita ミュートリスト: ${usernames.length}件`);
  return usernames;
}

// ---- ミュートリストキャッシュ ----
let cachedMutedUsernames = null;

async function getMutedUsernames() {
  if (cachedMutedUsernames !== null) return cachedMutedUsernames;

  if (SITE === 'qiita') {
    // Qiitaはcontent scriptからfetch（ServiceWorkerだとCSRF検証で弾かれる）
    try {
      cachedMutedUsernames = await fetchQiitaMutedUsernamesFromContent();
      // backgroundのキャッシュにも保存する
      await chrome.runtime.sendMessage({ type: 'SAVE_QIITA_MUTES', usernames: cachedMutedUsernames });
    } catch (e) {
      warn('Qiita fetch失敗:', e);
      cachedMutedUsernames = [];
    }
    return cachedMutedUsernames;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_MUTED_USERNAMES', site: SITE });
    cachedMutedUsernames = response?.usernames || [];
    log(`ミュートリスト取得: ${cachedMutedUsernames.length}件`);
  } catch (e) {
    warn('sendMessage失敗:', e);
    cachedMutedUsernames = [];
  }
  return cachedMutedUsernames;
}

// ---- ページチェック ----
let lastCheckedPath = null;
let checking = false;

async function checkCurrentPage() {
  const path = location.pathname;
  if (path === lastCheckedPath) return;
  if (checking) return;
  lastCheckedPath = path;
  checking = true;

  log(`ページチェック: ${path}`);
  removeWarning();

  if (!isArticlePage()) {
    log('記事ページではないためスキップ');
    checking = false;
    return;
  }

  await new Promise(r => setTimeout(r, 800));

  const username = getAuthorUsername();
  log(`著者username="${username}"`);
  if (!username) { warn('username取得失敗'); checking = false; return; }

  const mutedUsernames = await getMutedUsernames();
  log(`@${username} はミュート対象: ${mutedUsernames.includes(username)}`);

  if (mutedUsernames.includes(username)) {
    log('→ 警告バナーを表示');
    showWarning(username);
  }

  checking = false;
}

// setIntervalでURL変化を監視（SPA対応）
setInterval(() => checkCurrentPage(), 300);
checkCurrentPage();
