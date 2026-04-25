const DEBUG_FLAG_KEY = 'zmw_debug_mode_enabled';
const LOG_PREFIX = '[ZMW:content]';
const ZENN_CACHE_KEY = 'zenn_muted_usernames';
const ZENN_LOCAL_MUTES_KEY = 'zenn_local_muted_usernames';
const ZENN_LOCAL_MUTE_BUTTON_ID = 'zmw-local-mute-button';
let debugEnabled = false;
let cachedMutedUsernames = null;
const cachedMutesForSite = {};
const ZENN_RESERVED_TOP_LEVEL_PATHS = new Set([
  'about',
  'api',
  'articles',
  'books',
  'dashboard',
  'editor',
  'explore',
  'faq',
  'help',
  'login',
  'me',
  'new',
  'notifications',
  'privacy',
  'publications',
  'scraps',
  'search',
  'settings',
  'signin',
  'signup',
  'tech-or-idea',
  'topics',
  'users',
]);

const debugReady = chrome.storage.local.get([DEBUG_FLAG_KEY]).then(result => {
  debugEnabled = Boolean(result[DEBUG_FLAG_KEY]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && DEBUG_FLAG_KEY in changes) {
    debugEnabled = Boolean(changes[DEBUG_FLAG_KEY].newValue);
  }
  if (area === 'local' && (ZENN_CACHE_KEY in changes || ZENN_LOCAL_MUTES_KEY in changes)) {
    cachedMutedUsernames = null;
    cachedMutesForSite.zenn = null;
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
const SITE = location.hostname === 'qiita.com' ? 'qiita'
           : location.hostname === 'bsky.app'   ? 'bluesky'
           : 'zenn';
log(`サイト: ${SITE}`);

function getZennProfileUsername() {
  if (SITE !== 'zenn') return null;
  const match = location.pathname.match(/^\/([^\/]+)\/?$/);
  if (!match) return null;

  const username = match[1];
  if (!/^[A-Za-z0-9_-]+$/.test(username)) return null;
  if (ZENN_RESERVED_TOP_LEVEL_PATHS.has(username.toLowerCase())) return null;
  return username;
}

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
    const profileUsername = getZennProfileUsername();
    if (profileUsername) { log(`ZennプロフィールURLからユーザー: "${profileUsername}"`); return profileUsername; }
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

function getWarningTargetKind() {
  if (isArticlePage()) return 'article';
  if (getZennProfileUsername()) return 'zenn_profile';
  return null;
}

// ---- 警告バナー ----
function removeWarning() {
  const el = document.getElementById('zmw-warning-banner');
  if (el) { el.remove(); document.body.style.marginTop = ''; }
}

function removeLocalMuteButton() {
  const el = document.getElementById(ZENN_LOCAL_MUTE_BUTTON_ID);
  if (el) el.remove();
}

function showWarning(username, subject = '著者') {
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
  message.textContent = `⚠️ このページの${subject} @${username} はミュートしているユーザーです。`;

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

function showLocalMuteButton(username, subject = '著者') {
  if (SITE !== 'zenn') return;
  if (document.getElementById(ZENN_LOCAL_MUTE_BUTTON_ID)) return;

  const button = document.createElement('button');
  button.id = ZENN_LOCAL_MUTE_BUTTON_ID;
  button.type = 'button';
  const defaultLabel = `@${username} をローカルミュート`;
  button.textContent = defaultLabel;
  button.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 99998;
    background: #111827; color: #fff; border: 1px solid rgba(255,255,255,0.18);
    border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 13px;
    font-family: sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  `;

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = '追加中...';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_ZENN_LOCAL_MUTE',
        username
      });

      if (!response?.ok) {
        button.disabled = false;
        button.textContent = '追加できませんでした';
        setTimeout(() => { button.textContent = defaultLabel; }, 1600);
        return;
      }

      cachedMutedUsernames = null;
      cachedMutesForSite.zenn = null;
      removeLocalMuteButton();
      showWarning(username, subject);
    } catch (e) {
      warn('ローカルミュート追加失敗:', e);
      button.disabled = false;
      button.textContent = '追加できませんでした';
      setTimeout(() => { button.textContent = defaultLabel; }, 1600);
    }
  });

  document.body.appendChild(button);
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
  removeLocalMuteButton();

  const targetKind = getWarningTargetKind();
  if (!targetKind) {
    log('警告対象ページではないためスキップ');
    checking = false;
    return;
  }

  await new Promise(r => setTimeout(r, 800));

  const username = getAuthorUsername();
  const subject = targetKind === 'zenn_profile' ? 'ユーザー' : '著者';
  log(`${subject}username="${username}"`);
  if (!username) { warn('username取得失敗'); checking = false; return; }

  const mutedUsernames = await getMutedUsernames();
  log(`@${username} はミュート対象: ${mutedUsernames.includes(username)}`);

  if (mutedUsernames.includes(username)) {
    log('→ 警告バナーを表示');
    showWarning(username, subject);
  } else if (SITE === 'zenn') {
    showLocalMuteButton(username, subject);
  }

  checking = false;
}

// ---- Bluesky timeline処理 ----
const BLUESKY_URL_PATTERNS = [
  { re: /https?:\/\/zenn\.dev\/([^\/]+)\/(articles|books)\//, site: 'zenn' },
  { re: /https?:\/\/qiita\.com\/([^\/]+)\/items\//, site: 'qiita' },
];

async function getMutedUsernamesForSite(site) {
  if (cachedMutesForSite[site] != null) return cachedMutesForSite[site];
  // Qiitaのミュートリストはqiita.comのcontent scriptがSAVE_QIITA_MUTESで保存するため、
  // qiita.comを最近訪問していない場合はキャッシュが空になることがある。
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_MUTED_USERNAMES', site });
    cachedMutesForSite[site] = response?.usernames || [];
    log(`Bluesky: ${site}ミュートリスト取得: ${cachedMutesForSite[site].length}件`);
  } catch (e) {
    warn('sendMessage失敗:', e);
    cachedMutesForSite[site] = [];
  }
  return cachedMutesForSite[site];
}

function findBlueskyPostElement(el) {
  let node = el;
  while (node && node !== document.body) {
    if (node.dataset?.testid?.startsWith('feedItem-')) return node;
    if (node.tagName === 'ARTICLE') return node;
    node = node.parentElement;
  }
  return null;
}

const processedBlueskyPosts = new WeakSet();

async function processBlueskyPost(postEl) {
  if (processedBlueskyPosts.has(postEl)) return;

  let processedSuccessfully = false;
  try {
    await checkPostForMutedAuthor(postEl);
    processedSuccessfully = true;
  } finally {
    if (processedSuccessfully) processedBlueskyPosts.add(postEl);
  }
}

async function checkPostForMutedAuthor(postEl) {
  const links = postEl.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.href;
    for (const { re, site } of BLUESKY_URL_PATTERNS) {
      const m = href.match(re);
      if (!m) continue;
      const username = m[1];
      const muted = await getMutedUsernamesForSite(site);
      if (muted.includes(username)) {
        log(`Bluesky: @${username} (${site}) はミュート対象`);
        showBlueskyWarning(postEl, username, site);
        return;
      }
    }
  }
}

function showBlueskyWarning(postEl, username, site) {
  if (postEl.querySelector('.zmw-inline-warning')) return;
  const banner = document.createElement('div');
  banner.className = 'zmw-inline-warning';
  banner.style.cssText = `
    background: #b91c1c; color: #fff; padding: 8px 12px;
    font-size: 13px; font-family: sans-serif;
    display: flex; align-items: center; justify-content: space-between;
  `;
  banner.addEventListener('click', e => e.stopPropagation());

  const msg = document.createElement('span');
  msg.textContent = `⚠️ このポストにリンクされている著者 @${username} (${site}) はミュートしているユーザーです。`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', '閉じる');
  btn.textContent = '×';
  btn.style.cssText = `background:transparent;border:none;color:#fff;cursor:pointer;font-size:16px;padding:0 0 0 8px;`;
  btn.addEventListener('click', e => { e.stopPropagation(); banner.remove(); });

  banner.appendChild(msg);
  banner.appendChild(btn);

  const postContentEl = postEl.firstElementChild;
  let originalBorderTopWidth = null;
  if (postContentEl) {
    const computed = getComputedStyle(postContentEl);
    const borderTopWidth = computed.borderTopWidth;
    const borderTopStyle = computed.borderTopStyle;
    if (borderTopWidth !== '0px' && borderTopStyle !== 'none' && borderTopStyle !== 'hidden') {
      originalBorderTopWidth = borderTopWidth;
      banner.style.borderTop = `${borderTopWidth} ${borderTopStyle} ${computed.borderTopColor}`;
    }
  }

  postEl.prepend(banner);

  if (postContentEl && originalBorderTopWidth !== null) {
    postContentEl.style.borderTopWidth = '0px';
    btn.addEventListener('click', () => { postContentEl.style.borderTopWidth = originalBorderTopWidth; });
  }
}

function processBlueskyLink(link) {
  const href = link.href;
  for (const { re } of BLUESKY_URL_PATTERNS) {
    if (re.test(href)) {
      const postEl = findBlueskyPostElement(link);
      if (postEl) processBlueskyPost(postEl);
      break;
    }
  }
}

function scanBlueskyPosts() {
  document.querySelectorAll('a[href]').forEach(link => processBlueskyLink(link));
}

function initBluesky() {
  log('Bluesky timeline監視開始');
  scanBlueskyPosts();
  const observer = new MutationObserver(mutationsList => {
    for (const mutation of mutationsList) {
      if (mutation.addedNodes.length === 0) continue;
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = /** @type {Element} */ (node);
        if (el.tagName === 'A' && el.hasAttribute('href')) {
          processBlueskyLink(/** @type {HTMLAnchorElement} */ (el));
        }
        el.querySelectorAll('a[href]').forEach(link => processBlueskyLink(link));
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (SITE === 'bluesky') {
  initBluesky();
} else {
  // setIntervalでURL変化を監視（SPA対応）
  setInterval(() => checkCurrentPage(), 300);
  checkCurrentPage();
}
