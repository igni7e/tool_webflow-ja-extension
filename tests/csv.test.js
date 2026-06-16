// tests/csv.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCSVRow, parseTranslationCSV, escapeCSVCell } = require("../src/csv.js");

test("parseCSVRow: 通常のカンマ区切り", () => {
  assert.deepEqual(parseCSVRow("Save,保存"), ["Save", "保存"]);
});

test("parseCSVRow: クォート内のカンマを保持", () => {
  assert.deepEqual(parseCSVRow('"Save, Draft",保存(下書き)'), ["Save, Draft", "保存(下書き)"]);
});

test("parseCSVRow: エスケープされたクォート", () => {
  assert.deepEqual(parseCSVRow('"a ""b"" c",x'), ['a "b" c', "x"]);
});

test("parseTranslationCSV: ヘッダーをスキップして辞書化", () => {
  const dict = parseTranslationCSV("English Term,Japanese Translation\nSave,保存\nDelete,削除\n");
  assert.deepEqual(dict, { Save: "保存", Delete: "削除" });
});

test("parseTranslationCSV: 重複キーは最初の出現を優先", () => {
  const dict = parseTranslationCSV("h,h\nOrder,注文\nOrder,順序\n");
  assert.equal(dict.Order, "注文");
});

test("parseTranslationCSV: 前後の空白を除去し空セルを無視", () => {
  const dict = parseTranslationCSV("h,h\nConfirm,確認 \nFoo,\n,Bar\n");
  assert.equal(dict.Confirm, "確認");
  assert.equal("Foo" in dict, false);
});

test("escapeCSVCell: 特殊文字を含む場合のみクォート", () => {
  assert.equal(escapeCSVCell("Save"), "Save");
  assert.equal(escapeCSVCell("Save, Draft"), '"Save, Draft"');
  assert.equal(escapeCSVCell('a"b'), '"a""b"');
});
