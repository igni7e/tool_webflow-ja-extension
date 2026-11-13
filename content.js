// content.js
// Webflow管理画面のUIテキストを日本語化するコンテンツスクリプト
// utils.js → content.js の順で読み込む（manifest.json）

let translator = null;
let translationDict = {};

// 翻訳済みノードの管理（OFF時に英語へ戻すため元の値を保持）
// node → { original: 元の英語, translated: 書き込んだ日本語 }
let textRecords = new WeakMap();
const translatedTextNodes = new Set();
// element → { [attr]: { original, translated } }
let attrRecords = new WeakMap();
const translatedAttrElements = new Set();

// 翻訳統計（用語単位）
let termStats = {}; // { en: { ja, count } }
let pendingStatsFlush = null;
const MAX_UNTRANSLATED_KEYS = 3000;

// 設定
let debugMode = false;
let translationEnabled = true;
let mutationObserver = null;
let isApplying = false;

/** 自分の書き換えで発生した MutationRecord を捨てる（無限ループ・二重処理の防止） */
function endApplying() {
  isApplying = false;
  if (mutationObserver) mutationObserver.takeRecords();
}

// 翻訳する属性（aria-label は Webflow 側のセレクタに使われる可能性があるため対象外）
const TRANSLATABLE_ATTRS = ["placeholder", "title"];

function isWebflowAdminUI() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  if (!hostname.endsWith("webflow.com")) return false;
  if (hostname.endsWith("webflow.io")) return false;

  if (hostname === "preview.webflow.com") return true;
  // Designer は `<site>.design.webflow.com` で動く
  if (hostname.endsWith(".design.webflow.com")) return true;

  const adminPrefixes = [
    "/dashboard",
    "/design",
    "/designer",
    "/editor",
    "/cms",
    "/ecommerce",
    "/memberships",
    "/sites",
    "/account",
    "/settings",
    "/workspace",
  ];
  return adminPrefixes.some((p) => pathname.startsWith(p));
}

async function loadSettings() {
  try {
    const res = await chrome.storage.sync.get(["debugMode", "translationEnabled"]);
    debugMode = Boolean(res.debugMode);
    translationEnabled = res.translationEnabled !== false;
  } catch {
    debugMode = false;
    translationEnabled = true;
  }
}

async function loadExistingStats() {
  try {
    const res = await chrome.storage.local.get(["termStats"]);
    if (res && res.termStats && typeof res.termStats === "object") {
      termStats = res.termStats;
    }
  } catch {
    // ignore
  }
}

async function loadTranslationDict() {
  const url = chrome.runtime.getURL("translation_terms.csv");
  const res = await fetch(url);
  const csvText = await res.text();
  translationDict = parseTranslationCSV(csvText);
  translator = createTranslator(translationDict);
}

// フレーズコンテナのタグ一覧（分割テキストノード対応用）
const PHRASE_CONTAINER_TAGS = new Set([
  "BUTTON", "A", "SPAN", "LABEL", "LI", "P", "DIV",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "OPTION", "TH", "TD", "LEGEND", "FIGCAPTION", "STRONG", "EM",
]);

