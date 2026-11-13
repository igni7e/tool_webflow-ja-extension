// popup.js
// 翻訳のオン/オフを切り替えるポップアップUI

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('translationToggle');
  const status = document.getElementById('status');
  const statusText = status.querySelector('.status-text');

  // 現在の状態を読み込み
  const result = await chrome.storage.sync.get(['translationEnabled']);
  // undefinedの場合はtrue（デフォルトON）
  const enabled = result.translationEnabled !== false;

  toggle.checked = enabled;
  updateStatus(enabled);

  // トグル変更時の処理
  toggle.addEventListener('change', async () => {
    const newValue = toggle.checked;
    await chrome.storage.sync.set({ translationEnabled: newValue });
    updateStatus(newValue);
  });

  function updateStatus(enabled) {
    if (enabled) {
      status.className = 'status enabled';
      statusText.textContent = '翻訳が有効です';
    } else {
      status.className = 'status disabled';
      statusText.textContent = '翻訳が無効です（英語表示）';
    }
  }
});
