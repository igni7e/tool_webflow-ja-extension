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
   * 連続空白・ノーブレークスペース・細いスペースを1つの半角スペースにまとめ、
   * 曲がった引用符をまっすぐな引用符にそろえる。
   * @param {string} text
   * @returns {string}
   */
  function normalizeText(text) {
    return String(text)
      .replace(/[  -​  　]/g, " ")
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 末尾に付いていても本体だけで訳してよい記号
  // （省略記号・コロン・必須マーク・ショートカット表記 " (V)" " (⌘K)"）
  const TRAILING_SUFFIX_RE = /(\s*(?:\.\.\.|…|:|\s\*|\*|\s\([A-Z0-9⌘⇧⌥⌃+]{1,6}\)))$/;

  // 英字のみの短い語は大小文字を区別する（"ID" と "id" などの誤訳を避ける）
  const MIN_CASE_FOLD_LENGTH = 4;

  // CSV キー内のプレースホルダー
  //   {n} {n2} …: 数値（1,234 / 2.5 / 2K / 10M / 11+ も可）
  //   {x}: 辞書・パターンで訳せる語句、または数字を含む値（日付・時刻・金額）
  //   {s}: 任意の文字列（サイト名・プラン名など、訳さずそのまま埋め込む）
  const PLACEHOLDER_RE = /\{[a-z][a-z0-9]*\}/i;

  function isNumericName(name) {
    return /^n\d*$/.test(name);
  }

  /**
   * "{n} instances" のような CSV キーを正規表現に変換する。
   * @returns {{ en: string, ja: string, names: string[], literalLength: number, re: RegExp } | null}
   */
  function compileCsvPattern(en, ja) {
    const names = [];
    let literalLength = 0;
    let src = "^";
    for (const part of en.split(/(\{[a-z][a-z0-9]*\})/i)) {
      const m = /^\{([a-z][a-z0-9]*)\}$/i.exec(part);
      if (m) {
        names.push(m[1]);
        src += isNumericName(m[1]) ? "(\\d[\\d.,]*[KkMm]?\\+?)" : "(.+?)";
      } else if (part) {
        literalLength += part.length;
        src += escapeRegex(part).replace(/ +/g, "\\s+");
      }
    }
    try {
      return { en, ja, names, literalLength, re: new RegExp(src + "$") };
    } catch {
      return null;
    }
  }

  /**
   * 辞書とパターンを保持し、翻訳器を生成する。探索順:
   *   1. 完全一致（Map） → 空白を正規化して一致 → 大小文字を無視して一致（4文字以上）
   *   2. CSV のプレースホルダー付きキー（{n}/{x}/{s}）
   *   3. options.patterns の正規表現パターン（constants.js の TRANSLATION_PATTERNS）
   *   4. 見つからなければ末尾の記号（: … * (V) など）を外して 1〜3 を再試行
   * @param {Object<string, string>} dict
   * @param {{ patterns?: Array }} [options]
   */
  function createTranslator(dict, options = {}) {
    const pairs = optimizeTranslationPairs(dict);
    const patterns = options.patterns || [];

    const exact = new Map();
    const normalized = new Map();
    const folded = new Map();
    const csvPatterns = [];

    for (const [en, ja] of Object.entries(dict || {})) {
      if (!en || !ja) continue;
      if (PLACEHOLDER_RE.test(en)) {
        const p = compileCsvPattern(en, ja);
        if (p) csvPatterns.push(p);
        continue;
      }
      exact.set(en, en);
      const n = normalizeText(en);
      if (!normalized.has(n)) normalized.set(n, en);
      const f = n.toLowerCase();
      if (!folded.has(f)) folded.set(f, en);
    }
    // 具体的な（固定部分が長い）パターンを先に試す
    csvPatterns.sort((a, b) => b.literalLength - a.literalLength);

    /** @returns {{ ja: string, key: string } | null} */
    function lookup(text, depth) {
      const key =
        exact.get(text) ||
        normalized.get(text) ||
        (text.length >= MIN_CASE_FOLD_LENGTH ? folded.get(text.toLowerCase()) : undefined);
      if (key) return { ja: dict[key], key };

      for (const p of csvPatterns) {
        const m = p.re.exec(text);
        if (!m) continue;
        let ja = p.ja;
        let ok = true;
        p.names.forEach((name, i) => {
          let value = m[i + 1];
          if (name === "x") {
            // 例: "Edited 20 minutes ago" → "20分前に編集"
            const inner = depth < 2 ? lookup(value, depth + 1) : null;
            if (inner) value = inner.ja;
            else if (!/\d/.test(value)) ok = false;
          }
          ja = ja.split(`{${name}}`).join(value);
        });
        if (ok) return { ja, key: p.en };
      }

      for (const pat of patterns) {
        const m = text.match(pat.re);
        if (!m) continue;
        const replaced = typeof pat.to === "function" ? pat.to(m) : text.replace(pat.re, pat.to);
        if (replaced == null || replaced === text) continue;
        return { ja: replaced, key: `__pattern__:${pat.id}` };
      }
      return null;
    }

    function translate(inputText, opts = {}) {
      const { skipIfJapanese = true } = opts;
      if (!inputText) return null;
      if (skipIfJapanese && isAlreadyTranslated(inputText)) return null;
      const core = normalizeText(inputText);
      if (!core || !/[A-Za-z]/.test(core)) return null;

      let hit = lookup(core, 0);
      let suffix = "";
      if (!hit) {
        const m = TRAILING_SUFFIX_RE.exec(core);
        const body = m ? core.slice(0, -m[1].length).trim() : "";
        if (body) {
          hit = lookup(body, 0);
          const raw = m[1].trim();
          suffix = raw === "..." ? "…" : raw;
          if (raw === "*" || raw.startsWith("(")) suffix = " " + raw;
        }
      }
      if (!hit) return null;

      const { leading, trailing } = splitSurroundingSpace(inputText);
      return { text: leading + hit.ja + suffix + trailing, termCounts: { [hit.key]: 1 } };
    }

    return { dict, pairs, patterns, translate, size: exact.size + csvPatterns.length };
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
    normalizeText,
    // 後方互換
    translateTextWithStats,
  };
});
