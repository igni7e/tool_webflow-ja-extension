// src/csv.js
// 翻訳用語集CSVのパース／シリアライズを担うモジュール。
// ブラウザでは globalThis.WFJA.csv、Node では module.exports として公開する。

(function (root, factory) {
  const api = factory();
  root.WFJA = root.WFJA || {};
  root.WFJA.csv = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * 最小CSV行パーサ（ダブルクォートで囲まれたカンマ／改行内クォートのエスケープに対応）。
   * 例: '"Save, Draft",保存(下書き)' → ['Save, Draft', '保存(下書き)']
   * @param {string} line - CSVの1行
   * @returns {string[]} 列の配列
   */
  function parseCSVRow(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // "" はエスケープされた " とみなす
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  /**
   * CSVテキストをパースし、英語→日本語の辞書オブジェクトを返す。
   * 1行目はヘッダー想定。空行・列不足・空セルはスキップする。
   * 同一キーが複数ある場合は最初の出現を優先する（後勝ちで上書きしない）。
   * @param {string} csvText - CSVファイルのテキスト
   * @returns {Object<string, string>} { 英語: 日本語, ... } の辞書
   */
  function parseTranslationCSV(csvText) {
    const lines = String(csvText || "").split(/\r?\n/);
    const dict = {};

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row) continue;
      const cols = parseCSVRow(row);
      if (!cols || cols.length < 2) continue;
      const en = (cols[0] ?? "").trim();
      const ja = (cols[1] ?? "").trim();
      if (!en || !ja) continue;
      // 最初の出現を優先（重複行があっても安定）
      if (!(en in dict)) dict[en] = ja;
    }
    return dict;
  }

  /**
   * 1セルをCSV用にエスケープする（カンマ・改行・クォートを含む場合のみクォート）。
   * @param {string} value
   * @returns {string}
   */
  function escapeCSVCell(value) {
    const s = String(value ?? "");
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  return { parseCSVRow, parseTranslationCSV, escapeCSVCell };
});
