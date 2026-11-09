// content.js
// Webflow管理画面のUIテキストを日本語化するコンテンツスクリプト

// utils.jsの関数を利用（manifest.jsonで utils.js → content.js の順）

let translationDict = {};
let translationPairs = [];

// ノード/処理のキャッシュ
let processedNodes = new WeakSet();
let nodeOriginalTextMap = new WeakMap();
let nodeLastValueMap = new WeakMap();

// 翻訳統計（用語単位）
let termStats = {}; // { en: { ja, count } }
let pendingStatsFlush = null;

// 設定
let debugMode = false;
let translationEnabled = true;
let mutationObserver = null;

function isWebflowAdminUI() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  // webflow.com 配下だけ
  if (!hostname.endsWith("webflow.com")) return false;

  // 公開サイト(.webflow.io)は対象外（念のため）
  if (hostname.endsWith("webflow.io")) return false;

  // previewは対象
  if (hostname === "preview.webflow.com") return true;

  // Designerは `*.design.webflow.com/` のようなサブドメインで動くことがある
  if (hostname.endsWith(".design.webflow.com")) return true;

  // 管理画面系のパス（必要に応じて増やす）
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
    // 追加候補:
    // "/workspace",
    // "/team",
  ];
  return adminPrefixes.some((p) => pathname.startsWith(p));
}

async function loadSettings() {
  try {
    const res = await chrome.storage.sync.get(["debugMode", "translationEnabled"]);
    debugMode = Boolean(res.debugMode);
    // undefinedの場合はtrue（デフォルトON）
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

// 1. CSVファイルの読み込み
async function loadTranslationDict() {
  try {
    const url = chrome.runtime.getURL("translation_terms.csv");
    // 拡張機能パッケージ内のCSVファイルをfetchで取得
    const res = await fetch(url);
    const csvText = await res.text();
    // ユーティリティ関数で辞書化
    translationDict = parseTranslationCSV(csvText);
    translationPairs = optimizeTranslationPairs(translationDict);
  } catch (e) {
    throw e;
  }
}

// フレーズコンテナのタグ一覧（分割テキストノード対応用）
const PHRASE_CONTAINER_TAGS = new Set([
  'BUTTON', 'A', 'SPAN', 'LABEL', 'LI', 'P',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'OPTION', 'TH', 'TD', 'LEGEND', 'FIGCAPTION'
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

// セレクタを結合して一度にマッチできるようにする
const SKIP_SELECTOR_COMBINED = SKIP_SELECTORS.join(',');

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return false;

  const tag = parent.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;

  // 親要素または祖先要素が除外セレクタにマッチするかチェック
  try {
    if (parent.closest(SKIP_SELECTOR_COMBINED)) return true;
  } catch {
    // セレクタが無効な場合は無視
  }

  return false;
}

function scheduleStatsFlush() {
  if (pendingStatsFlush) return;
  pendingStatsFlush = setTimeout(async () => {
    pendingStatsFlush = null;
    try {
      await chrome.storage.local.set({
        termStats,
        termStatsUpdatedAt: Date.now(),
      });
    } catch {
      // ignore
    }
  }, 1000);
}

function recordTermStats(termCounts) {
  for (const [en, c] of Object.entries(termCounts)) {
    if (!c) continue;
    const ja = translationDict[en];
    const cur = termStats[en] ?? { ja, count: 0 };
    cur.ja = ja ?? cur.ja;
    cur.count += c;
    termStats[en] = cur;
  }
  scheduleStatsFlush();
}

// storage変更リスナー（翻訳ON/OFF切り替え対応）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (changes.translationEnabled) {
    translationEnabled = changes.translationEnabled.newValue !== false;
    if (translationEnabled && isWebflowAdminUI()) {
      // キャッシュクリアして翻訳再開
      processedNodes = new WeakSet();
      nodeLastValueMap = new WeakMap();
      walkAndReplace(document.body);
    }
  }
});

