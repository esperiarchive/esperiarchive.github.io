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

  function fetchResource(value, options = {}) {
    return global.fetch(url(value), {
      ...options,
      cache: options.cache === "no-store" ? "default" : options.cache,
    });
  }

  async function readJson(response) {
    if (!response.ok) throw new Error(`${response.status}: ${response.url}`);
    const payload = await response.json();
    const descriptors = payload?.tea_shards;
    if (!Array.isArray(descriptors)) return payload;
    await Promise.all(descriptors.map(async ({ field, kind, files }) => {
      if (!["array", "object"].includes(kind)
          || ["__proto__", "prototype", "constructor"].includes(field)) {
        throw new Error("Invalid reader catalog shard descriptor");
      }
      const parts = await Promise.all(files.map(async (file) =>
        readJson(await global.fetch(new URL(file, response.url).href))));
      payload[field] = kind === "array" ? parts.flat() : Object.assign({}, ...parts);
    }));
    delete payload.tea_shards;
    return payload;
  }

  global.ReaderPublication = Object.freeze({ url, fetch: fetchResource, readJson });
})(window);
