// Apply the saved palette and demand-load language font sheets before the first paint.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderTheme = api;
  if (root.document) api.start(root.document, root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const key = "afkReader.theme";
  const normalize = value => ["dark", "light", "system"].includes(value) ? value : "dark";
  const LANG_PICKER_GLYPHS = /[日本語한국어中文]/g;
  const HANGUL_RE = /[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/;
  const KANA_RE = /[\u3040-\u30FF\u31F0-\u31FF]/;
  const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  const contexts = new WeakMap();
  let lastContext = null;

  function normalizeFontLang(value) {
    const code = String(value || "").trim().toLowerCase();
    if (code === "cn" || code === "zh" || code.startsWith("zh-")) return "cn";
    if (code === "jp" || code === "ja" || code.startsWith("ja-")) return "jp";
    if (code === "kr" || code === "ko" || code.startsWith("ko-")) return "kr";
    return null;
  }

  function stateFor(doc, environment) {
    if (!doc) return lastContext;
    let state = contexts.get(doc);
    if (!state) {
      state = { doc, environment: environment || globalThis, loaded: new Set(), observers: [] };
      contexts.set(doc, state);
    } else if (environment) {
      state.environment = environment;
    }
    lastContext = state;
    return state;
  }

  function findFontLink(doc) {
    return doc?.querySelector?.('link[rel="stylesheet"][href*="reader_fonts.css"]') || null;
  }

  function fontHref(doc, environment, lang) {
    const code = normalizeFontLang(lang);
    if (!code || !doc) return null;
    const baseLink = findFontLink(doc);
    const attr = baseLink?.getAttribute?.(`data-fonts-${code}`);
    if (attr) return attr;
    try {
      const parent = environment?.parent;
      if (parent && parent !== environment && parent.document) {
        const parentLink = findFontLink(parent.document);
        const parentAttr = parentLink?.getAttribute?.(`data-fonts-${code}`);
        if (parentAttr) {
          const URLCtor = environment.URL || URL;
          return new URLCtor(parentAttr, parent.document.baseURI).href;
        }
      }
    } catch (_) { /* Cross-origin parent frames fall back to sibling stylesheet URLs. */ }
    const rawHref = baseLink?.getAttribute?.("href") || baseLink?.href || "";
    if (/reader_fonts\.css(?:[?#]|$)/.test(rawHref)) {
      return rawHref.replace(/reader_fonts\.css(?:\?[^#]*)?/, `reader_fonts_${code}.css`);
    }
    return null;
  }

  function ensureFont(lang, doc = lastContext?.doc, environment = lastContext?.environment) {
    const code = normalizeFontLang(lang);
    if (!code || !doc) return false;
    const state = stateFor(doc, environment);
    if (state.loaded.has(code)) return false;
    if (doc.querySelector?.(`link[data-tea-font-lang="${code}"]`)) {
      state.loaded.add(code);
      return false;
    }
    const href = fontHref(doc, state.environment, code);
    if (!href || typeof doc.createElement !== "function") return false;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    if (typeof link.setAttribute === "function") link.setAttribute("data-tea-font-lang", code);
    else link.dataset = { ...(link.dataset || {}), teaFontLang: code };
    const baseLink = findFontLink(doc);
    if (baseLink?.parentNode && typeof baseLink.parentNode.insertBefore === "function") {
      baseLink.parentNode.insertBefore(link, baseLink.nextSibling || null);
    } else if (doc.head && typeof doc.head.append === "function") {
      doc.head.append(link);
    } else {
      return false;
    }
    state.loaded.add(code);
    if (state.loaded.size >= 3) {
      for (const observer of state.observers.splice(0)) observer.disconnect?.();
    }
    return true;
  }

  function initialLanguage(doc, environment) {
    const loc = environment?.location;
    const SearchParams = environment?.URLSearchParams || URLSearchParams;
    if (loc?.hash) {
      const query = String(loc.hash).split("?")[1] || "";
      const requested = new SearchParams(query).get("lang");
      if (/^en(?:-|$)/i.test(requested || "")) return "en";
      const lang = normalizeFontLang(requested);
      if (lang) return lang;
    }
    if (loc?.search) {
      const requested = new SearchParams(loc.search).get("lang");
      if (/^en(?:-|$)/i.test(requested || "")) return "en";
      const lang = normalizeFontLang(requested);
      if (lang) return lang;
    }
    const docLang = normalizeFontLang(doc?.documentElement?.lang);
    if (docLang) return docLang;
    try {
      return normalizeFontLang(environment?.localStorage?.getItem("afkReader.language"));
    } catch (_) {
      return null;
    }
  }

  function syncFonts(doc = lastContext?.doc, environment = lastContext?.environment) {
    const lang = initialLanguage(doc, environment);
    if (lang) return ensureFont(lang, doc, environment);
    return false;
  }

  function ensureFontsForText(text, doc = lastContext?.doc, environment = lastContext?.environment) {
    if (!text) return false;
    const cleaned = String(text).replace(LANG_PICKER_GLYPHS, "");
    if (!cleaned) return false;
    let added = false;
    if (HANGUL_RE.test(cleaned)) added = ensureFont("kr", doc, environment) || added;
    if (KANA_RE.test(cleaned)) added = ensureFont("jp", doc, environment) || added;
    if (HAN_RE.test(cleaned)) {
      const docLang = normalizeFontLang(doc?.documentElement?.lang);
      // The Korean face covers Hangul. Preserve its JP -> CN font-stack fallback
      // for Hanja and untranslated Chinese, without fetching either for Hangul alone.
      if (docLang === "kr") {
        added = ensureFont("jp", doc, environment) || added;
        added = ensureFont("cn", doc, environment) || added;
      } else {
        added = ensureFont(docLang === "jp" ? "jp" : "cn", doc, environment) || added;
      }
    }
    return added;
  }

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return true;
    return el.id === "language-select" || Boolean(el.closest?.("#language-select"));
  }

  function scanNode(node, doc, environment) {
    if (!node) return;
    if (node.nodeType === 3) {
      if (!shouldSkipElement(node.parentElement)) ensureFontsForText(node.nodeValue, doc, environment);
      return;
    }
    if (node.nodeType !== 1 || shouldSkipElement(node)) return;
    if (typeof doc.createTreeWalker === "function" && typeof NodeFilter !== "undefined") {
      const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (!shouldSkipElement(textNode.parentElement)) ensureFontsForText(textNode.nodeValue, doc, environment);
      }
      return;
    }
    for (const child of node.childNodes || []) scanNode(child, doc, environment);
  }

  function start(doc, environment) {
    const state = stateFor(doc, environment);
    let preference = "dark";
    try { preference = normalize(environment.localStorage.getItem(key)); } catch (_) { /* Storage is optional. */ }
    const system = environment.matchMedia?.("(prefers-color-scheme: light)");
    let select;
    function apply() {
      doc.documentElement.dataset.theme = preference === "system"
        ? (system?.matches ? "light" : "dark") : preference;
      if (select) select.value = preference;
    }
    function change(value, persist = true) {
      preference = normalize(value);
      if (persist) {
        try { environment.localStorage.setItem(key, preference); } catch (_) { /* Keep the session setting. */ }
      }
      apply();
    }
    apply();
    system?.addEventListener("change", apply);
    environment.addEventListener("storage", event => {
      if (event.key === key || event.key === null) change(event.newValue, false);
    });
    function bind() {
      select = doc.getElementById("theme-select");
      if (select) {
        select.value = preference;
        select.addEventListener("change", () => change(select.value));
      }
      syncFonts(doc, environment);
      if (doc.body) scanNode(doc.body, doc, environment);
      const Observer = environment?.MutationObserver;
      if (typeof Observer === "function" && state.loaded.size < 3) {
        const attrObserver = new Observer(() => {
          ensureFont(doc.documentElement.lang, doc, environment);
        });
        attrObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
        state.observers.push(attrObserver);
        if (doc.body) {
          const bodyObserver = new Observer(mutations => {
            for (const mutation of mutations) {
              if (mutation.type === "characterData") {
                if (!shouldSkipElement(mutation.target?.parentElement)) {
                  ensureFontsForText(mutation.target?.nodeValue, doc, environment);
                }
              } else {
                for (const added of mutation.addedNodes || []) scanNode(added, doc, environment);
              }
              if (state.loaded.size >= 3) break;
            }
          });
          bodyObserver.observe(doc.body, { childList: true, subtree: true, characterData: true });
          state.observers.push(bodyObserver);
        }
      }
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind, {once:true});
    else bind();
    return {change};
  }
  return {start, normalizeFontLang, fontHref, ensureFont, syncFonts, ensureFontsForText};
});
