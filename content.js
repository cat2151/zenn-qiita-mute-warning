const log  = (...args) => console.log('[ZMW:content]', ...args);
const warn = (...args) => console.warn('[ZMW:content]', ...args);

function getAuthorUsername() {
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
    if (m) {
      log(`DOMから著者取得: selector="${selector}" username="${m[1]}"`);
      return m[1];
    }
  }

  const match = location.pathname.match(/^\/([^\/]+)\/(articles|books)\//);
  if (match) {
    log(`URLから著者取得: username="${match[1]}"`);
    return match[1];
  }

  return null;
}

function removeWarning() {
  const existing = document.getElementById('zenn-mute-warning-banner');
  if (existing) {
    existing.remove();
    document.body.style.marginTop = '';
  }
}

function showWarning(username) {
  if (document.getElementById('zenn-mute-warning-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'zenn-mute-warning-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 99999;
    background: #b91c1c;
    color: #fff;
    padding: 12px 20px;
    font-size: 14px;
    font-family: sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  const message = document.createElement('span');
  message.textContent = `⚠️ このページの著者 @${username} はミュートしているユーザーです。`;

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;align-items:center;';

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'このまま読む';
  dismissBtn.style.cssText = `
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.5);
    color: #fff;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  `;
  dismissBtn.addEventListener('click', () => {
    banner.remove();
    document.body.style.marginTop = '';
  });

  const backBtn = document.createElement('button');
  backBtn.textContent = '← 戻る';
  backBtn.style.cssText = `
    background: #fff;
    border: none;
    color: #b91c1c;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
  `;
  backBtn.addEventListener('click', () => history.back());

  actions.appendChild(dismissBtn);
  actions.appendChild(backBtn);
  banner.appendChild(message);
  banner.appendChild(actions);
  document.body.prepend(banner);

  const height = banner.offsetHeight;
  document.body.style.marginTop = `${height}px`;
}

let cachedMutedUsernames = null;

async function getMutedUsernames() {
  if (cachedMutedUsernames !== null) return cachedMutedUsernames;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_MUTED_USERNAMES' });
    cachedMutedUsernames = response?.usernames || [];
    log(`ミュートリスト取得: ${cachedMutedUsernames.length}件`);
  } catch (e) {
    warn('sendMessage失敗:', e);
    cachedMutedUsernames = [];
  }
  return cachedMutedUsernames;
}

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

  const isArticle = /^\/[^\/]+\/(articles|books)\//.test(path);
  if (!isArticle) {
    log('記事・本ページではないためスキップ');
    checking = false;
    return;
  }

  // CSR遷移後のDOMレンダリングを待つ
  await new Promise(r => setTimeout(r, 800));

  const username = getAuthorUsername();
  log(`著者username="${username}"`);
  if (!username) {
    warn('username取得失敗');
    checking = false;
    return;
  }

  const mutedUsernames = await getMutedUsernames();
  log(`@${username} はミュート対象: ${mutedUsernames.includes(username)}`);

  if (mutedUsernames.includes(username)) {
    log('→ 警告バナーを表示');
    showWarning(username);
  }

  checking = false;
}

// setIntervalでURL変化を定期監視（Next.js SPA対応の最も確実な方法）
setInterval(() => checkCurrentPage(), 300);

// 初回チェック
checkCurrentPage();
