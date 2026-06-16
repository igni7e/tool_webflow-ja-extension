// src/content.js
// コンテンツスクリプトのエントリポイント。設定・統計の永続化、URL判定、初期化と
// SPA遷移への追従を担う。DOM翻訳の実処理は WFJA.dom に委譲する。

(function () {
  "use strict";

  const WFJA = globalThis.WFJA;
  const C = WFJA.constants;

  // ---- 状態 ----------------------------------------------------------------
  let enabled = true; // 翻訳ON/OFF（ポップアップから切り替え）
  let debugMode = false;

  // 翻訳統計（用語単位）: { en: { ja, count } }
  let termStats = {};
  let pendingStatsFlush = null;

  let domTranslator = null;
  let currentDict = {}; // 統計に日本語訳を併記するために保持

  // ---- URL判定 --------------------------------------------------------------
  function isWebflowAdminUI() {
    const hostname = location.hostname;
    const pathname = location.pathname;

    if (!hostname.endsWith("webflow.com")) return false;
    if (hostname.endsWith("webflow.io")) return false; // 公開サイトは対象外
    if (hostname === "preview.webflow.com") return true;
    if (C.ADMIN_SUBDOMAIN_SUFFIXES.some((s) => hostname.endsWith(s))) return true;
    return C.ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  }

  // ---- 設定・統計の読み書き --------------------------------------------------
  async function loadSettings() {
    try {
      const res = await chrome.storage.sync.get(["debugMode", "enabled"]);
      debugMode = Boolean(res.debugMode);
      enabled = res.enabled !== false; // 既定はON
    } catch {
      debugMode = false;
      enabled = true;
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

  function recordTermStats(termCounts) {
    for (const [en, c] of Object.entries(termCounts)) {
      if (!c) continue;
      // ja は辞書から解決（パターン翻訳の __pattern__: キーは辞書に無いので undefined）
      const dictJa = currentDict[en];
      const cur = termStats[en] ?? { ja: dictJa, count: 0 };
      cur.ja = dictJa ?? cur.ja;
      cur.count += c;
      termStats[en] = cur;
    }
    scheduleStatsFlush();
  }

  function recordUntranslated(text) {
    const key = `${C.UNTRANSLATED_PREFIX}${text.slice(0, 120)}`;
    termStats[key] = termStats[key] ?? { ja: "", count: 0 };
    termStats[key].count += 1;
    scheduleStatsFlush();
  }

  // ---- CSV読み込み → 翻訳器構築 ---------------------------------------------
  async function buildTranslator() {
    const url = chrome.runtime.getURL("translation_terms.csv");
    const res = await fetch(url);
    const csvText = await res.text();
    const dict = WFJA.csv.parseTranslationCSV(csvText);
    currentDict = dict; // 統計表示用に辞書を保持
    return WFJA.translator.createTranslator(dict, {
      patterns: C.TRANSLATION_PATTERNS,
    });
  }

  // ---- SPA遷移フック --------------------------------------------------------
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

  // 設定変更（特に enabled）に追従：ON/OFFが切り替わったらリロードして反映
  function watchSettingChanges() {
    if (!chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      // ON/OFF切替時は、翻訳対象の管理画面のみリロードして反映する
      if (
        changes.enabled &&
        changes.enabled.newValue !== changes.enabled.oldValue &&
        isWebflowAdminUI()
      ) {
        location.reload();
      }
      if (changes.debugMode) {
        debugMode = Boolean(changes.debugMode.newValue);
      }
    });
  }

  // ---- 初期化 ---------------------------------------------------------------
  async function init() {
    await loadSettings();
    watchSettingChanges();

    if (!enabled) return; // 翻訳OFF時は何もしない
    if (!isWebflowAdminUI()) return; // 管理画面以外では動かさない

    await loadExistingStats();
    const translator = await buildTranslator();

    domTranslator = WFJA.dom.createDomTranslator({
      translator,
      onTranslate: recordTermStats,
      onUntranslated: recordUntranslated,
      isDebug: () => debugMode,
    });

    domTranslator.translateTree(document.body);
    domTranslator.observe(document.body);

    // SPA遷移でも継続
    let lastHref = location.href;
    hookSpaNavigation(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      if (!isWebflowAdminUI()) return;
      domTranslator.reset();
      setTimeout(() => domTranslator.translateTree(document.body), 300);
    });
  }

  init();
})();
