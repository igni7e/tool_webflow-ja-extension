// tests/translator.real.test.js
// 実際の translation_terms.csv と翻訳エンジンを組み合わせた検証（2026-11 Booost の実画面で収集した文言）
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseTranslationCSV } = require("../src/csv.js");
const T = require("../src/translator.js");
const { TRANSLATION_PATTERNS } = require("../src/constants.js");

const dict = parseTranslationCSV(
  fs.readFileSync(path.join(__dirname, "..", "translation_terms.csv"), "utf8")
);
const t = T.createTranslator(dict, { patterns: TRANSLATION_PATTERNS });
const tr = (s) => (t.translate(s) || {}).text;

test("カンマを含む英文を1キーとして読む", () => {
  assert.equal(tr("If populated, this will be added to all of your pages."), "入力すると、すべてのページに追加されます。");
  assert.equal(t.translate("If populated"), null);
});

test("空白・nbsp・大小文字の違いを吸収する", () => {
  assert.equal(tr("Page settings"), "ページ設定");
  assert.equal(tr("Page   settings"), "ページ設定");
  assert.equal(tr("Custom code"), dict["Custom Code"]);
});

test("短い語は大小文字を区別する", () => {
  assert.equal(t.translate("id"), dict["id"] ? { text: dict["id"], termCounts: { id: 1 } } : null);
});

test("末尾の記号・ショートカット表記を外して訳す", () => {
  assert.equal(tr("Settings:"), "設定:");
  assert.equal(tr("Name *"), dict["Name"] + " *");
  assert.equal(tr("Variables (V)"), dict["Variables"] + " (V)");
});

test("CSV のプレースホルダー付きキー", () => {
  assert.equal(tr("Edited 20 minutes ago"), "20分前に編集");
  assert.equal(tr("Published 2 days ago"), "2日前に公開");
  assert.equal(tr("5 instances"), "5個のインスタンス");
  assert.equal(tr("2K CMS items"), "CMSアイテム 2K");
  assert.equal(tr("1 on this page, 1 on other pages."), "このページに1件、他のページに1件");
  assert.equal(tr("12:11:10 pm · 100 pages · 1908 styles · 11990 elements"), "12:11:10 pm · 100ページ · 1908スタイル · 11990要素");
  assert.equal(tr("Billing and hosting for Booost"), "Booost の請求とホスティング");
  assert.equal(tr("Search blogs..."), "blogsを検索…");
});

test("{x} は訳せない英語だけの値では使わない", () => {
  assert.equal(t.translate("Edited by someone"), null);
  assert.equal(t.translate("Search 1"), null);
});
