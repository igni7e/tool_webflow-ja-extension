// src/constants.js
// 翻訳エンジンの設定値（除外セレクタ・対象属性・動的パターンなど）をまとめたモジュール。
// ブラウザでは globalThis.WFJA.constants として、Node ではテスト用に module.exports として公開する。

(function (root, factory) {
  const api = factory();
  root.WFJA = root.WFJA || {};
  root.WFJA.constants = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // フレーズコンテナのタグ一覧（分割テキストノードを親要素単位でまとめて翻訳する対象）
  const PHRASE_CONTAINER_TAGS = new Set([
    "BUTTON", "A", "SPAN", "LABEL", "LI", "P",
    "H1", "H2", "H3", "H4", "H5", "H6",
    "OPTION", "TH", "TD", "LEGEND", "FIGCAPTION",
  ]);

  // 管理画面と判定するパスのプレフィックス
  const ADMIN_PATH_PREFIXES = [
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

  // 管理画面と判定するサブドメインのサフィックス（preview は別途完全一致で判定）
  const ADMIN_SUBDOMAIN_SUFFIXES = [".design.webflow.com"];

  // 翻訳対象とする属性（ツールチップやプレースホルダなどUI由来のテキスト）
  const TRANSLATABLE_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"];

  // 親要素フレーズ翻訳の対象とする最大文字数（長文の本文は翻訳しない）
  const MAX_PHRASE_LENGTH = 150;

  // 未翻訳候補を統計に記録する際のキープレフィックス
  const UNTRANSLATED_PREFIX = "__untranslated__:";

  // 翻訳対象から除外するセレクタ（クラス名・サイト名・ページ名・コンポーネント名・コードなど、
  // ユーザー固有の固有名詞や編集対象テキストを誤訳しないためのガード）
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
    ".style-selector",
    ".combo-class",
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
    "input",
    "textarea",
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',

    // コードエディタ・コード表示領域
    '[class*="code-editor"]',
    '[class*="CodeEditor"]',
    '[class*="code-block"]',
    '[class*="CodeBlock"]',
    '[class*="codeBlock"]',
    "code",
    "pre",

    // Designer のユーザー定義名（Webflow のクラス名はハッシュ化されているため data 属性で判定）
    '[data-automation-id="left-sidebar-pages-list"] [data-automation-id="list-cell"]',
    '[data-automation-id="cms-collections-list"] [data-sc*="RowItemTitle"]',
    '[data-automation-id="collection-row"]',
    '[data-automation-id="default-collection-row"]',
    '[data-automation-id*="style-rule-token"]',
    '[data-automation-id^="selected-node-title"]',
    '[data-automation-id="outline-selected-node"]',

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

  // ダッシュボードのサイトカード・フォルダ（先頭のテキストがユーザーの付けた名前）
  const NAMED_ITEM_SELECTOR =
    '[data-automation-id$="-site-item"], [data-automation-id="folder-item"]';

  // セレクタを結合して closest() で一度にマッチできるようにする
  const SKIP_SELECTOR_COMBINED = SKIP_SELECTORS.join(",");

  // 属性翻訳用: 入力欄そのものは除外しない（placeholder を訳すため）
  const ATTR_SKIP_SELECTOR_COMBINED = SKIP_SELECTORS.filter(
    (sel) => sel !== "input" && sel !== "textarea"
  ).join(",");

  // 単位語 → 日本語の対応（「○○前」系の動的文字列で使用）
  const AGO_UNITS = {
    second: "秒", minute: "分", hour: "時間", day: "日",
    week: "週間", month: "か月", year: "年",
  };

  /**
   * 動的文字列（数値や時間を含む文言）を翻訳するためのパターン定義。
   * テキストノード／属性値の「全体」が re に一致した場合のみ適用する（部分一致はしない）。
   * to には置換文字列（$1, $2 を利用可）か、マッチ配列を受け取り文字列を返す関数を指定する。
   */
  const TRANSLATION_PATTERNS = [
    { id: "n-items", re: /^(\d[\d,]*)\s+items?$/i, to: "$1個のアイテム" },
    { id: "n-results", re: /^(\d[\d,]*)\s+results?$/i, to: "$1件の結果" },
    { id: "n-selected", re: /^(\d[\d,]*)\s+selected$/i, to: "$1件を選択中" },
    { id: "n-collections", re: /^(\d[\d,]*)\s+collections?$/i, to: "$1個のコレクション" },
    { id: "n-fields", re: /^(\d[\d,]*)\s+fields?$/i, to: "$1個のフィールド" },
    { id: "n-pages", re: /^(\d[\d,]*)\s+pages?$/i, to: "$1ページ" },
    { id: "page-x-of-y", re: /^Page\s+(\d+)\s+of\s+(\d+)$/i, to: "$2ページ中$1ページ目" },
    { id: "step-x-of-y", re: /^Step\s+(\d+)\s+of\s+(\d+)$/i, to: "ステップ$1 / $2" },
    {
      id: "n-ago",
      re: /^(\d+)\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/i,
      to: (m) => `${m[1]}${AGO_UNITS[m[2].toLowerCase().replace(/s$/, "")]}前`,
    },
    {
      id: "a-ago",
      re: /^an?\s+(second|minute|hour|day|week|month|year)\s+ago$/i,
      to: (m) => `1${AGO_UNITS[m[1].toLowerCase()]}前`,
    },
  ];

  return {
    PHRASE_CONTAINER_TAGS,
    ADMIN_PATH_PREFIXES,
    ADMIN_SUBDOMAIN_SUFFIXES,
    TRANSLATABLE_ATTRIBUTES,
    MAX_PHRASE_LENGTH,
    UNTRANSLATED_PREFIX,
    SKIP_SELECTORS,
    SKIP_SELECTOR_COMBINED,
    ATTR_SKIP_SELECTOR_COMBINED,
    NAMED_ITEM_SELECTOR,
    AGO_UNITS,
    TRANSLATION_PATTERNS,
  };
});