// 翻訳対象から除外するセレクタ（クラス名、サイト名、ページ名、コンポーネント名など）
const SKIP_SELECTORS = [
  // クラス名・セレクタ表示エリア
  '[class*="selector"]',
  '[class*="Selector"]',
  '[class*="class-name"]',
  '[class*="ClassName"]',
  '[class*="className"]',
  '[class*="style-manager"]',
  '[class*="StyleManager"]',
  '[class*="style-selector"]',
  '[class*="StyleSelector"]',
  '.style-selector',
  '.combo-class',
  '[class*="combo-class"]',
  '[class*="ComboClass"]',

  // サイト名・プロジェクト名表示
  '[class*="site-name"]',
  '[class*="siteName"]',
  '[class*="SiteName"]',
  '[class*="project-name"]',
  '[class*="projectName"]',
  '[class*="ProjectName"]',
  '[class*="site-title"]',
  '[class*="siteTitle"]',
  '[class*="SiteTitle"]',

  // ページ名・テンプレート名表示
  '[class*="page-name"]',
  '[class*="pageName"]',
  '[class*="PageName"]',
  '[class*="template-name"]',
  '[class*="templateName"]',
  '[class*="TemplateName"]',
  '[class*="page-title"]',
  '[class*="pageTitle"]',

  // コンポーネント名・シンボル名
  '[class*="component-name"]',
  '[class*="componentName"]',
  '[class*="ComponentName"]',
  '[class*="symbol-name"]',
  '[class*="symbolName"]',
  '[class*="SymbolName"]',

  // Designer のユーザー定義名（Webflow のクラス名はハッシュ化されているため data 属性で判定）
  '[data-automation-id="left-sidebar-pages-list"] [data-automation-id="list-cell"]',
  '[data-automation-id="cms-collections-list"] [data-sc*="RowItemTitle"]',
  '[data-automation-id="collection-row"]',
  '[data-automation-id="default-collection-row"]',
  '[data-automation-id*="style-rule-token"]',
  '[data-automation-id^="selected-node-title"]',
  '[data-automation-id="outline-selected-node"]',

  // ナビゲーター内の要素名表示
  '[class*="navigator"] [class*="name"]',
  '[class*="Navigator"] [class*="Name"]',
  '[class*="navigator-item"]',
  '[class*="NavigatorItem"]',
  '[class*="element-label"]',
  '[class*="elementLabel"]',
  '[class*="ElementLabel"]',
  '[class*="element-name"]',
  '[class*="elementName"]',
  '[class*="ElementName"]',

  // 入力フィールド・編集可能領域
  'input',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',

  // コードエディタ・コード表示領域
  '[class*="code-editor"]',
  '[class*="CodeEditor"]',
  '[class*="code-block"]',
  '[class*="CodeBlock"]',
  '[class*="codeBlock"]',
  'code',
  'pre',

  // Webflow特有のUI要素名表示
  '[data-automation-id*="name"]',
  '[data-automation-id*="label"]',
  '[class*="asset-name"]',
  '[class*="assetName"]',
  '[class*="AssetName"]',
  '[class*="file-name"]',
  '[class*="fileName"]',
  '[class*="FileName"]',

  // スタイルパネル内のクラス表示
  '[class*="style-name"]',
  '[class*="styleName"]',
  '[class*="StyleName"]',
  '[class*="class-label"]',
  '[class*="classLabel"]',
  '[class*="ClassLabel"]',

  // ダッシュボード内のサイト名・フォルダ名
  '[class*="site-card"] [class*="name"]',
  '[class*="SiteCard"] [class*="Name"]',
  '[class*="folder-name"]',
  '[class*="folderName"]',
  '[class*="FolderName"]',

  // ユーザーが入力したコンテンツの表示領域
  '[class*="user-content"]',
  '[class*="userContent"]',
  '[class*="custom-text"]',
  '[class*="customText"]',

  // フォント一覧・フォント選択UI（フォント名を翻訳しない）
  '[class*="font-list"]',
  '[class*="fontList"]',
  '[class*="FontList"]',
  '[class*="font-picker"]',
  '[class*="fontPicker"]',
  '[class*="FontPicker"]',
  '[class*="font-family"]',
  '[class*="fontFamily"]',
  '[class*="FontFamily"]',
  '[class*="font-menu"]',
  '[class*="fontMenu"]',
  '[class*="FontMenu"]',
  '[class*="font-dropdown"]',
  '[class*="fontDropdown"]',
  '[class*="FontDropdown"]',
  '[class*="typography-font"]',
  '[class*="typographyFont"]',
  '[class*="TypographyFont"]',

  // コンポーネント一覧（ユーザー定義名を翻訳しない）
  '[class*="component-list"]',
  '[class*="componentList"]',
  '[class*="ComponentList"]',
  '[class*="component-item"]',
  '[class*="componentItem"]',
  '[class*="ComponentItem"]',
  '[class*="symbol-list"]',
  '[class*="symbolList"]',
  '[class*="SymbolList"]',
  '[class*="symbol-item"]',
  '[class*="symbolItem"]',
  '[class*="SymbolItem"]',
];

const SKIP_SELECTOR_COMBINED = SKIP_SELECTORS.join(",");
// 属性翻訳では入力欄そのものは除外しない（placeholder を訳すため）
const ATTR_SKIP_SELECTOR_COMBINED = SKIP_SELECTORS.filter(
  (s) => !["input", "textarea"].includes(s)
).join(",");

function shouldSkipElement(el, selector = SKIP_SELECTOR_COMBINED) {
  if (!el) return true;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
  try {
    if (el.closest(selector)) return true;
  } catch {
    // 無効なセレクタは無視
  }
  return isUserNamedLabel(el);
}

