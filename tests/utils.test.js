// node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const U = require("../utils.js");

const csv = fs.readFileSync(path.join(__dirname, "..", "translation_terms.csv"), "utf8");
const dict = U.parseTranslationCSV(csv);
const t = U.createTranslator(dict);
const tr = (s) => (t.translate(s) || {}).text;

test("CSV: カンマを含む英文を1キーとして読む", () => {
  assert.strictEqual(dict["If populated, this will be added to all of your pages."], "入力すると、すべてのページに追加されます。");
  assert.ok(!("If populated" in dict));
});

test("完全一致・前後の空白保持", () => {
  assert.strictEqual(tr("Publish"), "公開");
  assert.strictEqual(tr("  Publish \n"), "  公開 \n");
});

test("空白・nbsp の正規化", () => {
  assert.strictEqual(tr("Page settings"), "ページ設定");
  assert.strictEqual(tr("Page   settings"), "ページ設定");
});

test("大小文字の違いを吸収（4文字以上）", () => {
  assert.strictEqual(tr("Custom code"), dict["Custom Code"]);
  assert.strictEqual(tr("PAGE SETTINGS"), "ページ設定");
});

test("短い語は大小文字を区別", () => {
  if (dict["ID"]) assert.strictEqual(t.translate("id"), null);
});

test("末尾の記号を外して訳す", () => {
  assert.strictEqual(tr("Settings:"), "設定:");
  assert.strictEqual(tr("Loading..."), dict["Loading..."] || "読み込み中…");
  assert.strictEqual(tr("Name *"), dict["Name"] + " *");
});

test("パターン翻訳", () => {
  const p = U.createTranslator({ "{n} items": "{n}件のアイテム", "Last published {x}": "最終公開: {x}" });
  assert.strictEqual(p.translate("12 items").text, "12件のアイテム");
  assert.strictEqual(p.translate("Last published 2 days ago").text, "最終公開: 2 days ago");
  assert.strictEqual(p.translate("items"), null);
});

test("英字のないテキスト・日本語は訳さない", () => {
  assert.strictEqual(t.translate("123"), null);
  assert.strictEqual(U.translateTextWithStats("公開", t), null);
});

test("実画面の定型文（2026-11 Booost で収集）", () => {
  assert.strictEqual(tr("Edited 20 minutes ago"), "20分前に編集");
  assert.strictEqual(tr("Edited Nov 11, 2026"), "Nov 11, 2026に編集");
  assert.strictEqual(tr("Published 2 days ago"), "2日前に公開");
  assert.strictEqual(tr("5 instances"), "5個のインスタンス");
  assert.strictEqual(tr("2K CMS items"), "CMSアイテム 2K");
  assert.strictEqual(tr("1 on this page, 1 on other pages."), "このページに1件、他のページに1件");
  assert.strictEqual(tr("12:11:10 pm · 100 pages · 1908 styles · 11990 elements"), "12:11:10 pm · 100ページ · 1908スタイル · 11990要素");
  assert.strictEqual(tr("Scheduled for Nov 20, 2026 10:00 AM"), "Nov 20, 2026 10:00 AMに公開予定");
});

test("ショートカット表記を残して訳す", () => {
  assert.strictEqual(tr("Variables (V)"), dict["Variables"] + " (V)");
});

test("任意文字列パターンが短い一般語を巻き込まない", () => {
  assert.strictEqual(t.translate("Search 1"), null);
});

test("{x} は訳せない英語だけのときは使わない / {s} はそのまま埋め込む", () => {
  assert.strictEqual(tr("Published to staging"), dict["Published to staging"]);
  assert.strictEqual(t.translate("Edited by someone"), null);
  assert.strictEqual(tr("Billing and hosting for Booost"), "Booost の請求とホスティング");
  assert.strictEqual(tr("Search blogs..."), "blogsを検索…");
  assert.strictEqual(tr("Exclude Text Span's content from site search results"), "Text Spanの内容をサイト内検索の結果から除外");
});
