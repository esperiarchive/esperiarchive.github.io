/* Scene recaps use exact Plot.SkipText bindings, never neighboring assets. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StoryScenes = api;
})(typeof globalThis === "object" ? globalThis : this, function() {
  "use strict";

  function install(source, record) {
    if (!record) return source;
    if (source.nodes["scene:skip_description"]) return source;
    const graph = structuredClone(source);
    const nodes = Object.values(graph.nodes);
    const cinematics = nodes.filter(node => node.type === "cinematic");
    const ordinary = nodes.some(node => ["choice", "activity", "document"].includes(node.type)
      || (node.type === "line" && !["subtitle", "cinematic_dialogue"].includes(node.entry_kind)));

    function text(key, value) {
      graph.text_entries[key] = {key, kind: "scene_summary", source_cn: value.source_cn,
        metadata_source: value.source, plot_ids: value.plot_ids || []};
      if (value.text_i18n._saved) {
        graph.text_entries[key].saved_translations = structuredClone(value.text_i18n._saved);
      }
      graph.embedded_locales ||= {};
      for (const lang of ["cn", "en", "jp", "kr"]) {
        const locale = graph.embedded_locales[lang] ||= {texts: {}, speakers: {}};
        locale.texts[key] = {text: value.text_i18n[lang] || "", source_cn: value.source_cn,
          status: value.text_i18n[lang] ? "matched" : "target_text_empty"};
      }
    }

    for (const node of cinematics) {
      const value = record.cinematics?.[node.timeline_name];
      if (value) {
        const key = `scene:cinematic:${node.id}`;
        text(key, value);
        graph.nodes[node.id].summary_text_key = key;
      }
    }
    if (!record.skip) return graph;
    if (!ordinary && cinematics.length === 1) {
      // A cinematic-only Plot uses its recap on the cinematic itself.
      const key = "scene:cinematic:skip";
      text(key, record.skip);
      graph.nodes[cinematics[0].id].summary_text_key = key;
    } else if (ordinary) {
      const terminals = new Set(nodes.filter(node => node.type === "end" && !node.next).map(node => node.id));
      if (!terminals.size) return graph;
      const id = "scene:skip_description", key = "scene:skip_text";
      // A single shared exit preserves branch conditions and keeps the recap
      // after the selected dialogue. It never establishes task completion.
      const target = value => terminals.has(value) ? id : value;
      graph.roots = graph.roots.map(target);
      for (const node of nodes) {
        for (const field of ["next", "skip", "target", "return_to"]) {
          if (node[field]) node[field] = target(node[field]);
        }
        for (const option of node.options || []) option.target = target(option.target);
      }
      text(key, record.skip);
      graph.nodes[id] = {id, type: "line", entry_kind: "scene_summary", text_key: key,
        speaker_key: "", next: [...terminals][0]};
    }
    return graph;
  }

  function emptySubtitle(item, resolved) {
    return item.entryKind === "subtitle" && resolved.status === "missing_text"
      && !String(resolved.sourceCn || "").trim();
  }

  return {install, emptySubtitle};
});
