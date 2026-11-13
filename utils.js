// utils.js
// 共通ユーティリティ（CSVパース・翻訳エンジン）。content.js / options.js / テストから使う。

/**
 * CSVテキストをパースし、英語→日本語の辞書オブジェクトを返す
 * 同じキーが複数ある場合は先に出たものを優先する
 * @param {string} csvText
 * @returns {Record<string, string>}
 */
function parseTranslationCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const dict = {};
  // 1行目はヘッダー
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = parseCSVRow(row);
    if (!cols || cols.length !== 2) continue;
    const en = (cols[0] ?? "").trim();
    const ja = (cols[1] ?? "").trim();
    if (!en || !ja) continue;
    if (!(en in dict)) dict[en] = ja;
  }
  return dict;
}

/**
 * 最小CSVパーサ（ダブルクォートで囲まれたカンマと "" エスケープに対応）
 */
function parseCSVRow(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAlreadyTranslated(text) {
  // ひらがな/カタカナ/漢字が含まれるなら翻訳済み扱い
  return /[぀-ゟ゠-ヿ一-鿿]/.test(text);
}

function containsEnglishText(text) {
  return /\b[A-Za-z]{3,}\b/.test(text) && !isAlreadyTranslated(text);
}

/** 連続空白・ノーブレークスペース・細いスペースを1つの半角スペースにまとめる */
function normalizeText(text) {
  return String(text)
    .replace(/[  -​  　]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// 末尾に付いていても本体だけで訳してよい記号（必須マーク・コロン・省略記号）
// キーボードショートカット表記 " (V)" " (⌘K)" も末尾記号として扱う
const TRAILING_SUFFIX_RE = /(\s*(?:\.\.\.|…|:|\s\*|\*|\s\([A-Z0-9⌘⇧⌥⌃+]{1,6}\)))$/;

// 英字のみで短い語は大小文字を区別する（"ID" と "id" などの誤訳を避ける）
const MIN_CASE_FOLD_LENGTH = 4;

/**
 * 辞書から翻訳器を作る
 * - 完全一致（Map）→ 空白正規化 → 大小文字無視 → 末尾記号を外して再検索 → パターン の順で探す
 * - パターンは CSV のキーに {n}（数値）・{x}（訳せる語句か日時）・{s}（任意の文字列）を含めたもの
 *   例: "{n} items" → "{n}件のアイテム"
 * @param {Record<string, string>} dict
 */
function createTranslator(dict) {
  const exact = new Map();
  const normalized = new Map();
  const folded = new Map();
  const patterns = [];

  for (const [en, ja] of Object.entries(dict)) {
    if (/\{[a-z][a-z0-9]*\}/i.test(en)) {
      const p = compilePattern(en, ja);
      if (p) patterns.push(p);
      continue;
    }
    exact.set(en, { en, ja });
    const n = normalizeText(en);
    if (!normalized.has(n)) normalized.set(n, { en, ja });
    const f = n.toLowerCase();
    if (!folded.has(f)) folded.set(f, { en, ja });
  }
  // 具体的な（長い）パターンを先に試す
  patterns.sort((a, b) => b.literalLength - a.literalLength);

  function lookupCore(text, depth = 0) {
    const hit = exact.get(text) || normalized.get(text);
    if (hit) return hit;
    if (text.length >= MIN_CASE_FOLD_LENGTH) {
      const f = folded.get(text.toLowerCase());
      if (f) return f;
    }
    for (const p of patterns) {
      const m = p.re.exec(text);
      if (!m) continue;
      let ja = p.ja;
      let ok = true;
      p.names.forEach((name, i) => {
        let value = m[i + 1];
        if (name === "x") {
          // {x}: 辞書で訳せる語句か、日付・時刻など数字を含む値だけ受け付ける
          // 例: "Edited 20 minutes ago" → "20分前に編集"
          const inner = depth < 2 ? lookupCore(value, depth + 1) : null;
          if (inner) value = inner.ja;
          else if (!/\d/.test(value)) ok = false;
        }
        ja = ja.split(`{${name}}`).join(value);
      });
      if (!ok) continue;
      return { en: p.en, ja };
    }
    return null;
  }

  /**
   * @param {string} text - 前後の空白を含む元テキスト
   * @returns {{ text: string, en: string } | null}
   */
  function translate(text) {
    if (!text) return null;
    const core = normalizeText(text);
    if (!core || !/[A-Za-z]/.test(core)) return null;

    let hit = lookupCore(core);
    let suffix = "";
    if (!hit) {
      const m = TRAILING_SUFFIX_RE.exec(core);
      if (m) {
        const body = core.slice(0, -m[1].length).trim();
        if (body) {
          hit = lookupCore(body);
          const raw = m[1].trim();
          suffix = raw === "..." ? "…" : raw;
          if (raw === "*" || raw.startsWith("(")) suffix = " " + raw;
        }
      }
    }
    if (!hit) return null;

    const leading = text.match(/^\s*/)[0];
    const trailing = text.match(/\s*$/)[0];
    return { text: leading + hit.ja + suffix + trailing, en: hit.en };
  }

  return {
    translate,
    size: exact.size + patterns.length,
    patternCount: patterns.length,
  };
}

// プレースホルダーの種類
// {n} {n2} …: 数値（1,234 / 2.5 / 2K / 10M も可）
// {x}: 辞書で訳せる語句、または数字を含む値（日付・時刻・金額）
// {s}: 任意の文字列（サイト名・プラン名など、訳さずそのまま埋め込む）
function isNumericName(name) {
  return /^n\d*$/.test(name);
}

function compilePattern(en, ja) {
  const names = [];
  let literalLength = 0;
  const parts = en.split(/(\{[a-z][a-z0-9]*\})/i);
  let src = "^";
  for (const part of parts) {
    const m = /^\{([a-z][a-z0-9]*)\}$/i.exec(part);
    if (m) {
      const name = m[1];
      names.push(name);
      src += isNumericName(name) ? "([\\d][\\d.,]*[KkMm]?\\+?)" : "(.+?)";
    } else if (part) {
      literalLength += part.length;
      src += escapeRegex(part).replace(/ +/g, "\\s+");
    }
  }
  src += "$";
  try {
    return { en, ja, names, literalLength, re: new RegExp(src) };
  } catch {
    return null;
  }
}

/**
 * 互換用: テキストを翻訳し、使ったキーと回数を返す
 * @param {string} inputText
 * @param {ReturnType<typeof createTranslator>} translator
 * @returns {{ text: string, termCounts: Record<string, number> } | null}
 */
function translateTextWithStats(inputText, translator, opts = {}) {
  const { skipIfJapanese = true } = opts;
  if (!inputText) return null;
  if (skipIfJapanese && isAlreadyTranslated(inputText)) return null;
  const r = translator.translate(inputText);
  if (!r) return null;
  return { text: r.text, termCounts: { [r.en]: 1 } };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseTranslationCSV,
    parseCSVRow,
    normalizeText,
    isAlreadyTranslated,
    containsEnglishText,
    createTranslator,
    translateTextWithStats,
  };
}
