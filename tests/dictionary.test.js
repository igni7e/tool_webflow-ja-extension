// tests/dictionary.test.js
// 実際の translation_terms.csv の健全性を検証する。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseCSVRow, parseTranslationCSV } = require("../src/csv.js");

const CSV_PATH = path.join(__dirname, "..", "translation_terms.csv");
const csvText = fs.readFileSync(CSV_PATH, "utf8");
const lines = csvText.split(/\r?\n/);

test("ヘッダー行が正しい", () => {
  assert.equal(lines[0], "English Term,Japanese Translation");
});

test("重複する英語キーが存在しない", () => {
  const seen = new Set();
  const dups = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = parseCSVRow(lines[i]);
    if (!cols || cols.length < 2) continue;
    const en = (cols[0] ?? "").trim();
    if (!en) continue;
    if (seen.has(en)) dups.push(en);
    seen.add(en);
  }
  assert.deepEqual(dups, [], `重複キー: ${dups.join(", ")}`);
});

test("各行に英語・日本語の両方があり、前後空白がない", () => {
  const bad = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCSVRow(line);
    if (!cols || cols.length < 2) {
      bad.push(`行${i + 1}: 列不足`);
      continue;
    }
    const en = cols[0] ?? "";
    const ja = cols[1] ?? "";
    if (en.trim() === "" || ja.trim() === "") bad.push(`行${i + 1}: 空セル`);
    if (en !== en.trim() || ja !== ja.trim()) bad.push(`行${i + 1}: 前後空白`);
  }
  assert.deepEqual(bad, [], bad.join(" / "));
});

test("十分な数の用語が収録されている", () => {
  const dict = parseTranslationCSV(csvText);
  assert.ok(Object.keys(dict).length >= 2000, `用語数: ${Object.keys(dict).length}`);
});

test("1行がちょうど2列（英文中のカンマはクォートで囲む）", () => {
  const bad = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = parseCSVRow(lines[i]);
    if (cols.length !== 2) bad.push(`行${i + 1}: ${cols.length}列`);
  }
  assert.deepEqual(bad, [], bad.join(" / "));
});

test("訳が英語の断片になっている行がない（カンマ崩れの検出）", () => {
  const dict = parseTranslationCSV(csvText);
  const JA = /[぀-ヿ一-鿿]/;
  const bad = Object.entries(dict).filter(
    ([en, ja]) => !JA.test(ja) && ja !== en && /[A-Za-z]{3}/.test(ja) && !/\{[a-z]/i.test(en)
  );
  assert.deepEqual(bad, [], bad.map(([en, ja]) => `${en} → ${ja}`).join(" / "));
});
