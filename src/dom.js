// src/dom.js
// DOMの走査・テキストノード/属性の翻訳・MutationObserver による動的対応を担うモジュール。
// 翻訳器（translator）とコールバックを受け取り、DOM処理に必要なキャッシュをクロージャに閉じ込める。
// ブラウザ専用（document に依存）。globalThis.WFJA.dom として公開する。

(function (root) {
  root.WFJA = root.WFJA || {};
  const C = root.WFJA.constants;

  /**
   * DOM翻訳器を生成する。
   * @param {object} deps
   * @param {{ translate: function }} deps.translator - createTranslator の戻り値
   * @param {(termCounts: object) => void} [deps.onTranslate] - 翻訳成功時に用語統計を記録
   * @param {(text: string) => void} [deps.onUntranslated] - 未翻訳の英語候補を記録（デバッグ用）
   * @param {() => boolean} [deps.isDebug] - デバッグモードか
   */
  function createDomTranslator(deps) {
    const translator = deps.translator;
    const onTranslate = deps.onTranslate || function () {};
    const onUntranslated = deps.onUntranslated || function () {};
    const isDebug = deps.isDebug || (() => false);

    const isJa = root.WFJA.translator.isAlreadyTranslated;
    const containsEn = root.WFJA.translator.containsEnglishText;

    // 各種キャッシュ（reset() で作り直す）
    let processedNodes = new WeakSet();
    let nodeLastValueMap = new WeakMap();
    let attrLastValueMap = new WeakMap(); // Element -> { [attr]: lastValue }

    // ---- 除外判定 ----------------------------------------------------------

    function matchesSkipSelector(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      try {
        return Boolean(el.closest(C.SKIP_SELECTOR_COMBINED));
      } catch {
        return false;
      }
    }

    function shouldSkipTextNode(node) {
      const parent = node.parentElement;
      if (!parent) return false;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
      return matchesSkipSelector(parent);
    }

    // ---- テキストノード翻訳 -------------------------------------------------

    // 親要素のtextContent全体で翻訳を試行（分割テキストノード対応）
    function tryTranslateAsParentPhrase(textNode) {
      const parent = textNode.parentElement;
      if (!parent) return false;
      if (!C.PHRASE_CONTAINER_TAGS.has(parent.tagName)) return false;
      if (parent.childElementCount > 0) return false;
      if (processedNodes.has(parent)) return false;

      const fullText = parent.textContent;
      if (!fullText) return false;

      const trimmed = fullText.trim();
      if (!trimmed || trimmed.length > C.MAX_PHRASE_LENGTH) return false;

      if (isJa(trimmed)) {
        processedNodes.add(parent);
        return false;
      }

      const translated = translator.translate(trimmed, {
        skipIfJapanese: true,
        caseInsensitive: false,
      });

      if (translated) {
        const leading = fullText.match(/^\s*/)[0];
        const trailing = fullText.match(/\s*$/)[0];
        parent.textContent = leading + translated.text.trim() + trailing;
        onTranslate(translated.termCounts);
        processedNodes.add(parent);
        return true;
      }
      return false;
    }

    function translateTextNode(node) {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      if (processedNodes.has(node)) {
        // nodeValue が変わっていたら再処理する
        const last = nodeLastValueMap.get(node);
        if (last === node.nodeValue) return;
      }
      if (shouldSkipTextNode(node)) return;

      // 親要素フレーズ翻訳を先に試行（分割テキストノード対応）
      if (tryTranslateAsParentPhrase(node)) return;

      const originalText = node.nodeValue;
      if (!originalText || originalText.trim().length === 0) return;

      const translated = translator.translate(originalText, {
        skipIfJapanese: true,
        caseInsensitive: false,
      });

      if (translated) {
        node.nodeValue = translated.text;
        onTranslate(translated.termCounts);
      } else if (isDebug() && containsEn(originalText)) {
        onUntranslated(originalText);
      }

      processedNodes.add(node);
      nodeLastValueMap.set(node, node.nodeValue);
    }

    // ---- 属性翻訳（ツールチップ・プレースホルダ等） --------------------------

    function translateElementAttributes(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
      if (matchesSkipSelector(el)) return;

      let lastValues = attrLastValueMap.get(el);
      for (const attr of C.TRANSLATABLE_ATTRIBUTES) {
        if (!el.hasAttribute(attr)) continue;
        const value = el.getAttribute(attr);
        if (!value || !value.trim()) continue;

        // 既に翻訳済みの値（前回設定値と一致）はスキップ
        if (lastValues && lastValues[attr] === value) continue;
        if (isJa(value)) continue;

        const translated = translator.translate(value, {
          skipIfJapanese: true,
          caseInsensitive: false,
        });
        if (translated) {
          el.setAttribute(attr, translated.text);
          onTranslate(translated.termCounts);
          if (!lastValues) {
            lastValues = {};
            attrLastValueMap.set(el, lastValues);
          }
          lastValues[attr] = translated.text;
        } else if (isDebug() && containsEn(value)) {
          onUntranslated(value);
        }
      }
    }

    // ---- ツリー走査 ---------------------------------------------------------

    function translateTree(rootEl) {
      if (!rootEl) return;

      // 先にノードを収集してから処理する。
      // （フレーズ翻訳が textContent を書き換えると走査中のTreeWalkerが壊れるため、
      //   走査と変更を分離して取りこぼしを防ぐ）
      const textNodes = [];
      const textWalker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
      let t;
      while ((t = textWalker.nextNode())) textNodes.push(t);

      const elements = [];
      if (rootEl.nodeType === Node.ELEMENT_NODE) elements.push(rootEl);
      const elWalker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, null, false);
      let e;
      while ((e = elWalker.nextNode())) elements.push(e);

      for (const node of textNodes) translateTextNode(node);
      for (const el of elements) translateElementAttributes(el);
    }

    // ---- MutationObserver ---------------------------------------------------

    let observer = null;

    function observe(target) {
      observer = new MutationObserver((mutations) => {
        const textNodes = new Set();
        const elements = new Set();

        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            if (mutation.target?.nodeType === Node.TEXT_NODE) textNodes.add(mutation.target);
            continue;
          }
          if (mutation.type === "attributes") {
            if (mutation.target?.nodeType === Node.ELEMENT_NODE) elements.add(mutation.target);
            continue;
          }
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              textNodes.add(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              elements.add(node);
              const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
              let n;
              while ((n = w.nextNode())) textNodes.add(n);
              const ew = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null, false);
              let en;
              while ((en = ew.nextNode())) elements.add(en);
            }
          }
        }

        for (const node of textNodes) translateTextNode(node);
        for (const el of elements) translateElementAttributes(el);
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: C.TRANSLATABLE_ATTRIBUTES,
      });
    }

    function disconnect() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    function reset() {
      processedNodes = new WeakSet();
      nodeLastValueMap = new WeakMap();
      attrLastValueMap = new WeakMap();
    }

    return {
      translateTree,
      translateTextNode,
      translateElementAttributes,
      observe,
      disconnect,
      reset,
    };
  }

  root.WFJA.dom = { createDomTranslator };
})(typeof globalThis !== "undefined" ? globalThis : this);
