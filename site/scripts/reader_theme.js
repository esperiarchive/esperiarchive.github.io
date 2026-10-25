// Apply the saved palette before the first paint; switching never reloads a story.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.start(root.document, root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const key = "afkReader.theme";
  const normalize = value => ["dark", "light", "system"].includes(value) ? value : "dark";
  function start(doc, environment) {
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
      if (!select) return;
      select.value = preference;
      select.addEventListener("change", () => change(select.value));
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind, {once:true});
    else bind();
    return {change};
  }
  return {start};
});