// ダッシュボードのサイトカード・フォルダの名前（ユーザーが付けた名前）は訳さない
// 例: フォルダ「Demo」「Archive」、サイト「Cookie」
const NAMED_ITEM_SELECTOR = '[data-automation-id$="-site-item"], [data-automation-id="folder-item"]';

function isUserNamedLabel(el) {
  const named = el.closest("[data-name]");
  if (named && named.getAttribute("data-name") === normalizeText(el.textContent)) return true;
  const item = el.closest(NAMED_ITEM_SELECTOR);
  if (item) {
    const first = item.querySelector('[data-text="true"], [data-sc="Text"]');
    if (first && (first === el || first.contains(el))) return true;
  }
  return false;
}

// ---- 統計 ----

function scheduleStatsFlush() {
  if (pendingStatsFlush) return;
  pendingStatsFlush = setTimeout(async () => {
    pendingStatsFlush = null;
    try {
      await chrome.storage.local.set({ termStats, termStatsUpdatedAt: Date.now() });
    } catch {
      // ignore
    }
  }, 1000);
}

function recordTerm(en) {
  const ja = translationDict[en];
  const cur = termStats[en] ?? { ja, count: 0 };
  cur.ja = ja ?? cur.ja;
  cur.count += 1;
  termStats[en] = cur;
  scheduleStatsFlush();
}

function recordUntranslated(text) {
  if (!debugMode) return;
  const snippet = normalizeText(text).slice(0, 120);
  if (!containsEnglishText(snippet)) return;
  const key = `__untranslated__:${snippet}`;
  if (!termStats[key] && Object.keys(termStats).length > MAX_UNTRANSLATED_KEYS) return;
  termStats[key] = termStats[key] ?? { ja: "", count: 0 };
  termStats[key].count += 1;
  scheduleStatsFlush();
}

// ---- 書き換え（元の値を記録しつつ） ----

function setTextNode(node, value) {
  const rec = textRecords.get(node);
  if (!rec || rec.translated !== node.nodeValue) {
    // 初回、または Webflow 側が書き換えた後 → 今の値を元の値として記録
    textRecords.set(node, { original: node.nodeValue, translated: value });
  } else {
    rec.translated = value;
  }
  node.nodeValue = value;
  translatedTextNodes.add(node);
  pruneDetached(translatedTextNodes);
}

function setAttr(el, attr, value) {
  let recs = attrRecords.get(el);
  if (!recs) {
    recs = {};
    attrRecords.set(el, recs);
  }
  const cur = el.getAttribute(attr);
  if (!recs[attr] || recs[attr].translated !== cur) {
    recs[attr] = { original: cur, translated: value };
  } else {
    recs[attr].translated = value;
  }
  el.setAttribute(attr, value);
  translatedAttrElements.add(el);
  pruneDetached(translatedAttrElements);
}

function pruneDetached(set) {
  if (set.size < 5000) return;
  for (const n of set) if (!n.isConnected) set.delete(n);
}

// ---- テキスト翻訳 ----

