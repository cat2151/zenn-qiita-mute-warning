const DEBUG_FLAG_KEY = 'zmw_debug_mode_enabled';

document.addEventListener('DOMContentLoaded', () => {
  const debugToggle = document.getElementById('debugToggle');
  const zennLocalMuteForm = document.getElementById('zennLocalMuteForm');
  const zennLocalMuteInput = document.getElementById('zennLocalMuteInput');
  const zennLocalMuteList = document.getElementById('zennLocalMuteList');
  const zennLocalMuteStatus = document.getElementById('zennLocalMuteStatus');

  chrome.storage.local.get([DEBUG_FLAG_KEY]).then(result => {
    debugToggle.checked = Boolean(result[DEBUG_FLAG_KEY]);
  });

  debugToggle.addEventListener('change', () => {
    chrome.storage.local.set({ [DEBUG_FLAG_KEY]: debugToggle.checked });
  });

  function setStatus(message) {
    zennLocalMuteStatus.textContent = message || '';
  }

  function renderZennLocalMutes(usernames) {
    zennLocalMuteList.textContent = '';

    if (!usernames.length) {
      const item = document.createElement('li');
      item.className = 'empty';
      item.textContent = '登録なし';
      zennLocalMuteList.appendChild(item);
      return;
    }

    for (const username of usernames) {
      const item = document.createElement('li');

      const name = document.createElement('code');
      name.textContent = `@${username}`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '削除';
      removeButton.addEventListener('click', async () => {
        removeButton.disabled = true;
        setStatus(`@${username} を削除中...`);
        const response = await chrome.runtime.sendMessage({
          type: 'REMOVE_ZENN_LOCAL_MUTE',
          username
        });
        renderZennLocalMutes(response?.usernames || []);
        setStatus(response?.removed ? `@${username} を削除しました。` : `@${username} は登録されていませんでした。`);
      });

      item.appendChild(name);
      item.appendChild(removeButton);
      zennLocalMuteList.appendChild(item);
    }
  }

  async function loadZennLocalMutes() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ZENN_LOCAL_MUTED_USERNAMES' });
    renderZennLocalMutes(response?.usernames || []);
  }

  zennLocalMuteForm.addEventListener('submit', async event => {
    event.preventDefault();
    const input = zennLocalMuteInput.value.trim();
    if (!input) return;

    setStatus('追加中...');
    const response = await chrome.runtime.sendMessage({
      type: 'ADD_ZENN_LOCAL_MUTE',
      username: input
    });

    renderZennLocalMutes(response?.usernames || []);
    if (response?.ok) {
      zennLocalMuteInput.value = '';
      setStatus(response.added ? `@${response.username} を追加しました。` : `@${response.username} は登録済みです。`);
    } else {
      setStatus('ユーザー名を追加できませんでした。');
    }
  });

  loadZennLocalMutes();
});
