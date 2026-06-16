// options.js
// オプションページのロジック（用語集表示、翻訳プレビュー、統計表示など）

const WFJA = globalThis.WFJA;
let translationDict = {};
let translator = null;
const UNTRANSLATED_PREFIX = WFJA.constants.UNTRANSLATED_PREFIX;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

async function loadSettings() {
  try {
    const res = await chrome.storage.sync.get(["debugMode"]);
    const cb = document.getElementById("debug-mode");
    if (cb) cb.checked = Boolean(res.debugMode);
  } catch {
    // ignore
  }
}

async function saveSettings() {
  const cb = document.getElementById("debug-mode");
  const debugMode = Boolean(cb?.checked);
  await chrome.storage.sync.set({ debugMode });
}

function formatDateTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

// 用語集をテーブル表示
async function showTranslationTable() {
  // CSVファイルをfetch
  const res = await fetch(chrome.runtime.getURL('translation_terms.csv'));
  const csvText = await res.text();
  // モジュールで辞書化＆翻訳器を構築
  translationDict = WFJA.csv.parseTranslationCSV(csvText);
  translator = WFJA.translator.createTranslator(translationDict, {
    patterns: WFJA.constants.TRANSLATION_PATTERNS,
  });

  // 用語数を表示
  const countEl = document.getElementById("term-count");
  if (countEl) countEl.textContent = `（収録: ${Object.keys(translationDict).length} 件）`;

  // テーブル要素を作成
  const table = document.createElement('table');
  table.border = 1;
  // ヘッダー
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>英語 (English)</th><th>日本語 (Japanese)</th></tr>';
  table.appendChild(thead);
  // 本体
  const tbody = document.createElement('tbody');
  for (const [en, ja] of Object.entries(translationDict)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(en)}</td><td>${escapeHtml(ja)}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // ページに追加
  document.body.appendChild(table);
}

// 翻訳プレビュー機能（完全一致＋動的パターンの両方を試す）
function previewPartialReplace() {
  const input = document.getElementById('preview-input').value;
  const translated = translator
    ? translator.translate(input, { skipIfJapanese: false, caseInsensitive: false })
    : null;
  const result = translated ? translated.text : input;
  const hit = translated ? "（一致あり）" : "（一致なし・原文のまま）";
  document.getElementById('preview-result').textContent = `翻訳結果: ${result} ${hit}`;
}

async function loadTermStats() {
  const res = await chrome.storage.local.get(["termStats", "termStatsUpdatedAt"]);
  return {
    termStats: res.termStats || {},
    updatedAt: res.termStatsUpdatedAt || null,
  };
}

function splitStats(termStats) {
  const translated = [];
  const untranslated = [];
  for (const [key, info] of Object.entries(termStats || {})) {
    if (key.startsWith(UNTRANSLATED_PREFIX)) {
      untranslated.push([key.slice(UNTRANSLATED_PREFIX.length), info]);
    } else {
      translated.push([key, info]);
    }
  }
  return { translated, untranslated };
}

function renderTranslatedTable(entries) {
  const container = document.getElementById("stats-container");
  if (!container) return;

  // count desc
  entries.sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0));

  const table = document.createElement("table");
  table.border = 1;
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>英語キー（CSV）</th><th>日本語</th><th>回数</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const [en, info] of entries) {
    const ja = info?.ja ?? "";
    const count = info?.count ?? 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(en)}</td><td>${escapeHtml(ja)}</td><td>${escapeHtml(String(count))}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);
}

function renderUntranslatedTable(entries) {
  const container = document.getElementById("untranslated-container");
  if (!container) return;

  // count desc
  entries.sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0));

  const table = document.createElement("table");
  table.border = 1;
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>英語候補（スニペット）</th><th>出現回数</th><th>操作</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const [snippet, info] of entries) {
    const count = info?.count ?? 0;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(snippet)}</td>` +
      `<td>${escapeHtml(String(count))}</td>` +
      `<td><button class="copy-snippet-btn" data-snippet="${escapeHtml(snippet)}">コピー</button></td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);

  // copy buttons
  container.querySelectorAll(".copy-snippet-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const snippet = btn.getAttribute("data-snippet") || "";
      try {
        await navigator.clipboard.writeText(snippet);
        btn.textContent = "コピー済み";
        setTimeout(() => (btn.textContent = "コピー"), 900);
      } catch {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = snippet;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    });
  });
}

function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshStats() {
  const { termStats, updatedAt } = await loadTermStats();
  const { translated, untranslated } = splitStats(termStats);
  renderTranslatedTable(translated);
  renderUntranslatedTable(untranslated);
  const el = document.getElementById("stats-updated-at");
  if (el) el.textContent = updatedAt ? `更新: ${formatDateTime(updatedAt)}` : "";
}

async function exportStatsCSV() {
  const { termStats } = await loadTermStats();
  const rows = [["English", "Japanese", "Count"]];
  for (const [en, info] of Object.entries(termStats || {})) {
    if (en.startsWith(UNTRANSLATED_PREFIX)) continue;
    rows.push([en, info?.ja ?? "", String(info?.count ?? 0)]);
  }
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  downloadCSV(`webflow-ja-term-stats-${Date.now()}.csv`, csv);
}

async function exportUntranslatedCSV() {
  const { termStats } = await loadTermStats();
  const rows = [["EnglishCandidate", "Count"]];
  for (const [key, info] of Object.entries(termStats || {})) {
    if (!key.startsWith(UNTRANSLATED_PREFIX)) continue;
    const snippet = key.slice(UNTRANSLATED_PREFIX.length);
    rows.push([snippet, String(info?.count ?? 0)]);
  }
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  downloadCSV(`webflow-ja-untranslated-candidates-${Date.now()}.csv`, csv);
}

async function resetStats() {
  const ok = confirm("翻訳統計（翻訳済み・未翻訳候補）をリセットします。よろしいですか？");
  if (!ok) return;
  await chrome.storage.local.remove(["termStats", "termStatsUpdatedAt"]);
  await refreshStats();
}

// ページロード時に表示
window.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await showTranslationTable();

  // プレビューボタンにイベント追加
  document.getElementById('preview-btn').addEventListener('click', previewPartialReplace);

  const saveBtn = document.getElementById("save-settings-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      await saveSettings();
      saveBtn.textContent = "保存しました";
      setTimeout(() => (saveBtn.textContent = "保存"), 1200);
    });
  }

  const refreshBtn = document.getElementById("refresh-stats-btn");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshStats);
  const exportBtn = document.getElementById("export-stats-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportStatsCSV);
  const resetBtn = document.getElementById("reset-stats-btn");
  if (resetBtn) resetBtn.addEventListener("click", resetStats);

  const refreshUnBtn = document.getElementById("refresh-untranslated-btn");
  if (refreshUnBtn) refreshUnBtn.addEventListener("click", refreshStats);
  const exportUnBtn = document.getElementById("export-untranslated-btn");
  if (exportUnBtn) exportUnBtn.addEventListener("click", exportUntranslatedCSV);

  await refreshStats();
}); 