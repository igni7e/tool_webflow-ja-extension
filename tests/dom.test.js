// tests/dom.test.js
// jsdom を使ったDOM翻訳の結合テスト。jsdom が無い環境（CI等）では自動スキップする。
const { test } = require("node:test");
const assert = require("node:assert/strict");

let JSDOM = null;
try {
  ({ JSDOM } = require("jsdom"));
} catch {
  // jsdom 未インストール → スキップ
}

const skip = JSDOM ? false : "jsdom が無いためスキップ";

test("DOM翻訳: テキスト・属性・除外・パターン", { skip }, () => {
  const dom = new JSDOM(
    `<!DOCTYPE html><body>
      <button>Publish</button>
      <span title="Delete">icon</span>
      <code>Publish</code>
      <div class="time">5 minutes ago</div>
      <a aria-label="Settings">a</a>
      <p>Some untranslated sentence here</p>
    </body>`
  );
  const { window } = dom;

  // 必要なDOMグローバルを用意
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.MutationObserver = window.MutationObserver;

  // モジュール読み込み（UMD/IIFEが globalThis.WFJA に登録する）
  for (const m of ["../src/constants.js", "../src/csv.js", "../src/translator.js", "../src/dom.js"]) {
    delete require.cache[require.resolve(m)];
    require(m);
  }
  const WFJA = globalThis.WFJA;

  const dict = { Publish: "公開", Delete: "削除", Settings: "設定" };
  const translator = WFJA.translator.createTranslator(dict, {
    patterns: WFJA.constants.TRANSLATION_PATTERNS,
  });

  const seen = [];
  const domTranslator = WFJA.dom.createDomTranslator({
    translator,
    onTranslate: (tc) => seen.push(...Object.keys(tc)),
  });

  domTranslator.translateTree(document.body);

  const byTag = (sel) => document.querySelector(sel);

  // 完全一致（フレーズコンテナ）
  assert.equal(byTag("button").textContent, "公開");
  // 属性翻訳（title / aria-label）
  assert.equal(byTag("span").getAttribute("title"), "削除");
  assert.equal(byTag("a").getAttribute("aria-label"), "設定");
  // 除外セレクタ（code は翻訳しない）
  assert.equal(byTag("code").textContent, "Publish");
  // 動的パターン翻訳
  assert.equal(byTag(".time").textContent, "5分前");
  // 辞書/パターンに無い文は原文のまま
  assert.equal(byTag("p").textContent, "Some untranslated sentence here");

  // 統計コールバックが呼ばれている
  assert.ok(seen.includes("Publish"));
  assert.ok(seen.includes("__pattern__:n-ago"));
});

test("DOM翻訳: 翻訳済み（日本語）テキストは再翻訳しない", { skip }, () => {
  const dom = new JSDOM(`<!DOCTYPE html><body><button>公開</button></body>`);
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.MutationObserver = window.MutationObserver;

  for (const m of ["../src/constants.js", "../src/csv.js", "../src/translator.js", "../src/dom.js"]) {
    delete require.cache[require.resolve(m)];
    require(m);
  }
  const WFJA = globalThis.WFJA;
  const translator = WFJA.translator.createTranslator({ Publish: "公開" });
  const domTranslator = WFJA.dom.createDomTranslator({ translator });
  domTranslator.translateTree(document.body);
  assert.equal(document.querySelector("button").textContent, "公開");
});