/** 親要素の複数テキストノードをつなげて訳す（例: "Publish to " + "selected domains"） */
function tryTranslateAsParentPhrase(textNode) {
  const parent = textNode.parentElement;
  if (!parent || !PHRASE_CONTAINER_TAGS.has(parent.tagName)) return false;
  if (parent.childElementCount > 0) return false;

  const nodes = Array.from(parent.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
  if (nodes.length < 2) return false;

  const fullText = nodes.map((n) => n.nodeValue).join("");
  if (!fullText.trim() || fullText.length > 200 || isAlreadyTranslated(fullText)) return false;

  const r = translator.translate(fullText);
  if (!r) return false;

  // React が持っているテキストノードを残したまま、先頭に訳文・残りを空にする
  nodes.forEach((n, i) => setTextNode(n, i === 0 ? r.text : ""));
  recordTerm(r.en);
  return true;
}

function replaceTextNode(node) {
  if (!translationEnabled || !translator) return;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;

  const value = node.nodeValue;
  if (!value || !value.trim()) return;

  // 自分が書き込んだ値のままなら何もしない
  const rec = textRecords.get(node);
  if (rec && rec.translated === value) return;
  if (isAlreadyTranslated(value)) return;
  if (shouldSkipElement(node.parentElement)) return;

  if (tryTranslateAsParentPhrase(node)) return;

  const r = translator.translate(value);
  if (r) {
    setTextNode(node, r.text);
    recordTerm(r.en);
  } else {
    recordUntranslated(value);
  }
}

function replaceAttributes(el) {
  if (!translationEnabled || !translator) return;
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  for (const attr of TRANSLATABLE_ATTRS) {
    const value = el.getAttribute(attr);
    if (!value || isAlreadyTranslated(value)) continue;
    const recs = attrRecords.get(el);
    if (recs && recs[attr] && recs[attr].translated === value) continue;
    if (shouldSkipElement(el, ATTR_SKIP_SELECTOR_COMBINED)) return;
    const r = translator.translate(value);
    if (r) {
      setAttr(el, attr, r.text);
      recordTerm(r.en);
    } else {
      recordUntranslated(value);
    }
  }
}

const ATTR_QUERY = TRANSLATABLE_ATTRS.map((a) => `[${a}]`).join(",");

function walkAndReplace(root) {
  if (!translationEnabled || !translator || !root) return;
  isApplying = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) replaceTextNode(node);

    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.matches(ATTR_QUERY)) replaceAttributes(root);
      root.querySelectorAll(ATTR_QUERY).forEach(replaceAttributes);
    }
  } finally {
    endApplying();
  }
}

/** OFF にしたとき、書き換えたテキストと属性を英語に戻す */
function restoreOriginals() {
  isApplying = true;
  try {
    for (const node of translatedTextNodes) {
      const rec = textRecords.get(node);
      if (rec && node.isConnected && node.nodeValue === rec.translated) {
        node.nodeValue = rec.original;
      }
    }
    for (const el of translatedAttrElements) {
      const recs = attrRecords.get(el);
      if (!recs || !el.isConnected) continue;
      for (const [attr, r] of Object.entries(recs)) {
        if (el.getAttribute(attr) === r.translated) el.setAttribute(attr, r.original);
      }
    }
  } finally {
    translatedTextNodes.clear();
    translatedAttrElements.clear();
    textRecords = new WeakMap();
    attrRecords = new WeakMap();
    endApplying();
  }
}

// ---- 監視 ----

function observeMutations() {
  mutationObserver = new MutationObserver((mutations) => {
    if (!translationEnabled || isApplying) return;
    const roots = new Set();
    const textNodes = new Set();
    const attrEls = new Set();
    for (const m of mutations) {
      if (m.type === "characterData") {
        textNodes.add(m.target);
      } else if (m.type === "attributes") {
        attrEls.add(m.target);
      } else {
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.TEXT_NODE) textNodes.add(n);
          else if (n.nodeType === Node.ELEMENT_NODE) roots.add(n);
        }
      }
    }
    isApplying = true;
    try {
      for (const t of textNodes) replaceTextNode(t);
      for (const el of attrEls) replaceAttributes(el);
    } finally {
      endApplying();
    }
    for (const r of roots) if (r.isConnected) walkAndReplace(r);
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS,
  });
}

// 設定変更（ポップアップの ON/OFF）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.debugMode) debugMode = Boolean(changes.debugMode.newValue);
  if (changes.translationEnabled) {
    translationEnabled = changes.translationEnabled.newValue !== false;
    if (!isWebflowAdminUI()) return;
    if (translationEnabled) walkAndReplace(document.body);
    else restoreOriginals();
  }
});

function hookSpaNavigation(onUrlChange) {
  // content script は隔離環境のため history.pushState のフックは効かない。URL をポーリングで監視する
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    onUrlChange();
  }, 500);
  window.addEventListener("popstate", onUrlChange);
}

// ---- 初期化 ----
let started = false;

async function start() {
  if (started) return;
  started = true;
  await loadExistingStats();
  await loadTranslationDict();
  if (translationEnabled) walkAndReplace(document.body);
  observeMutations();
}

(async function init() {
  await loadSettings();

  // Webflow トップなど管理画面以外から SPA 遷移してきた場合もここで開始する
  hookSpaNavigation(async () => {
    if (!isWebflowAdminUI()) return;
    if (!started) return start();
    if (!translationEnabled) return;
    // 画面遷移後の描画を待ってから全体を再走査（MutationObserver の取りこぼし対策）
    setTimeout(() => walkAndReplace(document.body), 300);
  });

  if (isWebflowAdminUI()) await start();
})();
