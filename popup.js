// popup.js
// ポップアップUI：翻訳のON/OFF切り替えとオプションページへの導線。

const toggle = document.getElementById("enabled-toggle");
const statusEl = document.getElementById("status");

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

async function loadState() {
  try {
    const res = await chrome.storage.sync.get(["enabled"]);
    const enabled = res.enabled !== false; // 既定はON
    toggle.checked = enabled;
    setStatus(enabled ? "Webflowの管理画面で日本語化を適用します。" : "翻訳は無効です。");
  } catch {
    toggle.checked = true;
  }
}

toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;
  try {
    await chrome.storage.sync.set({ enabled });
    setStatus(
      enabled
        ? "有効にしました。開いているWebflowのタブを再読み込みします。"
        : "無効にしました。開いているWebflowのタブを再読み込みします。"
    );
  } catch {
    setStatus("設定の保存に失敗しました。");
  }
});

document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
});

loadState();