// 親要素のtextContent全体で翻訳を試行（分割テキストノード対応）
function tryTranslateAsParentPhrase(textNode) {
  const parent = textNode.parentElement;
  if (!parent) return false;

  // UIコンテナタグのみ対象
  if (!PHRASE_CONTAINER_TAGS.has(parent.tagName)) return false;

  // テキストのみのコンテナ（ネストした要素なし）
  if (parent.childElementCount > 0) return false;

  // 処理済みならスキップ
  if (processedNodes.has(parent)) return false;

  const fullText = parent.textContent;
  if (!fullText) return false;

  const trimmed = fullText.trim();
  if (!trimmed || trimmed.length > 150) return false;

  // 翻訳済みならスキップ
  if (isAlreadyTranslated(trimmed)) {
    processedNodes.add(parent);
    return false;
  }

  // 翻訳を試行
  const translated = translateTextWithStats(trimmed, translationPairs, {
    skipIfJapanese: true,
    caseInsensitive: false,
  });

  if (translated) {
    // 元のホワイトスペースを保持
    const leadingSpace = fullText.match(/^\s*/)[0];
    const trailingSpace = fullText.match(/\s*$/)[0];
    parent.textContent = leadingSpace + translated.text.trim() + trailingSpace;

    recordTermStats(translated.termCounts);
    processedNodes.add(parent);
    return true;
  }

  return false;
}

// 2. テキストノードの部分置換（最適化版 + マッピング統計）
function replaceTextNode(node) {
  if (!translationEnabled) return;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  if (processedNodes.has(node)) {
    // ただし nodeValue が変わっていたら再処理する
    const last = nodeLastValueMap.get(node);
    if (last === node.nodeValue) return;
  }

  if (shouldSkipTextNode(node)) return;

  // 親要素フレーズ翻訳を先に試行（分割テキストノード対応）
  if (tryTranslateAsParentPhrase(node)) {
    return;
  }

  const originalText = node.nodeValue;
  if (!originalText || originalText.trim().length === 0) return;

  // デバッグ用に元テキストを保持（最初だけ）
  if (!nodeOriginalTextMap.has(node)) nodeOriginalTextMap.set(node, originalText);

  const translated = translateTextWithStats(originalText, translationPairs, {
    skipIfJapanese: true,
    caseInsensitive: false,
  });

  if (translated) {
    node.nodeValue = translated.text;
    recordTermStats(translated.termCounts);
  } else if (debugMode && containsEnglishText(originalText)) {
    // 未翻訳候補として統計に残す（必要最小限：countのみ）
    const key = `__untranslated__:${originalText.slice(0, 120)}`;
    termStats[key] = termStats[key] ?? { ja: "", count: 0 };
    termStats[key].count += 1;
    scheduleStatsFlush();
  }

  processedNodes.add(node);
  nodeLastValueMap.set(node, node.nodeValue);
}

// 3. DOMツリー走査（テキストノードのみ対象）
function walkAndReplace(root) {
  if (!translationEnabled) return;
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node;
  while ((node = walker.nextNode())) {
    replaceTextNode(node);
  }
}

// 4. MutationObserverで動的要素にも対応
function observeMutations() {
  mutationObserver = new MutationObserver((mutations) => {
    if (!translationEnabled) return;
    const textNodes = new Set();
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && mutation.target?.nodeType === Node.TEXT_NODE) {
        textNodes.add(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          textNodes.add(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // 追加要素内のテキストを集めてからまとめて処理
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
          let t;
          while ((t = walker.nextNode())) textNodes.add(t);
        }
      }
    }
    for (const t of textNodes) replaceTextNode(t);
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function hookSpaNavigation(onUrlChange) {
  const fire = () => onUrlChange();
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    const ret = origPush.apply(this, args);
    fire();
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = origReplace.apply(this, args);
    fire();
    return ret;
  };
  window.addEventListener("popstate", fire);
}

// 5. 初期化処理
(async function init() {
  await loadSettings();

  // 管理画面以外では動かさない（最終ゲート）
  const gate = isWebflowAdminUI();
  if (!gate) return;

  await loadExistingStats();
  await loadTranslationDict();

  // 翻訳が有効な場合のみ初期翻訳を実行
  if (translationEnabled) {
    walkAndReplace(document.body);
  }
  observeMutations();

  // SPA遷移でも継続
  let lastHref = location.href;
  hookSpaNavigation(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    // 画面種別が変わった場合は停止/再開
    if (!isWebflowAdminUI()) return;
    // 再走査（キャッシュはクリア）
    processedNodes = new WeakSet();
    nodeLastValueMap = new WeakMap();
    setTimeout(() => walkAndReplace(document.body), 300);
  });
})(); 