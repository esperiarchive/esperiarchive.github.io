/* Source-event state for a transcript. No global visual state or wall-clock timers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DialogueEffects = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const empty = () => ({});
  const canonical = state => JSON.stringify(Object.keys(state).sort().map(key => [key,
    state[key].uncertain, state[key].events.map(e => e.id).sort()]));
  function apply(state, event, id) {
    if (!event) return state;
    if (event.operation === "reset") return empty();
    const result = { ...state }, channel = event.channel;
    if (!channel) return result;
    if (event.resolution === "parallel_order_unresolved") {
      result[channel] = { events: [], uncertain: true };
    } else if (event.operation === "end") {
      delete result[channel];
    } else if (event.lifetime !== "transient") {
      const old = result[channel] || { events: [], uncertain: false };
      // A repeated graph node in a cycle must not make analysis grow without bound.
      result[channel] = { events: [...old.events.filter(e => e.id !== id), { ...event, id }],
        uncertain: old.uncertain || event.resolution !== "mapped" };
    }
    return result;
  }
  function meet(states) {
    if (!states.length) return empty();
    const result = {};
    for (const key of new Set(states.flatMap(s => Object.keys(s)))) {
      const rows = states.map(s => s[key] || { events: [], uncertain: false });
      const common = rows[0].events.filter(e => rows.every(r => r.events.some(v => v.id === e.id)));
      const uncertain = rows.some(r => r.uncertain || r.events.length !== common.length);
      if (common.length || uncertain) result[key] = { events: common, uncertain };
    }
    return result;
  }
  const analysisCache = new WeakMap();
  function analyse(graph) {
    if (analysisCache.has(graph)) return analysisCache.get(graph);
    const incoming = {}, outgoing = {}, predecessors = {}, before = {};
    const roots = new Set(graph.roots || []), nodes = graph.nodes || {};
    for (const [id, node] of Object.entries(nodes)) {
      outgoing[id] = [...new Set([node.next, ...(node.options || []).map(o => o.target),
        node.type === "cycle" ? node.target : null].filter(Boolean))];
      for (const target of outgoing[id]) (predecessors[target] ||= []).push(id);
    }
    const queue = [...roots], queued = new Set(queue);
    let steps = 0;
    while (queue.length && steps++ < Math.max(1000, Object.keys(nodes).length * 50)) {
      const id = queue.shift(); queued.delete(id);
      const node = nodes[id]; if (!node) continue;
      const inputs = (predecessors[id] || []).filter(p => incoming[p] !== undefined).map(p => incoming[p]);
      if (roots.has(id)) inputs.push(empty());
      const state = meet(inputs); before[id] = state;
      const next = ["asset_context", "end"].includes(node.type) ? empty()
        : node.type === "effect" ? apply(state, node.effect_event, id) : state;
      if (incoming[id] !== undefined && canonical(incoming[id]) === canonical(next)) continue;
      incoming[id] = next;
      for (const target of outgoing[id]) if (!queued.has(target)) { queue.push(target); queued.add(target); }
    }
    // Do not present a partial dataflow result as a settled source state.
    if (queue.length) for (const id of Object.keys(before)) before[id] = empty();
    analysisCache.set(graph, before);
    return before;
  }
  function project(items, initial = empty()) {
    let state = initial;
    return items.map(item => {
      if (item.type === "asset_context" || item.type === "effect_reset") state = empty();
      else if (item.type === "effect") state = apply(state, item.effectEvent, item.nodeId);
      return { ...item, effectState: state };
    });
  }
  function communicator(state) {
    const tel = state?.Tel;
    const active = tel && !tel.uncertain ? tel.events : [];
    const visible = active.filter(e => e.parameters?.isActor === true || e.parameters?.tipId > 0);
    const particles = active.filter(e => e.parameters?.isActor === true);
    return { visible: visible.length > 0, overlay: particles.length > 0,
      signal: particles.some(e => e.signal === "bad") ? "bad" : "good" };
  }
  function nostalgic(state) {
    const filter=state?.Filter;
    return !!(filter && !filter.uncertain && filter.events.some(e => e.mode === "Nostalgic" && e.resolution === "mapped"));
  }
  // Only reviewed, source-mapped static adaptations are enabled here. Unknown
  // ordering, blur studies, scenery and transient covers remain undecorated.
  function portraitTreatments(state) {
    const treatments = new Set();
    const masks = {
      pbui_dialogue_effect_vignette_black: "black",
      pbui_dialogue_effect_vignette_red: "red",
      pbui_dialogue_effect_vignette_black_lite: "lite",
    };
    for (const channel of ["Mask", "Effect"]) {
      const active = state?.[channel];
      if (!active || active.uncertain) continue;
      for (const event of active.events || []) {
        if (event.resolution !== "mapped" || event.operation === "end" || event.lifetime === "transient") continue;
        const resources = (event.resources || []).map(r => r.prefab);
        if (channel === "Mask" && resources.length === 1 && Object.hasOwn(masks, resources[0])) {
          treatments.add(masks[resources[0]]);
        } else if (channel === "Effect" && resources.length === 2 &&
            resources.includes("pbui_dialogue_effect_horrible") &&
            resources.includes("pbui_dialogue_effect_vignette_horrible")) {
          treatments.add("haunted");
        }
      }
    }
    return [...treatments];
  }
  function decorateTreatments(frame, state) {
    const treatments = portraitTreatments(state);
    if (!treatments.length) return;
    frame.dataset.portraitEffects = treatments.join(" ");
    for (const treatment of treatments) {
      const layer = document.createElement("span");
      layer.setAttribute("aria-hidden", "true");
      if (treatment !== "haunted") {
        layer.className = `dialogue-portrait-mask dialogue-portrait-mask-${treatment}`;
      } else {
        layer.className = "dialogue-haunted-overlay";
        const shade = document.createElement("span");
        shade.className = "dialogue-haunted-shade";
        layer.appendChild(shade);
        for (const [name, placement] of [
          ["bg4", "top-left"], ["bg2", "top-right"], ["bg3", "bottom-left"],
          ["bg1", "bottom-right"], ["dec3", "wisp-left"], ["dec4", "wisp-right"],
        ]) {
          const image = document.createElement("img");
          image.className = `dialogue-haunted-texture ${placement}`;
          image.alt = "";
          image.decoding = "async";
          image.src = ReaderPublication.url(`assets/dialogue_effects/portrait_v1/spui_dialogue_horrible_${name}.png`);
          image.addEventListener("error", () => image.remove(), { once: true });
          layer.appendChild(image);
        }
        const tint = document.createElement("span");
        tint.className = "dialogue-haunted-tint";
        layer.appendChild(tint);
      }
      frame.appendChild(layer);
    }
  }
  function refreshPortrait(frame) {
    if(typeof DialogueColorLookup !== "undefined") DialogueColorLookup.refresh(frame);
  }
  function decoratePortrait(frame, state, {communicator: includeCommunicator = true} = {}) {
    if(nostalgic(state) && typeof DialogueColorLookup !== "undefined") DialogueColorLookup.decorate(frame);
    decorateTreatments(frame, state);
    const tel = communicator(state);
    if (!tel.overlay || !includeCommunicator) return;
    const image = document.createElement("img");
    image.className = "dialogue-communicator-overlay";
    image.src = ReaderPublication.url(`assets/dialogue_effects/communicator/${tel.signal}.v1.png`);
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      delete frame.dataset.communicatorOverlay;
    }, { once: true });
    frame.dataset.communicatorOverlay = tel.signal;
    frame.appendChild(image);
  }
  function decorate(block, state, debug = false) {
    const tel = communicator(state);
    if (tel.visible) {
      const indicator = document.createElement("div");
      indicator.className = "dialogue-communicator";
      indicator.textContent = tel.signal === "bad" ? "Communicator · weak signal" : "Communicator";
      block.dataset.communicator = tel.signal;
      block.prepend(indicator);
    }
    if (debug && state && Object.keys(state).length) {
      const details = document.createElement("details"); details.className = "dialogue-effect-debug";
      const summary = document.createElement("summary"); summary.textContent = "Source effects";
      const pre = document.createElement("pre"); pre.textContent = JSON.stringify(state, null, 2);
      details.append(summary, pre); block.appendChild(details);
    }
  }
  return { empty, apply, meet, analyse, project, communicator, nostalgic, portraitTreatments, refreshPortrait, decoratePortrait, decorate };
});
