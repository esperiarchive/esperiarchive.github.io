(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StoryTranslation = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const unresolved = new Set(["ambiguous_source_text", "hash_not_found", "target_text_empty",
    "truncated_preview", "overlay_row_not_found", "missing_overlay_text"]);
  const targets = {en: "en", jp: "ja", kr: "ko"};

  function hasOfficial(entry, localized, language) {
    return Boolean(localized?.text) && (language === "cn" ||
      !unresolved.has(localized.status || "") && localized.status !== "english_reference_fallback" &&
      (localized.text !== entry?.source_cn || /^matched(?:_|$)/.test(localized.status || "")));
  }

  function createClient({endpoint = "", fetchImpl = globalThis.fetch, timeoutMs = 8000} = {}) {
    const cache = new Map();
    const pending = new Map();

    async function request(texts, target) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {method: "POST", signal: controller.signal,
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({target, texts})});
        if (!response.ok) throw new Error("Translation unavailable");
        const result = await ReaderPublication.readJson(response);
        if (result.translations?.length !== texts.length ||
          result.translations.some(text => typeof text !== "string" || !text.trim())) {
          throw new Error("Incomplete translation");
        }
        return result.translations;
      } finally { clearTimeout(timer); }
    }

    async function fill(context, language) {
      if (!endpoint || !targets[language]) return context.machineLocale;
      const rows = Object.entries(context.graph.text_entries || {}).map(([key, entry]) => ({key,
        text: context.cnLocale?.texts?.[key]?.text || context.officialLocale?.texts?.[key]?.source_cn || entry.source_cn,
        official: hasOfficial(entry, context.officialLocale?.texts?.[key], language),
        saved: context.machineLocale?.texts?.[key]?.text,
      })).filter(row => !row.official && !row.saved && row.text?.trim() && row.text.length <= 4000);
      const target = targets[language];
      const unique = [...new Set(rows.map(row => row.text))];
      const fresh = unique.filter(text => !cache.has(target + ":" + text) && !pending.has(target + ":" + text));
      // Deduplicate concurrent quest parts before sending small, bounded batches.
      const deferred = new Map(fresh.map(text => {
        let settle;
        pending.set(target + ":" + text, new Promise(resolve => { settle = resolve; }));
        return [text, settle];
      }));
      const batches = [];
      for (const text of fresh) {
        const batch = batches.at(-1);
        if (!batch || batch.length >= 24 || batch.reduce((n, value) => n + value.length, 0) + text.length > 4000)
          batches.push([text]);
        else batch.push(text);
      }
      for (const batch of batches) {
        let values;
        try { values = await request(batch, target); } catch { values = []; }
        batch.forEach((text, index) => {
          const key = target + ":" + text;
          const value = values[index] || "";
          if (value) cache.set(key, value);
          deferred.get(text)(value);
          pending.delete(key);
        });
      }
      const texts = {...context.machineLocale?.texts};
      await Promise.all(rows.map(async row => {
        const key = target + ":" + row.text;
        const text = cache.get(key) || await pending.get(key);
        if (text) texts[row.key] = {text, source_cn: row.text, status: "machine_translation", provider: "Google"};
      }));
      while (cache.size > 2000) cache.delete(cache.keys().next().value);
      return Object.keys(texts).length ? {...context.machineLocale, lang: language, texts} : context.machineLocale;
    }

    return {enabled: Boolean(endpoint), fill};
  }

  return {hasOfficial, createClient};
});
