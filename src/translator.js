// src/translator.js
// 翻訳エンジン本体。辞書による「完全一致翻訳」と、正規表現による「動的パターン翻訳」を提供する。
// ブラウザでは globalThis.WFJA.translator、Node では module.exports として公開する。

(function (root, factory) {
  const api = factory();
  root.WFJA = root.WFJA || {};
  root.WFJA.translator = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ひらがな・カタカナ・漢字の判定用
  const JAPANESE_RE = /[぀-ゟ゠-ヿ一-鿿]/;

  /**
   * 日本語（ひらがな/カタカナ/漢字）を含むか＝翻訳済みとみなすか。
   * @param {string} text
   * @returns {boolean}
   */
  function isAlreadyTranslated(text) {
    return JAPANESE_RE.test(text);
  }

  /**
   * 翻訳候補になりうる英語テキストか（未翻訳候補の収集用）。
   * 3文字以上の英単語を含み、かつ日本語を含まないもの。
   * @param {string} text
   * @returns {boolean}
   */
  function containsEnglishText(text) {
    return /\b[A-Za-z]{3,}\b/.test(text) && !isAlreadyTranslated(text);
  }

  /**
   * 正規表現のメタ文字をエスケープする。
   * @param {string} str
   * @returns {string}
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 辞書を「長いキー優先」のペア配列に変換する（完全一致のため順序は本質的ではないが、
   * デバッグや将来の部分一致拡張に備えて長さ降順で安定化しておく）。
   * @param {Object<string, string>} dict
   * @returns {Array<[string, string]>}
   */
  function optimizeTranslationPairs(dict) {
    return Object.entries(dict || {}).sort((a, b) => b[0].length - a[0].length);
  }

  /**
   * 元テキストの前後の空白を取り出す。
   * @param {string} text
   * @returns {{ leading: string, trailing: string }}
   */
  function splitSurroundingSpace(text) {
    return {
      leading: text.match(/^\s*/)[0],
      trailing: text.match(/\s*$/)[0],
    };
  }

  /**
   * 完全一致による翻訳。テキスト全体（trim後）が辞書キーと一致した場合のみ翻訳する。
   * 例: "Publish" は翻訳されるが、"Publish changes" の中の "Publish" は翻訳されない。
   * @param {string} inputText
   * @param {Array<[string, string]>} pairs - optimizeTranslationPairs の結果
   * @param {{ skipIfJapanese?: boolean, caseInsensitive?: boolean }} [opts]
   * @returns {{ text: string, termCounts: Record<string, number> } | null}
   */
  function translateExact(inputText, pairs, opts = {}) {
    const { skipIfJapanese = true, caseInsensitive = false } = opts;
    if (!inputText) return null;
    if (skipIfJapanese && isAlreadyTranslated(inputText)) return null;

    const trimmed = inputText.trim();
    if (!trimmed) return null;

    const target = caseInsensitive ? trimmed.toLowerCase() : trimmed;
    for (const [en, ja] of pairs) {
      if (!en) continue;
      const key = caseInsensitive ? en.toLowerCase() : en;
      if (target === key) {
        const { leading, trailing } = splitSurroundingSpace(inputText);
        return { text: leading + ja + trailing, termCounts: { [en]: 1 } };
      }
    }
    return null;
  }

  /**
   * 動的パターンによる翻訳。テキスト全体（trim後）がパターンに一致した場合のみ翻訳する。
   * @param {string} inputText
   * @param {Array<{id: string, re: RegExp, to: (string | function)}>} patterns
   * @param {{ skipIfJapanese?: boolean }} [opts]
   * @returns {{ text: string, termCounts: Record<string, number> } | null}
   */
  function translatePattern(inputText, patterns, opts = {}) {
    const { skipIfJapanese = true } = opts;
    if (!inputText || !patterns || patterns.length === 0) return null;
    if (skipIfJapanese && isAlreadyTranslated(inputText)) return null;

    const trimmed = inputText.trim();
    if (!trimmed) return null;

    for (const pat of patterns) {
      const m = trimmed.match(pat.re);
      if (!m) continue;
      const replaced =
        typeof pat.to === "function" ? pat.to(m) : trimmed.replace(pat.re, pat.to);
      if (replaced == null || replaced === trimmed) continue;
      const { leading, trailing } = splitSurroundingSpace(inputText);
      return {
        text: leading + replaced + trailing,
        termCounts: { [`__pattern__:${pat.id}`]: 1 },
      };
    }
    return null;
  }

  /**
   * 辞書とパターンを保持し、完全一致→パターンの順で翻訳する翻訳器を生成する。
   * @param {Object<string, string>} dict
   * @param {{ patterns?: Array }} [options]
   * @returns {{
   *   dict: Object<string,string>,
   *   pairs: Array<[string,string]>,
   *   patterns: Array,
   *   translate: (text: string, opts?: object) => ({text: string, termCounts: object} | null)
   * }}
   */
  function createTranslator(dict, options = {}) {
    const pairs = optimizeTranslationPairs(dict);
    const patterns = options.patterns || [];

    function translate(inputText, opts = {}) {
      const exact = translateExact(inputText, pairs, opts);
      if (exact) return exact;
      return translatePattern(inputText, patterns, opts);
    }

    return { dict, pairs, patterns, translate };
  }

  /**
   * 後方互換のための関数（完全一致のみ）。
   * @deprecated createTranslator().translate を推奨。
   */
  function translateTextWithStats(inputText, pairs, opts = {}) {
    return translateExact(inputText, pairs, opts);
  }

  return {
    isAlreadyTranslated,
    containsEnglishText,
    escapeRegex,
    optimizeTranslationPairs,
    translateExact,
    translatePattern,
    createTranslator,
    // 後方互換
    translateTextWithStats,
  };
});
