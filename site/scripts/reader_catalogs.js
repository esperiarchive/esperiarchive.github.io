/* Shared browser catalog contract; no story-state or translation mutations. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderCatalogs = api;
})(typeof globalThis === "object" ? globalThis : this, function() {
  "use strict";
  function create(load) {
    const pending = new Map();
    return function get(path) {
      if (!pending.has(path)) {
        pending.set(path, Promise.resolve().then(() => load(path)).catch(error => {
          pending.delete(path);
          throw error;
        }));
      }
      return pending.get(path);
    };
  }
  function merge(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== "object") target[key] = {};
        merge(target[key], value);
      } else target[key] = value;
    }
    return target;
  }
  function patch(target, values) {
    for (const [pointer, value] of values || []) {
      if (typeof pointer !== "string" || !pointer.startsWith("/")) throw new Error("Invalid entity patch");
      const parts = pointer.slice(1).split("/").map(key => key.replaceAll("~1", "/").replaceAll("~0", "~"));
      if (parts.some(key => ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Unsafe entity patch");
      let parent = target;
      for (const key of parts.slice(0, -1)) {
        if (!parent || typeof parent[key] !== "object" || parent[key] === null) throw new Error("Entity patch has no parent");
        parent = parent[key];
      }
      parent[parts.at(-1)] = value;
    }
    return target;
  }
  function entities(load) {
    const pending = new Map();
    return function entity(path, language, research = false) {
      const key = JSON.stringify([path, language, research]);
      if (!pending.has(key)) pending.set(key, (async () => {
        const payload = await load(path), descriptor = payload.browser_entity;
        if (!descriptor) return payload; // Existing research snapshots remain readable.
        if (descriptor.schema_version !== 1 || !descriptor.core || !descriptor.locales?.[language]) {
          throw new Error("Unsupported browser entity descriptor");
        }
        const [core, locale, extra] = await Promise.all([
          load(descriptor.core), load(descriptor.locales[language]),
          research && descriptor.research ? load(descriptor.research) : null,
        ]);
        if (locale.language !== language) throw new Error("Entity locale does not match request");
        const result = JSON.parse(JSON.stringify(core));
        if (extra) patch(result, extra.values);
        return patch(result, locale.values);
      })().catch(error => { pending.delete(key); throw error; }));
      return pending.get(key);
    };
  }
  function dependencies(contexts, bindings, runtime) {
    const documents = new Set(), items = new Set();
    let images = false, pharmacy = false;
    const addId = (set, value) => {
      if (Number.isSafeInteger(Number(value)) && Number(value) > 0) set.add(String(value));
    };
    function inspect(value) {
      if (!value || typeof value !== "object") return;
      if (value.textdes_id) documents.add(String(value.textdes_id));
      for (const id of value.item_ids || []) items.add(String(id));
      if (value.op === "result") addId(items, value.item);
      if (value.op === "popup") addId(value.kind === "document" ? documents : items, value.value);
      if (value.op === "treatment" || value.op === "pharmacy") pharmacy = true;
      if (value.picture_res || value.pictureRes || value.background_res || value.backgroundRes) images = true;
      for (const id of bindings?.[value.objective_key] || []) documents.add(String(id));
      // A tracked document can be launched by a separate helper task. Its
      // native document reference retains that helper key, so load the checked
      // callback's document for the main objective before rendering it.
      const callback=runtime?.route_dialogues?.objective_presentations?.[value.objective_key];
      if(callback && callback.step===value.objective_key
          && callback.admission?.kind==='verified_tracked_document_interaction'
          && callback.reader_policy==='optional_objective_reference') {
        addId(documents,callback.admission.textdes_id);
      }
      for (const child of Object.values(value)) if (child && typeof child === "object") inspect(child);
    }
    for (const context of contexts) {
      inspect(context.story);
      inspect(context.graph);
    }
    // Treatment lets readers choose any unlocked recipe. Include its possible
    // rewards before rendering the controls and subsequent variable item popup.
    if (pharmacy) {
      for (const row of Object.values(runtime?.pharmacy?.therapy_drugs || {})) addId(items, row.ItemID);
      for (const row of Object.values(runtime?.pharmacy?.pharmacy_pool || {})) {
        const medicine = String(row.Medicine || "").match(/\d+/g) || [];
        for (let i = 0; i < medicine.length; i += 2) addId(items, medicine[i]);
      }
    }
    return {documents: [...documents], items: [...items], images: images || documents.size > 0 || items.size > 0};
  }
  return {create, merge, dependencies, entities, patch};
});
