/* Publication URLs and transparent catalog shards; used by exported readers. */
(function (global) {
  "use strict";
  const config = global.TEA_CONFIG || {};
  const root = new URL(".", document.baseURI);
  const dataRoot = new URL(config.data_base || "data/", root);
  const assetRoot = new URL(config.asset_base || "assets/", root);
  const imageRoot = config.image_base ? new URL(config.image_base, root) : null;
  const voiceRoot = config.voice_base ? new URL(config.voice_base, root) : null;

  function assetUrl(path) {
    const audio = path.match(/^(?:audio|voice)\/(.*)$/);
    if (audio && voiceRoot) return new URL(audio[1], voiceRoot).href;
    if (path.startsWith("images/") && imageRoot) return new URL(path.slice(7), imageRoot).href;
    // Small fixed effects and fonts travel with the frontend.
    if (imageRoot && !audio && !/^(?:dialogue_effects|classes|factions|home|fonts)\//.test(path) && !/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(path)) {
      return new URL(path, imageRoot).href;
    }
    return new URL(path, assetRoot).href;
  }

  function url(value) {
    if (!value || typeof value !== "string") return value;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;
    const data = value.match(/^(?:\.\.\/reader_data\/|data\/)(.*)$/);
    if (data) return data[1].startsWith("assets/")
      ? assetUrl(data[1].slice(7)) : new URL(data[1], dataRoot).href;
    const asset = value.match(/^(?:\.\.\/reader_viewer\/|reader_viewer\/)?assets\/(.*)$/);
    return asset ? assetUrl(asset[1]) : value;
  }

  function fetchNow(href, options) {
    return global.fetch(href, {
      ...options,
      cache: options.cache === "no-store" ? "default" : options.cache,
    });
  }

  // Early route data. The page head starts the requests a view always needs
  // before the reader scripts have loaded. The reader takes each response once,
  // by exact URL; a preload it never asks for costs only that download.
  const early = new Map();
  const requested = new Set();

  function preload(value) {
    const href = url(value);
    if (!href || requested.has(href)) return null;
    if (!early.has(href)) early.set(href, global.fetch(href).catch(() => null));
    return early.get(href);
  }

  function fetchResource(value, options = {}) {
    const href = url(value);
    requested.add(href);
    const pending = !options.method || options.method === "GET" ? early.get(href) : null;
    if (!pending) return fetchNow(href, options);
    early.delete(href);
    return pending.then(response => {
      if (response?.ok) return response;
      // An HTTP error may itself be cached. Give the foreground request a fresh attempt.
      return fetchNow(href, response ? {...options, cache: "reload"} : options);
    });
  }

  // The development server sends no-store. Only exported readers can reuse these downloads.
  function canWarm(unmetered = false) {
    const connection = global.navigator?.connection;
    if (!config.data_base || connection?.saveData || /2g$/.test(connection?.effectiveType || "")) return false;
    return !unmetered || ["wifi", "ethernet"].includes(connection?.type);
  }

  const warmQueue = [];
  const pendingWarm = new Map();
  let activeWarm = 0;

  async function downloadWarm(href) {
    try {
      const response = await global.fetch(href, {priority: "low"});
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      return {body: await response.arrayBuffer(), url: response.url || href};
    } catch (_) {
      return null;
    }
  }

  function drainWarmQueue() {
    while (activeWarm < 6 && warmQueue.length) {
      const {href, unmetered, resolve} = warmQueue.shift();
      if (!canWarm(unmetered)) {
        pendingWarm.delete(href);
        resolve(null);
        continue;
      }
      activeWarm++;
      downloadWarm(href).then(result => {
        activeWarm--;
        pendingWarm.delete(href);
        resolve(result);
        drainWarmQueue();
      });
    }
  }

  function warmBody(value, unmetered) {
    const href = url(value);
    if (!href || !canWarm(unmetered) || early.has(href)) return Promise.resolve(null);
    if (!pendingWarm.has(href)) {
      const pending = new Promise(resolve => warmQueue.push({href, unmetered, resolve}));
      pendingWarm.set(href, pending);
      drainWarmQueue();
    }
    return pendingWarm.get(href);
  }

  async function warm(value, unmetered = false) {
    return Boolean(await warmBody(value, unmetered));
  }

  async function loadWarmJson(value, unmetered) {
    const result = await warmBody(value, unmetered);
    if (!result) throw new Error("Background catalog unavailable");
    const payload = JSON.parse(new TextDecoder().decode(result.body));
    return expandShared(await readShards(payload, result.url, href => loadWarmJson(href, unmetered)));
  }

  function warmJson(value, unmetered = false) {
    return loadWarmJson(value, unmetered).catch(() => null);
  }

  const LANGUAGES = ["en", "jp", "kr", "cn"];

  // A preloaded JSON body is read from a clone, so the reader still receives
  // the original response. The clone is registered before the reader can take it.
  function preloadJson(value) {
    const pending = preload(value);
    return pending ? pending.then(response => response?.ok ? response.clone().json() : null).catch(() => null)
      : Promise.resolve(null);
  }

  // Mirrors the reader's first requests for each kind of address. It is advisory:
  // a mismatch only wastes a download, and every failure is ignored.
  async function preloadRoute(hash = global.location?.hash || "") {
    // Only exported readers route their requests through this module.
    if (!config.data_base) return;
    try {
      const [path = "", query = ""] = String(hash).replace(/^#\/?/, "").split("?");
      const parts = path.split("/").filter(Boolean), view = parts[0] || "home";
      if (view === "home" || view === "cosmetics") return;
      const storyArchive = view === "story-archive";
      if (storyArchive) {
        const page = parts[1] || "";
        if (!["", "stories", "glossary", "search"].includes(page)) return;
        preload("data/story_archive/index.json");
        if (page === "glossary" || page === "search") preload("data/glossary/index.json");
        if (page !== "stories" && page !== "search") return;
      }
      let language = new URLSearchParams(query).get("lang");
      if (!LANGUAGES.includes(language)) {
        try { language = global.localStorage?.getItem("afkReader.language"); } catch (_) { language = null; }
      }
      if (!LANGUAGES.includes(language)) language = "en";
      const data = name => "data/" + name, local = name => "../reader_data/" + name;
      const routes = await preloadJson(local("catalogs/navigation/routes.json"));
      if (!routes) return;
      if (routes.music) preload(data(routes.music));
      const bootstrap = routes.bootstrap ? preloadJson(data(routes.bootstrap)) : Promise.resolve(null);
      if (view === "archive") {
        if (["fish", "enemies"].includes(parts[1])) {
          const catalog = await preloadJson(data("world_archive/" + parts[1] + ".json"));
          const entity = catalog?.browser_entity;
          if (entity?.core) preload(data(entity.core));
          if (entity?.locales?.[language]) preload(data(entity.locales[language]));
          return;
        }
        const kind = ["documents", "items", "mail"].includes(parts[1]) ? parts[1] : "documents";
        if (kind === "mail" && routes.characters) preload(data(routes.characters));
        const [manifest, bindings] = await Promise.all([bootstrap,
          routes.archives ? preloadJson(data(routes.archives)) : null]);
        if (kind !== "mail") {
          preload(local(manifest?.item_images || "media/item_images/index.json"));
          preload(local("mt/fallbacks.json"));
        }
        preload(local("mt/archives.json"));
        const index = bindings?.archives?.[kind]?.index;
        if (!index) return;
        const catalog = await preloadJson(data(index)), base = index.slice(0, index.lastIndexOf("/") + 1);
        for (const name of new Set([language, "cn"])) {
          if (catalog?.locales?.[name]) preload(local(base + catalog.locales[name]));
        }
        return;
      }
      if (!storyArchive && routes.characters) preload(data(routes.characters));
      const story = view === "stories" || storyArchive
        || (view === "mystical-house" ? parts.length > 2 : parts.length >= 3);
      if (!story) return;
      if (view === "stories" && routes.story_bundles) preload(data(routes.story_bundles));
      for (const key of ["runtime", "exploration", "interactions"]) {
        if (routes[key]) preload(data(routes[key]));
      }
      if (!storyArchive) {
        for (const key of ["portraits", "viewpoints"]) {
          if (routes[key]) preload(data(routes[key]));
        }
        if (routes.player_presets) preload(data("catalogs/player_presets/index.json"));
      }
      preload(local("ministory_collections.json"));
      const manifest = await bootstrap;
      if (manifest?.story_membership) preload(data(manifest.story_membership));
    } catch (_) { /* The reader requests everything it needs itself. */ }
  }

  const FORBIDDEN_SHARED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  function expandShared(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Object.hasOwn(payload, "tea_shared")) {
      return payload;
    }
    const table = payload.tea_shared;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      throw new Error("Invalid tea_shared table");
    }
    for (const key of FORBIDDEN_SHARED_KEYS) {
      if (Object.hasOwn(table, key)) throw new Error("Unsafe tea_shared key");
    }
    const resolved = new Map();
    const resolving = new Set();

    function resolveEntry(tid) {
      if (typeof tid !== "string" || FORBIDDEN_SHARED_KEYS.has(tid) || !Object.hasOwn(table, tid)) {
        throw new Error(`Invalid shared reference: ${String(tid)}`);
      }
      if (resolved.has(tid)) return resolved.get(tid);
      if (resolving.has(tid)) throw new Error(`Cyclic shared reference: ${tid}`);
      resolving.add(tid);
      const value = expand(table[tid]);
      resolving.delete(tid);
      resolved.set(tid, value);
      return value;
    }

    function expand(value) {
      if (!value || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(expand);
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === "$tea_ref") {
        return resolveEntry(value.$tea_ref);
      }
      const out = {};
      for (const key of keys) {
        if (FORBIDDEN_SHARED_KEYS.has(key)) throw new Error("Unsafe key in shared payload");
        out[key] = expand(value[key]);
      }
      return out;
    }

    const result = {};
    for (const key of Object.keys(payload)) {
      if (key === "tea_shared") continue;
      if (FORBIDDEN_SHARED_KEYS.has(key)) throw new Error("Unsafe key in shared payload");
      result[key] = expand(payload[key]);
    }
    return result;
  }

  async function readJson(response) {
    if (!response.ok) throw new Error(`${response.status}: ${response.url}`);
    return expandShared(await readShards(await response.json(), response.url, async href => readJson(await global.fetch(href))));
  }

  async function readShards(payload, href, readPart) {
    const descriptors = payload?.tea_shards;
    if (!Array.isArray(descriptors)) return payload;
    await Promise.all(descriptors.map(async ({ field, kind, files }) => {
      if (!["array", "object"].includes(kind)
          || ["__proto__", "prototype", "constructor"].includes(field)) {
        throw new Error("Invalid reader catalog shard descriptor");
      }
      const parts = await Promise.all(files.map(file => readPart(new URL(file, href).href)));
      payload[field] = kind === "array" ? parts.flat() : Object.assign({}, ...parts);
    }));
    delete payload.tea_shards;
    return payload;
  }

  global.ReaderPublication = Object.freeze({ url, fetch: fetchResource, readJson, expandShared, preloadRoute, canWarm, warm, warmJson });
})(window);
