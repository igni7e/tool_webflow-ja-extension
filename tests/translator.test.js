// tests/translator.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/translator.js");
const { TRANSLATION_PATTERNS } = require("../src/constants.js");

const dict = { Publish: "公開", "Add new item": "新しいアイテムを追加", Delete: "削除" };

test("isAlreadyTranslated: 日本語の有無を判定", () => {
  assert.equal(T.isAlreadyTranslated("公開"), true);
  assert.equal(T.isAlreadyTranslated("カタカナ"), true);
  assert.equal(T.isAlreadyTranslated("Publish"), false);
});

test("containsEnglishText: 英単語を含み日本語を含まない", () => {
  assert.equal(T.containsEnglishText("Publish changes"), true);
  assert.equal(T.containsEnglishText("公開 Publish"), false);
  assert.equal(T.containsEnglishText("123"), false);
});

test("translateExact: ノード全体一致のみ翻訳（部分一致しない）", () => {
  const pairs = T.optimizeTranslationPairs(dict);
  assert.equal(T.translateExact("Publish", pairs).text, "公開");
  // 部分一致は翻訳しない
  assert.equal(T.translateExact("Publish changes", pairs), null);
});

test("translateExact: 前後の空白を保持", () => {
  const pairs = T.optimizeTranslationPairs(dict);
  assert.equal(T.translateExact("  Publish  ", pairs).text, "  公開  ");
});

test("translateExact: 既に日本語ならスキップ", () => {
  const pairs = T.optimizeTranslationPairs(dict);
  assert.equal(T.translateExact("公開", pairs), null);
});

test("translatePattern: 「N minutes ago」を翻訳", () => {
  assert.equal(T.translatePattern("5 minutes ago", TRANSLATION_PATTERNS).text, "5分前");
  assert.equal(T.translatePattern("1 day ago", TRANSLATION_PATTERNS).text, "1日前");
  assert.equal(T.translatePattern("3 months ago", TRANSLATION_PATTERNS).text, "3か月前");
  assert.equal(T.translatePattern("a minute ago", TRANSLATION_PATTERNS).text, "1分前");
});

test("translatePattern: 件数・ページ", () => {
  assert.equal(T.translatePattern("12 items", TRANSLATION_PATTERNS).text, "12個のアイテム");
  assert.equal(T.translatePattern("1 item", TRANSLATION_PATTERNS).text, "1個のアイテム");
  assert.equal(T.translatePattern("Page 2 of 5", TRANSLATION_PATTERNS).text, "5ページ中2ページ目");
  assert.equal(T.translatePattern("3 selected", TRANSLATION_PATTERNS).text, "3件を選択中");
});

test("translatePattern: 一致しないものは null", () => {
  assert.equal(T.translatePattern("hello world", TRANSLATION_PATTERNS), null);
  assert.equal(T.translatePattern("items", TRANSLATION_PATTERNS), null);
});

test("createTranslator: 完全一致を優先し、無ければパターン", () => {
  const tr = T.createTranslator(dict, { patterns: TRANSLATION_PATTERNS });
  assert.equal(tr.translate("Delete").text, "削除");
  assert.equal(tr.translate("7 days ago").text, "7日前");
  assert.equal(tr.translate("totally unknown"), null);
});

test("createTranslator: termCounts にキー/パターンIDが入る", () => {
  const tr = T.createTranslator(dict, { patterns: TRANSLATION_PATTERNS });
  assert.deepEqual(tr.translate("Delete").termCounts, { Delete: 1 });
  assert.deepEqual(tr.translate("5 items").termCounts, { "__pattern__:n-items": 1 });
});
