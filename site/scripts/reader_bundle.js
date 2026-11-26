void 0;
/* Apply the recovered old-photo LUT to portrait crops, without changing assets. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DialogueColorLookup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  function grade(pixels, lut, size, contribution) {
    const amount = Math.max(0, Math.min(1, contribution));
    const last = size - 1, width = size * size;
    const index = (r,g,b) => ((last-g)*width+b*size+r)*4;
    for (let p=0;p<pixels.length;p+=4) {
      if (!pixels[p+3]) continue;
      const r=pixels[p]/255*last,g=pixels[p+1]/255*last,b=pixels[p+2]/255*last;
      const r0=Math.floor(r),g0=Math.floor(g),b0=Math.floor(b);
      const r1=Math.min(last,r0+1),g1=Math.min(last,g0+1),b1=Math.min(last,b0+1);
      const fr=r-r0,fg=g-g0,fb=b-b0;
      const indices=[index(r0,g0,b0),index(r1,g0,b0),index(r0,g1,b0),index(r1,g1,b0),
        index(r0,g0,b1),index(r1,g0,b1),index(r0,g1,b1),index(r1,g1,b1)];
      const weights=[(1-fr)*(1-fg)*(1-fb),fr*(1-fg)*(1-fb),(1-fr)*fg*(1-fb),fr*fg*(1-fb),
        (1-fr)*(1-fg)*fb,fr*(1-fg)*fb,(1-fr)*fg*fb,fr*fg*fb];
      for(let c=0;c<3;c++) {
        let mapped=0;for(let k=0;k<8;k++) mapped+=lut[indices[k]+c]*weights[k];
        pixels[p+c]=Math.round(pixels[p+c]*(1-amount)+mapped*amount);
      }
    }
    return pixels;
  }
  let lookupPromise;
  function loadLookup() {
    if (!lookupPromise) lookupPromise = new Promise((resolve,reject)=>{
      const image=new Image();
      image.crossOrigin="anonymous";
      image.onload=()=>{
        try {
          const size=image.naturalHeight;
          if(image.naturalWidth!==size*size) throw new Error("Invalid memory color lookup dimensions");
          const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=size;
          const context=canvas.getContext("2d",{willReadFrequently:true});
          context.drawImage(image,0,0);
          resolve({size,pixels:context.getImageData(0,0,canvas.width,canvas.height).data});
        } catch(error) {reject(error);}
      };
      image.onerror=()=>reject(new Error("Memory color lookup could not be loaded"));
      image.src=ReaderPublication.url("assets/dialogue_effects/memory/oldphotos-lut.v1.png");
    });
    return lookupPromise;
  }
  const portraits=new WeakMap();
  function refresh(frame) {
    const entry=portraits.get(frame);
    if(!entry?.lookup || !frame.isConnected) return;
    const {image,canvas,lookup}=entry;
    const fw=frame.clientWidth,fh=frame.clientHeight;
    const iw=parseFloat(image.style.width),ih=parseFloat(image.style.height);
    const ix=parseFloat(image.style.left),iy=parseFloat(image.style.top);
    if(!image.naturalWidth || !fw || !fh || ![iw,ih,ix,iy].every(Number.isFinite)) return;
    const key=[image.currentSrc,fw,fh,iw,ih,ix,iy].join("|");
    if(entry.key===key) return;
    const scale=Math.min(512/fw,Math.max(2,128/fw));
    canvas.width=Math.round(fw*scale);canvas.height=Math.round(fh*scale);
    const context=canvas.getContext("2d",{willReadFrequently:true});
    context.drawImage(image,ix*scale,iy*scale,iw*scale,ih*scale);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    grade(pixels.data,lookup.pixels,lookup.size,.85);
    context.putImageData(pixels,0,0);
    entry.key=key;frame.dataset.memoryGraded="true";
  }
  function decorate(frame) {
    const image=frame.querySelector(".dialogue-line-portrait-image");
    if(!image || portraits.has(frame)) return;
    const canvas=document.createElement("canvas");canvas.className="dialogue-memory-color";
    canvas.setAttribute("aria-hidden","true");frame.appendChild(canvas);
    const vignette=document.createElement("span");vignette.className="dialogue-memory-vignette";
    vignette.setAttribute("aria-hidden","true");frame.appendChild(vignette);
    frame.dataset.memory="nostalgic";
    const entry={image,canvas,lookup:null,key:""};portraits.set(frame,entry);
    image.addEventListener("load",()=>refresh(frame));
    loadLookup().then(lookup=>{entry.lookup=lookup;refresh(frame);}).catch(error=>{
      // Keep the original portrait if grading fails; no blank/broken replacement.
      canvas.remove();vignette.remove();delete frame.dataset.memory;portraits.delete(frame);
      console.warn(error.message);
    });
  }
  return {grade,decorate,refresh};
});

;
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
  function decorate(block, state, debug = false, translate = key => key) {
    const tel = communicator(state);
    if (tel.visible) {
      const indicator = document.createElement("div");
      indicator.className = "dialogue-communicator";
      indicator.textContent = translate(tel.signal === "bad" ? "Communicator · weak signal" : "Communicator");
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

;
/* User-created portrait packs live in IndexedDB; startup reads only metadata. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ReaderAppearanceStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function create(database=globalThis.indexedDB){
    let opening;
    function open(){
      return opening ||= new Promise((resolve,reject)=>{
        if(!database)return reject(new Error('Saved looks require browser storage.'));
        const request=database.open('afkReaderLooks',1);
        request.onupgradeneeded=()=>{request.result.createObjectStore('looks',{keyPath:'id'});request.result.createObjectStore('packs');};
        request.onerror=()=>{opening=null;reject(request.error);};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
        request.onblocked=()=>{opening=null;reject(new Error('Close other reader tabs to update saved looks.'));};
      });
    }
    async function transact(stores,mode,run){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(stores,mode);let value;
        tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Could not save this look. Browser storage may be full.'));
        try{run(tx,result=>{value=result;});}catch(error){tx.abort();reject(error);}
      });
    }
    const read=(store,key)=>transact([store],'readonly',(tx,done)=>{const request=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);request.onsuccess=()=>done(request.result);});
    return {
      list:()=>read('looks'),get:id=>read('packs',id),
      put:(row,source)=>transact(['looks','packs'],'readwrite',tx=>{tx.objectStore('looks').put(row);tx.objectStore('packs').put(source,row.id);}),
      rename:(id,displayName)=>transact(['looks'],'readwrite',tx=>{const store=tx.objectStore('looks'),request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,displayName});};}),
      updateThumbnail:(id,thumbnail,thumbnailVersion)=>transact(['looks'],'readwrite',tx=>{const store=tx.objectStore('looks'),request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,thumbnail,thumbnailVersion});};}),
      remove:id=>transact(['looks','packs'],'readwrite',tx=>{tx.objectStore('looks').delete(id);tx.objectStore('packs').delete(id);})
    };
  }
  return {create};
});

;
/* Saved Unity appearances and session-local, self-contained PNG portrait packs.
   Pack v1: schema/version, gender/displayName, recipe {sourcePreset,avatarIds},
   framing {focusX,focusYTop,zoom}, poses {normal:{png,framing?,choiceFraming?},...}.
   Saved packs are persisted separately from lightweight catalogue metadata. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReaderPlayerAppearance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const STORAGE = 'afkReader.playerAppearances.v1';
  const PACK_SCHEMA = 'afk.reader.portrait-pack';
  const PACK_LIMITS = Object.freeze({fileBytes:24*1024*1024, imageBytes:4*1024*1024, poses:12, pixels:24*1024*1024, dimension:2048});
  const PNG_CRC = Uint32Array.from({length:256}, (_,value)=>{for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
  // randomUUID needs a secure page (https or localhost) and a 2022 or later browser; getRandomValues works everywhere.
  function randomId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function framing(value) {
    if (!object(value) || !['focusX','focusYTop','zoom'].every(key => Number.isFinite(value[key]))
        || value.focusX < 0 || value.focusX > 1 || value.focusYTop < 0 || value.focusYTop > 1 || value.zoom < 1 || value.zoom > 12) {
      throw new Error('Portrait framing must use focus coordinates from 0 to 1 and zoom from 1 to 12.');
    }
    return {focusX:value.focusX, focusYTop:value.focusYTop, zoom:value.zoom};
  }
  function pngBytes(data) {
    const prefix = 'data:image/png;base64,';
    if (typeof data !== 'string' || !data.startsWith(prefix)) throw new Error('Portraits must contain embedded PNG images, not URLs.');
    const encoded = data.slice(prefix.length);
    const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
    if (encoded.length > Math.ceil(PACK_LIMITS.imageBytes/3)*4 || encoded.length%4 || /[^A-Za-z0-9+/]/.test(encoded.slice(0,encoded.length-padding))) throw new Error('Invalid or oversized PNG image.');
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const invalid = () => { throw new Error('Invalid PNG image.'); };
    if (bytes.length < 57 || bytes.length > PACK_LIMITS.imageBytes || [137,80,78,71,13,10,26,10].some((n,i) => bytes[i] !== n)) invalid();
    const view = new DataView(bytes.buffer); let offset=8, width=0, height=0, imageData=false, ended=false;
    while (offset+12 <= bytes.length) {
      const length=view.getUint32(offset), end=offset+12+length;
      if (end > bytes.length) invalid();
      const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
      let crc=0xffffffff;
      for(let i=offset+4;i<end-4;i++) crc=(crc>>>8)^PNG_CRC[(crc^bytes[i])&255];
      if (((crc^0xffffffff)>>>0) !== view.getUint32(end-4)) invalid();
      if (offset===8) {
        if (type!=='IHDR' || length!==13) invalid();
        width=view.getUint32(offset+8); height=view.getUint32(offset+12);
        if (width<1 || height<1 || width>PACK_LIMITS.dimension || height>PACK_LIMITS.dimension) throw new Error('PNG dimensions exceed 2048 pixels.');
      } else if (type==='IHDR') invalid();
      if (type==='acTL') throw new Error('Animated PNGs are not supported.');
      if (type==='IDAT' && length) imageData=true;
      if (type==='IEND') { if(length || end!==bytes.length || !imageData) invalid(); ended=true; }
      offset=end;
    }
    if (!ended) invalid();
    return {bytes,width,height};
  }
  function wardrobe3dRecipe(input) {
    if (!object(input) || input.version !== 1) throw new Error('Unsupported 3D wardrobe recipe.');
    const {outfitGender, pose, background, yaw, zoom, pan, assetRevision} = input;
    if (!['male','female'].includes(outfitGender) || typeof pose !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(pose)
        || !['dark','white','clear'].includes(background) || !Number.isFinite(yaw) || yaw < 0 || yaw >= 360
        || !Number.isFinite(zoom) || zoom < 1 || zoom > 4 || !Array.isArray(pan) || pan.length !== 2
        || !pan.every(n => Number.isFinite(n) && Math.abs(n) <= 10)
        || typeof assetRevision !== 'string' || !/^[a-z0-9._-]{1,80}$/i.test(assetRevision)) {
      throw new Error('Invalid 3D wardrobe settings.');
    }
    const result = {version:1, outfitGender, pose, background, yaw, zoom, pan:[...pan], assetRevision};
    for (const key of ['cross','fillLegs','hairCollide','layerFitOn','wowFit','lightFollows']) {
      if (typeof input[key] !== 'boolean') throw new Error('Invalid 3D wardrobe setting: ' + key);
      result[key] = input[key];
    }
    return result;
  }
  function parsePack(source) {
    if (typeof source !== 'string' || source.length > PACK_LIMITS.fileBytes || new TextEncoder().encode(source).length > PACK_LIMITS.fileBytes) throw new Error('Portrait pack exceeds the 24 MB limit.');
    let pack; try { pack=JSON.parse(source); } catch (_) { throw new Error('Portrait pack is not valid JSON.'); }
    if (!object(pack) || pack.schema!==PACK_SCHEMA || pack.version!==1) throw new Error('Unsupported portrait-pack schema or version.');
    if (!['male','female'].includes(pack.gender)) throw new Error('Portrait pack must specify male or female.');
    if (typeof pack.displayName!=='string' || !pack.displayName.trim() || pack.displayName.length>80 || /[\u0000-\u001f]/.test(pack.displayName)) throw new Error('A portrait-pack name of 1–80 characters is required.');
    const base=framing(pack.framing), entries=object(pack.poses)?Object.entries(pack.poses):[];
    if (!entries.length || entries.length>PACK_LIMITS.poses || !Object.hasOwn(pack.poses,'normal')) throw new Error('Include a normal portrait and at most 12 poses.');
    const poses=Object.create(null); let pixels=0;
    for (const [pose, value] of entries) {
      if (!/^[a-z][a-z0-9_]{0,47}$/.test(pose) || ['constructor','prototype','__proto__'].includes(pose) || !object(value)) throw new Error('Invalid portrait pose.');
      const png=pngBytes(value.png); pixels+=png.width*png.height;
      if (pixels>PACK_LIMITS.pixels) throw new Error('Portrait pack contains too many image pixels.');
      poses[pose]={...png, framing:value.framing===undefined?base:framing(value.framing)};
      if (value.choiceFraming!==undefined) poses[pose].choiceFraming=framing(value.choiceFraming);
    }
    const recipe={avatarIds:{}};
    if (pack.recipe!==undefined) {
      if (!object(pack.recipe)) throw new Error('Invalid appearance recipe.');
      if (pack.recipe.sourcePreset!==undefined) {
        if (typeof pack.recipe.sourcePreset!=='string' || !/^[a-z0-9_-]{1,100}$/.test(pack.recipe.sourcePreset)) throw new Error('Invalid source preset.');
        recipe.sourcePreset=pack.recipe.sourcePreset;
      }
      if (pack.recipe.avatarIds!==undefined) {
        if (!object(pack.recipe.avatarIds)) throw new Error('Invalid avatar IDs.');
        for (const [slot,id] of Object.entries(pack.recipe.avatarIds)) {
          if (!['outfit','hair','face','skin','eyes','head','mask','back','cloak','beard','bodyshape','makeup','bodypaint'].includes(slot) || !Number.isSafeInteger(id) || id<0 || id>2147483647) throw new Error('Invalid avatar IDs.');
          recipe.avatarIds[slot]=id;
        }
      }
      if (pack.recipe.wardrobe3d !== undefined) recipe.wardrobe3d = wardrobe3dRecipe(pack.recipe.wardrobe3d);
      if (object(pack.recipe.presentation)) recipe.presentation=Object.fromEntries(['rim','bloom','grade','hairFit','clothingFit'].filter(key=>typeof pack.recipe.presentation[key]==='boolean').map(key=>[key,pack.recipe.presentation[key]]));
    }
    return {gender:pack.gender, displayName:pack.displayName.trim(), recipe, poses};
  }
  async function materializePack(pack, services={}) {
    const createUrl=services.createObjectURL || (blob=>URL.createObjectURL(blob));
    const revokeUrl=services.revokeObjectURL || (url=>URL.revokeObjectURL(url));
    const decode=services.decodeImage || (source=>new Promise((resolve,reject)=>{
      const img=new Image(); img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight}); img.onerror=()=>reject(new Error('PNG image could not be decoded.')); img.src=ReaderPublication.url(source);
    }));
    const urls=[], portraits={};
    const dispose=()=>{ for(const url of urls.splice(0)) revokeUrl(url); };
    try {
      for (const [pose,value] of Object.entries(pack.poses)) {
        const source=createUrl(new Blob([value.bytes],{type:'image/png'})); urls.push(source);
        const size=await decode(source);
        if (size.width!==value.width || size.height!==value.height) throw new Error('PNG image dimensions did not match.');
        portraits[pose]={pose, source, displayName:pack.displayName, ...value.framing};
        if(value.choiceFraming) portraits[pose].choiceFraming=value.choiceFraming;
      }
      return {gender:pack.gender,displayName:pack.displayName,recipe:pack.recipe,portraits,dispose};
    } catch(error) { dispose(); throw error; }
  }
  function playerGender(model, fallback = 'male') {
    const name = String(model || '').toLowerCase().replace(/^pbsc_/, '');
    if (['avatar_01_female', 'avatar_female_logic_timeline'].includes(name)) return 'female';
    if (['avatar_01_male', 'avatar_male_logic_timeline'].includes(name)) return 'male';
    return '';
  }
  function portrait(data, pose) {
    if (!data?.portraits) return null;
    let key = String(pose || 'normal').toLowerCase();
    if (['w_idle','idle'].includes(key)) key = 'source_world_idle';
    return data.portraits[key] || data.portraits[key + '_loop'] || data.portraits.normal || null;
  }
  function portraitBounds(pixels,width,height) {
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>4){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)return {x:0,y:0,width,height};
    const padX=Math.ceil((right-left+1)*.04),padY=Math.ceil((bottom-top+1)*.04);
    left=Math.max(0,left-padX);top=Math.max(0,top-padY);
    right=Math.min(width-1,right+padX);bottom=Math.min(height-1,bottom+padY);
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
  }
  async function chooserImage(source,maxWidth=256,maxHeight=384) {
    const canvas=document.createElement('canvas');if(!canvas.getContext)return null;
    const image=new Image();image.src=ReaderPublication.url(source);await image.decode();
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    const bounds=portraitBounds(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
    const scale=Math.min(1,maxWidth/bounds.width,maxHeight/bounds.height);
    canvas.width=Math.max(1,Math.round(bounds.width*scale));canvas.height=Math.max(1,Math.round(bounds.height*scale));
    context.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png');
  }
  function installPrompt(original, placement) {
    if (!placement) return original;
    const anchor = original.nodes?.[placement.after_node], id = 'reader:merlin-appearance';
    if (original.nodes?.[id]) return original;
    if (anchor?.type !== 'line' || original.nodes?.[anchor.next]?.type !== 'end') {
      throw new Error('Merlin appearance prompt no longer follows the final dialogue line');
    }
    const graph = structuredClone(original);
    graph.nodes[id] = {id, type:'line', entry_kind:'player_appearance', next:anchor.next};
    graph.nodes[placement.after_node].next = id;
    return graph;
  }
  function create({read, url, gender, text, storage, onApply, mount, makePortrait, onCustomize, canCustomize=()=>true, lookStore=globalThis.ReaderAppearanceStore?.create()}) {
    let choices = {}, indexPromise, revision = 0;
    try { choices = JSON.parse(storage.getItem(STORAGE) || '{}') || {}; } catch (_) {}
    if (!object(choices)) choices={};
    const loaded = new Map(), pending = new Map(), local = new Map(), localEpoch={male:0,female:0}; let localSerial=0;
    for (const g of ['male','female']) if (typeof choices[g]!=='string' || choices[g].startsWith('local:')) delete choices[g];
    const savedChoices=Object.fromEntries(Object.entries(choices).filter(([g])=>['male','female'].includes(g)));
    const saved=new Map(),thumbnailJobs=new Map();let savedPromise;
    const savedIndex=()=>savedPromise ||= (lookStore?lookStore.list():Promise.resolve([])).then(rows=>{for(const row of rows)saved.set(row.id,row);}).catch(error=>{savedPromise=null;throw error;});
    const currentGender = () => gender() === 'female' ? 'female' : 'male';
    const selected = g => typeof choices[g] === 'string' ? choices[g] : `player_${g}_default1`;
    const index = () => indexPromise ||= read('catalogs/player_presets/index.json').catch(error => { indexPromise = null; throw error; });
    async function load(id) {
      if (local.has(id)) return local.get(id).data;
      if (loaded.has(id)) return loaded.get(id);
      if (!pending.has(id)) pending.set(id, (async () => {
        if(id.startsWith('custom:')) {
          await savedIndex();const row=saved.get(id),source=row&&await lookStore.get(id);
          if(!source)throw new Error('Saved look unavailable');
          const parsed=parsePack(source);parsed.displayName=row.displayName;
          const data=await materializePack(parsed);loaded.set(id,data);return data;
        }
        const catalog = await index(), row = catalog.presets.find(row => row.id === id);
        if (!row) throw new Error('Appearance unavailable');
        const data = await read(row.catalog);
        loaded.set(id, data);
        return data;
      })().catch(error => { pending.delete(id); throw error; }));
      return pending.get(id);
    }
    async function ensure() {
      // Storage failure must not prevent the ordinary preset reader from opening.
      try{await savedIndex();}catch(_){}
      const genders = gender() === 'both' ? ['male','female'] : [currentGender()];
      await Promise.all(genders.map(async g => {
        if (local.get(selected(g))?.gender===g) return;
        const catalog = await index();
        // A local look can be applied while the first catalog request is pending.
        if (local.get(selected(g))?.gender===g) return;
        if (!catalog.presets.some(row => row.id === selected(g) && row.gender === g) && saved.get(selected(g))?.gender!==g) delete choices[g];
        const id=selected(g);
        try{await load(id);}catch(error){
          if(!id.startsWith('custom:')||selected(g)!==id)throw error;
          delete choices[g];await load(selected(g));
        }
      }));
    }
    function resolve(model, pose) {
      const g = playerGender(model);
      return g ? portrait(loaded.get(selected(g)), pose) : null;
    }
    function saveChoice(g,id) {
      choices[g]=id;
      if (!id.startsWith('local:')) {
        savedChoices[g]=id;
        try { storage.setItem(STORAGE, JSON.stringify(savedChoices)); } catch (_) {}
      }
      revision++;
    }
    async function importPack(source,isCurrent=()=>true) {
      if(local.size>=4) throw new Error('Up to four local looks can be loaded. Reset a gender to clear its local looks.');
      if(!isCurrent()) throw new Error('Import cancelled.');
      const parsed=parsePack(source),epoch=localEpoch[parsed.gender];
      const data=await materializePack(parsed);
      if(!isCurrent() || epoch!==localEpoch[parsed.gender]) { data.dispose(); throw new Error('Import cancelled.'); }
      if(local.size>=4) { data.dispose(); throw new Error('Up to four local looks can be loaded.'); }
      const id=`local:${++localSerial}`, row={id,gender:data.gender,displayName:data.displayName,group:'local',preview:data.portraits.normal.source,thumbnail:data.portraits.normal.source,data};
      local.set(id,row); loaded.set(id,data); return row;
    }
    function applyChoice(g,id) {
      if (!loaded.has(id)) throw new Error('Appearance has not loaded.');
      if(local.has(id) && local.get(id).gender!==g) throw new Error('Appearance gender does not match.');
      if(saved.has(id) && saved.get(id).gender!==g) throw new Error('Appearance gender does not match.');
      saveChoice(g,id);
    }
    async function savePack(source,isCurrent=()=>true,previewKey){
      if(!lookStore)throw new Error('Saved looks require browser storage.');
      await savedIndex();
      const parsed=parsePack(source),data=await materializePack(parsed);
      try {
        if(!isCurrent())throw new Error('Import cancelled.');
        const row={id:'custom:'+randomId(),gender:data.gender,displayName:data.displayName,group:'local',recipe:data.recipe,createdAt:Date.now()};
        // Only Save and apply supplies a renderer key. Imported portraits may use arbitrary art.
        if(typeof previewKey==='string'&&previewKey.length>0&&previewKey.length<=512)row.previewKey=previewKey;
        row.thumbnail=await chooserImage(data.portraits.normal.source);row.thumbnailVersion=2;
        if(!isCurrent())throw new Error('Import cancelled.');
        await lookStore.put(row,source);
        saved.set(row.id,row);loaded.set(row.id,data);return row;
      }catch(error){data.dispose();throw error;}
    }
    async function thumbnail(row){
      if(!saved.has(row.id)||row.thumbnailVersion===2)return row.thumbnail;
      if(!thumbnailJobs.has(row.id))thumbnailJobs.set(row.id,(async()=>{
        // Repair old previews from the original normal PNG, without decoding
        // every expression or rewriting the user's saved portrait pack.
        let source=loaded.get(row.id)?.portraits.normal.source;
        if(!source){const pack=JSON.parse(await lookStore.get(row.id));source=pack.poses?.normal?.png;pngBytes(source);}
        const thumbnail=await chooserImage(source);if(!thumbnail||!saved.has(row.id))return row.thumbnail;
        await lookStore.updateThumbnail(row.id,thumbnail,2);
        if(saved.has(row.id))Object.assign(row,{thumbnail,thumbnailVersion:2});
        return thumbnail;
      })().finally(()=>thumbnailJobs.delete(row.id)));
      return thumbnailJobs.get(row.id);
    }
    async function rename(id,name){
      name=String(name||'').trim();
      if(!name||name.length>80||/[\u0000-\u001f]/.test(name))throw new Error('Use a name of 1–80 characters.');
      await savedIndex();if(!saved.has(id))throw new Error('Saved look unavailable');
      await lookStore.rename(id,name);saved.get(id).displayName=name;
      const data=loaded.get(id);if(data){data.displayName=name;for(const p of Object.values(data.portraits))p.displayName=name;}
    }
    async function remove(id){
      await savedIndex();const row=saved.get(id);if(!row)return;
      const fallback=`player_${row.gender}_default1`;
      if(selected(row.gender)===id)await load(fallback);
      await lookStore.remove(id);
      if(selected(row.gender)===id){saveChoice(row.gender,fallback);onApply({gender:row.gender,chooseGender:false});}
      loaded.get(id)?.dispose();loaded.delete(id);pending.delete(id);saved.delete(id);
    }
    async function customizationSeed(g=currentGender(),id=selected(g)){
      await load(id);const data=loaded.get(id);
      if(id.startsWith('custom:')||id.startsWith('local:')){
        if(!data.recipe?.sourcePreset&&!data.recipe?.avatarIds?.outfit)throw new Error(text('This pack has no editable recipe. Create your own look instead.'));
        const key=saved.get(id)?.previewKey;
        return {gender:g,name:data.displayName,recipe:data.recipe,...(key&&{openingPortrait:{key,source:data.portraits.normal.source}})};
      }
      return {gender:g,recipe:{sourcePreset:id}};
    }
    async function customize(options={}){
      const g=options.gender||currentGender();
      if(!onCustomize||!await canCustomize())return false;
      const seed=options.fresh?{gender:g,recipe:{sourcePreset:`player_${g}_default1`}}:await customizationSeed(g,options.id||selected(g));
      onCustomize(seed,{opener:options.opener||button,chooseGender:!!options.chooseGender});return true;
    }
    async function reset(g=currentGender(),isCurrent=()=>true) {
      const epoch=++localEpoch[g],before=revision,id=`player_${g}_default1`; await load(id);
      if(!isCurrent() || epoch!==localEpoch[g] || revision!==before) return false;
      saveChoice(g,id);
      onApply({gender:g,chooseGender:false});
      for(const [key,row] of local) if(row.gender===g) { row.data.dispose(); local.delete(key); loaded.delete(key); }
      return true;
    }
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'player-appearance-button';
    button.dataset.i18n = 'Merlin Appearance'; button.textContent = text('Merlin Appearance');
    mount.appendChild(button);
    const dialog = document.createElement('dialog');
    dialog.className = 'player-appearance-dialog'; dialog.id = 'player-appearance-dialog';
    dialog.setAttribute('aria-labelledby', 'player-appearance-title');
    document.body.appendChild(dialog);
    let draft = '', draftGender = '', group = 'default', generation = 0, opener = button, chooseGender = false;
    function element(tag, className, value) {
      const node = document.createElement(tag); node.className = className;
      if (value !== undefined) node.textContent = value;
      return node;
    }
    function close() { ++generation; dialog.close(); opener?.focus({preventScroll:true}); }
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    async function draw(initial = false) {
      const token = ++generation;
      dialog.replaceChildren();
      const header = element('header', 'appearance-header');
      const title = element('h2', '', text('Merlin Appearance')); title.id = 'player-appearance-title';
      const exit = element('button', '', text('Close')); exit.type = 'button'; exit.onclick = close;
      header.append(title, exit); dialog.append(header);
      const status = element('p', 'appearance-status', text('Loading…'));
      status.setAttribute('role', 'status'); dialog.append(status);
      try {
        const catalog = await index();await savedIndex();const editable=!!onCustomize&&await canCustomize();if (token !== generation) return;
        if (initial) group = saved.get(draft)?.group || local.get(draft)?.group || catalog.presets.find(row => row.id === draft)?.group || 'default';
        status.remove();
        const filters = element('div', 'appearance-filters');
        const genderTitle = text('Gender');
        const genderLabel = element('label', '', genderTitle);
        const sex = element('select', ''); sex.setAttribute('aria-label', genderTitle);
        for (const g of ['male','female']) { const option = element('option','',text(g === 'male' ? 'Male' : 'Female')); option.value = g; sex.append(option); }
        sex.value = draftGender;
        sex.onchange = () => { draftGender = sex.value; draft = selected(draftGender); draw(true); };
        genderLabel.append(sex); filters.append(genderLabel);
        const groupLabel = element('label', '', text('Outfit group'));
        const season = element('select',''); season.setAttribute('aria-label', text('Outfit group'));
        for (const key of ['default', ...Array.from({length:8}, (_,i) => `s${String(i+1).padStart(2,'0')}`), 'local']) {
          const option = element('option','',key === 'local' ? text('My looks') : key === 'default' ? text('Default') : text('Season {n}', {n:Number(key.slice(1))}));
          option.value = key; season.append(option);
        }
        season.value = group; season.onchange = () => { group = season.value; draw(); };
        groupLabel.append(season); filters.append(groupLabel); dialog.append(filters);
        const imports=element('div','appearance-import');
        const importButton=element('button','',text('Import portrait pack')); importButton.type='button';
        const input=element('input',''); input.type='file'; input.accept='.portraitpack.json,application/json'; input.hidden=true;
        const importStatus=element('p','appearance-note',text('My looks are saved in this browser.')); importStatus.setAttribute('role','status');
        importButton.onclick=()=>input.click();
        input.onchange=async()=>{
          const file=input.files?.[0]; if(!file) return;
          importButton.disabled=true; importStatus.textContent=text('Loading…');
          try {
            if(file.size>PACK_LIMITS.fileBytes) throw new Error('Portrait pack exceeds the 24 MB limit.');
            const row=await savePack(await file.text(),()=>token===generation);
            if(token!==generation) return;
            draftGender=row.gender; draft=row.id; group='local'; draw();
          } catch(error) { if(token===generation) importStatus.textContent=error.message; }
          finally { importButton.disabled=false; input.value=''; }
        };
        const resetButton=element('button','',text('Reset to default')); resetButton.type='button';
        resetButton.onclick=async()=>{
          resetButton.disabled=true;
          try { if(await reset(draftGender,()=>token===generation)) close(); }
          catch(error) { importStatus.textContent=error.message; resetButton.disabled=false; }
        };
        imports.append(importButton,input,resetButton,importStatus); dialog.append(imports);
        const rows = [...catalog.presets,...saved.values(),...local.values()].filter(row => row.group === group && row.gender === draftGender);
        if (!rows.some(row => row.id === draft)) draft = rows[0]?.id || '';
        const grid = element('div', 'appearance-grid'); grid.setAttribute('role','group'); grid.setAttribute('aria-label',text('Available looks'));
        const preview = element('div', 'appearance-preview');
        const footer = element('footer','appearance-footer');
        const apply = element('button','',text('Apply appearance')); apply.type='button'; apply.disabled=true;
        const cancel = element('button','',text('Cancel')); cancel.type='button'; cancel.onclick=close;
        const note = element('p','appearance-note',text('Appearance is saved separately for each gender.'));
        const edit=element('button','appearance-customize',text('Customize this look →'));edit.type='button';edit.hidden=!editable;edit.disabled=true;
        edit.onclick=async()=>{try{const seed=await customizationSeed(draftGender,draft);if(token!==generation)return;close();onCustomize(seed,{opener,chooseGender});}catch(error){note.textContent=error.message;}};
        async function select(row) {
          draft = row.id; apply.disabled = edit.disabled = true;
          for (const card of grid.children) if(card.dataset.presetId)card.setAttribute('aria-pressed', String(card.dataset.presetId === draft));
          preview.replaceChildren(element('p','',text('Loading…')));
          try {
            const data = await load(row.id);
            if (token !== generation || draft !== row.id) return;
            const full = element('img','appearance-full'); full.src = ReaderPublication.url(row.preview?url(row.preview):portrait(data,'normal').source); full.alt = row.displayName || text('Look {n}', {n:row.option});
            if(saved.has(row.id)){
              data.chooserPreview ||= chooserImage(portrait(data,'normal').source,512,768);
              data.chooserPreview.then(source=>{if(source&&token===generation&&draft===row.id)full.src=ReaderPublication.url(source);}).catch(()=>{});
            }
            const crop = element('div','appearance-crop');
            crop.append(element('span','',text('Dialogue preview')));
            const face = makePortrait(portrait(data,'normal'), 'Merlin', 'primary'); crop.append(face);
            preview.replaceChildren(full,crop); apply.disabled=false;edit.disabled=!!data.recipe&&!data.recipe.sourcePreset&&!data.recipe.avatarIds?.outfit;
            if(edit.disabled)note.textContent=text('This pack has no editable recipe. Create your own look instead.');
            if(saved.has(row.id)){
              const management=element('div','appearance-manage'),name=element('input','');name.value=row.displayName;name.maxLength=80;name.setAttribute('aria-label',text('Look name'));
              const renameButton=element('button','',text('Rename'));renameButton.type='button';renameButton.onclick=async()=>{try{await rename(row.id,name.value);if(token===generation)draw();}catch(error){note.textContent=error.message;}};
              const deleteButton=element('button','',text('Delete'));deleteButton.type='button';let confirmingDelete=false;deleteButton.onclick=async()=>{if(!confirmingDelete){confirmingDelete=true;deleteButton.textContent=text('Delete this look?');return;}deleteButton.disabled=true;try{await remove(row.id);if(token===generation)draw();}catch(error){note.textContent=error.message;deleteButton.disabled=false;}};
              management.append(name,renameButton,deleteButton);preview.append(management);
            }
          } catch (_) { if (token === generation) preview.replaceChildren(element('p','',text('Could not load appearance. Try again.'))); }
        }
        for (const row of rows) {
          const card = element('button','appearance-card'); card.type='button'; card.dataset.presetId=row.id;
          const image = element('img',''); image.alt=''; image.decoding='async';
          if(row.thumbnail)image.src=ReaderPublication.url(url(row.thumbnail));
          else load(row.id).then(data=>{if(token===generation)image.src=ReaderPublication.url(portrait(data,'normal').source);}).catch(()=>{});
          if(saved.has(row.id)&&row.thumbnailVersion!==2)thumbnail(row).then(source=>{if(source&&token===generation)image.src=ReaderPublication.url(source);}).catch(()=>{});
          card.append(image,element('span','',row.displayName || text('Look {n}',{n:row.option}))); card.onclick=()=>select(row); grid.append(card);
        }
        apply.onclick = () => {
          applyChoice(draftGender,draft); close(); onApply({gender:draftGender, chooseGender:true});
        };
        if(editable){const create=element('button','appearance-create',text('+ Create your own'));create.type='button';create.onclick=()=>{const g=draftGender;close();onCustomize({gender:g,recipe:{sourcePreset:`player_${g}_default1`}},{opener,chooseGender});};grid.append(create);}
        const body=element('div','appearance-body');body.append(grid,preview);
        footer.append(note,edit,cancel,apply); dialog.append(body,footer);
        if (rows.length) await select(rows.find(row => row.id === draft) || rows[0]);
      } catch (_) { status.textContent=text('Could not load appearance. Try again.'); }
    }
    function open(options = {}) {
      opener = options.opener || button; chooseGender = Boolean(options.chooseGender);
      draftGender = currentGender(); draft=selected(draftGender);
      // Show the cancellable loading state immediately, including on a cold cache.
      group = 'default'; dialog.showModal(); draw(true);
    }
    button.onclick = () => open();
    return {ensure, resolve, open, importPack, savePack, rename, remove, customizationSeed, customize, applyChoice, reset, get revision() { return revision; }, selected};
  }
  return {create, playerGender, portrait, portraitBounds, installPrompt, parsePack, materializePack, PACK_SCHEMA, PACK_LIMITS};
});

;
/* Native role-banner events, attached to the existing story traversal. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoryPerspectives=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const fields=['next','target','return_to','skip'];
  function edges(node){
    const result=fields.filter(k=>typeof node[k]==='string'&&node[k]).map(k=>[node,k]);
    for(const option of node.options||[])if(option.target)result.push([option,'target']);
    return result;
  }
  function install(graph,contexts,catalog){
    if(!graph||graph._perspectivesInstalled||!catalog?.transitions)return;
    graph._perspectivesInstalled=true;
    const nodes=graph.nodes,groups=new Map();
    const originals=new Map(contexts.map(c=>[c,Object.keys(c.graph.nodes||{})]));
    const originalRoots=new Map(contexts.map(c=>[c,[...(c.graph.roots||[])]]));
    const contextsFor=event=>contexts.filter(c=>String(c.story?.objective_key?.split(':')[0]||c.story?.exploration_line_id)===event.line);
    const idsFor=context=>originals.get(context).map(id=>nodes[`${context.assetKey}::${id}`]?`${context.assetKey}::${id}`:id).filter(id=>nodes[id]);
    for(const event of catalog.transitions){
      const scope=contextsFor(event);if(!scope.length)continue;
      const key=JSON.stringify([event.line,event.anchor]);
      if(!groups.has(key))groups.set(key,{event,scope,events:[]});
      groups.get(key).events.push(event);
    }
    let serial=0;
    function chain(events,next,asset){
      for(const event of [...events].reverse()){
        const id=`perspective:${event.id}:${serial++}`;
        nodes[id]={id,type:'asset_context',asset_key:asset||'',objective_key:'',
          metadata:{perspective:event},next};next=id;
      }
      return next;
    }
    for(const {event,scope,events} of groups.values()){
      const anchor=event.anchor;
      const context=anchor.asset&&scope.find(c=>c.assetKey===anchor.asset);
      const owned=new Set(context?idsFor(context):[]);
      if(anchor.objective){
        for(const c of scope)if(c.story?.objective_key===anchor.objective)for(const id of idsFor(c))owned.add(id);
        for(const [id,node] of Object.entries(nodes))if(!node.metadata?.perspective && (node.objective_key===anchor.objective
            || id.includes(`objective_interlude:${anchor.objective}`)))owned.add(id);
      }
      if(!owned.size)continue;
      if(anchor.position==='before'&&context){
        const roots=new Set(originalRoots.get(context).map(id=>nodes[`${context.assetKey}::${id}`]?`${context.assetKey}::${id}`:id));
        const entries=new Map([...roots].map(root=>[root,chain(events,root,context.assetKey)]));
        for(const node of Object.values(nodes))if(!node.metadata?.perspective)
          for(const [owner,key]of edges(node))if(roots.has(owner[key]))owner[key]=entries.get(owner[key]);
        graph.roots=graph.roots.map(id=>entries.get(id)||id);
      }else{
        for(const id of owned){
          const node=nodes[id];
          for(const [owner,key]of edges(node)){
            if(key==='skip'||owned.has(owner[key]))continue;
            owner[key]=chain(events,owner[key],context?.assetKey);
          }
          if(node.type==='end'&&!node.next)node.next=chain(events,'',context?.assetKey);
        }
      }
    }
    const first=contexts[0],line=String(first?.story?.objective_key?.split(':')[0]||first?.story?.exploration_line_id);
    const initial=catalog.asset_viewpoints?.find(row=>row.line===line&&row.asset===first?.assetKey);
    const states=new Map(),queue=(graph.roots||[]).map(id=>[id,catalog.vehicles?.[initial?.vehicle]?.model||'merlin']);
    for(let i=0;i<queue.length;i++){
      const [id,previous]=queue[i],node=nodes[id];if(!node)continue;
      if(node.metadata?.perspective){
        const incoming=node.metadata.perspectiveIncoming ||= [];
        if(!incoming.includes(previous))incoming.push(previous);
      }
      const model=node.metadata?.perspective?.model||previous;
      const seen=states.get(id)||new Set();if(seen.has(model))continue;seen.add(model);states.set(id,seen);
      for(const [owner,key]of edges(node))queue.push([owner[key],model]);
    }
    for(const [id,models]of states){nodes[id].reader_viewpoint_model=models.size===1?[...models][0]:'';nodes[id].reader_viewpoint_ambiguous=models.size>1;}
  }
  return {install};
});

;
// Shared interface text. Story text and native game localizations are never translated here.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderUI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const messages = {
  "First attempt": {"cn":"第一次治疗","jp":"1回目の治療","kr":"첫 번째 치료"},
  "Second attempt": {"cn":"第二次治疗","jp":"2回目の治療","kr":"두 번째 치료"},
  "Patient response": {"cn":"患者反应","jp":"患者の反応","kr":"환자의 반응"},
  "Healed": {"cn":"治愈","jp":"治癒","kr":"치료 성공"},
  "Failed": {"cn":"失败","jp":"失敗","kr":"치료 실패"},
  "No change": {"cn":"病情没有变化","jp":"症状に変化なし","kr":"증상 변화 없음"},
  "Choose a patient": {"cn":"选择患者","jp":"患者を選択","kr":"환자 선택"},
  "Event Stories": {"cn":"活动剧情","jp":"イベントストーリー","kr":"이벤트 스토리"},
  "World": {"cn": "世界", "jp": "ワールド", "kr": "월드"},
  "Fish": {
    "cn": "鱼类",
    "jp": "魚類",
    "kr": "어류"
  },
  "Enemies": {
    "cn": "敌人",
    "jp": "敵",
    "kr": "적군"
  },
  "Fish Archive": {
    "cn": "鱼类",
    "jp": "魚類",
    "kr": "어류",
    "en": "Fish"
  },
  "Enemy Archive": {
    "cn": "敌人",
    "jp": "敵",
    "kr": "적군",
    "en": "Enemies"
  },
  "Search fish": {
    "cn": "搜索鱼类",
    "jp": "魚類を検索",
    "kr": "어류 검색"
  },
  "Search enemies": {
    "cn": "搜索敌人",
    "jp": "敵を検索",
    "kr": "적군 검색"
  },
  "Discover the documents, creatures, and details that bring Esperia to life.": {"cn": "探索文献、生物与各种细节，感受鲜活的伊索米亚。", "jp": "文献や生き物、さまざまな記録を通じてエスペリアの世界を知る。", "kr": "문헌과 생물, 다양한 기록을 통해 에스페리아의 세계를 알아보세요."},
  "Glossary": {"jp": "用語集", "kr": "용어집", "cn": "词条"},
  "Search": {"jp": "検索", "kr": "검색", "cn": "搜索"},
  "The Esperia Archive": {"jp": "エスペリア・アーカイブ", "kr": "에스페리아 아카이브", "cn": "伊索米亚档案"},
  "Revisit the chapters and seasons of Esperia.": {"jp": "エスペリアの物語とシーズンをもう一度。", "kr": "에스페리아의 이야기와 시즌을 다시 만나보세요.", "cn": "重温伊索米亚的篇章与赛季。"},
  "Discover the places, people, and ideas behind the stories.": {"jp": "物語に登場する土地や人々、世界観を知る。", "kr": "이야기 속 장소와 인물, 세계관을 알아보세요.", "cn": "了解故事中的地点、人物与世界观。"},
  "Find a story or a term from the world of Esperia.": {"jp": "エスペリアの物語や用語を探す。", "kr": "에스페리아의 이야기와 용어를 찾아보세요.", "cn": "查找伊索米亚的故事与词条。"},
  "Explore the archive": {"jp": "アーカイブを探索", "kr": "아카이브 둘러보기", "cn": "浏览档案"},
  "Previous archive page": {"jp": "前のアーカイブページ", "kr": "이전 아카이브 페이지", "cn": "上一档案页"},
  "Next archive page": {"jp": "次のアーカイブページ", "kr": "다음 아카이브 페이지", "cn": "下一档案页"},
  "Archive pages": {"jp": "アーカイブのページ", "kr": "아카이브 페이지", "cn": "档案页面"},
  "Open": {"jp": "開く", "kr": "열기", "cn": "打开"},
  "Choose a chapter of Esperia.": {"jp": "読みたい物語を選んでください。", "kr": "읽고 싶은 에스페리아의 이야기를 선택하세요.", "cn": "选择想要阅读的伊索米亚篇章。"},
  "Season {number}": {"jp": "シーズン{number}", "kr": "시즌 {number}", "cn": "赛季 {number}"},
  "Read stories": {"jp": "物語を読む", "kr": "스토리 읽기", "cn": "阅读故事"},
  "Continue reading": {"jp": "続きから読む", "kr": "이어 읽기", "cn": "继续阅读"},
  "Last read: {title}": {"jp": "前回読んだ物語：{title}", "kr": "마지막으로 읽은 이야기: {title}", "cn": "上次阅读：{title}"},
  "Back to top": {"jp": "ページの先頭へ", "kr": "맨 위로", "cn": "回到顶部"},
  "Explore the world and lore of Esperia.": {"jp": "エスペリアの世界と伝承を知る。", "kr": "에스페리아의 세계와 이야기를 알아보세요.", "cn": "探索伊索米亚的世界与传说。"},
  "Search the glossary": {"jp": "用語集を検索", "kr": "용어집 검색", "cn": "搜索词条"},
  "Glossary terms": {"jp": "用語一覧", "kr": "용어 목록", "cn": "词条列表"},
  "All terms": {"jp": "用語一覧", "kr": "모든 용어", "cn": "全部词条"},
  "From the game's loading screens.": {"jp": "ゲームのロード画面より。", "kr": "게임 로딩 화면에서 발췌.", "cn": "摘自游戏加载画面。"},
  "Term not found": {"jp": "用語が見つかりません", "kr": "용어를 찾을 수 없습니다", "cn": "未找到词条"},
  "A world of stories": {"jp": "物語が紡ぐ世界", "kr": "이야기로 이루어진 세계", "cn": "故事中的世界"},
  "Choose a term to learn more about Esperia.": {"jp": "用語を選んで、エスペリアについて詳しく見てみましょう。", "kr": "용어를 선택해 에스페리아에 대해 알아보세요.", "cn": "选择一个词条，进一步了解伊索米亚。"},
  "{count} terms": {"jp": "{count}件の用語", "kr": "용어 {count}개", "cn": "{count}个词条"},
  "No matching terms.": {"jp": "一致する用語がありません。", "kr": "일치하는 용어가 없습니다.", "cn": "没有匹配的词条。"},
  "Find stories by title and search the glossary in any of the four languages.": {"jp": "4つの言語で、物語のタイトルや用語集を検索できます。", "kr": "네 가지 언어로 스토리 제목과 용어집을 검색할 수 있습니다.", "cn": "使用四种语言搜索故事标题和词条。"},
  "Search stories and glossary": {"jp": "物語・用語集を検索", "kr": "스토리와 용어집 검색", "cn": "搜索故事和词条"},
  "Enter a story title, place, or lore term.": {"jp": "物語のタイトル、地名、用語を入力してください。", "kr": "스토리 제목이나 장소, 용어를 입력하세요.", "cn": "输入故事标题、地名或词条。"},
  "{count} results": {"jp": "{count}件の検索結果", "kr": "검색 결과 {count}개", "cn": "{count}条结果"},
  "No matching stories or terms.": {"jp": "一致する物語や用語がありません。", "kr": "일치하는 스토리나 용어가 없습니다.", "cn": "没有匹配的故事或词条。"},
  "Show more": {"jp": "もっと見る", "kr": "더 보기", "cn": "显示更多"},
  "‹ All stories": {"jp": "‹ 物語一覧", "kr": "‹ 모든 스토리", "cn": "‹ 全部故事"},
  "Communicator": {"cn": "通讯器", "jp": "通信機", "kr": "통신기"},
  "Communicator · weak signal": {"cn": "通讯器 · 信号较弱", "jp": "通信機 · 電波が弱い", "kr": "통신기 · 신호 약함"},
  "Quest: {title}": {
    "cn": "任务：{title}",
    "jp": "ミッション：{title}",
    "kr": "퀘스트: {title}"
  },
  "This character or conversation address could not be found.": {"cn": "找不到此角色或对话地址。", "jp": "このキャラクターまたは会話のアドレスが見つかりません。", "kr": "이 캐릭터 또는 대화 주소를 찾을 수 없습니다."},
  "This character is not available in this reader's data release.": {"cn": "当前阅读器的数据版本尚未收录此角色。", "jp": "このキャラクターは現在のリーダーのデータには収録されていません。", "kr": "현재 리더의 데이터 버전에는 이 캐릭터가 포함되어 있지 않습니다."},
  "This conversation is not available for this character.": {"cn": "此角色没有这段对话。", "jp": "このキャラクターにはこの会話がありません。", "kr": "이 캐릭터에게는 해당 대화가 없습니다."},
  "This story address could not be found.": {"cn": "找不到此故事地址。", "jp": "このストーリーのアドレスが見つかりません。", "kr": "이 스토리 주소를 찾을 수 없습니다."},
  "This story is not available in this reader's data release.": {"cn": "当前阅读器的数据版本尚未收录此故事。", "jp": "このストーリーは現在のリーダーのデータには収録されていません。", "kr": "현재 리더의 데이터 버전에는 이 스토리가 포함되어 있지 않습니다."},
  "Feedback": {"cn": "反馈", "jp": "フィードバック", "kr": "피드백"},
  "Found a problem, a translation mistake, or something missing?": {"cn": "发现了问题、翻译错误或缺失内容？", "jp": "不具合や翻訳の間違い、掲載されていない内容に気づきましたか？", "kr": "오류나 번역 실수, 빠진 내용을 발견하셨나요?"},
  "Send feedback": {"cn": "发送反馈", "jp": "フィードバックを送る", "kr": "피드백 보내기"},
  "Home": {
    "cn": "首页",
    "jp": "ホーム",
    "kr": "홈"
  },
  "AFK Journey · Unofficial fan archive": {
    "cn": "剑与远征：启程 · 非官方同人档案",
    "jp": "AFK：ジャーニー · 非公式ファンアーカイブ",
    "kr": "AFK: 새로운 여정 · 비공식 팬 아카이브"
  },
  "Revisit the stories, characters, and lore of Esperia.": {
    "cn": "重温伊索米亚的故事、人物与世界。",
    "jp": "エスペリアの物語、キャラクター、世界観をもう一度。",
    "kr": "에스페리아의 이야기와 인물, 세계관을 다시 만나보세요."
  },
  "Browse stories": {
    "cn": "浏览故事",
    "jp": "ストーリーを読む",
    "kr": "스토리 둘러보기"
  },
  "Documents & Mail": {
    "cn": "文档与邮件",
    "jp": "文書・メール",
    "kr": "문서와 우편"
  },
  "Follow storylines, explore dialogue choices, and revisit your favorite scenes.": {
    "cn": "跟随故事，探索对话选项，重温你喜爱的场景。",
    "jp": "物語をたどり、会話の選択肢を読み比べ、お気に入りの場面を振り返りましょう。",
    "kr": "이야기를 따라가며 대화 선택지를 살펴보고, 좋아하는 장면을 다시 읽어보세요."
  },
  "Get to know Esperia's heroes through their profiles, conversations, and voices.": {
    "cn": "通过角色档案、对话和语音，了解伊索米亚的英雄们。",
    "jp": "プロフィールや会話、ボイスを通して、エスペリアの英雄たちを知ることができます。",
    "kr": "프로필과 대화, 음성을 통해 에스페리아의 영웅들을 알아보세요."
  },
  "Discover letters, journals, and the little details that fill out the world.": {
    "cn": "阅读信件与日记，发现让这个世界更加鲜活的小故事。",
    "jp": "手紙や日誌から、世界を彩る小さな物語を見つけましょう。",
    "kr": "편지와 일지 속에서 세계를 채우는 작은 이야기들을 발견해 보세요."
  },
  "An unofficial fan project. Game content belongs to its respective owners.": {
    "cn": "非官方同人项目。游戏内容的权利归各自权利人所有。",
    "jp": "非公式のファンプロジェクトです。ゲーム内素材の権利は各権利者に帰属します。",
    "kr": "비공식 팬 프로젝트입니다. 게임 콘텐츠의 권리는 각 권리자에게 있습니다."
  },
  "Along the route": {"cn":"途中","jp":"道中","kr":"이동 중"},
  "Battle dialogue": {"cn":"战斗对话","jp":"戦闘中の会話","kr":"전투 대화"},
  "Additional battle dialogue": {"cn":"其他战斗对话","jp":"追加の戦闘会話","kr":"추가 전투 대화"},
  "On arrival": {"cn":"抵达时","jp":"到着時","kr":"도착 시"},
  "While keeping up": {"cn":"跟上时的对话","jp":"ついて行く時の会話","kr":"따라가는 중 대화"},
  "If you fall behind": {"cn":"落后时的对话","jp":"遅れた時の会話","kr":"뒤처졌을 때 대화"},
  "Chapter artwork": {"cn":"篇章插画","jp":"チャプターイラスト","kr":"챕터 일러스트"},
  "Chapter opening": {"cn":"篇章开幕","jp":"チャプター開始","kr":"챕터 시작"},
  "Chapter ending": {"cn":"篇章落幕","jp":"チャプター終了","kr":"챕터 종료"},
  "Skip description": {
    "cn": "跳过剧情概述",
    "jp": "スキップ時のあらすじ",
    "kr": "스킵 줄거리"
  },
  "During the encounter": {
    "cn": "遭遇期间",
    "jp": "遭遇中の会話",
    "kr": "조우 중 대화"
  },
  "Shown if this point is reached while the encounter is active.": {
    "cn": "在遭遇仍在进行时到达此处，才会出现这段对话。",
    "jp": "遭遇が続いている間にこの時点に達すると表示されます。",
    "kr": "조우가 진행 중일 때 이 시점에 도달하면 표시됩니다."
  },
  "Story Archive": {
    "cn": "剧情档案",
    "jp": "ストーリーアーカイブ",
    "kr": "스토리 아카이브"
  },
  "Characters": {
    "cn": "角色",
    "jp": "キャラクター",
    "kr": "캐릭터"
  },
  "Documents": {
    "cn": "文献",
    "jp": "文書",
    "kr": "문서"
  },
  "Cosmetics": {"cn": "外观", "jp": "コスチューム", "kr": "코스튬"},
  "Theme": {"cn": "主题", "jp": "テーマ", "kr": "테마"},
  "Dark": {"cn": "深色", "jp": "ダーク", "kr": "다크"},
  "Light": {"cn": "浅色", "jp": "ライト", "kr": "라이트"},
  "System": {"cn": "跟随系统", "jp": "システム", "kr": "시스템"},
  "Settings": {
    "cn": "设置",
    "jp": "設定",
    "kr": "설정"
  },
  "Language": {
    "cn": "语言",
    "jp": "言語",
    "kr": "언어"
  },
  "Reading mode": {
    "cn": "阅读模式",
    "jp": "表示モード",
    "kr": "읽기 모드"
  },
  "Interactive": {
    "cn": "互动阅读",
    "jp": "インタラクティブ",
    "kr": "인터랙티브"
  },
  "Full Script": {
    "cn": "完整剧本",
    "jp": "全スクリプト",
    "kr": "전체 대본"
  },
  "Debug": {
    "cn": "调试",
    "jp": "デバッグ",
    "kr": "디버그"
  },
  "Section": {
    "cn": "篇章",
    "jp": "章",
    "kr": "장"
  },
  "Category": {
    "cn": "分类",
    "jp": "分類",
    "kr": "분류"
  },
  "Daily": {"cn":"日常","jp":"デイリー","kr":"일일"},
  "Story": {
    "cn": "剧情",
    "jp": "ストーリー",
    "kr": "스토리"
  },
  "Main Story": {
    "cn": "主线剧情",
    "jp": "メインストーリー",
    "kr": "메인 스토리"
  },
  "Side Stories": {
    "cn": "支线剧情",
    "jp": "サブストーリー",
    "kr": "서브 스토리"
  },
  "Reputation Quests": {
    "cn": "声望任务",
    "jp": "名声ミッション",
    "kr": "명성 퀘스트"
  },
  "Starry Tales": {
    "cn": "星夜逸闻",
    "jp": "星夜の逸話",
    "kr": "별밤의 이야기"
  },
  "Mini Stories": {"cn": "活动剧情", "jp": "イベントストーリー", "kr": "이벤트 스토리", "en": "Event Stories"},
  "Main Quest": {
    "cn": "主线任务",
    "jp": "メインミッション",
    "kr": "메인 퀘스트"
  },
  "Event/Env Story": {
    "cn": "场景剧情",
    "jp": "イベント・環境ストーリー",
    "kr": "이벤트·환경 스토리"
  },
  "Gameplay Story": {
    "cn": "玩法剧情",
    "jp": "コンテンツストーリー",
    "kr": "콘텐츠 스토리"
  },
  "Timeline Story": {
    "cn": "过场剧情",
    "jp": "ムービーストーリー",
    "kr": "컷신 스토리"
  },
  "Daily Quests": {
    "cn": "日常任务",
    "jp": "デイリーミッション",
    "kr": "일일 퀘스트"
  },
  "Exploration": {
    "cn": "探索",
    "jp": "探索",
    "kr": "탐험"
  },
  "Easter Eggs": {"cn": "彩蛋", "jp": "隠し要素", "kr": "이스터 에그"},
  "Stories": {
    "cn": "剧情",
    "jp": "ストーリー",
    "kr": "스토리"
  },
  "Special Events": {
    "cn": "特别活动",
    "jp": "特別イベント",
    "kr": "특별 이벤트"
  },
  "Starter Story": {
    "cn": "启程篇章",
    "jp": "旅立ちの章",
    "kr": "여정의 장"
  },
  "Song of Strife": {"cn": "残阳下的战歌", "jp": "黄昏の戦歌", "kr": "분쟁의 군가"},
  "Waves of Intrigue": {"cn": "锈锚港风云", "jp": "荒海に咲く薔薇", "kr": "음모의 파도"},
  "Chains of Eternity": {"cn": "冬夜残响", "jp": "冬夜の残響", "kr": "겨울밤의 메아리"},
  "Echoes of Dissent": {"cn": "渊火龙诗", "jp": "深焔の竜歌", "kr": "에세일의 노래"},
  "Thorns of Devotion": {"cn": "血月将至", "jp": "紅き月の刻", "kr": "붉은 달의 예언"},
  "Tower of Memory": {"cn": "光影迷局", "jp": "光影の迷宮", "kr": "가면 속 그림자"},
  "Crown of Ashes": {"cn": "王都终幕", "jp": "王都の終幕", "kr": "진실의 화살"},
  "Veil of Memories": {"cn": "彼岸月幕", "jp": "彼岸の月明り", "kr": "달빛의 장막"},
  "World Archive": {
    "cn": "世界档案",
    "jp": "ワールドアーカイブ",
    "kr": "월드 아카이브"
  },
  "Items": {
    "cn": "物品",
    "jp": "アイテム",
    "kr": "아이템"
  },
  "Mail": {
    "cn": "邮件",
    "jp": "メール",
    "kr": "우편"
  },
  "Document": {
    "cn": "文献",
    "jp": "文書",
    "kr": "문서"
  },
  "Item": {
    "cn": "物品",
    "jp": "アイテム",
    "kr": "아이템"
  },
  "Document Archive": {
    "cn": "文献档案",
    "jp": "文書アーカイブ",
    "kr": "문서 아카이브"
  },
  "Item Archive": {
    "cn": "物品档案",
    "jp": "アイテムアーカイブ",
    "kr": "아이템 아카이브"
  },
  "Mail Archive": {
    "cn": "邮件档案",
    "jp": "メールアーカイブ",
    "kr": "우편 아카이브"
  },
  "Search documents": {
    "cn": "搜索文献",
    "jp": "文書を検索",
    "kr": "문서 검색"
  },
  "Search items": {
    "cn": "搜索物品",
    "jp": "アイテムを検索",
    "kr": "아이템 검색"
  },
  "Search mail": {
    "cn": "搜索邮件",
    "jp": "メールを検索",
    "kr": "우편 검색"
  },
  "Search characters": {
    "cn": "搜索角色",
    "jp": "キャラクターを検索",
    "kr": "캐릭터 검색"
  },
  "Consumables": {
    "cn": "消耗品",
    "jp": "消耗品",
    "kr": "소모품"
  },
  "Materials": {
    "cn": "材料",
    "jp": "材料",
    "kr": "재료"
  },
  "Hero Development": {
    "cn": "英雄养成",
    "jp": "英雄育成",
    "kr": "영웅 육성"
  },
  "Homestead Products": {
    "cn": "家园产物",
    "jp": "ホームの生産品",
    "kr": "홈스테드 생산품"
  },
  "Homestead Materials": {
    "cn": "家园材料",
    "jp": "ホームの素材",
    "kr": "홈스테드 재료"
  },
  "Other": {
    "cn": "其他",
    "jp": "その他",
    "kr": "기타"
  },
  "All": {
    "cn": "全部",
    "jp": "全て",
    "kr": "전체"
  },
  "Collectible letters": {
    "cn": "可收藏信件",
    "jp": "収集できる手紙",
    "kr": "수집 편지"
  },
  "All mail": {
    "cn": "全部邮件",
    "jp": "すべてのメール",
    "kr": "전체 우편"
  },
  "Collectible letter": {
    "cn": "可收藏信件",
    "jp": "収集できる手紙",
    "kr": "수집 편지"
  },
  "No matching entries.": {
    "cn": "没有匹配的条目。",
    "jp": "該当する項目はありません。",
    "kr": "일치하는 항목이 없습니다."
  },
  "Select an entry to read it.": {
    "cn": "选择条目以阅读。",
    "jp": "項目を選択して読む。",
    "kr": "읽을 항목을 선택하세요."
  },
  "Item text": {
    "cn": "物品文本",
    "jp": "アイテムのテキスト",
    "kr": "아이템 텍스트"
  },
  "Related documents": {
    "cn": "相关文献",
    "jp": "関連文書",
    "kr": "관련 문서"
  },
  "The item icon has not been recovered.": {
    "cn": "尚未取得物品图标。",
    "jp": "アイテムのアイコンは未取得です。",
    "kr": "아이템 아이콘을 아직 확보하지 못했습니다."
  },
  "Character Files": {
    "cn": "角色档案",
    "jp": "キャラクターファイル",
    "kr": "캐릭터 자료"
  },
  "Character File": {
    "cn": "角色档案",
    "jp": "キャラクターファイル",
    "kr": "캐릭터 자료"
  },
  "Heroes": {
    "cn": "英雄",
    "jp": "英雄",
    "kr": "영웅"
  },
  "‹ All characters": {
    "cn": "‹ 全部角色",
    "jp": "‹ キャラクター一覧",
    "kr": "‹ 전체 캐릭터"
  },
  "‹ Character profile": {
    "cn": "‹ 角色档案",
    "jp": "‹ キャラクター詳細",
    "kr": "‹ 캐릭터 프로필"
  },
  "Lore": {
    "cn": "角色故事",
    "jp": "キャラクターの物語",
    "kr": "캐릭터 이야기"
  },
  "Skills & Stats": {
    "cn": "技能与属性",
    "jp": "スキル・ステータス",
    "kr": "스킬 및 속성"
  },
  "Interactions": {
    "cn": "互动",
    "jp": "交流",
    "kr": "상호작용"
  },
  "Unit Voice Lines": {
    "cn": "角色语音",
    "jp": "キャラクターボイス",
    "kr": "캐릭터 음성"
  },
  "Resonating Hall Idles": {
    "cn": "英雄厅堂闲聊",
    "jp": "英雄ホールのボイス",
    "kr": "영웅의 전당 대사"
  },
  "Affinity Gift Lines": {
    "cn": "赠礼语音",
    "jp": "プレゼントのボイス",
    "kr": "선물 대사"
  },
  "Mystical House Lines": {
    "cn": "神秘屋语音",
    "jp": "神秘屋のボイス",
    "kr": "미스테리 하우스 대사"
  },
  "Mystical House Idle Dialogue": {
    "cn": "神秘屋闲聊",
    "jp": "神秘屋の日常会話",
    "kr": "미스테리 하우스 일상 대화"
  },
  "Affinity Tales": {
    "cn": "信赖度故事",
    "jp": "信頼度の物語",
    "kr": "신뢰도 이야기"
  },
  "Skins": {
    "cn": "皮肤",
    "jp": "スキン",
    "kr": "스킨"
  },
  "Mystical House Interactions": {
    "cn": "神秘屋互动",
    "jp": "神秘屋の交流",
    "kr": "미스테리 하우스 상호작용"
  },
  "Profile": {
    "cn": "档案",
    "jp": "プロフィール",
    "kr": "프로필"
  },
  "Faction": {
    "cn": "阵营",
    "jp": "勢力",
    "kr": "진영"
  },
  "Class": {
    "cn": "职业",
    "jp": "職業",
    "kr": "직업"
  },
  "Tank": {
    "cn": "坦克",
    "jp": "タンク",
    "kr": "탱커"
  },
  "Warrior": {
    "cn": "战士",
    "jp": "ファイター",
    "kr": "전사"
  },
  "Mage": {
    "cn": "法师",
    "jp": "メイジ",
    "kr": "마법사"
  },
  "Support": {
    "cn": "辅助",
    "jp": "サポート",
    "kr": "서포터"
  },
  "Marksman": {
    "cn": "射手",
    "jp": "アーチャー",
    "kr": "사수"
  },
  "Rogue": {
    "cn": "游侠",
    "jp": "レンジャー",
    "kr": "레인저"
  },
  "Unknown": {
    "cn": "未知",
    "jp": "不明",
    "kr": "알 수 없음"
  },
  "Loading skills and stats…": {
    "cn": "正在加载技能与属性…",
    "jp": "スキルとステータスを読み込み中…",
    "kr": "스킬과 속성 불러오는 중…"
  },
  "Character skills could not be loaded. Please try again.": {
    "cn": "无法加载角色技能，请重试。",
    "jp": "スキルを読み込めませんでした。もう一度お試しください。",
    "kr": "스킬을 불러오지 못했습니다. 다시 시도하세요."
  },
  "Verified combat data has not been recovered for this character yet.": {
    "cn": "尚未取得此角色的已验证战斗数据。",
    "jp": "このキャラクターの検証済み戦闘データは未取得です。",
    "kr": "이 캐릭터의 검증된 전투 데이터를 아직 확보하지 못했습니다."
  },
  "Combat profile": {
    "cn": "战斗档案",
    "jp": "戦闘プロフィール",
    "kr": "전투 프로필"
  },
  "Base config coefficients": {
    "cn": "基础配置系数",
    "jp": "基礎設定の係数",
    "kr": "기본 설정 계수"
  },
  "Base stats": {
    "en": "Basic Stats",
    "cn": "基础属性",
    "jp": "基本ステータス",
    "kr": "기본 속성"
  },
  "Exact config rows; naked hero": {
    "cn": "原始配置数据；无装备英雄",
    "jp": "設定値に基づく装備なしの英雄",
    "kr": "원본 설정 기준 · 장비 미착용 영웅"
  },
  "Skills": {
    "cn": "技能",
    "jp": "スキル",
    "kr": "스킬"
  },
  "Ultimate": {
    "cn": "终极技能",
    "jp": "必殺技",
    "kr": "궁극기"
  },
  "Skill": {
    "cn": "技能",
    "jp": "スキル",
    "kr": "스킬"
  },
  "Exclusive Skill": {
    "cn": "专属技能",
    "jp": "専用スキル",
    "kr": "전용 스킬"
  },
  "Awakening": {
    "cn": "觉醒",
    "jp": "覚醒",
    "kr": "각성"
  },
  "Hero Focus": {
    "cn": "英雄专精",
    "jp": "天賦の才",
    "kr": "영웅 마스터리"
  },
  "Basic Attack": {
    "en": "Normal Attack",
    "cn": "普通攻击",
    "jp": "通常攻撃",
    "kr": "일반 공격"
  },
  "Exclusive unlock": {
    "cn": "解锁专属技能",
    "jp": "専用スキル解放",
    "kr": "전용 스킬 해제"
  },
  "Exclusive Equipment": {
    "cn": "专属装备",
    "jp": "専用装備",
    "kr": "전용 장비"
  },
  "Signature equipment": {
    "en": "Exclusive Equipment",
    "cn": "专属装备",
    "jp": "専用装備",
    "kr": "전용 장비"
  },
  "Equipment level": {
    "cn": "装备等级",
    "jp": "装備レベル",
    "kr": "장비 레벨"
  },
  "Progression": {
    "cn": "成长阶段",
    "jp": "成長段階",
    "kr": "성장 단계"
  },
  "Hero level": {
    "cn": "英雄等级",
    "jp": "英雄レベル",
    "kr": "영웅 레벨"
  },
  "Quality": {
    "cn": "品质",
    "jp": "ランク",
    "kr": "등급"
  },
  "Level slider": {
    "cn": "等级滑块",
    "jp": "レベルスライダー",
    "kr": "레벨 슬라이더"
  },
  "Proficiency": {
    "cn": "熟练度",
    "jp": "熟練度",
    "kr": "숙련도"
  },
  "HP": {
    "cn": "生命值",
    "jp": "HP",
    "kr": "HP"
  },
  "ATK": {
    "cn": "攻击力",
    "jp": "攻撃力",
    "kr": "공격력"
  },
  "Physical DEF": {
    "en": "Phys DEF",
    "cn": "护甲",
    "jp": "物理防御",
    "kr": "물리 방어력"
  },
  "Magic DEF": {
    "cn": "魔抗",
    "jp": "魔法防御",
    "kr": "마법 방어력"
  },
  "Vitality": {
    "cn": "受愈",
    "jp": "治癒",
    "kr": "활력"
  },
  "Healing": {
    "cn": "治愈",
    "jp": "治療",
    "kr": "치료"
  },
  "Attack Speed": {
    "en": "ATK SPD",
    "cn": "攻击速度",
    "jp": "攻撃速度",
    "kr": "공격 속도"
  },
  "Life Drain": {
    "cn": "生命汲取",
    "jp": "ライフスティール",
    "kr": "생명 흡수"
  },
  "Crit": {
    "cn": "暴击",
    "jp": "クリティカル",
    "kr": "치명타"
  },
  "Crit Resist": {
    "cn": "抗暴击",
    "jp": "クリティカル抵抗",
    "kr": "치명타 저항"
  },
  "Haste": {
    "cn": "急速",
    "jp": "速度",
    "kr": "급속"
  },
  "Block": {
    "cn": "格挡",
    "jp": "ブロック",
    "kr": "막기"
  },
  "Penetration": {
    "cn": "穿透",
    "jp": "貫通",
    "kr": "관통"
  },
  "Max Quality": {
    "cn": "最高品质",
    "jp": "最高ランク",
    "kr": "최고 등급"
  },
  "Damage Type": {
    "cn": "伤害类型",
    "jp": "ダメージタイプ",
    "kr": "대미지 유형"
  },
  "Range": {
    "cn": "射程",
    "jp": "射程",
    "kr": "사정거리"
  },
  "Melee": {
    "cn": "近战",
    "jp": "近接",
    "kr": "근접"
  },
  "Ranged": {
    "cn": "远程",
    "jp": "遠距離",
    "kr": "원거리"
  },
  "Physical": {
    "cn": "物理",
    "jp": "物理",
    "kr": "물리"
  },
  "Magic": {
    "cn": "魔法",
    "jp": "魔法",
    "kr": "마법"
  },
  "Default Outfit": {
    "cn": "默认外观",
    "jp": "初期衣装",
    "kr": "기본 의상"
  },
  "Skin": {
    "cn": "皮肤",
    "jp": "スキン",
    "kr": "스킨"
  },
  "Unnamed Outfit": {
    "cn": "未命名外观",
    "jp": "名称未設定の衣装",
    "kr": "이름 없는 의상"
  },
  "Artwork unavailable": {
    "cn": "暂无立绘",
    "jp": "イラスト未取得",
    "kr": "일러스트 없음"
  },
  "Voice": {
    "cn": "语音",
    "jp": "ボイス",
    "kr": "음성"
  },
  "Idle": {
    "cn": "闲聊",
    "jp": "待機ボイス",
    "kr": "대기 대사"
  },
  "Gift": {
    "cn": "赠礼",
    "jp": "プレゼント",
    "kr": "선물"
  },
  "[Official caption unavailable]": {
    "cn": "[暂无官方字幕]",
    "jp": "[公式字幕なし]",
    "kr": "[공식 자막 없음]"
  },
  "Play voice": {
    "cn": "播放语音",
    "jp": "ボイスを再生",
    "kr": "음성 재생"
  },
  "Machine translation": {
    "cn": "机器翻译",
    "jp": "機械翻訳",
    "kr": "기계 번역"
  },
  "Community translation": {
    "cn": "社区翻译",
    "jp": "コミュニティ翻訳",
    "kr": "커뮤니티 번역"
  },
  "Chinese title fallback": {
    "cn": "暂无本地化标题，显示中文",
    "jp": "翻訳未収録のため中国語タイトルを表示",
    "kr": "번역이 없어 중국어 제목을 표시합니다"
  },
  "Fallback text": {
    "cn": "备用文本",
    "jp": "代替テキスト",
    "kr": "대체 텍스트"
  },
  "Saved AI-generated translation. Official localization is unavailable.": {
    "cn": "已保存的AI翻译，暂无官方本地化文本。",
    "jp": "保存済みのAI翻訳です。公式翻訳は未収録です。",
    "kr": "저장된 AI 번역입니다. 공식 번역이 없습니다."
  },
  "This story contains machine-translated dialogue.": {
    "cn": "本段剧情包含机器翻译对话。",
    "jp": "このストーリーには機械翻訳の会話が含まれます。",
    "kr": "이 스토리에는 기계 번역된 대사가 포함되어 있습니다."
  },
  "Continue": {
    "cn": "继续",
    "jp": "続ける",
    "kr": "계속"
  },
  "Undo last choice": {
    "cn": "撤销上次选择",
    "jp": "直前の選択を戻す",
    "kr": "마지막 선택 취소"
  },
  "Restart story": {
    "cn": "重新开始剧情",
    "jp": "ストーリーを最初から読む",
    "kr": "스토리 다시 시작"
  },
  "Copy link to current node": {
    "cn": "复制当前位置链接",
    "jp": "現在位置のリンクをコピー",
    "kr": "현재 위치 링크 복사"
  },
  "Copied": {
    "cn": "已复制",
    "jp": "コピーしました",
    "kr": "복사됨"
  },
  "‹ Previous story": {
    "cn": "‹ 上一段剧情",
    "jp": "‹ 前のストーリー",
    "kr": "‹ 이전 스토리"
  },
  "Next story ›": {
    "cn": "下一段剧情 ›",
    "jp": "次のストーリー ›",
    "kr": "다음 스토리 ›"
  },
  "Show machine translation": {
    "cn": "显示机器翻译",
    "jp": "機械翻訳を表示",
    "kr": "기계 번역 표시"
  },
  "Show debug information": {
    "cn": "显示调试信息",
    "jp": "デバッグ情報を表示",
    "kr": "디버그 정보 표시"
  },
  "Font size": {
    "cn": "字号",
    "jp": "文字サイズ",
    "kr": "글자 크기"
  },
  "Player name": {
    "cn": "玩家名称",
    "jp": "プレイヤー名",
    "kr": "플레이어 이름"
  },
  "Player gender": {
    "cn": "玩家性别",
    "jp": "プレイヤーの性別",
    "kr": "플레이어 성별"
  },
  "Male": {
    "cn": "男性",
    "jp": "男性",
    "kr": "남성"
  },
  "Female": {
    "cn": "女性",
    "jp": "女性",
    "kr": "여성"
  },
  "Show both": {
    "cn": "全部显示",
    "jp": "両方表示",
    "kr": "모두 표시"
  },
  "In this story": {
    "cn": "本段剧情",
    "jp": "このストーリー",
    "kr": "이 스토리"
  },
  "Reader sections": {
    "cn": "阅读栏目",
    "jp": "閲覧セクション",
    "kr": "읽기 섹션"
  },
  "Story navigation": {
    "cn": "剧情导航",
    "jp": "ストーリーナビゲーション",
    "kr": "스토리 탐색"
  },
  "Archive type": {
    "cn": "档案类型",
    "jp": "アーカイブの種類",
    "kr": "아카이브 종류"
  },
  "Item category": {
    "cn": "物品分类",
    "jp": "アイテムカテゴリ",
    "kr": "아이템 분류"
  },
  "Mail collection": {
    "cn": "信件收藏",
    "jp": "手紙のコレクション",
    "kr": "우편 모음"
  },
  "Archive entries": {
    "cn": "档案条目",
    "jp": "アーカイブ項目",
    "kr": "아카이브 항목"
  },
  "Character sections": {
    "cn": "角色栏目",
    "jp": "キャラクターの項目",
    "kr": "캐릭터 섹션"
  },
  "Story outline": {
    "cn": "剧情目录",
    "jp": "ストーリー目次",
    "kr": "스토리 목차"
  },
  "Story metadata": {
    "cn": "剧情信息",
    "jp": "ストーリー情報",
    "kr": "스토리 정보"
  },
  "Sources": {
    "cn": "来源",
    "jp": "出典",
    "kr": "출처"
  },
  "Close full portrait": {
    "cn": "关闭立绘",
    "jp": "立ち絵を閉じる",
    "kr": "일러스트 닫기"
  },
  "Narration": {
    "cn": "旁白",
    "jp": "ナレーション",
    "kr": "나레이션"
  },
  "Black screen text": {
    "cn": "黑屏文字",
    "jp": "暗転中のテキスト",
    "kr": "암전 텍스트"
  },
  "Other on-screen cast": {
    "cn": "其他在场角色",
    "jp": "画面内の他の登場人物",
    "kr": "화면의 다른 등장인물"
  },
  "Cinematic": {
    "cn": "过场动画",
    "jp": "ムービー",
    "kr": "컷신"
  },
  "Cinematic scene": {
    "cn": "过场场景",
    "jp": "ムービーシーン",
    "kr": "컷신 장면"
  },
  "Picture": {
    "cn": "图片",
    "jp": "画像",
    "kr": "그림"
  },
  "These objectives can be completed in either order.": {
    "cn": "这些目标可以按任意顺序完成。",
    "jp": "これらの目標は好きな順序で達成できます。",
    "kr": "이 목표는 순서와 관계없이 완료할 수 있습니다."
  },
  "These fishing spots can be visited in either order.": {
    "cn": "这些钓点可以按任意顺序前往。",
    "jp": "これらの釣り場は好きな順序で訪れることができます。",
    "kr": "이 낚시터는 순서와 관계없이 방문할 수 있습니다."
  },
  "Inspection points": {
    "cn": "调查点",
    "jp": "調査ポイント",
    "kr": "조사 지점"
  },
  "Inspection": {
    "cn": "调查",
    "jp": "調査",
    "kr": "조사"
  },
  "Inspection complete": {
    "cn": "调查完成",
    "jp": "調査完了",
    "kr": "조사 완료"
  },
  "Continue story": {
    "cn": "继续剧情",
    "jp": "ストーリーを続ける",
    "kr": "스토리 계속"
  },
  "Conclusion": {
    "cn": "结论",
    "jp": "結論",
    "kr": "결론"
  },
  "More enemy lineups": {
    "cn": "更多敌方阵容",
    "jp": "他の敵編成",
    "kr": "다른 적 편성"
  },
  "Enemies": {
    "cn": "敌人",
    "jp": "敵",
    "kr": "적군"
  },
  "Available after viewing the other options": {
    "cn": "查看其他选项后解锁",
    "jp": "他の選択肢を見た後に解放",
    "kr": "다른 선택지를 확인하면 해제됩니다"
  },
  "This choice affects later stories. Changing it recalculates the storyline.": {
    "cn": "此选择会影响后续剧情，修改后将重新计算剧情路线。",
    "jp": "この選択は後のストーリーに影響します。変更するとルートが再計算されます。",
    "kr": "이 선택은 이후 스토리에 영향을 줍니다. 변경하면 이야기를 다시 계산합니다."
  },
  "Close result": {
    "cn": "关闭结果",
    "jp": "結果を閉じる",
    "kr": "결과 닫기"
  },
  "View result": {
    "cn": "查看结果",
    "jp": "結果を見る",
    "kr": "결과 보기"
  },
  "Change catch": {
    "cn": "更改渔获",
    "jp": "釣果を変更",
    "kr": "낚시 결과 변경"
  },
  "Fishing results": {
    "cn": "钓鱼结果",
    "jp": "釣りの結果",
    "kr": "낚시 결과"
  },
  "Fishing completed": {
    "cn": "钓鱼完成",
    "jp": "釣り完了",
    "kr": "낚시 완료"
  },
  "Possible catch": {
    "cn": "可能的渔获",
    "jp": "釣れる可能性のある魚",
    "kr": "가능한 낚시 결과"
  },
  "Fish caught": {
    "cn": "钓到鱼了",
    "jp": "魚を釣った",
    "kr": "물고기 획득"
  },
  "Fish": {
    "cn": "鱼类",
    "jp": "魚類",
    "kr": "어류"
  },
  "Alchemy complete": {
    "cn": "炼金完成",
    "jp": "錬金完了",
    "kr": "연금 완료"
  },
  "Medicine prepared": {
    "cn": "药品调配完成",
    "jp": "薬の調合完了",
    "kr": "약 조제 완료"
  },
  "Item obtained": {
    "cn": "获得物品",
    "jp": "アイテム獲得",
    "kr": "아이템 획득"
  },
  "Activity": {
    "cn": "活动",
    "jp": "アクティビティ",
    "kr": "활동"
  },
  "Clues": {
    "cn": "线索",
    "jp": "手がかり",
    "kr": "단서"
  },
  "Connect clues to continue the story.": {
    "cn": "关联线索以继续剧情。",
    "jp": "手がかりを組み合わせてストーリーを進めてください。",
    "kr": "단서를 조합해 스토리를 진행하세요."
  },
  "Default combination — change it to view a different order.": {
    "cn": "当前为默认组合，修改后可查看其他顺序。",
    "jp": "初期の組み合わせです。変更すると別の順序を確認できます。",
    "kr": "기본 조합입니다. 변경하면 다른 순서를 볼 수 있습니다."
  },
  "Choose treatment outcome": {
    "cn": "选择治疗结果",
    "jp": "治療の結果を選ぶ",
    "kr": "치료 결과 선택"
  },
  "Change combination": {
    "cn": "更改组合",
    "jp": "組み合わせを変更",
    "kr": "조합 변경"
  },
  "Connect clues": {
    "cn": "关联线索",
    "jp": "手がかりを組み合わせる",
    "kr": "단서 조합"
  },
  "Choose outcome": {
    "cn": "选择结果",
    "jp": "結果を選ぶ",
    "kr": "결과 선택"
  },
  "Switch a choice to view a different storyline. Later content will be recalculated.": {
    "cn": "切换选择以查看其他剧情路线，后续内容将重新计算。",
    "jp": "選択を切り替えると別のルートを確認できます。以降の内容は再計算されます。",
    "kr": "선택을 바꾸면 다른 이야기를 볼 수 있습니다. 이후 내용은 다시 계산됩니다."
  },
  "Assumed · skipped earlier choice": {
    "cn": "推定选择 · 跳过了此前选择",
    "jp": "仮の選択 · 以前の選択をスキップ",
    "kr": "가정한 선택 · 이전 선택 건너뜀"
  },
  "Your saved choice": {
    "cn": "已保存的选择",
    "jp": "保存した選択",
    "kr": "저장된 선택"
  },
  "Use this choice": {
    "cn": "使用此选择",
    "jp": "この選択を使う",
    "kr": "이 선택 적용"
  },
  "Confirm earlier progress to unlock its continuations. Completion is saved only when you confirm it here.": {
    "cn": "确认此前进度以解锁后续剧情。仅在此处确认后才保存完成状态。",
    "jp": "以前の進行状況を確認すると続きが解放されます。ここで確認したときのみ完了状態が保存されます。",
    "kr": "이전 진행 상황을 확인하면 후속 스토리가 해제됩니다. 여기서 확인해야 완료 상태가 저장됩니다."
  },
  "Earlier story": {
    "cn": "此前剧情",
    "jp": "以前のストーリー",
    "kr": "이전 스토리"
  },
  "Save progress": {
    "cn": "保存进度",
    "jp": "進行状況を保存",
    "kr": "진행 상황 저장"
  },
  "Export story state": {
    "cn": "导出剧情状态",
    "jp": "ストーリーの状態をエクスポート",
    "kr": "스토리 상태 내보내기"
  },
  "Browser storage is unavailable. Choices will last for this visit only.": {
    "cn": "浏览器存储不可用，选择仅在本次访问期间保留。",
    "jp": "ブラウザーの保存機能を利用できません。選択は今回の閲覧中のみ保持されます。",
    "kr": "브라우저 저장소를 사용할 수 없습니다. 이번 방문 중에만 선택이 유지됩니다."
  },
  "Inspect remaining points": {
    "cn": "调查剩余地点",
    "jp": "残りのポイントを調べる",
    "kr": "남은 지점 조사"
  },
  "Reveal to next choice": {
    "cn": "显示至下个选择",
    "jp": "次の選択肢まで表示",
    "kr": "다음 선택지까지 표시"
  },
  "Next story beat": {
    "cn": "下一段剧情",
    "jp": "次のストーリーへ",
    "kr": "다음 스토리 구간"
  },
  "End": {
    "cn": "结束",
    "jp": "終了",
    "kr": "끝"
  },
  "Choose an option": {
    "cn": "请选择",
    "jp": "選択してください",
    "kr": "선택하세요"
  },
  "Undo inspection": {
    "cn": "撤销调查",
    "jp": "調査を戻す",
    "kr": "조사 취소"
  },
  "Loading...": {
    "cn": "正在加载…",
    "jp": "読み込み中…",
    "kr": "불러오는 중…"
  },
  "Loading story": {
    "cn": "正在加载剧情",
    "jp": "ストーリーを読み込み中",
    "kr": "스토리 불러오는 중"
  },
  "{n} characters": {
    "cn": "{n}位角色",
    "jp": "{n}人のキャラクター",
    "kr": "캐릭터 {n}명"
  },
  "{n} of {total} documents": {
    "cn": "文献 {n} / {total}",
    "jp": "文書 {n} / {total}件",
    "kr": "문서 {n} / {total}개"
  },
  "{n} of {total} collectible letters": {
    "cn": "收藏信件 {n} / {total}",
    "jp": "収集できる手紙 {n} / {total}通",
    "kr": "수집 편지 {n} / {total}개"
  },
  "{n} of {total} mail templates": {
    "cn": "邮件模板 {n} / {total}",
    "jp": "メールテンプレート {n} / {total}件",
    "kr": "우편 양식 {n} / {total}개"
  },
  "{n} of {total} entries | {items} items | {images} images": {
    "cn": "条目 {n} / {total} | 物品 {items} | 图片 {images}",
    "jp": "項目 {n} / {total}件 | アイテム {items}件 | 画像 {images}枚",
    "kr": "항목 {n} / {total}개 | 아이템 {items}개 | 이미지 {images}개"
  },
  "{n} displayed entries": {
    "cn": "显示{n}个条目",
    "jp": "{n}件の項目を表示",
    "kr": "항목 {n}개 표시"
  },
  "Availability: {text}": {
    "cn": "获取方式：{text}",
    "jp": "入手方法：{text}",
    "kr": "획득 방법: {text}"
  },
  "Story {n}": {
    "cn": "剧情 {n}",
    "jp": "ストーリー {n}",
    "kr": "스토리 {n}"
  },
  "Chapter {n}": {
    "cn": "章节 {n}",
    "jp": "チャプター {n}",
    "kr": "챕터 {n}"
  },
  "Level {n}": {
    "cn": "等级 {n}",
    "jp": "レベル {n}",
    "kr": "레벨 {n}"
  },
  "Tier {n}": {
    "cn": "品阶 {n}",
    "jp": "ランク {n}",
    "kr": "등급 {n}"
  },
  "Awakening {n}": {
    "cn": "觉醒 {n}",
    "jp": "覚醒 {n}",
    "kr": "각성 {n}"
  },
  "Exclusive +{n}": {
    "cn": "专属 +{n}",
    "jp": "専用 +{n}",
    "kr": "전용 +{n}"
  },
  "Focus +{n}": {
    "cn": "专精 +{n}",
    "jp": "天賦の才 +{n}",
    "kr": "마스터리 +{n}"
  },
  "Refinement {n}": {
    "cn": "精炼{n}级",
    "jp": "精錬Lv.{n}",
    "kr": "제련 {n}레벨"
  },
  "Cooldown {n}s": {
    "cn": "冷却 {n}秒",
    "jp": "CD {n}秒",
    "kr": "쿨타임 {n}초"
  },
  "Energy {n}": {
    "cn": "能量 {n}",
    "jp": "SP {n}",
    "kr": "에너지 {n}"
  },
  "{n} upgrades": {
    "cn": "{n}次升级",
    "jp": "{n}段階の強化",
    "kr": "강화 {n}단계"
  },
  "{n} recovered": {
    "cn": "已取得{n}项",
    "jp": "{n}件取得済み",
    "kr": "{n}개 확보"
  },
  "Play {label}": {
    "cn": "播放{label}",
    "jp": "{label}を再生",
    "kr": "{label} 재생"
  },
  "Pause {label}": {
    "cn": "暂停{label}",
    "jp": "{label}を一時停止",
    "kr": "{label} 일시정지"
  },
  "View full pose for {name}": {
    "cn": "查看{name}的完整立绘",
    "jp": "{name}の立ち絵全体を表示",
    "kr": "{name} 전체 일러스트 보기"
  },
  "Point {n}": {
    "cn": "地点 {n}",
    "jp": "ポイント {n}",
    "kr": "지점 {n}"
  },
  "Read Point {n}": {
    "cn": "阅读地点 {n}",
    "jp": "ポイント {n}を読む",
    "kr": "지점 {n} 읽기"
  },
  "Inspect Point {n}": {
    "cn": "调查地点 {n}",
    "jp": "ポイント {n}を調べる",
    "kr": "지점 {n} 조사"
  },
  "Replay Point {n}": {
    "cn": "重看地点 {n}",
    "jp": "ポイント {n}をもう一度見る",
    "kr": "지점 {n} 다시 보기"
  },
  "All {n} points shown below": {
    "cn": "全部{n}个地点见下方",
    "jp": "全{n}ポイントを以下に表示",
    "kr": "지점 {n}개가 아래에 표시됩니다"
  },
  "All {n} points read": {
    "cn": "已阅读全部{n}个地点",
    "jp": "全{n}ポイントを確認済み",
    "kr": "지점 {n}개 확인 완료"
  },
  "{n} of {total} points read · Choose any point": {
    "cn": "已阅读{n}/{total}个地点 · 可任选地点",
    "jp": "{total}ポイント中{n}確認済み · 好きなポイントを選択",
    "kr": "{total}개 중 {n}개 확인 · 지점을 자유롭게 선택하세요"
  },
  "Story progress · {n} saved choices": {
    "cn": "剧情进度 · 已保存{n}个选择",
    "jp": "進行状況 · {n}件の選択を保存済み",
    "kr": "스토리 진행 · 선택 {n}개 저장됨"
  },
  "Story choices · {n} saved": {
    "cn": "剧情选择 · 已保存{n}项",
    "jp": "ストーリーの選択 · {n}件保存済み",
    "kr": "스토리 선택 · {n}개 저장됨"
  },
  "Saved choice {n}": {
    "cn": "已保存的选择 {n}",
    "jp": "保存した選択 {n}",
    "kr": "저장된 선택 {n}"
  },
  "Could not open mail: {error}": {
    "cn": "无法打开邮件：{error}",
    "jp": "メールを開けませんでした：{error}",
    "kr": "우편을 열지 못했습니다: {error}"
  },
  "Could not load this content: {error}": {
    "cn": "无法加载此内容：{error}",
    "jp": "このコンテンツを読み込めませんでした：{error}",
    "kr": "콘텐츠를 불러오지 못했습니다: {error}"
  },
  "Attack style": {
    "cn": "攻击方式",
    "jp": "攻撃スタイル",
    "kr": "공격 방식"
  },
  "Damage": {
    "cn": "伤害类型",
    "jp": "ダメージ",
    "kr": "대미지 유형"
  },
  "Growth": {
    "cn": "成长",
    "jp": "成長",
    "kr": "성장"
  },
  "Max quality tier": {
    "en": "Max Tier",
    "cn": "最高品阶",
    "jp": "最高ランク",
    "kr": "최고 등급"
  },
  "Starting energy": {
    "en": "Initial Energy",
    "cn": "初始能量",
    "jp": "初期SP",
    "kr": "초기 에너지"
  },
  "Standard progression": {
    "cn": "常规成长",
    "jp": "通常の成長",
    "kr": "일반 성장"
  },
  "Episode progression": {
    "cn": "赛季成长",
    "jp": "シーズンの成長",
    "kr": "시즌 성장"
  },
  "The calculator reconstructs naked config stats at exact table-backed levels. It deliberately excludes equipment, charms, mastery, artifacts, mode normalization, and account bonuses, so roster-panel totals can differ.": {
    "cn": "计算器根据配置表中的精确等级还原无装备属性，不计入装备、魔法饰品、专精、神器、模式平衡与账号加成，因此可能与游戏内英雄面板不同。",
    "jp": "設定表に記録されたレベルごとの装備なしの値を計算します。装備、魔法のチャーム、熟練度、アーティファクト、モード補正、アカウントのボーナスを含まないため、ゲーム内の表示値とは異なる場合があります。",
    "kr": "설정표의 정확한 레벨별 장비 미착용 속성을 계산합니다. 장비, 마법 부적, 숙련도, 아티팩트, 모드 보정, 계정 보너스는 포함하지 않아 게임 내 영웅 화면의 수치와 다를 수 있습니다."
  },
  "Values are cumulative at the selected equipment level. *_PR fields are rendered as percentage-point bonuses from their field convention; secondary attributes are config points.": {
    "cn": "数值为所选装备等级的累计加成。*_PR字段按字段约定显示为百分比加成，次要属性为配置点数。",
    "jp": "選択した装備レベルの累積ボーナスです。*_PR項目はフィールドの規則に従ってパーセント加算として表示し、その他の属性は設定上のポイントで表示します。",
    "kr": "선택한 장비 레벨의 누적 보너스입니다. *_PR 필드는 필드 규칙에 따라 퍼센트 포인트 보너스로, 보조 속성은 설정 포인트로 표시합니다."
  },
  "Change outcome": {
    "cn": "更改结果",
    "jp": "結果を変更",
    "kr": "결과 변경"
  },
  "Medicine is prepared here.": {
    "cn": "在此处调配药品。",
    "jp": "ここで薬を調合します。",
    "kr": "여기서 약을 조제합니다."
  },
  "Prepare medicine and treat the patient here. Choose the treatment outcome to continue the story.": {
    "cn": "在此处调配药品并治疗患者。选择治疗结果以继续剧情。",
    "jp": "ここで薬を調合し、患者を治療します。治療の結果を選ぶとストーリーが進みます。",
    "kr": "여기서 약을 조제하고 환자를 치료합니다. 치료 결과를 선택하면 스토리가 진행됩니다."
  },
  "This activity takes place here. Select an outcome to continue the story.": {
    "cn": "在此处进行活动。选择结果以继续剧情。",
    "jp": "ここでアクティビティが行われます。結果を選ぶとストーリーが進みます。",
    "kr": "여기서 활동이 진행됩니다. 결과를 선택하면 스토리가 진행됩니다."
  },
  "Default outcome — change it to view another route.": {
    "cn": "当前为默认结果，修改后可查看其他路线。",
    "jp": "初期の結果です。変更すると別のルートを確認できます。",
    "kr": "기본 결과입니다. 변경하면 다른 경로를 볼 수 있습니다."
  },
  "Assumed first available option — you can change it.": {
    "cn": "当前推定为第一个可用选项，可进行修改。",
    "jp": "最初に選べる選択肢を仮に使用しています。変更できます。",
    "kr": "첫 번째 가능한 선택지를 임시로 적용했습니다. 변경할 수 있습니다."
  },
  "Your choice is saved for later stories.": {
    "cn": "此选择已保存，将用于后续剧情。",
    "jp": "この選択は後のストーリー用に保存されました。",
    "kr": "이후 스토리를 위해 선택이 저장되었습니다."
  },
  "This continuation needs additional story state.": {
    "cn": "后续剧情需要更多进度信息。",
    "jp": "続きには追加の進行情報が必要です。",
    "kr": "계속하려면 추가 스토리 진행 정보가 필요합니다."
  },
  "Translation reference": {
    "cn": "翻译参考",
    "jp": "翻訳の参考",
    "kr": "번역 참고"
  },
  "Missing": {
    "cn": "缺失",
    "jp": "未収録",
    "kr": "누락"
  },
  "Official wording from the document archive.": {
    "cn": "采用文献档案中的官方译文。",
    "jp": "文書アーカイブの公式訳を使用しています。",
    "kr": "문서 아카이브의 공식 번역을 사용합니다."
  },
  "Chinese source fallback. Official localization is unavailable.": {
    "cn": "暂无官方本地化文本，显示中文原文。",
    "jp": "公式翻訳が未収録のため、中国語の原文を表示しています。",
    "kr": "공식 번역이 없어 중국어 원문을 표시합니다."
  },
  "No source text was found.": {
    "cn": "未找到原文。",
    "jp": "原文が見つかりません。",
    "kr": "원문을 찾을 수 없습니다."
  },
  "Battle": {
    "cn": "战斗",
    "jp": "戦闘",
    "kr": "전투"
  },
  "Encounter": {
    "cn": "遭遇",
    "jp": "遭遇",
    "kr": "조우"
  },
  "Episode {n}": {
    "cn": "第{n}篇",
    "jp": "エピソード {n}",
    "kr": "에피소드 {n}"
  },
  "Mail {n}": {
    "cn": "邮件 {n}",
    "jp": "メール {n}",
    "kr": "우편 {n}"
  },
  "Item {n}": {
    "cn": "物品 {n}",
    "jp": "アイテム {n}",
    "kr": "아이템 {n}"
  },
  "{n} stars": {
    "cn": "{n}星",
    "jp": "星{n}",
    "kr": "{n}성"
  },
  "{name} · Level {n} · {quality}": {
    "cn": "{name} · 等级{n} · {quality}",
    "jp": "{name} · レベル{n} · {quality}",
    "kr": "{name} · 레벨 {n} · {quality}"
  },
  "{name} cumulative stats": {
    "cn": "{name} 累计属性",
    "jp": "{name}の累積ステータス",
    "kr": "{name} 누적 속성"
  },
  "Incomplete profile. Unit {n} is disabled in the game data. This entry shows the recovered biography and dialogue; skills and stats are not yet recovered for this record.": {
    "cn": "档案尚不完整。单位{n}在游戏数据中未启用。此处显示已取得的传记与对话，尚无技能与属性。",
    "jp": "未完成のプロフィールです。ユニット{n}はゲームデータで無効になっています。取得済みの経歴と会話を表示します。スキルとステータスは未取得です。",
    "kr": "미완성 프로필입니다. 유닛 {n}은 게임 데이터에서 비활성화되어 있습니다. 확보한 전기와 대사를 표시하며 스킬과 속성은 아직 없습니다."
  },
  "Preview profile. Not recovered yet: {fields}.": {
    "cn": "预览档案。尚未取得：{fields}。",
    "jp": "プレビューです。未取得の項目：{fields}。",
    "kr": "미리보기 프로필입니다. 아직 확보하지 못한 항목: {fields}."
  },
  "Replay": {
    "cn": "重看",
    "jp": "再確認",
    "kr": "다시 보기"
  },
  "Current speaker: {name}": {
    "cn": "当前发言者：{name}",
    "jp": "現在の話者：{name}",
    "kr": "현재 화자: {name}"
  },
  "On-screen cast: {name}": {
    "cn": "在场角色：{name}",
    "jp": "画面内の登場人物：{name}",
    "kr": "화면의 등장인물: {name}"
  },
  "Deploy": {
    "cn": "英雄上阵",
    "jp": "英雄出撃",
    "kr": "영웅 출전"
  },
  "Upgrade": {
    "cn": "升级",
    "jp": "レベルアップ",
    "kr": "레벨 상승"
  },
  "Defeated": {
    "cn": "英雄阵亡",
    "jp": "戦闘不能",
    "kr": "영웅 전사"
  },
  "Victory": {
    "cn": "胜利",
    "jp": "勝利",
    "kr": "승리"
  },
  "First Recruitment": {
    "cn": "首次获取",
    "jp": "英雄獲得",
    "kr": "최초 획득"
  },
  "Resonating Hall Idle": {
    "cn": "英雄厅堂闲聊",
    "jp": "英雄ホールのボイス",
    "kr": "영웅의 전당 대사"
  },
  "Liked Gift": {
    "cn": "喜爱的礼物",
    "jp": "好きなプレゼント",
    "kr": "좋아하는 선물"
  },
  "Disliked Gift": {
    "cn": "不喜欢的礼物",
    "jp": "苦手なプレゼント",
    "kr": "싫어하는 선물"
  },
  "Affinity Gift": {
    "cn": "信赖度赠礼",
    "jp": "信頼度のプレゼント",
    "kr": "신뢰도 선물"
  },
  "Advanced effect": {
    "cn": "进阶效果",
    "jp": "上級効果",
    "kr": "고급 효과"
  },
  "PvP damage boost": {
    "cn": "竞技场伤害加成",
    "jp": "アリーナのダメージ増幅",
    "kr": "아레나 대미지 증폭"
  },
  "PvP damage reduction": {
    "cn": "竞技场伤害减免",
    "jp": "アリーナのダメージ耐性",
    "kr": "아레나 대미지 감면"
  },
  "Lv. {n}": {
    "cn": "{n}级",
    "jp": "Lv. {n}",
    "kr": "Lv. {n}"
  },
  " (max)": {
    "cn": "（最高）",
    "jp": "（最大）",
    "kr": " (최대)"
  },
  "Levels +0 to +25 · Refinement 1–4": {
    "cn": "等级 +0 至 +25 · 精炼1–4级",
    "jp": "レベル +0～+25 · 精錬Lv.1～4",
    "kr": "레벨 +0~+25 · 제련 1~4레벨"
  },
  "Unit {n} · Skill shard {shard}": {
    "cn": "单位 {n} · 技能分片 {shard}",
    "jp": "ユニット {n} · スキルデータ {shard}",
    "kr": "유닛 {n} · 스킬 데이터 {shard}"
  },
  "Hero {n} · config level {level}": {
    "cn": "英雄 {n} · 配置等级 {level}",
    "jp": "英雄 {n} · 設定レベル {level}",
    "kr": "영웅 {n} · 설정 레벨 {level}"
  },
  "Part {n}/{total}": {
    "cn": "第{n}/{total}部分",
    "jp": "パート {n}/{total}",
    "kr": "구간 {n}/{total}"
  },
  "combination": {
    "cn": "组合",
    "jp": "組み合わせ",
    "kr": "조합"
  },
  "outcome": {
    "cn": "结果",
    "jp": "結果",
    "kr": "결과"
  },
  "reader completion": {
    "cn": "阅读完成状态",
    "jp": "閲覧完了状態",
    "kr": "읽기 완료 상태"
  }
};
  Object.assign(messages, {
  "Main + seasonal": {
    "cn": "主线等级 + 赛季等级",
    "jp": "メイン＋シーズン",
    "kr": "메인 + 시즌"
  },
  "Main level only": {
    "cn": "仅主线等级",
    "jp": "メインレベルのみ",
    "kr": "메인 레벨만"
  },
  "Main level": {
    "cn": "主线等级",
    "jp": "メインレベル",
    "kr": "메인 레벨"
  },
  "Seasonal level": {
    "en": "Season Level",
    "cn": "赛季等级",
    "jp": "シーズンレベル",
    "kr": "시즌 레벨"
  },
  "In-game level": {
    "cn": "游戏显示等级",
    "jp": "ゲーム内表示レベル",
    "kr": "게임 표시 레벨"
  },
  "Season Lv. {level} · main {main}": {
    "cn": "赛季等级 {level} · 主线 {main}",
    "jp": "シーズンLv. {level} · メイン {main}",
    "kr": "시즌 Lv. {level} · 메인 {main}"
  },
  "Includes normal Lv. {n} equipment. Seasonal equipment, exclusive equipment, charms, and other bonuses are excluded.": {
    "cn": "包含{n}级常规装备。不含赛季装备、专属装备、魔饰及其他加成。",
    "jp": "通常装備Lv. {n}を含みます。シーズン装備、専用装備、チャーム、その他のボーナスは含みません。",
    "kr": "일반 장비 {n}레벨을 포함합니다. 시즌 장비·전용 장비·주문석 및 기타 보너스는 제외합니다."
  },
  "All equipment, charms, and other bonuses are excluded.": {
    "cn": "不含所有装备、魔饰及其他加成。",
    "jp": "すべての装備、チャーム、その他のボーナスは含みません。",
    "kr": "모든 장비·주문석 및 기타 보너스는 제외합니다."
  },
  "No exact normal-equipment data is available for this class.": {
    "cn": "该职业没有精确的常规装备数据。",
    "jp": "この職業の正確な通常装備データはありません。",
    "kr": "해당 직업의 정확한 일반 장비 데이터가 없습니다."
  },
  "Include PvE growth term": {
    "cn": "包含PvE成长项",
    "jp": "PvE成長項を含める",
    "kr": "PvE 성장 항목 포함"
  },
  "PvE growth included": {
    "cn": "已包含PvE成长项",
    "jp": "PvE成長項を含む",
    "kr": "PvE 성장 포함"
  },
  "Exact config rows · growth ×{n}": {
    "cn": "配置表精确数值 · 成长 ×{n}",
    "jp": "設定テーブルの正確な値 · 成長 ×{n}",
    "kr": "정확한 설정 표 값 · 성장 ×{n}"
  },
  "No exact growth row is available for that level.": {
    "cn": "该等级没有精确的成长数据。",
    "jp": "このレベルの正確な成長データはありません。",
    "kr": "해당 레벨의 정확한 성장 데이터가 없습니다."
  },
  "No exact main-level growth row is available.": {
    "cn": "该主线等级没有精确的成长数据。",
    "jp": "このメインレベルの正確な成長データはありません。",
    "kr": "해당 메인 레벨의 정확한 성장 데이터가 없습니다."
  },
  "Main {main} + seasonal {season}": {
    "cn": "主线 {main} + 赛季 {season}",
    "jp": "メイン {main} ＋シーズン {season}",
    "kr": "메인 {main} + 시즌 {season}"
  },
  "Main {n}": {
    "cn": "主线 {n}",
    "jp": "メイン {n}",
    "kr": "메인 {n}"
  },
  "Battle rules": {
    "cn": "战斗规则",
    "jp": "バトルルール",
    "kr": "전투 규칙"
  },
  "Dream Realm conditions": {
    "cn": "梦境条件",
    "jp": "夢幻領域の条件",
    "kr": "꿈의 세계 조건"
  },
  "Captured runtime updates": {
    "cn": "已捕获的运行时更新",
    "jp": "取得済みの実行時更新",
    "kr": "캡처된 런타임 업데이트"
  },
  "How damage is calculated": {
    "cn": "伤害计算方式",
    "jp": "ダメージの計算方法",
    "kr": "대미지 계산 방식"
  },
  "Skill / level": {
    "cn": "技能 / 等级",
    "jp": "スキル／レベル",
    "kr": "스킬 / 레벨"
  },
  "Parameter": {
    "cn": "参数",
    "jp": "パラメータ",
    "kr": "매개변수"
  },
  "Installed": {
    "cn": "已安装版本",
    "jp": "インストール済み",
    "kr": "설치된 값"
  },
  "Registered hook": {
    "cn": "已注册钩子",
    "jp": "登録済みフック",
    "kr": "등록된 훅"
  },
  "Installed config": {
    "cn": "已安装配置",
    "jp": "インストール済み設定",
    "kr": "설치된 설정"
  },
  "Damage dealt": {
    "cn": "造成伤害",
    "jp": "与ダメージ",
    "kr": "입히는 대미지"
  },
  "Damage taken": {
    "cn": "受到伤害",
    "jp": "被ダメージ",
    "kr": "받는 대미지"
  },
  "Difficulty": {
    "cn": "难度",
    "jp": "難易度",
    "kr": "난이도"
  },
  "captured update available": {
    "cn": "有已捕获的更新",
    "jp": "取得済みの更新あり",
    "kr": "캡처된 업데이트 있음"
  },
  "These changes were captured from registered update hooks; final in-battle skill values were not captured.": {
    "cn": "这些变更来自已注册的更新钩子；尚未捕获战斗中最终实例化的技能数值。",
    "jp": "登録済みの更新フックから取得した変更です。戦闘中の最終スキル値は未取得です。",
    "kr": "등록된 업데이트 훅에서 캡처한 변경입니다. 전투 중 최종 스킬 값은 캡처되지 않았습니다."
  },
  "Installed description · captured parameter changes are listed under Battle rules": {
    "cn": "已安装版本的描述 · 已捕获的参数变更列在战斗规则中",
    "jp": "インストール済みの説明 · 取得したパラメータ変更はバトルルールに記載",
    "kr": "설치된 버전의 설명 · 캡처된 매개변수 변경은 전투 규칙에 표시"
  },
  "{skill} · Lv. 1 damage coefficient {before} → {after}": {
    "cn": "{skill} · 1级伤害系数 {before} → {after}",
    "jp": "{skill} · Lv.1 ダメージ係数 {before} → {after}",
    "kr": "{skill} · Lv.1 대미지 계수 {before} → {after}"
  }
});
  Object.assign(messages, {
  "Choose Merlin’s appearance": {
    "cn": "选择梅林的外观",
    "jp": "マーリンの見た目を選ぶ",
    "kr": "멀린의 외형 선택"
  },
  "Optional — you can change this anytime in Settings.": {
    "cn": "可选，可随时在设置中更改。",
    "jp": "任意です。設定からいつでも変更できます。",
    "kr": "선택 사항입니다. 설정에서 언제든 변경할 수 있습니다."
  },
  "Merlin Appearance": {
    "cn": "梅林外观",
    "jp": "マーリンの外見",
    "kr": "멀린 외형"
  },
  "Close": {
    "cn": "关闭",
    "jp": "閉じる",
    "kr": "닫기"
  },
  "Loading…": {
    "cn": "加载中…",
    "jp": "読み込み中…",
    "kr": "불러오는 중…"
  },
  "Preview gender": {
    "cn": "预览性别",
    "jp": "プレビューの性別",
    "kr": "미리보기 성별"
  },
  "Outfit group": {
    "cn": "服装分组",
    "jp": "衣装グループ",
    "kr": "의상 그룹"
  },
  "Default": {
    "cn": "默认",
    "jp": "デフォルト",
    "kr": "기본"
  },
  "Season {n}": {
    "cn": "第{n}赛季",
    "jp": "シーズン{n}",
    "kr": "시즌 {n}"
  },
  "Available looks": {
    "cn": "可选外观",
    "jp": "選べる外見",
    "kr": "선택 가능한 외형"
  },
  "Apply appearance": {
    "cn": "应用外观",
    "jp": "外見を適用",
    "kr": "외형 적용"
  },
  "Cancel": {
    "cn": "取消",
    "jp": "キャンセル",
    "kr": "취소"
  },
  "Appearance is saved separately for each gender.": {
    "cn": "外观按性别分别保存。",
    "jp": "外見は性別ごとに保存されます。",
    "kr": "외형은 성별마다 따로 저장됩니다."
  },
  "Import portrait pack": {
    "cn": "导入立绘包",
    "jp": "立ち絵パックを読み込む",
    "kr": "초상화 팩 가져오기"
  },
  "Imported looks": {
    "cn": "已导入的外观",
    "jp": "読み込んだ外見",
    "kr": "가져온 외형"
  },
  "Reset to default": {
    "cn": "恢复默认外观",
    "jp": "初期の外見に戻す",
    "kr": "기본 외형으로 초기화"
  },
  "Local looks stay in this tab until it is closed or reloaded.": {
    "cn": "本地外观仅保留在当前标签页，关闭或刷新后将清除。",
    "jp": "読み込んだ外見は、このタブを閉じるか再読み込みするまで保持されます。",
    "kr": "가져온 외형은 이 탭을 닫거나 새로 고침할 때까지 유지됩니다."
  },
  "Imported portraits are used only in this tab. Missing poses use the normal portrait.": {
    "cn": "导入的立绘仅用于当前标签页。缺少的姿势使用普通立绘。",
    "jp": "読み込んだ立ち絵はこのタブのみで使用します。不足するポーズには通常の立ち絵を使います。",
    "kr": "가져온 초상화는 이 탭에서만 사용됩니다. 없는 포즈는 기본 포즈로 표시됩니다."
  },
  "Look {n}": {
    "cn": "外观{n}",
    "jp": "外見{n}",
    "kr": "외형 {n}"
  },
  "Dialogue preview": {
    "cn": "对话预览",
    "jp": "会話プレビュー",
    "kr": "대화 미리보기"
  },
  "Could not load appearance. Try again.": {
    "cn": "无法加载外观，请重试。",
    "jp": "外見を読み込めませんでした。もう一度お試しください。",
    "kr": "외형을 불러오지 못했습니다. 다시 시도해 주세요."
  },
  "Viewpoint: {name}": {
    "cn": "当前视角：{name}",
    "jp": "視点：{name}",
    "kr": "현재 시점: {name}"
  }
});
  Object.assign(messages, {
  "My looks": {
    "cn": "我的造型",
    "jp": "マイスタイル",
    "kr": "내 외형"
  },
  "+ Create your own": {
    "cn": "+ 创建专属造型",
    "jp": "+ 自分のスタイルを作成",
    "kr": "+ 나만의 외형 만들기"
  },
  "Customize this look →": {
    "cn": "自定义此造型 →",
    "jp": "このスタイルをカスタマイズ →",
    "kr": "이 외형 꾸미기 →"
  },
  "My looks are saved in this browser.": {
    "cn": "我的造型保存在此浏览器中。",
    "jp": "マイスタイルはこのブラウザーに保存されます。",
    "kr": "내 외형은 이 브라우저에 저장됩니다."
  },
  "Look name": {
    "cn": "造型名称",
    "jp": "スタイル名",
    "kr": "외형 이름"
  },
  "Rename": {
    "cn": "重命名",
    "jp": "名前を変更",
    "kr": "이름 변경"
  },
  "Delete": {
    "cn": "删除",
    "jp": "削除",
    "kr": "삭제"
  },
  "Choose a look": {
    "cn": "选择造型",
    "jp": "スタイルを選択",
    "kr": "외형 선택"
  },
  "Customize": {
    "cn": "自定义",
    "jp": "カスタマイズ",
    "kr": "꾸미기"
  },
  "Merlin’s look updated": {
    "cn": "梅林的造型已更新",
    "jp": "マーリンのスタイルを更新しました",
    "kr": "멀린의 외형이 변경되었습니다"
  },
  "This pack has no editable recipe. Create your own look instead.": {
    "cn": "此肖像包没有可编辑搭配。请创建专属造型。",
    "jp": "このパックには編集用レシピがありません。新しいスタイルを作成してください。",
    "kr": "이 팩에는 편집 가능한 조합이 없습니다. 새 외형을 만들어 주세요."
  },
  "Import portrait pack": {
    "cn": "导入肖像包",
    "jp": "ポートレートパックをインポート",
    "kr": "인물 이미지 팩 가져오기"
  },
  "Reset to default": {
    "cn": "恢复默认",
    "jp": "デフォルトに戻す",
    "kr": "기본값으로 초기화"
  }
});
  Object.assign(messages,{"Delete this look?":{"cn":"删除此造型？","jp":"このスタイルを削除？","kr":"이 외형을 삭제할까요?"}});
  const languages = {cn: "zh-Hans", en: "en", jp: "ja", kr: "ko"};
  function language(value) { return Object.hasOwn(languages, value) ? value : "en"; }
  function text(key, locale = "en", values = {}) {
    const template = messages[key]?.[language(locale)] || String(key || "");
    return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  }
  function apply(document, locale) {
    document.documentElement.lang = languages[language(locale)];
    globalThis.ReaderTheme?.ensureFont?.(locale, document);
    for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = text(node.dataset.i18n, locale);
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      for (const node of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
        node.setAttribute(attribute, text(node.getAttribute(`data-i18n-${attribute}`), locale));
      }
    }
  }
  // Tab navigation restores a location but always carries the current reader preferences.
  function sectionHash(hash, preferences) {
    const [path, query = ""] = String(hash).replace(/^#/, "").split("?");
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(preferences)) params.set(key, value);
    return path + "?" + params.toString();
  }
  return {text, apply, language, sectionHash, messages};
});

;
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderWorldArchive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const kinds = ["fish", "enemies"];
  const jobs = {1: "Tank", 2: "Warrior", 3: "Mage", 4: "Support", 5: "Marksman", 6: "Rogue"};
  const messages = {
    "Fish": ["鱼类", "魚類", "어류"], "Enemies": ["敌人", "敵", "적군"],
    "Search fish": ["搜索鱼类", "魚類を検索", "어류 검색"],
    "Search enemies": ["搜索敌人", "敵を検索", "적군 검색"],
    "Fish Archive": ["鱼类", "魚類", "어류"],
    "Enemy Archive": ["敌人", "敵", "적군"],
    "All seasons": ["全部赛季", "全シーズン", "모든 시즌"],
    "All locations": ["全部地点", "すべての場所", "모든 지역"],
    "All classes": ["全部职业", "全ての職業", "모든 직업"],
    "Season": ["赛季", "シーズン", "시즌"], "Location": ["地点", "場所", "지역"],
    "Class": ["职业", "職業", "직업"], "Other": ["其他", "その他", "기타"],
    "Fish King": ["鱼王", "キングフィッシュ", "피쉬킹"],
    "Regions": ["地区", "地域", "지역"], "Events": ["活动", "イベント", "이벤트"],
    "Fish category": ["鱼类分类", "魚の分類", "물고기 분류"],
    "Event fish": ["活动鱼类", "イベントの魚", "이벤트 물고기"],
    "Normal": ["普通", "通常", "일반"], "Rare variant": ["异色鱼", "異色の魚", "레어 피쉬"],
    "Normal and rare": ["普通与异色鱼", "通常の魚・異色の魚", "일반 물고기 및 레어 피쉬"],
    "Tank": ["坦克", "タンク", "탱커"], "Warrior": ["战士", "ファイター", "전사"],
    "Mage": ["法师", "メイジ", "마법사"], "Support": ["辅助", "サポート", "서포터"],
    "Marksman": ["射手", "アーチャー", "사수"], "Rogue": ["游侠", "レンジャー", "레인저"],
    "Physical": ["物理", "物理", "물리"], "Magic": ["魔法", "魔法", "마법"],
    "Melee": ["近战", "近接", "근접"], "Ranged": ["远程", "遠距離", "원거리"],
    "Base stats": ["基础属性", "基本ステータス", "기본 속성"],
    "HP": ["生命值", "HP", "HP"], "ATK": ["攻击力", "攻撃力", "공격력"],
    "Physical DEF": ["护甲", "物理防御", "물리 방어력"],
    "Magic DEF": ["魔抗", "魔法防御", "마법 방어력"],
    "Level {level} · {quality}": ["等级 {level} · {quality}", "Lv. {level} · {quality}", "레벨 {level} · {quality}"],
    "Before equipment and battle modifiers. Enemy stats vary by encounter.": [
      "未计入装备与战斗修正。敌人属性随战斗而变化。",
      "装備や戦闘補正を含まない値です。敵のステータスは戦闘によって変わります。",
      "장비 및 전투 보정 전의 수치입니다. 적의 속성은 전투에 따라 달라집니다."],
    "Skills": ["技能", "スキル", "스킬"], "Skill {number}": ["技能 {number}", "スキル {number}", "스킬 {number}"],
    "Skill level {level}": ["技能等级 {level}", "スキルLv. {level}", "스킬 레벨 {level}"],
    "{count} of {total} entries": ["{count} / {total} 条", "{total}件中{count}件", "{total}개 중 {count}개"],
    "Select a fish to learn more.": ["选择一种鱼以了解详情。", "魚を選んで詳細をご覧ください。", "물고기를 선택해 자세히 알아보세요."],
    "Select an enemy to learn more.": ["选择一个敌人以了解详情。", "敵を選んで詳細をご覧ください。", "적을 선택해 자세히 알아보세요."],
    "No matching entries.": ["没有匹配的条目。", "一致する項目がありません。", "일치하는 항목이 없습니다."],
    "This entry could not be found.": ["未找到此条目。", "この項目は見つかりません。", "이 항목을 찾을 수 없습니다."],
    "Chinese name: {name}": ["中文名称：{name}", "中国語名：{name}", "중국어 이름: {name}"],
  };
  function text(key, language, values = {}) {
    // Shared game concepts use the same vocabulary as character profiles.
    const common = new Set(["Class", "Tank", "Warrior", "Mage", "Support", "Marksman", "Rogue", "HP", "ATK", "Physical DEF", "Magic DEF", "Skills", "Base stats"]);
    const shared = common.has(key) && globalThis.ReaderUI?.messages?.[key]?.[language];
    let value = shared || messages[key]?.[{cn: 0, jp: 1, kr: 2}[language]] || key;
    return value.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  }
  function localized(value, language) { return value?.[language] || value?.en || value?.cn || ""; }
  function fishCategory(entry) { return entry?.category === "events" ? "events" : "regions"; }
  function compareSeasons(first, second) {
    const rank = key => /^\d+$/.test(String(key)) ? Number(key) : Number.MAX_SAFE_INTEGER;
    return rank(first) - rank(second);
  }
  function seasonKeys(catalog) {
    return [...new Set((catalog?.entries || []).filter(entry => fishCategory(entry) === "regions" && entry.season)
      .map(entry => entry.season))].sort(compareSeasons);
  }
  function find(catalog, address) {
    return catalog?.entries.find(entry => entry.slug === address || entry.id === String(address)
      || entry.aliases?.includes(String(address)));
  }
  function searchText(entry, language) {
    const variants = entry.variants || [entry];
    return [entry.id, ...variants.flatMap(v => [localized(v.names, language), localized(v.descriptions, language)]),
      ...(entry.locations || []).map(location => localized(location.names, language)),
      localized(entry.location_names, language), entry.fish_king ? text("Fish King", language) + " Fish King" : ""]
      .join(" ").normalize("NFKC").toLocaleLowerCase();
  }
  function filterEntries(catalog, {query = "", season = "", location = "", job = "", category = ""} = {}, language = "en") {
    const needle = query.trim().normalize("NFKC").toLocaleLowerCase();
    return (catalog?.entries || []).filter(entry => (!season || entry.season === season)
      && (!location || entry.locations?.some(row => row.id === location))
      && (!job || entry.job === job) && (!category || fishCategory(entry) === category)
      && (!needle || searchText(entry, language).includes(needle)))
      .sort((first, second) => Number(Boolean(first.fish_king)) - Number(Boolean(second.fish_king))
        || compareSeasons(first.season, second.season));
  }
  function create(options) {
    const {list, detail, filters, count, search, language, load, format, select} = options;
    const catalogs = {}, pending = new Map(), state = {fish: {category: "regions"}, enemies: {}}, variants = new Map();
    const t = (key, values) => text(key, language(), values);
    const loc = value => localized(value, language());
    const el = (tag, cls, content) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (content != null) node.textContent = content;
      return node;
    };
    function art(path, cls, name, lazy = false) {
      const image = el("img", cls);
      image.src = ReaderPublication.url("data/" + path);
      image.alt = name;
      image.decoding = "async";
      if (lazy) image.loading = "lazy";
      return image;
    }
    async function ensure(kind) {
      const lang = language(), key = kind + ":" + lang;
      if (!pending.has(key)) pending.set(key, load("world_archive/" + kind + ".json", lang)
        .catch(error => { pending.delete(key); throw error; }));
      const catalog = await pending.get(key);
      if (catalog.schema_version !== 1 || !Array.isArray(catalog.entries)) throw new Error("Unsupported world archive catalog");
      if (lang === language()) catalogs[kind] = catalog;
    }
    function seasonName(catalog, key) { return loc(catalog.seasons?.[key]) || (key === "special" ? t("Fish King") : ""); }
    function filter(kind, key, label, rows) {
      const wrapper = el("label", "world-filter"), control = el("select");
      wrapper.append(el("span", "world-filter-label", t(label)));
      control.setAttribute("aria-label", t(label));
      for (const [id, name] of rows) {
        const option = el("option", "", name); option.value = id; control.append(option);
      }
      control.value = state[kind][key] || "";
      control.addEventListener("change", () => {
        state[kind][key] = control.value;
        if (key === "season") state[kind].location = "";
        list.scrollTop = 0;
        select(kind, "", false, true);
      });
      wrapper.append(control); filters.append(wrapper);
    }
    function renderFilters(kind) {
      filters.replaceChildren();
      filters.hidden = !kinds.includes(kind);
      const catalog = catalogs[kind];
      if (!catalog) return;
      if (kind === "fish") {
        const categories = el("div", "world-collection-tabs");
        categories.setAttribute("role", "group"); categories.setAttribute("aria-label", t("Fish category"));
        for (const [key, label] of [["regions", "Regions"], ["events", "Events"]]) {
          const active = state.fish.category === key;
          const button = el("button", "archive-item-category" + (active ? " active" : ""), t(label));
          button.type = "button"; button.dataset.fishCategory = key;
          button.setAttribute("aria-pressed", String(active));
          button.addEventListener("click", () => {
            state.fish = {category: key}; search.value = ""; list.scrollTop = 0;
            select("fish", key === "events" ? "events" : "", false, true);
          }); categories.append(button);
        }
        filters.append(categories);
        if (state.fish.category === "regions") {
          const seasons = seasonKeys(catalog);
          filter(kind, "season", "Season", [["", t("All seasons")], ...seasons.map(key => [key, seasonName(catalog, key)])]);
          const locations = new Map(catalog.entries.filter(entry => fishCategory(entry) === "regions"
            && (!state.fish.season || entry.season === state.fish.season))
            .flatMap(entry => entry.locations.map(row => [row.id, loc(row.names)])));
          filter(kind, "location", "Location", [["", t("All locations")], ...locations]);
        }
      } else {
        filter(kind, "job", "Class", [["", t("All classes")], ...Object.entries(jobs).map(([key, name]) => [key, t(name)])]);
      }
    }
    function renderList(kind, id) {
      const catalog = catalogs[kind], previousTop = list.scrollTop;
      const entries = filterEntries(catalog, {...state[kind], query: search.value}, language());
      const total = kind === "fish" ? (catalog?.entries || []).filter(entry => fishCategory(entry) === state.fish.category).length
        : catalog?.entries.length || 0;
      count.textContent = t("{count} of {total} entries", {count: entries.length, total});
      list.classList.add("world-card-grid");
      list.replaceChildren();
      const selected = find(catalog, id);
      for (const entry of entries) {
        const button = el("button", "world-card" + (selected === entry ? " active" : ""));
        button.type = "button";
        button.setAttribute("aria-pressed", String(selected === entry));
        const image = kind === "fish" ? entry.variants[0].image : entry.image;
        if (image) button.append(art(image, "world-card-image", "", true));
        button.append(el("span", "world-card-name", loc(entry.names)));
        const meta = kind === "fish" ? (fishCategory(entry) === "events" ? "" : seasonName(catalog, entry.season)) : t(jobs[entry.job]);
        if (meta) button.append(el("span", "world-card-meta", meta));
        if (kind === "fish" && entry.fish_king) button.append(el("span", "world-card-meta", t("Fish King")));
        button.addEventListener("click", () => select(kind, entry.slug, false));
        list.append(button);
      }
      if (!entries.length) list.append(el("p", "archive-list-empty", t("No matching entries.")));
      // Selecting or translating a card never destroys the list's reading position.
      list.scrollTop = previousTop;
    }
    function body(raw, cls = "world-description") {
      const node = el("div", cls); format(node, raw); return node;
    }
    function renderDetail(kind, id) {
      const catalog = catalogs[kind], entry = find(catalog, id);
      detail.replaceChildren();
      detail.classList.add("world-detail");
      if (!entry) {
        detail.append(el("p", "archive-detail-empty", id ? t("This entry could not be found.")
          : t(kind === "fish" ? "Select a fish to learn more." : "Select an enemy to learn more.")));
        return;
      }
      detail.append(el("div", "archive-detail-kicker", t(kind === "fish"
        ? (fishCategory(entry) === "events" ? "Event fish" : entry.fish_king ? "Fish King" : "Fish") : "Enemies")));
      if (kind === "fish") {
        const variant = entry.variants.find(row => row.id === variants.get(entry.id)) || entry.variants[0];
        detail.append(el("h2", "archive-detail-title", loc(variant.names)));
        if (fishCategory(entry) === "regions") detail.append(el("p", "world-detail-meta", seasonName(catalog, entry.season)));
        const location = loc(entry.location_names) || entry.locations.map(row => loc(row.names)).join(" · ");
        if (location) detail.append(el("p", "world-detail-meta", t("Location") + ": " + location));
        if (entry.variants.length > 1) {
          const toggle = el("div", "world-variants"); toggle.setAttribute("role", "group");
          toggle.setAttribute("aria-label", t("Normal and rare"));
          for (const row of entry.variants) {
            const button = el("button", "archive-item-category" + (row === variant ? " active" : ""), t(row.rare ? "Rare variant" : "Normal"));
            button.type = "button"; button.setAttribute("aria-pressed", String(row === variant));
            button.addEventListener("click", () => {
              variants.set(entry.id, row.id); renderDetail(kind, id);
              // Focus the replacement toggle, without moving the page/list.
              detail.querySelector('.world-variants [aria-pressed="true"]')?.focus({preventScroll: true});
            }); toggle.append(button);
          }
          detail.append(toggle);
        }
        detail.append(art(variant.image, "world-fish-art", loc(variant.names)), body(loc(variant.descriptions)));
      } else {
        const header = el("header", "world-enemy-header");
        if (entry.image) header.append(art(entry.image, "world-enemy-art", loc(entry.names)));
        const identity = el("div"); identity.append(el("h2", "archive-detail-title", loc(entry.names)));
        identity.append(el("p", "world-detail-meta", [t("Other"), t(jobs[entry.job]), t(entry.damage), t(entry.attack_style)].join(" · ")));
        header.append(identity); detail.append(header, body(loc(entry.descriptions)));
        if (Object.keys(entry.stats || {}).length) {
          const section = el("section", "world-stats");
          section.append(el("h3", "", t("Base stats")), el("p", "world-detail-meta", t("Level {level} · {quality}",
            {level: catalog.preset.level, quality: loc(catalog.preset.quality_names)})));
          const stats = el("dl", "world-stat-grid");
          for (const [key, name] of [["HP", "HP"], ["ATK", "ATK"], ["ARM", "Physical DEF"], ["MR", "Magic DEF"]]) {
            const row = el("div"); row.append(el("dt", "", t(name)), el("dd", "", Number(entry.stats[key]).toLocaleString(
              {cn: "zh-CN", en: "en-US", jp: "ja-JP", kr: "ko-KR"}[language()], {maximumFractionDigits: 0}))); stats.append(row);
          }
          section.append(stats, el("p", "world-stat-note", t("Before equipment and battle modifiers. Enemy stats vary by encounter.")));
          detail.append(section);
        }
        if (entry.skills.length) detail.append(el("h3", "world-skill-heading", t("Skills")));
        for (const [index, skill] of entry.skills.entries()) {
          const card = el("section", "world-skill");
          const header = el("header", "world-skill-header");
          if (skill.image) header.append(art(skill.image, "world-skill-image", ""));
          const identity = el("div");
          const officialName = skill.names?.[language()] || (language() === "cn" ? skill.names?.cn : skill.names?.en);
          identity.append(el("h4", "", officialName || t("Skill {number}", {number: index + 1})),
            el("p", "world-detail-meta", t("Skill level {level}", {level: skill.level})));
          if (!officialName && skill.names?.cn) identity.append(el("p", "world-detail-meta", t("Chinese name: {name}", {name: skill.names.cn})));
          header.append(identity); card.append(header, body(loc(skill.descriptions))); detail.append(card);
        }
      }
    }
    function render(kind, id) {
      if (kind === "fish") {
        const category = id === "events" ? "events" : fishCategory(find(catalogs[kind], id));
        if (state.fish.category !== category) state.fish = {category};
      }
      // A category overview has its own readable address, without pretending to
      // be a selected fish. Entry links restore their category on refresh/history.
      const selectedId = kind === "fish" && id === "events" ? "" : id;
      renderFilters(kind); renderList(kind, selectedId); renderDetail(kind, selectedId);
    }
    function reset() { filters.hidden = true; list.classList.remove("world-card-grid"); detail.classList.remove("world-detail"); }
    return {ensure, render, renderList, reset, find: (kind, id) => find(catalogs[kind], id)};
  }
  return {kinds, jobs, text, localized, fishCategory, find, searchText, filterEntries, compareSeasons, seasonKeys, create};
});

;
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
  function bundles(load) {
    const resources = new Map();
    const get = create(async path => {
      const pack = await load(path);
      if (pack?.schema_version !== 1 || !pack.resources || Array.isArray(pack.resources)
          || typeof pack.resources !== "object") throw new Error("Invalid story bundle");
      const entries = Object.entries(pack.resources);
      // Validate the whole pack before exposing any of it to ordinary loaders.
      if (entries.some(([name, value]) => !/^[\w.-]+(?:\/[\w.:-]+)*[.]json$/.test(name)
          || name.startsWith("/")
          || name.split("/").some(part => ["", ".", "..", "__proto__", "constructor", "prototype"].includes(part))
          || (value !== null && typeof value !== "object"))) throw new Error("Invalid bundled resource");
      for (const [name, value] of entries) resources.set(name, value);
    });
    const key = path => path.replace(/^\.\.\/reader_data\//, "").replace(/^data\//, "").split("?")[0];
    return {
      has: path => resources.has(key(path)),
      read: path => resources.get(key(path)),
      async prepare(descriptors, language) {
        const paths = new Set(descriptors.flatMap(row => [...row.core, ...(row.locales?.[language] || [])]));
        await Promise.all([...paths].map(get));
      },
    };
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
  function runtimeFeatures(runtime, {owner = "", assets = [], group = "", logical = true} = {}) {
    const features = runtime?.runtime_features;
    if (!features) return [];
    owner = String(owner);
    const index = runtime.runtime_dependencies || {};
    const names = new Set(["scene_summaries", ...(logical ? index.stories?.[owner] : index.groups?.[group]) || []]);
    const treatments = runtime.treatment_steps?.[owner] || [];
    const keys = new Set([...assets, ...treatments.map(step => step.asset),
      ...(runtime.menus?.[owner] || []).map(link => runtime.choices?.[String(link.choice_id)]?.asset)].filter(Boolean));
    for (const asset of keys) for (const name of index.assets?.[asset] || []) names.add(name);
    if (treatments.length) names.add("pharmacy");
    if ((features.treatment_feedback?.assets || []).some(asset => keys.has(asset))) names.add("treatment_feedback");
    if (features.placements?.[owner]) names.add("placements");
    return [...names].map(name => ({name, owner, path: name === "placements" ? features.placements[owner]
      : name === "treatment_feedback" ? features.treatment_feedback?.path : features[name]}))
      .filter(entry => typeof entry.path === "string");
  }
  return {create, merge, dependencies, entities, patch, bundles, runtimeFeatures};
});

;
/* Native loading-screen glossary, shared by the two private readers. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderGlossary = api;
})(typeof globalThis === "object" ? globalThis : this, function() {
  "use strict";
  function path(page = "", term = "") {
    return "/story-archive" + (page ? "/" + page : "") + (term ? "/" + term : "");
  }
  function normalized(value) { return String(value || "").normalize("NFKC").toLocaleLowerCase().trim(); }
  function matches(entry, query) {
    const tokens = normalized(query).split(/\s+/).filter(Boolean);
    const haystack = normalized([
      ...Object.values(entry.names || {}),
      ...(entry.definitions || []).flatMap(row => Object.values(row.text || {})),
      ...Object.values(entry.title || {}), ...Object.values(entry.description || {}),
    ].join("\n"));
    return tokens.every(token => haystack.includes(token));
  }
  function render(options) {
    const {root, glossary, state, text, href, icon, onQuery} = options;
    function element(tag, className, content) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (content !== undefined) node.textContent = content;
      return node;
    }
    function link(label, target, className = "archive-back") {
      const node = element("a", className, label); node.href = target; return node;
    }
    function value(locales) { return locales?.[state.language] || locales?.en || ""; }
    function heading(label, description) {
      const header = element("header", "story-archive-heading");
      header.append(link("‹ " + text("Story Archive"), href(path()), "mystical-kicker archive-kicker-link"), element("h1", "", text(label)));
      if (description) header.append(element("p", "", text(description)));
      root.append(header);
    }
    function searchField(placeholder, label, query) {
      const wrapper = element("div", "archive-lore-toolbar");
      const input = element("input", "archive-lore-search"); input.type = "search";input.autocomplete = "off";
      input.placeholder = text(placeholder);input.setAttribute("aria-label", text(label));input.value = query;
      const count = element("p", "archive-result-count");count.setAttribute("role", "status");
      wrapper.append(input, count);root.append(wrapper);return {input,count};
    }
      heading("Glossary", "Explore the world and lore of Esperia.");
      const {input,count} = searchField("Search the glossary", "Search the glossary", state.query || "");
      const layout = element("div", "archive-glossary-layout");
      const list = element("nav", "archive-term-list");list.setAttribute("aria-label", text("Glossary terms"));
      const detail = element("article", "archive-term-detail");detail.id = "glossary-detail";detail.tabIndex = 0;
      const selected = glossary.entries.find(entry => entry.id === state.term);
      if (selected) {
        detail.append(link("‹ " + text("All terms"), href(path("glossary"), {q:state.query || ""}), "archive-term-back"),
          element("p", "archive-eyebrow", text("Glossary")), element("h2", "", value(selected.names)));
        for (const description of selected.definitions) detail.append(element("p", "archive-lore-definition", value(description.text)));
        layout.classList.add("has-selected-term");
      } else if (state.term) {
        detail.append(element("h2", "", text("Term not found")), link(text("All terms"), href(path("glossary"))));
      } else {
        detail.classList.add("archive-term-welcome");if (icon) detail.append(icon("glossary"));
        detail.append(element("h2", "", text("A world of stories")),
          element("p", "", text("Choose a term to learn more about Esperia.")));
      }
      const collator = new Intl.Collator({cn:"zh-Hans",jp:"ja",kr:"ko",en:"en"}[state.language]);
      function filter() {
        const query = input.value;state.query = query;onQuery(query);
        const entries = glossary.entries.filter(entry => matches(entry, query)).sort((a,b) => collator.compare(value(a.names), value(b.names)));
        count.textContent = text("{count} terms", {count:entries.length});list.replaceChildren();
        for (const entry of entries) {
          const row = link(value(entry.names), href(path("glossary", entry.id), {q:query}), "archive-term-link");
          if (selected?.id === entry.id) row.setAttribute("aria-current", "page");list.append(row);
        }
        if (!entries.length) list.append(element("p", "archive-no-results", text("No matching terms.")));
      }
      input.addEventListener("input", filter);layout.append(list,detail);root.append(layout);filter();
    }
  return {render, normalized, matches};
});

;
/* Story Archive entrance, season gallery and native loading-screen glossary. */
(function(root, factory) {
  const glossary = typeof module === "object" && module.exports ? require("./reader_glossary.js") : root.ReaderGlossary;
  const api = factory(glossary);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderStoryArchive = api;
})(typeof globalThis === "object" ? globalThis : this, function(Glossary) {
  "use strict";
  const PAGES = ["stories", "glossary", "search"];
  const LABELS = {stories: "Stories", glossary: "Glossary", search: "Search"};
  const DESCRIPTIONS = {
    stories: "Revisit the chapters and seasons of Esperia.",
    glossary: "Discover the places, people, and ideas behind the stories.",
    search: "Find a story or a term from the world of Esperia.",
  };
  const {normalized, matches} = Glossary;
  function parse(path) {
    const parts = String(path).replace(/^#?\/?/, "").split("/").filter(Boolean);
    if (parts[0] !== "story-archive") return null;
    if (parts.length > 3 || (parts[1] && !PAGES.includes(parts[1]))
        || (parts[2] && (parts[1] !== "glossary" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2])))) return null;
    return {view: "story-archive", archivePage: parts[1] || "", glossaryTerm: parts[2] || ""};
  }
  function path(page = "", term = "") {
    return "/story-archive" + (page ? "/" + page : "") + (page === "glossary" && term ? "/" + term : "");
  }
  function create(options) {
    const {root, text, href, url, read, collections, storyHref, onQuery} = options;
    let glossary = null, artwork = {}, illustrations = {}, artLoad = null, loreLoad = null, state = {}, slide = 0;
    let glossaryListViewport = null;
    function element(tag, className, content) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (content !== undefined) node.textContent = content;
      return node;
    }
    function icon(kind) {
      const node = element("span", "archive-illustration");
      const source = illustrations[kind] || illustrations.stories;
      if (source?.presentation === "portrait") node.classList.add("archive-portrait");
      if (source) {
        const image = element("img"); image.src = ReaderPublication.url(url(source.image)); image.alt = "";
        image.width = source.width; image.height = source.height; image.decoding = "async";
        node.append(image);
      }
      return node;
    }
    function link(label, target, className = "archive-back") {
      const node = element("a", className, label); node.href = target; return node;
    }
    function value(locales) { return locales?.[state.language] || locales?.en || ""; }
    async function prepare(page) {
      if (!artLoad) artLoad = read("story_archive/index.json").then(art => {
        if (art.schema_version !== 1) throw new Error("Invalid Story Archive artwork catalog");
        artwork = art.artwork || {}; illustrations = art.illustrations || {};
      }).catch(error => { artLoad = null; throw error; });
      const tasks = [artLoad];
      if (["glossary", "search"].includes(page)) {
        if (!loreLoad) loreLoad = read("glossary/index.json").then(lore => {
          if (lore.schema_version !== 1 || !Array.isArray(lore.entries)) throw new Error("Invalid glossary catalog");
          glossary = lore;
        }).catch(error => { loreLoad = null; throw error; });
        tasks.push(loreLoad);
      }
      await Promise.all(tasks);
    }
    function heading(label, description) {
      const header = element("header", "story-archive-heading");
      header.append(link("‹ " + text("Story Archive"), href(path()), "mystical-kicker archive-kicker-link"), element("h1", "", text(label)));
      if (description) header.append(element("p", "", text(description)));
      root.append(header);
    }
    function renderLanding() {
      const header = element("header", "archive-entrance-heading");
      header.append(element("p", "archive-eyebrow", text("The Esperia Archive")), element("h1", "", text("Story Archive")));
      const carousel = element("div", "archive-carousel");
      carousel.setAttribute("aria-label", text("Explore the archive"));
      const previous = element("button", "archive-turn", "‹"); previous.type = "button";
      previous.setAttribute("aria-label", text("Previous archive page"));
      const next = element("button", "archive-turn", "›"); next.type = "button";
      next.setAttribute("aria-label", text("Next archive page"));
      const center = element("div", "archive-portal-slot");
      const portals = PAGES.map(page => {
        const portal = link("", href(path(page)), "archive-portal");
        portal.append(icon(page), element("h2", "", text(LABELS[page])), element("p", "archive-portal-description", text(DESCRIPTIONS[page])),
          element("span", "archive-open", text("Open") + " →"));
        center.append(portal);
        return portal;
      });
      const tabs = element("nav", "archive-page-choices"); tabs.setAttribute("aria-label", text("Archive pages"));
      const buttons = PAGES.map((page, index) => {
        const button = element("button", "", text(LABELS[page])); button.type = "button";
        button.addEventListener("click", () => choose(index)); tabs.append(button); return button;
      });
      const status = element("p", "archive-sr-only");status.setAttribute("aria-live", "polite");
      function choose(index) {
        slide = (index + PAGES.length) % PAGES.length;
        const page = PAGES[slide];
        portals.forEach((portal, i) => {
          const active = i === slide;
          portal.classList.toggle("archive-portal-inactive", !active);
          portal.setAttribute("aria-hidden", String(!active));
          portal.inert = !active;
          portal.tabIndex = active ? 0 : -1;
        });
        buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === slide)));
        status.textContent = text(LABELS[page]);
      }
      previous.addEventListener("click", () => choose(slide - 1)); next.addEventListener("click", () => choose(slide + 1));
      carousel.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); choose(slide + (event.key === "ArrowRight" ? 1 : -1));
      });
      let touch = null, swiped = false;
      carousel.addEventListener("touchstart", event => {touch = event.touches[0]; swiped = false;}, {passive:true});
      carousel.addEventListener("touchend", event => {
        if (!touch) return;
        const end = event.changedTouches[0], dx = end.clientX - touch.clientX, dy = end.clientY - touch.clientY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {swiped = true; choose(slide + (dx < 0 ? 1 : -1));}
        touch = null;
      }, {passive:true});
      carousel.addEventListener("click", event => {if (swiped) {event.preventDefault(); swiped = false;}}, true);
      carousel.append(previous, center, next); root.append(header, carousel, tabs, status); choose(slide);
    }
    function renderGallery() {
      heading("Stories", "Choose a chapter of Esperia.");
      const grid = element("div", "archive-season-grid");
      for (const collection of collections()) {
        // The chapter holding the last-read story opens at that position.
        const resume = collection.lastRead;
        const card = link("", resume?.href || collection.href, "archive-season-card");card.dataset.collection = collection.key;
        if (resume) card.classList.add("archive-season-resume");
        const art = element("div", "archive-season-art");
        const cover = artwork[collection.key] || (collection.key === "special_events" ? illustrations.events : null);
        if (cover) {
          const window = element("figure", "archive-season-window");
          if (cover.presentation === "portrait") window.classList.add("archive-portrait");
          window.style.aspectRatio = cover.presentation === "portrait" ? "3 / 4" : `${cover.width} / ${cover.height}`;
          const image = element("img"); image.src = ReaderPublication.url(url(cover.image)); image.alt = ""; image.width = cover.width; image.height = cover.height; image.loading = "lazy";
          image.addEventListener("error", () => {window.hidden = true; art.append(icon("stories"));}, {once:true});
          const caption = element("figcaption", "archive-window-caption");
          caption.append(element("h2", "archive-window-title", collection.label));
          window.append(image, caption);art.append(window);
        } else art.append(icon("events"));
        const number = /^season_(\d+)$/.exec(collection.key);
        card.append(art, element("span", "archive-season-kicker", number ? text("Season {number}", {number:number[1]})
          : text(collection.key === "base_campaign" ? "Starter Story" : "Special Events")));
        if (!cover) card.append(element("h2", "", collection.label));
        if (resume) card.append(element("span", "archive-season-last-read", text("Last read: {title}", {title:value(resume.title)})));
        card.append(element("span", "archive-season-open", text(resume ? "Continue reading" : "Read stories") + " →"));
        grid.append(card);
      }
      root.append(grid);
    }
    function searchField(placeholder, label, query) {
      const wrapper = element("div", "archive-lore-toolbar");
      const input = element("input", "archive-lore-search"); input.type = "search";input.autocomplete = "off";
      input.placeholder = text(placeholder);input.setAttribute("aria-label", text(label));input.value = query;
      const count = element("p", "archive-result-count");count.setAttribute("role", "status");
      wrapper.append(input, count);root.append(wrapper);return {input,count};
    }
    function renderGlossary() {
      Glossary.render({root, glossary, state, text, href, icon, onQuery});
    }
    function renderSearch() {
      heading("Search", "Find stories by title and search the glossary in any of the four languages.");
      const {input,count} = searchField("Search stories and glossary", "Search stories and glossary", state.query || "");
      const results = element("div", "archive-search-results");root.append(results);
      const stories = collections().flatMap(collection => collection.stories.map(story => ({...story,collection})));
      function filter() {
        state.query = input.value;onQuery(state.query);results.replaceChildren();
        if (!normalized(state.query)) {count.textContent = "";results.append(element("p", "archive-search-hint", text("Enter a story title, place, or lore term.")));return;}
        const foundStories = stories.filter(story => matches(story,state.query));
        const foundTerms = glossary.entries.filter(entry => matches(entry,state.query));
        count.textContent = text("{count} results", {count:foundStories.length + foundTerms.length});
        if (!foundStories.length && !foundTerms.length) {results.append(element("p", "archive-no-results", text("No matching stories or terms.")));return;}
        for (const [label, rows] of [["Stories",foundStories],["Glossary",foundTerms]]) {
          if (!rows.length) continue;
          const section = element("section", "archive-search-section");section.append(element("h2", "", text(label)));
          let shown = 0;
          function more() {
            button.remove();
            for (const entry of rows.slice(shown, shown + 60)) {
              const row = link("", label === "Stories" ? storyHref(entry) : href(path("glossary",entry.id)), "archive-search-result");
              row.append(element("strong", "", value(label === "Stories" ? entry.title : entry.names)),
                element("span", "", label === "Stories" ? entry.collection.label : value(entry.definitions[0].text)));
              section.append(row);
            }
            shown += 60;if (shown < rows.length) section.append(button);
          }
          const button = element("button", "archive-show-more", text("Show more"));button.type="button";button.addEventListener("click",more);
          more();results.append(section);
        }
      }
      input.addEventListener("input", filter);filter();
    }
    function render(route, language, viewport = {}) {
      const nextState = {page:route.archivePage || "", term:route.glossaryTerm || "", query:route.archiveQuery || "", language};
      const continuingGlossary = viewport.active !== false && state.page === "glossary" && nextState.page === "glossary"
        && state.language === language && state.query === nextState.query;
      const previousList = continuingGlossary ? root.querySelector(".archive-term-list") : null;
      const listScrollTop = previousList?.scrollTop || 0;
      let position = continuingGlossary ? viewport : null;
      if (!continuingGlossary) glossaryListViewport = null;
      if (continuingGlossary && viewport.stacked && nextState.term !== state.term) {
        if (nextState.term) {
          // Keep the list's position relative to the screen, even when a definition above it changes height.
          const rect = previousList?.getBoundingClientRect();
          if (rect && (!state.term || (rect.bottom > 0 && rect.top < viewport.height))) {
            glossaryListViewport = {listOffset:rect.top};
          }
          position = {termHeading:true};
        } else position = glossaryListViewport || viewport;
      }
      if (!continuingGlossary && viewport.stacked && nextState.page === "glossary" && nextState.term) position = {termHeading:true};
      state = nextState;
      root.replaceChildren();root.dataset.page = state.page || "entrance";
      if (!state.page) renderLanding();
      else if (state.page === "stories") renderGallery();
      else if (state.page === "glossary") renderGlossary();
      else renderSearch();
      if (continuingGlossary) root.querySelector(".archive-term-list").scrollTop = listScrollTop;
      return position;
    }
    return {prepare,render,hasTerm:id => Boolean(glossary?.entries.some(entry => entry.id === id))};
  }
  return {create,parse,path,matches};
});

;
/* Current public story addresses. Extend with tools/update_story_routes.cjs.
 * Only the current URL for each story is published. */
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReaderStoryPaths = factory();
})(typeof globalThis === "object" ? globalThis : this, function() {
  return {schemaVersion: 1, stories: {
    "base/main/prologue": {"path":"stories/prologue/prologue"},
    "base/main/10010100": {"path":"stories/ryeham-tales/new-journey"},
    "base/main/10010101": {"path":"stories/ryeham-tales/holistone-mystery"},
    "base/main/10010213": {"path":"stories/ryeham-tales/north-and-south"},
    "base/main/10010102": {"path":"stories/ryeham-tales/vineyards-secret"},
    "base/main/10010103": {"path":"stories/ryeham-tales/truth-behind-fire"},
    "base/main/10010104": {"path":"stories/ryeham-tales/franz-the-suspect"},
    "base/main/10010105": {"path":"stories/ryeham-tales/golden-banquet"},
    "base/main/10010106": {"path":"stories/ryeham-tales/source-of-magic"},
    "base/main/10010107": {"path":"stories/ryeham-tales/merlins-ward"},
    "base/main/10020111": {"path":"stories/lucents-lament/whispering-woods"},
    "base/main/10020112": {"path":"stories/lucents-lament/strange-situation"},
    "base/main/10020113": {"path":"stories/lucents-lament/lunnos-lakeside"},
    "base/main/10020114": {"path":"stories/lucents-lament/thorned-sage"},
    "base/main/10020115": {"path":"stories/lucents-lament/the-getaway"},
    "base/main/10020116": {"path":"stories/lucents-lament/the-sages-true-self"},
    "base/main/10020117": {"path":"stories/lucents-lament/corrupted-outcome"},
    "base/main/10030121": {"path":"stories/woodland-pledge/the-river"},
    "base/main/10030122": {"path":"stories/woodland-pledge/weeping-rain"},
    "base/main/10030123": {"path":"stories/woodland-pledge/the-butterfly-trail"},
    "base/main/10030124": {"path":"stories/woodland-pledge/sanctuary-site"},
    "base/main/10030125": {"path":"stories/woodland-pledge/deer-spirit-blessing"},
    "base/main/10030126": {"path":"stories/woodland-pledge/the-corrupted-path"},
    "base/main/10030127": {"path":"stories/woodland-pledge/turn-a-new-leaf"},
    "base/main/10040130": {"path":"stories/reawakened-power/attack-of-the-golems"},
    "base/main/10040131": {"path":"stories/reawakened-power/finding-the-trail"},
    "base/main/10040132": {"path":"stories/reawakened-power/the-missing-girl"},
    "base/main/10040133": {"path":"stories/reawakened-power/the-mists-of-time"},
    "base/main/10040134": {"path":"stories/reawakened-power/tangled-threads"},
    "base/main/10040135": {"path":"stories/reawakened-power/machines-of-the-past"},
    "base/main/10040136": {"path":"stories/reawakened-power/ruins-and-tales"},
    "base/main/10040137": {"path":"stories/reawakened-power/before-the-finale"},
    "base/main/10040138": {"path":"stories/reawakened-power/the-last-leg"},
    "base/side/10010202": {"path":"stories/ryeham-tales/scholars-in-distress"},
    "base/side/10010212": {"path":"stories/ryeham-tales/warmth-in-winter"},
    "base/side/10010221": {"path":"stories/ryeham-tales/golden-secret"},
    "base/side/10010224": {"path":"stories/ryeham-tales/where-is-bradduck"},
    "base/side/10010231": {"path":"stories/ryeham-tales/jumeo-and-roliet"},
    "base/side/10010251": {"path":"stories/ryeham-tales/who-is-merlin"},
    "base/side/10010261": {"path":"stories/ryeham-tales/the-uninvited-guest"},
    "base/side/10010297": {"path":"stories/ryeham-tales/shared-moments"},
    "base/side/10010528": {"path":"stories/ryeham-tales/winter-feast"},
    "base/side/10020271": {"path":"stories/lucents-lament/innocent-secret"},
    "base/side/10020272": {"path":"stories/lucents-lament/lost-maiden"},
    "base/side/10020273": {"path":"stories/lucents-lament/deer-treasure-secret"},
    "base/side/10020274": {"path":"stories/lucents-lament/deer-treasure-wonder"},
    "base/side/10020276": {"path":"stories/lucents-lament/deer-treasure-forest"},
    "base/side/10020277": {"path":"stories/lucents-lament/deer-treasure-lunnos"},
    "base/side/10020278": {"path":"stories/lucents-lament/deer-treasure-thorned"},
    "base/side/10020280": {"path":"stories/lucents-lament/deer-treasure-rainford"},
    "base/side/10020275": {"path":"stories/lucents-lament/deer-treasure-vitality"},
    "base/side/10030281": {"path":"stories/woodland-pledge/where-the-rain-goes"},
    "base/side/10030282": {"path":"stories/woodland-pledge/flowers-for-the-gifted"},
    "base/side/10030283": {"path":"stories/woodland-pledge/forever-young"},
    "base/side/10030284": {"path":"stories/woodland-pledge/woodland-secret"},
    "base/side/10030285": {"path":"stories/woodland-pledge/first-lesson"},
    "base/side/10040291": {"path":"stories/reawakened-power/shadow-chasers"},
    "base/side/10040292": {"path":"stories/reawakened-power/treasure-thief-boss"},
    "base/side/10040293": {"path":"stories/reawakened-power/fays-mystery-theater-i"},
    "base/side/10040294": {"path":"stories/reawakened-power/fays-mystery-theater-ii"},
    "base/side/10040295": {"path":"stories/reawakened-power/nakaligs-legend"},
    "base/side/10040296": {"path":"stories/reawakened-power/before-it-rains"},
    "base/heart_to_heart/10411010": {"path":"stories/holistone-golden-wheatshire/hammie-and-cassadee-and-valen"},
    "base/heart_to_heart/10411020": {"path":"stories/holistone-golden-wheatshire/hogan-and-chippy"},
    "base/heart_to_heart/10411030": {"path":"stories/base-campaign/chippy-and-rowan"},
    "base/heart_to_heart/10411040": {"path":"stories/holistone-golden-wheatshire/valen-and-vala"},
    "base/heart_to_heart/10411050": {"path":"stories/holistone-golden-wheatshire-remnant-peaks-ashen-wastes/chippy-and-hammie-and-valen"},
    "base/heart_to_heart/10411060": {"path":"stories/holistone-golden-wheatshire-remnant-peaks/valen-and-chippy"},
    "base/heart_to_heart/10411070": {"path":"stories/holistone-golden-wheatshire/hammie-and-cassadee"},
    "base/heart_to_heart/10411080": {"path":"stories/holistone-golden-wheatshire/cassadee-and-hammie"},
    "base/heart_to_heart/10412011": {"path":"stories/dark-forest/hammie-and-bryon-and-lorsan"},
    "base/heart_to_heart/10412020": {"path":"stories/dark-forest/korin-and-damian"},
    "base/heart_to_heart/10412030": {"path":"stories/dark-forest/parisa-and-lyca-and-kafra"},
    "base/heart_to_heart/10412040": {"path":"stories/dark-forest/kafra-and-chippy-and-hammie"},
    "base/heart_to_heart/10412070": {"path":"stories/dark-forest/lyca-and-lorsan"},
    "base/heart_to_heart/10412080": {"path":"stories/base-campaign/chippy-and-korin"},
    "base/heart_to_heart/10412090": {"path":"stories/dark-forest/lorsan-and-damian-and-dahnie"},
    "base/heart_to_heart/10412100": {"path":"stories/base-campaign/lorsan-and-lyca"},
    "base/heart_to_heart/10412110": {"path":"stories/dark-forest/lyca-and-eironn-and-parisa"},
    "base/heart_to_heart/10412120": {"path":"stories/base-campaign/eironn-and-kafra-and-hammie"},
    "base/heart_to_heart/10412130": {"path":"stories/dark-forest-vaduso-mountains/hammie-and-chippy"},
    "base/heart_to_heart/10412140": {"path":"stories/dark-forest-vaduso-mountains/chippy-and-lorsan"},
    "base/heart_to_heart/10412150": {"path":"stories/base-campaign/hammie-and-bryon"},
    "base/heart_to_heart/10412160": {"path":"stories/base-campaign/dahnie-and-chippy"},
    "base/heart_to_heart/10412170": {"path":"stories/dark-forest/lyca-and-kafra-and-parisa"},
    "base/heart_to_heart/10412180": {"path":"stories/base-campaign/chippy-and-hammie"},
    "base/heart_to_heart/10413010": {"path":"stories/vaduso-mountains/florabelle-and-hewynn"},
    "base/heart_to_heart/10413020": {"path":"stories/vaduso-mountains/lorsan-and-florabelle-and-lyca"},
    "base/heart_to_heart/10413030": {"path":"stories/base-campaign/hammie-and-chippy-and-bryon"},
    "base/heart_to_heart/10413040": {"path":"stories/vaduso-mountains/chippy-and-lorsan"},
    "base/heart_to_heart/10413050": {"path":"stories/vaduso-mountains/lyca-and-chippy"},
    "base/heart_to_heart/10413060": {"path":"stories/vaduso-mountains/chippy-and-arden"},
    "base/heart_to_heart/10413070": {"path":"stories/base-campaign/lorsan-and-bryon"},
    "base/heart_to_heart/10413080": {"path":"stories/vaduso-mountains/eironn-and-lyca"},
    "base/heart_to_heart/10413090": {"path":"stories/vaduso-mountains/lorsan-and-eironn"},
    "base/heart_to_heart/10413100": {"path":"stories/vaduso-mountains/dahnie-and-arden"},
    "base/heart_to_heart/10413110": {"path":"stories/base-campaign/lorsan-and-bryon-heart-to-heart"},
    "base/heart_to_heart/10413120": {"path":"stories/vaduso-mountains/lyca-and-hammie-and-chippy"},
    "base/heart_to_heart/10413130": {"path":"stories/vaduso-mountains/florabelle-and-lorsan"},
    "base/heart_to_heart/10413140": {"path":"stories/vaduso-mountains/chippy-and-arden-heart-to-heart"},
    "base/heart_to_heart/10414010": {"path":"stories/remnant-peaks/hammie-and-chippy-and-lucius-and-valen"},
    "base/heart_to_heart/10414020": {"path":"stories/remnant-peaks/chippy-and-temesia"},
    "base/heart_to_heart/10414030": {"path":"stories/remnant-peaks/fay-and-valen-and-hammie"},
    "base/heart_to_heart/10414040": {"path":"stories/remnant-peaks/marilee-and-fay"},
    "base/heart_to_heart/10414050": {"path":"stories/remnant-peaks/chippy-and-atalanta"},
    "base/heart_to_heart/10414060": {"path":"stories/remnant-peaks/valen-and-lucius"},
    "base/heart_to_heart/10414070": {"path":"stories/remnant-peaks/hammie-and-scarlita"},
    "base/heart_to_heart/10414080": {"path":"stories/remnant-peaks/hammie-and-dionel"},
    "base/heart_to_heart/10414090": {"path":"stories/remnant-peaks/fay-and-hammie"},
    "base/heart_to_heart/10414100": {"path":"stories/base-campaign/atalanta-and-valen"},
    "base/heart_to_heart/10414110": {"path":"stories/remnant-peaks/fay-and-marilee"},
    "base/heart_to_heart/10414120": {"path":"stories/base-campaign/fay-and-temesia"},
    "base/heart_to_heart/10414130": {"path":"stories/remnant-peaks/lucius-and-hammie-and-chippy"},
    "base/heart_to_heart/10414140": {"path":"stories/base-campaign/dionel-and-scarlita"},
    "base/heart_to_heart/10414150": {"path":"stories/base-campaign/scarlita-and-dionel"},
    "base/heart_to_heart/10414160": {"path":"stories/base-campaign/atalanta-and-fay"},
    "base/heart_to_heart/10414170": {"path":"stories/remnant-peaks/marilee-and-chippy"},
    "season-1/main/11010101": {"path":"stories/song-of-strife/an-imposter"},
    "season-1/main/11010102": {"path":"stories/song-of-strife/the-festival-begins"},
    "season-1/main/11010103": {"path":"stories/song-of-strife/warriors-resolve"},
    "season-1/main/11010104": {"path":"stories/song-of-strife/blood-ties"},
    "season-1/main/11010105": {"path":"stories/song-of-strife/the-final-trial"},
    "season-1/main/11010106": {"path":"stories/song-of-strife/legend-of-mars-peak"},
    "season-1/main/11010107": {"path":"stories/song-of-strife/desert-champions"},
    "season-1/main/11010108": {"path":"stories/song-of-strife/treasure-hunt-trip"},
    "season-1/main/11010109": {"path":"stories/song-of-strife/alkali-mystery"},
    "season-1/main/11010110": {"path":"stories/song-of-strife/chase-the-claws"},
    "season-1/main/11010111": {"path":"stories/song-of-strife/old-grudges-return"},
    "season-1/main/11010112": {"path":"stories/song-of-strife/crimson-treasure"},
    "season-1/main/11010113": {"path":"stories/song-of-strife/evening-flute"},
    "season-1/main/11010114": {"path":"stories/song-of-strife/deep-red-blood"},
    "season-1/main/11010115": {"path":"stories/song-of-strife/lords-resting-place"},
    "season-1/side/11010200": {"path":"stories/song-of-strife/keys"},
    "season-1/side/11010201": {"path":"stories/song-of-strife/keys-side"},
    "season-1/side/11010202": {"path":"stories/song-of-strife/grimmaw-struggle"},
    "season-1/side/11010203": {"path":"stories/song-of-strife/for-the-children"},
    "season-1/side/11010204": {"path":"stories/song-of-strife/a-river-of-tears"},
    "season-1/side/11010205": {"path":"stories/song-of-strife/those-poor-animals"},
    "season-1/side/11010206": {"path":"stories/song-of-strife/journey-to-treasure"},
    "season-1/side/11010207": {"path":"stories/song-of-strife/our-future"},
    "season-1/side/11010208": {"path":"stories/song-of-strife/veteran"},
    "season-1/side/11010209": {"path":"stories/song-of-strife/lucky-survivors"},
    "season-1/reputation/101": {"path":"stories/song-of-strife/bounty-hunters"},
    "season-1/reputation/102": {"path":"stories/song-of-strife/grimmaw-clan"},
    "season-1/heart_to_heart/11411010": {"path":"stories/ashen-wastes/hammie-and-chippy-and-alsa-and-soren"},
    "season-1/heart_to_heart/11411020": {"path":"stories/ashen-wastes/chippy-and-soren-and-alsa"},
    "season-1/heart_to_heart/11411030": {"path":"stories/ashen-wastes/alsa-and-soren"},
    "season-1/heart_to_heart/11411040": {"path":"stories/ashen-wastes/alsa-and-soren-and-mikola"},
    "season-1/heart_to_heart/11411050": {"path":"stories/ashen-wastes/chippy-and-lumont-and-hammie"},
    "season-1/heart_to_heart/11411060": {"path":"stories/ashen-wastes/shakir"},
    "season-1/heart_to_heart/11411070": {"path":"stories/ashen-wastes/smokey"},
    "season-1/heart_to_heart/11411080": {"path":"stories/ashen-wastes/brutus"},
    "season-1/heart_to_heart/11411090": {"path":"stories/ashen-wastes/seth"},
    "season-1/heart_to_heart/11411100": {"path":"stories/ashen-wastes/hammie-and-alsa-and-soren"},
    "season-1/heart_to_heart/11411110": {"path":"stories/ashen-wastes/alsa"},
    "season-1/heart_to_heart/11411120": {"path":"stories/ashen-wastes/soren"},
    "season-1/heart_to_heart/11411130": {"path":"stories/ashen-wastes/alsa-and-chippy-and-mikola"},
    "season-1/heart_to_heart/11411140": {"path":"stories/song-of-strife/lumont"},
    "season-1/heart_to_heart/11411150": {"path":"stories/ashen-wastes/shakir-and-alsa-and-soren"},
    "season-1/heart_to_heart/11411160": {"path":"stories/ashen-wastes/smokey-heart-to-heart"},
    "season-1/heart_to_heart/11411170": {"path":"stories/ashen-wastes/alsa-and-brutus"},
    "season-1/heart_to_heart/11411180": {"path":"stories/ashen-wastes/seth-heart-to-heart"},
    "season-1/heart_to_heart/11412010": {"path":"stories/eroded-enclave-crimson-highlands/satrana-and-hammie-and-walker"},
    "season-1/heart_to_heart/11412020": {"path":"stories/eroded-enclave-crimson-highlands/soren-and-walker"},
    "season-1/heart_to_heart/11412030": {"path":"stories/eroded-enclave-crimson-highlands/satrana"},
    "season-1/heart_to_heart/11412040": {"path":"stories/eroded-enclave-crimson-highlands/hammie-and-satrana"},
    "season-1/heart_to_heart/11412050": {"path":"stories/eroded-enclave-crimson-highlands/walker-and-chippy-and-soren"},
    "season-1/heart_to_heart/11412060": {"path":"stories/eroded-enclave-crimson-highlands/odie-and-walker"},
    "season-1/heart_to_heart/11412070": {"path":"stories/eroded-enclave-crimson-highlands/hammie-and-koko-and-antandra"},
    "season-1/heart_to_heart/11412080": {"path":"stories/eroded-enclave-crimson-highlands/antandra-and-soren"},
    "season-1/heart_to_heart/11412090": {"path":"stories/eroded-enclave-crimson-highlands/rhys-and-soren"},
    "season-1/heart_to_heart/11412100": {"path":"stories/ashen-wastes-eroded-enclave-crimson-highlands/chippy"},
    "season-1/heart_to_heart/11412110": {"path":"stories/eroded-enclave-crimson-highlands/walker-and-hammie-and-satrana"},
    "season-1/heart_to_heart/11412120": {"path":"stories/eroded-enclave-crimson-highlands/antandra-and-soren-and-satrana"},
    "season-1/heart_to_heart/11412130": {"path":"stories/eroded-enclave-crimson-highlands/walker-and-soren"},
    "season-1/heart_to_heart/11412140": {"path":"stories/eroded-enclave-crimson-highlands/walker-and-satrana"},
    "season-1/heart_to_heart/11412150": {"path":"stories/eroded-enclave-crimson-highlands/odie-and-chippy-and-walker-and-satrana"},
    "season-1/heart_to_heart/11412160": {"path":"stories/eroded-enclave-crimson-highlands/chippy-and-antandra"},
    "season-1/heart_to_heart/11412170": {"path":"stories/eroded-enclave-crimson-highlands/koko"},
    "season-1/heart_to_heart/11412180": {"path":"stories/eroded-enclave-crimson-highlands/rhys-and-walker"},
    "season-2/main/12010101": {"path":"stories/waves-of-intrigue/distant-blue"},
    "season-2/main/12010102": {"path":"stories/waves-of-intrigue/perils-at-every-turn"},
    "season-2/main/12010103": {"path":"stories/waves-of-intrigue/clash-of-rival-gangs"},
    "season-2/main/12010104": {"path":"stories/waves-of-intrigue/a-desperate-plea"},
    "season-2/main/12010105": {"path":"stories/waves-of-intrigue/return-to-rustport"},
    "season-2/main/12010106": {"path":"stories/waves-of-intrigue/emergency-rescue"},
    "season-2/main/12010107": {"path":"stories/waves-of-intrigue/a-mission-of-stealth"},
    "season-2/main/12010108": {"path":"stories/waves-of-intrigue/drifting-at-sea"},
    "season-2/main/12010109": {"path":"stories/waves-of-intrigue/treasure-hunt"},
    "season-2/main/12010110": {"path":"stories/waves-of-intrigue/three-trials"},
    "season-2/main/12010111": {"path":"stories/waves-of-intrigue/land-of-riches"},
    "season-2/main/12010112": {"path":"stories/waves-of-intrigue/beyond-ashen-bay"},
    "season-2/main/12010113": {"path":"stories/waves-of-intrigue/dead-tide-outpost"},
    "season-2/main/12010114": {"path":"stories/waves-of-intrigue/immortal-showdown"},
    "season-2/side/12010201": {"path":"stories/waves-of-intrigue/beyond-the-horizon"},
    "season-2/side/12010202": {"path":"stories/waves-of-intrigue/for-rustport"},
    "season-2/side/12010203": {"path":"stories/waves-of-intrigue/rat-infestation"},
    "season-2/side/12010204": {"path":"stories/waves-of-intrigue/dreambound-road"},
    "season-2/side/12010205": {"path":"stories/waves-of-intrigue/savage-boar"},
    "season-2/side/12010206": {"path":"stories/waves-of-intrigue/ocean-dream"},
    "season-2/side/12010207": {"path":"stories/waves-of-intrigue/perfume-recipe"},
    "season-2/side/12010208": {"path":"stories/waves-of-intrigue/runaway-worker"},
    "season-2/side/12010209": {"path":"stories/waves-of-intrigue/the-bumbling-guest"},
    "season-2/side/12010210": {"path":"stories/waves-of-intrigue/wishing-for-miracles"},
    "season-2/side/12010211": {"path":"stories/waves-of-intrigue/gift-of-the-sea"},
    "season-2/side/12010212": {"path":"stories/waves-of-intrigue/master-of-divination"},
    "season-2/side/12010213": {"path":"stories/waves-of-intrigue/herbal-elixir"},
    "season-2/side/12010214": {"path":"stories/waves-of-intrigue/confidence-tonic"},
    "season-2/side/12010215": {"path":"stories/waves-of-intrigue/homeward-voyage"},
    "season-2/side/12010216": {"path":"stories/waves-of-intrigue/laborers-grind"},
    "season-2/side/12010217": {"path":"stories/waves-of-intrigue/running-key"},
    "season-2/side/12010218": {"path":"stories/waves-of-intrigue/cycle-key"},
    "season-2/side/12010219": {"path":"stories/waves-of-intrigue/hidden-key"},
    "season-2/side/12010222": {"path":"stories/waves-of-intrigue/novice-fisherman"},
    "season-2/side/12010223": {"path":"stories/waves-of-intrigue/skilled-fisherman"},
    "season-2/side/12010224": {"path":"stories/waves-of-intrigue/fishing-master"},
    "season-2/side/12010225": {"path":"stories/waves-of-intrigue/fish-kings-trial"},
    "season-2/side/12010226": {"path":"stories/waves-of-intrigue/fish-kings-legacy"},
    "season-2/side/12010601": {"path":"stories/waves-of-intrigue/cage-of-desire"},
    "season-2/side/12010602": {"path":"stories/waves-of-intrigue/shadow-pursuit"},
    "season-2/reputation/201": {"path":"stories/waves-of-intrigue/water-wights"},
    "season-2/reputation/202": {"path":"stories/waves-of-intrigue/carmine-whispers"},
    "season-2/reputation/12010521": {"path":"stories/waves-of-intrigue/daily-supply"},
    "season-2/reputation/12010524": {"path":"stories/waves-of-intrigue/troublemakers"},
    "season-2/reputation/12010536": {"path":"stories/waves-of-intrigue/departed-scholar"},
    "special-events/mini/1": {"path":"stories/waves-of-intrigue/falls-prelude"},
    "season-2/heart_to_heart/12411010": {"path":"stories/stormy-strait/hammie-and-sinbad"},
    "season-2/heart_to_heart/12411020": {"path":"stories/stormy-strait/sinbad-and-hammie"},
    "season-2/heart_to_heart/12411030": {"path":"stories/stormy-strait/hammie-and-sinbad-heart-to-heart"},
    "season-2/heart_to_heart/12411040": {"path":"stories/stormy-strait/sinbad-and-hammie-heart-to-heart"},
    "season-2/heart_to_heart/12411050": {"path":"stories/stormy-strait/chippy-and-hammie"},
    "season-2/heart_to_heart/12411060": {"path":"stories/waves-of-intrigue/hugin-and-hammie"},
    "season-2/heart_to_heart/12411070": {"path":"stories/stormy-strait/hugin-and-sinbad"},
    "season-2/heart_to_heart/12411080": {"path":"stories/stormy-strait/hammie"},
    "season-2/heart_to_heart/12411090": {"path":"stories/stormy-strait/sinbad-and-chippy"},
    "season-2/heart_to_heart/12411100": {"path":"stories/stormy-strait/chippy-and-hammie-and-sinbad"},
    "season-2/heart_to_heart/12411110": {"path":"stories/stormy-strait/sinbad-and-chippy-and-hammie"},
    "season-2/heart_to_heart/12411120": {"path":"stories/stormy-strait/hugin-and-hammie-and-chippy"},
    "season-2/heart_to_heart/12411130": {"path":"stories/waves-of-intrigue/chippy-and-sinbad"},
    "season-2/heart_to_heart/12411140": {"path":"stories/waves-of-intrigue/chippy-and-hammie"},
    "season-2/heart_to_heart/12411150": {"path":"stories/stormy-strait/hammie-and-chippy"},
    "season-2/heart_to_heart/12411160": {"path":"stories/stormy-strait/chippy-and-hammie-heart-to-heart"},
    "season-2/heart_to_heart/12411170": {"path":"stories/stormy-strait/sinbad-and-hammie-heart-to-heart-season-2"},
    "season-2/heart_to_heart/12411180": {"path":"stories/scandia-isles/nara-and-sonja"},
    "season-2/heart_to_heart/12411190": {"path":"stories/scandia-isles/sonja-and-chippy-and-hammie"},
    "season-2/heart_to_heart/12411200": {"path":"stories/scandia-isles-blackthorn-sea/sinbad-and-chippy"},
    "season-2/heart_to_heart/12411210": {"path":"stories/scandia-isles/hammie"},
    "season-2/heart_to_heart/12411220": {"path":"stories/scandia-isles/chippy-and-sonja-and-hammie"},
    "season-2/heart_to_heart/12411230": {"path":"stories/scandia-isles/sinbad-and-hammie-and-glimmerbloom"},
    "season-2/heart_to_heart/12411240": {"path":"stories/scandia-isles/sinbad-and-hammie-and-chippy"},
    "season-2/heart_to_heart/12411250": {"path":"stories/scandia-isles/nara-and-chippy-and-sonja-and-hammie"},
    "season-2/heart_to_heart/12411260": {"path":"stories/scandia-isles/sonja-and-hammie-and-chippy"},
    "season-2/heart_to_heart/12411270": {"path":"stories/blackthorn-sea/chippy-and-sonja"},
    "season-2/heart_to_heart/12411280": {"path":"stories/blackthorn-sea/hammie-and-chippy"},
    "season-2/heart_to_heart/12411290": {"path":"stories/blackthorn-sea/chippy-and-hammie"},
    "season-2/heart_to_heart/12411300": {"path":"stories/blackthorn-sea/hammie-and-chippy-heart-to-heart"},
    "season-2/heart_to_heart/12411310": {"path":"stories/blackthorn-sea/sonja-and-hammie-and-chippy"},
    "season-2/heart_to_heart/12411320": {"path":"stories/blackthorn-sea/sonja"},
    "season-2/heart_to_heart/12411330": {"path":"stories/waves-of-intrigue/chippy-and-hammie-heart-to-heart"},
    "season-2/heart_to_heart/12411340": {"path":"stories/blackthorn-sea/hammie"},
    "season-2/heart_to_heart/12411350": {"path":"stories/blackthorn-sea/hammie-and-sonja"},
    "season-2/heart_to_heart/12411360": {"path":"stories/blackthorn-sea/chippy-and-hammie-heart-to-heart"},
    "season-2/heart_to_heart/12411370": {"path":"stories/blackthorn-sea/sonja-and-hammie"},
    "season-2/heart_to_heart/12411380": {"path":"stories/waves-of-intrigue/lucca-and-sonja"},
    "season-2/heart_to_heart/12411390": {"path":"stories/waves-of-intrigue/hammie-and-lucca"},
    "season-2/heart_to_heart/12411400": {"path":"stories/waves-of-intrigue/hugin-and-chippy"},
    "season-2/heart_to_heart/12411410": {"path":"stories/stormy-strait/lucca-and-hammie"},
    "season-2/heart_to_heart/12411420": {"path":"stories/stormy-strait/sinbad-and-hammie-heart-to-heart-season-2-12411420"},
    "season-2/heart_to_heart/12411430": {"path":"stories/stormy-strait/hammie-and-sonja"},
    "season-2/heart_to_heart/12411440": {"path":"stories/stormy-strait/hugin-and-chippy"},
    "season-3/main/13010101": {"path":"stories/chains-of-eternity/duchy-of-whiteridge"},
    "season-3/main/13010102": {"path":"stories/chains-of-eternity/snowspire-festival"},
    "season-3/main/13010103": {"path":"stories/chains-of-eternity/ghostly-hot-springs"},
    "season-3/main/13010104": {"path":"stories/chains-of-eternity/masquerade-ball"},
    "season-3/main/13010105": {"path":"stories/chains-of-eternity/closing-ceremony"},
    "season-3/main/13010106": {"path":"stories/chains-of-eternity/festival-rerun"},
    "season-3/main/13010107": {"path":"stories/chains-of-eternity/repeat"},
    "season-3/main/13010108": {"path":"stories/chains-of-eternity/hero-of-legend"},
    "season-3/main/13010109": {"path":"stories/chains-of-eternity/faith-and-evil"},
    "season-3/main/13010110": {"path":"stories/chains-of-eternity/secrets-within"},
    "season-3/main/13010111": {"path":"stories/chains-of-eternity/frozen-abyss"},
    "season-3/main/13010112": {"path":"stories/chains-of-eternity/twisted-castle"},
    "season-3/main/13010113": {"path":"stories/chains-of-eternity/frozen-legacy"},
    "season-3/main/13010114": {"path":"stories/chains-of-eternity/afterglow-of-snow"},
    "season-3/main/13010115": {"path":"stories/chains-of-eternity/drifting-snowflakes"},
    "season-3/side/13010122": {"path":"stories/chains-of-eternity/snowball-fight"},
    "season-3/side/13010123": {"path":"stories/chains-of-eternity/icy-sweep"},
    "season-3/side/13010124": {"path":"stories/chains-of-eternity/snowman-chase"},
    "season-3/side/13010131": {"path":"stories/chains-of-eternity/upon-the-divine-war"},
    "season-3/side/13010132": {"path":"stories/chains-of-eternity/between-time-and-space"},
    "season-3/side/13010133": {"path":"stories/chains-of-eternity/relentless-warriors"},
    "season-3/side/13010201": {"path":"stories/chains-of-eternity/souls-revelation"},
    "season-3/side/13010202": {"path":"stories/chains-of-eternity/abandoned-cabin"},
    "season-3/side/13010203": {"path":"stories/chains-of-eternity/not-completed"},
    "season-3/side/13010207": {"path":"stories/chains-of-eternity/world-before-you"},
    "season-3/side/13010204": {"path":"stories/chains-of-eternity/spring-expansion"},
    "season-3/side/13010205": {"path":"stories/chains-of-eternity/run-sasha-run"},
    "season-3/side/13010206": {"path":"stories/chains-of-eternity/the-mage-and-the-adventurer"},
    "season-3/side/13010208": {"path":"stories/chains-of-eternity/trust-the-process"},
    "season-3/side/13010209": {"path":"stories/chains-of-eternity/a-mothers-longing"},
    "season-3/side/13010210": {"path":"stories/chains-of-eternity/honeyed-apologies"},
    "season-3/side/13010211": {"path":"stories/chains-of-eternity/land-of-blessing"},
    "season-3/side/13010212": {"path":"stories/chains-of-eternity/run-snowman"},
    "season-3/side/13010213": {"path":"stories/chains-of-eternity/culinary-crusade"},
    "season-3/side/13010214": {"path":"stories/chains-of-eternity/ones-heritage"},
    "season-3/side/13010215": {"path":"stories/chains-of-eternity/real-archaeology"},
    "season-3/side/13010216": {"path":"stories/chains-of-eternity/long-awaited-reunion"},
    "season-3/side/13010218": {"path":"stories/chains-of-eternity/light-of-tomorrow"},
    "season-3/side/13010219": {"path":"stories/chains-of-eternity/dearest-child"},
    "season-3/side/13010220": {"path":"stories/chains-of-eternity/night-of-fishing"},
    "season-3/side/13010322": {"path":"stories/chains-of-eternity/drowning-teapot"},
    "season-3/reputation/301": {"path":"stories/chains-of-eternity/whiteridge-graveborn"},
    "season-3/reputation/302": {"path":"stories/chains-of-eternity/duchy-of-whiteridge-reputation"},
    "season-3/reputation/13010535": {"path":"stories/chains-of-eternity/feast-for-the-guards"},
    "special-events/mini/2": {"path":"stories/emberlight-revelry/joyful-fest"},
    "special-events/mini/emberlight_blessings": {"path":"stories/emberlight-revelry/emberlight-blessings"},
    "special-events/mini/3": {"path":"stories/chains-of-eternity/sunrise-overture"},
    "season-3/heart_to_heart/13411010": {"path":"stories/west-whiteridge/hugin-and-chippy"},
    "season-3/heart_to_heart/13411020": {"path":"stories/west-whiteridge/hammie-and-faramor-and-chippy"},
    "season-3/heart_to_heart/13411030": {"path":"stories/chains-of-eternity/hugin-and-chippy"},
    "season-3/heart_to_heart/13411040": {"path":"stories/west-whiteridge/faramor-and-hammie"},
    "season-3/heart_to_heart/13411050": {"path":"stories/west-whiteridge/hammie-and-chippy"},
    "season-3/heart_to_heart/13411060": {"path":"stories/west-whiteridge/faramor-and-hammie-heart-to-heart"},
    "season-3/heart_to_heart/13411070": {"path":"stories/west-whiteridge/chippy-and-gerda-and-hammie"},
    "season-3/heart_to_heart/13411080": {"path":"stories/west-whiteridge/hammie-and-lorsan-and-chippy"},
    "season-3/heart_to_heart/13411090": {"path":"stories/chains-of-eternity/gerda-and-lorsan"},
    "season-3/heart_to_heart/13411100": {"path":"stories/chains-of-eternity/lorsan-and-hammie"},
    "season-3/heart_to_heart/13411110": {"path":"stories/west-whiteridge/chippy-and-hammie"},
    "season-3/heart_to_heart/13411120": {"path":"stories/west-whiteridge/chippy-and-lorsan-and-hammie"},
    "season-3/heart_to_heart/13411130": {"path":"stories/west-whiteridge/hammie-and-valka-and-chippy"},
    "season-3/heart_to_heart/13411140": {"path":"stories/west-whiteridge/gerda-and-hammie"},
    "season-3/heart_to_heart/13411150": {"path":"stories/west-whiteridge/faramor-and-hammie-heart-to-heart-season-3"},
    "season-3/heart_to_heart/13411160": {"path":"stories/west-whiteridge/hammie-and-chippy-heart-to-heart"},
    "season-3/heart_to_heart/13411170": {"path":"stories/west-whiteridge-east-whiteridge/chippy-and-hammie"},
    "season-3/heart_to_heart/13411180": {"path":"stories/west-whiteridge-east-whiteridge/chippy-and-hammie-heart-to-heart"},
    "season-3/heart_to_heart/13411190": {"path":"stories/west-whiteridge/valka-and-hammie"},
    "season-3/heart_to_heart/13411200": {"path":"stories/west-whiteridge/hammie-and-ludovic"},
    "season-3/heart_to_heart/13411210": {"path":"stories/east-whiteridge/valka-and-hammie"},
    "season-3/heart_to_heart/13411220": {"path":"stories/east-whiteridge/chippy-and-hammie"},
    "season-3/heart_to_heart/13411230": {"path":"stories/east-whiteridge/valka-and-chippy"},
    "season-3/heart_to_heart/13411240": {"path":"stories/east-whiteridge/hammie-and-chippy"},
    "season-3/heart_to_heart/13411250": {"path":"stories/east-whiteridge/valka-and-chippy-heart-to-heart"},
    "season-3/heart_to_heart/13411260": {"path":"stories/east-whiteridge/ludovic-and-hammie"},
    "season-3/heart_to_heart/13411270": {"path":"stories/east-whiteridge/hammie-and-carolina"},
    "season-3/heart_to_heart/13411280": {"path":"stories/chains-of-eternity/igor-and-chippy"},
    "season-3/heart_to_heart/13411290": {"path":"stories/chains-of-eternity/callan-and-carolina"},
    "season-4/main/14010101": {"path":"stories/echoes-of-dissent/royal-decree"},
    "season-4/main/14010102": {"path":"stories/echoes-of-dissent/brimstone-secrets"},
    "season-4/main/14010103": {"path":"stories/echoes-of-dissent/beneath-the-crown"},
    "season-4/main/14010104": {"path":"stories/echoes-of-dissent/royal-city-unveiled"},
    "season-4/main/14010105": {"path":"stories/echoes-of-dissent/an-unexpected-sight"},
    "season-4/main/14010106": {"path":"stories/echoes-of-dissent/the-price-of-truth"},
    "season-4/main/14010107": {"path":"stories/echoes-of-dissent/a-difficult-decision"},
    "season-4/main/14010108": {"path":"stories/echoes-of-dissent/first-flames-chosen"},
    "season-4/main/14010109": {"path":"stories/echoes-of-dissent/light-after-lies"},
    "season-4/main/14010130": {"path":"stories/echoes-of-dissent/return-in-moonlight"},
    "season-4/side/14010201": {"path":"stories/echoes-of-dissent/track-the-runaway"},
    "season-4/side/14010202": {"path":"stories/echoes-of-dissent/a-noble-heart"},
    "season-4/side/14010211": {"path":"stories/echoes-of-dissent/aspiring-minstrel"},
    "season-4/side/14010212": {"path":"stories/echoes-of-dissent/unfulfilled-wish"},
    "season-4/side/14010213": {"path":"stories/echoes-of-dissent/hope-forged-anew"},
    "season-4/side/14010214": {"path":"stories/echoes-of-dissent/burden-of-the-crown"},
    "season-4/side/14010215": {"path":"stories/echoes-of-dissent/forgemaster"},
    "season-4/side/14010216": {"path":"stories/echoes-of-dissent/the-life-of-lowborns"},
    "season-4/side/14010217": {"path":"stories/echoes-of-dissent/outer-influence"},
    "season-4/side/14010218": {"path":"stories/echoes-of-dissent/galis-book"},
    "season-4/side/14010219": {"path":"stories/echoes-of-dissent/priceless-treasure"},
    "season-4/side/14010222": {"path":"stories/echoes-of-dissent/pipe-crisis"},
    "season-4/side/14010220": {"path":"stories/echoes-of-dissent/the-brewmaster"},
    "season-4/side/14010221": {"path":"stories/echoes-of-dissent/teardrop-in-water"},
    "season-4/side/14010223": {"path":"stories/echoes-of-dissent/reunion-dinner"},
    "season-4/side/14010224": {"path":"stories/echoes-of-dissent/shattered-belief"},
    "season-4/side/14010225": {"path":"stories/echoes-of-dissent/simans-wish"},
    "season-4/side/14010226": {"path":"stories/echoes-of-dissent/lost-ducks"},
    "season-4/side/14010227": {"path":"stories/echoes-of-dissent/storage-dispute"},
    "season-4/side/14010228": {"path":"stories/echoes-of-dissent/blooming-friendship"},
    "season-4/side/14010229": {"path":"stories/echoes-of-dissent/reeled-in"},
    "season-4/side/14010230": {"path":"stories/echoes-of-dissent/boom-a-happy-life"},
    "special-events/mini/14010240": {"path":"stories/potion-panacea/work-hazards"},
    "special-events/mini/14010241": {"path":"stories/potion-panacea/high-horse-fever"},
    "special-events/mini/14010242": {"path":"stories/potion-panacea/unrequited-love"},
    "special-events/mini/14010243": {"path":"stories/potion-panacea/heroic-itch"},
    "special-events/mini/14010244": {"path":"stories/potion-panacea/real-cause"},
    "season-4/reputation/401": {"path":"stories/echoes-of-dissent/brimstone-village"},
    "season-4/reputation/402": {"path":"stories/echoes-of-dissent/salthorin"},
    "season-4/reputation/14010513": {"path":"stories/echoes-of-dissent/smooth-ride"},
    "season-4/reputation/14010514": {"path":"stories/echoes-of-dissent/fishy-business"},
    "season-4/reputation/14010532": {"path":"stories/echoes-of-dissent/shady-dealings"},
    "season-4/reputation/14010537": {"path":"stories/echoes-of-dissent/the-fundraiser"},
    "special-events/mini/5": {"path":"stories/echoes-of-dissent/sunlit-pact"},
    "special-events/mini/6": {"path":"stories/echoes-of-dissent/pandoras-reminiscence"},
    "special-events/mini/potion_panacea-patients": {"path":"stories/potion-panacea/patient-encounters"},
    "season-4/heart_to_heart/14411010": {"path":"stories/ironhold-bay/hammie-and-chippy-and-hogan"},
    "season-4/heart_to_heart/14411020": {"path":"stories/ironhold-bay/chippy-and-hammie"},
    "season-4/heart_to_heart/14411030": {"path":"stories/ironhold-bay/hammie-and-chippy"},
    "season-4/heart_to_heart/14411040": {"path":"stories/ironhold-bay/zanie-and-chippy"},
    "season-4/heart_to_heart/14411050": {"path":"stories/echoes-of-dissent/hammie-and-hogan"},
    "season-4/heart_to_heart/14411060": {"path":"stories/ironhold-bay/chippy-and-hammie-heart-to-heart"},
    "season-4/heart_to_heart/14411070": {"path":"stories/ironhold-bay/chippy-and-hammie-heart-to-heart-season-4"},
    "season-4/heart_to_heart/14411080": {"path":"stories/echoes-of-dissent/chippy-and-zanie"},
    "season-4/heart_to_heart/14411090": {"path":"stories/salthorin/zanie"},
    "season-4/heart_to_heart/14411100": {"path":"stories/salthorin/indris"},
    "season-4/heart_to_heart/14411110": {"path":"stories/salthorin/ravion-and-indris"},
    "season-4/heart_to_heart/14411120": {"path":"stories/salthorin/velara-and-ravion"},
    "season-4/heart_to_heart/14411130": {"path":"stories/salthorin/zanie-heart-to-heart"},
    "season-4/heart_to_heart/14411140": {"path":"stories/salthorin/ravion"},
    "season-4/heart_to_heart/14411150": {"path":"stories/echoes-of-dissent/velara"},
    "season-4/heart_to_heart/14411160": {"path":"stories/salthorin/indris-heart-to-heart"},
    "season-4/heart_to_heart/14411170": {"path":"stories/ember-mine/zanie"},
    "season-4/heart_to_heart/14411180": {"path":"stories/ember-mine/indris-and-thador"},
    "season-4/heart_to_heart/14411190": {"path":"stories/ember-mine/indris"},
    "season-4/heart_to_heart/14411200": {"path":"stories/echoes-of-dissent/thador"},
    "season-4/heart_to_heart/14411210": {"path":"stories/ember-mine/zanie-heart-to-heart"},
    "season-4/heart_to_heart/14411220": {"path":"stories/ember-mine/indris-heart-to-heart"},
    "season-4/heart_to_heart/14411230": {"path":"stories/ironhold-bay/zanie-and-indris"},
    "season-4/heart_to_heart/14411240": {"path":"stories/ironhold-bay/zanie"},
    "season-4/heart_to_heart/14411250": {"path":"stories/echoes-of-dissent/indris"},
    "season-4/heart_to_heart/14411260": {"path":"stories/salthorin/ravion-heart-to-heart"},
    "season-4/heart_to_heart/14411270": {"path":"stories/echoes-of-dissent/indris-heart-to-heart"},
    "season-4/heart_to_heart/14411280": {"path":"stories/echoes-of-dissent/zanie"},
    "season-4/heart_to_heart/14411290": {"path":"stories/echoes-of-dissent/ravion"},
    "season-5/main/15010101": {"path":"stories/thorns-of-devotion/arrival-beyond-time"},
    "season-5/main/15010102": {"path":"stories/thorns-of-devotion/vow-against-darkness"},
    "season-5/main/15010103": {"path":"stories/thorns-of-devotion/shadow-over-halia"},
    "season-5/main/15010104": {"path":"stories/thorns-of-devotion/flood-of-betrayal"},
    "season-5/main/15010105": {"path":"stories/thorns-of-devotion/clues-in-the-wild"},
    "season-5/main/15010106": {"path":"stories/thorns-of-devotion/darkness-rekindled"},
    "season-5/main/15010107": {"path":"stories/thorns-of-devotion/by-her-name"},
    "season-5/main/15010108": {"path":"stories/thorns-of-devotion/love-and-lies"},
    "season-5/main/15010109": {"path":"stories/thorns-of-devotion/sky-burns-red"},
    "season-5/main/15010110": {"path":"stories/thorns-of-devotion/principles-of-life"},
    "season-5/main/15010111": {"path":"stories/thorns-of-devotion/where-we-meet-again"},
    "season-5/main/15010112": {"path":"stories/thorns-of-devotion/fateful-path"},
    "season-5/side/15010201": {"path":"stories/thorns-of-devotion/line-between-us"},
    "season-5/side/15010204": {"path":"stories/thorns-of-devotion/to-rend-the-veil"},
    "season-5/side/15010205": {"path":"stories/thorns-of-devotion/to-mend-the-heart"},
    "season-5/side/15010202": {"path":"stories/thorns-of-devotion/where-love-leads"},
    "season-5/side/15010203": {"path":"stories/thorns-of-devotion/survivor"},
    "season-5/side/15010206": {"path":"stories/thorns-of-devotion/hunter-tryout"},
    "season-5/side/15010207": {"path":"stories/thorns-of-devotion/fear-of-heights"},
    "season-5/side/15010208": {"path":"stories/thorns-of-devotion/life-once-lived"},
    "season-5/side/15010210": {"path":"stories/thorns-of-devotion/a-grand-farewell"},
    "season-5/side/15010211": {"path":"stories/thorns-of-devotion/the-darkness-lifts"},
    "season-5/side/15010217": {"path":"stories/thorns-of-devotion/born-to-face-death"},
    "season-5/side/15010218": {"path":"stories/thorns-of-devotion/divine-blessing"},
    "season-5/side/15010219": {"path":"stories/thorns-of-devotion/sacred-offering"},
    "season-5/side/15010220": {"path":"stories/thorns-of-devotion/path-to-redemption"},
    "season-5/side/15010221": {"path":"stories/thorns-of-devotion/merlins-compassion"},
    "season-5/side/15010222": {"path":"stories/thorns-of-devotion/special-candy"},
    "season-5/side/15010225": {"path":"stories/thorns-of-devotion/remove-the-wedge"},
    "season-5/side/15010226": {"path":"stories/thorns-of-devotion/remove-the-wedge-side"},
    "season-5/side/15010227": {"path":"stories/thorns-of-devotion/remove-the-wedge-side-season-5"},
    "season-5/side/15010228": {"path":"stories/thorns-of-devotion/the-divine-servant"},
    "season-5/side/15010229": {"path":"stories/thorns-of-devotion/after-the-flood"},
    "season-5/side/15010230": {"path":"stories/thorns-of-devotion/halias-plight"},
    "season-5/side/15010233": {"path":"stories/thorns-of-devotion/mystery-in-the-swamp"},
    "season-5/side/15010234": {"path":"stories/thorns-of-devotion/black-mist"},
    "season-5/side/15010235": {"path":"stories/thorns-of-devotion/rays-of-trust"},
    "season-5/side/15010236": {"path":"stories/thorns-of-devotion/intensifying-curse"},
    "season-5/side/15010237": {"path":"stories/thorns-of-devotion/remnants-of-a-hero"},
    "season-5/side/15010238": {"path":"stories/thorns-of-devotion/work-preparation"},
    "season-5/side/15010239": {"path":"stories/thorns-of-devotion/secret-of-corruption"},
    "season-5/side/15010240": {"path":"stories/thorns-of-devotion/way-of-peace"},
    "season-5/side/15010241": {"path":"stories/thorns-of-devotion/residual-power"},
    "season-5/side/15010242": {"path":"stories/thorns-of-devotion/hearts-amid-hardship"},
    "season-5/side/15010243": {"path":"stories/thorns-of-devotion/beyond-hatred"},
    "season-5/side/15010520": {"path":"stories/thorns-of-devotion/crimson-dreams"},
    "season-5/reputation/501": {"path":"stories/thorns-of-devotion/halia"},
    "season-5/reputation/502": {"path":"stories/thorns-of-devotion/wildborn"},
    "season-5/reputation/15010525": {"path":"stories/thorns-of-devotion/life-in-the-waters"},
    "season-5/reputation/15010534": {"path":"stories/thorns-of-devotion/culinary-invention"},
    "season-5/reputation/15010538": {"path":"stories/thorns-of-devotion/hunting-assignment"},
    "special-events/mini/9": {"path":"stories/thorns-of-devotion/winter-carnival"},
    "season-5/exploration/15010335": {"path":"stories/thorns-of-devotion/fishing-waterlogged-sack"},
    "season-5/exploration/15010380": {"path":"stories/thorns-of-devotion/fishing-lost-pendant"},
    "season-5/heart_to_heart/15411010": {"path":"stories/herdmaster-woods/gala"},
    "season-5/heart_to_heart/15411020": {"path":"stories/herdmaster-woods/kordan"},
    "season-5/heart_to_heart/15411030": {"path":"stories/herdmaster-woods/gala-heart-to-heart"},
    "season-5/heart_to_heart/15411040": {"path":"stories/herdmaster-woods/kordan-and-gala"},
    "season-5/heart_to_heart/15411050": {"path":"stories/herdmaster-woods/gala-heart-to-heart-season-5"},
    "season-5/heart_to_heart/15411060": {"path":"stories/herdmaster-woods/kordan-and-gala-heart-to-heart"},
    "season-5/heart_to_heart/15411070": {"path":"stories/herdmaster-woods/morgan-and-merlin-the-first"},
    "season-5/heart_to_heart/15411080": {"path":"stories/herdmaster-woods/gala-heart-to-heart-season-5-15411080"},
    "season-5/heart_to_heart/15411090": {"path":"stories/herdmaster-woods/gala-heart-to-heart-season-5-15411090"},
    "season-5/heart_to_heart/15411100": {"path":"stories/herdmaster-woods/gala-and-merlin-the-first"},
    "season-5/heart_to_heart/15411110": {"path":"stories/herdmaster-woods/gala-and-merlin-the-first-heart-to-heart"},
    "season-5/heart_to_heart/15411120": {"path":"stories/herdmaster-woods-rift-highlands/merlin-the-first"},
    "season-5/heart_to_heart/15411130": {"path":"stories/herdmaster-woods/morgan-and-merlin-the-first-heart-to-heart"},
    "season-5/heart_to_heart/15411140": {"path":"stories/herdmaster-woods/nazrik-and-morgan"},
    "season-5/heart_to_heart/15411150": {"path":"stories/rift-highlands/morgan-and-gala"},
    "season-5/heart_to_heart/15411160": {"path":"stories/rift-highlands/perseus-and-merlin-the-first"},
    "season-5/heart_to_heart/15411170": {"path":"stories/rift-highlands/gala-and-merlin-the-first"},
    "season-5/heart_to_heart/15411180": {"path":"stories/herdmaster-woods-rift-highlands/merlin-the-first-and-morgan"},
    "season-5/heart_to_heart/15411190": {"path":"stories/rift-highlands/gala-and-merlin-the-first-heart-to-heart"},
    "season-5/heart_to_heart/15411200": {"path":"stories/rift-highlands/merlin-the-first-and-gala"},
    "season-5/heart_to_heart/15411210": {"path":"stories/rift-highlands/gala-and-nazrik"},
    "season-5/heart_to_heart/15411220": {"path":"stories/rift-highlands/gala"},
    "season-5/heart_to_heart/15411230": {"path":"stories/rift-highlands/nazrik-and-gala"},
    "season-5/heart_to_heart/15411240": {"path":"stories/rift-highlands/gala-and-nazrik-heart-to-heart"},
    "season-5/heart_to_heart/15411250": {"path":"stories/rift-highlands/gala-and-nazrik-heart-to-heart-season-5"},
    "season-6/main/16010101": {"path":"stories/tower-of-memory/shadows-over-lyceum"},
    "season-6/main/16010102": {"path":"stories/tower-of-memory/rules-unbound"},
    "season-6/main/16010103": {"path":"stories/tower-of-memory/fresh-faces"},
    "season-6/main/16010104": {"path":"stories/tower-of-memory/the-trials-begin"},
    "season-6/main/16010105": {"path":"stories/tower-of-memory/gloomy-turn"},
    "season-6/main/16010106": {"path":"stories/tower-of-memory/royal-envoy"},
    "season-6/main/16010107": {"path":"stories/tower-of-memory/fractured-answer"},
    "season-6/main/16010108": {"path":"stories/tower-of-memory/trials-resume"},
    "season-6/main/16010109": {"path":"stories/tower-of-memory/hamster-heist"},
    "season-6/main/16010110": {"path":"stories/tower-of-memory/purpose-unmasked"},
    "season-6/main/16010111": {"path":"stories/tower-of-memory/starlit-verdict"},
    "season-6/main/16010112": {"path":"stories/tower-of-memory/silent-drama"},
    "season-6/side/16010203": {"path":"stories/tower-of-memory/glorious-revival"},
    "season-6/side/16010204": {"path":"stories/tower-of-memory/chaos-manifest"},
    "season-6/side/16010226": {"path":"stories/tower-of-memory/beneath-the-wings"},
    "season-6/side/16010205": {"path":"stories/tower-of-memory/welcome-to-the-club"},
    "season-6/side/16010207": {"path":"stories/tower-of-memory/rocky-affair"},
    "season-6/side/16010210": {"path":"stories/tower-of-memory/dream-job"},
    "season-6/side/16010212": {"path":"stories/tower-of-memory/moonlit-ball"},
    "season-6/side/16010213": {"path":"stories/tower-of-memory/the-flutist"},
    "season-6/side/16010214": {"path":"stories/tower-of-memory/magic-jelly"},
    "season-6/side/16010215": {"path":"stories/tower-of-memory/ruler-of-all"},
    "season-6/side/16010216": {"path":"stories/tower-of-memory/voices-in-empty-halls"},
    "season-6/side/16010217": {"path":"stories/tower-of-memory/mysterious-mirror"},
    "season-6/side/16010219": {"path":"stories/tower-of-memory/memory-lane"},
    "season-6/side/16010221": {"path":"stories/tower-of-memory/covert-pursuit-i"},
    "season-6/side/16010222": {"path":"stories/tower-of-memory/covert-pursuit-ii"},
    "season-6/side/16010223": {"path":"stories/tower-of-memory/stars-and-scales"},
    "season-6/side/16010224": {"path":"stories/tower-of-memory/passing-north-wind"},
    "season-6/side/16010225": {"path":"stories/tower-of-memory/echoes-among-trees-1"},
    "season-6/side/16010227": {"path":"stories/tower-of-memory/echoes-among-trees-2"},
    "season-6/side/16010231": {"path":"stories/tower-of-memory/celebration-time"},
    "season-6/reputation/601": {"path":"stories/tower-of-memory/magical-creatures"},
    "season-6/reputation/602": {"path":"stories/tower-of-memory/serene-lyceum"},
    "season-6/reputation/16010513": {"path":"stories/tower-of-memory/keys-and-fish"},
    "season-6/reputation/16010522": {"path":"stories/tower-of-memory/missing-scroll"},
    "special-events/mini/12": {"path":"stories/tower-of-memory/enduring-wish"},
    "special-events/mini/18": {"path":"stories/tower-of-memory/verdant-quandary"},
    "season-6/heart_to_heart/16411010": {"path":"stories/starfall-county/zorya"},
    "season-6/heart_to_heart/16411020": {"path":"stories/starfall-county/contess"},
    "season-6/heart_to_heart/16411030": {"path":"stories/starfall-county/rowan"},
    "season-6/heart_to_heart/16411040": {"path":"stories/starfall-county/hammie-and-pippa"},
    "season-6/heart_to_heart/16411050": {"path":"stories/starfall-county/contess-heart-to-heart"},
    "season-6/heart_to_heart/16411060": {"path":"stories/starfall-county/rowan-heart-to-heart"},
    "season-6/heart_to_heart/16411070": {"path":"stories/starfall-county/silven"},
    "season-6/heart_to_heart/16411080": {"path":"stories/starfall-county/chippy-and-hammie"},
    "season-6/heart_to_heart/16411090": {"path":"stories/starfall-county/pippa"},
    "season-6/heart_to_heart/16411100": {"path":"stories/starfall-county/silven-heart-to-heart"},
    "season-6/heart_to_heart/16411110": {"path":"stories/starfall-county/pippa-heart-to-heart"},
    "season-6/heart_to_heart/16411120": {"path":"stories/starfall-county/silven-heart-to-heart-season-6"},
    "season-6/heart_to_heart/16411130": {"path":"stories/starfall-county/hepler"},
    "season-6/heart_to_heart/16411140": {"path":"stories/starfall-county/cassadee"},
    "season-6/heart_to_heart/16411150": {"path":"stories/starfall-county/cassadee-heart-to-heart"},
    "season-6/heart_to_heart/16411160": {"path":"stories/starfall-county/aurelian"},
    "season-6/heart_to_heart/16411170": {"path":"stories/starfall-county/evie"},
    "season-6/heart_to_heart/16411180": {"path":"stories/starfall-county/peggy"},
    "season-6/heart_to_heart/16411190": {"path":"stories/starfall-county/evie-heart-to-heart"},
    "season-6/heart_to_heart/16411200": {"path":"stories/starfall-county/imperial-soldier-and-peggy"},
    "season-6/heart_to_heart/16411210": {"path":"stories/starfall-county/rowan-heart-to-heart-season-6"},
    "season-6/heart_to_heart/16411220": {"path":"stories/starfall-county/hammie-and-chippy"},
    "season-6/heart_to_heart/16411221": {"path":"stories/starfall-county/chippy-and-hammie-heart-to-heart"},
    "season-6/heart_to_heart/16411230": {"path":"stories/skyrealm-forest/solise"},
    "season-6/heart_to_heart/16411240": {"path":"stories/skyrealm-forest/hepler"},
    "season-6/heart_to_heart/16411250": {"path":"stories/skyrealm-forest/pippa"},
    "season-6/heart_to_heart/16411260": {"path":"stories/skyrealm-forest/solise-heart-to-heart"},
    "season-6/heart_to_heart/16411270": {"path":"stories/skyrealm-forest/pippa-heart-to-heart"},
    "season-7/main/17010101": {"path":"stories/crown-of-ashes/festival-invitation"},
    "season-7/main/17010102": {"path":"stories/crown-of-ashes/curtain-rises"},
    "season-7/main/17010103": {"path":"stories/crown-of-ashes/gone-and-remaining"},
    "season-7/main/17010104": {"path":"stories/crown-of-ashes/twin-prophecies"},
    "season-7/main/17010105": {"path":"stories/crown-of-ashes/beneath-the-web"},
    "season-7/main/17010106": {"path":"stories/crown-of-ashes/caged-wings"},
    "season-7/main/17010107": {"path":"stories/crown-of-ashes/beyond-the-dream"},
    "season-7/main/17010108": {"path":"stories/crown-of-ashes/the-sword-and-the-king"},
    "season-7/main/17010109": {"path":"stories/crown-of-ashes/last-thread-i"},
    "season-7/main/17010110": {"path":"stories/crown-of-ashes/last-thread-ii"},
    "season-7/side/17010201": {"path":"stories/crown-of-ashes/sword-hunt-i"},
    "season-7/side/17010202": {"path":"stories/crown-of-ashes/sword-hunt-ii"},
    "season-7/side/17010203": {"path":"stories/crown-of-ashes/backstage-mage"},
    "season-7/side/17010204": {"path":"stories/crown-of-ashes/catch-the-runaways"},
    "season-7/side/17010207": {"path":"stories/crown-of-ashes/a-princess-holiday"},
    "season-7/side/17010208": {"path":"stories/crown-of-ashes/twilight-accord"},
    "season-7/side/17010209": {"path":"stories/crown-of-ashes/the-savannah-eye-i"},
    "season-7/side/17010212": {"path":"stories/crown-of-ashes/grandets-trouble"},
    "season-7/side/17010214": {"path":"stories/crown-of-ashes/real-life-drama"},
    "season-7/side/17010215": {"path":"stories/crown-of-ashes/roses-and-thorns-i"},
    "season-7/side/17010216": {"path":"stories/crown-of-ashes/roses-and-thorns-ii"},
    "season-7/side/17010217": {"path":"stories/crown-of-ashes/roses-and-thorns-iii"},
    "season-7/side/17010218": {"path":"stories/crown-of-ashes/roses-and-thorns-iv"},
    "season-7/side/17010219": {"path":"stories/crown-of-ashes/farewell-miss-pearl"},
    "season-7/side/17010220": {"path":"stories/crown-of-ashes/the-savannah-eye-ii"},
    "season-7/side/17010221": {"path":"stories/crown-of-ashes/to-the-tavern"},
    "season-7/side/17010222": {"path":"stories/crown-of-ashes/to-the-riverbank"},
    "season-7/side/17010223": {"path":"stories/crown-of-ashes/to-hunting-grounds"},
    "special-events/mini/19": {"path":"stories/crown-of-ashes/journey-across-dimensions"},
    "season-7/exploration/17010362": {"path":"stories/crown-of-ashes/fishing-fleshy-wingfish"},
    "season-7/heart_to_heart/17411010": {"path":"stories/savannah/cyran"},
    "season-7/heart_to_heart/17411020": {"path":"stories/savannah/gwyneth"},
    "season-7/heart_to_heart/17411030": {"path":"stories/savannah/cyran-heart-to-heart"},
    "season-7/heart_to_heart/17411040": {"path":"stories/savannah/gwyneth-heart-to-heart"},
    "season-7/heart_to_heart/17411050": {"path":"stories/savannah/rowan"},
    "season-7/heart_to_heart/17411060": {"path":"stories/savannah/hendrik"},
    "season-7/heart_to_heart/17411070": {"path":"stories/savannah/rowan-heart-to-heart"},
    "season-7/heart_to_heart/17411080": {"path":"stories/savannah/gwyneth-heart-to-heart-season-7"},
    "season-7/heart_to_heart/17411090": {"path":"stories/savannah/cassadee"},
    "season-7/heart_to_heart/17411100": {"path":"stories/savannah/rowan-and-peggy"},
    "season-7/heart_to_heart/17411110": {"path":"stories/savannah/little-fox"},
    "season-7/heart_to_heart/17411120": {"path":"stories/savannah/rowan-and-peggy-heart-to-heart"},
    "season-7/heart_to_heart/17411130": {"path":"stories/savannah/little-fox-and-excited-fan"},
    "season-7/heart_to_heart/17411140": {"path":"stories/savannah/cassadee-heart-to-heart"},
    "season-7/heart_to_heart/17411150": {"path":"stories/savannah/little-fox-and-gwyneth"},
    "season-7/heart_to_heart/17411160": {"path":"stories/savannah/little-fox-heart-to-heart"},
    "season-7/heart_to_heart/17411170": {"path":"stories/savannah/orion"},
    "season-7/heart_to_heart/17411180": {"path":"stories/savannah/little-fox-heart-to-heart-season-7"},
    "season-7/heart_to_heart/17411190": {"path":"stories/savannah/gwyneth-and-little-fox"},
    "season-7/heart_to_heart/17411200": {"path":"stories/savannah/hendrik-heart-to-heart"},
    "season-7/heart_to_heart/17411210": {"path":"stories/savannah/gwyneth-heart-to-heart-season-7-17411210"},
    "season-7/heart_to_heart/17411220": {"path":"stories/savannah/gwyneth-heart-to-heart-season-7-17411220"},
    "season-7/heart_to_heart/17411230": {"path":"stories/savannah/hendrik-heart-to-heart-season-7"},
    "season-7/heart_to_heart/17411240": {"path":"stories/savannah/eryndor"},
    "season-7/heart_to_heart/17411250": {"path":"stories/savannah/little-fox-heart-to-heart-season-7-17411250"},
    "season-7/heart_to_heart/17411260": {"path":"stories/savannah/eryndor-heart-to-heart"},
    "season-7/heart_to_heart/17411270": {"path":"stories/savannah/little-fox-heart-to-heart-season-7-17411270"},
    "season-7/heart_to_heart/17411280": {"path":"stories/savannah/gwyneth-and-little-fox-heart-to-heart"},
    "season-7/heart_to_heart/17411290": {"path":"stories/savannah/eryndor-heart-to-heart-season-7"},
    "season-8/main/18010101": {"path":"stories/veil-of-memories/land-of-the-dead"},
    "season-8/main/18010102": {"path":"stories/veil-of-memories/behind-the-curtain"},
    "season-8/main/18010103": {"path":"stories/veil-of-memories/full-bloom"},
    "season-8/main/18010104": {"path":"stories/veil-of-memories/buried-deep"},
    "season-8/main/18010105": {"path":"stories/veil-of-memories/beneath-the-moon"},
    "season-8/main/18010106": {"path":"stories/veil-of-memories/a-suspicious-affair"},
    "season-8/main/18010107": {"path":"stories/veil-of-memories/the-toughest-choice"},
    "season-8/main/18010108": {"path":"stories/veil-of-memories/beyond-mortality"},
    "season-8/main/18010117": {"path":"stories/veil-of-memories/twist-of-fate"},
    "season-8/side/18010201": {"path":"stories/veil-of-memories/death-and-rebirth"},
    "season-8/side/18010202": {"path":"stories/veil-of-memories/lost-voice"},
    "season-8/side/18010204": {"path":"stories/veil-of-memories/secret-dealings"},
    "season-8/side/18010205": {"path":"stories/veil-of-memories/never-forgotten"},
    "season-8/side/18010206": {"path":"stories/veil-of-memories/never-gone"},
    "season-8/side/18010207": {"path":"stories/veil-of-memories/unknown-entity"},
    "season-8/side/18010208": {"path":"stories/veil-of-memories/hidden-in-the-hollow"},
    "season-8/side/18010209": {"path":"stories/veil-of-memories/hidden-door"},
    "season-8/side/18010210": {"path":"stories/veil-of-memories/mirrors-mystery"},
    "season-8/side/18010212": {"path":"stories/veil-of-memories/secrets-delivered"},
    "season-8/side/18010214": {"path":"stories/veil-of-memories/strange-noises"},
    "season-8/side/18010216": {"path":"stories/veil-of-memories/shining-like-the-sun"},
    "season-8/heart_to_heart/18411010": {"path":"stories/novaris/rain"},
    "season-8/heart_to_heart/18411020": {"path":"stories/novaris/baba-muriel"},
    "season-8/heart_to_heart/18411030": {"path":"stories/novaris/rain-heart-to-heart"},
    "season-8/heart_to_heart/18411040": {"path":"stories/novaris/estrilda"},
    "season-8/heart_to_heart/18411050": {"path":"stories/novaris/thane"},
    "season-8/heart_to_heart/18411060": {"path":"stories/novaris/senea"},
    "season-8/heart_to_heart/18411070": {"path":"stories/novaris/vivi"},
    "season-8/heart_to_heart/18411080": {"path":"stories/novaris/baba-muriel-heart-to-heart"},
    "season-8/heart_to_heart/18411090": {"path":"stories/novaris/estrilda-heart-to-heart"},
    "season-8/heart_to_heart/18411100": {"path":"stories/novaris/baba-muriel-and-rain"},
    "season-8/heart_to_heart/18411110": {"path":"stories/novaris/thane-and-estrilda"},
    "season-8/heart_to_heart/18411120": {"path":"stories/mortimer-manor/thane"},
    "season-8/heart_to_heart/18411130": {"path":"stories/mortimer-manor/estrilda-and-thane"},
    "season-8/heart_to_heart/18411140": {"path":"stories/mortimer-manor/thane-heart-to-heart"},
    "season-8/heart_to_heart/18411150": {"path":"stories/mortimer-manor/tephesia"},
    "season-8/heart_to_heart/18411160": {"path":"stories/mortimer-manor/baden-and-thane"},
    "season-8/heart_to_heart/18411170": {"path":"stories/mortimer-manor/tephesia-heart-to-heart"},
    "season-8/heart_to_heart/18411180": {"path":"stories/mortimer-manor/senea"},
    "season-8/heart_to_heart/18411190": {"path":"stories/mortimer-manor/tephesia-heart-to-heart-season-8"},
    "season-8/heart_to_heart/18411200": {"path":"stories/mortimer-manor/baden"},
    "special-events/side/10010610": {"path":"stories/avalon-homestead/avalon-homestead"},
    "special-events/mini/4": {"path":"stories/special-events/astral-travelers"},
    "special-events/mini/7": {"path":"stories/special-events/gourmet-and-journey"},
    "special-events/starry/10": {"path":"stories/special-events/final-verdict"},
    "special-events/starry/11": {"path":"stories/special-events/dreamy-dawn"},
    "special-events/starry/20": {"path":"stories/special-events/firepower-fanatic"},
    "special-events/starry/21": {"path":"stories/special-events/song-of-the-blizzard"},
    "season-8/side/18010213": {"path":"stories/veil-of-memories/everlasting-memories"},
    "special-events/mini/24": {"path":"stories/veil-of-memories/autumn-legend"},
    "special-events/starry/22": {"path":"stories/special-events/where-music-finds-us"},
    "base/exploration/10010401": {"path":"stories/base-campaign/a-town-in-peril"},
    "base/exploration/10010513-1": {"path":"stories/base-campaign/valen-after-the-first-fogged-enemy"},
    "base/exploration/10010402": {"path":"stories/base-campaign/hide-and-seek-with-a-puppy"},
    "base/exploration/10020332-1": {"path":"stories/base-campaign/opening-the-refugee-camp-gate"},
    "base/exploration/10010403": {"path":"stories/base-campaign/card-duel-1"},
    "base/exploration/10010404": {"path":"stories/base-campaign/philips-packing-puzzle-1"},
    "base/exploration/10010522": {"path":"stories/base-campaign/a-pause-by-the-statue"},
    "base/exploration/10020401": {"path":"stories/base-campaign/a-gruglin-raid"},
    "base/exploration/10020402": {"path":"stories/base-campaign/flowers-in-the-way"},
    "base/exploration/10020403": {"path":"stories/base-campaign/an-encounter-with-glowing-flowers"},
    "base/exploration/10020404": {"path":"stories/base-campaign/card-duel-2"},
    "base/exploration/10020405": {"path":"stories/base-campaign/philips-packing-puzzle-2"},
    "base/exploration/10030401": {"path":"stories/base-campaign/shadows-in-the-forest"},
    "base/exploration/10030402": {"path":"stories/base-campaign/dont-run-little-duck"},
    "base/exploration/10030403": {"path":"stories/base-campaign/card-duel-3"},
    "base/exploration/10030404": {"path":"stories/base-campaign/philips-packing-puzzle-3"},
    "base/exploration/10030405": {"path":"stories/base-campaign/the-vanishing-phantom-mouse"},
    "base/exploration/10030406": {"path":"stories/base-campaign/card-duel-4"},
    "base/exploration/10030407": {"path":"stories/base-campaign/quieting-the-noise"},
    "base/exploration/10030408": {"path":"stories/base-campaign/philips-packing-puzzle-4"},
    "base/exploration/10030409": {"path":"stories/base-campaign/an-eviction-notice"},
    "base/exploration/10030410": {"path":"stories/base-campaign/friendship-delivery"},
    "base/exploration/10040402": {"path":"stories/base-campaign/philips-packing-puzzle-5"},
    "base/exploration/10040403": {"path":"stories/base-campaign/a-dangerous-research-trip"},
    "base/exploration/10040404": {"path":"stories/base-campaign/clearance-sale"},
    "base/exploration/10040405": {"path":"stories/base-campaign/card-duel-5"},
    "base/exploration/10040406": {"path":"stories/base-campaign/runaway-ducks"},
    "base/exploration/10040407": {"path":"stories/base-campaign/a-research-report-in-peril"},
    "base/exploration/10040408": {"path":"stories/base-campaign/philips-packing-puzzle-6"},
    "base/exploration/10040409": {"path":"stories/base-campaign/defending-the-refugees"},
    "season-1/exploration/11010311-2": {"path":"stories/song-of-strife/orders"},
    "season-1/exploration/11010395": {"path":"stories/song-of-strife/the-view-from-the-cliffs"},
    "season-1/exploration/11010311-3": {"path":"stories/song-of-strife/adamant-member"},
    "season-1/exploration/11010311-4": {"path":"stories/song-of-strife/mauler-laborer"},
    "season-1/exploration/11010311-5": {"path":"stories/song-of-strife/claw-overseer"},
    "season-1/exploration/11010311-6": {"path":"stories/song-of-strife/run"},
    "season-1/exploration/11010311-7": {"path":"stories/song-of-strife/voices-in-the-spider-nest-i"},
    "season-1/exploration/11010311-8": {"path":"stories/song-of-strife/voices-in-the-spider-nest-ii"},
    "season-3/exploration/13010312": {"path":"stories/chains-of-eternity/a-good-soak"},
    "season-3/exploration/13010313": {"path":"stories/chains-of-eternity/napping-flower"},
    "season-3/exploration/13010314": {"path":"stories/chains-of-eternity/the-storytelling-machine"},
    "season-3/exploration/13010315": {"path":"stories/chains-of-eternity/the-cursed-inscription"},
    "season-3/exploration/13010320": {"path":"stories/chains-of-eternity/undead-childs-notes"},
    "season-3/exploration/13010321": {"path":"stories/chains-of-eternity/lorsans-parting-gift"},
    "season-3/exploration/13010341": {"path":"stories/chains-of-eternity/the-wandering-undead"},
    "season-4/exploration/14010319": {"path":"stories/echoes-of-dissent/beneath-the-ore-basket"},
    "season-4/exploration/14010354": {"path":"stories/echoes-of-dissent/drinking-with-dwarves"},
    "season-4/exploration/14010320": {"path":"stories/echoes-of-dissent/hammer-tongs-oilcloth"},
    "season-4/exploration/14010322": {"path":"stories/echoes-of-dissent/salthorin-seasoning"},
    "season-4/exploration/14010323": {"path":"stories/echoes-of-dissent/hymns-to-helthor"},
    "season-4/exploration/14010324": {"path":"stories/echoes-of-dissent/dry-the-wood"},
    "season-4/exploration/14010325": {"path":"stories/echoes-of-dissent/a-dwarfs-vault"},
    "season-4/exploration/14010326": {"path":"stories/echoes-of-dissent/the-priestesss-flowers"},
    "season-4/exploration/14010327": {"path":"stories/echoes-of-dissent/illegitimate-child"},
    "season-4/exploration/14010328": {"path":"stories/echoes-of-dissent/the-flying-squirrels-gift"},
    "season-4/exploration/14010329": {"path":"stories/echoes-of-dissent/red-and-black"},
    "season-4/exploration/14010330": {"path":"stories/echoes-of-dissent/the-fisherman-at-night"},
    "season-4/exploration/14010331": {"path":"stories/echoes-of-dissent/starry-underworld"},
    "season-4/exploration/14010332": {"path":"stories/echoes-of-dissent/ravions-fashion-advice"},
    "season-4/exploration/14010333": {"path":"stories/echoes-of-dissent/the-little-siths-request"},
    "season-4/exploration/14010334": {"path":"stories/echoes-of-dissent/a-letter-from-the-corrupted"},
    "season-4/exploration/14010335": {"path":"stories/echoes-of-dissent/the-fallen-noble"},
    "season-4/exploration/14010336": {"path":"stories/echoes-of-dissent/a-noble-scandal"},
    "season-4/exploration/14010337": {"path":"stories/echoes-of-dissent/catching-a-falling-star"},
    "season-4/exploration/14010338": {"path":"stories/echoes-of-dissent/felis-friend"},
    "season-4/exploration/14010339": {"path":"stories/echoes-of-dissent/a-cave-behind-the-waterfall"},
    "season-4/exploration/14010340": {"path":"stories/echoes-of-dissent/the-proud-essail"},
    "season-4/exploration/14010341": {"path":"stories/echoes-of-dissent/offering"},
    "season-4/exploration/14010342": {"path":"stories/echoes-of-dissent/nameless-tomb"},
    "season-4/exploration/14010343": {"path":"stories/echoes-of-dissent/the-lost-diary"},
    "season-4/exploration/14010344": {"path":"stories/echoes-of-dissent/a-prayer-for-bethwyn"},
    "season-4/exploration/14010345": {"path":"stories/echoes-of-dissent/a-letter-of-confession"},
    "season-4/exploration/14010347": {"path":"stories/echoes-of-dissent/one-more-minecart-ride"},
    "season-4/exploration/14010348": {"path":"stories/echoes-of-dissent/grilled-fish"},
    "season-4/exploration/14010349": {"path":"stories/echoes-of-dissent/broken-mech-guard"},
    "season-4/exploration/14010350": {"path":"stories/echoes-of-dissent/sit-a-little-longer"},
    "season-4/exploration/14010352": {"path":"stories/echoes-of-dissent/a-calm-mind-keeps-you-cool"},
    "season-4/exploration/14010353": {"path":"stories/echoes-of-dissent/the-arcane-lift"},
    "season-4/exploration/14010355": {"path":"stories/echoes-of-dissent/my-world"},
    "season-4/exploration/14010356": {"path":"stories/echoes-of-dissent/the-underwater-statue"},
    "season-4/exploration/14010357": {"path":"stories/echoes-of-dissent/ex-head-chamberlain"},
    "season-4/exploration/14010358": {"path":"stories/echoes-of-dissent/ravion-at-the-palace"},
    "season-4/exploration/14010359": {"path":"stories/echoes-of-dissent/the-maids-love-letters"},
    "season-4/exploration/14010368": {"path":"stories/echoes-of-dissent/ten-statue-sites"},
    "season-4/exploration/14010369": {"path":"stories/echoes-of-dissent/damians-phantom-flower"},
    "season-5/exploration/15010321": {"path":"stories/thorns-of-devotion/a-dance-for-two"},
    "season-5/exploration/15010322": {"path":"stories/thorns-of-devotion/kordans-axe"},
    "season-5/exploration/15010323": {"path":"stories/thorns-of-devotion/ruler-of-the-tribe"},
    "season-5/exploration/15010325": {"path":"stories/thorns-of-devotion/magister-of-pillows"},
    "season-5/exploration/15010326": {"path":"stories/thorns-of-devotion/remembering-gala"},
    "season-5/exploration/15010327": {"path":"stories/thorns-of-devotion/a-keepsake-to-stay"},
    "season-5/exploration/15010328": {"path":"stories/thorns-of-devotion/stories-and-treasure"},
    "season-5/exploration/15010329": {"path":"stories/thorns-of-devotion/deserter"},
    "season-5/exploration/15010330": {"path":"stories/thorns-of-devotion/aspiring-vocalist"},
    "season-5/exploration/15010331": {"path":"stories/thorns-of-devotion/shells-for-sale"},
    "season-5/exploration/15010332": {"path":"stories/thorns-of-devotion/a-stew-to-remember"},
    "season-5/exploration/15010333": {"path":"stories/thorns-of-devotion/the-horror-story-society"},
    "season-5/exploration/15010334": {"path":"stories/thorns-of-devotion/a-taste-of-mushrooms"},
    "season-5/exploration/15010336": {"path":"stories/thorns-of-devotion/bird-taming"},
    "season-5/exploration/15010337": {"path":"stories/thorns-of-devotion/old-tongue-lesson"},
    "season-5/exploration/15010341": {"path":"stories/thorns-of-devotion/canned-food"},
    "season-5/exploration/15010342": {"path":"stories/thorns-of-devotion/a-gourmet-test"},
    "season-5/exploration/15010343": {"path":"stories/thorns-of-devotion/the-lost-midnight-fright-club"},
    "season-5/exploration/15010344": {"path":"stories/thorns-of-devotion/no-locked-doors"},
    "season-5/exploration/15010345": {"path":"stories/thorns-of-devotion/all-hail-the-bridge"},
    "season-5/exploration/15010346": {"path":"stories/thorns-of-devotion/too-much-water"},
    "season-5/exploration/15010347": {"path":"stories/thorns-of-devotion/farewell-to-the-forest"},
    "season-5/exploration/15010348": {"path":"stories/thorns-of-devotion/keep-the-formation-tight"},
    "season-5/exploration/15010349": {"path":"stories/thorns-of-devotion/a-secret-meeting"},
    "season-5/exploration/15010350": {"path":"stories/thorns-of-devotion/gather-herbs"},
    "season-5/exploration/15010351": {"path":"stories/thorns-of-devotion/under-the-swamp"},
    "season-5/exploration/15010352": {"path":"stories/thorns-of-devotion/repairing-sixteen"},
    "season-5/exploration/15010354": {"path":"stories/thorns-of-devotion/dog-in-the-darkness"},
    "season-5/exploration/15010355": {"path":"stories/thorns-of-devotion/the-ruined-mural"},
    "season-5/exploration/15010356": {"path":"stories/thorns-of-devotion/abundius-in-disguise"},
    "season-5/exploration/15010357": {"path":"stories/thorns-of-devotion/a-familiar-uniform"},
    "season-5/exploration/15010358": {"path":"stories/thorns-of-devotion/morgans-warning"},
    "season-5/exploration/15010359": {"path":"stories/thorns-of-devotion/the-survivors-mother"},
    "season-5/exploration/15010360": {"path":"stories/thorns-of-devotion/the-closed-house"},
    "season-5/exploration/15010361": {"path":"stories/thorns-of-devotion/a-soldier-by-the-bridge"},
    "season-5/exploration/15010362": {"path":"stories/thorns-of-devotion/the-missing-husband"},
    "season-5/exploration/15010364": {"path":"stories/thorns-of-devotion/the-wishing-fountain"},
    "season-5/exploration/15010365": {"path":"stories/thorns-of-devotion/psychological-analysis"},
    "season-5/exploration/15010366": {"path":"stories/thorns-of-devotion/a-taste-of-halia"},
    "season-5/exploration/15010367": {"path":"stories/thorns-of-devotion/diona-and-senea"},
    "season-5/exploration/15010368": {"path":"stories/thorns-of-devotion/stones-and-memories"},
    "season-5/exploration/15010369": {"path":"stories/thorns-of-devotion/the-horror-clubs-reunited"},
    "season-5/exploration/15010370": {"path":"stories/thorns-of-devotion/antons-gravestone"},
    "season-5/exploration/15010381": {"path":"stories/thorns-of-devotion/a-fathers-fang-necklace"},
    "season-5/exploration/15010382": {"path":"stories/thorns-of-devotion/a-prayer-for-the-fallen"},
    "season-5/exploration/15010392": {"path":"stories/thorns-of-devotion/eternal-emissary"},
    "season-6/exploration/16010360": {"path":"stories/tower-of-memory/the-students-prayer"},
    "season-6/exploration/16010361": {"path":"stories/tower-of-memory/a-phantoms-invitation"},
    "season-6/exploration/16010362": {"path":"stories/tower-of-memory/a-unicorn-dream"},
    "season-6/exploration/16010363": {"path":"stories/tower-of-memory/the-mouth-of-truth"},
    "season-6/exploration/16010364": {"path":"stories/tower-of-memory/a-tiny-cheat-sheet"},
    "season-6/exploration/16010365": {"path":"stories/tower-of-memory/a-bond-beyond-death"},
    "season-6/exploration/16010366": {"path":"stories/tower-of-memory/oak-vintage"},
    "season-6/exploration/16010367": {"path":"stories/tower-of-memory/woolen-socks"},
    "season-6/exploration/16010368": {"path":"stories/tower-of-memory/foretelling-the-future"},
    "season-6/exploration/16010369": {"path":"stories/tower-of-memory/a-wolf-for-a-mouse"},
    "season-6/exploration/16010370": {"path":"stories/tower-of-memory/third-wheel"},
    "season-6/exploration/16010371": {"path":"stories/tower-of-memory/a-doves-freedom"},
    "season-6/exploration/16010372": {"path":"stories/tower-of-memory/the-tireless-broom"},
    "season-6/exploration/16010373": {"path":"stories/tower-of-memory/julies-alchemy-experiment"},
    "season-6/exploration/16010374": {"path":"stories/tower-of-memory/a-masterpiece-beyond-death"},
    "season-6/exploration/16010385": {"path":"stories/tower-of-memory/pippas-boat"},
    "season-6/exploration/16010386": {"path":"stories/tower-of-memory/a-love-letter-for-hildi"},
    "season-6/exploration/16010387": {"path":"stories/tower-of-memory/magic-notebook"},
    "season-6/exploration/16010388": {"path":"stories/tower-of-memory/merlins-portrait"},
    "season-6/exploration/16010389": {"path":"stories/tower-of-memory/the-scarecrows-game"},
    "season-6/exploration/16010390": {"path":"stories/tower-of-memory/cat-apprentice"},
    "season-6/exploration/16010391": {"path":"stories/tower-of-memory/a-lesson-in-fireballs"},
    "season-6/exploration/16010392": {"path":"stories/tower-of-memory/the-missing-cat-notice"},
    "season-6/exploration/16010393": {"path":"stories/tower-of-memory/cassadees-childhood"},
    "season-6/exploration/16010394": {"path":"stories/tower-of-memory/the-broken-windmill"},
    "season-6/exploration/16010395": {"path":"stories/tower-of-memory/a-moment-by-the-lake"},
    "season-6/exploration/16010396": {"path":"stories/tower-of-memory/the-healer"},
    "season-6/exploration/16010402": {"path":"stories/tower-of-memory/a-frightened-girl"},
    "season-6/exploration/16010403": {"path":"stories/tower-of-memory/the-dockside-murder"},
    "season-6/exploration/16010404": {"path":"stories/tower-of-memory/strange-horse"},
    "season-6/exploration/16010405": {"path":"stories/tower-of-memory/feline-ventures"},
    "season-6/exploration/16010406": {"path":"stories/tower-of-memory/disciplinary-action"},
    "season-6/exploration/16010407": {"path":"stories/tower-of-memory/sugary-gamble"},
    "season-6/exploration/16010410": {"path":"stories/tower-of-memory/the-princesss-painting"},
    "season-6/exploration/16010411": {"path":"stories/tower-of-memory/tower-hypofiend"},
    "season-6/exploration/16010412": {"path":"stories/tower-of-memory/expanding-feast"},
    "season-6/exploration/16010413": {"path":"stories/tower-of-memory/the-towers-maintenance-log"},
    "season-6/exploration/16010414": {"path":"stories/tower-of-memory/lessons-in-mischief"},
    "season-6/exploration/16010415": {"path":"stories/tower-of-memory/a-shelf-of-memories"},
    "season-6/exploration/16010416": {"path":"stories/tower-of-memory/a-flower-for-feli"},
    "season-6/exploration/16010421": {"path":"stories/tower-of-memory/howling-wolves"},
    "season-6/exploration/16010422": {"path":"stories/tower-of-memory/no-leap-of-faith"},
    "season-6/exploration/16010423": {"path":"stories/tower-of-memory/a-falling-scalecone"},
    "season-6/exploration/16010424": {"path":"stories/tower-of-memory/wolf-hoard"},
    "season-6/exploration/16010425": {"path":"stories/tower-of-memory/sunbathing"},
    "season-6/exploration/16010426": {"path":"stories/tower-of-memory/flying-teacups"},
    "season-6/exploration/16010427": {"path":"stories/tower-of-memory/foodie-hamster"},
    "season-6/exploration/16010428": {"path":"stories/tower-of-memory/dessert-deception"},
    "season-6/exploration/16010460": {"path":"stories/tower-of-memory/enchanted-ring"},
    "season-6/exploration/16010461": {"path":"stories/tower-of-memory/bonfire-sword"},
    "season-6/exploration/16010462": {"path":"stories/tower-of-memory/scattered-magical-notes"},
    "season-6/exploration/16010463": {"path":"stories/tower-of-memory/a-merchants-bet"},
    "season-6/exploration/16010464": {"path":"stories/tower-of-memory/the-parrots-promise"},
    "season-6/exploration/16010465": {"path":"stories/tower-of-memory/snowman-rescue"},
    "season-6/exploration/16010466": {"path":"stories/tower-of-memory/old-inscription"},
    "season-6/exploration/16010467": {"path":"stories/tower-of-memory/let-the-water-wash-it-away"},
    "season-6/exploration/16010468": {"path":"stories/tower-of-memory/without-a-bet"},
    "season-6/exploration/16010473": {"path":"stories/tower-of-memory/the-new-antique-shop"},
    "season-6/exploration/16010483": {"path":"stories/tower-of-memory/the-perfect-mushroom"},
    "season-6/exploration/16010484": {"path":"stories/tower-of-memory/the-new-bulletin"},
    "season-7/exploration/17010351": {"path":"stories/crown-of-ashes/savannah-morning-post-special-edition"},
    "season-7/exploration/17010353": {"path":"stories/crown-of-ashes/teatime-delights"},
    "season-7/exploration/17010354": {"path":"stories/crown-of-ashes/arcane-affairs-office-regulations"},
    "season-7/exploration/17010355": {"path":"stories/crown-of-ashes/when-night-falls"},
    "season-7/exploration/17010356": {"path":"stories/crown-of-ashes/glimpse-your-future"},
    "season-7/exploration/17010357": {"path":"stories/crown-of-ashes/the-match-girl"},
    "season-7/exploration/17010358": {"path":"stories/crown-of-ashes/the-old-den"},
    "season-7/exploration/17010359": {"path":"stories/crown-of-ashes/the-quiet-hawk"},
    "season-7/exploration/17010360": {"path":"stories/crown-of-ashes/now-showing"},
    "season-7/exploration/17010361": {"path":"stories/crown-of-ashes/hamster-couple"},
    "season-7/exploration/17010363": {"path":"stories/crown-of-ashes/the-night-dockworker"},
    "season-7/exploration/17010365": {"path":"stories/crown-of-ashes/new-residence"},
    "season-7/exploration/17010366": {"path":"stories/crown-of-ashes/cinderellas-wish"},
    "season-7/exploration/17010367": {"path":"stories/crown-of-ashes/unpaid-tab"},
    "season-7/exploration/17010368": {"path":"stories/crown-of-ashes/flowers-for-amelia"},
    "season-7/exploration/17010371": {"path":"stories/crown-of-ashes/three-ancestral-ghosts"},
    "season-7/exploration/17010372": {"path":"stories/crown-of-ashes/hunting-ground-vantage-point"},
    "season-7/exploration/17010373": {"path":"stories/crown-of-ashes/ravens-token"},
    "season-7/exploration/17010374": {"path":"stories/crown-of-ashes/a-feast-of-illusions"},
    "season-7/exploration/17010375": {"path":"stories/crown-of-ashes/archery-practice"},
    "season-7/exploration/17010376": {"path":"stories/crown-of-ashes/feed-the-fox"},
    "season-7/exploration/17010378": {"path":"stories/crown-of-ashes/the-storyteller"},
    "season-7/exploration/17010379": {"path":"stories/crown-of-ashes/free-drinks"},
    "season-7/exploration/17010380": {"path":"stories/crown-of-ashes/operation-pigeon"},
    "season-7/exploration/17010382": {"path":"stories/crown-of-ashes/a-lesson-for-the-recruits"},
    "season-7/exploration/17010383": {"path":"stories/crown-of-ashes/kings-generosity"},
    "season-7/exploration/17010388": {"path":"stories/crown-of-ashes/snowys-delivery-job"},
    "season-7/exploration/17010389": {"path":"stories/crown-of-ashes/mystery-boxes"},
    "season-7/exploration/17010390": {"path":"stories/crown-of-ashes/an-excuse-to-miss-work"},
    "season-7/exploration/17010391": {"path":"stories/crown-of-ashes/the-black-market-book"},
    "season-7/exploration/17010397": {"path":"stories/crown-of-ashes/avian-legacy"},
    "season-8/exploration/18010311-2": {"path":"stories/veil-of-memories/zekil"},
    "season-8/exploration/18010321": {"path":"stories/veil-of-memories/castle-mirrors-pure-haven"},
    "season-8/exploration/18010311-3": {"path":"stories/veil-of-memories/edith"},
    "season-8/exploration/18010322": {"path":"stories/veil-of-memories/castle-mirrors-the-empty-bottle"},
    "season-8/exploration/18010311-4": {"path":"stories/veil-of-memories/skyden"},
    "season-8/exploration/18010323": {"path":"stories/veil-of-memories/lingering-longing"},
    "season-8/exploration/18010311-5": {"path":"stories/veil-of-memories/message-in-a-bottle"},
    "season-8/exploration/18010324": {"path":"stories/veil-of-memories/the-memory-restoration-potion"},
    "season-8/exploration/18010311-6": {"path":"stories/veil-of-memories/orphan-intake-record"},
    "season-8/exploration/18010325": {"path":"stories/veil-of-memories/the-fallen-flower-stand"},
    "season-8/exploration/18010311-7": {"path":"stories/veil-of-memories/edmund"},
    "season-8/exploration/18010351": {"path":"stories/veil-of-memories/the-merchant-ship"},
    "season-8/exploration/18010311-8": {"path":"stories/veil-of-memories/fine-tombstone"},
    "season-8/exploration/18010354": {"path":"stories/veil-of-memories/return-on-investment"},
    "season-8/exploration/18010311-9": {"path":"stories/veil-of-memories/rotham"},
    "season-8/exploration/18010355": {"path":"stories/veil-of-memories/the-abandoned-wineglass"},
    "season-8/exploration/18010311-10": {"path":"stories/veil-of-memories/melora"},
    "season-8/exploration/18010356": {"path":"stories/veil-of-memories/vengeful-lover"},
    "season-8/exploration/18010311-11": {"path":"stories/veil-of-memories/calandra"},
    "season-8/exploration/18010357": {"path":"stories/veil-of-memories/aspiring-star"},
    "season-8/exploration/18010361": {"path":"stories/veil-of-memories/an-echo-in-the-graveblooms"},
    "season-8/exploration/18010371": {"path":"stories/veil-of-memories/the-ruined-soul-forge"},
    "season-8/exploration/18010372": {"path":"stories/veil-of-memories/bo-silverbutts-sunken-treasure"},
    "season-8/exploration/18010381": {"path":"stories/veil-of-memories/the-undead-warhorse"},
    "season-8/exploration/18010382": {"path":"stories/veil-of-memories/restoring-the-tree-spirit"},
    "season-1/reputation/11010511": {"path":"stories/song-of-strife/unfinished-business"},
    "season-1/reputation/11010512": {"path":"stories/song-of-strife/price-of-bragging"},
    "season-1/reputation/11010513": {"path":"stories/song-of-strife/other-commissions"},
    "season-1/reputation/11010514": {"path":"stories/song-of-strife/escort-caravan"},
    "season-1/reputation/11010515": {"path":"stories/song-of-strife/rising-star"},
    "season-1/reputation/11010516": {"path":"stories/song-of-strife/special-mission"},
    "season-1/reputation/11010517": {"path":"stories/song-of-strife/missing-terrabirds"},
    "season-1/reputation/11010518": {"path":"stories/song-of-strife/remote-negotiation"},
    "season-1/reputation/11010531": {"path":"stories/song-of-strife/mysterious-medicine"},
    "season-1/reputation/11010532": {"path":"stories/song-of-strife/swindlers-trail"},
    "season-1/reputation/11010533": {"path":"stories/song-of-strife/lost-lizard"},
    "season-1/reputation/11010534": {"path":"stories/song-of-strife/warriors-test"},
    "season-1/reputation/11010535": {"path":"stories/song-of-strife/grand-feast"},
    "season-1/reputation/11010536": {"path":"stories/song-of-strife/courtship-lessons"},
    "season-1/reputation/11010537": {"path":"stories/song-of-strife/sprinting-bird"},
    "season-1/reputation/11010538": {"path":"stories/song-of-strife/precious-peace"},
    "season-2/reputation/12010522": {"path":"stories/waves-of-intrigue/dwelling-place"},
    "season-2/reputation/12010523": {"path":"stories/waves-of-intrigue/calculation-skill"},
    "season-2/reputation/12010525": {"path":"stories/waves-of-intrigue/camp-raid"},
    "season-2/reputation/12010526": {"path":"stories/waves-of-intrigue/weapon-submission"},
    "season-2/reputation/12010527": {"path":"stories/waves-of-intrigue/precious-potion"},
    "season-2/reputation/12010528": {"path":"stories/waves-of-intrigue/side-hustle"},
    "season-2/reputation/12010531": {"path":"stories/waves-of-intrigue/dockside-daily"},
    "season-2/reputation/12010532": {"path":"stories/waves-of-intrigue/inn-conflict"},
    "season-2/reputation/12010533": {"path":"stories/waves-of-intrigue/anglers-challenge"},
    "season-2/reputation/12010534": {"path":"stories/waves-of-intrigue/brineville-rescue"},
    "season-2/reputation/12010535": {"path":"stories/waves-of-intrigue/dead-tide-aftermath"},
    "season-2/reputation/12010537": {"path":"stories/waves-of-intrigue/way-of-voyage"},
    "season-2/reputation/12010538": {"path":"stories/waves-of-intrigue/watch-the-flame"},
    "season-3/reputation/13010511": {"path":"stories/chains-of-eternity/let-them-rest"},
    "season-3/reputation/13010512": {"path":"stories/chains-of-eternity/restore-the-temple"},
    "season-3/reputation/13010513": {"path":"stories/chains-of-eternity/protective-coating"},
    "season-3/reputation/13010514": {"path":"stories/chains-of-eternity/warriors-belongings"},
    "season-3/reputation/13010515": {"path":"stories/chains-of-eternity/undeads-dinner"},
    "season-3/reputation/13010516": {"path":"stories/chains-of-eternity/snowman-guide"},
    "season-3/reputation/13010517": {"path":"stories/chains-of-eternity/nipped-in-the-bud"},
    "season-3/reputation/13010518": {"path":"stories/chains-of-eternity/dangerous-forest"},
    "season-3/reputation/13010531": {"path":"stories/chains-of-eternity/disturbed-graves"},
    "season-3/reputation/13010532": {"path":"stories/chains-of-eternity/the-stolen-goods"},
    "season-3/reputation/13010533": {"path":"stories/chains-of-eternity/helping-villagers"},
    "season-3/reputation/13010534": {"path":"stories/chains-of-eternity/repairing-the-frozen-paw"},
    "season-3/reputation/13010536": {"path":"stories/chains-of-eternity/mad-scholars"},
    "season-3/reputation/13010537": {"path":"stories/chains-of-eternity/cultists-seance"},
    "season-3/reputation/13010538": {"path":"stories/chains-of-eternity/children-in-cedartown"},
    "season-4/reputation/14010511": {"path":"stories/echoes-of-dissent/all-good"},
    "season-4/reputation/14010512": {"path":"stories/echoes-of-dissent/passing-the-time"},
    "season-4/reputation/14010515": {"path":"stories/echoes-of-dissent/arcane-steel-research"},
    "season-4/reputation/14010516": {"path":"stories/echoes-of-dissent/zanies-forge"},
    "season-4/reputation/14010518": {"path":"stories/echoes-of-dissent/the-quest-for-wool"},
    "season-4/reputation/14010531": {"path":"stories/echoes-of-dissent/medicine-shortage"},
    "season-4/reputation/14010533": {"path":"stories/echoes-of-dissent/loose-ends"},
    "season-4/reputation/14010534": {"path":"stories/echoes-of-dissent/a-new-salthorin"},
    "season-4/reputation/14010535": {"path":"stories/echoes-of-dissent/priceless-comfort"},
    "season-4/reputation/14010536": {"path":"stories/echoes-of-dissent/bread-from-afar"},
    "season-4/reputation/14010538": {"path":"stories/echoes-of-dissent/underground-tour"},
    "season-5/reputation/15010521": {"path":"stories/thorns-of-devotion/locust-outbreak"},
    "season-5/reputation/15010522": {"path":"stories/thorns-of-devotion/hungry-animals"},
    "season-5/reputation/15010523": {"path":"stories/thorns-of-devotion/massive-bird"},
    "season-5/reputation/15010524": {"path":"stories/thorns-of-devotion/frenzied-horses"},
    "season-5/reputation/15010526": {"path":"stories/thorns-of-devotion/help-the-refugees"},
    "season-5/reputation/15010527": {"path":"stories/thorns-of-devotion/market-commotion"},
    "season-5/reputation/15010528": {"path":"stories/thorns-of-devotion/ant-slayer"},
    "season-5/reputation/15010531": {"path":"stories/thorns-of-devotion/missing-herb"},
    "season-5/reputation/15010532": {"path":"stories/thorns-of-devotion/hunter-rescue"},
    "season-5/reputation/15010533": {"path":"stories/thorns-of-devotion/diligent-student"},
    "season-5/reputation/15010535": {"path":"stories/thorns-of-devotion/the-fainting-incident"},
    "season-5/reputation/15010536": {"path":"stories/thorns-of-devotion/harvest-time"},
    "season-5/reputation/15010537": {"path":"stories/thorns-of-devotion/new-venture"},
    "season-6/reputation/16010511": {"path":"stories/tower-of-memory/new-messenger"},
    "season-6/reputation/16010512": {"path":"stories/tower-of-memory/sweet-healing"},
    "season-6/reputation/16010514": {"path":"stories/tower-of-memory/state-of-the-news"},
    "season-6/reputation/16010515": {"path":"stories/tower-of-memory/accident-cleanup"},
    "season-6/reputation/16010516": {"path":"stories/tower-of-memory/graveyard-visit"},
    "season-6/reputation/16010517": {"path":"stories/tower-of-memory/secret-gathering"},
    "season-6/reputation/16010518": {"path":"stories/tower-of-memory/the-power-of-an-idol"},
    "season-6/reputation/16010521": {"path":"stories/tower-of-memory/calm-in-the-field"},
    "season-6/reputation/16010523": {"path":"stories/tower-of-memory/going-to-the-dock"},
    "season-6/reputation/16010524": {"path":"stories/tower-of-memory/nocturnal-overgrowth"},
    "season-6/reputation/16010525": {"path":"stories/tower-of-memory/clingy-critters"},
    "season-6/reputation/16010526": {"path":"stories/tower-of-memory/strange-fungus"},
    "season-6/reputation/16010527": {"path":"stories/tower-of-memory/invisible-animal"},
    "season-6/reputation/16010528": {"path":"stories/tower-of-memory/tails-of-farewell"},
    "season-8/side/18010601": {"path":"stories/veil-of-memories/raven-whispers"},
    "special-events/starry/23": {"path":"stories/special-events/esperian-case-files"}
  }};
});

;
/* Readable addresses resolve to permanent story IDs, independently of locale. */
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require('./reader_story_paths.js'));
  else root.ReaderStoryRoutes = factory(root.ReaderStoryPaths);
})(typeof globalThis === "object" ? globalThis : this, function(registry) {
  function section(value) {
    if (value === 'base_campaign') return 'base';
    if (value === 'special_events') return 'special-events';
    return String(value).replace(/^season_(\d+)$/, 'season-$1');
  }

  // Source identifiers are mapped to their current collection and category.
  function categoryFor(collection, category, id, story) {
    if (category === "daily") return "reputation";
    if (category !== 'mini') return category;
    // Use the game's dedicated Starry Tales screen, not a growing list of IDs.
    // The older Pandora event also has hero_story subtype, but a different screen.
    if (typeof story?.prefab === 'string') {
      const prefab = story.prefab.replace(/\\/g, '/').toLowerCase();
      return prefab.includes('/herostory/')
        || prefab.endsWith('/pbui_ministory_tournamentl_story_windows_ep.prefab') ? 'starry' : 'mini';
    }
    return registry.stories[`special-events/starry/${id}`] ? 'starry' : 'mini';
  }

  const eventTitles = {cn:'活动剧情', en:'Event Stories', jp:'イベントストーリー', kr:'이벤트 스토리'};
  const patientTitles = {cn:'健康大作战 · 患者诊疗', en:'Potion Panacea · Patient encounters',
    jp:'健康大作戦 · 患者との出会い', kr:'건강 프로젝트 · 환자와의 만남'};

  // Keep separate patient graphs behind one navigation entry and group URL.
  // Selecting a patient replaces that navigation slot in place.
  function readingEntries(entries, selected = '') {
    const result = [], groups = new Map();
    for (const entry of entries) {
      const story = entry.logicalStory || entry, group = story.readingGroup?.key;
      if (!group) { result.push(entry); continue; }
      if (!groups.has(group)) { groups.set(group, result.length); result.push(entry); }
      else if (String(story.id) === String(selected)) result[groups.get(group)] = entry;
    }
    return result;
  }
  function eventChapter(collection, story) {
    const season = /^season_(\d+)$/.exec(collection.key);
    const named = story.chapterTitle?.en && !['Mini Stories', 'Event Stories', 'Starry Tales'].includes(story.chapterTitle.en);
    // Native event name: localization record 38701. The patient suffix is a
    // reader section, rather than a separate event in the game database.
    const potion = {cn:'健康大作战', en:'Potion Panacea', jp:'健康大作戦', kr:'건강 프로젝트'};
    const title = {};
    for (const language of ['cn', 'en', 'jp', 'kr']) {
      const prefix = season ? {cn:`赛季 ${season[1]}`, en:`Season ${season[1]}`,
        jp:`シーズン${season[1]}`, kr:`시즌 ${season[1]}`}[language] : '';
      let name = named ? story.chapterTitle[language] || story.chapterTitle.en : '';
      if (['potion_panacea', 'potion_panacea-patients'].includes(story.chapterKey)) {
        name = potion[language] + (story.chapterKey.endsWith('-patients') ? ' · ' +
          {cn:'患者诊疗', en:'Patient encounters', jp:'患者との出会い', kr:'환자와의 만남'}[language] : '');
      }
      title[language] = [prefix, name].filter(Boolean).join(' · ') || eventTitles[language];
    }
    return title;
  }

  function relocateEvents(collections) {
    let target = collections.get('special_events');
    for (const origin of [...collections.values()]) {
      for (const key of ['mini', 'starry']) {
        const source = origin.categories.get(key);
        if (!source?.stories.length) continue;
        if (!target) {
          target = {key:'special_events', order:99,
            title:{cn:'特别活动', en:'Special Events', jp:'特別イベント', kr:'특별 이벤트'}, categories:new Map()};
          collections.set(target.key, target);
        }
        let category = target.categories.get(key);
        if (!category) {
          category = {key, order:source.order, stories:[]}; target.categories.set(key, category);
        }
        const stories = source.stories.slice();
        if (origin !== target) origin.categories.delete(key);
        else category.stories = [];
        for (const story of stories) {
          if (category.stories.some(row => row.id === story.id)) throw new Error('Duplicate event story ID: ' + story.id);
          if (origin === target && story.sourceCollection) { category.stories.push(story); continue; }
          category.stories.push({...story, key:`special_events/${key}/${story.id}`,
            sourceCollection:origin.key, sourceCollectionTitle:origin.title,
            ...(story.chapterKey === 'potion_panacea-patients'
              ? {readingGroup:{key:'potion_panacea-patients', kind:'patients', title:patientTitles}} : {}),
            ...(key === 'mini' ? {chapterKey:`${origin.key}/${story.chapterKey || 'events'}`,
              chapterTitle:eventChapter(origin, story),
              chapterOrder:(/^season_(\d+)$/.exec(origin.key)?.[1] || 99) * 1000 + (story.chapterOrder || 0)} : {})});
        }
        // Event chapters already had a second listing as season side quests.
        // Remove only those exact copies; ordinary side quests stay in place.
        if (origin !== target && key === 'mini') {
          const side = origin.categories.get('side');
          if (side) side.stories = side.stories.filter(row => !stories.some(event => event.id === row.id
            && JSON.stringify(event.assetKeys) === JSON.stringify(row.assetKeys)));
        }
      }
    }
  }

  function create(data) {
    if (data?.schemaVersion !== 1 || !data.stories) throw new Error('Invalid story address registry');
    const byPath = new Map(), byStory = new Map();
    const categories = new Set(['main', 'side', 'reputation', 'mini', 'starry', 'heart_to_heart', 'daily', 'exploration']);
    const slugPath = /^stories\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const eventIds = new Set(Object.keys(data.stories).filter(key => ['mini', 'starry'].includes(key.split('/')[1])).map(key => key.split('/')[2]));
    const family = category => ['mini', 'starry'].includes(category) ? 'event'
      : category === 'heart_to_heart' ? 'interaction' : 'quest';
    const targetsById = new Map();
    for (const key of Object.keys(data.stories)) {
      const [collection, category, storyId] = key.split('/');
      const targets = targetsById.get(storyId) || [];
      targets.push({section:collection, category, storyId});
      targetsById.set(storyId, targets);
    }
    function targetFor(collection, category, id) {
      collection = section(collection);
      if (category === 'daily') category = 'reputation';
      // An explicitly assigned quest wins over an event from another catalog
      // that happens to have the same numeric ID.
      if (data.stories[`${collection}/${category}/${id}`]) {
        return {section:collection, category, storyId:String(id)};
      }
      if (category === 'side' && eventIds.has(String(id))) category = 'mini';
      if (['mini', 'starry'].includes(category)) collection = 'special-events';
      const target = {section:collection, category, storyId:String(id)};
      if (data.stories[`${collection}/${category}/${id}`]) return target;
      const candidates = (targetsById.get(String(id)) || []).filter(row => family(row.category) === family(category));
      return candidates.length === 1 ? {...candidates[0]} : target;
    }
    for (const [key, entry] of Object.entries(data.stories)) {
      const parts = key.split('/');
      if (parts.length !== 3 || section(parts[0]) !== parts[0] || !categories.has(parts[1]) || !parts[2]) {
        throw new Error('Invalid story address key: ' + key);
      }
      const target = targetFor(parts[0], parts[1], parts[2]);
      for (const path of [entry.path]) {
        if (!slugPath.test(path) || byPath.has(path)) throw new Error('Invalid or duplicate story address: ' + path);
        byPath.set(path, target);
      }
      byStory.set(key, entry.path);
      const relocated = `${target.section}/${target.category}/${target.storyId}`;
      if (!byStory.has(relocated) || ['mini', 'starry'].includes(parts[1])) byStory.set(relocated, entry.path);
    }

    function resolve(value) {
      const name = String(value).split('?')[0].replace(/^#?\/?/, '');
      const target = byPath.get(name);
      return target ? {...target, named:true} : null;
    }

    function path(collection, category, id) {
      if (/^patient-\d+$/.test(String(id))) { collection = 'special-events'; category = 'mini'; id = 'potion_panacea-patients'; }
      const key = `${section(collection)}/${category}/${id}`;
      const target = targetFor(collection, category, id);
      return '#/' + (byStory.get(`${target.section}/${target.category}/${target.storyId}`) || byStory.get(key)
        || 'home');
    }

    function canonicalHash(value) {
      const route = resolve(value);
      if (!route) return value;
      const queryAt = String(value).indexOf('?');
      return path(route.section, route.category, route.storyId) + (queryAt < 0 ? '' : String(value).slice(queryAt));
    }

    // Game catalogs store source IDs, not public URLs. Convert those references
    // at link creation; the browser accepts only the resulting current URL.
    function referenceHash(value) {
      if (resolve(value)) return canonicalHash(value);
      const [name, query] = String(value).replace(/^#\/?/, '').split('?');
      const parts = name.split('/');
      if (parts.length !== 3 || !/^(?:base|base_campaign|special[-_]events|season[-_]\d+)$/.test(parts[0])) return value;
      const current = path(parts[0], parts[1], parts[2]);
      return current + (query ? '?' + query : '');
    }

    function mainReturn(value) {
      if (typeof value !== 'string' || value.length > 4000 || !value.startsWith('#/') || value.slice(1).includes('#')) return '';
      const target = resolve(value);
      return target?.category === 'main' && !new URLSearchParams(value.split('?')[1] || '').has('return') ? value : '';
    }
    return {resolve, path, canonicalHash, referenceHash, mainReturn, targetFor};
  }
  return {...create(registry), create, section, categoryFor, relocateEvents, readingEntries};
});

;
/* Current character and interaction addresses. Extend with tools/update_character_routes.cjs.
 * Only current profile and conversation URLs are published. */
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReaderCharacterPaths = factory();
})(typeof globalThis === "object" ? globalThis : this, function() {
  return {schemaVersion: 1, characters: {
    "1": {"slug":"valen","interactions":{"mn/herohub_story_10411010":{"slug":"hammie-and-cassadee-and-valen"},"mn/herohub_story_10411040":{"slug":"valen-and-vala"},"mn/herohub_story_10411050":{"slug":"chippy-and-hammie-and-valen"},"mn/herohub_story_10411060":{"slug":"valen-and-chippy"},"mn/herohub_story_10415022":{"slug":"rowan-and-valen"},"mn/herohub_story_10415058":{"slug":"idle-dialogue"},"mn/herohub_story_10415059":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415341":{"slug":"valen-and-mirael"},"mn/herohub_story_10415363":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415364":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415533":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415534":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415662":{"slug":"evie-and-valen"},"mn/herohub_story_10415771":{"slug":"eryndor-and-valen"},"mn3/herohub_story_10414010":{"slug":"hammie-and-chippy-and-lucius-and-valen"},"mn3/herohub_story_10414030":{"slug":"fay-and-valen-and-hammie"},"mn3/herohub_story_10414060":{"slug":"valen-and-lucius"},"mn3/herohub_story_10414100":{"slug":"atalanta-and-valen"}}},
    "2": {"slug":"cassadee","interactions":{"ep6/herohub_story_16411140":{"slug":"cassadee"},"ep6/herohub_story_16411150":{"slug":"cassadee-heart-to-heart"},"ep7/herohub_story_17411090":{"slug":"cassadee-heart-to-heart-2"},"ep7/herohub_story_17411140":{"slug":"cassadee-heart-to-heart-3"},"mn/herohub_story_10411010":{"slug":"hammie-and-cassadee-and-valen"},"mn/herohub_story_10411070":{"slug":"hammie-and-cassadee"},"mn/herohub_story_10411080":{"slug":"cassadee-and-hammie"},"mn/herohub_story_10415010":{"slug":"cassadee-and-mirael"},"mn/herohub_story_10415046":{"slug":"idle-dialogue"},"mn/herohub_story_10415047":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415347":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415348":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415483":{"slug":"cassadee-and-cyran"},"mn/herohub_story_10415515":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415516":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415740":{"slug":"cassadee-and-cyran-conversation"},"mn/herohub_story_10415757":{"slug":"idle-dialogue-7"},"mn/herohub_story_10415758":{"slug":"idle-dialogue-8"}}},
    "9": {"slug":"hogan-incomplete","interactions":{"ep4/herohub_story_14411010":{"slug":"hammie-and-chippy-and-hogan"},"ep4/herohub_story_14411050":{"slug":"hammie-and-hogan"},"mn/herohub_story_10411020":{"slug":"hogan-and-chippy"}}},
    "14": {"slug":"arden","interactions":{"mn/herohub_story_10415013":{"slug":"eironn-and-arden"},"mn/herohub_story_10415031":{"slug":"ulmus-and-arden"},"mn/herohub_story_10415112":{"slug":"idle-dialogue"},"mn/herohub_story_10415113":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415421":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415422":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415595":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415596":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415672":{"slug":"thador-and-arden"},"mn2/herohub_story_10413060":{"slug":"chippy-and-arden"},"mn2/herohub_story_10413100":{"slug":"dahnie-and-arden"},"mn2/herohub_story_10413140":{"slug":"chippy-and-arden-heart-to-heart"}}},
    "18": {"slug":"hewynn","interactions":{"mn/herohub_story_10415016":{"slug":"hewynn-and-damian"},"mn/herohub_story_10415026":{"slug":"hewynn-and-lyca"},"mn/herohub_story_10415098":{"slug":"idle-dialogue"},"mn/herohub_story_10415099":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415407":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415408":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415579":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415580":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415731":{"slug":"solise-and-hewynn"},"mn2/herohub_story_10413010":{"slug":"florabelle-and-hewynn"}}},
    "24": {"slug":"lyca","interactions":{"mn/herohub_story_10415011":{"slug":"lyca-and-parisa"},"mn/herohub_story_10415026":{"slug":"hewynn-and-lyca"},"mn/herohub_story_10415035":{"slug":"lyca-and-lily-may"},"mn/herohub_story_10415114":{"slug":"idle-dialogue"},"mn/herohub_story_10415115":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415343":{"slug":"tasi-and-lyca"},"mn/herohub_story_10415423":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415424":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415479":{"slug":"lorsan-and-lyca"},"mn/herohub_story_10415597":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415598":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10412030":{"slug":"parisa-and-lyca-and-kafra"},"mn2/herohub_story_10412070":{"slug":"lyca-and-lorsan"},"mn2/herohub_story_10412100":{"slug":"lorsan-and-lyca-heart-to-heart"},"mn2/herohub_story_10412110":{"slug":"lyca-and-eironn-and-parisa"},"mn2/herohub_story_10412170":{"slug":"lyca-and-kafra-and-parisa"},"mn2/herohub_story_10413020":{"slug":"lorsan-and-florabelle-and-lyca"},"mn2/herohub_story_10413050":{"slug":"lyca-and-chippy"},"mn2/herohub_story_10413080":{"slug":"eironn-and-lyca"},"mn2/herohub_story_10413120":{"slug":"lyca-and-hammie-and-chippy"}}},
    "27": {"slug":"mirael","interactions":{"mn/herohub_story_10415010":{"slug":"cassadee-and-mirael"},"mn/herohub_story_10415060":{"slug":"idle-dialogue"},"mn/herohub_story_10415061":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415341":{"slug":"valen-and-mirael"},"mn/herohub_story_10415365":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415366":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415535":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415536":{"slug":"idle-dialogue-6"}}},
    "64": {"slug":"korin","interactions":{"mn/herohub_story_10415706":{"slug":"perseus-and-korin"},"mn/herohub_story_10415025":{"slug":"damian-and-korin"},"mn/herohub_story_10415066":{"slug":"idle-dialogue"},"mn/herohub_story_10415067":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415371":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415372":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415541":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415542":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415663":{"slug":"thador-and-korin"},"mn2/herohub_story_10412020":{"slug":"korin-and-damian"},"mn2/herohub_story_10412080":{"slug":"chippy-and-korin"}}},
    "88": {"slug":"marilee","interactions":{"mn/herohub_story_10415015":{"slug":"marilee-and-fay"},"mn/herohub_story_10415062":{"slug":"idle-dialogue"},"mn/herohub_story_10415063":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415367":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415368":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415537":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415538":{"slug":"idle-dialogue-6"},"mn3/herohub_story_10414040":{"slug":"marilee-and-fay-heart-to-heart"},"mn3/herohub_story_10414110":{"slug":"fay-and-marilee"},"mn3/herohub_story_10414170":{"slug":"marilee-and-chippy"}}},
    "93": {"slug":"fay","interactions":{"mn/herohub_story_10415015":{"slug":"marilee-and-fay"},"mn/herohub_story_10415068":{"slug":"idle-dialogue"},"mn/herohub_story_10415069":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415373":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415374":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415543":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415544":{"slug":"idle-dialogue-6"},"mn3/herohub_story_10414030":{"slug":"fay-and-valen-and-hammie"},"mn3/herohub_story_10414040":{"slug":"marilee-and-fay-heart-to-heart"},"mn3/herohub_story_10414090":{"slug":"fay-and-hammie"},"mn3/herohub_story_10414110":{"slug":"fay-and-marilee"},"mn3/herohub_story_10414120":{"slug":"fay-and-temesia"},"mn3/herohub_story_10414160":{"slug":"atalanta-and-fay"}}},
    "94": {"slug":"chippy","interactions":{"ep1/herohub_story_11411010":{"slug":"hammie-and-chippy-and-alsa-and-soren"},"ep1/herohub_story_11411020":{"slug":"chippy-and-soren-and-alsa"},"ep1/herohub_story_11411050":{"slug":"chippy-and-lumont-and-hammie"},"ep1/herohub_story_11411130":{"slug":"alsa-and-chippy-and-mikola"},"ep1/herohub_story_11412050":{"slug":"walker-and-chippy-and-soren"},"ep1/herohub_story_11412100":{"slug":"chippy"},"ep1/herohub_story_11412150":{"slug":"odie-and-chippy-and-walker-and-satrana"},"ep1/herohub_story_11412160":{"slug":"chippy-and-antandra"},"ep2/herohub_story_12411050":{"slug":"chippy-and-hammie"},"ep2/herohub_story_12411090":{"slug":"sinbad-and-chippy"},"ep2/herohub_story_12411100":{"slug":"chippy-and-hammie-and-sinbad"},"ep2/herohub_story_12411110":{"slug":"sinbad-and-chippy-and-hammie"},"ep2/herohub_story_12411120":{"slug":"hugin-and-hammie-and-chippy"},"ep2/herohub_story_12411130":{"slug":"chippy-and-sinbad"},"ep2/herohub_story_12411140":{"slug":"chippy-and-hammie-heart-to-heart"},"ep2/herohub_story_12411150":{"slug":"hammie-and-chippy"},"ep2/herohub_story_12411160":{"slug":"chippy-and-hammie-heart-to-heart-2"},"ep2/herohub_story_12411190":{"slug":"sonja-and-chippy-and-hammie"},"ep2/herohub_story_12411200":{"slug":"sinbad-and-chippy-heart-to-heart"},"ep2/herohub_story_12411220":{"slug":"chippy-and-sonja-and-hammie"},"ep2/herohub_story_12411240":{"slug":"sinbad-and-hammie-and-chippy"},"ep2/herohub_story_12411250":{"slug":"nara-and-chippy-and-sonja-and-hammie"},"ep2/herohub_story_12411260":{"slug":"sonja-and-hammie-and-chippy"},"ep2/herohub_story_12411270":{"slug":"chippy-and-sonja"},"ep2/herohub_story_12411280":{"slug":"hammie-and-chippy-heart-to-heart"},"ep2/herohub_story_12411290":{"slug":"chippy-and-hammie-heart-to-heart-3"},"ep2/herohub_story_12411300":{"slug":"hammie-and-chippy-heart-to-heart-2"},"ep2/herohub_story_12411310":{"slug":"sonja-and-hammie-and-chippy-heart-to-heart"},"ep2/herohub_story_12411330":{"slug":"chippy-and-hammie-heart-to-heart-4"},"ep2/herohub_story_12411360":{"slug":"chippy-and-hammie-heart-to-heart-5"},"ep2/herohub_story_12411400":{"slug":"hugin-and-chippy"},"ep2/herohub_story_12411440":{"slug":"hugin-and-chippy-heart-to-heart"},"ep3/herohub_story_13411010":{"slug":"hugin-and-chippy-heart-to-heart-2"},"ep3/herohub_story_13411020":{"slug":"hammie-and-faramor-and-chippy"},"ep3/herohub_story_13411030":{"slug":"hugin-and-chippy-heart-to-heart-3"},"ep3/herohub_story_13411050":{"slug":"hammie-and-chippy-heart-to-heart-3"},"ep3/herohub_story_13411070":{"slug":"chippy-and-gerda-and-hammie"},"ep3/herohub_story_13411080":{"slug":"hammie-and-lorsan-and-chippy"},"ep3/herohub_story_13411110":{"slug":"chippy-and-hammie-heart-to-heart-6"},"ep3/herohub_story_13411120":{"slug":"chippy-and-lorsan-and-hammie"},"ep3/herohub_story_13411130":{"slug":"hammie-and-valka-and-chippy"},"ep3/herohub_story_13411160":{"slug":"hammie-and-chippy-heart-to-heart-4"},"ep3/herohub_story_13411170":{"slug":"chippy-and-hammie-heart-to-heart-7"},"ep3/herohub_story_13411180":{"slug":"chippy-and-hammie-heart-to-heart-8"},"ep3/herohub_story_13411220":{"slug":"chippy-and-hammie-heart-to-heart-9"},"ep3/herohub_story_13411230":{"slug":"valka-and-chippy"},"ep3/herohub_story_13411240":{"slug":"hammie-and-chippy-heart-to-heart-5"},"ep3/herohub_story_13411250":{"slug":"valka-and-chippy-heart-to-heart"},"ep3/herohub_story_13411280":{"slug":"igor-and-chippy"},"ep4/herohub_story_14411010":{"slug":"hammie-and-chippy-and-hogan"},"ep4/herohub_story_14411020":{"slug":"chippy-and-hammie-heart-to-heart-10"},"ep4/herohub_story_14411030":{"slug":"hammie-and-chippy-heart-to-heart-6"},"ep4/herohub_story_14411040":{"slug":"zanie-and-chippy"},"ep4/herohub_story_14411060":{"slug":"chippy-and-hammie-heart-to-heart-11"},"ep4/herohub_story_14411070":{"slug":"chippy-and-hammie-heart-to-heart-12"},"ep4/herohub_story_14411080":{"slug":"chippy-and-zanie"},"ep6/herohub_story_16411080":{"slug":"chippy-and-hammie-heart-to-heart-13"},"ep6/herohub_story_16411220":{"slug":"hammie-and-chippy-heart-to-heart-7"},"ep6/herohub_story_16411221":{"slug":"chippy-and-hammie-heart-to-heart-14"},"mn/herohub_story_10411020":{"slug":"hogan-and-chippy"},"mn/herohub_story_10411030":{"slug":"chippy-and-rowan"},"mn/herohub_story_10411050":{"slug":"chippy-and-hammie-and-valen"},"mn/herohub_story_10411060":{"slug":"valen-and-chippy"},"mn/herohub_story_10415154":{"slug":"idle-dialogue"},"mn/herohub_story_10415155":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415342":{"slug":"hugin-and-chippy-conversation"},"mn/herohub_story_10415475":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415476":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415655":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415656":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10412040":{"slug":"kafra-and-chippy-and-hammie"},"mn2/herohub_story_10412080":{"slug":"chippy-and-korin"},"mn2/herohub_story_10412130":{"slug":"hammie-and-chippy-heart-to-heart-8"},"mn2/herohub_story_10412140":{"slug":"chippy-and-lorsan"},"mn2/herohub_story_10412160":{"slug":"dahnie-and-chippy"},"mn2/herohub_story_10412180":{"slug":"chippy-and-hammie-heart-to-heart-15"},"mn2/herohub_story_10413030":{"slug":"hammie-and-chippy-and-bryon"},"mn2/herohub_story_10413040":{"slug":"chippy-and-lorsan-heart-to-heart"},"mn2/herohub_story_10413050":{"slug":"lyca-and-chippy"},"mn2/herohub_story_10413060":{"slug":"chippy-and-arden"},"mn2/herohub_story_10413120":{"slug":"lyca-and-hammie-and-chippy"},"mn2/herohub_story_10413140":{"slug":"chippy-and-arden-heart-to-heart"},"mn3/herohub_story_10414010":{"slug":"hammie-and-chippy-and-lucius-and-valen"},"mn3/herohub_story_10414020":{"slug":"chippy-and-temesia"},"mn3/herohub_story_10414050":{"slug":"chippy-and-atalanta"},"mn3/herohub_story_10414130":{"slug":"lucius-and-hammie-and-chippy"},"mn3/herohub_story_10414170":{"slug":"marilee-and-chippy"}}},
    "95": {"slug":"hammie","interactions":{"ep1/herohub_story_11411010":{"slug":"hammie-and-chippy-and-alsa-and-soren"},"ep1/herohub_story_11411050":{"slug":"chippy-and-lumont-and-hammie"},"ep1/herohub_story_11411100":{"slug":"hammie-and-alsa-and-soren"},"ep1/herohub_story_11412010":{"slug":"satrana-and-hammie-and-walker"},"ep1/herohub_story_11412040":{"slug":"hammie-and-satrana"},"ep1/herohub_story_11412070":{"slug":"hammie-and-koko-and-antandra"},"ep1/herohub_story_11412110":{"slug":"walker-and-hammie-and-satrana"},"ep2/herohub_story_12411010":{"slug":"hammie-and-sinbad"},"ep2/herohub_story_12411020":{"slug":"sinbad-and-hammie"},"ep2/herohub_story_12411030":{"slug":"hammie-and-sinbad-heart-to-heart"},"ep2/herohub_story_12411040":{"slug":"sinbad-and-hammie-heart-to-heart"},"ep2/herohub_story_12411050":{"slug":"chippy-and-hammie"},"ep2/herohub_story_12411060":{"slug":"hugin-and-hammie"},"ep2/herohub_story_12411080":{"slug":"hammie"},"ep2/herohub_story_12411100":{"slug":"chippy-and-hammie-and-sinbad"},"ep2/herohub_story_12411110":{"slug":"sinbad-and-chippy-and-hammie"},"ep2/herohub_story_12411120":{"slug":"hugin-and-hammie-and-chippy"},"ep2/herohub_story_12411140":{"slug":"chippy-and-hammie-heart-to-heart"},"ep2/herohub_story_12411150":{"slug":"hammie-and-chippy"},"ep2/herohub_story_12411160":{"slug":"chippy-and-hammie-heart-to-heart-2"},"ep2/herohub_story_12411170":{"slug":"sinbad-and-hammie-heart-to-heart-2"},"ep2/herohub_story_12411190":{"slug":"sonja-and-chippy-and-hammie"},"ep2/herohub_story_12411210":{"slug":"hammie-heart-to-heart"},"ep2/herohub_story_12411220":{"slug":"chippy-and-sonja-and-hammie"},"ep2/herohub_story_12411230":{"slug":"sinbad-and-hammie-and-glimmerbloom"},"ep2/herohub_story_12411240":{"slug":"sinbad-and-hammie-and-chippy"},"ep2/herohub_story_12411250":{"slug":"nara-and-chippy-and-sonja-and-hammie"},"ep2/herohub_story_12411260":{"slug":"sonja-and-hammie-and-chippy"},"ep2/herohub_story_12411280":{"slug":"hammie-and-chippy-heart-to-heart"},"ep2/herohub_story_12411290":{"slug":"chippy-and-hammie-heart-to-heart-3"},"ep2/herohub_story_12411300":{"slug":"hammie-and-chippy-heart-to-heart-2"},"ep2/herohub_story_12411310":{"slug":"sonja-and-hammie-and-chippy-heart-to-heart"},"ep2/herohub_story_12411330":{"slug":"chippy-and-hammie-heart-to-heart-4"},"ep2/herohub_story_12411340":{"slug":"hammie-heart-to-heart-2"},"ep2/herohub_story_12411350":{"slug":"hammie-and-sonja"},"ep2/herohub_story_12411360":{"slug":"chippy-and-hammie-heart-to-heart-5"},"ep2/herohub_story_12411370":{"slug":"sonja-and-hammie"},"ep2/herohub_story_12411390":{"slug":"hammie-and-lucca"},"ep2/herohub_story_12411410":{"slug":"lucca-and-hammie"},"ep2/herohub_story_12411420":{"slug":"sinbad-and-hammie-heart-to-heart-3"},"ep2/herohub_story_12411430":{"slug":"hammie-and-sonja-heart-to-heart"},"ep3/herohub_story_13411020":{"slug":"hammie-and-faramor-and-chippy"},"ep3/herohub_story_13411040":{"slug":"faramor-and-hammie"},"ep3/herohub_story_13411050":{"slug":"hammie-and-chippy-heart-to-heart-3"},"ep3/herohub_story_13411060":{"slug":"faramor-and-hammie-heart-to-heart"},"ep3/herohub_story_13411070":{"slug":"chippy-and-gerda-and-hammie"},"ep3/herohub_story_13411080":{"slug":"hammie-and-lorsan-and-chippy"},"ep3/herohub_story_13411100":{"slug":"lorsan-and-hammie"},"ep3/herohub_story_13411110":{"slug":"chippy-and-hammie-heart-to-heart-6"},"ep3/herohub_story_13411120":{"slug":"chippy-and-lorsan-and-hammie"},"ep3/herohub_story_13411130":{"slug":"hammie-and-valka-and-chippy"},"ep3/herohub_story_13411140":{"slug":"gerda-and-hammie"},"ep3/herohub_story_13411150":{"slug":"faramor-and-hammie-heart-to-heart-2"},"ep3/herohub_story_13411160":{"slug":"hammie-and-chippy-heart-to-heart-4"},"ep3/herohub_story_13411170":{"slug":"chippy-and-hammie-heart-to-heart-7"},"ep3/herohub_story_13411180":{"slug":"chippy-and-hammie-heart-to-heart-8"},"ep3/herohub_story_13411190":{"slug":"valka-and-hammie"},"ep3/herohub_story_13411200":{"slug":"hammie-and-ludovic"},"ep3/herohub_story_13411210":{"slug":"valka-and-hammie-heart-to-heart"},"ep3/herohub_story_13411220":{"slug":"chippy-and-hammie-heart-to-heart-9"},"ep3/herohub_story_13411240":{"slug":"hammie-and-chippy-heart-to-heart-5"},"ep3/herohub_story_13411260":{"slug":"ludovic-and-hammie"},"ep3/herohub_story_13411270":{"slug":"hammie-and-carolina"},"ep4/herohub_story_14411010":{"slug":"hammie-and-chippy-and-hogan"},"ep4/herohub_story_14411020":{"slug":"chippy-and-hammie-heart-to-heart-10"},"ep4/herohub_story_14411030":{"slug":"hammie-and-chippy-heart-to-heart-6"},"ep4/herohub_story_14411050":{"slug":"hammie-and-hogan"},"ep4/herohub_story_14411060":{"slug":"chippy-and-hammie-heart-to-heart-11"},"ep4/herohub_story_14411070":{"slug":"chippy-and-hammie-heart-to-heart-12"},"ep6/herohub_story_16411040":{"slug":"hammie-and-pippa"},"ep6/herohub_story_16411080":{"slug":"chippy-and-hammie-heart-to-heart-13"},"ep6/herohub_story_16411220":{"slug":"hammie-and-chippy-heart-to-heart-7"},"ep6/herohub_story_16411221":{"slug":"chippy-and-hammie-heart-to-heart-14"},"mn/herohub_story_10415704":{"slug":"hammie-and-galahad"},"mn/herohub_story_10411010":{"slug":"hammie-and-cassadee-and-valen"},"mn/herohub_story_10411050":{"slug":"chippy-and-hammie-and-valen"},"mn/herohub_story_10411070":{"slug":"hammie-and-cassadee"},"mn/herohub_story_10411080":{"slug":"cassadee-and-hammie"},"mn/herohub_story_10415156":{"slug":"idle-dialogue"},"mn/herohub_story_10415157":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415477":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415478":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415509":{"slug":"rowan-and-hammie"},"mn/herohub_story_10415657":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415658":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10412011":{"slug":"hammie-and-bryon-and-lorsan"},"mn2/herohub_story_10412040":{"slug":"kafra-and-chippy-and-hammie"},"mn2/herohub_story_10412120":{"slug":"eironn-and-kafra-and-hammie"},"mn2/herohub_story_10412130":{"slug":"hammie-and-chippy-heart-to-heart-8"},"mn2/herohub_story_10412150":{"slug":"hammie-and-bryon"},"mn2/herohub_story_10412180":{"slug":"chippy-and-hammie-heart-to-heart-15"},"mn2/herohub_story_10413030":{"slug":"hammie-and-chippy-and-bryon"},"mn2/herohub_story_10413120":{"slug":"lyca-and-hammie-and-chippy"},"mn3/herohub_story_10414010":{"slug":"hammie-and-chippy-and-lucius-and-valen"},"mn3/herohub_story_10414030":{"slug":"fay-and-valen-and-hammie"},"mn3/herohub_story_10414070":{"slug":"hammie-and-scarlita"},"mn3/herohub_story_10414080":{"slug":"hammie-and-dionel"},"mn3/herohub_story_10414090":{"slug":"fay-and-hammie"},"mn3/herohub_story_10414130":{"slug":"lucius-and-hammie-and-chippy"}}},
    "106": {"slug":"lucius","interactions":{"mn/herohub_story_10415027":{"slug":"lucius-and-temesia"},"mn/herohub_story_10415064":{"slug":"idle-dialogue"},"mn/herohub_story_10415065":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415369":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415370":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415539":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415540":{"slug":"idle-dialogue-6"},"mn3/herohub_story_10414010":{"slug":"hammie-and-chippy-and-lucius-and-valen"},"mn3/herohub_story_10414060":{"slug":"valen-and-lucius"},"mn3/herohub_story_10414130":{"slug":"lucius-and-hammie-and-chippy"}}},
    "181": {"slug":"eironn","interactions":{"mn/herohub_story_10415013":{"slug":"eironn-and-arden"},"mn/herohub_story_10415100":{"slug":"idle-dialogue"},"mn/herohub_story_10415101":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415409":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415410":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415581":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415582":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415671":{"slug":"indris-and-eironn"},"mn2/herohub_story_10412110":{"slug":"lyca-and-eironn-and-parisa"},"mn2/herohub_story_10412120":{"slug":"eironn-and-kafra-and-hammie"},"mn2/herohub_story_10413080":{"slug":"eironn-and-lyca"},"mn2/herohub_story_10413090":{"slug":"lorsan-and-eironn"}}},
    "189": {"slug":"damian","interactions":{"mn/herohub_story_10415016":{"slug":"hewynn-and-damian"},"mn/herohub_story_10415025":{"slug":"damian-and-korin"},"mn/herohub_story_10415116":{"slug":"idle-dialogue"},"mn/herohub_story_10415117":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415425":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415426":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415599":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415600":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10412020":{"slug":"korin-and-damian"},"mn2/herohub_story_10412090":{"slug":"lorsan-and-damian-and-dahnie"}}},
    "190": {"slug":"granny-dahnie","interactions":{"mn/herohub_story_10415707":{"slug":"granny-dahnie-and-tilaya"},"mn/herohub_story_10415034":{"slug":"lenya-and-granny-dahnie"},"mn/herohub_story_10415102":{"slug":"idle-dialogue"},"mn/herohub_story_10415103":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415411":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415412":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415510":{"slug":"lorsan-and-granny-dahnie"},"mn/herohub_story_10415583":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415584":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10412090":{"slug":"lorsan-and-damian-and-dahnie"},"mn2/herohub_story_10412160":{"slug":"dahnie-and-chippy"},"mn2/herohub_story_10413100":{"slug":"dahnie-and-arden"}}},
    "223": {"slug":"shakir","interactions":{"ep1/herohub_story_11411060":{"slug":"shakir"},"ep1/herohub_story_11411150":{"slug":"shakir-and-alsa-and-soren"},"mn/herohub_story_10415076":{"slug":"idle-dialogue"},"mn/herohub_story_10415077":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415385":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415386":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415486":{"slug":"shakir-and-faramor"},"mn/herohub_story_10415557":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415558":{"slug":"idle-dialogue-6"}}},
    "253": {"slug":"temesia","interactions":{"mn/herohub_story_10415027":{"slug":"lucius-and-temesia"},"mn/herohub_story_10415054":{"slug":"idle-dialogue"},"mn/herohub_story_10415055":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415355":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415356":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415523":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415524":{"slug":"idle-dialogue-6"},"mn3/herohub_story_10414020":{"slug":"chippy-and-temesia"},"mn3/herohub_story_10414120":{"slug":"fay-and-temesia"}}},
    "260": {"slug":"rowan","interactions":{"ep6/herohub_story_16411030":{"slug":"rowan"},"ep6/herohub_story_16411060":{"slug":"rowan-heart-to-heart"},"ep6/herohub_story_16411210":{"slug":"rowan-heart-to-heart-2"},"ep7/herohub_story_17411050":{"slug":"rowan-heart-to-heart-3"},"ep7/herohub_story_17411070":{"slug":"rowan-heart-to-heart-4"},"ep7/herohub_story_17411100":{"slug":"rowan-and-peggy"},"ep7/herohub_story_17411120":{"slug":"rowan-and-peggy-heart-to-heart"},"mn/herohub_story_10411030":{"slug":"chippy-and-rowan"},"mn/herohub_story_10415022":{"slug":"rowan-and-valen"},"mn/herohub_story_10415050":{"slug":"idle-dialogue"},"mn/herohub_story_10415051":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415351":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415352":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415509":{"slug":"rowan-and-hammie"},"mn/herohub_story_10415519":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415520":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415674":{"slug":"rowan-and-baelran"},"mn/herohub_story_10415765":{"slug":"rowan-and-peggy-conversation"}}},
    "309": {"slug":"vala","interactions":{"mn/herohub_story_10411040":{"slug":"valen-and-vala"},"mn/herohub_story_10415023":{"slug":"vala"},"mn/herohub_story_10415048":{"slug":"idle-dialogue"},"mn/herohub_story_10415049":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415349":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415350":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415517":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415518":{"slug":"idle-dialogue-6"}}},
    "310": {"slug":"peggy","interactions":{"ep6/herohub_story_16411180":{"slug":"peggy"},"ep6/herohub_story_16411200":{"slug":"imperial-soldier-and-peggy"},"ep7/herohub_story_17411100":{"slug":"rowan-and-peggy"},"ep7/herohub_story_17411120":{"slug":"rowan-and-peggy-heart-to-heart"},"mn/herohub_story_10415765":{"slug":"rowan-and-peggy-conversation"},"mn/herohub_story_10415766":{"slug":"peggy-and-pippa"},"mn/herohub_story_10415779":{"slug":"idle-dialogue"},"mn/herohub_story_10415780":{"slug":"idle-dialogue-2"}}},
    "354": {"slug":"seth","interactions":{"ep1/herohub_story_11411090":{"slug":"seth"},"ep1/herohub_story_11411180":{"slug":"seth-heart-to-heart"},"mn/herohub_story_10415092":{"slug":"idle-dialogue"},"mn/herohub_story_10415093":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415401":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415402":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415573":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415574":{"slug":"idle-dialogue-6"}}},
    "393": {"slug":"dionel","interactions":{"mn/herohub_story_10415014":{"slug":"dionel-and-scarlita"},"mn/herohub_story_10415020":{"slug":"scarlita-and-dionel"},"mn/herohub_story_10415032":{"slug":"talene-and-dionel"},"mn/herohub_story_10415039":{"slug":"dionel-and-dunlingr"},"mn/herohub_story_10415142":{"slug":"idle-dialogue"},"mn/herohub_story_10415143":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415346":{"slug":"dionel-and-talene"},"mn/herohub_story_10415459":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415460":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415480":{"slug":"dionel-and-elijah-and-lailah"},"mn/herohub_story_10415637":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415638":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415666":{"slug":"baelran-and-dionel"},"mn/herohub_story_10415763":{"slug":"dionel-and-sylphira"},"mn3/herohub_story_10414080":{"slug":"hammie-and-dionel"},"mn3/herohub_story_10414140":{"slug":"dionel-and-scarlita-heart-to-heart"},"mn3/herohub_story_10414150":{"slug":"scarlita-and-dionel-heart-to-heart"}}},
    "401": {"slug":"parisa","interactions":{"mn/herohub_story_10415011":{"slug":"lyca-and-parisa"},"mn/herohub_story_10415024":{"slug":"parisa-and-kafra"},"mn/herohub_story_10415045":{"slug":"parisa-and-tasi"},"mn/herohub_story_10415120":{"slug":"idle-dialogue"},"mn/herohub_story_10415121":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415429":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415430":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415603":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415604":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10412030":{"slug":"parisa-and-lyca-and-kafra"},"mn2/herohub_story_10412110":{"slug":"lyca-and-eironn-and-parisa"},"mn2/herohub_story_10412170":{"slug":"lyca-and-kafra-and-parisa"}}},
    "402": {"slug":"kafra","interactions":{"mn/herohub_story_10415024":{"slug":"parisa-and-kafra"},"mn/herohub_story_10415118":{"slug":"idle-dialogue"},"mn/herohub_story_10415119":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415427":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415428":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415601":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415602":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415703":{"slug":"kafra-and-zandrok"},"mn2/herohub_story_10412030":{"slug":"parisa-and-lyca-and-kafra"},"mn2/herohub_story_10412040":{"slug":"kafra-and-chippy-and-hammie"},"mn2/herohub_story_10412120":{"slug":"eironn-and-kafra-and-hammie"},"mn2/herohub_story_10412170":{"slug":"lyca-and-kafra-and-parisa"}}},
    "403": {"slug":"cecia","interactions":{"mn/herohub_story_10415018":{"slug":"cecia-and-salazer"},"mn/herohub_story_10415033":{"slug":"ludovic-and-cecia"},"mn/herohub_story_10415130":{"slug":"idle-dialogue"},"mn/herohub_story_10415131":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415441":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415442":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415617":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415618":{"slug":"idle-dialogue-6"}}},
    "422": {"slug":"berial","interactions":{"mn/herohub_story_10415021":{"slug":"berial-and-reinier"},"mn/herohub_story_10415148":{"slug":"idle-dialogue"},"mn/herohub_story_10415149":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415467":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415468":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415514":{"slug":"berial-and-phraesto"},"mn/herohub_story_10415647":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415648":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415767":{"slug":"berial-and-lamentis"}}},
    "423": {"slug":"scarlita","interactions":{"mn/herohub_story_10415014":{"slug":"dionel-and-scarlita"},"mn/herohub_story_10415020":{"slug":"scarlita-and-dionel"},"mn/herohub_story_10415144":{"slug":"idle-dialogue"},"mn/herohub_story_10415145":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415461":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415462":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415488":{"slug":"athalia-and-scarlita"},"mn/herohub_story_10415639":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415640":{"slug":"idle-dialogue-6"},"mn3/herohub_story_10414070":{"slug":"hammie-and-scarlita"},"mn3/herohub_story_10414140":{"slug":"dionel-and-scarlita-heart-to-heart"},"mn3/herohub_story_10414150":{"slug":"scarlita-and-dionel-heart-to-heart"}}},
    "542": {"slug":"smokey-and-meerky","interactions":{"ep1/herohub_story_11411070":{"slug":"smokey"},"ep1/herohub_story_11411160":{"slug":"smokey-heart-to-heart"},"mn/herohub_story_10415012":{"slug":"odie-and-smokey-and-meerky"},"mn/herohub_story_10415074":{"slug":"idle-dialogue"},"mn/herohub_story_10415075":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415383":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415384":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415487":{"slug":"shemira-and-smokey-and-meerky"},"mn/herohub_story_10415555":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415556":{"slug":"idle-dialogue-6"}}},
    "543": {"slug":"lumont","interactions":{"ep1/herohub_story_11411050":{"slug":"chippy-and-lumont-and-hammie"},"ep1/herohub_story_11411140":{"slug":"lumont"},"mn/herohub_story_10415708":{"slug":"lumont-and-kordan"},"mn/herohub_story_10415017":{"slug":"lumont-and-brutus"},"mn/herohub_story_10415072":{"slug":"idle-dialogue"},"mn/herohub_story_10415073":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415381":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415382":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415553":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415554":{"slug":"idle-dialogue-6"}}},
    "544": {"slug":"brutus","interactions":{"ep1/herohub_story_11411080":{"slug":"brutus"},"ep1/herohub_story_11411170":{"slug":"alsa-and-brutus"},"mn/herohub_story_10415705":{"slug":"nazrik-and-brutus"},"mn/herohub_story_10415017":{"slug":"lumont-and-brutus"},"mn/herohub_story_10415036":{"slug":"mikola-and-brutus"},"mn/herohub_story_10415070":{"slug":"idle-dialogue"},"mn/herohub_story_10415071":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415344":{"slug":"alsa-and-brutus-conversation"},"mn/herohub_story_10415379":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415380":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415551":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415552":{"slug":"idle-dialogue-6"}}},
    "616": {"slug":"walker","interactions":{"ep1/herohub_story_11412010":{"slug":"satrana-and-hammie-and-walker"},"ep1/herohub_story_11412020":{"slug":"soren-and-walker"},"ep1/herohub_story_11412050":{"slug":"walker-and-chippy-and-soren"},"ep1/herohub_story_11412060":{"slug":"odie-and-walker"},"ep1/herohub_story_11412110":{"slug":"walker-and-hammie-and-satrana"},"ep1/herohub_story_11412130":{"slug":"walker-and-soren"},"ep1/herohub_story_11412140":{"slug":"walker-and-satrana"},"ep1/herohub_story_11412150":{"slug":"odie-and-chippy-and-walker-and-satrana"},"ep1/herohub_story_11412180":{"slug":"rhys-and-walker"},"mn/herohub_story_10415056":{"slug":"idle-dialogue"},"mn/herohub_story_10415057":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415357":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415358":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415525":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415526":{"slug":"idle-dialogue-6"}}},
    "617": {"slug":"antandra","interactions":{"ep1/herohub_story_11412070":{"slug":"hammie-and-koko-and-antandra"},"ep1/herohub_story_11412080":{"slug":"antandra-and-soren"},"ep1/herohub_story_11412120":{"slug":"antandra-and-soren-and-satrana"},"ep1/herohub_story_11412160":{"slug":"chippy-and-antandra"},"mn/herohub_story_10415088":{"slug":"idle-dialogue"},"mn/herohub_story_10415089":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415397":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415398":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415569":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415570":{"slug":"idle-dialogue-6"}}},
    "618": {"slug":"rhys","interactions":{"ep1/herohub_story_11412090":{"slug":"rhys-and-soren"},"ep1/herohub_story_11412180":{"slug":"rhys-and-walker"},"mn/herohub_story_10415080":{"slug":"idle-dialogue"},"mn/herohub_story_10415081":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415389":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415390":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415561":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415562":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415665":{"slug":"kulu-and-rhys"}}},
    "620": {"slug":"koko","interactions":{"ep1/herohub_story_11412070":{"slug":"hammie-and-koko-and-antandra"},"ep1/herohub_story_11412170":{"slug":"koko"},"mn/herohub_story_10415078":{"slug":"idle-dialogue"},"mn/herohub_story_10415079":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415387":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415388":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415559":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415560":{"slug":"idle-dialogue-6"}}},
    "628": {"slug":"odie","interactions":{"ep1/herohub_story_11412060":{"slug":"odie-and-walker"},"ep1/herohub_story_11412150":{"slug":"odie-and-chippy-and-walker-and-satrana"},"mn/herohub_story_10415012":{"slug":"odie-and-smokey-and-meerky"},"mn/herohub_story_10415090":{"slug":"idle-dialogue"},"mn/herohub_story_10415091":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415326":{"slug":"odie-and-lucca"},"mn/herohub_story_10415399":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415400":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415571":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415572":{"slug":"idle-dialogue-6"}}},
    "637": {"slug":"soren","interactions":{"ep1/herohub_story_11411010":{"slug":"hammie-and-chippy-and-alsa-and-soren"},"ep1/herohub_story_11411020":{"slug":"chippy-and-soren-and-alsa"},"ep1/herohub_story_11411030":{"slug":"alsa-and-soren"},"ep1/herohub_story_11411040":{"slug":"alsa-and-soren-and-mikola"},"ep1/herohub_story_11411100":{"slug":"hammie-and-alsa-and-soren"},"ep1/herohub_story_11411120":{"slug":"soren"},"ep1/herohub_story_11411150":{"slug":"shakir-and-alsa-and-soren"},"ep1/herohub_story_11412020":{"slug":"soren-and-walker"},"ep1/herohub_story_11412050":{"slug":"walker-and-chippy-and-soren"},"ep1/herohub_story_11412080":{"slug":"antandra-and-soren"},"ep1/herohub_story_11412090":{"slug":"rhys-and-soren"},"ep1/herohub_story_11412120":{"slug":"antandra-and-soren-and-satrana"},"ep1/herohub_story_11412130":{"slug":"walker-and-soren"},"mn/herohub_story_10415028":{"slug":"soren-and-alsa"},"mn/herohub_story_10415029":{"slug":"alsa-and-soren-conversation"},"mn/herohub_story_10415082":{"slug":"idle-dialogue"},"mn/herohub_story_10415083":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415391":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415392":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415563":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415564":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415669":{"slug":"soren-and-pang"}}},
    "638": {"slug":"alsa","interactions":{"ep1/herohub_story_11411010":{"slug":"hammie-and-chippy-and-alsa-and-soren"},"ep1/herohub_story_11411020":{"slug":"chippy-and-soren-and-alsa"},"ep1/herohub_story_11411030":{"slug":"alsa-and-soren"},"ep1/herohub_story_11411040":{"slug":"alsa-and-soren-and-mikola"},"ep1/herohub_story_11411100":{"slug":"hammie-and-alsa-and-soren"},"ep1/herohub_story_11411110":{"slug":"alsa"},"ep1/herohub_story_11411130":{"slug":"alsa-and-chippy-and-mikola"},"ep1/herohub_story_11411150":{"slug":"shakir-and-alsa-and-soren"},"ep1/herohub_story_11411170":{"slug":"alsa-and-brutus"},"mn/herohub_story_10415028":{"slug":"soren-and-alsa"},"mn/herohub_story_10415029":{"slug":"alsa-and-soren-conversation"},"mn/herohub_story_10415084":{"slug":"idle-dialogue"},"mn/herohub_story_10415085":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415344":{"slug":"alsa-and-brutus-conversation"},"mn/herohub_story_10415393":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415394":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415565":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415566":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415810":{"slug":"brock-and-alsa"}}},
    "640": {"slug":"mikola","interactions":{"ep1/herohub_story_11411040":{"slug":"alsa-and-soren-and-mikola"},"ep1/herohub_story_11411130":{"slug":"alsa-and-chippy-and-mikola"},"mn/herohub_story_10415036":{"slug":"mikola-and-brutus"},"mn/herohub_story_10415086":{"slug":"idle-dialogue"},"mn/herohub_story_10415087":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415395":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415396":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415485":{"slug":"mikola-and-gerda"},"mn/herohub_story_10415511":{"slug":"satrana-and-mikola"},"mn/herohub_story_10415567":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415568":{"slug":"idle-dialogue-6"}}},
    "641": {"slug":"satrana","interactions":{"ep1/herohub_story_11412010":{"slug":"satrana-and-hammie-and-walker"},"ep1/herohub_story_11412030":{"slug":"satrana"},"ep1/herohub_story_11412040":{"slug":"hammie-and-satrana"},"ep1/herohub_story_11412110":{"slug":"walker-and-hammie-and-satrana"},"ep1/herohub_story_11412120":{"slug":"antandra-and-soren-and-satrana"},"ep1/herohub_story_11412140":{"slug":"walker-and-satrana"},"ep1/herohub_story_11412150":{"slug":"odie-and-chippy-and-walker-and-satrana"},"mn/herohub_story_10415096":{"slug":"idle-dialogue"},"mn/herohub_story_10415097":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415405":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415406":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415511":{"slug":"satrana-and-mikola"},"mn/herohub_story_10415577":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415578":{"slug":"idle-dialogue-6"}}},
    "668": {"slug":"phraesto","interactions":{"mn/herohub_story_10415030":{"slug":"phraesto-and-reinier"},"mn/herohub_story_10415152":{"slug":"idle-dialogue"},"mn/herohub_story_10415153":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415471":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415472":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415514":{"slug":"berial-and-phraesto"},"mn/herohub_story_10415651":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415652":{"slug":"idle-dialogue-6"}}},
    "680": {"slug":"salazer","interactions":{"mn/herohub_story_10415018":{"slug":"cecia-and-salazer"},"mn/herohub_story_10415138":{"slug":"idle-dialogue"},"mn/herohub_story_10415139":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415453":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415454":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415631":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415632":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415659":{"slug":"indris-and-salazer"}}},
    "681": {"slug":"niru","interactions":{"mn/herohub_story_10415019":{"slug":"niru-and-viperian"},"mn/herohub_story_10415134":{"slug":"idle-dialogue"},"mn/herohub_story_10415135":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415449":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415450":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415627":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415628":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415804":{"slug":"niru-and-thane"}}},
    "682": {"slug":"viperian","interactions":{"mn/herohub_story_10415019":{"slug":"niru-and-viperian"},"mn/herohub_story_10415042":{"slug":"hodgkin-and-viperian"},"mn/herohub_story_10415140":{"slug":"idle-dialogue"},"mn/herohub_story_10415141":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415335":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415336":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415345":{"slug":"thoran-and-viperian"},"mn/herohub_story_10415455":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415456":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415633":{"slug":"idle-dialogue-7"},"mn/herohub_story_10415634":{"slug":"idle-dialogue-8"}}},
    "683": {"slug":"reinier","interactions":{"mn/herohub_story_10415709":{"slug":"reinier-and-mehira"},"mn/herohub_story_10415021":{"slug":"berial-and-reinier"},"mn/herohub_story_10415030":{"slug":"phraesto-and-reinier"},"mn/herohub_story_10415150":{"slug":"idle-dialogue"},"mn/herohub_story_10415151":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415469":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415470":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415649":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415650":{"slug":"idle-dialogue-6"}}},
    "688": {"slug":"talene","interactions":{"mn/herohub_story_10415032":{"slug":"talene-and-dionel"},"mn/herohub_story_10415146":{"slug":"idle-dialogue"},"mn/herohub_story_10415147":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415346":{"slug":"dionel-and-talene"},"mn/herohub_story_10415463":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415464":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415484":{"slug":"cryonaia-and-talene"},"mn/herohub_story_10415641":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415642":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415764":{"slug":"kazim-and-talene"}}},
    "706": {"slug":"lenya","interactions":{"mn/herohub_story_10415034":{"slug":"lenya-and-granny-dahnie"},"mn/herohub_story_10415110":{"slug":"idle-dialogue"},"mn/herohub_story_10415111":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415433":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415434":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415607":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415608":{"slug":"idle-dialogue-6"}}},
    "712": {"slug":"sonja","interactions":{"ep2/herohub_story_12411180":{"slug":"nara-and-sonja"},"ep2/herohub_story_12411190":{"slug":"sonja-and-chippy-and-hammie"},"ep2/herohub_story_12411220":{"slug":"chippy-and-sonja-and-hammie"},"ep2/herohub_story_12411250":{"slug":"nara-and-chippy-and-sonja-and-hammie"},"ep2/herohub_story_12411260":{"slug":"sonja-and-hammie-and-chippy"},"ep2/herohub_story_12411270":{"slug":"chippy-and-sonja"},"ep2/herohub_story_12411310":{"slug":"sonja-and-hammie-and-chippy-heart-to-heart"},"ep2/herohub_story_12411320":{"slug":"sonja"},"ep2/herohub_story_12411350":{"slug":"hammie-and-sonja"},"ep2/herohub_story_12411370":{"slug":"sonja-and-hammie"},"ep2/herohub_story_12411380":{"slug":"lucca-and-sonja"},"ep2/herohub_story_12411430":{"slug":"hammie-and-sonja-heart-to-heart"},"mn/herohub_story_10415037":{"slug":"sonja-and-nara"},"mn/herohub_story_10415038":{"slug":"sinbad-and-sonja"},"mn/herohub_story_10415041":{"slug":"hodgkin-and-sonja"},"mn/herohub_story_10415324":{"slug":"idle-dialogue"},"mn/herohub_story_10415325":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415359":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415360":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415527":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415528":{"slug":"idle-dialogue-6"}}},
    "715": {"slug":"bonnie","interactions":{"mn/herohub_story_10415040":{"slug":"bonnie-and-hodgkin"},"mn/herohub_story_10415043":{"slug":"bonnie-and-nara"},"mn/herohub_story_10415327":{"slug":"idle-dialogue"},"mn/herohub_story_10415328":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415457":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415458":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415635":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415636":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415661":{"slug":"bonnie-and-velara"}}},
    "717": {"slug":"sinbad","interactions":{"ep2/herohub_story_12411010":{"slug":"hammie-and-sinbad"},"ep2/herohub_story_12411020":{"slug":"sinbad-and-hammie"},"ep2/herohub_story_12411030":{"slug":"hammie-and-sinbad-heart-to-heart"},"ep2/herohub_story_12411040":{"slug":"sinbad-and-hammie-heart-to-heart"},"ep2/herohub_story_12411070":{"slug":"hugin-and-sinbad"},"ep2/herohub_story_12411090":{"slug":"sinbad-and-chippy"},"ep2/herohub_story_12411100":{"slug":"chippy-and-hammie-and-sinbad"},"ep2/herohub_story_12411110":{"slug":"sinbad-and-chippy-and-hammie"},"ep2/herohub_story_12411130":{"slug":"chippy-and-sinbad"},"ep2/herohub_story_12411170":{"slug":"sinbad-and-hammie-heart-to-heart-2"},"ep2/herohub_story_12411200":{"slug":"sinbad-and-chippy-heart-to-heart"},"ep2/herohub_story_12411230":{"slug":"sinbad-and-hammie-and-glimmerbloom"},"ep2/herohub_story_12411240":{"slug":"sinbad-and-hammie-and-chippy"},"ep2/herohub_story_12411420":{"slug":"sinbad-and-hammie-heart-to-heart-3"},"mn/herohub_story_10415038":{"slug":"sinbad-and-sonja"},"mn/herohub_story_10415320":{"slug":"idle-dialogue"},"mn/herohub_story_10415321":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415375":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415376":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415545":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415546":{"slug":"idle-dialogue-6"}}},
    "718": {"slug":"lucca","interactions":{"ep2/herohub_story_12411380":{"slug":"lucca-and-sonja"},"ep2/herohub_story_12411390":{"slug":"hammie-and-lucca"},"ep2/herohub_story_12411410":{"slug":"lucca-and-hammie"},"mn/herohub_story_10415326":{"slug":"odie-and-lucca"},"mn/herohub_story_10415333":{"slug":"idle-dialogue"},"mn/herohub_story_10415334":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415377":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415378":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415547":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415548":{"slug":"idle-dialogue-6"}}},
    "720": {"slug":"nara","interactions":{"ep2/herohub_story_12411180":{"slug":"nara-and-sonja"},"ep2/herohub_story_12411250":{"slug":"nara-and-chippy-and-sonja-and-hammie"},"mn/herohub_story_10415037":{"slug":"sonja-and-nara"},"mn/herohub_story_10415043":{"slug":"bonnie-and-nara"},"mn/herohub_story_10415322":{"slug":"idle-dialogue"},"mn/herohub_story_10415323":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415445":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415446":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415621":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415622":{"slug":"idle-dialogue-6"}}},
    "721": {"slug":"tasi","interactions":{"mn/herohub_story_10415712":{"slug":"tasi-and-aurora-and-sonny"},"mn/herohub_story_10415045":{"slug":"parisa-and-tasi"},"mn/herohub_story_10415339":{"slug":"idle-dialogue"},"mn/herohub_story_10415340":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415343":{"slug":"tasi-and-lyca"},"mn/herohub_story_10415419":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415420":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415591":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415592":{"slug":"idle-dialogue-6"}}},
    "722": {"slug":"ulmus","interactions":{"mn/herohub_story_10415031":{"slug":"ulmus-and-arden"},"mn/herohub_story_10415122":{"slug":"idle-dialogue"},"mn/herohub_story_10415123":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415431":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415432":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415605":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415606":{"slug":"idle-dialogue-6"}}},
    "723": {"slug":"hugin","interactions":{"ep2/herohub_story_12411060":{"slug":"hugin-and-hammie"},"ep2/herohub_story_12411070":{"slug":"hugin-and-sinbad"},"ep2/herohub_story_12411120":{"slug":"hugin-and-hammie-and-chippy"},"ep2/herohub_story_12411400":{"slug":"hugin-and-chippy"},"ep2/herohub_story_12411440":{"slug":"hugin-and-chippy-heart-to-heart"},"ep3/herohub_story_13411010":{"slug":"hugin-and-chippy-heart-to-heart-2"},"ep3/herohub_story_13411030":{"slug":"hugin-and-chippy-heart-to-heart-3"},"mn/herohub_story_10415329":{"slug":"idle-dialogue"},"mn/herohub_story_10415330":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415342":{"slug":"hugin-and-chippy-conversation"},"mn/herohub_story_10415361":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415362":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415482":{"slug":"hugin-and-callan"},"mn/herohub_story_10415529":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415530":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415660":{"slug":"zanie-and-hugin"}}},
    "724": {"slug":"hodgkin","interactions":{"mn/herohub_story_10415040":{"slug":"bonnie-and-hodgkin"},"mn/herohub_story_10415041":{"slug":"hodgkin-and-sonja"},"mn/herohub_story_10415042":{"slug":"hodgkin-and-viperian"},"mn/herohub_story_10415044":{"slug":"harak-and-hodgkin"},"mn/herohub_story_10415331":{"slug":"idle-dialogue"},"mn/herohub_story_10415332":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415447":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415448":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415623":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415624":{"slug":"idle-dialogue-6"}}},
    "758": {"slug":"lily-may","interactions":{"mn/herohub_story_10415710":{"slug":"shadewing-and-lily-may"},"mn/herohub_story_10415035":{"slug":"lyca-and-lily-may"},"mn/herohub_story_10415108":{"slug":"idle-dialogue"},"mn/herohub_story_10415109":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415417":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415418":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415589":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415590":{"slug":"idle-dialogue-6"}}},
    "913": {"slug":"dunlingr","interactions":{"mn/herohub_story_10415039":{"slug":"dionel-and-dunlingr"},"mn/herohub_story_10415318":{"slug":"idle-dialogue"},"mn/herohub_story_10415319":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415465":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415466":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415643":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415644":{"slug":"idle-dialogue-6"}}},
    "916": {"slug":"harak","interactions":{"mn/herohub_story_10415044":{"slug":"harak-and-hodgkin"},"mn/herohub_story_10415337":{"slug":"idle-dialogue"},"mn/herohub_story_10415338":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415473":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415474":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415653":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415654":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415664":{"slug":"saida-and-harak"}}},
    "921": {"slug":"valka","interactions":{"ep3/herohub_story_13411130":{"slug":"hammie-and-valka-and-chippy"},"ep3/herohub_story_13411190":{"slug":"valka-and-hammie"},"ep3/herohub_story_13411210":{"slug":"valka-and-hammie-heart-to-heart"},"ep3/herohub_story_13411230":{"slug":"valka-and-chippy"},"ep3/herohub_story_13411250":{"slug":"valka-and-chippy-heart-to-heart"},"mn/herohub_story_10415481":{"slug":"valka-and-igor"},"mn/herohub_story_10415493":{"slug":"idle-dialogue"},"mn/herohub_story_10415494":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415512":{"slug":"valka-and-ludovic"},"mn/herohub_story_10415625":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415626":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415734":{"slug":"silven-and-valka"}}},
    "930": {"slug":"callan","interactions":{"ep3/herohub_story_13411290":{"slug":"callan-and-carolina"},"mn/herohub_story_10415482":{"slug":"hugin-and-callan"},"mn/herohub_story_10415495":{"slug":"idle-dialogue"},"mn/herohub_story_10415496":{"slug":"idle-dialogue-2"}}},
    "931": {"slug":"carolina","interactions":{"ep3/herohub_story_13411270":{"slug":"hammie-and-carolina"},"ep3/herohub_story_13411290":{"slug":"callan-and-carolina"},"mn/herohub_story_10415126":{"slug":"idle-dialogue"},"mn/herohub_story_10415127":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415437":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415438":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415613":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415614":{"slug":"idle-dialogue-6"}}},
    "935": {"slug":"ludovic","interactions":{"ep3/herohub_story_13411200":{"slug":"hammie-and-ludovic"},"ep3/herohub_story_13411260":{"slug":"ludovic-and-hammie"},"mn/herohub_story_10415033":{"slug":"ludovic-and-cecia"},"mn/herohub_story_10415132":{"slug":"idle-dialogue"},"mn/herohub_story_10415133":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415443":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415444":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415512":{"slug":"valka-and-ludovic"},"mn/herohub_story_10415619":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415620":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415761":{"slug":"ludovic-and-nerion"},"mn/herohub_story_10415800":{"slug":"senea-and-ludovic"}}},
    "937": {"slug":"cryonaia","interactions":{"mn/herohub_story_10415484":{"slug":"cryonaia-and-talene"},"mn/herohub_story_10415499":{"slug":"idle-dialogue"},"mn/herohub_story_10415500":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415736":{"slug":"cryonaia-and-hepler"}}},
    "955": {"slug":"cyran","interactions":{"ep7/herohub_story_17411010":{"slug":"cyran"},"ep7/herohub_story_17411030":{"slug":"cyran-heart-to-heart"},"mn/herohub_story_10415483":{"slug":"cassadee-and-cyran"},"mn/herohub_story_10415497":{"slug":"idle-dialogue"},"mn/herohub_story_10415498":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415531":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415532":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415740":{"slug":"cassadee-and-cyran-conversation"}}},
    "959": {"slug":"faramor","interactions":{"ep3/herohub_story_13411020":{"slug":"hammie-and-faramor-and-chippy"},"ep3/herohub_story_13411040":{"slug":"faramor-and-hammie"},"ep3/herohub_story_13411060":{"slug":"faramor-and-hammie-heart-to-heart"},"ep3/herohub_story_13411150":{"slug":"faramor-and-hammie-heart-to-heart-2"},"mn/herohub_story_10415486":{"slug":"shakir-and-faramor"},"mn/herohub_story_10415503":{"slug":"idle-dialogue"},"mn/herohub_story_10415504":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415593":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415594":{"slug":"idle-dialogue-4"}}},
    "960": {"slug":"gerda","interactions":{"ep3/herohub_story_13411070":{"slug":"chippy-and-gerda-and-hammie"},"ep3/herohub_story_13411090":{"slug":"gerda-and-lorsan"},"ep3/herohub_story_13411140":{"slug":"gerda-and-hammie"},"mn/herohub_story_10415485":{"slug":"mikola-and-gerda"},"mn/herohub_story_10415501":{"slug":"idle-dialogue"},"mn/herohub_story_10415502":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415549":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415550":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415769":{"slug":"gerda-and-voracia"}}},
    "964": {"slug":"igor","interactions":{"ep3/herohub_story_13411280":{"slug":"igor-and-chippy"},"mn/herohub_story_10415128":{"slug":"idle-dialogue"},"mn/herohub_story_10415129":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415439":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415440":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415481":{"slug":"valka-and-igor"},"mn/herohub_story_10415615":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415616":{"slug":"idle-dialogue-6"}}},
    "1154": {"slug":"lorsan","interactions":{"ep3/herohub_story_13411080":{"slug":"hammie-and-lorsan-and-chippy"},"ep3/herohub_story_13411090":{"slug":"gerda-and-lorsan"},"ep3/herohub_story_13411100":{"slug":"lorsan-and-hammie"},"ep3/herohub_story_13411120":{"slug":"chippy-and-lorsan-and-hammie"},"mn/herohub_story_10415479":{"slug":"lorsan-and-lyca"},"mn/herohub_story_10415489":{"slug":"idle-dialogue"},"mn/herohub_story_10415490":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415510":{"slug":"lorsan-and-granny-dahnie"},"mn/herohub_story_10415609":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415610":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415803":{"slug":"lorsan-and-baden"},"mn2/herohub_story_10412011":{"slug":"hammie-and-bryon-and-lorsan"},"mn2/herohub_story_10412070":{"slug":"lyca-and-lorsan"},"mn2/herohub_story_10412090":{"slug":"lorsan-and-damian-and-dahnie"},"mn2/herohub_story_10412100":{"slug":"lorsan-and-lyca-heart-to-heart"},"mn2/herohub_story_10412140":{"slug":"chippy-and-lorsan"},"mn2/herohub_story_10413020":{"slug":"lorsan-and-florabelle-and-lyca"},"mn2/herohub_story_10413040":{"slug":"chippy-and-lorsan-heart-to-heart"},"mn2/herohub_story_10413070":{"slug":"lorsan-and-bryon"},"mn2/herohub_story_10413090":{"slug":"lorsan-and-eironn"},"mn2/herohub_story_10413110":{"slug":"lorsan-and-bryon-heart-to-heart"},"mn2/herohub_story_10413130":{"slug":"florabelle-and-lorsan"}}},
    "1163": {"slug":"zanie","interactions":{"ep4/herohub_story_14411040":{"slug":"zanie-and-chippy"},"ep4/herohub_story_14411080":{"slug":"chippy-and-zanie"},"ep4/herohub_story_14411090":{"slug":"zanie"},"ep4/herohub_story_14411130":{"slug":"zanie-heart-to-heart"},"ep4/herohub_story_14411170":{"slug":"zanie-heart-to-heart-2"},"ep4/herohub_story_14411210":{"slug":"zanie-heart-to-heart-3"},"ep4/herohub_story_14411230":{"slug":"zanie-and-indris"},"ep4/herohub_story_14411240":{"slug":"zanie-heart-to-heart-4"},"ep4/herohub_story_14411280":{"slug":"zanie-heart-to-heart-5"},"mn/herohub_story_10415660":{"slug":"zanie-and-hugin"},"mn/herohub_story_10415673":{"slug":"kulu-and-zanie"},"mn/herohub_story_10415685":{"slug":"idle-dialogue"},"mn/herohub_story_10415686":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415738":{"slug":"zanie-and-gunnar"},"mn/herohub_story_10415760":{"slug":"zanie-and-alna"}}},
    "1164": {"slug":"indris","interactions":{"ep4/herohub_story_14411100":{"slug":"indris"},"ep4/herohub_story_14411110":{"slug":"ravion-and-indris"},"ep4/herohub_story_14411160":{"slug":"indris-heart-to-heart"},"ep4/herohub_story_14411180":{"slug":"indris-and-thador"},"ep4/herohub_story_14411190":{"slug":"indris-heart-to-heart-2"},"ep4/herohub_story_14411220":{"slug":"indris-heart-to-heart-3"},"ep4/herohub_story_14411230":{"slug":"zanie-and-indris"},"ep4/herohub_story_14411250":{"slug":"indris-heart-to-heart-4"},"ep4/herohub_story_14411270":{"slug":"indris-heart-to-heart-5"},"mn/herohub_story_10415659":{"slug":"indris-and-salazer"},"mn/herohub_story_10415671":{"slug":"indris-and-eironn"},"mn/herohub_story_10415675":{"slug":"idle-dialogue"},"mn/herohub_story_10415676":{"slug":"idle-dialogue-2"}}},
    "1172": {"slug":"velara","interactions":{"ep4/herohub_story_14411120":{"slug":"velara-and-ravion"},"ep4/herohub_story_14411150":{"slug":"velara"},"mn/herohub_story_10415661":{"slug":"bonnie-and-velara"},"mn/herohub_story_10415681":{"slug":"idle-dialogue"},"mn/herohub_story_10415682":{"slug":"idle-dialogue-2"}}},
    "1178": {"slug":"ravion","interactions":{"ep4/herohub_story_14411110":{"slug":"ravion-and-indris"},"ep4/herohub_story_14411120":{"slug":"velara-and-ravion"},"ep4/herohub_story_14411140":{"slug":"ravion"},"ep4/herohub_story_14411260":{"slug":"ravion-heart-to-heart"},"ep4/herohub_story_14411290":{"slug":"ravion-heart-to-heart-2"},"mn/herohub_story_10415711":{"slug":"aliceth-and-ravion"},"mn/herohub_story_10415729":{"slug":"idle-dialogue"},"mn/herohub_story_10415730":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415699":{"slug":"ravion-and-thoran"},"mn/herohub_story_10415700":{"slug":"ravion-and-bryon"},"mn/herohub_story_10415701":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415702":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415770":{"slug":"ravion-and-rolan"}}},
    "1191": {"slug":"thador","interactions":{"ep4/herohub_story_14411180":{"slug":"indris-and-thador"},"ep4/herohub_story_14411200":{"slug":"thador"},"mn/herohub_story_10415663":{"slug":"thador-and-korin"},"mn/herohub_story_10415672":{"slug":"thador-and-arden"},"mn/herohub_story_10415683":{"slug":"idle-dialogue"},"mn/herohub_story_10415684":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415732":{"slug":"contess-and-thador"}}},
    "1192": {"slug":"elijah-and-lailah","interactions":{"mn/herohub_story_10415480":{"slug":"dionel-and-elijah-and-lailah"},"mn/herohub_story_10415491":{"slug":"idle-dialogue"},"mn/herohub_story_10415492":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415513":{"slug":"elijah-and-lailah"},"mn/herohub_story_10415645":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415646":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415802":{"slug":"aster-and-elijah-and-lailah"}}},
    "1194": {"slug":"shemira","interactions":{"mn/herohub_story_10415487":{"slug":"shemira-and-smokey-and-meerky"},"mn/herohub_story_10415505":{"slug":"idle-dialogue"},"mn/herohub_story_10415506":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415668":{"slug":"daimon-and-shemira"}}},
    "1195": {"slug":"athalia","interactions":{"mn/herohub_story_10415488":{"slug":"athalia-and-scarlita"},"mn/herohub_story_10415507":{"slug":"idle-dialogue"},"mn/herohub_story_10415508":{"slug":"idle-dialogue-2"}}},
    "1197": {"slug":"evie","interactions":{"ep6/herohub_story_16411170":{"slug":"evie"},"ep6/herohub_story_16411190":{"slug":"evie-heart-to-heart"},"mn/herohub_story_10415662":{"slug":"evie-and-valen"},"mn/herohub_story_10415737":{"slug":"perseus-and-evie"},"mn/herohub_story_10415753":{"slug":"idle-dialogue"},"mn/herohub_story_10415754":{"slug":"idle-dialogue-2"}}},
    "1232": {"slug":"daimon","interactions":{"mn/herohub_story_10415668":{"slug":"daimon-and-shemira"},"mn/herohub_story_10415679":{"slug":"idle-dialogue"},"mn/herohub_story_10415680":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415735":{"slug":"pippa-and-daimon"},"mn/herohub_story_10415762":{"slug":"gwyneth-and-daimon"}}},
    "1437": {"slug":"saida","interactions":{"mn/herohub_story_10415664":{"slug":"saida-and-harak"}}},
    "1439": {"slug":"kordan","interactions":{"ep5/herohub_story_15411020":{"slug":"kordan"},"ep5/herohub_story_15411040":{"slug":"kordan-and-gala"},"ep5/herohub_story_15411060":{"slug":"kordan-and-gala-heart-to-heart"},"mn/herohub_story_10415708":{"slug":"lumont-and-kordan"},"mn/herohub_story_10415721":{"slug":"idle-dialogue"},"mn/herohub_story_10415722":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415759":{"slug":"kordan-and-nazrik"}}},
    "1440": {"slug":"galahad","interactions":{"ep5/herohub_story_15411010":{"slug":"gala"},"ep5/herohub_story_15411030":{"slug":"gala-heart-to-heart"},"ep5/herohub_story_15411040":{"slug":"kordan-and-gala"},"ep5/herohub_story_15411050":{"slug":"gala-heart-to-heart-2"},"ep5/herohub_story_15411060":{"slug":"kordan-and-gala-heart-to-heart"},"ep5/herohub_story_15411080":{"slug":"gala-heart-to-heart-3"},"ep5/herohub_story_15411090":{"slug":"gala-heart-to-heart-4"},"ep5/herohub_story_15411100":{"slug":"gala-and-merlin-the-first"},"ep5/herohub_story_15411110":{"slug":"gala-and-merlin-the-first-heart-to-heart"},"ep5/herohub_story_15411150":{"slug":"morgan-and-gala"},"ep5/herohub_story_15411170":{"slug":"gala-and-merlin-the-first-heart-to-heart-2"},"ep5/herohub_story_15411190":{"slug":"gala-and-merlin-the-first-heart-to-heart-3"},"ep5/herohub_story_15411200":{"slug":"merlin-the-first-and-gala"},"ep5/herohub_story_15411210":{"slug":"gala-and-nazrik"},"ep5/herohub_story_15411220":{"slug":"gala-heart-to-heart-5"},"ep5/herohub_story_15411230":{"slug":"nazrik-and-gala"},"ep5/herohub_story_15411240":{"slug":"gala-and-nazrik-heart-to-heart"},"ep5/herohub_story_15411250":{"slug":"gala-and-nazrik-heart-to-heart-2"},"mn/herohub_story_10415704":{"slug":"hammie-and-galahad"},"mn/herohub_story_10415713":{"slug":"idle-dialogue"},"mn/herohub_story_10415714":{"slug":"idle-dialogue-2"}}},
    "1442": {"slug":"nazrik","interactions":{"ep5/herohub_story_15411140":{"slug":"nazrik-and-morgan"},"ep5/herohub_story_15411210":{"slug":"gala-and-nazrik"},"ep5/herohub_story_15411230":{"slug":"nazrik-and-gala"},"ep5/herohub_story_15411240":{"slug":"gala-and-nazrik-heart-to-heart"},"ep5/herohub_story_15411250":{"slug":"gala-and-nazrik-heart-to-heart-2"},"mn/herohub_story_10415705":{"slug":"nazrik-and-brutus"},"mn/herohub_story_10415715":{"slug":"idle-dialogue"},"mn/herohub_story_10415716":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415759":{"slug":"kordan-and-nazrik"}}},
    "1446": {"slug":"perseus","interactions":{"ep5/herohub_story_15411160":{"slug":"perseus-and-merlin-the-first"},"mn/herohub_story_10415706":{"slug":"perseus-and-korin"},"mn/herohub_story_10415719":{"slug":"idle-dialogue"},"mn/herohub_story_10415720":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415737":{"slug":"perseus-and-evie"}}},
    "1457": {"slug":"pandora","interactions":{"mn/herohub_story_10415670":{"slug":"pandora-and-dolly"},"mn/herohub_story_10415689":{"slug":"idle-dialogue"},"mn/herohub_story_10415690":{"slug":"idle-dialogue-2"}}},
    "1506": {"slug":"kulu","interactions":{"mn/herohub_story_10415665":{"slug":"kulu-and-rhys"},"mn/herohub_story_10415673":{"slug":"kulu-and-zanie"},"mn/herohub_story_10415677":{"slug":"idle-dialogue"},"mn/herohub_story_10415678":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415739":{"slug":"kulu-and-boomboom-and-gunnar"}}},
    "1507": {"slug":"baelran","interactions":{"mn/herohub_story_10415666":{"slug":"baelran-and-dionel"},"mn/herohub_story_10415674":{"slug":"rowan-and-baelran"},"mn/herohub_story_10415695":{"slug":"idle-dialogue"},"mn/herohub_story_10415696":{"slug":"idle-dialogue-2"}}},
    "1512": {"slug":"isabella","interactions":{"mn/herohub_story_10415667":{"slug":"silvina-and-isabella"},"mn/herohub_story_10415687":{"slug":"idle-dialogue"},"mn/herohub_story_10415688":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415733":{"slug":"isabella-and-zorya"}}},
    "1513": {"slug":"pang","interactions":{"mn/herohub_story_10415669":{"slug":"soren-and-pang"},"mn/herohub_story_10415693":{"slug":"idle-dialogue"},"mn/herohub_story_10415694":{"slug":"idle-dialogue-2"}}},
    "1842": {"slug":"tilaya","interactions":{"mn/herohub_story_10415707":{"slug":"granny-dahnie-and-tilaya"},"mn/herohub_story_10415717":{"slug":"idle-dialogue"},"mn/herohub_story_10415718":{"slug":"idle-dialogue-2"}}},
    "1864": {"slug":"mehira","interactions":{"mn/herohub_story_10415709":{"slug":"reinier-and-mehira"},"mn/herohub_story_10415723":{"slug":"idle-dialogue"},"mn/herohub_story_10415724":{"slug":"idle-dialogue-2"}}},
    "1865": {"slug":"shadewing","interactions":{"mn/herohub_story_10415710":{"slug":"shadewing-and-lily-may"},"mn/herohub_story_10415725":{"slug":"idle-dialogue"},"mn/herohub_story_10415726":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415768":{"slug":"orion-and-shadewing"}}},
    "1866": {"slug":"aliceth","interactions":{"mn/herohub_story_10415711":{"slug":"aliceth-and-ravion"},"mn/herohub_story_10415727":{"slug":"idle-dialogue"},"mn/herohub_story_10415728":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415807":{"slug":"aliceth-and-aneva"}}},
    "1867": {"slug":"aurora","interactions":{"mn/herohub_story_10415712":{"slug":"tasi-and-aurora-and-sonny"},"mn/herohub_story_10415805":{"slug":"marene-and-aurora"}}},
    "1893": {"slug":"silven","interactions":{"ep6/herohub_story_16411070":{"slug":"silven"},"ep6/herohub_story_16411100":{"slug":"silven-heart-to-heart"},"ep6/herohub_story_16411120":{"slug":"silven-heart-to-heart-2"},"mn/herohub_story_10415734":{"slug":"silven-and-valka"},"mn/herohub_story_10415747":{"slug":"idle-dialogue"},"mn/herohub_story_10415748":{"slug":"idle-dialogue-2"}}},
    "1894": {"slug":"pippa","interactions":{"ep6/herohub_story_16411040":{"slug":"hammie-and-pippa"},"ep6/herohub_story_16411090":{"slug":"pippa"},"ep6/herohub_story_16411110":{"slug":"pippa-heart-to-heart"},"ep6/herohub_story_16411250":{"slug":"pippa-heart-to-heart-2"},"ep6/herohub_story_16411270":{"slug":"pippa-heart-to-heart-3"},"mn/herohub_story_10415735":{"slug":"pippa-and-daimon"},"mn/herohub_story_10415749":{"slug":"idle-dialogue"},"mn/herohub_story_10415750":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415766":{"slug":"peggy-and-pippa"}}},
    "1895": {"slug":"zorya","interactions":{"ep6/herohub_story_16411010":{"slug":"zorya"},"mn/herohub_story_10415733":{"slug":"isabella-and-zorya"},"mn/herohub_story_10415745":{"slug":"idle-dialogue"},"mn/herohub_story_10415746":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415808":{"slug":"sherlock-holmes-and-zorya"}}},
    "1900": {"slug":"contess","interactions":{"ep6/herohub_story_16411020":{"slug":"contess"},"ep6/herohub_story_16411050":{"slug":"contess-heart-to-heart"},"mn/herohub_story_10415732":{"slug":"contess-and-thador"},"mn/herohub_story_10415743":{"slug":"idle-dialogue"},"mn/herohub_story_10415744":{"slug":"idle-dialogue-2"}}},
    "1920": {"slug":"hepler","interactions":{"ep6/herohub_story_16411130":{"slug":"hepler"},"ep6/herohub_story_16411240":{"slug":"hepler-heart-to-heart"},"mn/herohub_story_10415736":{"slug":"cryonaia-and-hepler"},"mn/herohub_story_10415751":{"slug":"idle-dialogue"},"mn/herohub_story_10415752":{"slug":"idle-dialogue-2"}}},
    "1921": {"slug":"solise","interactions":{"ep6/herohub_story_16411230":{"slug":"solise"},"ep6/herohub_story_16411260":{"slug":"solise-heart-to-heart"},"mn/herohub_story_10415731":{"slug":"solise-and-hewynn"},"mn/herohub_story_10415741":{"slug":"idle-dialogue"},"mn/herohub_story_10415742":{"slug":"idle-dialogue-2"}}},
    "2296": {"slug":"gunnar","interactions":{"mn/herohub_story_10415738":{"slug":"zanie-and-gunnar"},"mn/herohub_story_10415739":{"slug":"kulu-and-boomboom-and-gunnar"},"mn/herohub_story_10415755":{"slug":"idle-dialogue"},"mn/herohub_story_10415756":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415772":{"slug":"karma-and-gunnar"}}},
    "2331": {"slug":"gwyneth","interactions":{"ep7/herohub_story_17411020":{"slug":"gwyneth"},"ep7/herohub_story_17411040":{"slug":"gwyneth-heart-to-heart"},"ep7/herohub_story_17411080":{"slug":"gwyneth-heart-to-heart-2"},"ep7/herohub_story_17411150":{"slug":"little-fox-and-gwyneth"},"ep7/herohub_story_17411190":{"slug":"gwyneth-and-little-fox"},"ep7/herohub_story_17411210":{"slug":"gwyneth-heart-to-heart-3"},"ep7/herohub_story_17411220":{"slug":"gwyneth-heart-to-heart-4"},"ep7/herohub_story_17411280":{"slug":"gwyneth-and-little-fox-heart-to-heart"},"mn/herohub_story_10415762":{"slug":"gwyneth-and-daimon"},"mn/herohub_story_10415773":{"slug":"idle-dialogue"},"mn/herohub_story_10415774":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415801":{"slug":"gwyneth-and-estrilda"}}},
    "2376": {"slug":"orion","interactions":{"ep7/herohub_story_17411170":{"slug":"orion"},"mn/herohub_story_10415768":{"slug":"orion-and-shadewing"},"mn/herohub_story_10415783":{"slug":"idle-dialogue"},"mn/herohub_story_10415784":{"slug":"idle-dialogue-2"}}},
    "2383": {"slug":"eryndor","interactions":{"ep7/herohub_story_17411240":{"slug":"eryndor"},"ep7/herohub_story_17411260":{"slug":"eryndor-heart-to-heart"},"ep7/herohub_story_17411290":{"slug":"eryndor-heart-to-heart-2"},"mn/herohub_story_10415771":{"slug":"eryndor-and-valen"},"mn/herohub_story_10415789":{"slug":"idle-dialogue"},"mn/herohub_story_10415790":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415806":{"slug":"eryndor-and-tephesia"}}},
    "2401": {"slug":"rolan","interactions":{"ep7/herohub_story_17411110":{"slug":"little-fox"},"ep7/herohub_story_17411130":{"slug":"little-fox-and-excited-fan"},"ep7/herohub_story_17411150":{"slug":"little-fox-and-gwyneth"},"ep7/herohub_story_17411160":{"slug":"little-fox-heart-to-heart"},"ep7/herohub_story_17411180":{"slug":"little-fox-heart-to-heart-2"},"ep7/herohub_story_17411190":{"slug":"gwyneth-and-little-fox"},"ep7/herohub_story_17411250":{"slug":"little-fox-heart-to-heart-3"},"ep7/herohub_story_17411270":{"slug":"little-fox-heart-to-heart-4"},"ep7/herohub_story_17411280":{"slug":"gwyneth-and-little-fox-heart-to-heart"},"mn/herohub_story_10415770":{"slug":"ravion-and-rolan"},"mn/herohub_story_10415787":{"slug":"idle-dialogue"},"mn/herohub_story_10415788":{"slug":"idle-dialogue-2"}}},
    "2559": {"slug":"alna","interactions":{"mn/herohub_story_10415760":{"slug":"zanie-and-alna"}}},
    "2658": {"slug":"nerion","interactions":{"mn/herohub_story_10415761":{"slug":"ludovic-and-nerion"}}},
    "2662": {"slug":"senea","interactions":{"ep8/herohub_story_18411060":{"slug":"senea"},"ep8/herohub_story_18411180":{"slug":"senea-heart-to-heart"},"mn/herohub_story_10415800":{"slug":"senea-and-ludovic"},"mn/herohub_story_10415811":{"slug":"idle-dialogue"},"mn/herohub_story_10415812":{"slug":"idle-dialogue-2"}}},
    "2666": {"slug":"estrilda","interactions":{"ep8/herohub_story_18411040":{"slug":"estrilda"},"ep8/herohub_story_18411090":{"slug":"estrilda-heart-to-heart"},"ep8/herohub_story_18411110":{"slug":"thane-and-estrilda"},"ep8/herohub_story_18411130":{"slug":"estrilda-and-thane"},"mn/herohub_story_10415801":{"slug":"gwyneth-and-estrilda"},"mn/herohub_story_10415817":{"slug":"idle-dialogue"},"mn/herohub_story_10415818":{"slug":"idle-dialogue-2"}}},
    "2667": {"slug":"tephesia","interactions":{"ep8/herohub_story_18411150":{"slug":"tephesia"},"ep8/herohub_story_18411170":{"slug":"tephesia-heart-to-heart"},"ep8/herohub_story_18411190":{"slug":"tephesia-heart-to-heart-2"},"mn/herohub_story_10415806":{"slug":"eryndor-and-tephesia"},"mn/herohub_story_10415819":{"slug":"idle-dialogue"},"mn/herohub_story_10415820":{"slug":"idle-dialogue-2"}}},
    "2668": {"slug":"grezhul-incomplete","interactions":{"mn/herohub_story_10415809":{"slug":"thoran-and-grezhul-incomplete"},"mn/herohub_story_10415821":{"slug":"idle-dialogue"},"mn/herohub_story_10415822":{"slug":"idle-dialogue-2"}}},
    "2669": {"slug":"thane","interactions":{"ep8/herohub_story_18411050":{"slug":"thane"},"ep8/herohub_story_18411110":{"slug":"thane-and-estrilda"},"ep8/herohub_story_18411120":{"slug":"thane-heart-to-heart"},"ep8/herohub_story_18411130":{"slug":"estrilda-and-thane"},"ep8/herohub_story_18411140":{"slug":"thane-heart-to-heart-2"},"ep8/herohub_story_18411160":{"slug":"baden-and-thane"},"mn/herohub_story_10415804":{"slug":"niru-and-thane"},"mn/herohub_story_10415815":{"slug":"idle-dialogue"},"mn/herohub_story_10415816":{"slug":"idle-dialogue-2"}}},
    "2670": {"slug":"baden","interactions":{"ep8/herohub_story_18411200":{"slug":"baden"},"mn/herohub_story_10415803":{"slug":"lorsan-and-baden"},"mn/herohub_story_10415813":{"slug":"idle-dialogue"},"mn/herohub_story_10415814":{"slug":"idle-dialogue-2"}}},
    "2766": {"slug":"sylphira","interactions":{"mn/herohub_story_10415763":{"slug":"dionel-and-sylphira"},"mn/herohub_story_10415775":{"slug":"idle-dialogue"},"mn/herohub_story_10415776":{"slug":"idle-dialogue-2"}}},
    "2767": {"slug":"kazim","interactions":{"mn/herohub_story_10415764":{"slug":"kazim-and-talene"},"mn/herohub_story_10415777":{"slug":"idle-dialogue"},"mn/herohub_story_10415778":{"slug":"idle-dialogue-2"}}},
    "2768": {"slug":"lamentis","interactions":{"mn/herohub_story_10415767":{"slug":"berial-and-lamentis"},"mn/herohub_story_10415781":{"slug":"idle-dialogue"},"mn/herohub_story_10415782":{"slug":"idle-dialogue-2"}}},
    "2769": {"slug":"voracia","interactions":{"mn/herohub_story_10415769":{"slug":"gerda-and-voracia"},"mn/herohub_story_10415785":{"slug":"idle-dialogue"},"mn/herohub_story_10415786":{"slug":"idle-dialogue-2"}}},
    "2770": {"slug":"karma","interactions":{"mn/herohub_story_10415772":{"slug":"karma-and-gunnar"},"mn/herohub_story_10415791":{"slug":"idle-dialogue"},"mn/herohub_story_10415792":{"slug":"idle-dialogue-2"}}},
    "2965": {"slug":"aster","interactions":{"mn/herohub_story_10415802":{"slug":"aster-and-elijah-and-lailah"},"mn/herohub_story_10415823":{"slug":"idle-dialogue"},"mn/herohub_story_10415824":{"slug":"idle-dialogue-2"}}},
    "2966": {"slug":"marene","interactions":{"mn/herohub_story_10415805":{"slug":"marene-and-aurora"},"mn/herohub_story_10415825":{"slug":"idle-dialogue"},"mn/herohub_story_10415826":{"slug":"idle-dialogue-2"}}},
    "2967": {"slug":"aneva","interactions":{"mn/herohub_story_10415807":{"slug":"aliceth-and-aneva"},"mn/herohub_story_10415827":{"slug":"idle-dialogue"},"mn/herohub_story_10415828":{"slug":"idle-dialogue-2"}}},
    "2968": {"slug":"sherlock-holmes","interactions":{"mn/herohub_story_10415808":{"slug":"sherlock-holmes-and-zorya"},"mn/herohub_story_10415829":{"slug":"idle-dialogue"},"mn/herohub_story_10415830":{"slug":"idle-dialogue-2"}}},
    "unit:32": {"slug":"atalanta","interactions":{"mn/herohub_story_10415052":{"slug":"idle-dialogue"},"mn/herohub_story_10415053":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415353":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415354":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415521":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415522":{"slug":"idle-dialogue-6"},"mn3/herohub_story_10414050":{"slug":"chippy-and-atalanta"},"mn3/herohub_story_10414100":{"slug":"atalanta-and-valen"},"mn3/herohub_story_10414160":{"slug":"atalanta-and-fay"}}},
    "unit:41": {"slug":"bryon","interactions":{"mn/herohub_story_10415104":{"slug":"idle-dialogue"},"mn/herohub_story_10415105":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415413":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415414":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415585":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415586":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415700":{"slug":"ravion-and-bryon"},"mn2/herohub_story_10412011":{"slug":"hammie-and-bryon-and-lorsan"},"mn2/herohub_story_10412150":{"slug":"hammie-and-bryon"},"mn2/herohub_story_10413030":{"slug":"hammie-and-chippy-and-bryon"},"mn2/herohub_story_10413070":{"slug":"lorsan-and-bryon"},"mn2/herohub_story_10413110":{"slug":"lorsan-and-bryon-heart-to-heart"}}},
    "unit:46": {"slug":"florabelle","interactions":{"mn/herohub_story_10415106":{"slug":"idle-dialogue"},"mn/herohub_story_10415107":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415415":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415416":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415587":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415588":{"slug":"idle-dialogue-6"},"mn2/herohub_story_10413010":{"slug":"florabelle-and-hewynn"},"mn2/herohub_story_10413020":{"slug":"lorsan-and-florabelle-and-lyca"},"mn2/herohub_story_10413130":{"slug":"florabelle-and-lorsan"}}},
    "unit:124": {"slug":"frieren","interactions":{}},
    "unit:125": {"slug":"himmel","interactions":{}},
    "unit:23": {"slug":"kruger","interactions":{"mn/herohub_story_10415094":{"slug":"idle-dialogue"},"mn/herohub_story_10415095":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415403":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415404":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415575":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415576":{"slug":"idle-dialogue-6"}}},
    "unit:122": {"slug":"laios","interactions":{}},
    "unit:73": {"slug":"lucy","interactions":{}},
    "unit:121": {"slug":"marcille","interactions":{}},
    "unit:72": {"slug":"natsu","interactions":{}},
    "unit:34": {"slug":"silvina","interactions":{"mn/herohub_story_10415136":{"slug":"idle-dialogue"},"mn/herohub_story_10415137":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415451":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415452":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415629":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415630":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415667":{"slug":"silvina-and-isabella"}}},
    "unit:149": {"slug":"taichi-and-agumon","interactions":{}},
    "unit:3": {"slug":"thoran","interactions":{"mn/herohub_story_10415124":{"slug":"idle-dialogue"},"mn/herohub_story_10415125":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415345":{"slug":"thoran-and-viperian"},"mn/herohub_story_10415435":{"slug":"idle-dialogue-3"},"mn/herohub_story_10415436":{"slug":"idle-dialogue-4"},"mn/herohub_story_10415611":{"slug":"idle-dialogue-5"},"mn/herohub_story_10415612":{"slug":"idle-dialogue-6"},"mn/herohub_story_10415699":{"slug":"ravion-and-thoran"},"mn/herohub_story_10415809":{"slug":"thoran-and-grezhul-incomplete"}}},
    "unit:150": {"slug":"yamato-and-gabumon","interactions":{}},
    "unit:94": {"slug":"zandrok","interactions":{"mn/herohub_story_10415697":{"slug":"idle-dialogue"},"mn/herohub_story_10415698":{"slug":"idle-dialogue-2"},"mn/herohub_story_10415703":{"slug":"kafra-and-zandrok"}}}
  }};
});

;
/* Saved names resolve to character IDs and interaction assets without changing reader state. */
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require('./reader_character_paths.js'));
  else root.ReaderCharacterRoutes = factory(root.ReaderCharacterPaths);
})(typeof globalThis === "object" ? globalThis : this, function(registry) {
  function create(data) {
    if (data?.schemaVersion !== 1 || !data.characters) throw new Error('Invalid character address registry');
    const byName = new Map(), byId = new Map();
    const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
    const actor = /^(?:unit:)?\d+$/;
    const asset = /^[a-z0-9_]+\/herohub_story_\d+$/i;
    for (const [id, entry] of Object.entries(data.characters)) {
      if (!actor.test(id)) throw new Error('Invalid character address ID: ' + id);
      for (const name of [entry.slug]) {
        if (!slug.test(name) || byName.has(name)) throw new Error('Invalid or duplicate character name: ' + name);
        byName.set(name, id);
      }
      const interactions = new Map();
      for (const [key, interaction] of Object.entries(entry.interactions || {})) {
        if (!asset.test(key)) throw new Error('Invalid interaction asset: ' + key);
        for (const name of [interaction.slug]) {
          if (!slug.test(name) || interactions.has(name)) throw new Error('Invalid or duplicate interaction name: ' + id + '/' + name);
          interactions.set(name, key);
        }
      }
      byId.set(id, {entry, interactions});
    }

    function resolve(value) {
      const parts = String(value).split('?')[0].replace(/^#?\/?/, '').replace(/\/+$/, '').split('/');
      if (parts[0] !== 'mystical-house' || parts.length > 3) return null;
      if (parts.length === 1) return {characterId: '', interactionId: ''};
      let name, conversation;
      try { name = decodeURIComponent(parts[1]); conversation = decodeURIComponent(parts[2] || ''); } catch (_) { return null; }
      const characterId = byName.get(name);
      if (!characterId || (parts.length === 3 && !conversation)) return null;
      const known = byId.get(characterId), interactionId = known?.interactions.get(conversation) || '';
      if (conversation && !interactionId) return null;
      return {characterId, interactionId, namedCharacter: byName.has(name),
        namedInteraction: Boolean(conversation && known?.interactions.has(conversation))};
    }

    function path(id = '', interaction = '') {
      if (!id) return '#/mystical-house';
      const known = byId.get(String(id));
      if (!known || (interaction && !known.entry.interactions?.[interaction])) return '#/home';
      return '#/mystical-house/' + known.entry.slug + (interaction ? '/' + known.entry.interactions[interaction].slug : '');
    }

    function canonicalHash(value) {
      const route = resolve(value);
      if (!route) return value;
      const queryAt = String(value).indexOf('?');
      return path(route.characterId, route.interactionId) + (queryAt < 0 ? '' : String(value).slice(queryAt));
    }
    return {resolve, path, canonicalHash};
  }
  return {...create(registry), create};
});

;
(function (root) {
  "use strict";
  function project(unit, main, quality, seasonal = null, includePveGrowth = false, normalEquipment = null) {
    if (!unit || !main || !quality) throw new Error("A main-level row and quality are required.");
    const rows = seasonal ? [main, seasonal] : [main];
    const factor = rows.reduce((sum, row) => sum + Number(row.base_factor || 0)
      + (includePveGrowth ? Number(row.pve_mode_add_base || 0) : 0), 0);
    const values = {};
    for (const field of ["HP", "ATK", "ARM", "MR"]) {
      values[field] = Number(unit.base_values[field] || 0) * Number(unit.attribute_increase_ratio ?? 1)
        * factor * Number(quality.multipliers[field] ?? 1) + Number(quality.flat_adds[field] || 0);
    }
    const secondary = unit.secondary_base_values || {};
    values.PRFC = Number(secondary.PRFC || 0) + Number(quality.proficiency_add || 0)
      + rows.reduce((sum, row) => sum + Number(row.proficiency_add || 0), 0);
    values.CRIT = Number(secondary.CRIT || 0)
      + rows.reduce((sum, row) => sum + Number(row.crit_add || 0), 0);
    for (const [field, addition] of Object.entries(normalEquipment?.values || {})) {
      if (Object.hasOwn(values, field)) values[field] += Number(addition || 0);
    }
    return values;
  }
  function levelBounds(progression, seasonalOffset = 240) {
    const seasonal = progression.key === "episode";
    return {
      min: seasonal ? seasonalOffset : Number(progression.min_level),
      max: Math.min(Number(progression.max_level) + (seasonal ? seasonalOffset : 0), 1800),
    };
  }
  function growthRow(progression, displayedLevel, seasonalOffset = 240) {
    const internalLevel = Number(displayedLevel) - (progression.key === "episode" ? seasonalOffset : 0);
    if (progression.key === "episode" && internalLevel === 0) {
      return {level: 0, base_factor: "0", proficiency_add: "0", crit_add: "0", pve_mode_add_base: "0"};
    }
    return (progression.levels || []).find(row => Number(row.level) === internalLevel) || null;
  }
  const api = { project, levelBounds, growthRow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CharacterStats = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

;
/* Verified story controls and local reader history. No game/server state is written. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StoryRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'afk-reader-story-choices-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  class Pending extends Error {}
  const truth = value => value !== false && value !== null && value !== undefined;

  class History {
    constructor(catalog = {}, storage = null) {
      this.catalog = catalog; this.storage = storage; this.records = {}; this.checkpoints = {}; this.storageError = false;
      try {
        const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
        if ([1, 2].includes(saved?.version) && saved.records && typeof saved.records === 'object') {
          for (const [id, record] of Object.entries(saved.records)) {
            if (catalog.choices?.[id]?.options.some(o => o.index + 1 === record.option)
                && ['explicit', 'assumed'].includes(record.origin) && Array.isArray(record.dependencies)) {
              this.records[id] = record;
            }
          }
          for (const [id, record] of Object.entries(saved.checkpoints || {})) {
            const definition = catalog.progression?.checkpoints?.[id];
            if (definition && typeof record.completed === 'boolean' && record.origin === 'explicit'
                && Array.isArray(record.dependencies) && record.signature === definition.signature) {
              this.checkpoints[id] = record;
            }
          }
          this.pruneCheckpoints();
        }
      } catch (_) { this.storageError = true; }
    }
    save() {
      try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.exportProgression())); }
      catch (_) { this.storageError = true; }
    }
    exportProgression() { return clone({version: 2, records: this.records, checkpoints: this.checkpoints}); }
    snapshot() { return this.exportProgression(); }
    restore(snapshot) {
      this.records = clone(snapshot.version === 2 ? snapshot.records : snapshot);
      this.checkpoints = clone(snapshot.version === 2 ? snapshot.checkpoints || {} : {});
      this.pruneCheckpoints(); this.save();
    }
    dependencyValue(id) {
      return id.startsWith('checkpoint:') ? this.checkpoints[id.slice(11)]?.completed : this.records[id]?.option;
    }
    pruneCheckpoints() {
      const invalid = new Set();
      let changed = true;
      while (changed) {
        changed = false;
        for (const [id, record] of Object.entries(this.checkpoints)) {
          if (!record.basis || record.dependencies.some(dep => this.dependencyValue(dep) !== record.basis[dep])) {
            delete this.checkpoints[id]; invalid.add('checkpoint:' + id); changed = true;
          }
        }
      }
      for (const record of Object.values(this.records)) {
        for (const dep of record.dependencies || []) {
          if (typeof dep === 'string' && dep.startsWith('checkpoint:') && !this.checkpoints[dep.slice(11)]) invalid.add(dep);
        }
      }
      if (invalid.size) this.invalidate([...invalid]);
    }
    invalidate(ids) {
      const invalid = new Set(ids.map(String));
      let changed = true;
      while (changed) {
        changed = false;
        for (const [key, value] of Object.entries(this.records)) {
          if (!invalid.has(key) && value.dependencies.some(dep => invalid.has(String(dep)))) {
            invalid.add(key); changed = true;
          }
        }
        for (const [id, value] of Object.entries(this.checkpoints)) {
          const key = 'checkpoint:' + id;
          if (!invalid.has(key) && value.dependencies.some(dep => invalid.has(String(dep)))) {
            invalid.add(key); changed = true;
          }
        }
      }
      for (const key of invalid) {
        if (key.startsWith('checkpoint:')) delete this.checkpoints[key.slice(11)];
        else delete this.records[key];
      }
      this.save();
    }
    set(id, option, origin = 'explicit', dependencies = []) {
      id = String(id);
      if (!this.catalog.choices?.[id]?.options.some(o => o.index + 1 === option)) throw new Pending('Unknown saved choice.');
      const old = this.records[id];
      if (old && old.option !== option) {
        this.invalidate([id]);
      }
      this.records[id] = {option, origin, dependencies: [...new Set(dependencies.map(String))].filter(dep => dep !== id)};
      this.save();
      return this.records[id];
    }
    setCheckpoint(id, completed, dependencies = []) {
      const definition = this.catalog.progression?.checkpoints?.[id];
      if (!definition || (completed !== null && typeof completed !== 'boolean')) throw new Pending('Unknown reader checkpoint.');
      let record;
      if (completed !== null) {
        dependencies = [...new Set(dependencies.map(String))].filter(dep => dep !== 'checkpoint:' + id);
        const basis = Object.fromEntries(dependencies.map(dep => [dep, this.dependencyValue(dep)]));
        if (Object.values(basis).some(value => value === undefined)) throw new Pending('The checkpoint depends on unresolved earlier progress.');
        record = {completed, origin: 'explicit', dependencies, basis, signature: definition.signature};
      }
      if (JSON.stringify(this.checkpoints[id]) === JSON.stringify(record)) return;
      this.invalidate(['checkpoint:' + id]);
      if (record) this.checkpoints[id] = record;
      this.save();
    }
  }

  class Session {
    constructor(history) { this.history = history; this.catalog = history.catalog; this.reset(); }
    reset() { this.values = {}; this.reads = {}; this.dependencies = new Set(); this.resolving = new Set(); this.readingCheckpoint = null; this.readingChoice = null; }
    useStoryVariant(variant) {
      this.readingCheckpoint = variant?.checkpoint || null;
      this.readingChoice = variant?.standalone || variant?.directReading ? {id: variant.choice, option: variant.option} : null;
    }
    snapshot() { return {values: clone(this.values), reads: clone(this.reads), dependencies: [...this.dependencies],
      ...(this.readingCheckpoint ? {readingCheckpoint: this.readingCheckpoint} : {}),
      ...(this.readingChoice ? {readingChoice: clone(this.readingChoice)} : {})}; }
    restore(value) { this.values = clone(value.values); this.reads = clone(value.reads); this.dependencies = new Set(value.dependencies);
      this.readingCheckpoint = value.readingCheckpoint || null; this.readingChoice = clone(value.readingChoice || null); }
    local(scope) { return this.values[scope] ||= {}; }
    read(scope, name, initial = 0) {
      const values = this.local(scope);
      if (!(name in values)) values[name] = initial;
      return values[name];
    }
    resolve(id) {
      id = String(id);
      // Opening a standalone sibling establishes its entry context only in this
      // session. Do not rewrite the earlier choice or export completion facts.
      if (id === this.readingChoice?.id) return this.readingChoice.option;
      this.dependencies.add(id);
      const definition = this.catalog.choices?.[id];
      if (!definition || this.resolving.has(id)) throw new Pending('An earlier choice cannot yet be resolved.');
      this.resolving.add(id);
      try {
        const saved = this.history.records[id];
        const options = definition.options;
        if (saved) {
          const option = options.find(o => o.index + 1 === saved.option);
          if (!option || !this.eligible({...definition, runtime_scope: definition.asset, runtime_choice: id}, option, true)) {
            throw new Pending('A saved choice is no longer available on this storyline.');
          }
          return saved.option;
        }
        for (const option of options) {
          if (this.eligible({runtime_scope: definition.asset, runtime_choice: id}, option, true)) {
            this.history.set(id, option.index + 1, 'assumed', [...this.dependencies]);
            return option.index + 1;
          }
        }
        throw new Pending('No earlier choice is known to be available.');
      } finally { this.resolving.delete(id); }
    }
    evaluate(node) {
      if (!node) return true;
      if (node.kind === 'any_task_parent') {
        let pending;
        for (const term of node.values) {
          try { if (this.evaluate(term) === true) return true; }
          catch (error) { if (!(error instanceof Pending)) throw error; pending = error; }
        }
        if (pending) throw pending;
        return false;
      }
      if (node.kind === 'literal') return node.value;
      if (node.kind === 'call') {
        const args = node.args.map(arg => {
          if (arg.kind !== 'literal' || !Number.isSafeInteger(arg.value)) throw new Pending('Unsupported story condition argument.');
          return arg.value;
        });
        const score = (id, idx) => {
          const selected = this.resolve(id);
          if (selected !== idx) return 0;
          const rows = (this.catalog.scores || []).filter(r => Number(r.ChoiceID) === id && Number(r.Idx) === idx);
          if (rows.length > 1) throw new Pending('Ambiguous choice score.');
          return rows.length ? Number(rows[0].Score) : 0;
        };
        if (node.name === 'ed.ConditionX.PlotChoiceIDScore' && args.length === 2) return score(...args);
        if (node.name === 'ed.ConditionX.PlotChoiceScore' && args.length === 1) {
          return (this.catalog.scores || []).filter(r => Number(r.PlotID) === args[0])
            .reduce((total, row) => total + score(Number(row.ChoiceID), Number(row.Idx)), 0);
        }
        if (node.name === 'ed.ConditionX.IsExplTaskFinished' && args.length === 2) {
          const id = args.join(':');
          // The selected, verified sibling chapter is a reading context. Its
          // entry boundary also wraps inline cards. Project that boundary only
          // in this view; History and explicit completion remain unchanged.
          if (id === this.readingCheckpoint) return true;
          this.dependencies.add('checkpoint:' + id);
          const record = this.history.checkpoints[id];
          if (!record) throw new Pending('Confirm the earlier reader completion checkpoint to continue.');
          return record.completed;
        }
        throw new Pending('This continuation depends on game state that has not been recovered.');
      }
      if (node.kind === 'unary') {
        const value = this.evaluate(node.value);
        if (node.operator === 'not') return !truth(value);
        if (typeof value !== 'number') throw new Pending('Unsupported story arithmetic.');
        return node.operator === '-' ? -value : value;
      }
      if (node.kind === 'binary') {
        const a = this.evaluate(node.left), op = node.operator;
        if (op === 'and') return truth(a) ? this.evaluate(node.right) : a;
        if (op === 'or') return truth(a) ? a : this.evaluate(node.right);
        const b = this.evaluate(node.right);
        if (op === '==') return a === b;
        if (op === '~=') return a !== b;
        if (typeof a !== 'number' || typeof b !== 'number') throw new Pending('Unsupported story comparison.');
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '<') return a < b;
        if (op === '>') return a > b;
        if (op === '<=') return a <= b;
        if (op === '>=') return a >= b;
      }
      throw new Pending(node.reason || 'This story condition is not recovered yet.');
    }
    checkpoint(id, completed) {
      const definition = this.catalog.progression?.checkpoints?.[id];
      if (!definition) throw new Pending('Unknown reader checkpoint.');
      if (completed === null || completed === false) return this.history.setCheckpoint(id, completed);
      if (this.evaluate(definition.guard) !== true) throw new Pending('This checkpoint is unavailable on the selected storyline.');
      for (const source of definition.choice_sources || []) {
        if (this.evaluate(source.guard) === true) this.resolve(source.id);
      }
      return this.history.setCheckpoint(id, completed, [...this.dependencies]);
    }
    eligible(node, option, assuming = false) {
      const seen = this.reads[`${node.runtime_scope}:${node.runtime_choice}`] || [];
      if ((option.display_reads || []).some(idx => !seen.includes(idx))) return false;
      const result = this.evaluate(option.guard);
      if (typeof result !== 'boolean') throw new Pending('A choice condition has no verified Boolean result.');
      return result;
    }
    defaultOption(node) {
      const seen = this.reads[`${node.runtime_scope}:${node.runtime_choice}`] || [];
      // The same unread-topic policy is needed when skipping through an
      // earlier ordinary menu. Evaluate candidates lazily so an unvisited
      // later unknown guard cannot block an available first option.
      if (node.runtime_choice && !node.persistent_choice) {
        const unread=node.options.find(option=>!seen.includes(option.index+1)&&this.eligible(node,option));
        if(unread)return unread;
      }
      return node.options.find(option=>this.eligible(node,option));
    }
    choose(node, option, origin = 'explicit') {
      if (!this.eligible(node, option)) throw new Pending('This choice is not available on the current storyline.');
      const key = `${node.runtime_scope}:${node.runtime_choice}`;
      const seen = this.reads[key] ||= [];
      if (!seen.includes(option.index + 1)) seen.push(option.index + 1);
      if (node.persistent_choice) {
        this.history.set(node.persistent_choice, option.index + 1, origin, [...this.dependencies]);
        this.dependencies.add(String(node.persistent_choice));
      }
    }
    saved(node) {
      const record = this.history.records[node.persistent_choice];
      if (!record) return null;
      const option = node.options.find(o => o.index + 1 === record.option);
      if (!option || !this.eligible(node, option)) throw new Pending('The saved choice is unavailable. Switch the earlier storyline.');
      return {option, origin: record.origin};
    }
    seek(graph, start, target, hiddenOption = () => null, simplifyActivities = true) {
      let current = start;
      const seen = new Set();
      for (let steps = 0; steps < 10000; steps++) {
        if (current === target) return {current, reached: true};
        const node = graph.nodes[current];
        if (!node) return {current: start, stopped: true, notice: 'The requested point is unavailable on this storyline.'};
        const state = JSON.stringify([current, this.values, this.reads, this.history.records]);
        if (seen.has(state)) return {current, stopped: true, notice: 'The requested point is beyond a repeating conversation. Choose how to continue.'};
        seen.add(state);
        try {
          if (node.type === 'inspection') return {current, notice: 'Inspect the points and continue to reach the requested story position.'};
          if (node.type === 'activity') {
            const automatic = simplifyActivities && simpleRetryActivity(graph, node);
            if (!automatic) return {current, notice: 'Choose this activity’s outcome to continue to the requested point.'};
            current = this.activity(node, automatic.input);
            continue;
          }
          if (node.type === 'cycle') return {current, stopped: true, notice: 'The requested point is beyond a repeating conversation. Choose how to continue.'};
          if (node.type === 'runtime') current = this.advance(node).target;
          else if (node.type === 'choice') {
            const saved = node.persistent_choice ? this.saved(node) : null;
            const option = saved?.option || this.defaultOption(node);
            if (!option) throw new Pending('No choice is available before the requested point.');
            if (node.runtime_choice) this.choose(node, option, saved?.origin || 'assumed');
            current = option.target;
          } else if (node.type === 'hidden_branch') {
            const option = hiddenOption(current);
            if (!option) throw new Pending('An unresolved branch precedes the requested point.');
            current = option.target;
          } else if (node.next) current = node.next;
          else return {current, stopped: true, notice: 'The requested point is unavailable on this storyline. Switch an earlier choice to view another path.'};
        } catch (error) {
          if (!(error instanceof Pending)) throw error;
          return {current, stopped: true, notice: error.message};
        }
      }
      return {current, stopped: true, notice: 'Skipping stopped at the story traversal limit.'};
    }
    advance(node) {
      const instruction = node.instruction || {}, scope = node.runtime_scope;
      switch (instruction.op) {
        case 'continue': return {target: node.next};
        case 'object_state_request': {
          const request=instruction.request;
          if(request?.operation!=='set_final_states' || !Array.isArray(request.object_ids)
              || !request.object_ids.length || !request.object_ids.every(id=>Number.isSafeInteger(id)&&id>0))
            throw new Pending('Unresolved NPC state request.');
          // An authored request is not evidence that the world accepted it.
          // Keep it local and rewindable; never write HasState or completion.
          const events=this.local('@object_state_requests').events ||= {};
          events[node.id]=clone(request);
          return {target:node.next};
        }
        case 'fishing_result': return {target:node.next,result:{...instruction.result}};
        case 'reasoning_gate': {
          const caseData = this.catalog.reasoning.cases[instruction.case_id];
          const values = this.local(scope), record = values[instruction.progress_key] ||= {};
          const complete = Object.keys(record).length > 0 && Object.entries(caseData.requirements)
            .every(([id, required]) => !required || (record[id] || []).length === required);
          if (complete) delete values[instruction.progress_key];
          return {target: complete ? node.skip : node.next};
        }
        case 'reasoning_conclusion':
          return {target: node.next, reasoning_conclusion: {case_id: instruction.case_id}};
        case 'constant': return {target: node.options[instruction.value ? 0 : 1]?.target || ''};
        case 'equal': return {target: node.options[this.read(scope, instruction.name, instruction.initial) === instruction.value ? 0 : 1]?.target || ''};
        case 'gate': {
          const value = this.evaluate(instruction.expression);
          if (typeof value !== 'boolean') throw new Pending('Unresolved storyline gate.');
          return {target: value ? node.next : node.skip};
        }
        case 'popup': {
          const item = instruction.parameter?._name ? this.read(scope, instruction.parameter._name) : instruction.value;
          const title = this.read(scope, 'OpenItemTitle', '');
          Object.assign(this.local(scope), instruction.writes);
          return {target: node.next, popup: {item, title, kind: instruction.kind || 'pharmacy'}};
        }
        case 'result':
          Object.assign(this.local(scope), instruction.writes || {});
          return {target: node.next, result: {item: instruction.item, kind: instruction.kind || 'item'}};
        case 'hold': throw new Pending(instruction.reason || 'This activity continuation is not recovered yet.');
        default: throw new Pending('This story control is not supported by the current reader. Reload to update it.');
      }
    }
    activityOptions(node, itemName = id => `Medicine ${id}`, language = 'en') {
      const op = node.instruction.op;
      if (op === 'reasoning') {
        const record = this.local(node.runtime_scope)[node.instruction.progress_key] || {};
        const label = id => {
          const names = this.catalog.reasoning.clues[id].name_i18n;
          return names[language] || names.en || names.cn;
        };
        return node.options.filter(pair => !(record[pair.choice_a] || []).includes(pair.choice_b))
          .map(pair => ({label: `${label(pair.choice_a)} + ${label(pair.choice_b)}`,
            input: {mode: 'pair', a: pair.choice_a, b: pair.choice_b}}));
      }
      if (op === 'alchemy') return [
        {label: 'Succeeded', input: {mode: 'settled', result: true}},
        {label: 'Failed — try again', input: {mode: 'settled', result: false}},
      ];
      if (op === 'treatment_reaction') return node.options.map(option => ({
        label:option.labelKey || option.labels?.[language] || option.labels?.en || option.labels?.cn,
        labelKey:option.labelKey, input:{mode:'reaction', id:option.id},
      }));
      if (op === 'treatment' && node.instruction.attempt === 1) return [
        {label:'Healed', labelKey:'Healed', input:{mode:'first_attempt', result:true}},
        {label:'Failed', labelKey:'Failed', input:{mode:'first_attempt', result:false}},
        ...Object.values(this.catalog.pharmacy.therapy_drugs).map(row => ({
          label:`Brew ${itemName(Number(row.ItemID))}`, input:{mode:'brew', item_id:Number(row.ItemID)},
        })),
      ];
      if (op === 'treatment' && node.instruction.attempt === 2) return [
        {label:'Healed', labelKey:'Healed', input:{mode:'conclude', result:1}},
        {label:'Failed', labelKey:'Failed', input:{mode:'conclude', result:2}},
      ];
      if (op === 'treatment') return [
        {label: 'Healed on the first attempt', input: {mode: 'conclude', result: 0}},
        {label: 'Healed on the second attempt', input: {mode: 'conclude', result: 1}},
        {label: 'Treatment unsuccessful', input: {mode: 'conclude', result: 2}},
        ...Object.values(this.catalog.pharmacy.therapy_drugs).map(row => ({
          label: `Brew ${itemName(Number(row.ItemID))}`, input: {mode: 'brew', item_id: Number(row.ItemID)},
        })),
      ];
      if (op === 'pharmacy') {
        const recipe = this.read(node.runtime_scope, 'PharmacyId');
        if (!recipe) return [{label: 'Continue without brewing', input: {mode: 'no_recipe'}}];
        const options = [];
        for (const row of Object.values(this.catalog.pharmacy.pharmacy_pool)) {
          if (Number(row.ID) !== recipe) continue;
          const medicine = row.Medicine.match(/\d+/g).map(Number);
          for (let i = 0; i < medicine.length; i += 2) options.push({
            label: `Received ${itemName(medicine[i])} (result ${row.Order})`,
            input: {mode: 'reward', item_id: medicine[i], order: Number(row.Order)},
          });
        }
        return [...options, {label: 'Close without a reward', input: {mode: 'closed'}}];
      }
      return [];
    }
    activity(node, input) {
      const instruction = node.instruction, scope = node.runtime_scope, values = this.local(scope);
      const allowed = this.activityOptions(node).some(option => JSON.stringify(option.input) === JSON.stringify(input));
      // A load failure is supported for replay/validation but is not a reader choice.
      if (!allowed && !(input?.mode === 'load_failed' && ['alchemy', 'pharmacy'].includes(instruction.op))) throw new Pending('Invalid activity outcome.');
      if (instruction.op === 'reasoning') {
        const pair = node.options.find(pair => pair.choice_a === input.a && pair.choice_b === input.b);
        const record = values[instruction.progress_key] ||= {};
        for (const [a, b] of [[input.a, input.b], [input.b, input.a]]) {
          const partners = record[a] ||= [];
          if (!partners.includes(b)) partners.push(b);
        }
        return pair.target;
      } else if (instruction.op === 'alchemy') {
        this.read(scope, instruction.return_name, instruction.initial);
        values._isPlayFailedAnim = false;
        if (input.mode !== 'load_failed') {
          values[instruction.return_name] = input.result; values._isPlayFailedAnim = !input.result;
        }
      } else if (instruction.op === 'treatment_reaction') {
        return node.options.find(option => option.id === input.id).target;
      } else if (instruction.op === 'treatment') {
        if (input.mode === 'first_attempt') {
          if (!input.result) return node.skip;
          values.TreatmentResult = 0;
        } else if (input.mode === 'brew') values.PharmacyId = Number(this.catalog.pharmacy.therapy_drugs[input.item_id].PharmacyID);
        else if (input.mode === 'conclude') values.TreatmentResult = input.result;
        else throw new Pending('Treatment has not completed.');
      } else if (instruction.op === 'pharmacy') {
        this.read(scope, instruction.return_name, instruction.initial);
        const recipe = this.read(scope, 'PharmacyId');
        if (recipe) values.PharmacyId = 0;
        if (input.mode === 'closed') values[instruction.return_name] = false;
        if (input.mode === 'reward') {
          const row = this.catalog.pharmacy.pharmacy_pool[`${recipe}:${input.order}`];
          values[instruction.return_name] = true; values.ItemId = input.item_id; values.OpenItemTitle = row.Result;
        }
      } else throw new Pending('Unsupported activity.');
      return node.next;
    }
  }
  // The game reports the final treatment result after its own UI closes.
  // Recover the intermediate feedback as reader-only stages before that result.
  function treatmentGraph(graph, catalog) {
    const data = catalog?.treatment_feedback?.patients?.[graph?.asset_key];
    if (!data || graph.treatment_attempts_version) return graph;
    const original = Object.values(graph.nodes).filter(node => node.instruction?.op === 'treatment'
      && String(node.instruction.patient_id) === String(data.patient_id));
    if (original.length !== 1 || !data.reactions?.[0]?.unchanged) throw new Pending('Incomplete treatment attempt data.');
    const result = clone(graph), first = result.nodes[original[0].id];
    const secondId = first.id + ':second-attempt', reactionId = first.id + ':first-failure';
    const speaker = 'treatment-speaker:' + data.patient_id;
    const model = Object.values(graph.nodes).find(node => String(node.speaker_actor_id) === String(data.reactions[0].actor_id))?.speaker_actor_model || '';
    result.nodes[secondId] = {...clone(first), id:secondId,
      instruction:{...first.instruction, attempt:2, title:'Second attempt'}};
    first.instruction = {...first.instruction, attempt:1, title:'First attempt'};
    first.skip = reactionId;
    result.nodes[reactionId] = {id:reactionId, type:'activity', runtime_scope:first.runtime_scope,
      instruction:{op:'treatment_reaction', title:'Patient response'}, options:[]};
    result.text_entries ||= {}; result.speaker_entries ||= {}; result.embedded_locales ||= {};
    result.speaker_entries[speaker] = {key:speaker, source_cn:data.reactions[0].speaker};
    for (const row of data.reactions) {
      const id = first.id + ':feedback:' + row.id, text = 'treatment-feedback:' + data.patient_id + ':' + row.id;
      if (result.nodes[id]) throw new Pending('Duplicate treatment feedback.');
      result.nodes[id] = {id, type:'line', entry_kind:'say', dialogue_frame_type:'Normal',
        text_key:text, speaker_key:speaker, speaker_actor_id:String(row.actor_id), speaker_actor_model:model,
        animation_set:row.animation, source_node_id:'', therapy_feedback:row.source, next:secondId};
      result.text_entries[text] = {key:text, kind:'say', source_cn:row.source_cn, therapy_feedback:row.source};
      result.nodes[reactionId].options.push({id:row.id, target:id, labels:row.labels,
        ...(row.unchanged ? {labelKey:'No change'} : {})});
      for (const language of ['cn','en','jp','kr']) {
        const locale = result.embedded_locales[language] ||= {texts:{},speakers:{}};
        locale.texts ||= {}; locale.speakers ||= {};
        locale.texts[text] = clone(row.texts[language]);
        locale.speakers[speaker] = {text:data.speaker_i18n[language], source_cn:row.speaker, status:'matched_treatment_feedback'};
      }
    }
    result.treatment_attempts_version = 1;
    return result;
  }

  // Admit only a local Boolean retry loop. Its failure path cannot write state,
  // grant an item, show a document, choose a branch, or launch another activity.
  // Shared BlackScene narration is the same presentation template on success.
  // Unknown or substantive failure continuations keep their outcome controls.
  function simpleRetryActivity(graph, node) {
    if (!graph || node?.instruction?.op !== 'alchemy') return null;
    const {return_name: name} = node.instruction, scope = node.runtime_scope;
    if (!name || !scope || !node.id) return null;
    function trace(result) {
      let id = node.next; const seen = new Set(), narration = [];
      for (let count = 0; count < 256; count++) {
        if (id === node.id) return {boundary:'retry', narration};
        if (seen.has(id)) return {boundary:'unknown', narration};
        seen.add(id);const step = graph.nodes[id];
        if (!step) return {boundary:'unknown', narration};
        if (step.type === 'runtime' && step.runtime_scope === scope) {
          const instruction = step.instruction || {};
          if (instruction.op === 'continue') id = step.next;
          else if (instruction.op === 'equal' && instruction.name === name && typeof instruction.value === 'boolean'
              && step.options?.length === 2) id = step.options[result === instruction.value ? 0 : 1].target;
          else return {boundary:result ? 'continuation' : 'unknown', narration};
        } else if (step.type === 'line' && step.entry_kind === 'narration' && step.dialogue_frame_type === 'BlackScene') {
          const text = graph.text_entries?.[step.text_key];
          if (!text?.statementID) return {boundary:'unknown', narration};
          narration.push(String(text.statementID)); id = step.next;
        } else return {boundary:result ? 'continuation' : 'unknown', narration};
      }
      return {boundary:'unknown', narration};
    }
    const failure = trace(false), success = trace(true);
    return failure.boundary === 'retry' && success.boundary === 'continuation'
      && failure.narration.every(id => success.narration.includes(id))
      ? {label:'Completed', input:{mode:'settled', result:true}} : null;
  }

  function choiceDependencies(catalog, ids) {
    const result = new Set(), visiting = new Set();
    function visit(id) {
      id = String(id);
      if (result.has(id) || visiting.has(id) || !catalog.choices?.[id]) return;
      visiting.add(id);
      function inspect(node) {
        if (!node || typeof node !== 'object') return;
        if (node.kind === 'call' && node.args?.[0]?.kind === 'literal') {
          const key = node.args[0].value;
          if (node.name === 'ed.ConditionX.PlotChoiceIDScore') visit(key);
          else if (node.name === 'ed.ConditionX.PlotChoiceScore') {
            for (const row of catalog.scores || []) if (Number(row.PlotID) === key) visit(row.ChoiceID);
          }
        }
        for (const child of Object.values(node)) {
          if (Array.isArray(child)) child.forEach(inspect);
          else if (child && typeof child === 'object') inspect(child);
        }
      }
      for (const option of catalog.choices[id].options) inspect(option.guard);
      visiting.delete(id); result.add(id);
    }
    ids.forEach(visit);
    return result;
  }

  function objectiveGate(catalog, key, prerequisites = []) {
    const entry = catalog.progression?.objective_gates?.[key];
    if (!entry) return null;
    if (entry.kind !== 'verified_choice_prerequisite' || entry.owner !== String(key).split(':')[0]
        || prerequisites.length !== 1 || String(prerequisites[0].line_id) !== entry.prerequisite_line
        || entry.completion_written !== false || !catalog.choices?.[entry.source_choice]
        || entry.reading_gate?.kind !== 'binary' || entry.reading_gate.operator !== '=='
        || entry.reading_gate.left?.name !== 'ed.ConditionX.PlotChoiceScore'
        || JSON.stringify(entry.reading_gate) !== JSON.stringify(entry.native_entry_gate)
        || entry.source_task?.LineID !== entry.owner || entry.source_task.TaskID !== String(key).split(':')[1]
        || entry.source_step?.record_key !== key
        || !new RegExp('\\bPreConditionLine=' + entry.prerequisite_line + '(?:[,}]|$)').test(entry.source_step.ExtraParam)
        || !/^[0-9a-f]{64}$/.test(entry.evidence?.sha256 || '')) {
      throw new Pending('The linked quest condition could not be verified.');
    }
    return entry.reading_gate;
  }

  // A pair of exhaustive quest variants can share a completed predecessor in
  // game data. Selecting a reading route does not assert that task completed.
  // Only admit the bounded shape below: every asset has the same score equality
  // and same checkpoint, the checkpoint names that choice, and all known scores
  // have exactly one sibling story. Keep the original gameplay gates intact.
  class StoryVariants {
    constructor(catalog, stories, {standalone = false, directLine = null} = {}) {
      this.lines = new Map();
      const candidates = new Map();
      const positive = node => node?.kind === 'literal' && Number.isSafeInteger(node.value) && node.value > 0;
      function gateShape(node) {
        const scores = new Map(), checkpoints = new Set();
        function visit(n) {
          if (n?.kind === 'literal' && n.value === true) return true;
          if (n?.kind === 'binary' && n.operator === 'and') return visit(n.left) && visit(n.right);
          if (n?.kind === 'binary' && n.operator === '==' && n.left?.kind === 'call'
              && n.left.name === 'ed.ConditionX.PlotChoiceScore' && n.left.args?.length === 1
              && positive(n.left.args[0]) && n.right?.kind === 'literal' && Number.isSafeInteger(n.right.value)) {
            scores.set(n.left.args[0].value + ':' + n.right.value, n); return true;
          }
          if (n?.kind === 'call' && n.name === 'ed.ConditionX.IsExplTaskFinished'
              && n.args?.length === 2 && n.args.every(positive)) {
            checkpoints.add(n.args.map(a => a.value).join(':')); return true;
          }
          return false;
        }
        if (!visit(node) || scores.size !== 1 || checkpoints.size !== 1) return null;
        const predicate = scores.values().next().value;
        return {predicate, plot: predicate.left.args[0].value, score: predicate.right.value,
          checkpoint: checkpoints.values().next().value};
      }
      for (const story of stories) {
        const line = String(story.id), assets = [...new Set(story.assetKeys || [])];
        const placements = catalog.placements?.[line];
        if (!placements || !assets.length || assets.length !== Object.keys(placements).length) continue;
        const shapes = assets.map(asset => gateShape(placements[asset]?.gate));
        const first = shapes[0];
        if (!first || shapes.some(s => !s || s.plot !== first.plot || s.score !== first.score || s.checkpoint !== first.checkpoint)) continue;
        const rows = (catalog.scores || []).filter(row => Number(row.PlotID) === first.plot);
        const choices = new Set(rows.map(row => String(row.ChoiceID)));
        if (choices.size !== 1) continue;
        const choice = [...choices][0], definition = catalog.choices?.[choice];
        if (!definition || !catalog.progression?.checkpoints?.[first.checkpoint]?.choice_sources?.some(s => s.id === choice)) continue;
        // A standalone entry may project only an unconditional upstream choice.
        // Conditional endings still use the normal shared progression route.
        if (standalone && definition.options.some(o => o.guard?.kind !== 'literal' || o.guard.value !== true
            || (o.display_reads || []).length)) continue;
        const scores = definition.options.map(option => rows.filter(row => Number(row.Idx) === option.index + 1));
        if (scores.some(matches => matches.length !== 1 || !Number.isSafeInteger(Number(matches[0].Score)))) continue;
        const values = scores.map(matches => Number(matches[0].Score));
        if (values.length < 2 || new Set(values).size !== values.length || !values.includes(first.score)) continue;
        const key = first.plot + '/' + first.checkpoint;
        const group = candidates.get(key) || {members: [], values};
        group.members.push({...first, line, choice, standalone,
          option: definition.options[values.indexOf(first.score)].index + 1, assets: new Set(assets)}); candidates.set(key, group);
      }
      for (const group of candidates.values()) {
        if (group.members.length !== group.values.length
            || new Set(group.members.map(m => m.score)).size !== group.values.length
            || !group.values.every(value => group.members.some(m => m.score === value))) continue;
        const direct = group.members.some(m => m.line === String(directLine)) && group.members.every(member => {
          const entry = catalog.progression?.reading_entries?.[member.line];
          return entry?.kind === 'verified_entry_only_ending' && entry.line === member.line
            && entry.choice === member.choice && entry.option === member.option && entry.checkpoint === member.checkpoint
            && entry.internal_progression_consumers === 0 && entry.server_completion_written === false
            && JSON.stringify(entry.native_choice_guards) === JSON.stringify(catalog.choices[member.choice].options.map(o => o.guard));
        });
        for (const member of group.members) this.lines.set(member.line, {...member, group,
          ...(direct ? {directReading:true,readingLine:String(directLine)} : {})});
      }
    }
    get(line) { return this.lines.get(String(line)); }
    selectedLine(line, session) {
      const variant = this.get(line);
      if (!variant) return String(line);
      if (variant.directReading) return variant.readingLine;
      if (variant.standalone) return String(line);
      const available = variant.group.members.filter(member => session.evaluate(member.predicate) === true);
      if (available.length !== 1) throw new Pending('The selected story route cannot yet be resolved.');
      return available[0].line;
    }
    visible(line, session) {
      try { return this.selectedLine(line, session) === String(line); }
      catch (error) { if (!(error instanceof Pending)) throw error; return true; }
    }
    readingGate(line, asset, gameplayGate) {
      const variant = this.get(line);
      if (variant?.directReading && variant.assets.has(asset)) return {kind:'literal',value:variant.line === variant.readingLine};
      return variant?.assets.has(asset) ? variant.standalone ? {kind: 'literal', value: true} : variant.predicate : gameplayGate;
    }
  }

  // Full Script and Debug share one changeable route, including local dialogue
  // choices. Local selections never create persistent progression records.
  class FullScriptRoute {
    constructor(history, overrides = {}) {
      this.session = new Session(history);
      this.overrides = overrides;
      this.controls = [];
      this.occurrences = {};
      this.revision = 0;
      this.halted = false;
    }
    control(node, nodeKey, type) {
      const occurrence = this.occurrences[nodeKey] || 0;
      this.occurrences[nodeKey] = occurrence + 1;
      return {node, nodeKey, type, occurrence, key: JSON.stringify([nodeKey, occurrence]),
        index: this.controls.length, runtimeBefore: this.session.snapshot()};
    }
    activity(node, nodeKey, itemName, language = 'en', readingGraph = null) {
      const control = this.control(node, nodeKey, 'activity');
      const automatic = simpleRetryActivity(readingGraph, node);
      const options = automatic ? [automatic] : this.session.activityOptions(node, itemName, language);
      if (automatic) delete this.overrides[control.key];
      const override = this.overrides[control.key];
      const outcome = override && options.find(option => JSON.stringify(option.input) === JSON.stringify(override));
      if (override && !outcome) delete this.overrides[control.key];
      control.outcome = outcome || options[0];
      control.automatic = Boolean(automatic);
      control.assumed = !automatic && !outcome;
      if (!control.outcome) throw new Pending('This activity has no recovered outcome.');
      control.target = this.session.activity(node, control.outcome.input);
      this.controls.push(control);
      this.revision++;
      return control;
    }
    choice(node, nodeKey, topicIndices = []) {
      node = {...node, runtime_scope: node.runtime_scope || '@full-script',
        runtime_choice: node.runtime_choice || nodeKey,
        options: node.options.map((option, index) => ({...option, index: option.index ?? index}))};
      const control = this.control(node, nodeKey, 'choice');
      const saved = node.persistent_choice ? this.session.saved(node) : null;
      const override = this.overrides[control.key];
      let option = saved?.option || node.options.find(option => option.index === override);
      if (option && !this.session.eligible(node, option)) option = null;
      // Read returning topics before the exit, even when the exit is first in
      // the authored button order. Keep that button order unchanged in the UI.
      const ordered = node.persistent_choice || !topicIndices.length ? node.options
        : [...node.options.filter(option => topicIndices.includes(option.index)),
          ...node.options.filter(option => !topicIndices.includes(option.index))];
      const seen = this.session.reads[`${node.runtime_scope}:${node.runtime_choice}`] || [];
      const candidates = node.persistent_choice ? ordered : ordered.filter(option =>
        !topicIndices.includes(option.index) || !seen.includes(option.index + 1));
      option ||= this.session.defaultOption({...node, options: candidates});
      if (!option) throw new Pending('No choice is available on this storyline.');
      control.origin = saved?.origin || (option.index === override ? 'explicit' : 'assumed');
      this.session.choose(node, option, control.origin);
      control.option = option;
      control.target = option.target;
      this.controls.push(control);
      this.revision++;
      return control;
    }
    select(control, value) {
      if (control.type === 'activity' && JSON.stringify(control.outcome.input) === JSON.stringify(value.input)) return;
      const check = new Session(this.session.history);
      check.restore(control.runtimeBefore);
      if (control.type === 'activity') check.activity(control.node, value.input);
      else if (!check.eligible(control.node, value)) throw new Pending('This choice is not available.');
      const later = this.controls.slice(control.index + 1);
      this.session.history.invalidate(later.map(entry => entry.node.persistent_choice).filter(Boolean));
      for (const entry of later) delete this.overrides[entry.key];
      if (control.type === 'choice' && control.node.persistent_choice) check.choose(control.node, value, 'explicit');
      else this.overrides[control.key] = control.type === 'activity' ? value.input : value.index;
    }
  }
  return {History, Session, FullScriptRoute, StoryVariants, objectiveGate, choiceDependencies, simpleRetryActivity, treatmentGraph, Pending, STORAGE_KEY};
});

;
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StoryResults = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  const STORAGE_KEY = 'afk-reader-possible-catches-v1';
  // Cosmetic catches are separate from choices that affect story state.
  class CatchSelections {
    constructor(storage) {
      this.storage = storage;
      this.values = {};
      try {
        const value = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) this.values = value;
      } catch (_) { /* An unavailable store still permits a stable session. */ }
    }
    options(plan) {
      return plan?.kind === 'variable'
        ? [...new Set((plan.pool || []).filter(id => /^\d+$/.test(String(id)) && Number(id) > 0).map(String))] : [];
    }
    choose(key, plan, fish) {
      if (!this.options(plan).includes(String(fish))) return false;
      this.values[key] = String(fish);
      try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch (_) {}
      return true;
    }
    results(key, plan) {
      if (!plan) return [];
      if (plan.kind === 'scripted' && plan.fish?.length && plan.fish.every(id => Number(id) > 0)) {
        return plan.fish.map((fish, index) => ({kind:'fishing', fish:String(fish), key:`${key}:${index}`,
          sequence:plan.fish.length > 1 ? `Catch ${index + 1} of ${plan.fish.length}` : ''}));
      }
      const pool = this.options(plan);
      if (pool.length) {
        const fish = pool.includes(this.values[key]) ? this.values[key] : pool[0];
        return [{kind:'fishing', fish, key, possible:true, pool}];
      }
      return [{kind:'fishing', key, unknown:true}];
    }
  }
  function fromProgress(progress, nodeId) {
    if (progress?.reasoning_conclusion) return {type:'reasoning_conclusion', nodeId,
      caseId:progress.reasoning_conclusion.case_id};
    const result = progress?.result || progress?.popup;
    if(result?.kind==='fishing' && Number.isSafeInteger(Number(result.fish)) && Number(result.fish)>0)
      return {type:'activity_result',nodeId,result:{...result,fish:String(result.fish)}};
    if (!result || result.kind === 'document' || !Number.isSafeInteger(Number(result.item)) || Number(result.item) <= 0) return null;
    return {type:'activity_result', nodeId, result:{kind:result.kind || 'item', item:String(result.item)}};
  }
  return {CatchSelections, fromProgress, STORAGE_KEY};
});

;
/* Map requirements and verified catch callbacks at exact objective positions. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.StoryActivities=api;
})(typeof globalThis==='object'?globalThis:this,function() {
  function lookup(placements,group,asset,step,position,logical) {
    return (logical?placements?.logical_groups:placements?.groups)?.[group]?.[asset]?.[`${position}:${step}`] || null;
  }
  function map(catalog,group,asset,step,position='objective',logical=false) {
    if(logical) for(const line of Object.values(catalog?.picture_inspections?.lines || {})) {
      if(line.logical_group !== group) continue;
      const inspection=line.groups.find(entry=>entry.step===step);
      if(inspection) return position==='objective' && asset===inspection.members[0] ? inspection.plan : null;
    }
    return lookup(catalog?.map_activities,group,asset,step,position,logical);
  }
  function pictureCatalog(source,exploration) {
    if(source?.schema_version!==1) return null;
    const quests=new Map((exploration?.collections || []).flatMap(c=>(c.chapters || [])
      .flatMap(h=>(h.groups || []).flatMap(g=>g.stories || []))).map(s=>[String(s.line_id),s]));
    const lines={};
    for(const [id,line] of Object.entries(source.lines || {})) {
      const quest=quests.get(id);
      const keys=[...new Set((quest?.assets || []).map(a=>a.asset_key).filter(Boolean))];
      // A rebuilt quest may already use the verified inspection order. Keep
      // its objective/point bindings in that case as well as for the original
      // layout; unrelated reorderings must still fail the evidence guard.
      const matches=order=>Array.isArray(order) && keys.length===order.length
        && keys.every((key,i)=>key===order[i]);
      if(!matches(line.source_asset_keys) && !matches(line.ordered_asset_keys)) continue;
      if(line.source_asset_keys.length!==keys.length || new Set(line.source_asset_keys).size!==keys.length
         || !line.source_asset_keys.every(key=>keys.includes(key))) continue;
      if(line.ordered_asset_keys.length!==keys.length || new Set(line.ordered_asset_keys).size!==keys.length
         || !line.ordered_asset_keys.every(key=>keys.includes(key))) continue;
      if(!line.groups.every(g=>g.members.length && g.members.every(key=>keys.includes(key))
         && keys.includes(g.before_asset) && g.plan.step===g.step && g.plan.activity_type==='PictureView')) continue;
      lines[id]=line;
    }
    return {...source,lines};
  }
  function pictureStory(catalog,lineId) {
    return catalog?.picture_inspections?.lines?.[String(lineId)] || null;
  }
  function pictureAsset(story,inspection,catalog) {
    if(!inspection) return story;
    let result=story;
    const group=inspection.groups.find(g=>g.members.includes(story.asset_key));
    if(group) result={...story,objective_key:group.step,
      objective_title_i18n:group.plan.objective_title_i18n,
      objective_summary_i18n:group.plan.objective_summary_i18n,
      objective_title_status:'native_picture_inspection',objective_summary_status:'native_picture_inspection'};
    const steps=new Set(inspection.groups.map(g=>g.step));
    for(const field of ['objective_interludes_before','objective_interludes_after']) {
      if(!story[field]) continue;
      const entries=story[field].filter(entry=>!steps.has(entry.objective_key));
      if(entries.length!==story[field].length) result={...result,[field]:entries};
    }
    // Preserve an existing activity that precedes this inspection's first plot.
    // For group 7, the bag puzzle completes by opening the picture activity.
    const preceding=group && story.asset_key===group.members[0] && story.objective_key!==group.step
      && lookup(catalog?.map_activities,inspection.logical_group,story.asset_key,
        story.objective_key,'objective',true);
    if(preceding && preceding.activity_type!=='PictureView') {
      const entries=result.objective_interludes_before || [];
      if(!entries.some(entry=>entry.objective_key===story.objective_key)) result={...result,
        objective_interludes_before:[...entries,{objective_key:story.objective_key,
          objective_title_i18n:story.objective_title_i18n,
          objective_summary_i18n:story.objective_summary_i18n,objective_position:'objective'}]};
    }
    return result;
  }
  function fishing(catalog,group,asset,step,position='objective',logical=false) {
    return lookup(catalog?.fishing?.placements,group,asset,step,position,logical);
  }
  function visible(plan,session) {
    const value=session.evaluate(plan.gate);
    if(typeof value!=='boolean') throw new Error('Unresolved activity storyline.');
    return value;
  }
  function insertFishing(graph,catalog,plan,next,prefix) {
    const continuation=next;
    for(let index=plan.catches.length-1;index>=0;index--) {
      const caught=plan.catches[index];
      const dialogue=caught.dialogue && catalog.fishing.dialogues[caught.dialogue];
      if(dialogue && !caught.completion_followup) {
        const child=dialogue.success.graph;
        for(const id of [...dialogue.success.lines].reverse()) {
          const source=child.nodes[id],name=`${prefix}:catch:${index}:line:${id}`;
          const node={...structuredClone(source),id:name,next,
            portrait_source_asset:caught.dialogue,portrait_source_node:id};
          for(const [field,entries,localeField] of [['text_key','text_entries','texts'],['speaker_key','speaker_entries','speakers']]) {
            if(!source[field]) continue;
            const key=`${prefix}:catch:${index}:${source[field]}`;
            node[field]=key;
            graph[entries][key]={...structuredClone(child[entries][source[field]]),key};
            for(const [language,locale] of Object.entries(dialogue.locales)) {
              const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
              if(locale[localeField]?.[source[field]]) embedded[localeField][key]=structuredClone(locale[localeField][source[field]]);
            }
          }
          graph.nodes[name]=node; next=name;
        }
      }
      const id=`${prefix}:catch:${index}:result`;
      graph.nodes[id]={id,type:'runtime',runtime_scope:prefix,next,
        instruction:{op:'fishing_result',result:{kind:'fishing',fish:caught.fish,key:`${plan.step}:${index}`,
          sequence:plan.catches.length>1?`Catch ${index+1} of ${plan.catches.length}`:''}}};
      next=id;
    }
    const id=prefix+':gate';
    graph.nodes[id]={id,type:'runtime',runtime_scope:prefix,instruction:{op:'gate',expression:plan.gate},next,skip:continuation};
    return id;
  }
  function inlineDialogues(catalog,plan) {
    return [['start',plan.start_dialogue],['completion',plan.completion_dialogue]].flatMap(([phase,asset])=> {
      const dialogue=catalog.map_activities.status_dialogues?.[asset];
      return dialogue?.[phase] ? [{phase,asset,dialogue,variant:dialogue[phase]}] : [];
    });
  }
  function encounterDialogues(catalog,plan) {
    return (plan.encounter_dialogues || []).flatMap(({asset,condition})=> {
      const dialogue=catalog.map_activities.status_dialogues?.[asset];
      return condition?.kind==='active_encounter_elapsed' && condition.operator==='>='
        && Number.isFinite(condition.value) && condition.value>=0 && dialogue?.encounter
        ? [{asset,condition,dialogue,variant:dialogue.encounter}] : [];
    });
  }
  function route(catalog,plan,asset,group,logical) {
    if(!logical || !['MapEscort','Stalking'].includes(plan.activity_type)) return null;
    const entry=catalog?.route_dialogues?.plans?.[plan.step];
    return entry && entry.group===String(plan.evidence.group) && entry.anchor_asset===asset
      && entry.scope===group && (!entry.activity_type || entry.activity_type===plan.activity_type)
      && (!entry.slot || entry.slot===`${plan.position || 'objective'}:${plan.step}`) ? entry : null;
  }
  function presumedRoute(catalog,group,owner,asset,step,position,logical) {
    if(!logical)return null;
    const entry=catalog?.route_dialogues?.plans?.[step],a=entry?.admission;
    return entry&&a?.kind==='user_requested_presumed_route_owner'&&a.status==='presumed'
      &&a.policy?.user_requested===true&&a.policy.id==='presumed_source_paths_20261023'
      &&a.source_verification===false&&a.runtime_owner_attachment_verified===false
      &&typeof a.evidence_file==='string'&&/^[a-f0-9]{64}$/.test(a.evidence_sha256||'')
      &&entry.scope===group&&entry.step.split(':')[0]===String(owner)
      &&entry.anchor_asset===asset&&entry.slot===`${position}:${step}` ? entry : null;
  }
  function installRoute(source,catalog,plan,sceneInstall) {
    if(!plan?.inline_graph || !plan.sequence_complete || source.route_sequences?.includes(plan.step)) return source;
    const graph=structuredClone(source);
    if(graph.roots.length!==1) throw new Error('Ambiguous route continuation');
    let continuation=graph.roots[0];
    for(const entry of [...plan.sequence].reverse()) {
      // This exact final request already has its authored quest asset. Join
      // that existing continuation instead of copying it a second time.
      if(entry.delegated_to_anchor) continue;
      if(entry.kind==='object_state_request') {
        const request=entry.request;
        if(request?.operation!=='set_final_states' || !Array.isArray(request.object_ids)
            || !request.object_ids.length || !request.object_ids.every(id=>Number.isSafeInteger(id)&&id>0))
          throw new Error('Unsupported route state request');
        const id=`route:${plan.step}:${entry.id}:object-state-request`;
        if(graph.nodes[id]) throw new Error('Duplicate route state request');
        graph.nodes[id]={id,type:'runtime',runtime_scope:plan.step,next:continuation,
          instruction:{op:'object_state_request',request:structuredClone(request)}};
        continuation=id;
        continue;
      }
      const dialogue=catalog.route_dialogues.dialogues[entry.asset];
      const child=sceneInstall(dialogue.graph,dialogue.scene_summary);
      const prefix=`route:${plan.step}:${entry.id}:${entry.asset}:`;
      const key=value=>value ? prefix+value : '';
      for(const [family,localeField] of [['text_entries','texts'],['speaker_entries','speakers']]) {
        for(const [id,value]of Object.entries(child[family]||{})) graph[family][key(id)]={...structuredClone(value),key:key(id)};
        for(const language of ['cn','en','jp','kr']) {
          const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
          for(const [id,value]of Object.entries({...dialogue.locales[language]?.[localeField],...child.embedded_locales?.[language]?.[localeField]})) {
            embedded[localeField][key(id)]=structuredClone(value);
          }
        }
      }
      for(const [id,value]of Object.entries(child.nodes)) {
        const node=structuredClone(value),name=key(id);
        if(graph.nodes[name]) throw new Error('Duplicate route node');
        node.id=name;node.portrait_source_asset=entry.asset;node.portrait_source_node=id;
        // Local menu reads belong to this plot launch. Reusing the same asset
        // at a later waypoint must not inherit the previous launch's topics.
        if(node.route_choice && !node.persistent_choice)node.runtime_scope=prefix+(node.runtime_scope || entry.asset);
        for(const field of ['text_key','speaker_key','summary_text_key','next','return_to','skip','target']) if(node[field]) node[field]=key(node[field]);
        if(node.prompt_text_keys)node.prompt_text_keys=node.prompt_text_keys.map(key);
        if(node.options)node.options=node.options.map(option=>({...option,text_key:key(option.text_key),target:key(option.target)}));
        if(node.type==='end') {
          node.type='runtime';node.runtime_scope=entry.asset;node.instruction={op:'continue'};node.next=continuation;
        }
        graph.nodes[name]=node;
      }
      if(child.roots.length!==1)throw new Error('Ambiguous route entry');
      continuation=key(child.roots[0]);
    }
    graph.roots=[continuation];graph.route_sequences=[...(graph.route_sequences||[]),plan.step];
    return graph;
  }
  function insertStart(graph,catalog,plan,next,prefix) {
    for(const {phase,asset,dialogue,variant} of inlineDialogues(catalog,plan).reverse()) {
    const child=variant.graph;
    for(const id of [...variant.lines].reverse()) {
      const source=child.nodes[id],name=`${prefix}:${phase}:line:${id}`;
      const node={...structuredClone(source),id:name,next,
        portrait_source_asset:asset,portrait_source_node:id};
      for(const [field,entries,localeField] of [['text_key','text_entries','texts'],['speaker_key','speaker_entries','speakers']]) {
        if(!source[field]) continue;
        const key=`${prefix}:${phase}:${source[field]}`;node[field]=key;
        graph[entries][key]={...structuredClone(child[entries][source[field]]),key};
        for(const [language,locale] of Object.entries(dialogue.locales)) {
          const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
          if(locale[localeField]?.[source[field]]) embedded[localeField][key]=structuredClone(locale[localeField][source[field]]);
        }
      }
      graph.nodes[name]=node;next=name;
    }
    }
    return next;
  }
  function insertRoute(graph,catalog,plan,next,prefix,sceneInstall) {
    const child=installRoute({roots:['join'],nodes:{join:{id:'join',type:'runtime',instruction:{op:'continue'}}},
      text_entries:{},speaker_entries:{}},catalog,plan,sceneInstall);
    const key=id=>id ? prefix+':'+id : '';
    for(const family of ['text_entries','speaker_entries']) for(const [id,value]of Object.entries(child[family]))
      graph[family][key(id)]={...structuredClone(value),key:key(id)};
    for(const [language,locale]of Object.entries(child.embedded_locales||{})) {
      const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
      for(const family of ['texts','speakers'])for(const [id,value]of Object.entries(locale[family]||{}))
        embedded[family][key(id)]=structuredClone(value);
    }
    for(const [id,value]of Object.entries(child.nodes)) {
      const node=structuredClone(value);node.id=key(id);
      if(graph.nodes[node.id])throw new Error('Duplicate interlude route node');
      for(const field of ['text_key','speaker_key','summary_text_key','next','return_to','skip','target'])if(node[field])node[field]=key(node[field]);
      if(node.prompt_text_keys)node.prompt_text_keys=node.prompt_text_keys.map(key);
      if(node.options)node.options=node.options.map(o=>({...o,text_key:key(o.text_key),target:key(o.target)}));
      if(id==='join')node.next=next;
      graph.nodes[node.id]=node;
    }
    return key(child.roots[0]);
  }
  function presentation(catalog,story,scope,owner,logical) {
    const entry=catalog?.route_dialogues?.story_presentations?.[story.asset_key];
    if(!logical || !entry || entry.scope!==scope || entry.owner!==owner || entry.step!==story.objective_key)return null;
    return structuredClone(entry.dialogue.graph);
  }
  function movement(catalog,story,scope,owner,logical) {
    const entry=catalog?.route_dialogues?.movement_presentations?.[story.asset_key];
    const admitted=entry?.admission?.kind==='auxiliary_range_window' && entry.window?.end_step===entry.step
      || entry?.admission?.kind==='user_observation_and_source_range_window'
        && entry.admission.boundary_verified===true && typeof entry.admission.observation_file==='string'
        && entry.admission.observation_file.length>0 && Array.isArray(entry.admission.source_windows)
        && entry.admission.source_windows.length>0
      || entry?.admission?.kind==='user_requested_presumed_source_placement'
        && entry.admission.user_requested===true && entry.admission.placement_status==='presumed'
        && typeof entry.admission.audit_file==='string' && entry.admission.audit_file.length>0
        && Array.isArray(entry.admission.source_bindings) && entry.admission.source_bindings.length>0
      || entry?.admission?.kind==='user_observation_and_source_location_phase'
        && entry.admission.phase_verified===true && typeof entry.admission.observation_file==='string'
        && entry.admission.observation_file.length>0 && Array.isArray(entry.admission.source_triggers)
        && entry.admission.source_triggers.length>0
      || entry?.admission?.kind==='source_location_navigation_phase'
        && entry.admission.phase_verified===true
        && Array.isArray(entry.admission.source_triggers) && entry.admission.source_triggers.length>0
        && typeof entry.admission.evidence_file==='string' && entry.admission.evidence_file.length>0
        && /^[0-9a-f]{64}$/.test(entry.admission.evidence_sha256||'')
        && typeof entry.admission.enable_after_step==='string' && entry.admission.enable_after_step.length>0
        && entry.admission.checked_start_cells>0 && entry.admission.checked_corridor_walks>0
        && entry.admission.exact_live_playback_claimed===false;
    return logical && entry?.scope===scope && entry.owner===String(owner)
      && entry.step===story.objective_key && entry.before_asset===story.asset_key
      && admitted && entry.reader_policy==='ordinary_route'
      ? entry : null;
  }
  function reentryWarnings(entry) {
    const a=entry.admission,cc=entry.warning_contracts;
    return entry.reader_policy==='conditional_reentry_warning'&&a.optional_trigger===true
      &&Array.isArray(cc)&&cc.length===entry.dialogues.length&&cc.every((c,i)=>{
        const h=c.source_helper||{},s=c.source_enable_step||{},r=c.source_retirement_step||{},object=c.object_id;
        const expected=c.trigger==='interact'?`ed.ConditionX.C_ObjInteracted(${object},"*")`:`ed.ConditionX.IsInRange(${object})`;
        return ['range','interact'].includes(c.trigger)&&c.asset===entry.dialogues[i]&&c.asset.endsWith(`_${c.plot_id}`)&&Number.isInteger(object)&&object>0
          &&h.record_key===c.helper_step&&(c.trigger==='interact'?h.ClientFinishCondition===expected:h.FinishCondition===expected)
          &&(h.FinishAction+h.ClientFinishActionByMove).includes(`C_RunPlot(${c.plot_id})`)
          &&s.LineID===entry.owner&&r.LineID===entry.owner&&s.FinishAction.includes(`AddStates(${object},`)
          &&new RegExp(`SetFinalStates\\([^)]*\\b${object}\\b`).test(r.FinishAction);
      });
  }
  function objectiveCallbacks(catalog,scope,owner,asset,step,position,logical) {
    const entry=catalog?.route_dialogues?.objective_presentations?.[step],a=entry?.admission;
    if(!logical || entry?.scope!==scope || entry.owner!==String(owner) || entry.anchor_asset!==asset
        || entry.step!==step || entry.position!==position || a?.boundary_verified!==true
        || typeof a.evidence_file!=='string' || !a.evidence_file || !/^[0-9a-f]{64}$/.test(a.evidence_sha256||'')
        || a.source_completion_written!==false || a.native_task_order_inferred!==false
        || !Array.isArray(entry.dialogues) || !entry.dialogues.length) return null;
    if(a.kind==='user_observed_reentry_with_source_window')return reentryWarnings(entry) ? entry : null;
    if(a.kind==='verified_tracked_document_interaction') {
      const h=a.source_helper || {},p=a.source_parent_task || {},m=a.source_objective || {},s=a.source_enable_step || {};
      const object=a.interaction_object;
      let predecessors;
      try {predecessors=JSON.parse(m.PreStepList);} catch {return null;}
      return entry.reader_policy==='optional_objective_reference' && entry.dialogues.length===1
        && entry.dialogues[0].endsWith(`_${a.plot_id}`) && Number.isInteger(object) && object>0 && a.textdes_id
        && a.document_before_helper_delivery_claimed===false && a.order_between_sibling_objectives_claimed===false
        && h.ClientFinishCondition===`ed.ConditionX.C_ObjInteracted(${object},"*")`
        && h.FinishCondition==='true' && h.PreStepList==='[]'
        && h.FinishAction===`ed.ActionX.C_RunPlot(${a.plot_id})` && a.helper_step===h.record_key
        && p.record_key===String(a.helper_step).split(':').slice(0,2).join(':')
        && p.RecvCondition===`ed.ConditionX.IsExplTaskFinished(${entry.owner},${a.parent_task})`
        && entry.step===m.record_key && String(m.TrackObject).replace(/[\[\]]/g,'').split(' | ').includes(String(object))
        && Array.isArray(predecessors) && predecessors.length===1 && predecessors[0]===Number(s.StepID)
        && s.LineID===entry.owner && m.LineID===entry.owner && s.TaskID===m.TaskID
        && String(s.FinishAction).includes(`ed.ActionX.AddStates(${object},"Interactive")`)
        && a.document_source?.object_id===String(object) && a.document_source?.textdes_id===a.textdes_id
        ? entry : null;
    }
    if(a.kind==='verified_objective_inspection_callbacks') {
      const contracts=a.inspection_contracts;
      return entry.reader_policy==='optional_objective_reference' && a.order_between_inspections_claimed===false
        && Array.isArray(contracts) && contracts.length===entry.dialogues.length
        && contracts.every((c,i)=>c.asset===entry.dialogues[i] && c.full_guard===c.source_trigger?.source_condition
          && c.parent_guard===c.source_trigger?.source_parent_task?.RecvCondition
          && c.source_trigger?.asset===c.asset && c.interaction_object>0 && c.interaction_removed_at_step===entry.step
          && c.prerequisite_assumed_complete===false && c.expiry_task && c.full_guard && c.parent_guard)
        ? entry : null;
    }
    if(a.kind!=='verified_objective_state_callback' || !Array.isArray(a.source_triggers) || a.source_triggers.length!==1
        || a.source_triggers[0].source_condition!==a.full_guard
        || a.helper_prerequisite_assumed_complete!==false || !a.helper_prerequisite
        || entry.dialogues.length!==1) return null;
    if(entry.reader_policy==='objective_dialogue') return a.state_join==='matching_main_state_predicate'
      && a.helper_prerequisite.FinishCondition==='true' ? entry : null;
    return entry.reader_policy==='optional_objective_reference' && a.state_join==='show_window_before_npc_interaction'
      ? entry : null;
  }
  function installMovement(source,catalog,entry,sceneInstall) {
    if(!entry) return source;
    // Reuse the checked graph/locale splice, retaining the range admission as
    // its own contract rather than creating an escort or a task completion.
    const plan={step:`movement:${entry.step}`,inline_graph:true,sequence_complete:true,
      sequence:entry.dialogues.map((asset,index)=>({asset,id:String(index)}))};
    const graph=installRoute(source,catalog,plan,sceneInstall);
    if(graph!==source && entry.admission?.kind==='user_requested_presumed_source_placement') {
      for(const node of Object.values(graph.nodes)) {
        if(node.type==='line' && node.id.startsWith(`route:${plan.step}:`)
            && entry.dialogues.includes(node.portrait_source_asset)) {
          node.reader_placement_audit={placement_status:'presumed',observation_status:'not_observed',
            native_activation_resolved:false,audit_file:entry.admission.audit_file};
        }
      }
    }
    return graph;
  }
  function completion(catalog,story,scope,owner,logical) {
    const entry=catalog?.route_dialogues?.completion_presentations?.[story.asset_key];
    return logical && entry?.scope===scope && entry.owner===String(owner)
      && entry.step===story.objective_key && entry.after_asset===story.asset_key
      && entry.admission?.kind==='verified_task_completion_join'
      && entry.admission.reading_context_projection?.scope===scope
      && entry.gate && typeof entry.gate==='object'
      && Array.isArray(entry.checkpoint_ids) && entry.checkpoint_ids.length>0
      && entry.checkpoint_ids.every(id=>catalog.progression?.checkpoints?.[id])
      ? entry : null;
  }
  function installCompletion(source,catalog,entry,sceneInstall,preview=false) {
    if(!entry || source.completion_supplements?.includes(entry.id))return source;
    if(preview) {
      // A story viewer offers the verified epilogue as optional reading. Keep
      // the exact gameplay gate on its payload, without asserting completion.
      const graph=structuredClone(source),terminal=`completion:${entry.id}:preview:end`;
      const endings=Object.values(graph.nodes).filter(node=>node.type==='end');
      if(!endings.length)throw new Error('Completion supplement has no authored ending');
      if(graph.nodes[terminal])throw new Error('Duplicate completion preview');
      graph.nodes[terminal]={id:terminal,type:'end'};
      for(const node of endings)Object.assign(node,{type:'line',entry_kind:'completion_preview',
        completion_preview:structuredClone(entry),next:terminal});
      graph.completion_supplements=[...(graph.completion_supplements||[]),entry.id];
      return graph;
    }
    const terminal=`completion:${entry.id}:end`,plan={step:`completion:${entry.id}`,
      inline_graph:true,sequence_complete:true,
      sequence:entry.dialogues.map((asset,index)=>({asset,id:String(index)}))};
    const child=installRoute({roots:[terminal],nodes:{[terminal]:{id:terminal,type:'end'}},
      text_entries:{},speaker_entries:{}},catalog,plan,sceneInstall);
    const graph=structuredClone(source);
    const endings=Object.values(graph.nodes).filter(node=>node.type==='end');
    if(!endings.length)throw new Error('Completion supplement has no authored ending');
    for(const [key,node]of Object.entries(child.nodes)) {
      if(graph.nodes[key])throw new Error('Duplicate completion supplement node');
      graph.nodes[key]=node;
    }
    for(const family of ['text_entries','speaker_entries'])Object.assign(graph[family],child[family]);
    for(const [language,locale]of Object.entries(child.embedded_locales||{})) {
      const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
      for(const family of ['texts','speakers'])Object.assign(embedded[family],locale[family]);
    }
    for(const node of endings)Object.assign(node,{type:'runtime',runtime_scope:entry.id,
      instruction:{op:'gate',expression:structuredClone(entry.gate)},next:child.roots[0],skip:terminal});
    graph.completion_supplements=[...(graph.completion_supplements||[]),entry.id];
    return graph;
  }
  function helperLifecycleContext(entry,where) {
    const c=entry.display_context,regions=c?.region_objects,objects=c?.source_region_objects,main=c?.source_main_step,task=c?.source_main_task;
    const activation=c?.source_activation,source=activation?.source_row,helper=entry.source_step,parent=entry.source_parent_task,steps=c?.helper_steps,cleanup=c?.source_cleanup,owner=entry.owner;
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),ids=s=>String(s).match(/\d+/g)||[];
    const args=(row,column,name)=>Array.from(String(row?.[column]).matchAll(new RegExp('ed\\.ActionX\\.'+name+'\\(([^()]*)\\)','g')))
      .flatMap(m=>{try{return[JSON.parse('['+m[1]+']')];}catch{return[];}});
    if(!where||c?.kind!=='source_helper_lifecycle'||c.step!==where.step||c.anchor_asset!==where.asset||c.position!==where.position
        ||!Array.isArray(regions)||!regions.length||new Set(regions).size!==regions.length||!regions.every(i=>Number.isInteger(i)&&i>0)
        ||!Array.isArray(objects)||objects.length!==regions.length||!Array.isArray(steps)||!steps.length||!equal(steps.at(-1),helper)
        ||!Array.isArray(cleanup)||cleanup.length!==regions.length||!main||!task||!source
        ||c.source_guard!==entry.source_condition||c.parent_guard!==parent.RecvCondition||c.source_guard!==regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        ||c.prerequisites_assumed_complete!==false||c.native_traversal_order_claimed!==false||c.source_completion_written!==false
        ||c.main_phase_end_claimed!==false||c.accepted_helper_state_is_external!==true)return false;
    if(main.record_key!==c.step||main.LineID!==owner||task.record_key!==`${owner}:${main.TaskID}`||task.LineID!==owner
        ||activation.record!==source.record_key||!regions.every(i=>args(source,activation.field,'AddStates').some(a=>equal(a,[i,'Show','Interactive']))))return false;
    const seen=new Set();
    for(const s of steps){if(s.LineID!==helper.LineID||s.TaskID!==helper.TaskID||seen.has(s.record_key)
        ||!ids(s.PreStepList).every(i=>seen.has(`${helper.LineID}:${helper.TaskID}:${i}`)))return false;seen.add(s.record_key);}
    const origin=c.activation_origin,terminal=activation.terminal_owned_line;
    if(origin==='owned_main_step') {
      if(activation.family!=='ExplStep'||source.LineID!==owner)return false;
      if(terminal){if(c.display_policy!=='after_terminal_activation'||c.position!=='after_asset'||!equal(main,source)
          ||terminal.LineID!==owner||terminal.LastTaskID!==source.TaskID||task.LastStepID!==source.StepID)return false;}
      else if(c.display_policy!=='earliest_source_eligible_objective')return false;
      else if(main.TaskID===source.TaskID){if(!ids(main.PreStepList).includes(source.StepID))return false;}
      else{const prior=activation.source_completed_main_task;
        if(prior?.LineID!==owner||prior.TaskID!==source.TaskID||prior.LastStepID!==source.StepID||Number(main.TaskID)!==Number(source.TaskID)+1
            ||main.PreStepList!=='[]'||!['[]',`[${main.TaskID}]`].includes(prior.NextTaskIDs)
            ||!['true',`ed.ConditionX.IsExplTaskFinished(${owner},${source.TaskID})`].includes(task.RecvCondition))return false;
      }
    } else if(['helper_receive_action','helper_predecessor'].includes(origin)) {
      const prior=activation.source_completed_main_task,guard=`ed.ConditionX.IsExplTaskFinished(${owner},${prior?.TaskID})`;
      if(c.display_policy!=='earliest_source_eligible_objective'||parent.RecvCondition!==guard||prior?.LineID!==owner
          ||Number(main.TaskID)!==Number(prior.TaskID)+1||!['[]',`[${main.TaskID}]`].includes(prior.NextTaskIDs)
          ||!['true',guard].includes(task.RecvCondition)||main.PreStepList!=='[]')return false;
      if(origin==='helper_receive_action'){if(activation.family!=='ExplTask'||activation.field!=='RecvAction'||!equal(source,parent))return false;}
      else if(activation.family!=='ExplStep'||activation.field!=='FinishAction'||!steps.slice(0,-1).some(s=>equal(s,source)))return false;
    } else return false;
    const retired=new Set([...args(helper,'FinishAction','SetFinalStates').flat(),...args(helper,'FinishAction','DelStates').filter(a=>a.slice(1).includes('Interactive')).map(a=>a[0])]);
    return objects.every((o,i)=>o.ID===String(regions[i])&&o.ClientType==='VirtualRange'&&o.InitStates==='[1]'&&o.FinalStates==='[]'
      &&cleanup[i].object===regions[i]&&cleanup[i].mode===(retired.has(regions[i])?'helper_state_action':'accepted_helper_step')
      &&Array.isArray(cleanup[i].actions)&&(cleanup[i].actions.length>0)===retired.has(regions[i]))
      &&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
  }
  function dependencyHelperContext(entry,where) {
    const c=entry.display_context,q=c?.dependency_contract,path=q?.helper_path;
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const sameSource=(a,b)=>equal(Object.fromEntries(Object.entries(a).filter(([k])=>k!=='record_order')),Object.fromEntries(Object.entries(b).filter(([k])=>k!=='record_order')));
    const actions=(row,field)=>{
      const text=row?.[field]||'true';if(text==='true')return[];
      return text.split(' and ').map(part=>{
        const m=part.match(/^ed\.ActionX\.(AddStates|DelStates|SetFinalStates|C_RunPlot)\(([^()]*)\)$/);
        if(!m)throw Error('additional helper effect');return[m[1],JSON.parse('['+m[2]+']')];
      });
    };
    const enables=(row,field,id)=>actions(row,field).some(([n,a])=>n==='AddStates'&&equal(a,[id,'Show','Interactive']));
    try {
      if(!where||c.kind!=='source_helper_dependency_window'||!Array.isArray(path)||!path.length
          ||c.step!==where.step||c.anchor_asset!==where.asset||c.position!==where.position||!['objective','before'].includes(c.position)
          ||c.source_guard!==entry.source_condition||c.parent_guard!==entry.source_parent_task.RecvCondition
          ||c.source_completion_written!==false||c.native_traversal_order_claimed!==false||c.prerequisites_assumed_complete!==false||c.main_phase_end_claimed!==false
          ||!c.evidence_file||!/^[0-9a-f]{64}$/.test(c.evidence_sha256||''))return false;
      const main=q.main_step,task=q.main_task,owner=entry.owner,first=path[0],last=path.at(-1),origin=q.origin;
      if(main.record_key!==c.step||main.LineID!==owner||task.LineID!==owner||main.TaskID!==task.TaskID
          ||!equal(last.step,entry.source_step)||!equal(last.task,entry.source_parent_task)||entry.source_record!==last.step.record_key
          ||q.plot!==entry.asset.split('_').at(-1)||entry.source_condition!==last.step.FinishCondition)return false;
      if(origin==='named_task_completion'){
        const prior=q.checkpoint_task,line=q.checkpoint_line,guard=`ed.ConditionX.IsExplTaskFinished(${prior.LineID},${prior.TaskID})`;
        if(line.LineID!==prior.LineID||first.task.RecvCondition!==guard||main.PreStepList!=='[]')return false;
        if(prior.LineID===owner){
          if(Number(task.TaskID)!==Number(prior.TaskID)+1||!['[]',`[${task.TaskID}]`].includes(prior.NextTaskIDs)||!['true',guard].includes(task.RecvCondition))return false;
        }else if(line.LastTaskID!==prior.TaskID||task.TaskID!=='1'||task.RecvCondition!==guard||q.target_line.LineID!==owner||!['1','2'].includes(q.target_line.LineType))return false;
      }else if(origin==='named_battle_checkpoint'){
        const checkpoint=q.checkpoint_step,guard=checkpoint.FinishCondition;
        if(!/^ed\.ConditionX\.IsWildMonsterKilled\([1-9]\d*\)$/.test(guard)||checkpoint.LineID!==owner||checkpoint.TaskID!==main.TaskID
            ||checkpoint.ClientFinishCondition!=='true'||first.task.RecvCondition!==guard||main.PreStepList!==`[${checkpoint.StepID}]`)return false;
      }else if(origin==='existing_helper_continuation'){
        const base=q.base_reference;
        if(!helperLifecycleContext(base,where)||q.source_row_equivalence!=='exact_fields_except_capture_record_order'||base.owner!==owner||!sameSource(base.source_step,first.step)||!sameSource(base.source_parent_task,first.task)||path.length<2)return false;
      }else return false;
      const seen=new Set();
      for(let index=0;index<path.length;index++){
        const item=path[index],h=item.step,parent=item.task,line=item.line,oid=item.region,obj=item.object,key=h.record_key;
        if(seen.has(key)||key!==`${h.LineID}:${h.TaskID}:${h.StepID}`||line.LineID!==parent.LineID||parent.LineID!==h.LineID
            ||line.LineType!=='3'||line.Rewards!=='[]'||parent.ActionRewards!=='[]'||parent.TaskID!==h.TaskID||h.Cost!=='[]'||h.ClientFinishCondition!=='true')return false;
        for(const field of ['RecvAction','ClientRecvActionByMove'])actions(parent,field);
        for(const field of ['FinishAction','ClientFinishActionByMove'])actions(h,field);
        if(!index){if(h.PreStepList!=='[]')return false;}
        else{
          const previous=path[index-1],p=previous.step;
          if(p.LineID===h.LineID&&p.TaskID===h.TaskID){if(h.PreStepList!==`[${p.StepID}]`)return false;}
          else if(h.PreStepList!=='[]'||previous.task.LastStepID!==p.StepID||previous.line.LastTaskID!==p.TaskID
              ||parent.RecvCondition!==`ed.ConditionX.IsExplTaskFinished(${p.LineID},${p.TaskID})`)return false;
        }
        if(oid==null){if(path.length!==1||origin!=='named_task_completion'||h.FinishCondition!=='true'||h.ClientFinishEvents!=='[]')return false;}
        else{
          if(!Number.isInteger(oid)||oid<=0||h.FinishCondition!==`ed.ConditionX.IsInRange(${oid})`||h.ClientFinishEvents!==`[Move:${oid}]`
              ||obj.ID!==String(oid)||obj.ClientType!=='VirtualRange'||obj.InitStates!=='[1]'||obj.FinalStates!=='[]'||obj.ExtraRulesID!=='0')return false;
          let active=enables(parent,'RecvAction',oid)||path.slice(0,index).some(p=>enables(p.step,'FinishAction',oid));
          if(!index&&origin==='existing_helper_continuation')active=active||enables(q.base_reference.display_context.source_activation.source_row,'FinishAction',oid);
          if(!active||!actions(h,'FinishAction').some(([n,a])=>n==='SetFinalStates'&&a.includes(oid)||n==='DelStates'&&a[0]===oid&&a.slice(1).includes('Interactive')))return false;
        }
        seen.add(key);
      }
      const requests=['FinishAction','ClientFinishActionByMove'].flatMap(f=>actions(last.step,f).filter(([n])=>n==='C_RunPlot').map(([,a])=>a));
      return equal(requests,[[Number(q.plot)]]);
    }catch{return false;}
  }
  function referenceInterludes(catalog,scope,story,position='before') {
    const existing=story?.[`objective_interludes_${position}`]||[];
    if(position!=='before')return existing;
    const seen=new Set(existing.map(o=>o.objective_key)),added=[];
    for(const entry of catalog?.route_dialogues?.phase_references||[]) {
      const d=entry.display_context,source=d?.source_main_step;
      if(entry.scope!==scope||d?.kind!=='source_helper_lifecycle'||d.position!=='before'||d.anchor_asset!==story?.asset_key
          ||!source||source.Detail!==''||source.Story!==''||source.PreStepList!=='[]'||seen.has(d.step)
          ||!phaseReferenceContext(entry,{step:d.step,asset:story.asset_key,position:'before'}))continue;
      // Preserve the real silent source boundary. No objective title or state
      // transition is invented merely to expose its configured helper dialogue.
      added.push({objective_key:d.step,objective_title_i18n:{},objective_summary_i18n:{},objective_position:'before',
        verified_silent_helper_boundary:true,completion_written:false});seen.add(d.step);
    }
    return added.length?[...added,...existing]:existing;
  }
  function acknowledgedMenuContext(entry,where) {
    try {
      const d=entry.display_context,c=d.acknowledged_helper_contract,sites={17208280:['537','1400637','3','2'],17208290:['538','1400171','4','3'],17208300:['539','1400180','5','4']};
      const [optionId,stateId,mainId,ackId]=sites[c.plot],task=entry.source_parent_task,h=entry.source_step,main=c.source_main_step,opt=c.menu_option,obj=c.menu_object,steps=c.accounted_source_steps,tasks=c.accounted_source_tasks,enable=c.source_enable_step,end=c.source_retirement_step;
      const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      if(!where||d.kind!=='source_menu_acknowledgment_window'||d.position!=='before'||entry.owner!=='17010208'||c.controller!=='17010396'
          ||d.step!==where.step||d.anchor_asset!==where.asset||d.position!==where.position||entry.asset!==`ep7/quest_story_${c.plot}`||c.named_owner!==entry.owner
          ||tasks.length!==1||steps.length!==5||!equal(task,tasks[0])||task.RecvCondition!=='ed.ConditionX.IsExplTaskFinished(17010208,2)'
          ||task.LastStepID!=='5'||task.RecvAction!=='true'||task.ClientRecvActionByMove!=='true'||task.ActionRewards!=='[]'||task.NextTaskIDs!=='[]'
          ||steps[0].FinishCondition!=='not ed.ConditionX.HasState(513900205,"Changeable")'||steps[0].PreStepList!=='[]'||steps[0].FinishAction!=='true'
          ||steps[4].PreStepList!=='[2 | 3 | 4]'||steps[4].FinishAction!=='true')return false;
      for(const [i,[pid,[,oid]]]of Object.entries(sites).entries()){
        const row=steps[i+1];if(row.record_key!==`17010396:1:${i+2}`||row.PreStepList!=='[1]'||row.FinishCondition!=='true'
            ||row.ClientFinishCondition!==`ed.ConditionX.C_PlotPlayed(${pid})`||row.FinishAction!==`ed.ActionX.DelStates(${oid},"CMark_1")`)return false;
      }
      const guard=(c.plot==='17208300'?'not ed.ConditionX.HasState(513900205,"Changeable") and ':'')+`ed.ConditionX.HasState(${stateId},"CMark_1")`;
      return steps.every(r=>r.LineID==='17010396'&&r.ClientFinishActionByMove==='true'&&r.Cost==='[]')&&equal(h,steps[Number(ackId)-1])
        &&main.record_key===`17010208:3:${mainId}`&&main.PreStepList==='[2]'&&main.FinishCondition===`not ed.ConditionX.HasState(${stateId},"CMark_1")`&&main.FinishAction==='true'&&main.ClientFinishActionByMove==='true'
        &&d.step===main.record_key&&d.anchor_asset==='ep7/quest_story_17208310'&&c.source_anchor_asset.asset_key===d.anchor_asset
        &&enable.record_key==='17010208:3:2'&&enable.FinishCondition==='ed.ConditionX.IsCardGameVictory(18)'
        &&[`ed.ActionX.AddStates(${stateId},"CMark_1")`,'ed.ActionX.SetFinalStates(513900205)','ed.ActionX.AddStates(513900120,"Interactive")'].every(v=>enable.FinishAction.includes(v))
        &&end.record_key==='17010208:3:6'&&end.PreStepList==='[3 | 4 | 5]'&&end.FinishAction.includes('ed.ActionX.SetFinalStates(513900120)')
        &&obj.ID==='513900120'&&opt.ObjectID===obj.ID&&obj.ClientType==='DataDrivenNpc'&&obj.DialogueMenuID==='513900120'&&obj.ExtraRulesID==='80'
        &&opt.ID===optionId&&opt.ClickAction===`ed.ActionX.C_RunPlot(${c.plot})`&&opt.ReturnMenu==='false'&&opt.ShowCondition===guard&&entry.source_condition===guard&&d.source_guard===guard
        &&entry.source_family==='MenuWorldActionOption'&&entry.source_record===optionId&&c.client_visibility_rule.ExtraRulesCondition==='ed.ConditionX.C_CheckFollowTaskByLineID(17010208)'
        &&d.parent_guard===task.RecvCondition&&c.graph.source_matches===true&&equal(c.source_step,h)&&equal(c.source_task,task)
        &&['completion_written','native_activation_simulated','sibling_order_claimed','server_acceptance_claimed','menu_click_simulated'].every(k=>c[k]===false)
        &&['source_completion_written','native_traversal_order_claimed','prerequisites_assumed_complete'].every(k=>d[k]===false)&&!!d.evidence_file&&/^[0-9a-f]{64}$/.test(d.evidence_sha256||'');
    }catch{return false;}
  }
  function phaseReferenceContext(entry,context) {
    const c=entry.display_context;
    if(c?.kind==='source_menu_acknowledgment_window')return acknowledgedMenuContext(entry,context);
    if(c?.kind==='source_helper_dependency_window')return dependencyHelperContext(entry,context);
    if(c?.kind==='source_object_inspection_window') {
      const o=c.source_object||{},h=entry.source_step||{},p=entry.source_parent_task||{},a=c.source_enable_step||{},z=c.source_retirement_step||{},t=c.source_main_task||{};
      const oid=o.ID,pid=String(entry.asset||'').split('_').at(-1),b=c.default_interaction||{},states=b.states;
      const initial=String(o.InitStates).match(/\d+/g)||[],final=String(o.FinalStates).match(/\d+/g)||[];
      const retired=Array.from(String(z.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g)).flatMap(m=>m[1].split(',').map(Number));
      return !!context&&c.step===context.step&&c.anchor_asset===context.asset&&c.position===context.position&&c.position==='objective'
        &&c.step===z.record_key&&c.source_guard===entry.source_condition&&c.source_guard===h.ClientFinishCondition&&c.parent_guard===p.RecvCondition
        &&c.source_completion_written===false&&c.native_traversal_order_claimed===false&&c.prerequisites_assumed_complete===false&&c.sibling_order_claimed===false
        &&/^\d+$/.test(oid||'')&&o.Type==='26'&&o.ClientType==='SteleTask2'&&o.ExtraRulesID==='0'&&initial.includes('2')&&!initial.includes('7')&&!final.includes('7')
        &&p.record_key===`${h.LineID}:${h.TaskID}`&&h.PreStepList==='[]'&&p.RecvCondition===`ed.ConditionX.IsExplTaskFinished(${entry.owner},${Number(t.TaskID)-1})`
        &&t.record_key===`${entry.owner}:${t.TaskID}`&&t.RecvCondition===p.RecvCondition&&a.LineID===entry.owner&&z.LineID===entry.owner&&a.TaskID===t.TaskID&&z.TaskID===t.TaskID
        &&z.PreStepList===`[${a.StepID}]`&&h.ClientFinishEvents===`[C_InteractObj:${oid}:*]`&&h.FinishCondition==='true'&&h.ClientFinishCondition===`ed.ConditionX.C_ObjInteracted(${oid},"*")`
        &&h.ClientFinishActionByMove==='true'&&h.Cost==='[]'&&String(h.FinishAction).includes(`ed.ActionX.C_RunPlot(${pid})`)
        &&String(a.FinishAction).includes(`ed.ActionX.AddStates(${oid},"Interactive")`)&&retired.includes(Number(oid))
        &&JSON.stringify(b.object)===JSON.stringify(o)&&b.registered_option==='*'&&b.object_type?.ClientType===o.ClientType&&b.object_type?.InteractID==='58'
        &&states?.length===1&&states[0].source?.Condition==='true'&&JSON.stringify(states[0].admitting_options)==='["47"]'&&states[0].options?.length===1
        &&states[0].options[0].ID==='47'&&states[0].options[0].ExplInteract==='true'&&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    if(c?.kind==='source_helper_lifecycle')return helperLifecycleContext(entry,context);
    if(c?.kind==='source_cross_task_state_window') {
      const steps=c.source_steps,path=c.source_task_path,regions=c.region_objects,objects=c.source_region_objects,pre=c.helper_prerequisites;
      if(!context||!Array.isArray(steps)||steps.length<2||!Array.isArray(path)||path.length<2
          ||!Array.isArray(regions)||!regions.length||new Set(regions).size!==regions.length||!regions.every(i=>Number.isInteger(i)&&i>0)
          ||!Array.isArray(objects)||objects.length!==regions.length||!Array.isArray(pre))return false;
      const owner=entry.owner,enable=steps[0],end=steps.at(-1),first=Number(enable.TaskID),last=Number(end.TaskID);
      const expectedTasks=Array.from({length:last-first+1},(_,i)=>String(first+i));
      if(JSON.stringify(path.map(t=>t.TaskID))!==JSON.stringify(expectedTasks))return false;
      const tasks=new Map(path.map(t=>[t.TaskID,t])),seen=new Set();
      if(!path.every(t=>t.LineID===owner&&t.record_key===`${owner}:${t.TaskID}`))return false;
      for(const s of steps){const task=s.TaskID,key=s.record_key;
        if(seen.has(key)||s.LineID!==owner||key!==`${owner}:${task}:${s.StepID}`||!tasks.has(task))return false;
        if(seen.size){const ids=String(s.PreStepList).match(/\d+/g)||[];
          if(ids.length){if(!ids.every(i=>seen.has(`${owner}:${task}:${i}`)))return false;}
          else{const previous=tasks.get(String(Number(task)-1)),current=tasks.get(task);
            if(!previous||!['[]',`[${task}]`].includes(previous.NextTaskIDs)
                ||!['true',`ed.ConditionX.IsExplTaskFinished(${owner},${previous.TaskID})`].includes(current.RecvCondition)
                ||!seen.has(`${owner}:${previous.TaskID}:${previous.LastStepID}`))return false;
          }
        }seen.add(key);
      }
      const start=steps.slice(1).reduce((a,b)=>Number(a.record_order)<Number(b.record_order)?a:b);
      const retired=Array.from(String(end.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g)).flatMap(m=>m[1].split(',').map(Number));
      const expected=Array.from(entry.source_step.PreStepList.matchAll(/\d+/g),m=>entry.source_record.split(':').slice(0,-1).join(':')+':'+m[0]);
      return c.step===context.step&&c.anchor_asset===context.asset&&c.position===context.position&&c.step===start.record_key
        &&c.source_guard===entry.source_condition&&c.parent_guard===entry.source_parent_task.RecvCondition
        &&c.source_guard===regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        &&JSON.stringify(c.source_enable_step)===JSON.stringify(enable)&&JSON.stringify(c.source_retirement_step)===JSON.stringify(end)
        &&JSON.stringify(pre.map(p=>p.record_key))===JSON.stringify(expected)
        &&c.prerequisites_assumed_complete===false&&c.native_traversal_order_claimed===false&&c.source_completion_written===false
        &&c.requires_interactive_region===true&&c.retirement_is_applied_state_boundary===true
        &&c.task_transition_policy==='original_task_model_default_or_single_successor'
        &&objects.every((o,i)=>o.ID===String(regions[i])&&o.ClientType==='VirtualRange'&&o.InitStates==='[1]'&&o.FinalStates==='[]'
          &&retired.includes(regions[i])&&String(enable.FinishAction).includes(`ed.ActionX.AddStates(${regions[i]},"Show","Interactive")`))
        &&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    if(c?.kind==='source_activation_retirement_window') {
      const chain=c.source_chain,regions=c.region_objects,objects=c.source_region_objects,pre=c.helper_prerequisites;
      if(!Array.isArray(chain)||chain.length<2||!Array.isArray(regions)||!regions.length||!Array.isArray(objects)
          ||!Array.isArray(pre)||new Set(regions).size!==regions.length||!regions.every(i=>Number.isInteger(i)&&i>0))return false;
      const enable=chain[0],end=chain.at(-1),task=enable.TaskID;
      const retired=Array.from(String(end.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g)).flatMap(m=>m[1].split(',').map(Number));
      const expected=Array.from(entry.source_step.PreStepList.matchAll(/\d+/g),m=>entry.source_record.split(':').slice(0,-1).join(':')+':'+m[0]);
      return c.step===context?.step&&c.anchor_asset===context?.asset&&c.position===context?.position
        &&c.source_guard===entry.source_condition&&c.parent_guard===entry.source_parent_task.RecvCondition
        &&c.source_guard===regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        &&JSON.stringify(c.source_enable_step)===JSON.stringify(enable)&&JSON.stringify(c.source_retirement_step)===JSON.stringify(end)
        &&c.step===chain[1].record_key&&chain.every((s,i)=>s.LineID===entry.owner&&s.TaskID===task
          &&s.record_key===`${entry.owner}:${task}:${s.StepID}`&&(!i||s.PreStepList===`[${chain[i-1].StepID}]`))
        &&JSON.stringify(pre.map(p=>p.record_key))===JSON.stringify(expected)
        &&c.prerequisites_assumed_complete===false&&c.native_traversal_order_claimed===false&&c.source_completion_written===false
        &&c.requires_interactive_region===true&&c.retirement_is_applied_state_boundary===true
        &&objects.length===regions.length&&objects.every((o,i)=>o.ID===String(regions[i])&&o.ClientType==='VirtualRange'
          &&o.FinalStates==='[]'&&retired.includes(regions[i])&&String(enable.FinishAction).includes(`ed.ActionX.AddStates(${regions[i]},"Show","Interactive")`))
        &&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    if(c?.position==='after_asset') {
      const o=c.observed_order;
      if(o?.source!=='user_recording_observation' || o.anchor_asset!==c.anchor_asset
          || o.completion_written!==false || !Array.isArray(o.assets) || new Set(o.assets).size!==o.assets.length
          || !Number.isInteger(o.index) || o.index<0 || o.assets[o.index]!==entry.asset
          || !o.evidence_file || !/^[0-9a-f]{64}$/.test(o.evidence_sha256||''))return false;
    }
    if(c?.kind==='task_receive_region_retirement_window') {
      const task=c.source_task || {},end=c.source_retirement_step || {},regions=c.region_objects,objects=c.source_region_objects;
      const retired=Array.from(String(end.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g))
        .flatMap(match=>match[1].split(',').map(Number));
      return c.step===context?.step && c.anchor_asset===context?.asset && c.position===context?.position
        && typeof c.step==='string' && c.step.startsWith(entry.owner+':')
        && Array.isArray(regions) && regions.length>0 && new Set(regions).size===regions.length
        && regions.every(i=>Number.isInteger(i)&&i>0)
        && c.source_guard===entry.source_condition && c.parent_guard===entry.source_parent_task.RecvCondition
        && c.source_guard===regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        && task.RecvCondition===c.parent_guard && task.record_key===c.step.split(':').slice(0,-1).join(':')
        && task.LineID===entry.owner && end.record_key===c.step && end.PreStepList==='[]'
        && c.prerequisites_assumed_complete===false && Array.isArray(c.helper_prerequisites)
        && c.native_traversal_order_claimed===false && c.source_completion_written===false
        && c.requires_interactive_region===true && c.retirement_is_applied_state_boundary===true
        && Array.isArray(objects) && objects.length===regions.length && objects.every((o,i)=>
          o.ID===String(regions[i])&&o.ClientType==='VirtualRange'&&o.FinalStates==='[]'&&retired.includes(regions[i]))
        && typeof c.evidence_file==='string' && c.evidence_file.length>0 && /^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    return c?.kind==='source_enabled_exploration_phase' && c.step===context?.step
      && c.anchor_asset===context.asset && c.position===context.position
      && typeof c.step==='string' && c.step.startsWith(entry.owner+':')
      && typeof c.enable_after_step==='string' && c.enable_after_step.startsWith(entry.owner+':')
      && c.source_guard===entry.source_condition && c.parent_guard===entry.source_parent_task.RecvCondition
      && Number.isInteger(c.region_object) && c.region_object>0
      && c.prerequisites_assumed_complete===false && Array.isArray(c.helper_prerequisites)
      && c.native_traversal_order_claimed===false && c.source_completion_written===false
      && typeof c.evidence_file==='string' && c.evidence_file.length>0
      && /^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
  }
  function parallelReadingGroup(catalog,scope,owner,logical) {
    if(!logical)return null;
    const g=(catalog?.route_dialogues?.parallel_reading_groups||[]).find(g=>g.scope===scope&&g.owner===String(owner));
    if(!g || g.presentation_only!==true || g.completion_written!==false || g.source_order_is_mandatory!==false
        || !/^[0-9a-f]{64}$/.test(g.evidence_sha256||'') || !g.evidence_file
        || !Array.isArray(g.branches)||g.branches.length<2 || !g.source_join || !g.source_predecessor
        || !g.branches.every(b=>b?.source_step && Array.isArray(b.assets)))return null;
    const ids=g.branches.map(b=>b.step),task=g.source_join.record_key?.split(':').slice(0,-1).join(':');
    if(new Set(ids).size!==ids.length || new Set(g.branches.flatMap(b=>b.assets)).size!==g.branches.flatMap(b=>b.assets).length
        || g.source_predecessor.LineID!==g.owner || g.source_join.LineID!==g.owner
        || g.source_predecessor.TaskID!==g.source_join.TaskID
        || g.source_join.PreStepList!==`[${g.branches.map(b=>b.source_step.StepID).join(' | ')}]`
        || !g.branches.every(b=>b.step===b.source_step?.record_key && b.step.startsWith(g.owner+':')
          && b.source_step.PreStepList===`[${g.source_predecessor.StepID}]`
          && b.step.split(':').slice(0,-1).join(':')===task && b.assets?.length>0 && b.textdes_id))return null;
    return g;
  }
  function parallelReadingOrder(contexts,group,first) {
    if(!group)return contexts;
    const branches=group.branches,assets=new Set(branches.flatMap(b=>b.assets));
    const indices=contexts.map((c,i)=>assets.has(c.assetKey)?i:-1).filter(i=>i>=0);
    if(indices.length!==assets.size || !indices.length || indices.at(-1)-indices[0]+1!==indices.length)return contexts;
    const byAsset=new Map(contexts.slice(indices[0],indices.at(-1)+1).map(c=>[c.assetKey,c]));
    if(byAsset.size!==assets.size || !branches.every(b=>b.assets.every(a=>byAsset.get(a)?.story?.objective_key===b.step)))return contexts;
    const chosen=branches.find(b=>b.step===first)||branches[0];
    const ordered=[chosen,...branches.filter(b=>b!==chosen)].flatMap(b=>b.assets.map(a=>byAsset.get(a)));
    return [...contexts.slice(0,indices[0]),...ordered,...contexts.slice(indices.at(-1)+1)];
  }
  function phaseReferences(catalog,scope,owner,logical,context=null) {
    if(!logical) return [];
    const assets=new Set();
    return (catalog?.route_dialogues?.phase_references || []).filter(entry=> {
      const dialogue=catalog.route_dialogues.dialogues[entry.asset];
      if(entry.scope!==scope || entry.owner!==String(owner)
          || entry.reader_policy!=='optional_reference_not_chronological'
          || entry.admission?.kind!=='verified_named_quest_helper_reference'
          || entry.admission.exact_playback_order_claimed!==false
          || entry.admission.progression_facts_written!==false
          || !dialogue || assets.has(entry.asset)
          || (entry.display_context ? !phaseReferenceContext(entry,context) : context!==null)) return false;
      assets.add(entry.asset);return true;
    }).sort((a,b)=>(a.display_context?.observed_order?.index||0)-(b.display_context?.observed_order?.index||0));
  }
  // An independent transcript view. It has no History/Session and cannot
  // complete quests or leak a local question-menu selection into another scene.
  function referenceTranscript(dialogue,decisions=[],automatic=false) {
    const graph=dialogue.graph,items=[],reads=new Map();let current=graph.roots[0],decision=0;
    if(graph.roots.length!==1) throw new Error('Ambiguous reference entry');
    for(let count=0;current && count<1000;count++) {
      const node=graph.nodes[current];
      if(!node) throw new Error('Missing reference target');
      if(node.type==='end')return {items,choice:null};
      if(node.type==='runtime' && node.instruction?.op==='continue') {current=node.next;continue;}
      if(node.type==='choice') {
        if(!node.route_choice || node.persistent_choice) throw new Error('Unsupported reference choice');
        const key=node.runtime_scope+':'+node.runtime_choice,seen=reads.get(key)||new Set();reads.set(key,seen);
        const options=node.options.filter(o=>o.guard?.kind==='literal' && o.guard.value===true
          && (o.display_reads||[]).every(index=>seen.has(index)));
        const chosen=options.find(o=>o.index===decisions[decision]) || (automatic ? options.find(o=>!seen.has(o.index+1)) : null);
        if(!chosen)return {items,choice:{node,options,decision}};
        seen.add(chosen.index+1);items.push({node,option:chosen,options,decision});decision++;current=chosen.target;continue;
      }
      if(!['line','document','picture','cinematic'].includes(node.type)) throw new Error('Unsupported reference event');
      items.push({node});current=node.next;
    }
    throw new Error('Unbounded reference transcript');
  }
  function hasObjectiveDialogue(catalog,scope,asset,step,logical) {
    const owner=String(step||'').split(':')[0];
    return phaseReferences(catalog,scope,owner,logical,{asset,step,position:'objective'}).length>0
      || Boolean(objectiveCallbacks(catalog,scope,owner,asset,step,'objective',logical))
      || Boolean(presumedRoute(catalog,scope,owner,asset,step,'objective',logical));
  }
  function routeParts(plan) {
    const sequence=plan.inline_graph?[]:plan.sequence,parts=[];
    let optionalShown=false;
    const optional=()=> {for(const entry of plan.optional)parts.push({lane:'optional',entry});optionalShown=true;};
    for(const entry of sequence) {
      if(entry.trigger==='route_success' && !optionalShown)optional();
      if(!entry.delegated_to_anchor)parts.push({lane:'sequence',entry});
    }
    if(!optionalShown)optional();
    return parts;
  }
  return {referenceInterludes,objectiveCallbacks,map,fishing,visible,insertFishing,insertStart,insertRoute,inlineDialogues,encounterDialogues,route,presumedRoute,installRoute,presentation,movement,installMovement,completion,installCompletion,pictureCatalog,pictureStory,pictureAsset,phaseReferences,referenceTranscript,hasObjectiveDialogue,routeParts,parallelReadingGroup,parallelReadingOrder};
});

;
/* Presentation-only boundaries between source-established encounter visits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoryEncounters=api;})(typeof globalThis==='object'?globalThis:this,function(){
  const displayed=new Set(['line','document','picture','cinematic','choice']);
  const external=/ed\.ConditionX\.(?:FishAmount|HasItem|ItemCount|TouchedSteleCount|C_ObjInteracted|IsInRange|IsWildMonsterKilled|WearingAvatarCount|\w*TimeOfDay\w*|\w*Weather\w*|\w*MiniGame\w*)\(/;
  function titles(value,kind){
    if(!['easter_egg','exploration_activity'].includes(kind)||typeof value?.en!=='string')return value;
    // The recovered Latin face uses full-em curly quotes. Keep source metadata
    // intact and use its proportional ASCII quotes in editorial English titles.
    return {...value,en:value.en.replace(/[‘’＇]/g,"'").replace(/[“”＂]/g,'"')};
  }
  function joinsFor(story){return story.easter_egg_evidence?.joins||[];}
  function receiver(join,evidence){
    const menus=(evidence.menu_receivers||[]).filter(m=>String(m.plot)===String(join.plot_id)&&String(m.task||'1')===String(join.task_id)&&String(m.step)===String(join.record).split(':').at(-1));
    if(menus.length===1&&menus[0].object)return{object:String(menus[0].object),kind:'menu'};
    const step=(evidence.steps||[]).find(s=>s.record_key===join.record);
    const match=step?.ClientFinishCondition?.match(/^ed\.ConditionX\.C_ObjInteracted\((\d+),(?:"\*"|\d+)\)$/);
    return match&&['FinishAction','ClientFinishActionByMove'].includes(join.field)?{object:match[1],kind:'object_interaction'}:null;
  }
  function gap(current,previous,evidence){
    const steps=new Map((evidence.steps||[]).map(s=>[s.record_key,s]));
    const next=steps.get(current.record),before=steps.get(previous.record);if(!next||!before)return null;
    if(next.LineID!==before.LineID)return null;
    if(next.TaskID!==before.TaskID){
      const task=(evidence.tasks||[]).find(t=>t.TaskID===next.TaskID);
      return task?.RecvCondition===`ed.ConditionX.IsExplTaskFinished(${before.LineID},${before.TaskID})`?{kind:'completed_previous_task',record:task.record_key}:null;
    }
    const pending=(String(next.PreStepList).match(/\d+/g)||[]).map(id=>({id,via:[]})),seen=new Set();
    while(pending.length){
      const {id,via}=pending.shift(),key=`${next.LineID}:${next.TaskID}:${id}`;
      if(key===before.record_key){if(via.length)return{kind:'intervening_gameplay',records:via};continue;}
      if(seen.has(key))continue;seen.add(key);const step=steps.get(key);if(!step)continue;
      const stages=external.test(step.FinishCondition+' '+step.ClientFinishCondition)?[...via,key]:via;
      for(const pre of String(step.PreStepList).match(/\d+/g)||[])pending.push({id:pre,via:stages});
    }
    return null;
  }
  function visits(story){
    if(!['easter_egg','exploration_activity'].includes(story?.logical_story_kind)||!story.easter_egg_evidence)return{};
    const evidence=story.easter_egg_evidence,joins=joinsFor(story),objects=new Map((evidence.objects||[]).map(o=>[String(o.ID),o]));
    const seen=new Map();for(const j of joins){const rows=seen.get(j.asset_key)||[];rows.push(j);seen.set(j.asset_key,rows);}
    const result={};let previous=null;
    for(const join of joins){
      const here=receiver(join,evidence);if(!here)continue;
      if(previous&&seen.get(join.asset_key)?.length===1){
        const a=objects.get(here.object),b=objects.get(previous.receiver.object);
        const elsewhere=here.object!==previous.receiver.object&&a&&b&&(a.Loc!==b.Loc||a.ZoneID!==b.ZoneID);
        const interval=gap(join,previous.join,evidence);
        if(elsewhere||interval)result[join.asset_key]={kind:'separate_interaction',record:join.record,object:here.object,previous_record:previous.join.record,
          reason:elsewhere?{kind:'different_object_location',previous_object:previous.receiver.object}:interval};
      }
      previous={join,receiver:here};
    }
    return result;
  }
  function install(graph,story){
    const boundaries=visits(story);if(!Object.keys(boundaries).length)return graph;
    const fallback=story.source_asset_key||story.asset_key,source=node=>node?.portrait_source_asset||fallback;
    const starts=new Set(graph.roots||[]);
    for(const node of Object.values(graph.nodes))for(const target of [node.next,node.skip,...(node.options||[]).map(o=>o.target)]){
      if(target&&graph.nodes[target]&&source(node)!==source(graph.nodes[target]))starts.add(target);
    }
    const marks=new Map();
    for(const root of starts){
      const first=graph.nodes[root],asset=source(first),boundary=boundaries[asset];if(!first||!boundary)continue;
      const queue=[root],seen=new Set();
      while(queue.length){
        const id=queue.shift();if(seen.has(id))continue;seen.add(id);const node=graph.nodes[id];if(!node||source(node)!==asset)continue;
        if(displayed.has(node.type)){marks.set(id,{...boundary,source_asset:asset});continue;}
        for(const target of [node.next,node.skip,...(node.options||[]).map(o=>o.target)])if(target)queue.push(target);
      }
    }
    if(!marks.size)return graph;
    const result=structuredClone(graph);for(const [id,boundary] of marks)result.nodes[id].encounter_visit_boundary=boundary;
    return result;
  }
  return{visits,install,titles};
});

;
/* Objective-bound encounter presentation. Ordinary battle results are not choices. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StoryBattles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Generated from reader_data/battle_callbacks/index.json; exact source contracts only.
  const nativeCallbackContracts = {"wheel_1905:13112710":{"field":"1109420","battle_group_id":"110942","step":"13010112:5:9","asset":"ep3/quest_story_13112710","condition":{"kind":"verified_native_callback","contract_id":"wheel_1905:13112710","skill_id":1905,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":1,"once_flag":"firstdiashow"}}},"wheel_1905:13112720":{"field":"1109420","battle_group_id":"110942","step":"13010112:5:9","asset":"ep3/quest_story_13112720","condition":{"kind":"verified_native_callback","contract_id":"wheel_1905:13112720","skill_id":1905,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","requires_initial_enemy_tid":79,"any_of":[{"counter":"timecount","operator":">=","seconds":14},{"counter":"captured_enemy.mp","operator":">=","value":800}],"once_flag":"seconddia"}}},"wheel_1905:13112730":{"field":"1109420","battle_group_id":"110942","step":"13010112:5:9","asset":"ep3/quest_story_13112730","condition":{"kind":"verified_native_callback","contract_id":"wheel_1905:13112730","skill_id":1905,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"endcount","operator":">=","seconds":2,"once_flag":"enddia","clock_starts_after":"captured_icedemon_ult_Start_count_ge1","requires_initial_enemy_tid":79}}},"wheel_1906:13113111":{"field":"1109450","battle_group_id":"110945","step":"13010113:2:7","asset":"ep3/quest_story_13113111","condition":{"kind":"verified_native_callback","contract_id":"wheel_1906:13113111","skill_id":1906,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":1.5,"once_flag":"firstdia"}}},"wheel_1906:13113110":{"field":"1109450","battle_group_id":"110945","step":"13010113:2:7","asset":"ep3/quest_story_13113110","condition":{"kind":"verified_native_callback","contract_id":"wheel_1906:13113110","skill_id":1906,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"monsdiatime","operator":">=","seconds":0.5,"once_flag":"monsmaxdia","clock_starts_after":"addsummontime_ge2","requires_initial_enemy_tid":79,"rounds":"different_camp_deaths4_8_12_16_while_enemy_alive_hero_count_le5","allocation_failure_does_not_undo_attempt_counter":true}}},"wheel_1906:13113112":{"field":"1109450","battle_group_id":"110945","step":"13010113:2:7","asset":"ep3/quest_story_13113112","condition":{"kind":"verified_native_callback","contract_id":"wheel_1906:13113112","skill_id":1906,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"old_hp_or_field_timer","requires_initial_ally_tid":59,"any_of":[{"event":"SetHp","fraction":0.2,"operator":"<","threshold_base":"attribs.HP","evaluation":"old_hp_before_underlying_setter"},{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":30}],"shared_once_flag":"wheelsecondhpcheck"}}},"wheel_1907:13113151":{"field":"1109460","battle_group_id":"110946","step":"13010113:3:3","asset":"ep3/quest_story_13113151","condition":{"kind":"verified_native_callback","contract_id":"wheel_1907:13113151","skill_id":1907,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"firstplottimecount","operator":">=","seconds":1,"once_flag":"firstplotshow"}}},"wheel_1907:13113152":{"field":"1109460","battle_group_id":"110946","step":"13010113:3:3","asset":"ep3/quest_story_13113152","condition":{"kind":"verified_native_callback","contract_id":"wheel_1907:13113152","skill_id":1907,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"named_skill_start","hero_tid":59,"skill_name":"walika_atk2b","count":2,"counter":"atk2btimecount","operator":"==","selection":"initial_alive_nonsummoned_matched_hero","evaluation":"after_underlying_start"}}},"wheel_1907:13113153":{"field":"1109460","battle_group_id":"110946","step":"13010113:3:3","asset":"ep3/quest_story_13113153","condition":{"kind":"verified_native_callback","contract_id":"wheel_1907:13113153","skill_id":1907,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"named_skill_start","hero_tid":79,"skill_name":"icedemon_ult","count":1,"counter":"ulttimecount","operator":"==","selection":"initial_alive_nonsummoned_matched_hero","evaluation":"after_underlying_start"}}},"wheel_1907:13113154":{"field":"1109460","battle_group_id":"110946","step":"13010113:3:3","asset":"ep3/quest_story_13113154","condition":{"kind":"verified_native_callback","contract_id":"wheel_1907:13113154","skill_id":1907,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"SetHp","requires_initial_enemy_tid":79,"fraction":0.45,"operator":"<","threshold_base":"attribs.HP","evaluation":"old_hp_before_underlying_setter","once_flag":"wheelhpcheck"}}},"wheel_1907:13113155":{"field":"1109460","battle_group_id":"110946","step":"13010113:3:3","asset":"ep3/quest_story_13113155","condition":{"kind":"verified_native_callback","contract_id":"wheel_1907:13113155","skill_id":1907,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":7,"once_flag":"ultplotoneshow","clock_starts_after":"captured_icedemon_ult_Start_count_ge1","requires_initial_enemy_tid":79}}},"wheel_1907:13113156":{"field":"1109460","battle_group_id":"110946","step":"13010113:3:3","asset":"ep3/quest_story_13113156","condition":{"kind":"verified_native_callback","contract_id":"wheel_1907:13113156","skill_id":1907,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"named_skill_start","hero_tid":59,"skill_name":"walika_ult","count":2,"counter":"ulttimecount","operator":"==","selection":"initial_alive_nonsummoned_matched_hero","evaluation":"after_underlying_start"}}},"wheel_1908:13113171":{"field":"1109470","battle_group_id":"110947","step":"13010113:3:6","asset":"ep3/quest_story_13113171","condition":{"kind":"verified_native_callback","contract_id":"wheel_1908:13113171","skill_id":1908,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"firstplottimecount","operator":">=","seconds":1,"once_flag":"firstplotshow"}}},"wheel_1908:13113172":{"field":"1109470","battle_group_id":"110947","step":"13010113:3:6","asset":"ep3/quest_story_13113172","condition":{"kind":"verified_native_callback","contract_id":"wheel_1908:13113172","skill_id":1908,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"named_skill_start","hero_tid":79,"skill_name":"icedemon_ult","count":1,"counter":"ulttimecount","operator":"==","selection":"initial_alive_nonsummoned_matched_hero","evaluation":"after_underlying_start"}}},"wheel_1908:13113174":{"field":"1109470","battle_group_id":"110947","step":"13010113:3:6","asset":"ep3/quest_story_13113174","condition":{"kind":"verified_native_callback","contract_id":"wheel_1908:13113174","skill_id":1908,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":10,"once_flag":"treat","clock_starts_after":"captured_icedemon_ult_Start_count_ge1","requires_initial_enemy_tid":79,"requires_initial_ally_tid":59,"requires_self_commander":true,"once_flag_set_before_required_ally_and_commander_checks":true}}},"wheel_1908:13113175":{"field":"1109470","battle_group_id":"110947","step":"13010113:3:6","asset":"ep3/quest_story_13113175","condition":{"kind":"verified_native_callback","contract_id":"wheel_1908:13113175","skill_id":1908,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":18,"once_flag":"bosskuangbao","clock_starts_after":"captured_icedemon_ult_Start_count_ge1","requires_initial_enemy_tid":79}}},"wheel_1908:13113176":{"field":"1109470","battle_group_id":"110947","step":"13010113:3:6","asset":"ep3/quest_story_13113176","condition":{"kind":"verified_native_callback","contract_id":"wheel_1908:13113176","skill_id":1908,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"named_skill_start","hero_tid":59,"skill_name":"walika_ult","count":2,"counter":"ulttimecount","operator":"==","selection":"initial_alive_nonsummoned_matched_hero","evaluation":"after_underlying_start"}}},"wheel_1902:13108251":{"field":"1105440","battle_group_id":"110544","step":"13010108:501:7","asset":"ep3/quest_story_13108251","condition":{"kind":"verified_native_callback","contract_id":"wheel_1902:13108251","skill_id":1902,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":2,"once_flag":"firstplotshow"}}},"wheel_1902:13108250":{"field":"1105440","battle_group_id":"110544","step":"13010108:501:7","asset":"ep3/quest_story_13108250","condition":{"kind":"verified_native_callback","contract_id":"wheel_1902:13108250","skill_id":1902,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"secondtimecount","operator":">=","seconds":1,"once_flag":"secondplot","clock_starts_after":"summontime_ge0.5","requires_initial_enemy_tid":4050,"rounds":"legal_different_camp_deaths3_6_9_then_next_Update_summon_attempts","requires_summon_allocation":false}}},"wheel_1902:13108252":{"field":"1105440","battle_group_id":"110544","step":"13010108:501:7","asset":"ep3/quest_story_13108252","condition":{"kind":"verified_native_callback","contract_id":"wheel_1902:13108252","skill_id":1902,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","requires_legal_different_camp_death_count":9,"arm_flag":"timetoend","once_flag":"firstplot"}}},"wheel_1902:13108253":{"field":"1105440","battle_group_id":"110544","step":"13010108:501:7","asset":"ep3/quest_story_13108253","condition":{"kind":"verified_native_callback","contract_id":"wheel_1902:13108253","skill_id":1902,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"endtimecount","operator":">=","seconds":3,"once_flag":"walikacontrol","clock_starts_after":"timetoend_at9legal_different_camp_deaths","requires_initial_ally_tid":59,"once_flag_set_before_ally_check":true}}},"wheel_1589:10127059":{"field":"1037450","battle_group_id":"103745","step":"10030127:2:9","asset":"mn2/quest_story_10127059","condition":{"kind":"verified_native_callback","contract_id":"wheel_1589:10127059","skill_id":1584,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"skill_instance","trigger":{"event":"first_field_skill_update","once_flag":"wheel1589_Initial","request_precedes_initialization":true,"missing_named_ultimate_raises_before_init_latch":true}}},"wheel_1589:10127061":{"field":"1037450","battle_group_id":"103745","step":"10030127:2:9","asset":"mn2/quest_story_10127061","condition":{"kind":"verified_native_callback","contract_id":"wheel_1589:10127061","skill_id":1584,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_finish_index","trigger":{"event":"named_skill_finish","hero_tid":15,"skill_name":"ldoublesword_ult","selection":"initial_alive_nonsummoned_player_hero","evaluation":"after_underlying_finish","counter":"wheel1589_ultcount","operator":"==","count":1,"requires_summon_allocation":false}}},"wheel_1589:10127062":{"field":"1037450","battle_group_id":"103745","step":"10030127:2:9","asset":"mn2/quest_story_10127062","condition":{"kind":"verified_native_callback","contract_id":"wheel_1589:10127062","skill_id":1584,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_finish_index","trigger":{"event":"named_skill_finish","hero_tid":15,"skill_name":"ldoublesword_ult","selection":"initial_alive_nonsummoned_player_hero","evaluation":"after_underlying_finish","counter":"wheel1589_ultcount","operator":"==","count":2,"requires_summon_allocation":false}}},"wheel_1947:10262180":{"field":"1017030","battle_group_id":"101703","step":"10010610:5:6","asset":"mn/quest_story_10262180","condition":{"kind":"verified_native_callback","contract_id":"wheel_1947:10262180","skill_id":1947,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":1,"once_flag":"dialogueid_start_enter"}}},"wheel_1947:10262181":{"field":"1017030","battle_group_id":"101703","step":"10010610:5:6","asset":"mn/quest_story_10262181","condition":{"kind":"verified_native_callback","contract_id":"wheel_1947:10262181","skill_id":1947,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"field_caster_instance","trigger":{"event":"field_skill_update","counter":"timecount","operator":">=","seconds":21,"once_flag":"dialogueid_goat_enter","fallback_seconds":23,"fallback_shares_same_flag":true}}},"wheel_1590:10127191":{"field":"1037420","battle_group_id":"103742","step":"10030127:2:3","asset":"mn2/quest_story_10127191","condition":{"kind":"verified_native_callback","contract_id":"wheel_1590:10127191","skill_id":1585,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"skill_instance","trigger":{"event":"first_field_skill_update","once_flag":"wheel1590_Initial"}}},"wheel_1590:10127193":{"field":"1037420","battle_group_id":"103742","step":"10030127:2:3","asset":"mn2/quest_story_10127193","condition":{"kind":"verified_native_callback","contract_id":"wheel_1590:10127193","skill_id":1585,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"summon_wave","trigger":{"event":"field_skill_update","requires_initial_enemy_tid":2999,"requires_returned_buff":4005042,"death_camp":-1,"death_count":5,"death_operator":"==","summon_wave":1,"first_clock":"summon_time","first_operator":">","first_seconds":0.2,"gate_clock":"dialog_time","gate_operator":">","gate_seconds":1,"gate_clock_accumulates_only_at_exact_death_wave_gate":true,"requires_named_skill":"name_atk2","request_precedes_summon_attempts":true,"requires_summon_allocation":false}}},"wheel_1590:10127194":{"field":"1037420","battle_group_id":"103742","step":"10030127:2:3","asset":"mn2/quest_story_10127194","condition":{"kind":"verified_native_callback","contract_id":"wheel_1590:10127194","skill_id":1585,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"summon_wave","trigger":{"event":"field_skill_update","requires_initial_enemy_tid":2999,"requires_returned_buff":4005042,"death_camp":-1,"death_count":10,"death_operator":"==","summon_wave":2,"first_clock":"summon_time","first_operator":">","first_seconds":0.2,"gate_clock":"dialog_time","gate_operator":">","gate_seconds":1,"gate_clock_accumulates_only_at_exact_death_wave_gate":true,"requires_named_skill":"name_atk2","request_precedes_summon_attempts":true,"requires_summon_allocation":false}}},"wheel_1590:10127195":{"field":"1037420","battle_group_id":"103742","step":"10030127:2:3","asset":"mn2/quest_story_10127195","condition":{"kind":"verified_native_callback","contract_id":"wheel_1590:10127195","skill_id":1585,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"skill_instance","trigger":{"event":"field_skill_update","requires_initial_enemy_tid":2999,"requires_returned_buff":4005042,"death_camp":-1,"death_count":12,"death_operator":">=","once_flag":"setfleetime","before_flee_and_actor_hide":true}}},"wheel_1592:10127052":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127052","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127052","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"skill_instance","trigger":{"event":"first_field_skill_update","once_flag":"wheel1592_Initial"}}},"wheel_1592:10127053":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127053","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127053","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"none","trigger":{"event":"field_other_unit_die","dead_tid":101,"camp_filter":"none","repetition":"each_matching_death","evaluation":"after_underlying_handler"}}},"wheel_1592:10127055":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127055","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127055","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"none","trigger":{"event":"field_other_unit_die","dead_tid":17,"camp_filter":"none","repetition":"each_matching_death","evaluation":"after_underlying_handler"}}},"wheel_1592:10127056":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127056","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127056","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"none","trigger":{"event":"field_other_unit_die","dead_tid":16,"camp_filter":"none","repetition":"each_matching_death","evaluation":"after_underlying_handler"}}},"wheel_1592:10127057":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127057","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127057","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"none","trigger":{"event":"field_other_unit_die","dead_tid":26,"camp_filter":"none","repetition":"each_matching_death","evaluation":"after_underlying_handler"}}},"wheel_1592:10127054":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127054","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127054","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"target_instance","trigger":{"event":"field_skill_update","requires_initial_enemy_tid":3009,"hp_evaluation":"old_hp_before_underlying_setter","hp_fraction":0.5,"hp_operator":"<=","hp_substitution":"attribs.HP","arm_flag":"wheel1592_cansecondjump","once_flag":"wheel1592_secondjump","requires_buff_allocation":false,"requires_ally_target":false}}},"wheel_1592:10127058":{"field":"1037440","battle_group_id":"103744","step":"10030127:2:7","asset":"mn2/quest_story_10127058","condition":{"kind":"verified_native_callback","contract_id":"wheel_1592:10127058","skill_id":1587,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"skill_instance","trigger":{"event":"field_skill_update","death_counter":"wheel1592_deadnumber","death_count":4,"death_operator":"==","death_camp_filter":"none","clock_starts_after":"wheel1592_shield","counter":"wheel1592_time","operator":">=","seconds":3,"once_flag":"fleeplot_switch"}}},"configured-v24:1124460:15108540:15010108:5:11":{"field":"1124460","battle_group_id":"112446","step":"15010108:5:11","asset":"ep5/quest_story_15108540","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124460:15108540:15010108:5:11","skill_id":1410,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108540","source_conditions":"First eligible enemy of any ID is captured. OLD HP<=50% requests15108540 once before forwarding SetHp. Captured named ultimate CanCastWithCaster is disabled. Prepare add buffs the first alive enemy only, including summons; failed allocation consumes its latch."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1125440:15106940:15010106:6:9":{"field":"1125440","battle_group_id":"112544","step":"15010106:6:9","asset":"ep5/quest_story_15106940","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125440:15106940:15010106:6:9","skill_id":1411,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106940","source_conditions":"First Update requests15106940 once. Inclusive20 field seconds requests15106941 once, independently of boss presence. Only the FIRST eligible enemy3059 is captured for atk2 SArg1/2/3 overrides5/12/20."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1125440:15106941:15010106:6:9":{"field":"1125440","battle_group_id":"112544","step":"15010106:6:9","asset":"ep5/quest_story_15106941","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125440:15106941:15010106:6:9","skill_id":1411,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106941","source_conditions":"First Update requests15106940 once. Inclusive20 field seconds requests15106941 once, independently of boss presence. Only the FIRST eligible enemy3059 is captured for atk2 SArg1/2/3 overrides5/12/20."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1123470:15210400:15010230:4:5":{"field":"1123470","battle_group_id":"112347","step":"15010230:4:5","asset":"ep5/quest_story_15210400","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1123470:15210400:15010230:4:5","skill_id":1422,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15210400","source_conditions":"First Update requests15210400 once. Every different-camp death increments the field counter, without a common-unit filter. Inclusive5/10deaths request15210403/15210404 once."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1123470:15210403:15010230:4:5":{"field":"1123470","battle_group_id":"112347","step":"15010230:4:5","asset":"ep5/quest_story_15210403","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1123470:15210403:15010230:4:5","skill_id":1422,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15210403","source_conditions":"First Update requests15210400 once. Every different-camp death increments the field counter, without a common-unit filter. Inclusive5/10deaths request15210403/15210404 once."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1123470:15210404:15010230:4:5":{"field":"1123470","battle_group_id":"112347","step":"15010230:4:5","asset":"ep5/quest_story_15210404","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1123470:15210404:15010230:4:5","skill_id":1422,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15210404","source_conditions":"First Update requests15210400 once. Every different-camp death increments the field counter, without a common-unit filter. Inclusive5/10deaths request15210403/15210404 once."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1125420:15106540:15010106:4:5":{"field":"1125420","battle_group_id":"112542","step":"15010106:4:5","asset":"ep5/quest_story_15106540","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125420:15106540:15010106:4:5","skill_id":1436,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106540","source_conditions":"First Update requests15106540. Different-camp deaths3/6 arm four-summon attempts on subsequent Updates if initial enemy8006 was captured. Second attempted wave requests15106541 before allocation; failure does not undo attempt count. Nine deaths or inclusive50field seconds share the victory-request latch."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1125420:15106541:15010106:4:5":{"field":"1125420","battle_group_id":"112542","step":"15010106:4:5","asset":"ep5/quest_story_15106541","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125420:15106541:15010106:4:5","skill_id":1436,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106541","source_conditions":"First Update requests15106540. Different-camp deaths3/6 arm four-summon attempts on subsequent Updates if initial enemy8006 was captured. Second attempted wave requests15106541 before allocation; failure does not undo attempt count. Nine deaths or inclusive50field seconds share the victory-request latch."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1062460:11103151:11010103:3:3":{"field":"1062460","battle_group_id":"106246","step":"11010103:3:3","asset":"ep1/quest_story_11103151","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1062460:11103151:11010103:3:3","skill_id":1504,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11103151","source_conditions":"Initial ally53 requested HP<30% requests11103151 once and forces stun. Enemy9 requested HP floors at20%. Native stored suoen is overwritten by EVERY initial ally, outside the tid53 filter: end clock watches the LAST ally and requests victory strictly after6seconds only if that stored ally has the lowHP flag."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1050550:11224090:11010504:2:3":{"field":"1050550","battle_group_id":"105055","step":"11010504:2:3","asset":"ep1/quest_story_11224090","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1050550:11224090:11010504:2:3","skill_id":1506,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11224090","source_conditions":"Initial enemy3004 TakeDamage requests11224090 once when the nonnil incoming amount and source exist and source.tid==6002. It retires protection and effect before forwarding original damage. Wrong source is a negative control."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1136430:16111370:16010111:5:7":{"field":"1136430","battle_group_id":"113643","step":"16010111:5:7","asset":"ep6/quest_story_16111370","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136430:16111370:16010111:5:7","skill_id":1653,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111370","source_conditions":"Every initial enemy3065 gets OLD-HP wrappers: inclusive85% requests16111370 once; inclusive70% independently requests victory once. Both execute before forwarding the requested HP. Native ally2 can be attached to the returned4005218 buff."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1073420:11110220:11010110:3:2":{"field":"1073420","battle_group_id":"107342","step":"11010110:3:2","asset":"ep1/quest_story_11110220","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1073420:11110220:11010110:3:2","skill_id":1701,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11110220","source_conditions":"Opening11110220 on first Update. Six different-camp deaths arm plotcount; inclusive2seconds requests11110230, inclusive6seconds requests11110240 only with captured ally50 and fills1000MP/finisher state. Two deaths grant999MP. Capture and named manual-skill/camera changes are separate from plot delivery."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1073420:11110230:11010110:3:2":{"field":"1073420","battle_group_id":"107342","step":"11010110:3:2","asset":"ep1/quest_story_11110230","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1073420:11110230:11010110:3:2","skill_id":1701,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11110230","source_conditions":"Opening11110220 on first Update. Six different-camp deaths arm plotcount; inclusive2seconds requests11110230, inclusive6seconds requests11110240 only with captured ally50 and fills1000MP/finisher state. Two deaths grant999MP. Capture and named manual-skill/camera changes are separate from plot delivery."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1073420:11110240:11010110:3:2":{"field":"1073420","battle_group_id":"107342","step":"11010110:3:2","asset":"ep1/quest_story_11110240","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1073420:11110240:11010110:3:2","skill_id":1701,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11110240","source_conditions":"Opening11110220 on first Update. Six different-camp deaths arm plotcount; inclusive2seconds requests11110230, inclusive6seconds requests11110240 only with captured ally50 and fills1000MP/finisher state. Two deaths grant999MP. Capture and named manual-skill/camera changes are separate from plot delivery."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1074410:11111210:11010111:1:18":{"field":"1074410","battle_group_id":"107441","step":"11010111:1:18","asset":"ep1/quest_story_11111210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1074410:11111210:11010111:1:18","skill_id":1702,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11111210","source_conditions":"Opening11111210. Four different-camp deaths arm plotcount; strictly>1second plus captured enemy1306 requests11111220 and attempts four1301 summons. >3seconds is visual/buff only. Eight deaths arm lastboss; next Update plus enemy1306 requests11111221. Failed summon allocation does not suppress later source requests."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1074410:11111220:11010111:1:18":{"field":"1074410","battle_group_id":"107441","step":"11010111:1:18","asset":"ep1/quest_story_11111220","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1074410:11111220:11010111:1:18","skill_id":1702,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11111220","source_conditions":"Opening11111210. Four different-camp deaths arm plotcount; strictly>1second plus captured enemy1306 requests11111220 and attempts four1301 summons. >3seconds is visual/buff only. Eight deaths arm lastboss; next Update plus enemy1306 requests11111221. Failed summon allocation does not suppress later source requests."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1074410:11111221:11010111:1:18":{"field":"1074410","battle_group_id":"107441","step":"11010111:1:18","asset":"ep1/quest_story_11111221","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1074410:11111221:11010111:1:18","skill_id":1702,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11111221","source_conditions":"Opening11111210. Four different-camp deaths arm plotcount; strictly>1second plus captured enemy1306 requests11111220 and attempts four1301 summons. >3seconds is visual/buff only. Eight deaths arm lastboss; next Update plus enemy1306 requests11111221. Failed summon allocation does not suppress later source requests."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1075430:11112080:11010112:2:4":{"field":"1075430","battle_group_id":"107543","step":"11010112:2:4","asset":"ep1/quest_story_11112080","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1075430:11112080:11010112:2:4","skill_id":1706,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11112080","source_conditions":"Initial ally28 receives a SetHp wrapper. Requested HP<=70% is checked AFTER forwarding the base setter, requests11112080 once and arms a field clock. Strictly>2seconds requests victory once without waiting for dialogue completion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1078440:11115112:11010115:2:11":{"field":"1078440","battle_group_id":"107844","step":"11010115:2:11","asset":"ep1/quest_story_11115112","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078440:11115112:11010115:2:11","skill_id":1707,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115112","source_conditions":"Initial enemy3014 must expose literal ironmaiden_ult/atk2/atk4. Their first Start requests11115112/11115111/11115113 respectively AFTER forwarding Start. Latches belong to each skill, not a shared menu or elapsed battle time."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1078440:11115111:11010115:2:11":{"field":"1078440","battle_group_id":"107844","step":"11010115:2:11","asset":"ep1/quest_story_11115111","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078440:11115111:11010115:2:11","skill_id":1707,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115111","source_conditions":"Initial enemy3014 must expose literal ironmaiden_ult/atk2/atk4. Their first Start requests11115112/11115111/11115113 respectively AFTER forwarding Start. Latches belong to each skill, not a shared menu or elapsed battle time."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1078440:11115113:11010115:2:11":{"field":"1078440","battle_group_id":"107844","step":"11010115:2:11","asset":"ep1/quest_story_11115113","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078440:11115113:11010115:2:11","skill_id":1707,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115113","source_conditions":"Initial enemy3014 must expose literal ironmaiden_ult/atk2/atk4. Their first Start requests11115112/11115111/11115113 respectively AFTER forwarding Start. Latches belong to each skill, not a shared menu or elapsed battle time."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116420:14108333:14010108:2:18":{"field":"1116420","battle_group_id":"111642","step":"14010108:2:18","asset":"ep4/quest_story_14108333","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116420:14108333:14010108:2:18","skill_id":1811,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108333","source_conditions":"Initial enemy3001 requests14108333. Requested HP<50% may consume two healing admissions, even if4005073 allocation fails. Returned buff Update>0.5seconds heals10%HP, and requests14108336 once per owner. Requested fullHP retires healing. A third lowHP cycle is refused."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116420:14108336:14010108:2:18":{"field":"1116420","battle_group_id":"111642","step":"14010108:2:18","asset":"ep4/quest_story_14108336","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116420:14108336:14010108:2:18","skill_id":1811,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108336","source_conditions":"Initial enemy3001 requests14108333. Requested HP<50% may consume two healing admissions, even if4005073 allocation fails. Returned buff Update>0.5seconds heals10%HP, and requests14108336 once per owner. Requested fullHP retires healing. A third lowHP cycle is refused."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116430:14107250:14010107:2:3":{"field":"1116430","battle_group_id":"111643","step":"14010107:2:3","asset":"ep4/quest_story_14107250","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116430:14107250:14010107:2:3","skill_id":1812,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14107250","source_conditions":"First Update requests14107250. Captured enemy88 plus strictly>12seconds requests14107260 once and fillsMP; later12second cycles fillMP without repeating text. Initial ally87 requested HP<10% first clamps to10% and requests victory; the one-shot clamp does not apply to later setters."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116430:14107260:14010107:2:3":{"field":"1116430","battle_group_id":"111643","step":"14010107:2:3","asset":"ep4/quest_story_14107260","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116430:14107260:14010107:2:3","skill_id":1812,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14107260","source_conditions":"First Update requests14107250. Captured enemy88 plus strictly>12seconds requests14107260 once and fillsMP; later12second cycles fillMP without repeating text. Initial ally87 requested HP<10% first clamps to10% and requests victory; the one-shot clamp does not apply to later setters."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116460:14108182:14010108:1:18":{"field":"1116460","battle_group_id":"111646","step":"14010108:1:18","asset":"ep4/quest_story_14108182","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116460:14108182:14010108:1:18","skill_id":1814,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108182","source_conditions":"First Update requests14108182. Fifth common enemy death requests14108185 once; allied or non-common enemy deaths are excluded. Captured ally87 actions are forced to idle2. SkillID1814 names wheel_2005."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116460:14108185:14010108:1:18":{"field":"1116460","battle_group_id":"111646","step":"14010108:1:18","asset":"ep4/quest_story_14108185","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116460:14108185:14010108:1:18","skill_id":1814,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108185","source_conditions":"First Update requests14108182. Fifth common enemy death requests14108185 once; allied or non-common enemy deaths are excluded. Captured ally87 actions are forced to idle2. SkillID1814 names wheel_2005."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116470:14108190:14010108:1:21":{"field":"1116470","battle_group_id":"111647","step":"14010108:1:21","asset":"ep4/quest_story_14108190","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116470:14108190:14010108:1:21","skill_id":1816,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108190","source_conditions":"First Update requests14108190; strictly>10field seconds requests victory once. Initial ally87 actions are forced to idle2 only while ishealing is truthy. SkillID1816 names wheel_2007."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1112410:14103071:14010103:1:7":{"field":"1112410","battle_group_id":"111241","step":"14010103:1:7","asset":"ep4/quest_story_14103071","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1112410:14103071:14010103:1:7","skill_id":1817,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14103071","source_conditions":"Configured companion1827 requests14103070. Custom1817 captures matching ally87; strictly>10seconds and a captured ally requests14103071 once. Returned4005038 makes manual-skill damage100x and other numeric damage0.1x. Camera behavior is separate."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116440:14107320:14010107:2:6":{"field":"1116440","battle_group_id":"111644","step":"14010107:2:6","asset":"ep4/quest_story_14107320","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116440:14107320:14010107:2:6","skill_id":1818,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14107320","source_conditions":"After strictly>4seconds matching allies87 receive1000MP. After>7seconds14107320 is requested once without requiring a captured boss. After>10seconds first eligible enemy gets1000MP; after>20seconds victory is requested once."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116450:14107370:14010107:2:8":{"field":"1116450","battle_group_id":"111645","step":"14010107:2:8","asset":"ep4/quest_story_14107370","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116450:14107370:14010107:2:8","skill_id":1819,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14107370","source_conditions":"Opening14107370. Fifth enemy death requests14107371 without a common-unit filter. Initial enemy3048 requested HP<40% requests14107372 once before the setter. Named atk2 Start sets state without another plot. SkillID1819 names wheel_2010."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116450:14107372:14010107:2:8":{"field":"1116450","battle_group_id":"111645","step":"14010107:2:8","asset":"ep4/quest_story_14107372","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116450:14107372:14010107:2:8","skill_id":1819,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14107372","source_conditions":"Opening14107370. Fifth enemy death requests14107371 without a common-unit filter. Initial enemy3048 requested HP<40% requests14107372 once before the setter. Named atk2 Start sets state without another plot. SkillID1819 names wheel_2010."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116450:14107371:14010107:2:8":{"field":"1116450","battle_group_id":"111645","step":"14010107:2:8","asset":"ep4/quest_story_14107371","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116450:14107371:14010107:2:8","skill_id":1819,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14107371","source_conditions":"Opening14107370. Fifth enemy death requests14107371 without a common-unit filter. Initial enemy3048 requested HP<40% requests14107372 once before the setter. Named atk2 Start sets state without another plot. SkillID1819 names wheel_2010."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1112450:14103180:14010103:3:5":{"field":"1112450","battle_group_id":"111245","step":"14010103:3:5","asset":"ep4/quest_story_14103180","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1112450:14103180:14010103:3:5","skill_id":1820,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14103180","source_conditions":"First Update requests14103180 once, independent of unit presence. Each initial ally1591 may receive4005038 with ATK120% of current attack. SkillID1820 names wheel_2011."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116481:14108522:14010108:3:6":{"field":"1116481","battle_group_id":"111648","step":"14010108:3:6","asset":"ep4/quest_story_14108522","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116481:14108522:14010108:3:6","skill_id":1821,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108522","source_conditions":"Exact group sibling field1116481, not1116482, selects1821/wheel_2012 plus201/510. Opening14108522. Enemy3044 requested HP<90% arms atk4 and4005058; requested HP<70% requests14108523 and1000MP. atk4 Finish retires protection; first named ultimate Finish separately requests victory."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116481:14108523:14010108:3:6":{"field":"1116481","battle_group_id":"111648","step":"14010108:3:6","asset":"ep4/quest_story_14108523","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116481:14108523:14010108:3:6","skill_id":1821,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108523","source_conditions":"Exact group sibling field1116481, not1116482, selects1821/wheel_2012 plus201/510. Opening14108522. Enemy3044 requested HP<90% arms atk4 and4005058; requested HP<70% requests14108523 and1000MP. atk4 Finish retires protection; first named ultimate Finish separately requests victory."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116482:14108524:14010108:3:6":{"field":"1116482","battle_group_id":"111648","step":"14010108:3:6","asset":"ep4/quest_story_14108524","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116482:14108524:14010108:3:6","skill_id":1822,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108524","source_conditions":"Exact field1116482 selects1822/wheel_2013 plus201/511. Opening14108524. Enemy3044 and a captured first eligible ally permit87/90 summon attempts. Requested boss HP<25% requests14108540 once and arms4005034; allocated longbow gets1000MP next Update. Its manual hit only kills a target carrying4005034 and then requests victory. Summon HP floors at15%."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116482:14108540:14010108:3:6":{"field":"1116482","battle_group_id":"111648","step":"14010108:3:6","asset":"ep4/quest_story_14108540","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116482:14108540:14010108:3:6","skill_id":1822,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14108540","source_conditions":"Exact field1116482 selects1822/wheel_2013 plus201/511. Opening14108524. Enemy3044 and a captured first eligible ally permit87/90 summon attempts. Requested boss HP<25% requests14108540 once and arms4005034; allocated longbow gets1000MP next Update. Its manual hit only kills a target carrying4005034 and then requests victory. Summon HP floors at15%."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116501:14109070:14010109:2:3":{"field":"1116501","battle_group_id":"111650","step":"14010109:2:3","asset":"ep4/quest_story_14109070","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116501:14109070:14010109:2:3","skill_id":1823,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14109070","source_conditions":"Exact field1116501 selects1823/wheel_2014 plus201/510. Fifth common enemy death requests14109070 and arms protection retirement. Enemy3043 requested HP<75% grants1000MP; first named ultimate Finish requests14109071 and arms strictly>8second victory timer. Fifth common allied death separately requests victory."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116501:14109071:14010109:2:3":{"field":"1116501","battle_group_id":"111650","step":"14010109:2:3","asset":"ep4/quest_story_14109071","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116501:14109071:14010109:2:3","skill_id":1823,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14109071","source_conditions":"Exact field1116501 selects1823/wheel_2014 plus201/510. Fifth common enemy death requests14109070 and arms protection retirement. Enemy3043 requested HP<75% grants1000MP; first named ultimate Finish requests14109071 and arms strictly>8second victory timer. Fifth common allied death separately requests victory."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1116502:14109072:14010109:2:3":{"field":"1116502","battle_group_id":"111650","step":"14010109:2:3","asset":"ep4/quest_story_14109072","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116502:14109072:14010109:2:3","skill_id":1824,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14109072","source_conditions":"Exact field1116502 selects1824/wheel_2015 plus511. Strictly>10seconds requests14109072 once. Native capture is LAST matching ally87, not first; it gets1000MP after>15seconds. Its returned4005047 manual-hit wrapper kills the supplied target and requests victory. No counterpart plot14109070 is inferred from sibling proximity."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_callback_closure_20261021_v19/battle_research.json","source_report_sha256":"da924b18e238107c44eacbaf392d106aa3deee48504cd588288779f213c78ad2","live_inputs_bounded":false},"configured-v24:1064480:11106420:11010106:2:12":{"field":"1064480","battle_group_id":"106448","step":"11010106:2:12","asset":"ep1/quest_story_11106420","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064480:11106420:11010106:2:12","skill_id":1502,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106420","source_conditions":"Legend of Mars Peak, field1064480: exact initial nonsummoned enemy3020 permits opening11106420 and hero52/53 HP wrappers. Requested hero HP<50% on BOTH requests11106430 once. Both requested HP<30%, the prior paired50% phase, and strictly>5 skill seconds since that phase request victory once. Boss and hero setters clamp incoming HP to100; compare the requested argument before that clamp. Exact1000 bossMP arms the alternate ultimate and clears MP. Failed logic-buff allocation does not suppress the dialogue wrappers. Configured1502/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1064480:11106430:11010106:2:12":{"field":"1064480","battle_group_id":"106448","step":"11010106:2:12","asset":"ep1/quest_story_11106430","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064480:11106430:11010106:2:12","skill_id":1502,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106430","source_conditions":"Legend of Mars Peak, field1064480: exact initial nonsummoned enemy3020 permits opening11106420 and hero52/53 HP wrappers. Requested hero HP<50% on BOTH requests11106430 once. Both requested HP<30%, the prior paired50% phase, and strictly>5 skill seconds since that phase request victory once. Boss and hero setters clamp incoming HP to100; compare the requested argument before that clamp. Exact1000 bossMP arms the alternate ultimate and clears MP. Failed logic-buff allocation does not suppress the dialogue wrappers. Configured1502/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1064490:11106450:11010106:3:1":{"field":"1064490","battle_group_id":"106449","step":"11010106:3:1","asset":"ep1/quest_story_11106450","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064490:11106450:11010106:3:1","skill_id":1503,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106450","source_conditions":"Legend of Mars Peak, field1064490: initial nonsummoned hero52, hero53 AND boss3020 are all required for opening11106450 and callback installation. First alternate-ultimate Finish requests11106451 independently of its cast-admission predicate. Boss requested HP<30% requests11106470 once; requested HP<25% separately prepares hero53MP. Five basic-attack hits from a hero52/53 whose exact named ultimate Finish enabled enhancement consume boss anger and request11106460 once; wrong skills and unenhanced hits do not count. Source clamps heroHP to10% and heals both strictly after two seconds. No result request is present. Configured1503/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1064490:11106451:11010106:3:1":{"field":"1064490","battle_group_id":"106449","step":"11010106:3:1","asset":"ep1/quest_story_11106451","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064490:11106451:11010106:3:1","skill_id":1503,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106451","source_conditions":"Legend of Mars Peak, field1064490: initial nonsummoned hero52, hero53 AND boss3020 are all required for opening11106450 and callback installation. First alternate-ultimate Finish requests11106451 independently of its cast-admission predicate. Boss requested HP<30% requests11106470 once; requested HP<25% separately prepares hero53MP. Five basic-attack hits from a hero52/53 whose exact named ultimate Finish enabled enhancement consume boss anger and request11106460 once; wrong skills and unenhanced hits do not count. Source clamps heroHP to10% and heals both strictly after two seconds. No result request is present. Configured1503/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1064490:11106470:11010106:3:1":{"field":"1064490","battle_group_id":"106449","step":"11010106:3:1","asset":"ep1/quest_story_11106470","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064490:11106470:11010106:3:1","skill_id":1503,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106470","source_conditions":"Legend of Mars Peak, field1064490: initial nonsummoned hero52, hero53 AND boss3020 are all required for opening11106450 and callback installation. First alternate-ultimate Finish requests11106451 independently of its cast-admission predicate. Boss requested HP<30% requests11106470 once; requested HP<25% separately prepares hero53MP. Five basic-attack hits from a hero52/53 whose exact named ultimate Finish enabled enhancement consume boss anger and request11106460 once; wrong skills and unenhanced hits do not count. Source clamps heroHP to10% and heals both strictly after two seconds. No result request is present. Configured1503/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1064490:11106460:11010106:3:1":{"field":"1064490","battle_group_id":"106449","step":"11010106:3:1","asset":"ep1/quest_story_11106460","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064490:11106460:11010106:3:1","skill_id":1503,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106460","source_conditions":"Legend of Mars Peak, field1064490: initial nonsummoned hero52, hero53 AND boss3020 are all required for opening11106450 and callback installation. First alternate-ultimate Finish requests11106451 independently of its cast-admission predicate. Boss requested HP<30% requests11106470 once; requested HP<25% separately prepares hero53MP. Five basic-attack hits from a hero52/53 whose exact named ultimate Finish enabled enhancement consume boss anger and request11106460 once; wrong skills and unenhanced hits do not count. Source clamps heroHP to10% and heals both strictly after two seconds. No result request is present. Configured1503/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1062450:11103060:11010103:1:4":{"field":"1062450","battle_group_id":"106245","step":"11010103:1:4","asset":"ep1/quest_story_11103060","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1062450:11103060:11010103:1:4","skill_id":1505,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11103060","source_conditions":"Warrior's Resolve, field1062450: initial nonsummoned heroes52/53 are BOTH required. Each requested HP<50% sets its own phase flag before clamping HP to100. Either flagged hero requests11103060 once; both flags request11103070 and attempt ally9 even if allocation fails. Strictly>10 skill seconds sets both flags as a fallback, still requiring both heroes. Captured hero53's fifth camp-1 death callback requests11103071; this source does not filter summoned or common units. Returned ally9 receives1000MP and one camera admission. No result request is present. Configured1505/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1062450:11103070:11010103:1:4":{"field":"1062450","battle_group_id":"106245","step":"11010103:1:4","asset":"ep1/quest_story_11103070","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1062450:11103070:11010103:1:4","skill_id":1505,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11103070","source_conditions":"Warrior's Resolve, field1062450: initial nonsummoned heroes52/53 are BOTH required. Each requested HP<50% sets its own phase flag before clamping HP to100. Either flagged hero requests11103060 once; both flags request11103070 and attempt ally9 even if allocation fails. Strictly>10 skill seconds sets both flags as a fallback, still requiring both heroes. Captured hero53's fifth camp-1 death callback requests11103071; this source does not filter summoned or common units. Returned ally9 receives1000MP and one camera admission. No result request is present. Configured1505/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1062450:11103071:11010103:1:4":{"field":"1062450","battle_group_id":"106245","step":"11010103:1:4","asset":"ep1/quest_story_11103071","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1062450:11103071:11010103:1:4","skill_id":1505,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11103071","source_conditions":"Warrior's Resolve, field1062450: initial nonsummoned heroes52/53 are BOTH required. Each requested HP<50% sets its own phase flag before clamping HP to100. Either flagged hero requests11103060 once; both flags request11103070 and attempt ally9 even if allocation fails. Strictly>10 skill seconds sets both flags as a fallback, still requiring both heroes. Captured hero53's fifth camp-1 death callback requests11103071; this source does not filter summoned or common units. Returned ally9 receives1000MP and one camera admission. No result request is present. Configured1505/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1132470:16104305:16010104:6:8":{"field":"1132470","battle_group_id":"113247","step":"16010104:6:8","asset":"ep6/quest_story_16104305","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1132470:16104305:16010104:6:8","skill_id":1651,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16104305","source_conditions":"The Trials Begin!, field1132470: opening16104305 on first Update. Initial enemy1672 is captured by ForEachAliveUnit, including summoned units. OLD HP<=85%,<=60%,<=35% independently request16104306/07/08 once before forwarding SetHp; a requested crossing alone waits until a subsequent setter sees that OLD HP. Field Update grantsMP and attempts3-second shader/untarget buffs for teleport/fear phases. Failed buffs do not suppress the HP dialogue. Returned shader buff moves at inclusive1second; third-stage fear target remains a supplied formation boundary. No result is invented. Configured1651/1665/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1132470:16104306:16010104:6:8":{"field":"1132470","battle_group_id":"113247","step":"16010104:6:8","asset":"ep6/quest_story_16104306","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1132470:16104306:16010104:6:8","skill_id":1651,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16104306","source_conditions":"The Trials Begin!, field1132470: opening16104305 on first Update. Initial enemy1672 is captured by ForEachAliveUnit, including summoned units. OLD HP<=85%,<=60%,<=35% independently request16104306/07/08 once before forwarding SetHp; a requested crossing alone waits until a subsequent setter sees that OLD HP. Field Update grantsMP and attempts3-second shader/untarget buffs for teleport/fear phases. Failed buffs do not suppress the HP dialogue. Returned shader buff moves at inclusive1second; third-stage fear target remains a supplied formation boundary. No result is invented. Configured1651/1665/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1132470:16104307:16010104:6:8":{"field":"1132470","battle_group_id":"113247","step":"16010104:6:8","asset":"ep6/quest_story_16104307","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1132470:16104307:16010104:6:8","skill_id":1651,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16104307","source_conditions":"The Trials Begin!, field1132470: opening16104305 on first Update. Initial enemy1672 is captured by ForEachAliveUnit, including summoned units. OLD HP<=85%,<=60%,<=35% independently request16104306/07/08 once before forwarding SetHp; a requested crossing alone waits until a subsequent setter sees that OLD HP. Field Update grantsMP and attempts3-second shader/untarget buffs for teleport/fear phases. Failed buffs do not suppress the HP dialogue. Returned shader buff moves at inclusive1second; third-stage fear target remains a supplied formation boundary. No result is invented. Configured1651/1665/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1132470:16104308:16010104:6:8":{"field":"1132470","battle_group_id":"113247","step":"16010104:6:8","asset":"ep6/quest_story_16104308","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1132470:16104308:16010104:6:8","skill_id":1651,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16104308","source_conditions":"The Trials Begin!, field1132470: opening16104305 on first Update. Initial enemy1672 is captured by ForEachAliveUnit, including summoned units. OLD HP<=85%,<=60%,<=35% independently request16104306/07/08 once before forwarding SetHp; a requested crossing alone waits until a subsequent setter sees that OLD HP. Field Update grantsMP and attempts3-second shader/untarget buffs for teleport/fear phases. Failed buffs do not suppress the HP dialogue. Returned shader buff moves at inclusive1second; third-stage fear target remains a supplied formation boundary. No result is invented. Configured1651/1665/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1136460:16113291:16010112:8:6":{"field":"1136460","battle_group_id":"113646","step":"16010112:8:6","asset":"ep6/quest_story_16113291","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136460:16113291:16010112:8:6","skill_id":1672,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16113291","source_conditions":"Silent Drama, field1136460: initial enemy3064 is captured by ForEachAliveUnit, including summons. First valid basic/second attack effect requests16113291 BEFORE projectile allocation, so a nil projectile result does not suppress text. The native atk2 wrapper uses the already wrapped atk method, creating two projectile attempts; this is retained. Projectile hit grants10MP. Inclusive20 field seconds requests16113292 only with captured3064; inclusive30seconds requests16113293 independently; inclusive33seconds requests victory once. Result acceptance remains separate. Configured1672/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1136460:16113292:16010112:8:6":{"field":"1136460","battle_group_id":"113646","step":"16010112:8:6","asset":"ep6/quest_story_16113292","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136460:16113292:16010112:8:6","skill_id":1672,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16113292","source_conditions":"Silent Drama, field1136460: initial enemy3064 is captured by ForEachAliveUnit, including summons. First valid basic/second attack effect requests16113291 BEFORE projectile allocation, so a nil projectile result does not suppress text. The native atk2 wrapper uses the already wrapped atk method, creating two projectile attempts; this is retained. Projectile hit grants10MP. Inclusive20 field seconds requests16113292 only with captured3064; inclusive30seconds requests16113293 independently; inclusive33seconds requests victory once. Result acceptance remains separate. Configured1672/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1136460:16113293:16010112:8:6":{"field":"1136460","battle_group_id":"113646","step":"16010112:8:6","asset":"ep6/quest_story_16113293","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136460:16113293:16010112:8:6","skill_id":1672,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16113293","source_conditions":"Silent Drama, field1136460: initial enemy3064 is captured by ForEachAliveUnit, including summons. First valid basic/second attack effect requests16113291 BEFORE projectile allocation, so a nil projectile result does not suppress text. The native atk2 wrapper uses the already wrapped atk method, creating two projectile attempts; this is retained. Projectile hit grants10MP. Inclusive20 field seconds requests16113292 only with captured3064; inclusive30seconds requests16113293 independently; inclusive33seconds requests victory once. Result acceptance remains separate. Configured1672/201 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1081470:12105280:12010105:2:13":{"field":"1081470","battle_group_id":"108147","step":"12010105:2:13","asset":"ep2/quest_story_12105280","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1081470:12105280:12010105:2:13","skill_id":1801,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12105280","source_conditions":"Return to Rustport, field1081470: opening12105280 on first Update. Every different-camp death counts, without summoned/common-unit filters. Seventeenth death arms12105285 for the next Update independently of captured heroes. Deaths7/12/17 prepare captured hero66MP; twentieth disables hero67 camera. Enemy3023's SetHp checks OLD HP strictly<30% before forwarding; the next Update requests victory, repeatedly on further Updates because there is no once latch. Configured1801/1809 execute jointly; the source's repeated fifth/sixth MP flags are not silently repaired."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1081470:12105285:12010105:2:13":{"field":"1081470","battle_group_id":"108147","step":"12010105:2:13","asset":"ep2/quest_story_12105285","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1081470:12105285:12010105:2:13","skill_id":1801,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12105285","source_conditions":"Return to Rustport, field1081470: opening12105280 on first Update. Every different-camp death counts, without summoned/common-unit filters. Seventeenth death arms12105285 for the next Update independently of captured heroes. Deaths7/12/17 prepare captured hero66MP; twentieth disables hero67 camera. Enemy3023's SetHp checks OLD HP strictly<30% before forwarding; the next Update requests victory, repeatedly on further Updates because there is no once latch. Configured1801/1809 execute jointly; the source's repeated fifth/sixth MP flags are not silently repaired."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1093430:12111160:12010111:2:9":{"field":"1093430","battle_group_id":"109343","step":"12010111:2:9","asset":"ep2/quest_story_12111160","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1093430:12111160:12010111:2:9","skill_id":1802,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12111160","source_conditions":"Land of Riches, field1093430: initial nonsummoned captain69 receives incoming-HP wrappers. Requested HP<=60% sets firstult; requested HP<=40% requests12111160 and sets1000MP once. Inclusive1field second with a captured captain attempts four1410 summons. Exactly four different-camp SUMMONED deaths arm one second four-summon wave. Allocation failure does not prevent wave latches. No result request is present. Captain6901 buff rejection, manual-hit damage wrapper and death effect remain distinct callbacks. Configured1802/200 execute jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_combat_receivers_20261022_v21/battle_research.json","source_report_sha256":"34f121c32b6326f641e2546099ee117271a2ef57de468f8581545cb896c49d9d","live_inputs_bounded":false},"configured-v24:1126500:15110180:15010110:3:6":{"field":"1126500","battle_group_id":"112650","step":"15010110:3:6","asset":"ep5/quest_story_15110180","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126500:15110180:15010110:3:6","skill_id":1408,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110180","source_conditions":"Principles of Life,1126500: opening15110180. Initial alive tid102/3062/8007 are captured across camps, including summoned units. Lancer OLD HP<=60% arms first heal; Update drains boss30% at1s, allocates chain4005214 at1.5s and heals lancer50%/requests15110190 at3s. Seven seconds after first heal end, OLD HP<=50% permits second cycle15110200. OLD HP<=20% independently requests15110210 once. Rejected chain allocation triggers an original unguarded nil access; the failed path is recorded, not repaired. First different-camp death requests victory once, without common/summoned filters. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126500:15110190:15010110:3:6":{"field":"1126500","battle_group_id":"112650","step":"15010110:3:6","asset":"ep5/quest_story_15110190","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126500:15110190:15010110:3:6","skill_id":1408,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110190","source_conditions":"Principles of Life,1126500: opening15110180. Initial alive tid102/3062/8007 are captured across camps, including summoned units. Lancer OLD HP<=60% arms first heal; Update drains boss30% at1s, allocates chain4005214 at1.5s and heals lancer50%/requests15110190 at3s. Seven seconds after first heal end, OLD HP<=50% permits second cycle15110200. OLD HP<=20% independently requests15110210 once. Rejected chain allocation triggers an original unguarded nil access; the failed path is recorded, not repaired. First different-camp death requests victory once, without common/summoned filters. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126500:15110200:15010110:3:6":{"field":"1126500","battle_group_id":"112650","step":"15010110:3:6","asset":"ep5/quest_story_15110200","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126500:15110200:15010110:3:6","skill_id":1408,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110200","source_conditions":"Principles of Life,1126500: opening15110180. Initial alive tid102/3062/8007 are captured across camps, including summoned units. Lancer OLD HP<=60% arms first heal; Update drains boss30% at1s, allocates chain4005214 at1.5s and heals lancer50%/requests15110190 at3s. Seven seconds after first heal end, OLD HP<=50% permits second cycle15110200. OLD HP<=20% independently requests15110210 once. Rejected chain allocation triggers an original unguarded nil access; the failed path is recorded, not repaired. First different-camp death requests victory once, without common/summoned filters. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126500:15110210:15010110:3:6":{"field":"1126500","battle_group_id":"112650","step":"15010110:3:6","asset":"ep5/quest_story_15110210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126500:15110210:15010110:3:6","skill_id":1408,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110210","source_conditions":"Principles of Life,1126500: opening15110180. Initial alive tid102/3062/8007 are captured across camps, including summoned units. Lancer OLD HP<=60% arms first heal; Update drains boss30% at1s, allocates chain4005214 at1.5s and heals lancer50%/requests15110190 at3s. Seven seconds after first heal end, OLD HP<=50% permits second cycle15110200. OLD HP<=20% independently requests15110210 once. Rejected chain allocation triggers an original unguarded nil access; the failed path is recorded, not repaired. First different-camp death requests victory once, without common/summoned filters. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126510:15110240:15010110:3:7":{"field":"1126510","battle_group_id":"112651","step":"15010110:3:7","asset":"ep5/quest_story_15110240","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126510:15110240:15010110:3:7","skill_id":1409,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110240","source_conditions":"Principles of Life,1126510: opening15110240. Four different-camp deaths plus captured3062 request15110250. Boss resulting MP>=650 requests15110260;>=920 arms first ultimate phase. First exact named ultimate Finish followed by OLD HP strictly<45% arms recovery. Boss AND8007 are needed for half-second5% heal ticks until HP>80%,15110261 and450MP. Recovery plus atk4 Finish starts fresh ending:1s disables ultimate,8s15110270,11s victory once. Absent/wrong named ultimate and absent Merlin controls do not admit ending. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126510:15110250:15010110:3:7":{"field":"1126510","battle_group_id":"112651","step":"15010110:3:7","asset":"ep5/quest_story_15110250","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126510:15110250:15010110:3:7","skill_id":1409,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110250","source_conditions":"Principles of Life,1126510: opening15110240. Four different-camp deaths plus captured3062 request15110250. Boss resulting MP>=650 requests15110260;>=920 arms first ultimate phase. First exact named ultimate Finish followed by OLD HP strictly<45% arms recovery. Boss AND8007 are needed for half-second5% heal ticks until HP>80%,15110261 and450MP. Recovery plus atk4 Finish starts fresh ending:1s disables ultimate,8s15110270,11s victory once. Absent/wrong named ultimate and absent Merlin controls do not admit ending. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126510:15110260:15010110:3:7":{"field":"1126510","battle_group_id":"112651","step":"15010110:3:7","asset":"ep5/quest_story_15110260","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126510:15110260:15010110:3:7","skill_id":1409,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110260","source_conditions":"Principles of Life,1126510: opening15110240. Four different-camp deaths plus captured3062 request15110250. Boss resulting MP>=650 requests15110260;>=920 arms first ultimate phase. First exact named ultimate Finish followed by OLD HP strictly<45% arms recovery. Boss AND8007 are needed for half-second5% heal ticks until HP>80%,15110261 and450MP. Recovery plus atk4 Finish starts fresh ending:1s disables ultimate,8s15110270,11s victory once. Absent/wrong named ultimate and absent Merlin controls do not admit ending. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126510:15110261:15010110:3:7":{"field":"1126510","battle_group_id":"112651","step":"15010110:3:7","asset":"ep5/quest_story_15110261","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126510:15110261:15010110:3:7","skill_id":1409,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110261","source_conditions":"Principles of Life,1126510: opening15110240. Four different-camp deaths plus captured3062 request15110250. Boss resulting MP>=650 requests15110260;>=920 arms first ultimate phase. First exact named ultimate Finish followed by OLD HP strictly<45% arms recovery. Boss AND8007 are needed for half-second5% heal ticks until HP>80%,15110261 and450MP. Recovery plus atk4 Finish starts fresh ending:1s disables ultimate,8s15110270,11s victory once. Absent/wrong named ultimate and absent Merlin controls do not admit ending. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1126510:15110270:15010110:3:7":{"field":"1126510","battle_group_id":"112651","step":"15010110:3:7","asset":"ep5/quest_story_15110270","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1126510:15110270:15010110:3:7","skill_id":1409,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15110270","source_conditions":"Principles of Life,1126510: opening15110240. Four different-camp deaths plus captured3062 request15110250. Boss resulting MP>=650 requests15110260;>=920 arms first ultimate phase. First exact named ultimate Finish followed by OLD HP strictly<45% arms recovery. Boss AND8007 are needed for half-second5% heal ticks until HP>80%,15110261 and450MP. Recovery plus atk4 Finish starts fresh ending:1s disables ultimate,8s15110270,11s victory once. Absent/wrong named ultimate and absent Merlin controls do not admit ending. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106970:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106970","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106970:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106970","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106965:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106965","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106965:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106965","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106999:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106999","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106999:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106999","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106971:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106971","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106971:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106971","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106972:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106972","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106972:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106972","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106973:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106973","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106973:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106973","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106975:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106975","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106975:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106975","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1125450:15106974:15010106:6:10":{"field":"1125450","battle_group_id":"112545","step":"15010106:6:10","asset":"ep5/quest_story_15106974","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1125450:15106974:15010106:6:10","skill_id":1412,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106974","source_conditions":"Darkness Rekindled,1125450: first Update15106970. A separate PlayPrepareSkillEffect registers view-delay callbacks; actual delivery at1.5s requests15106965 independently of commander presence,2.5s casts the supplied commander skill if present. Exact initial nonsummoned3059 named ult Start supplies ultcount: first Start then Update15106999,2s support buffs,4s15106971; second Start15106972. Original harvestgod.atk2_Update supplies poison_phase4 at the overridden35s threshold, rather than an invented phase flag. Field time>=36 AND poison phase4 request15106973; fresh ending clock5s15106975,6s commander action/guards,7s boss20%HP drain+15106974,12s victory once. Companion201 executes jointly. View scheduling, event delivery and result acceptance remain explicit boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1064430:11105120:11010105:3:3":{"field":"1064430","battle_group_id":"106443","step":"11010105:3:3","asset":"ep1/quest_story_11105120","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064430:11105120:11010105:3:3","skill_id":1501,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11105120","source_conditions":"The Final Trial,1064430: opening11105120. Initial nonsummoned13 and1294 provide the hero and boss callbacks. Only damage from1294 with its exact manualSkill arms knock and11105130; wrong skill does not. Strictly>.25s enters hurt phase. Two support summon attempts52/53 lead to11105140 irrespective of allocation success. Recovery uses the native hurt/heal clocks (the summon frame advances hurt twice); completion requests11105150 and attempts three1299 spiders after>2s. Returned spider configuration is separate from attempts. No result request is present. Companion200 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1064430:11105130:11010105:3:3":{"field":"1064430","battle_group_id":"106443","step":"11010105:3:3","asset":"ep1/quest_story_11105130","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064430:11105130:11010105:3:3","skill_id":1501,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11105130","source_conditions":"The Final Trial,1064430: opening11105120. Initial nonsummoned13 and1294 provide the hero and boss callbacks. Only damage from1294 with its exact manualSkill arms knock and11105130; wrong skill does not. Strictly>.25s enters hurt phase. Two support summon attempts52/53 lead to11105140 irrespective of allocation success. Recovery uses the native hurt/heal clocks (the summon frame advances hurt twice); completion requests11105150 and attempts three1299 spiders after>2s. Returned spider configuration is separate from attempts. No result request is present. Companion200 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1064430:11105140:11010105:3:3":{"field":"1064430","battle_group_id":"106443","step":"11010105:3:3","asset":"ep1/quest_story_11105140","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064430:11105140:11010105:3:3","skill_id":1501,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11105140","source_conditions":"The Final Trial,1064430: opening11105120. Initial nonsummoned13 and1294 provide the hero and boss callbacks. Only damage from1294 with its exact manualSkill arms knock and11105130; wrong skill does not. Strictly>.25s enters hurt phase. Two support summon attempts52/53 lead to11105140 irrespective of allocation success. Recovery uses the native hurt/heal clocks (the summon frame advances hurt twice); completion requests11105150 and attempts three1299 spiders after>2s. Returned spider configuration is separate from attempts. No result request is present. Companion200 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1064430:11105150:11010105:3:3":{"field":"1064430","battle_group_id":"106443","step":"11010105:3:3","asset":"ep1/quest_story_11105150","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1064430:11105150:11010105:3:3","skill_id":1501,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11105150","source_conditions":"The Final Trial,1064430: opening11105120. Initial nonsummoned13 and1294 provide the hero and boss callbacks. Only damage from1294 with its exact manualSkill arms knock and11105130; wrong skill does not. Strictly>.25s enters hurt phase. Two support summon attempts52/53 lead to11105140 irrespective of allocation success. Recovery uses the native hurt/heal clocks (the summon frame advances hurt twice); completion requests11105150 and attempts three1299 spiders after>2s. Returned spider configuration is separate from attempts. No result request is present. Companion200 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1136420:16111360:16010111:5:6":{"field":"1136420","battle_group_id":"113642","step":"16010111:5:6","asset":"ep6/quest_story_16111360","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136420:16111360:16010111:5:6","skill_id":1652,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111360","source_conditions":"Starlit Verdict,1136420: opening16111360 and inclusive17s16111361. Initial nonsummoned2/111/113 and3065 supply individual callbacks. At22s all required subjects prepare Aila attack; exact boss hit AND returned4005216 support buff request16111362. Pipa manual Start after26s requests16111363; Xiu manual Start after30s requests16111364, with no independent once latch on those Start requests. Original wheelchair.Init_hero/atk3_Update supply mooncheck at overridden40s, so the field38s threshold alone does not admit16111365. End choreography43/44/46s is distinct;48s requests victory once even if heroes are absent. Commander and buff controls execute both success and missing paths. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1136420:16111361:16010111:5:6":{"field":"1136420","battle_group_id":"113642","step":"16010111:5:6","asset":"ep6/quest_story_16111361","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136420:16111361:16010111:5:6","skill_id":1652,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111361","source_conditions":"Starlit Verdict,1136420: opening16111360 and inclusive17s16111361. Initial nonsummoned2/111/113 and3065 supply individual callbacks. At22s all required subjects prepare Aila attack; exact boss hit AND returned4005216 support buff request16111362. Pipa manual Start after26s requests16111363; Xiu manual Start after30s requests16111364, with no independent once latch on those Start requests. Original wheelchair.Init_hero/atk3_Update supply mooncheck at overridden40s, so the field38s threshold alone does not admit16111365. End choreography43/44/46s is distinct;48s requests victory once even if heroes are absent. Commander and buff controls execute both success and missing paths. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1136420:16111362:16010111:5:6":{"field":"1136420","battle_group_id":"113642","step":"16010111:5:6","asset":"ep6/quest_story_16111362","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136420:16111362:16010111:5:6","skill_id":1652,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111362","source_conditions":"Starlit Verdict,1136420: opening16111360 and inclusive17s16111361. Initial nonsummoned2/111/113 and3065 supply individual callbacks. At22s all required subjects prepare Aila attack; exact boss hit AND returned4005216 support buff request16111362. Pipa manual Start after26s requests16111363; Xiu manual Start after30s requests16111364, with no independent once latch on those Start requests. Original wheelchair.Init_hero/atk3_Update supply mooncheck at overridden40s, so the field38s threshold alone does not admit16111365. End choreography43/44/46s is distinct;48s requests victory once even if heroes are absent. Commander and buff controls execute both success and missing paths. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1136420:16111363:16010111:5:6":{"field":"1136420","battle_group_id":"113642","step":"16010111:5:6","asset":"ep6/quest_story_16111363","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136420:16111363:16010111:5:6","skill_id":1652,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111363","source_conditions":"Starlit Verdict,1136420: opening16111360 and inclusive17s16111361. Initial nonsummoned2/111/113 and3065 supply individual callbacks. At22s all required subjects prepare Aila attack; exact boss hit AND returned4005216 support buff request16111362. Pipa manual Start after26s requests16111363; Xiu manual Start after30s requests16111364, with no independent once latch on those Start requests. Original wheelchair.Init_hero/atk3_Update supply mooncheck at overridden40s, so the field38s threshold alone does not admit16111365. End choreography43/44/46s is distinct;48s requests victory once even if heroes are absent. Commander and buff controls execute both success and missing paths. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1136420:16111364:16010111:5:6":{"field":"1136420","battle_group_id":"113642","step":"16010111:5:6","asset":"ep6/quest_story_16111364","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136420:16111364:16010111:5:6","skill_id":1652,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111364","source_conditions":"Starlit Verdict,1136420: opening16111360 and inclusive17s16111361. Initial nonsummoned2/111/113 and3065 supply individual callbacks. At22s all required subjects prepare Aila attack; exact boss hit AND returned4005216 support buff request16111362. Pipa manual Start after26s requests16111363; Xiu manual Start after30s requests16111364, with no independent once latch on those Start requests. Original wheelchair.Init_hero/atk3_Update supply mooncheck at overridden40s, so the field38s threshold alone does not admit16111365. End choreography43/44/46s is distinct;48s requests victory once even if heroes are absent. Commander and buff controls execute both success and missing paths. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1136420:16111365:16010111:5:6":{"field":"1136420","battle_group_id":"113642","step":"16010111:5:6","asset":"ep6/quest_story_16111365","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1136420:16111365:16010111:5:6","skill_id":1652,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16111365","source_conditions":"Starlit Verdict,1136420: opening16111360 and inclusive17s16111361. Initial nonsummoned2/111/113 and3065 supply individual callbacks. At22s all required subjects prepare Aila attack; exact boss hit AND returned4005216 support buff request16111362. Pipa manual Start after26s requests16111363; Xiu manual Start after30s requests16111364, with no independent once latch on those Start requests. Original wheelchair.Init_hero/atk3_Update supply mooncheck at overridden40s, so the field38s threshold alone does not admit16111365. End choreography43/44/46s is distinct;48s requests victory once even if heroes are absent. Commander and buff controls execute both success and missing paths. Companion201 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115210:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115210:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115210","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115212:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115212","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115212:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115212","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115211:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115211","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115211:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115211","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115213:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115213","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115213:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115213","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115214:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115214","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115214:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115214","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115215:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115215","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115215:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115215","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115216:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115216","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115216:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115216","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1078450:11115218:11010115:3:12":{"field":"1078450","battle_group_id":"107845","step":"11010115:3:12","asset":"ep1/quest_story_11115218","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1078450:11115218:11010115:3:12","skill_id":1705,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11115218","source_conditions":"Lord's Resting Place,1078450: opening11115210. Initial nonsummoned5013 incoming HP<=40% requests11115212 once. Four different-camp nonsummoned deaths arm relocation; strict>.375s reappearance and>1s11115211. Original boss Die requests11115213 and attempts four5013 replacements. Exact subsequent5013 death notifications advance phases; NextDie after the fifth count requests11115214; the eighth count enables the next Die to attempt final5013. Final returned boss incoming HP<=80% requests11115215 and starts ending:>5s11115216,>7s heroMP,>12s11115218,>23s victory once. Rejected summons cannot supply these later receivers. No configured companion."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1096450:12114312:12010114:5:5":{"field":"1096450","battle_group_id":"109645","step":"12010114:5:5","asset":"ep2/quest_story_12114312","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096450:12114312:12010114:5:5","skill_id":1803,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114312","source_conditions":"Immortal Showdown,1096450: joint configured1742/1803/1809, including battle_start_newdialogue. Initial nonsummoned69 and68 install captain/Nara callbacks; two1410 summon attempts are independent. Captain incoming HP strictly<40% requests12114312 once and clamps that first crossing to40%. Exact captain ultimate Finish, Nara atk2 Finish against prepared targets20/21, and strictly>5s waits govern the paired attacks and Sinbad action. Nara Die followed by>1s requests victory; an independent>60s safety clock also requests victory. Both repeat requests on later Updates because the source does not set its end latch. Neither proves accepted result, story continuation or retry. Wrong/absent named skills retain their distinct negative paths."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_final_custom_callbacks_20261022_v22/battle_research.json","source_report_sha256":"61678a1bf385d8628e72ad698ccf6e8910c00edf54a2f1b09ac56e14c42e5599","live_inputs_bounded":false},"configured-v24:1124440:15108340:15010108:4:3":{"field":"1124440","battle_group_id":"112444","step":"15010108:4:3","asset":"ep5/quest_story_15108340","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124440:15108340:15010108:4:3","skill_id":1406,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108340","source_conditions":"Original custom skill and201 execute jointly for the exact field/group/growth row. Empty self buffs,fieldSkillID0,final overrides{} are declared inputs, not a live capture. Both SetHp wrappers test OLD HP before forwarding the requested new HP. Equality is included.1406 requires first eligible allied hero102;1407 captures the first eligible hero without a tid filter. 1406:OLD HP<=60percent requests15108340 once;OLD HP<=25percent requestsDefeat once independently of dialogue completion.1407:OLD HP<=30percent requests15108390 once and begins20percent-per-second recovery. Its healtime counter is reset on every Update, so the apparent five-heal condition is not an effective cap. Both prepare wrappers add4005024 only to the FIRST alive unit per camp, including summoned units; failed buff allocation still consumes the latch. Roster construction, HP/damage allocation, buffs, actor effects, final client delivery and accepted result remain supplied boundaries. No live-input admission or quest/retry completion inferred."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_route_receivers_20261021_v18/wheel1406/battle_research.json","source_report_sha256":"69530a91a5f15a8ec0f959b845b455ef94aeda43b3553c6345adbbf91a2552fc","live_inputs_bounded":false},"configured-v24:1124450:15108390:15010108:4:6":{"field":"1124450","battle_group_id":"112445","step":"15010108:4:6","asset":"ep5/quest_story_15108390","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124450:15108390:15010108:4:6","skill_id":1407,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108390","source_conditions":"Original custom skill and201 execute jointly for the exact field/group/growth row. Empty self buffs,fieldSkillID0,final overrides{} are declared inputs, not a live capture. Both SetHp wrappers test OLD HP before forwarding the requested new HP. Equality is included.1406 requires first eligible allied hero102;1407 captures the first eligible hero without a tid filter. 1406:OLD HP<=60percent requests15108340 once;OLD HP<=25percent requestsDefeat once independently of dialogue completion.1407:OLD HP<=30percent requests15108390 once and begins20percent-per-second recovery. Its healtime counter is reset on every Update, so the apparent five-heal condition is not an effective cap. Both prepare wrappers add4005024 only to the FIRST alive unit per camp, including summoned units; failed buff allocation still consumes the latch. Roster construction, HP/damage allocation, buffs, actor effects, final client delivery and accepted result remain supplied boundaries. No live-input admission or quest/retry completion inferred."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_route_receivers_20261021_v18/wheel1407/battle_research.json","source_report_sha256":"99f0df38fa5d2e94840c48700f051d0a9cc071da0342faec919d563de401a4f7","live_inputs_bounded":false},"configured-v24:1123440:15104610:15010104:5:8":{"field":"1123440","battle_group_id":"112344","step":"15010104:5:8","asset":"ep5/quest_story_15104610","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1123440:15104610:15010104:5:8","skill_id":1403,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15104610","source_conditions":"Original field1123440/group112344 positive-growth selection and configured1403/201/1432 scripts execute jointly, including the exact native weather companion. Explicitly EMPTY self buffs, no extra field skill and no final overrides are supplied; this is not a captured live server input set. First field Update attaches the callback to an existing named ultimate on alive enemy1653, including summons. Setup and forty elapsed field seconds request no speech. The first matching ultimate Start forwards the original method, increments a per-caster counter, then clientCall requests15104610. Actor absence prevents its separate visual effect without suppressing dialogue. Later Start calls do not repeat either. Roster construction, native allocation/stats/interpolation, buff return, event delivery and final rendering are explicit adapters. Fresh engine instances reset the latch. Source requests do not prove accepted battle results, retry/story joins or completed quests."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_linked_reading_20261021_v14/battle_research.json","source_report_sha256":"4db5b005cacc4a946962bf286908429e530cf7adae09ed3bb7c90c4e4b48fbe0","live_inputs_bounded":false},"configured-v24:1116490:14109020:14010109:1:4":{"field":"1116490","battle_group_id":"111649","step":"14010109:1:4","asset":"ep4/quest_story_14109020","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116490:14109020:14010109:1:4","skill_id":1815,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14109020","source_conditions":"Original selected201/1815 default path executes jointly with actual growth24011 and native camp/hero iterators. Player roster, native HP/MP mutation, returned buff allocation/tick delivery and allowed additional buff/override inputs remain explicit boundaries. Opening Slim14109020 is independent of target presence and buff allocation, strictly after initial field time0.25. Second Slim14109030 requires captured nonsummoned enemy88, returned buff4005038, initialization strictly after five buff seconds, a wrapped named ultimate Finish and a later buff interval at least0.5; it is not a field timer request. Requested HP strictly below tenpercent requests victory separately. No accepted result, quest completion, retry join or universal positive-growth admission is inferred."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_petals_20261020_v5/wheel2006/battle_research.json","source_report_sha256":"5ed046d7e912a75618193331db2c1ab102c1aaa95ea7b89d51ce3d6e4017837a","live_inputs_bounded":false},"configured-v24:1116490:14109030:14010109:1:4":{"field":"1116490","battle_group_id":"111649","step":"14010109:1:4","asset":"ep4/quest_story_14109030","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1116490:14109030:14010109:1:4","skill_id":1815,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14109030","source_conditions":"Original selected201/1815 default path executes jointly with actual growth24011 and native camp/hero iterators. Player roster, native HP/MP mutation, returned buff allocation/tick delivery and allowed additional buff/override inputs remain explicit boundaries. Opening Slim14109020 is independent of target presence and buff allocation, strictly after initial field time0.25. Second Slim14109030 requires captured nonsummoned enemy88, returned buff4005038, initialization strictly after five buff seconds, a wrapped named ultimate Finish and a later buff interval at least0.5; it is not a field timer request. Requested HP strictly below tenpercent requests victory separately. No accepted result, quest completion, retry join or universal positive-growth admission is inferred."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_petals_20261020_v5/wheel2006/battle_research.json","source_report_sha256":"5ed046d7e912a75618193331db2c1ab102c1aaa95ea7b89d51ce3d6e4017837a","live_inputs_bounded":false},"configured-v24:1076430:11113160:11010113:1:15":{"field":"1076430","battle_group_id":"107643","step":"11010113:1:15","asset":"ep1/quest_story_11113160","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1076430:11113160:11010113:1:15","skill_id":1704,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11113160","source_conditions":"Evening Flute / field1076430: first Update11113160; first different-camp death arms a clock. Strictly>1second requests11113161 and attempts clones of eligible initial allies, excluding28/53. Fourth different-camp death requests11113162 immediately. Captured enemy1046 hides/reappears after a strict0.375second clock; no battle result is invented from that return. All configured1704/200 bodies run jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1076430:11113161:11010113:1:15":{"field":"1076430","battle_group_id":"107643","step":"11010113:1:15","asset":"ep1/quest_story_11113161","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1076430:11113161:11010113:1:15","skill_id":1704,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11113161","source_conditions":"Evening Flute / field1076430: first Update11113160; first different-camp death arms a clock. Strictly>1second requests11113161 and attempts clones of eligible initial allies, excluding28/53. Fourth different-camp death requests11113162 immediately. Captured enemy1046 hides/reappears after a strict0.375second clock; no battle result is invented from that return. All configured1704/200 bodies run jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1076430:11113162:11010113:1:15":{"field":"1076430","battle_group_id":"107643","step":"11010113:1:15","asset":"ep1/quest_story_11113162","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1076430:11113162:11010113:1:15","skill_id":1704,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11113162","source_conditions":"Evening Flute / field1076430: first Update11113160; first different-camp death arms a clock. Strictly>1second requests11113161 and attempts clones of eligible initial allies, excluding28/53. Fourth different-camp death requests11113162 immediately. Captured enemy1046 hides/reappears after a strict0.375second clock; no battle result is invented from that return. All configured1704/200 bodies run jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1096481:12114371:12010114:7:5":{"field":"1096481","battle_group_id":"109648","step":"12010114:7:5","asset":"ep2/quest_story_12114371","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096481:12114371:12010114:7:5","skill_id":1807,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114371","source_conditions":"Immortal Showdown / exact sibling field1096481: opening12114371; captured initial enemy3024 permits two1410andone69summon attempts. Only a returned captain69 receives first named ultimate Start12114373 and first Die12114374 callbacks. First death changes krakenMarkType to2 on the next Update. Strictly>5post-death seconds requestsVictory; this source branch has NO once latch and repeats if Update continues. Selected companions510/1809 execute jointly; accepted result and next encounter are separate boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1096481:12114373:12010114:7:5":{"field":"1096481","battle_group_id":"109648","step":"12010114:7:5","asset":"ep2/quest_story_12114373","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096481:12114373:12010114:7:5","skill_id":1807,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114373","source_conditions":"Immortal Showdown / exact sibling field1096481: opening12114371; captured initial enemy3024 permits two1410andone69summon attempts. Only a returned captain69 receives first named ultimate Start12114373 and first Die12114374 callbacks. First death changes krakenMarkType to2 on the next Update. Strictly>5post-death seconds requestsVictory; this source branch has NO once latch and repeats if Update continues. Selected companions510/1809 execute jointly; accepted result and next encounter are separate boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1096481:12114374:12010114:7:5":{"field":"1096481","battle_group_id":"109648","step":"12010114:7:5","asset":"ep2/quest_story_12114374","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096481:12114374:12010114:7:5","skill_id":1807,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114374","source_conditions":"Immortal Showdown / exact sibling field1096481: opening12114371; captured initial enemy3024 permits two1410andone69summon attempts. Only a returned captain69 receives first named ultimate Start12114373 and first Die12114374 callbacks. First death changes krakenMarkType to2 on the next Update. Strictly>5post-death seconds requestsVictory; this source branch has NO once latch and repeats if Update continues. Selected companions510/1809 execute jointly; accepted result and next encounter are separate boundaries."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1096482:12114375:12010114:7:5":{"field":"1096482","battle_group_id":"109648","step":"12010114:7:5","asset":"ep2/quest_story_12114375","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096482:12114375:12010114:7:5","skill_id":1808,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114375","source_conditions":"Immortal Showdown / exact sibling field1096482: opening12114375; captured initial3024 permits two1450summons and allies66/65. Its first Die requests12114376 and attempts captain69 even when allocation will fail. Strictly>3post-death seconds requests12114377 once; strictly>6seconds requestsVictory once. Plot12114377 resolves exactly to an ep3 resource despite this being a season2 encounter; no namespace-proximity inference. Selected511 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1096482:12114376:12010114:7:5":{"field":"1096482","battle_group_id":"109648","step":"12010114:7:5","asset":"ep2/quest_story_12114376","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096482:12114376:12010114:7:5","skill_id":1808,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114376","source_conditions":"Immortal Showdown / exact sibling field1096482: opening12114375; captured initial3024 permits two1450summons and allies66/65. Its first Die requests12114376 and attempts captain69 even when allocation will fail. Strictly>3post-death seconds requests12114377 once; strictly>6seconds requestsVictory once. Plot12114377 resolves exactly to an ep3 resource despite this being a season2 encounter; no namespace-proximity inference. Selected511 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1096482:12114377:12010114:7:5":{"field":"1096482","battle_group_id":"109648","step":"12010114:7:5","asset":"ep3/quest_story_12114377","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1096482:12114377:12010114:7:5","skill_id":1808,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12114377","source_conditions":"Immortal Showdown / exact sibling field1096482: opening12114375; captured initial3024 permits two1450summons and allies66/65. Its first Die requests12114376 and attempts captain69 even when allocation will fail. Strictly>3post-death seconds requests12114377 once; strictly>6seconds requestsVictory once. Plot12114377 resolves exactly to an ep3 resource despite this being a season2 encounter; no namespace-proximity inference. Selected511 executes jointly."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1114410:14106080:14010106:1:7":{"field":"1114410","battle_group_id":"111441","step":"14010106:1:7","asset":"ep4/quest_story_14106080","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1114410:14106080:14010106:1:7","skill_id":1810,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14106080","source_conditions":"The Price of Truth / field1114410: selectedSkill1810names wheel_2001, not wheel_1810. Companions201/1944 run jointly. Opening14106080; strictly>10field seconds14106081; strictly>15seconds requires enemy87 and first eligible ally to attempt allied87 summon. Only successful return requests14106090 and receives800MP/manual finisher. Manual TakeEffectOn kills the supplied target and requestsVictory; strictly>24seconds independently requestsVictory once. Higher-priority1944 targets enemy88: a rejected4005037buff causes the ORIGINAL missing-nil-guard error before custom opening. This negative control is preserved, not repaired in the game script."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1114410:14106081:14010106:1:7":{"field":"1114410","battle_group_id":"111441","step":"14010106:1:7","asset":"ep4/quest_story_14106081","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1114410:14106081:14010106:1:7","skill_id":1810,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14106081","source_conditions":"The Price of Truth / field1114410: selectedSkill1810names wheel_2001, not wheel_1810. Companions201/1944 run jointly. Opening14106080; strictly>10field seconds14106081; strictly>15seconds requires enemy87 and first eligible ally to attempt allied87 summon. Only successful return requests14106090 and receives800MP/manual finisher. Manual TakeEffectOn kills the supplied target and requestsVictory; strictly>24seconds independently requestsVictory once. Higher-priority1944 targets enemy88: a rejected4005037buff causes the ORIGINAL missing-nil-guard error before custom opening. This negative control is preserved, not repaired in the game script."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1114410:14106090:14010106:1:7":{"field":"1114410","battle_group_id":"111441","step":"14010106:1:7","asset":"ep4/quest_story_14106090","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1114410:14106090:14010106:1:7","skill_id":1810,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14106090","source_conditions":"The Price of Truth / field1114410: selectedSkill1810names wheel_2001, not wheel_1810. Companions201/1944 run jointly. Opening14106080; strictly>10field seconds14106081; strictly>15seconds requires enemy87 and first eligible ally to attempt allied87 summon. Only successful return requests14106090 and receives800MP/manual finisher. Manual TakeEffectOn kills the supplied target and requestsVictory; strictly>24seconds independently requestsVictory once. Higher-priority1944 targets enemy88: a rejected4005037buff causes the ORIGINAL missing-nil-guard error before custom opening. This negative control is preserved, not repaired in the game script."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_portrait_boss_followup_20261021_v20/battle_research.json","source_report_sha256":"173a212976078a3f14570c7143fc6e80c65210dd0788bd1f8259eb33e2720563","live_inputs_bounded":false},"configured-v24:1122430:15103310:15010103:4:4":{"field":"1122430","battle_group_id":"112243","step":"15010103:4:4","asset":"ep5/quest_story_15103310","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1122430:15103310:15010103:4:4","skill_id":1402,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15103310","source_conditions":"The original engine field constructor, effectNPC selection, Unit/Skill init/update order and both configured1402/201 scripts execute together. GrowthID21011 and current growth row29111 are supplied exactly. This probe supplies EMPTY self buffs, no extra field skill and no final engine overrides. It proves this explicit default input only; allowed server/replay/extra-buff inputs remain unknown. No new reader admission is claimed. First field Update requests15103310 once, independent of boss/ultimate/actor availability. The same update scans all alive enemy units, including summoned1651, and wraps an existing name_ult Start. First wrapped Start forwards its original call, increments its caster counter and requests only an actor effect if the actor exists. Later starts and elapsed time request no extra dialogue or battle result. Roster construction, allocation, interpolation, stats, buff return, Start-event delivery, actor rendering and final popup display remain explicit adapters. Fresh instances reset the tested latch. No victory, retry join or completed quest is inferred."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_reading_context_20261021_v13/battle_research.json","source_report_sha256":"0e9161e1fba2392aed6d55dc9f4ad8de80b0b2bcc2ea3286ca23aaf64fa3f529","live_inputs_bounded":false},"configured-v24:1124470:15108730:15010108:6:6":{"field":"1124470","battle_group_id":"112447","step":"15010108:6:6","asset":"ep5/quest_story_15108730","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124470:15108730:15010108:6:6","skill_id":1405,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108730","source_conditions":"Original1405/201 execute together for the exact field/group/growth row. Empty self buffs,fieldSkillID0,final overrides{} are declared inputs, not a live capture. First update15108730; cumulative12seconds15108731. FIRST eligible enemy is retained even when not3052; initial400MP and ultb wrapper require3052; timed200MP/storysign do not. Only the first wrapped3052 ultb Start sets ultcheck, teleports to hex(-8,-9),requests4005211 and forwards its original Start. End timer freezes at1.25,requests15108732 at1.5,unfreezes and requestsVictory at3.5. Dialogue completion does not gate those timers. Allied102 damage against3052 becomes1; incoming critical flag retained. Buff acceptance, roster/skill availability, HP/MP/stat mutation, field time updates, native result delivery and popup rendering remain declared boundaries. No new reader admission, server completion or receiving quest/retry join inferred. Live-input admission remains held."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_subtitle_followup_20261021_v17/battle_research.json","source_report_sha256":"97449d7651b425fbbfb399a938a936c4afa60b48eb62ec603acfeb7ac83d0b68","live_inputs_bounded":false},"configured-v24:1124470:15108731:15010108:6:6":{"field":"1124470","battle_group_id":"112447","step":"15010108:6:6","asset":"ep5/quest_story_15108731","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124470:15108731:15010108:6:6","skill_id":1405,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108731","source_conditions":"Original1405/201 execute together for the exact field/group/growth row. Empty self buffs,fieldSkillID0,final overrides{} are declared inputs, not a live capture. First update15108730; cumulative12seconds15108731. FIRST eligible enemy is retained even when not3052; initial400MP and ultb wrapper require3052; timed200MP/storysign do not. Only the first wrapped3052 ultb Start sets ultcheck, teleports to hex(-8,-9),requests4005211 and forwards its original Start. End timer freezes at1.25,requests15108732 at1.5,unfreezes and requestsVictory at3.5. Dialogue completion does not gate those timers. Allied102 damage against3052 becomes1; incoming critical flag retained. Buff acceptance, roster/skill availability, HP/MP/stat mutation, field time updates, native result delivery and popup rendering remain declared boundaries. No new reader admission, server completion or receiving quest/retry join inferred. Live-input admission remains held."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_subtitle_followup_20261021_v17/battle_research.json","source_report_sha256":"97449d7651b425fbbfb399a938a936c4afa60b48eb62ec603acfeb7ac83d0b68","live_inputs_bounded":false},"configured-v24:1124470:15108732:15010108:6:6":{"field":"1124470","battle_group_id":"112447","step":"15010108:6:6","asset":"ep5/quest_story_15108732","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124470:15108732:15010108:6:6","skill_id":1405,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108732","source_conditions":"Original1405/201 execute together for the exact field/group/growth row. Empty self buffs,fieldSkillID0,final overrides{} are declared inputs, not a live capture. First update15108730; cumulative12seconds15108731. FIRST eligible enemy is retained even when not3052; initial400MP and ultb wrapper require3052; timed200MP/storysign do not. Only the first wrapped3052 ultb Start sets ultcheck, teleports to hex(-8,-9),requests4005211 and forwards its original Start. End timer freezes at1.25,requests15108732 at1.5,unfreezes and requestsVictory at3.5. Dialogue completion does not gate those timers. Allied102 damage against3052 becomes1; incoming critical flag retained. Buff acceptance, roster/skill availability, HP/MP/stat mutation, field time updates, native result delivery and popup rendering remain declared boundaries. No new reader admission, server completion or receiving quest/retry join inferred. Live-input admission remains held."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_subtitle_followup_20261021_v17/battle_research.json","source_report_sha256":"97449d7651b425fbbfb399a938a936c4afa60b48eb62ec603acfeb7ac83d0b68","live_inputs_bounded":false},"configured-v24:1124430:15107490:15010107:4:2":{"field":"1124430","battle_group_id":"112443","step":"15010107:4:2","asset":"ep5/quest_story_15107490","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124430:15107490:15010107:4:2","skill_id":1404,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15107490","source_conditions":"Original engine/effectNPC/Unit/Skill execute configured1404/201 jointly for field1124430/group112443/GrowthID23011, with declared empty self buffs, fieldSkillID0 and final overrides{}. These are not captured live inputs. First update requests15107490 once. Only the first eligible enemy hero is examined for3052; there is no scan for a later matching boss. At cumulative15seconds, if the captured boss exists,15107500 is sent once to the current-package original BattlePlotManager with exact authored camera data. It reaches original PlotController only after the camera-ready callback. Ending the dialogue invokes the native completion closure. The same timed event marks the boss needkill, readies its existing named ultimate and gives1000MP. Wrapped allied critical-damage calculation adds ten times attacker maxHP only against3052 after that flag, returning the incoming critical flag alongside the modified original damage result. Camera allocation/readiness delivery, display showtime activation, final camera teardown and final popup rendering are declared adapters. The real StartOnePlot/TryStartCamera/completion closure and separate popup arbitration execute; rendering time is not inferred. Missing bosses, absent or mismatched ultimate names, summons, queued delivery and fresh retry instances are exercised. No battle result, retry/story completion or new reader admission is inferred; live-input admission remains held."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_subtitle_portraits_20261021_v15/battle_research.json","source_report_sha256":"a2d852568a77dfb146b4f1ebeb46dfb60d0169b1254c70a9390d2fdd4b46ed48","live_inputs_bounded":false},"configured-v24:1124430:15107500:15010107:4:2":{"field":"1124430","battle_group_id":"112443","step":"15010107:4:2","asset":"ep5/quest_story_15107500","condition":{"kind":"verified_configured_callback","contract_id":"configured-v24:1124430:15107500:15010107:4:2","skill_id":1404,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15107500","source_conditions":"Original engine/effectNPC/Unit/Skill execute configured1404/201 jointly for field1124430/group112443/GrowthID23011, with declared empty self buffs, fieldSkillID0 and final overrides{}. These are not captured live inputs. First update requests15107490 once. Only the first eligible enemy hero is examined for3052; there is no scan for a later matching boss. At cumulative15seconds, if the captured boss exists,15107500 is sent once to the current-package original BattlePlotManager with exact authored camera data. It reaches original PlotController only after the camera-ready callback. Ending the dialogue invokes the native completion closure. The same timed event marks the boss needkill, readies its existing named ultimate and gives1000MP. Wrapped allied critical-damage calculation adds ten times attacker maxHP only against3052 after that flag, returning the incoming critical flag alongside the modified original damage result. Camera allocation/readiness delivery, display showtime activation, final camera teardown and final popup rendering are declared adapters. The real StartOnePlot/TryStartCamera/completion closure and separate popup arbitration execute; rendering time is not inferred. Missing bosses, absent or mismatched ultimate names, summons, queued delivery and fresh retry instances are exercised. No battle result, retry/story completion or new reader admission is inferred; live-input admission remains held."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_subtitle_portraits_20261021_v15/battle_research.json","source_report_sha256":"a2d852568a77dfb146b4f1ebeb46dfb60d0169b1254c70a9390d2fdd4b46ed48","live_inputs_bounded":false},"configured-v25:1061420:11101200:11010101:4:4":{"field":"1061420","battle_group_id":"106142","step":"11010101:4:4","asset":"ep1/quest_story_11101200","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1061420:11101200:11010101:4:4","skill_id":1610,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11101200","source_conditions":"Original selected skill1610; first matching initial nonsummoned enemy tid53, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.6. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1062440:11102270:11010102:3:9":{"field":"1062440","battle_group_id":"106244","step":"11010102:3:9","asset":"ep1/quest_story_11102270","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1062440:11102270:11010102:3:9","skill_id":1612,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11102270","source_conditions":"Original selected skill1612; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count5 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 15 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1063440:11104210:11010104:3:8":{"field":"1063440","battle_group_id":"106344","step":"11010104:3:8","asset":"ep1/quest_story_11104210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1063440:11104210:11010104:3:8","skill_id":1615,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11104210","source_conditions":"Original selected skill1615; first matching initial nonsummoned enemy tid23, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.2. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1064410:11104310:11010104:4:6":{"field":"1064410","battle_group_id":"106441","step":"11010104:4:6","asset":"ep1/quest_story_11104310","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1064410:11104310:11010104:4:6","skill_id":1618,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11104310","source_conditions":"Original selected skill1618; first matching initial nonsummoned enemy tid14, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.4. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1064440:11106090:11010106:1:7":{"field":"1064440","battle_group_id":"106444","step":"11010106:1:7","asset":"ep1/quest_story_11106090","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1064440:11106090:11010106:1:7","skill_id":1621,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106090","source_conditions":"Original selected skill1621; first matching initial nonsummoned enemy tid11, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.4. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1064450:11106140:11010106:1:9":{"field":"1064450","battle_group_id":"106445","step":"11010106:1:9","asset":"ep1/quest_story_11106140","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1064450:11106140:11010106:1:9","skill_id":1625,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106140","source_conditions":"Original selected skill1625; first matching initial nonsummoned enemy tid33, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.2. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1064460:11106180:11010106:1:10":{"field":"1064460","battle_group_id":"106446","step":"11010106:1:10","asset":"ep1/quest_story_11106180","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1064460:11106180:11010106:1:10","skill_id":1629,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106180","source_conditions":"Original selected skill1629; first matching initial nonsummoned enemy tid3020, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.2. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1064470:11106240:11010106:1:13":{"field":"1064470","battle_group_id":"106447","step":"11010106:1:13","asset":"ep1/quest_story_11106240","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1064470:11106240:11010106:1:13","skill_id":1632,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11106240","source_conditions":"Original selected skill1632; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count3 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1072420:11109210:11010109:2:10":{"field":"1072420","battle_group_id":"107242","step":"11010109:2:10","asset":"ep1/quest_story_11109210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1072420:11109210:11010109:2:10","skill_id":1710,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11109210","source_conditions":"Original selected skill1710; first matching initial nonsummoned enemy tid12, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.4. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1074450:11111170:11010111:1:16":{"field":"1074450","battle_group_id":"107445","step":"11010111:1:16","asset":"ep1/quest_story_11111170","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1074450:11111170:11010111:1:16","skill_id":1712,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11111170","source_conditions":"Original selected skill1712; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count5 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 10 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1050310:11234040:11010524:1:2":{"field":"1050310","battle_group_id":"105031","step":"11010524:1:2","asset":"ep1/quest_story_11234040","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1050310:11234040:11010524:1:2","skill_id":1634,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"11234040","source_conditions":"Original selected skill1634; first matching initial nonsummoned enemy tid1340, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.5. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1081420:12103030:12010103:1:2":{"field":"1081420","battle_group_id":"108142","step":"12010103:1:2","asset":"ep2/quest_story_12103030","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1081420:12103030:12010103:1:2","skill_id":1746,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12103030","source_conditions":"Original selected skill1746; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count3 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1083410:12104210:12010104:2:15":{"field":"1083410","battle_group_id":"108341","step":"12010104:2:15","asset":"ep2/quest_story_12104210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1083410:12104210:12010104:2:15","skill_id":1731,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12104210","source_conditions":"Original selected skill1731; first matching initial nonsummoned enemy tid67, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.4. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1085440:12107320:12010107:502:8":{"field":"1085440","battle_group_id":"108544","step":"12010107:502:8","asset":"ep2/quest_story_12107320","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1085440:12107320:12010107:502:8","skill_id":1737,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12107320","source_conditions":"Original selected skill1737; first matching initial nonsummoned enemy tid3023, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.4. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1095410:12113210:12010113:2:5":{"field":"1095410","battle_group_id":"109541","step":"12010113:2:5","asset":"ep2/quest_story_12113210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1095410:12113210:12010113:2:5","skill_id":1740,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12113210","source_conditions":"Original selected skill1740; first matching initial nonsummoned enemy tid70, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.2. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1094430:12201160:12010201:2:5":{"field":"1094430","battle_group_id":"109443","step":"12010201:2:5","asset":"ep2/quest_story_12201160","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1094430:12201160:12010201:2:5","skill_id":1762,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12201160","source_conditions":"Original selected skill1762; first matching initial nonsummoned enemy tid1430, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.3. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1096490:12202520:12010202:2:4":{"field":"1096490","battle_group_id":"109649","step":"12010202:2:4","asset":"ep2/quest_story_12202520","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1096490:12202520:12010202:2:4","skill_id":1763,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12202520","source_conditions":"Original selected skill1763; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count2 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 10 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1096550:12202450:12010202:7:5":{"field":"1096550","battle_group_id":"109655","step":"12010202:7:5","asset":"ep2/quest_story_12202450","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1096550:12202450:12010202:7:5","skill_id":1765,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12202450","source_conditions":"Original selected skill1765; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count2 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1083480:12203410:12010203:6:9":{"field":"1083480","battle_group_id":"108348","step":"12010203:6:9","asset":"ep2/quest_story_12203410","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1083480:12203410:12010203:6:9","skill_id":1751,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12203410","source_conditions":"Original selected skill1751; first matching initial nonsummoned enemy tid1383, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.6. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1083440:12203450:12010203:7:2":{"field":"1083440","battle_group_id":"108344","step":"12010203:7:2","asset":"ep2/quest_story_12203450","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1083440:12203450:12010203:7:2","skill_id":1748,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12203450","source_conditions":"Original selected skill1748; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count1 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 3 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1083450:12203460:12010203:7:3":{"field":"1083450","battle_group_id":"108345","step":"12010203:7:3","asset":"ep2/quest_story_12203460","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1083450:12203460:12010203:7:3","skill_id":1749,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12203460","source_conditions":"Original selected skill1749; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count2 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1083580:12203510:12010203:7:7":{"field":"1083580","battle_group_id":"108358","step":"12010203:7:7","asset":"ep2/quest_story_12203510","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1083580:12203510:12010203:7:7","skill_id":1767,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12203510","source_conditions":"Original selected skill1767; first matching initial nonsummoned enemy tid1544, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.3. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1084470:12206050:12010206:1:4":{"field":"1084470","battle_group_id":"108447","step":"12010206:1:4","asset":"ep2/quest_story_12206050","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1084470:12206050:12010206:1:4","skill_id":1756,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12206050","source_conditions":"Original selected skill1756; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count2 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1081580:12212090:12010212:2:4":{"field":"1081580","battle_group_id":"108158","step":"12010212:2:4","asset":"ep2/quest_story_12212090","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1081580:12212090:12010212:2:4","skill_id":1766,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12212090","source_conditions":"Original selected skill1766; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count2 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1081560:12214060:12010214:2:1":{"field":"1081560","battle_group_id":"108156","step":"12010214:2:1","asset":"ep2/quest_story_12214060","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1081560:12214060:12010214:2:1","skill_id":1760,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12214060","source_conditions":"Original selected skill1760; first matching initial nonsummoned enemy tid1004, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.6. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1081570:12214150:12010214:2:6":{"field":"1081570","battle_group_id":"108157","step":"12010214:2:6","asset":"ep2/quest_story_12214150","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1081570:12214150:12010214:2:6","skill_id":1761,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12214150","source_conditions":"Original selected skill1761; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count1 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 3 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1095450:12215130:12010215:2:4":{"field":"1095450","battle_group_id":"109545","step":"12010215:2:4","asset":"ep2/quest_story_12215130","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1095450:12215130:12010215:2:4","skill_id":1754,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"12215130","source_conditions":"Original selected skill1754; first matching initial nonsummoned enemy tid1430, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.6. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1113430:14105060:14010105:1:7":{"field":"1113430","battle_group_id":"111343","step":"14010105:1:7","asset":"ep4/quest_story_14105060","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1113430:14105060:14010105:1:7","skill_id":1830,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14105060","source_conditions":"Original selected skill1830; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count5 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 10 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1113450:14212070:14010212:1:5":{"field":"1113450","battle_group_id":"111345","step":"14010212:1:5","asset":"ep4/quest_story_14212070","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1113450:14212070:14010212:1:5","skill_id":1833,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"14212070","source_conditions":"Original selected skill1833; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count5 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 15 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1121410:15102140:15010102:1:10":{"field":"1121410","battle_group_id":"112141","step":"15010102:1:10","asset":"ep5/quest_story_15102140","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1121410:15102140:15010102:1:10","skill_id":1415,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15102140","source_conditions":"Original selected skill1415; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count3 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1125460:15106992:15010106:6:11":{"field":"1125460","battle_group_id":"112546","step":"15010106:6:11","asset":"ep5/quest_story_15106992","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1125460:15106992:15010106:6:11","skill_id":1442,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15106992","source_conditions":"Original selected skill1442; first matching initial nonsummoned enemy tid3060, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.7. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1126410:15108152:15010108:2:4":{"field":"1126410","battle_group_id":"112641","step":"15010108:2:4","asset":"ep5/quest_story_15108152","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1126410:15108152:15010108:2:4","skill_id":1431,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15108152","source_conditions":"Original selected skill1431; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count7 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 10 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1126420:15109170:15010109:2:3":{"field":"1126420","battle_group_id":"112642","step":"15010109:2:3","asset":"ep5/quest_story_15109170","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1126420:15109170:15010109:2:3","skill_id":1446,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15109170","source_conditions":"Original selected skill1446; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count8 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 10 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1126430:15109210:15010109:2:4":{"field":"1126430","battle_group_id":"112643","step":"15010109:2:4","asset":"ep5/quest_story_15109210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1126430:15109210:15010109:2:4","skill_id":1447,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15109210","source_conditions":"Original selected skill1447; first matching initial nonsummoned enemy tid3052, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.85. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1126460:15109420:15010109:3:4":{"field":"1126460","battle_group_id":"112646","step":"15010109:3:4","asset":"ep5/quest_story_15109420","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1126460:15109420:15010109:3:4","skill_id":1444,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15109420","source_conditions":"Original selected skill1444; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count3 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1123510:15206260:15010222:4:2":{"field":"1123510","battle_group_id":"112351","step":"15010222:4:2","asset":"ep5/quest_story_15206260","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1123510:15206260:15010222:4:2","skill_id":1427,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15206260","source_conditions":"Original selected skill1427; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count3 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1122470:15220210:15010233:3:3":{"field":"1122470","battle_group_id":"112247","step":"15010233:3:3","asset":"ep5/quest_story_15220210","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1122470:15220210:15010233:3:3","skill_id":1418,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15220210","source_conditions":"Original selected skill1418; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count12 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 15 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1052480:15242080:15010512:1:5":{"field":"1052480","battle_group_id":"105248","step":"15010512:1:5","asset":"ep5/quest_story_15242080","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1052480:15242080:15010512:1:5","skill_id":1454,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"15242080","source_conditions":"Original selected skill1454; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count5 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 10 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1135420:16110140:16010110:1:7":{"field":"1135420","battle_group_id":"113542","step":"16010110:1:7","asset":"ep6/quest_story_16110140","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1135420:16110140:16010110:1:7","skill_id":1660,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16110140","source_conditions":"Original selected skill1660; first matching initial nonsummoned enemy tid113, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.75. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1134430:16211141:16010214:2:3":{"field":"1134430","battle_group_id":"113443","step":"16010214:2:3","asset":"ep6/quest_story_16211141","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1134430:16211141:16010214:2:3","skill_id":1667,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16211141","source_conditions":"Original selected skill1667; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count2 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 2 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1134440:16217130:16010217:1:9":{"field":"1134440","battle_group_id":"113444","step":"16010217:1:9","asset":"ep6/quest_story_16217130","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1134440:16217130:16010217:1:9","skill_id":1662,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16217130","source_conditions":"Original selected skill1662; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count3 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1131440:16102110:16010222:1:3":{"field":"1131440","battle_group_id":"113144","step":"16010222:1:3","asset":"ep6/quest_story_16102110","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1131440:16102110:16010222:1:3","skill_id":1657,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16102110","source_conditions":"Original selected skill1657; first matching initial nonsummoned enemy tid8010, shared caster SetHP_Switch; original SetHp forwards incoming HP then requests once when incoming HP <= maxHP*0.5. Other configured HP callbacks do not each get an independent attachment. Companion bodies execute jointly; missing/unmatched/summoned-only controls stay silent."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"configured-v25:1133480:16225240:16010225:3:7":{"field":"1133480","battle_group_id":"113348","step":"16010225:3:7","asset":"ep6/quest_story_16225240","condition":{"kind":"verified_configured_callback","contract_id":"configured-v25:1133480:16225240:16010225:3:7","skill_id":1670,"dispatch":"clientCall","reset":"new_battle_instance","once_per":"source_defined_callback","trigger":{"event":"verified_configured_callback_path","plot_id":"16225240","source_conditions":"Original selected skill1670; native HandleUnitDieEventToAll delivers different-camp death notifications to field caster; exact equality at death count5 requests once. Dialogue wrapper itself has no common/summoned predicate. Configured waves supply 5 enemy slots; their allocation, survival and live server buffs are separate runtime conditions. Same-camp, deferred delivery and fresh-instance reset controls execute with actual companions."},"input_policy":"configured_conditional_path_20261022"},"source_report":"provenance:analysis/part1_hp_warning_20261022_v25/joint_callback_evidence.json","source_report_sha256":"75011339e52c012feb4b9eff6c872283fb44b2c9c40935a3550a57a9ca00dd67","live_inputs_bounded":false},"presumed-v31:1017030:10262182:10010610:5:6":{"field":"1017030","battle_group_id":"101703","step":"10010610:5:6","asset":"mn/quest_story_10262182","condition":{"kind":"user_requested_presumed_battle_callback","contract_id":"presumed-v31:1017030:10262182:10010610:5:6","skill_id":1947,"dispatch":"presumed_source_path","once_per":"source_defined_callback","reset":"new_battle_instance","trigger":{"event":"presumed_configured_callback","plot_id":"10262182","recovered_plot_id":"10262182","source_conditions":"Stored dialogueid_sword; actual dispatch event remains unknown."},"input_policy":"presumed_source_paths_20261023"},"source_case":"battle:direct-caller-frontier","source_verification":false,"resource_alias_verified":null,"source_report":"provenance:analysis/part1_curated_connections_20261023_v31/connection_research.json","source_report_sha256":"007ab82ac56d6d7cce1b4d488d0657a3851c349358c95d4d8ca2336c444b2154"},"presumed-v31:1083420:12104240:12010104:2:16":{"field":"1083420","battle_group_id":"108342","step":"12010104:2:16","asset":"ep2/quest_story_12104240","condition":{"kind":"user_requested_presumed_battle_callback","contract_id":"presumed-v31:1083420:12104240:12010104:2:16","skill_id":1733,"dispatch":"presumed_source_path","once_per":"source_defined_callback","reset":"new_battle_instance","trigger":{"event":"presumed_configured_callback","plot_id":"12104240","recovered_plot_id":"12104240","source_conditions":"Configured enemy HP <=40%; target tid65 differs from initial Nara tid68."},"input_policy":"presumed_source_paths_20261023"},"source_case":"battle-field:1083420","source_verification":false,"resource_alias_verified":null,"source_report":"provenance:analysis/part1_curated_connections_20261023_v31/connection_research.json","source_report_sha256":"007ab82ac56d6d7cce1b4d488d0657a3851c349358c95d4d8ca2336c444b2154"},"presumed-v31:1052420:15235020:15010505:1:2":{"field":"1052420","battle_group_id":"105242","step":"15010505:1:2","asset":"ep5/quest_story_15235020","condition":{"kind":"user_requested_presumed_battle_callback","contract_id":"presumed-v31:1052420:15235020:15010505:1:2","skill_id":1453,"dispatch":"presumed_source_path","once_per":"source_defined_callback","reset":"new_battle_instance","trigger":{"event":"presumed_configured_callback","plot_id":"15235020","recovered_plot_id":"15235020","source_conditions":"Configured seven-death callback; five initial enemies do not prove seven delivered deaths."},"input_policy":"presumed_source_paths_20261023"},"source_case":"battle-field:1052420","source_verification":false,"resource_alias_verified":null,"source_report":"provenance:analysis/part1_curated_connections_20261023_v31/connection_research.json","source_report_sha256":"007ab82ac56d6d7cce1b4d488d0657a3851c349358c95d4d8ca2336c444b2154"},"presumed-v31:1131450:16102130:16010222:1:4":{"field":"1131450","battle_group_id":"113145","step":"16010222:1:4","asset":"ep6/quest_story_16102130","condition":{"kind":"user_requested_presumed_battle_callback","contract_id":"presumed-v31:1131450:16102130:16010222:1:4","skill_id":1658,"dispatch":"presumed_source_path","once_per":"source_defined_callback","reset":"new_battle_instance","trigger":{"event":"presumed_configured_callback","plot_id":"16102130","recovered_plot_id":"16102130","source_conditions":"Configured HP <=50% target tid8014 differs from initial tid8010."},"input_policy":"presumed_source_paths_20261023"},"source_case":"battle-field:1131450","source_verification":false,"resource_alias_verified":null,"source_report":"provenance:analysis/part1_curated_connections_20261023_v31/connection_research.json","source_report_sha256":"007ab82ac56d6d7cce1b4d488d0657a3851c349358c95d4d8ca2336c444b2154"},"presumed-v31:1096460:12114361:12010114:7:2":{"field":"1096460","battle_group_id":"109646","step":"12010114:7:2","asset":"ep2/quest_story_12114361","condition":{"kind":"user_requested_presumed_battle_callback","contract_id":"presumed-v31:1096460:12114361:12010114:7:2","skill_id":1743,"dispatch":"presumed_source_path","once_per":"source_defined_callback","reset":"new_battle_instance","trigger":{"event":"presumed_configured_callback","plot_id":"12114361","recovered_plot_id":"12114361","source_conditions":"Configured HP <=80% target tid1410; same-slot skill1744 wins original fixed selection, so this is a presumed alternate callback."},"input_policy":"presumed_source_paths_20261023"},"source_case":"battle-field:1096460","source_verification":false,"resource_alias_verified":null,"source_report":"provenance:analysis/part1_curated_connections_20261023_v31/connection_research.json","source_report_sha256":"007ab82ac56d6d7cce1b4d488d0657a3851c349358c95d4d8ca2336c444b2154"},"presumed-v31:1096460:13114362:12010114:7:2":{"field":"1096460","battle_group_id":"109646","step":"12010114:7:2","asset":"ep2/quest_story_12114362","condition":{"kind":"user_requested_presumed_battle_callback","contract_id":"presumed-v31:1096460:13114362:12010114:7:2","skill_id":1744,"dispatch":"presumed_source_path","once_per":"source_defined_callback","reset":"new_battle_instance","trigger":{"event":"presumed_configured_callback","plot_id":"13114362","recovered_plot_id":"12114362","source_conditions":"Configured HP <=40% target tid1410 requests missing13114362. Curated alias to recovered Hammie enchantment line12114362; no native alias is claimed."},"input_policy":"presumed_source_paths_20261023"},"source_case":"battle-field:1096460","source_verification":false,"resource_alias_verified":false,"source_report":"provenance:analysis/part1_curated_connections_20261023_v31/connection_research.json","source_report_sha256":"007ab82ac56d6d7cce1b4d488d0657a3851c349358c95d4d8ca2336c444b2154"}};
  function exactValue(a,b) {
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&exactValue(a[k],b[k]));
  }
  function nativeCallback(condition,entry,dialogues) {
    const c=nativeCallbackContracts[condition?.contract_id];
    const profile=c&&entry.admission?.field_profiles?.[c.field];
    const configured=condition?.kind==='verified_configured_callback'&&!!profile
      &&entry.admission?.policy?.id===condition.input_policy&&entry.admission.policy.user_requested===true
      &&profile.source_report===c.source_report&&profile.source_report_sha256===c.source_report_sha256
      &&profile.live_inputs_bounded===false;
    const presumed=condition?.kind==='user_requested_presumed_battle_callback'&&!!c
      &&entry.admission?.presumed_path_policy?.id===condition.input_policy&&entry.admission.presumed_path_policy.user_requested===true
      &&entry.admission?.presumed_path_evidence?.file===c.source_report
      &&entry.admission.presumed_path_evidence.sha256===c.source_report_sha256&&c.source_verification===false;
    return !!c&&exactValue(condition,c.condition)&&exactValue(dialogues,[c.asset])
      &&entry.step===c.step&&entry.battle_group_id===c.battle_group_id
      &&(configured||presumed||(!['verified_configured_callback','user_requested_presumed_battle_callback'].includes(condition?.kind)&&entry.evidence?.field===c.field));
  }
  function lookup(catalog, group, asset, step, position = 'objective', logical = false) {
    const groups = (logical ? catalog?.battles?.logical_groups : catalog?.battles?.groups)?.[group];
    return groups?.[asset]?.[`${position}:${step}`] || null;
  }
  function visible(plan, session) {
    if (plan.context_guards?.length) {
      const context = plan.season_context;
      if (!context || !plan.assembly_key?.startsWith(context.collection + '/')
          || plan.context_guards.some(season => season !== context.season)) return false;
    }
    const value = session.evaluate(plan.gate);
    if (typeof value !== 'boolean') throw new Error('Unresolved encounter storyline.');
    return value;
  }
  function describe(plan) {
    const scripted = plan.rules.some(r => r.kind === 'scripted_encounter_finished');
    return {label: scripted ? 'Encounter' : 'Battle'};
  }
  function lineups(plan, catalog) {
    const battles = catalog?.battles;
    const result = [];
    const alternatives = plan.rules.some(rule => rule.kind === 'any_object_destroyed');
    const shown = new Set();
    for (const [encounter, object] of plan.objects.entries()) {
      const formation = battles?.formations?.[object.battle_group_id];
      if (formation?.status !== 'configured') {
        const reference = battles?.reference_lineups?.[object.battle_group_id];
        if (reference && reference.step === plan.step && reference.object_id === object.id) {
          result.push({label: plan.objects.length > 1 ? `Encounter ${encounter + 1}` : '',
            enemies: reference.unit_ids.map(id => ({id, ...battles.enemies?.[id]})), source: reference.source});
        }
        continue;
      }
      if (alternatives && shown.has(object.battle_group_id)) continue;
      shown.add(object.battle_group_id);
      for (const [field, configuration] of formation.fields.entries()) {
        for (const [wave, round] of configuration.waves.entries()) {
          const enemies = round.unit_ids.map(id => ({id, ...battles.enemies?.[id]}));
          if (!enemies.length) continue;
          const labels = [];
          if (plan.objects.length > 1) labels.push(`Encounter ${encounter + 1}`);
          if (formation.fields.length > 1) labels.push(`Battle ${field + 1}`);
          if (round.additional) labels.push('Additional enemies');
          else if (configuration.waves.length > 1) labels.push(`Wave ${wave + 1}`);
          result.push({label: labels.join(' · '), enemies});
        }
      }
    }
    return result;
  }
  function dialogues(plan,catalog,group,anchor,logical=false) {
    const routes=catalog?.route_dialogues;
    const configured=routes?.configured_battle_presentations?.[plan.step];
    if (configured) {
      const boundary=configured.bindings.find(binding=>
        (logical ? binding.scope===group : binding.legacy_scopes.includes(group))
        && binding.anchor_asset===anchor && binding.slot===`${plan.position}:${plan.step}`);
      if (!boundary || configured.phase!=='during_encounter'
          || !plan.objects.some(object=>configured.object_ids.includes(object.id) && object.battle_group_id===configured.battle_group_id)) return [];
      return configured.dialogues.map(asset=> {
        const dialogue=routes.dialogues[asset];
        if (!dialogue?.lines?.length) throw new Error('Missing verified battle dialogue.');
        return {asset,dialogue};
      });
    }
    const entry=routes?.battle_presentations?.[plan.step];
    if (!entry || entry.scope !== group && (logical || entry.legacy_scope !== group)
        || entry.anchor_asset !== anchor || entry.slot !== `${plan.position}:${plan.step}`
        || entry.phase !== 'during_encounter'
        || !plan.objects.some(object=>object.id===entry.object_id && object.battle_group_id===entry.battle_group_id)) return [];
    return entry.dialogues.map(asset=> {
      const dialogue=routes.dialogues[asset];
      if (!dialogue?.lines?.length) throw new Error('Missing verified battle dialogue.');
      return {asset,dialogue};
    });
  }
  function conditionalDialogues(plan,catalog,group,anchor,logical=false) {
    const routes=catalog?.route_dialogues,entry=routes?.conditional_battle_presentations?.[plan.step];
    if(!entry || entry.phase!=='conditional_during_encounter')return [];
    const boundary=entry.bindings.find(b=>(logical ? b.scope===group : b.legacy_scopes.includes(group))
      && b.anchor_asset===anchor && b.slot===`${plan.position}:${plan.step}`);
    if(!boundary || !plan.objects.some(o=>entry.object_ids.includes(o.id)&&o.battle_group_id===entry.battle_group_id))return [];
    const exchanges=entry.exchanges || [{condition:entry.condition,dialogues:entry.dialogues}];
    const mixed=entry.receiving?.overlap==='mode_specific_interlude_arbitration'
      &&JSON.stringify(entry.receiving.popup_types)==='[7,8]'
      &&entry.dialogues.every(asset=>entry.receiving.plot_modes?.[asset]===(routes.dialogues[asset]?.mode==='graph'?'BattleNormal':'BattleSlim'));
    if(entry.exchanges && (entry.order!=='independent_triggers'
        || (entry.receiving?.overlap!=='same_popup_type_substitutes'&&!mixed)
        || JSON.stringify(exchanges.flatMap(e=>e.dialogues))!==JSON.stringify(entry.dialogues)))
      throw new Error('Unsupported conditional battle dialogue.');
    return exchanges.flatMap(({condition,dialogues})=>{
      const timer=condition?.kind==='skill_update_elapsed' && condition.operator==='>='
        && Number.isFinite(condition.seconds) && condition.seconds>0 && condition.once_per==='skill_instance';
      const hp=condition?.kind==='hero_hp_set_argument' && condition.operator==='<='
        && Number.isInteger(condition.hero_tid) && condition.hero_tid>0
        && Number.isFinite(condition.fraction) && condition.fraction>0 && condition.fraction<=1
        && condition.threshold_base==='attribs.HP' && condition.selection==='first_initially_matched_hero'
        && condition.evaluation==='after_underlying_setter' && condition.once_per==='target_instance';
      const deaths=condition?.kind==='field_other_unit_die_count' && condition.operator==='=='
        && Number.isInteger(condition.count) && condition.count>0 && condition.caster_camp==='player'
        && condition.camp_relation==='different_from_field_caster' && condition.counter==='shared_on_field_caster'
        && Number.isInteger(condition.increments_per_qualifying_event) && condition.increments_per_qualifying_event>0
        && condition.evaluation==='after_underlying_handler' && condition.once_per==='field_caster_instance';
      const mp=condition?.kind==='companion_mp_threshold' && condition.skill_id===1306
        && condition.mp_buff_id===4005051 && condition.threshold_base==='attribs.MP' && condition.operator==='>='
        && condition.evaluation==='buff_update_then_field_update' && condition.once_per==='skill_instance';
      const landing=condition?.kind==='companion_summon_landing' && condition.skill_id===1306
        && condition.controller_buff_id===4005052 && condition.landing_buff_id===4005057
        && condition.summon_tid===42 && condition.requires_state==='isflyingdown' && condition.once_per==='buff_instance';
      const first=condition?.kind==='field_first_update' && [1201,1202,1203,1204,1206,1207,1208,1301,1302,1303,1304,1305,1312,1313,1314,1720,1721,1852].includes(condition.skill_id)
        && condition.init_flag===([1301,1302,1303,1304,1305,1312,1313,1314,1720,1721,1852].includes(condition.skill_id)?'initialsymbol':`wheel${condition.skill_id}Initial`) && condition.dispatch==='clientCall'
        && condition.once_per==='skill_instance';
      const casterFirst=condition?.kind==='field_first_update'&&[1903,1904].includes(condition.skill_id)
        &&condition.init_flag==='initialsymbol'&&condition.dispatch==='clientCall'&&condition.once_per==='field_caster_instance';
      const ceciaFirst=condition?.kind==='field_first_update'&&condition.skill_id===1588
        &&condition.init_flag==='wheel1593_Initial'&&condition.dispatch==='clientCall'&&condition.once_per==='skill_instance';
      const firebladeOpening=condition?.kind==='field_caster_elapsed'&&condition.skill_id===1901
        &&condition.seconds===2&&condition.operator==='>='&&condition.counter==='timecount'&&condition.once_flag==='firstplot'
        &&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const firebladeHP=condition?.kind==='captured_enemy_old_hp_update'&&condition.skill_id===1901&&condition.hero_tid===19
        &&condition.selection==='initial_alive_nonsummoned_enemy_hero'&&condition.fraction===.6&&condition.operator==='<'
        &&condition.threshold_base==='attribs.HP'&&condition.evaluation==='old_hp_before_underlying_setter'
        &&condition.arm_flag==='wheelhpcheck'&&condition.consumption==='next_field_skill_update'&&condition.once_flag==='walikacontrol'
        &&condition.requires_summon_allocation===false&&condition.requires_buff_allocation===false
        &&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const ceciaRecovery=condition?.kind==='captured_enemy_numbered_hp_recovery'&&condition.skill_id===1588&&condition.hero_tid===25
        &&condition.selection==='initial_alive_nonsummoned_enemy_hero'&&condition.evaluation==='old_hp_before_underlying_setter'
        &&condition.fraction===.5&&condition.operator==='<='&&condition.replacement==='maximum_hp'
        &&condition.rearm==='later_setter_sees_full_old_hp'&&condition.response_clock==='selected_skill_updates_after_recovery_flag'
        &&condition.seconds===1&&condition.time_operator==='>'&&[1,2].includes(condition.recovery_index)
        &&condition.resets_clock_for_second===true&&condition.requires_control_buff===false
        &&condition.once_per==='native_recovery_index'&&condition.dispatch==='clientCall';
      const taleneMP=condition?.kind==='captured_ally_elapsed_mp'&&condition.skill_id===1720&&condition.hero_tid===75
        &&condition.selection==='initial_alive_nonsummoned_player_hero'&&condition.seconds===5&&condition.time_operator==='>'
        &&condition.mp===900&&condition.mp_operator==='>'&&condition.once_flag==='twoplot'&&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const taleneRelease=condition?.kind==='talene_invulnerability_release'&&condition.skill_id===1720&&condition.hero_tid===75
        &&condition.selection==='initial_alive_nonsummoned_player_hero'&&condition.skill_name==='phoenix_ult'&&condition.expire_buff_id===4005196
        &&condition.arm_seconds===8&&condition.arm_operator==='>'&&condition.arm_requires_second_plot===true
        &&condition.event_evaluation==='after_underlying_start'&&condition.fallback_seconds===12&&condition.fallback_operator==='>'
        &&condition.fallback_comparison==='current_skill_equals_named_slot'&&condition.fallback_accepts_nil_equality===true
        &&condition.once_flag==='talin001_clearInvuFinish'&&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const taleneDeaths=condition?.kind==='different_camp_deaths_then_elapsed'&&condition.skill_id===1721&&condition.count===5
        &&condition.count_operator==='=='&&condition.camp_relation==='different_from_field_caster'&&condition.counter==='deadmonscount'
        &&condition.suppress_if_truthy==='switchDialogue'&&condition.clock_armed_by==='bossshow'&&condition.clock==='plotcount'
        &&condition.seconds===1&&condition.time_operator==='>'&&condition.clock_updates==='post_arm_skill_updates'
        &&condition.requires_boss_receiver===false&&condition.once_flag==='twoplot'&&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const thornLock=condition?.kind==='controller_hp_with_returned_lock'&&condition.skill_id===1586&&condition.hero_tid===25
        &&condition.selection==='initial_alive_nonsummoned_enemy_hero'&&condition.controller_buff_id===4005043&&condition.lock_buff_id===4005039
        &&condition.requires_returned_lock===true&&condition.operator==='<='&&condition.threshold_base==='attribs.HP'
        &&[[.8,'buff1_Switch',1000],[.5,'buff2_Switch',0]].some(([fraction,flag,mp])=>condition.fraction===fraction&&condition.once_flag===flag&&condition.mp_grant===mp)
        &&condition.evaluation==='after_underlying_buff_update'&&condition.once_per==='controller_buff_threshold'&&condition.dispatch==='clientCall';
      const callbackPaths={
        initial_enemy_1140_period1_then_update:[1301,'skill_instance'],
        five_initial_enemy_period2_transitions_then_update:[1301,'skill_instance'],
        ninth_different_camp_death_on_each_initial_player:[1302,'target_instance'],
        player_takeDamage_delta_le0_hp_le30pct:[1303,'field_caster_instance'],
        enemy_takeDamage_delta_le0_hp_le50pct_after_player_death_or_35s:[1303,'field_caster_instance'],
        initial_enemy3012_mp_ge800_before_ult_finish:[1304,'skill_instance'],
        initial_enemy3012_mp_ge800_after_one_ult_finish:[1304,'skill_instance'],
        initial_enemy3012_two_ult_finishes_then_half_second:[1304,'skill_instance'],
        tid3017_takeDamage_delta_le0_hp_le55pct:[1305,'field_caster_instance']
      };
      const callbackPath=condition?.kind==='custom_battle_event_path'&&Object.hasOwn(callbackPaths,condition.path)
        &&condition.skill_id===callbackPaths[condition.path][0]&&condition.once_per===callbackPaths[condition.path][1]&&condition.dispatch==='clientCall';
      const buffClock=condition?.kind==='enemy_controller_buff_hp_gated_clock'&&condition.skill_id===1166
        &&condition.controller_buff_id===300104&&condition.selection==='all_initial_alive_enemies'
        &&condition.hp_operator==='<='&&condition.fraction===0.7&&condition.threshold_base==='attribs.HP'
        &&[4,11].includes(condition.seconds)&&condition.clock_behavior==='accumulate_while_HP_gate_then_pause_above'
        &&condition.once_per==='buff_instance'&&condition.dispatch==='clientCall_then_native_PlayBattlePlot';
      const summon=condition?.kind==='first_tagged_summon_death' && condition.skill_id===1203
        && condition.enemy_camp===-1 && JSON.stringify(condition.summon_ids)==='[1267,1268]'
        && condition.tag==='wheel1203SummonId' && condition.once_flag==='wheel1203Revived'
        && condition.dispatch==='clientCall' && condition.creation_delay_seconds===0.5
        && condition.field_script==='wheel_1203' && condition.once_per==='field_caster_instance';
      const poll=condition?.kind==='selected_hero_hp_poll'&&condition.skill_id===1204&&condition.hero_tid===34
        &&condition.operator==='<='&&condition.fraction===0.5&&condition.threshold_base==='GetMaxHp'
        &&condition.selection==='first_initially_matched_enemy_hero'&&condition.evaluation==='field_skill_update'
        &&condition.once_flag==='wheel1204SilvinaHalfHp'&&condition.once_per==='field_caster_instance';
      const entryDeaths=condition?.kind==='field_filtered_deaths_with_boss_buff'&&condition.skill_id===1207
        &&condition.enemy_camp===-1&&condition.excluded_tid===144&&condition.operator==='>='&&condition.count===4
        &&condition.boss_tid===144&&condition.stored_buff_id===4005230&&condition.requires_returned_buff===true
        &&condition.evaluation==='after_underlying_handler'&&condition.once_flag==='wheel1207BossEntered'
        &&condition.dispatch==='clientCall'&&condition.once_per==='field_caster_instance';
      const ultimate=condition?.kind==='selected_boss_ultimate_finish'&&condition.skill_id===1207&&condition.boss_tid===144
        &&condition.selection==='first_initially_matched_enemy_hero'&&condition.skill_selection==='manualSkill_or_skill_ult'
        &&condition.evaluation==='after_underlying_finish'&&condition.requires_field_link===true
        &&condition.once_flag==='wheel1207SecondPlotStarted'&&condition.dispatch==='clientCall'
        &&condition.once_per==='field_caster_instance';
      const bossDeaths=condition?.kind==='field_deaths_with_selected_boss'&&condition.skill_id===1314
        &&condition.operator==='>='&&condition.count===4&&condition.boss_tid===3038
        &&condition.camp_relation==='different_from_field_caster'&&condition.counter==='shared_on_field_caster'
        &&condition.requires_returned_buff===false&&condition.evaluation==='after_underlying_handler'
        &&condition.once_flag==='buffovercheck'&&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const phase1315=condition?.kind==='field_elapsed_admission'&&condition.skill_id===1315&&condition.operator==='>='
        &&condition.dispatch==='clientCall'&&[
          [1,'initialsymbol','skill_instance','none'],[8.5,'fairynouseshow','field_caster_instance','first_same_camp_commander_with_skills'],
          [13,'fairyshowend','field_caster_instance','none'],[17,'firstsummonshow','field_caster_instance','captured_boss_82']
        ].some(([seconds,flag,once,required])=>condition.seconds===seconds&&condition.once_flag===flag&&condition.once_per===once&&condition.required_input===required);
      const fog1315=condition?.kind==='field_deaths_then_update_with_commander_skill'&&condition.skill_id===1315
        &&condition.count===7&&condition.operator==='>='&&condition.camp_relation==='different_from_field_caster'
        &&condition.required_commander_skill_id===100002&&condition.initialization==='seventh_death_handler'
        &&condition.evaluation==='next_field_skill_update'&&condition.once_flag==='removefogdia'
        &&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const bossHp=condition?.kind==='selected_hero_hp_after_setter'&&[[1314,3038,0.45,'buffend'],[1315,82,0.3,'firsthpcheck']].some(([skill,tid,fraction,flag])=>condition.skill_id===skill&&condition.hero_tid===tid&&condition.fraction===fraction&&condition.once_flag===flag)
        &&condition.operator==='<'&&condition.threshold_base==='attribs.HP'
        &&condition.evaluation==='actual_hp_after_underlying_setter'
        &&condition.once_per==='target_instance'&&condition.dispatch==='clientCall';
      const commonDeaths=condition?.kind==='common_enemy_death_threshold'&&condition.skill_id===1810
        &&condition.enemy_camp===-1&&condition.count===5&&condition.operator==='>='&&condition.native_common_unit===true
        &&condition.evaluation==='before_underlying_handler'&&condition.once_flag==='wheel_1810_Switch'
        &&condition.once_per==='field_caster_instance'&&condition.dispatch==='clientCall';
      const namedStart=condition?.kind==='named_ultimate_start'&&condition.skill_id===1853
        &&[[15,'ldoublesword_ult'],[87,'longbow_ult']].some(([tid,name])=>condition.hero_tid===tid&&condition.skill_name===name)
        &&condition.selection==='initial_alive_nonsummoned_heroes_any_camp'&&condition.evaluation==='after_underlying_start'
        &&condition.repetition==='each_start'&&condition.once_per==='none'&&condition.dispatch==='clientCall';
      const bishopStart=condition?.kind==='first_named_ultimate_start'
        &&((condition.skill_id===1903&&condition.hero_tid===3016&&condition.skill_name==='fogbishop_ult')
          ||(condition.skill_id===1901&&condition.hero_tid===19&&condition.skill_name==='fireblade_ult'))&&condition.enemy_camp===-1
        &&condition.selection==='initial_alive_nonsummoned_enemy_hero'&&condition.evaluation==='after_underlying_start'
        &&condition.counter==='ulttimecount'&&condition.count===1&&condition.operator==='=='
        &&condition.once_per==='target_instance'&&condition.dispatch==='clientCall';
      const numberedHeal=condition?.kind==='numbered_low_hp_heal'&&condition.skill_id===1855&&condition.hero_tid===89
        &&condition.selection==='initial_alive_nonsummoned_heroes_any_camp'&&condition.fraction===0.5&&condition.operator==='<'
        &&condition.evaluation==='old_hp_before_underlying_setter'&&condition.consumption==='next_field_skill_update'
        &&condition.heal_fraction===0.6&&[1,2,3].includes(condition.heal_index)&&condition.heal_limit===3
        &&condition.once_per==='field_heal_index'&&condition.dispatch==='clientCall';
      const spiderPhase=condition?.kind==='spider_old_hp_phase'&&condition.skill_id===1466&&condition.hero_tid===1294
        &&condition.enemy_camp===-1&&condition.selection==='initial_alive_nonsummoned_enemy_hero'
        &&[[0.7,'firsthpcheck'],[0.3,'nexthpcheck']].some(([fraction,flag])=>condition.fraction===fraction&&condition.once_flag===flag)
        &&condition.operator==='<='&&condition.threshold_base==='attribs.HP'&&condition.evaluation==='old_hp_before_underlying_setter'
        &&condition.summon_requests_before_plot===4&&condition.summon_tid===1296&&condition.once_per==='target_threshold'
        &&condition.dispatch==='clientCall';
      const oldHpSlim=condition?.kind==='selected_unit_old_hp_slim'
        &&[[1310,3001,0.45,'<','firsthpcheck','initial_alive_units_any_camp'],[1465,8008,0.5,'<=','nexthpcheck','initial_alive_nonsummoned_enemy_hero'],[1903,3016,0.3,'<','wheelhpcheck','initial_alive_nonsummoned_enemy_hero']]
          .some(([skill,tid,fraction,op,flag,selection])=>condition.skill_id===skill&&condition.hero_tid===tid&&condition.fraction===fraction&&condition.operator===op&&condition.once_flag===flag&&condition.selection===selection)
        &&condition.threshold_base==='attribs.HP'&&condition.evaluation==='old_hp_before_underlying_setter'
        &&condition.once_per==='target_instance'&&condition.dispatch==='clientCall';
      const native = nativeCallback(condition,entry,dialogues);
      if((!native && !timer && !hp && !deaths && !mp && !landing && !first && !casterFirst && !firebladeOpening && !firebladeHP && !ceciaFirst && !ceciaRecovery && !callbackPath && !buffClock && !summon && !poll && !entryDeaths && !ultimate && !bossDeaths && !bossHp && !phase1315 && !fog1315 && !commonDeaths && !namedStart && !bishopStart && !numberedHeal && !spiderPhase && !oldHpSlim && !taleneMP && !taleneRelease && !taleneDeaths && !thornLock) || condition.reset!=='new_battle_instance' || !Array.isArray(dialogues) || !dialogues.length)
        throw new Error('Unsupported conditional battle dialogue.');
      return dialogues.map(asset=>{
      const dialogue=routes.dialogues[asset];
      if(!dialogue?.lines?.length)throw new Error('Missing verified conditional battle dialogue.');
      return {asset,dialogue,condition};
      });
    });
  }
  function presentation(dialogue,selections={}) {
    if(dialogue.mode!=='graph')return dialogue.lines.map(id=>({id,node:dialogue.graph.nodes[id]}));
    if(dialogue.source_validation?.kind!=='verified_acyclic_source_graph'||dialogue.graph.roots.length!==1)
      throw new Error('Unsupported battle dialogue graph.');
    const result=[],seen=new Set();let id=dialogue.graph.roots[0];
    while(id) {
      if(seen.has(id))throw new Error('Unsupported battle dialogue cycle.');
      seen.add(id);const node=dialogue.graph.nodes[id];
      if(!node)throw new Error('Missing battle dialogue node.');
      if(node.type==='end')return result;
      if(node.type==='line') {result.push({id,node});id=node.next;continue;}
      if(node.type!=='choice'||!node.options?.length||node.persistent_choice)
        throw new Error('Unsupported battle dialogue node.');
      const option=node.options.find(o=>o.index===selections[id])||node.options[0];
      result.push({id,node,option});id=option.target;
    }
    throw new Error('Missing battle dialogue finish.');
  }
  return {lookup, visible, describe, lineups, dialogues,conditionalDialogues,presentation};
});

;
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StoryObjectives = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // REVIEWED_OBJECTIVE_TITLE_CONTRACTS
  const reviewedObjectiveTitles = [{"source_key":"10010224:2:5","owner":"10010224","task":"2","join_step":"5","before_key":"10010224:2:2","decision":"phase_heading","title_cn":"询问奇怪的镇民","summary_cn":"","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"询问愤怒的男镇民","3":"询问忧愁的女镇民","4":"询问路边的小孩"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"10010261:3:5","owner":"10010261","task":"3","join_step":"5","before_key":"10010261:3:3","decision":"phase_heading","title_cn":"调查两座女神像","summary_cn":"日神殿中突然出现的女神像是否与恶魔有关？值得调查。","pre_step_ids":["3","4"],"child_titles_cn":{"3":"感应女神像的魔力","4":"感应女神像的魔力"},"native_group":[3,4],"completion_written":false,"description_moved":false},{"source_key":"10010261:7:5","owner":"10010261","task":"7","join_step":"5","before_key":"10010261:7:2","decision":"phase_heading","title_cn":"收集不对称的素材","summary_cn":"为了逼迫追求极致对称的恶魔现身，需要找到素材来摆放出不对称的法阵图形。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"收集果子","3":"收集花","4":"收集树枝"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"10020113:5:5","owner":"10020113","task":"5","join_step":"5","before_key":"10020113:5:2","decision":"phase_heading","title_cn":"打发无聊时光","summary_cn":"","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"和埃隆聊聊","3":"看看洛桑他们","4":"问问漫漫在做什么"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"10020271:3:7","owner":"10020271","task":"3","join_step":"7","before_key":"10020271:3:5","decision":"duplicate_join_title","title_cn":"搜寻一叶的线索","summary_cn":"路上洒落了一些吃剩的萤瓤果，可能是一叶留下的，只要顺着这条线索，就能找到一叶了！","pre_step_ids":["5","6"],"child_titles_cn":{"5":"搜寻一叶的线索","6":"搜寻一叶的线索"},"native_group":[5,6],"completion_written":false,"description_moved":false},{"source_key":"10030121:2:8","owner":"10030121","task":"2","join_step":"8","before_key":"10030121:2:5","decision":"phase_heading","title_cn":"询问村民","summary_cn":"","pre_step_ids":["5","6","7"],"child_titles_cn":{"5":"询问村民兰兰丽拉","6":"询问村民柯柯芽","7":"询问村民荞普"},"native_group":[5,6,7],"completion_written":false,"description_moved":false},{"source_key":"10030284:3:4","owner":"10030284","task":"3","join_step":"4","before_key":"10030284:3:2","decision":"phase_heading","title_cn":"用药草治疗队员","summary_cn":"","pre_step_ids":["2","3"],"child_titles_cn":{"2":"治疗队员","3":"治疗队员"},"native_group":[2,3],"completion_written":false,"description_moved":false},{"source_key":"10040132:1:8","owner":"10040132","task":"1","join_step":"8","before_key":"10040132:1:5","decision":"phase_heading","title_cn":"收集情报","summary_cn":"","pre_step_ids":["5","6","7"],"child_titles_cn":{"5":"询问学者雷克索","6":"询问学者费里德","7":"询问学者格莉芙"},"native_group":[5,6,7],"completion_written":false,"description_moved":false},{"source_key":"10040133:2:9","owner":"10040133","task":"2","join_step":"9","before_key":"10040133:2:7","decision":"phase_heading","title_cn":"查看石碑线索","summary_cn":"","pre_step_ids":["7","8"],"child_titles_cn":{"7":"找到B-2号残碑","8":"找到B-13号残碑"},"native_group":[7,8],"completion_written":false,"description_moved":false},{"source_key":"10040135:1:7","owner":"10040135","task":"1","join_step":"7","before_key":"10040135:1:5","decision":"duplicate_join_title","title_cn":"调查魔偶零件","summary_cn":"","pre_step_ids":["5","6"],"child_titles_cn":{"5":"调查魔偶零件","6":"调查魔偶零件"},"native_group":[5,6],"completion_written":false,"description_moved":false},{"source_key":"10040136:3:9","owner":"10040136","task":"3","join_step":"9","before_key":"10040136:3:6","decision":"duplicate_join_title","title_cn":"调查掘金运道","summary_cn":"底部的空间意外地宽敞。以防万一，先调查看看吧。","pre_step_ids":["6","7","8"],"child_titles_cn":{"6":"调查掘金运道","7":"调查掘金运道","8":"调查掘金运道"},"native_group":[6,7,8],"completion_written":false,"description_moved":false},{"source_key":"10040296:3:14","owner":"10040296","task":"3","join_step":"14","before_key":"10040296:3:11","decision":"duplicate_join_title","title_cn":"寻找药草","summary_cn":"达赫妮认出阿尔法十一是受到黑魔法侵蚀，需要去月湖村外找到合适的药草，以抵御魔法侵蚀。","pre_step_ids":["11","12","13"],"child_titles_cn":{"11":"寻找药草","12":"寻找药草","13":"寻找药草"},"native_group":[11,12,13],"completion_written":false,"description_moved":false},{"source_key":"11010109:2:6","owner":"11010109","task":"2","join_step":"6","before_key":"11010109:2:3","decision":"duplicate_join_title","title_cn":"在集市里寻找项链","summary_cn":"萨忒娜丢失了重要的骨质项链，恰巧在集市附近，不知道能不能在摊位和商贩处有什么发现。","pre_step_ids":["3","4","5"],"child_titles_cn":{"3":"在集市里寻找项链","4":"在集市里寻找项链","5":"在集市里寻找项链"},"native_group":[3,4,5],"completion_written":false,"description_moved":false},{"source_key":"11010115:1:7","owner":"11010115","task":"1","join_step":"7","before_key":"11010115:1:4","decision":"duplicate_join_title","title_cn":"在附近寻觅线索","summary_cn":"在周围的石碑上发现了不少与残阳神陨落，及开启封印需要秘钥的信息。","pre_step_ids":["4","5","6"],"child_titles_cn":{"4":"在附近寻觅线索","5":"在附近寻觅线索","6":"在附近寻觅线索"},"native_group":[4,5,6],"completion_written":false,"description_moved":false},{"source_key":"11010202:2:7","owner":"11010202","task":"2","join_step":"7","before_key":"11010202:2:4","decision":"duplicate_join_title","title_cn":"在主营附近转转","summary_cn":"布鲁特斯帮我们一同见证比试，不过不知道黑嚎族内的熊人会有什么看法，在附近转转听听看吧。","pre_step_ids":["4","5","6"],"child_titles_cn":{"4":"在主营附近转转","5":"在主营附近转转","6":"在主营附近转转"},"native_group":[4,5,6],"completion_written":false,"description_moved":false},{"source_key":"11010202:6:5","owner":"11010202","task":"6","join_step":"5","before_key":"11010202:6:2","decision":"phase_heading","title_cn":"在黑嚎族内走走","summary_cn":"这次也一样，在黑嚎领地内听听黑嚎族人们的看法吧。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"听听黑嚎族人的看法","3":"听听黑嚎族人的看法","4":"听听黑嚎族人的看法"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"11010204:4:5","owner":"11010204","task":"4","join_step":"5","before_key":"11010204:4:2","decision":"phase_heading","title_cn":"获得全部情报","summary_cn":"伽利和梅丽莎意在寻找一位名叫埃莉诺的前辈，此外也需要寻找贾克松的母亲，向咸水镇民打听看看吧。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"向镇民打听情报","3":"向镇民打听情报","4":"向镇民打听情报"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"11010205:5:5","owner":"11010205","task":"5","join_step":"5","before_key":"11010205:5:2","decision":"phase_heading","title_cn":"在拍卖会调查线索","summary_cn":"拍卖会上展示着不少来自遗迹群山的水鸟，看来它们就是这一次的拍卖品。四处调查一下，想办法救出它们。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"调查被拍卖的水鸟","3":"调查洞穴内的杂物","4":"调查拍卖会的情报"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"13010219:1:8","owner":"13010219","task":"1","join_step":"8","before_key":"13010219:1:6","decision":"phase_heading","title_cn":"找到孩子","summary_cn":"","pre_step_ids":["6","7"],"child_titles_cn":{"6":"找到杰洛米","7":"找到里芙娜"},"native_group":[6,7],"completion_written":false,"description_moved":false},{"source_key":"14010106:5:7","owner":"14010106","task":"5","join_step":"7","before_key":"14010106:5:4","decision":"phase_heading","title_cn":"调查沉寂营巢","summary_cn":"这处营地堆满了龙蛋，在营地里调查一下，看看会有什么发现。","pre_step_ids":["4","5","6"],"child_titles_cn":{"4":"调查沉寂营巢西部","5":"调查沉寂营巢东部","6":"调查沉寂营巢北部"},"native_group":[4,5,6],"completion_written":false,"description_moved":false},{"source_key":"14010109:3:6","owner":"14010109","task":"3","join_step":"6","before_key":"14010109:3:3","decision":"phase_heading","title_cn":"感受地面风物","summary_cn":"带因度厄感受地表的风物。","pre_step_ids":["3","4","5"],"child_titles_cn":{"3":"带他感受阳光","4":"带他看看大海","5":"带他看看花朵"},"native_group":[3,4,5],"completion_written":false,"description_moved":false},{"source_key":"14010211:1:6","owner":"14010211","task":"1","join_step":"6","before_key":"14010211:1:4","decision":"phase_heading","title_cn":"与民众们交谈","summary_cn":"与民众们交谈，获得思路和灵感。","pre_step_ids":["4","5"],"child_titles_cn":{"4":"找男性民众采风","5":"找女性民众采风"},"native_group":[4,5],"completion_written":false,"description_moved":false},{"source_key":"14010212:4:8","owner":"14010212","task":"4","join_step":"8","before_key":"14010212:4:4","decision":"duplicate_join_title","title_cn":"查看斐利尔的宝藏","summary_cn":"看看斐利尔都留了什么宝藏。","pre_step_ids":["4","5","6","7"],"child_titles_cn":{"4":"查看斐利尔的宝藏","5":"查看斐利尔的宝藏","6":"查看斐利尔的宝藏","7":"查看斐利尔的宝藏"},"native_group":[4,5,6,7],"completion_written":false,"description_moved":false},{"source_key":"15010109:3:10","owner":"15010109","task":"3","join_step":"10","before_key":"15010109:3:8","decision":"phase_heading","title_cn":"与二人对话","summary_cn":"初代梅林坦白她就是女神艾雅，并表示只有利用狩猎神神陨的力量才能将你送回去。前路凶险，你需要劝说二人留下来。","pre_step_ids":["8","9"],"child_titles_cn":{"8":"与加拉对话","9":"与那非对话"},"native_group":[8,9],"completion_written":false,"description_moved":false},{"source_key":"15010110:2:5","owner":"15010110","task":"2","join_step":"5","before_key":"15010110:2:2","decision":"phase_heading","title_cn":"解除三个封印之楔","summary_cn":"与初代梅林对话，解除三个封印。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"完成支线<sprite name=spui_icon_minimap_task_other_1>解除物质之楔","3":"完成支线<sprite name=spui_icon_minimap_task_other_1>解除精神之楔","4":"完成支线<sprite name=spui_icon_minimap_task_other_1>解除权能之楔"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"15010238:1:4","owner":"15010238","task":"1","join_step":"4","before_key":"15010238:1:2","decision":"duplicate_join_title","title_cn":"寻找相关笔记","summary_cn":"别想丰饶堕神的事了，先找到悬液的炼制配方吧。","pre_step_ids":["2","3"],"child_titles_cn":{"2":"寻找相关笔记","3":"寻找相关笔记"},"native_group":[2,3],"completion_written":false,"description_moved":false},{"source_key":"11010106:1:5","owner":"11010106","task":"1","join_step":"5","before_key":"11010106:1:2","before_asset":"ep1/quest_story_11106021","decision":"phase_heading","title_cn":"使用<b><color=#D0B0A3>战舞</color></b>与观众打招呼","summary_cn":"一路走来，索恩与阿尔萨也收获了一些支持者，这些支持者们会为参赛者加油打气！使用战歌节特有的战舞，与他们打招呼吧！","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"使用<b><color=#D0B0A3>战舞</color></b>与支持者招呼","3":"使用<b><color=#D0B0A3>战舞</color></b>与观众招呼","4":"使用<b><color=#D0B0A3>战舞</color></b>与他人支持者打招呼"},"native_group":[2,3,4],"completion_written":false,"description_moved":false,"observation":"User recording/screenshot,2026-10-20: conversation ends, War Dance becomes available, then Mikola Slim while three Use War Dance objectives are active.","evidence":{"file":"provenance:analysis/part1_callbacks_20261020_v3/war_dance_research.json","sha256":"1252a92e652b2897e5f6a01bbefddf466320e109985cb681d2b8f0ad01a465ec"}}];
  // END_REVIEWED_OBJECTIVE_TITLE_CONTRACTS

  // Exact wording supplied from an English recording and Japanese screenshots,
  // 2026-10-10. Installed targets for these sources are empty in both languages.
  const recorded = {
    "10010528": {
      description: {
        cn: "白雪纷飞的季节，与亲朋好友团聚的隆冬节到了，你与霍根一同主办了热闹晚宴，和朋友们交换了礼物与祝福，还亲手烤了蛋糕！隆冬节快乐！",
        en: "Snowflakes are swirling, and the Winter Carnival is here! It's the season to gather with your favorite people and share laughter and joy. With Hogan by your side, you've thrown a lively banquet, swapped heartfelt gifts and wishes, and even baked a cake yourself! Cheers to a magical Winter Carnival!",
        jp: "白雪舞う季節。家族や友人と集まって祝う冬祭りがやってきた。あなたはホーガンと共に賑やかなパーティーを開き、手作りケーキを皆に振る舞う。友人たちとプレゼントを交換し、互いに祝福を贈り合おう。素敵な冬祭りを！",
      },
      objectives: {
        "10010528:3:12": { cn: "采集浆果", en: "Gather Berries", jp: "ベリーの採集" },
      },
    },
  };

  function fill(value, reference) {
    if (!reference || value?.cn !== reference.cn) return value;
    let result = value;
    for (const language of ["en", "jp", "kr"]) {
      const wording = reference[language];
      if (value[language] || value._saved?.[language] || !wording) continue;
      result = { ...result, [language]: wording };
    }
    return result;
  }

  function fromQuest(quest) {
    const reference = recorded[String(quest.line_id)];
    const description = fill(quest.description, reference?.description);
    const tasks = new Map((quest.tasks || []).map(task => [String(task.task_id), task]));
    const objectiveTitlePlacements = [];
    for (const contract of reviewedObjectiveTitles) {
      if (String(quest.line_id) !== contract.owner) continue;
      const task = tasks.get(contract.task), byId = new Map((task?.steps || []).map(step => [String(step.step_id), step]));
      const source = byId.get(contract.join_step);
      if (!source || source.objective_title?.cn !== contract.title_cn
          || (source.objective_description?.cn || "") !== contract.summary_cn
          || JSON.stringify(source.pre_step_ids) !== JSON.stringify(contract.pre_step_ids)
          || (contract.before_asset && !(quest.assets || []).some(asset=>asset.asset_key===contract.before_asset))
          || !Object.entries(contract.child_titles_cn).every(([id, title]) => byId.get(id)?.objective_title?.cn === title)) continue;
      const heading = contract.decision === "phase_heading" ? {
        objective_key: "", objective_title_i18n: source.objective_title,
        objective_title_source_cn: source.objective_title_source_cn,
        objective_title_status: source.objective_title_status,
        objective_title_record_index: source.objective_title_record_index,
        objective_summary_i18n: {}, objective_summary_source_cn: "",
        objective_presentation_role: "task_heading", objective_heading_source_key: contract.source_key,
      } : null;
      objectiveTitlePlacements.push({sourceKey: contract.source_key, beforeKey: contract.before_key, heading,
        beforeAsset: contract.before_asset || "", displayDecision: contract.decision});
    }
    // Reader-supplied gameplay review, 2026-10-18: this is the inquiry phase's
    // heading. Keep the source join step and its return-to-Hogan description
    // intact; a display heading is not an earlier completion of that step.
    const inquiry = tasks.get("1"), opening = inquiry?.steps?.find(step => String(step.step_id) === "1");
    const join = inquiry?.steps?.find(step => String(step.step_id) === "5");
    if (String(quest.line_id) === "10010101"
        && opening?.objective_description?.cn === "听从霍根的建议，先在城中四处逛逛，也许能收集到什么信息。"
        && join?.objective_title?.cn === "去城中打听"
        && join?.objective_description?.cn === "是时候回去寻找霍根了！"
        && JSON.stringify(join.pre_step_ids) === JSON.stringify(["2", "3", "4"])) {
      objectiveTitlePlacements.push({sourceKey: "10010101:1:5", beforeKey: "10010101:1:2",
        heading: {objective_key: "", objective_title_i18n: join.objective_title,
          objective_title_source_cn: join.objective_title_source_cn,
          objective_title_status: join.objective_title_status,
          objective_title_record_index: join.objective_title_record_index,
          objective_summary_i18n: {}, objective_summary_source_cn: "",
          objective_presentation_role: "task_heading", objective_heading_source_key: "10010101:1:5"}});
    }
    const taskStartObjectives = {};
    for (const asset of quest.assets || []) {
      if (asset.step_id || !/^ExplTask\.RecvAction\./.test(asset.evidence_source || "")) continue;
      const step = tasks.get(String(asset.task_id))?.steps?.[0];
      if (!step || !step.objective_title?.cn) continue;
      taskStartObjectives[asset.asset_key] = {
        objective_title_i18n: fill(step.objective_title,
          reference?.objectives?.[`${quest.line_id}:${asset.task_id}:${step.step_id}`]),
        objective_summary_i18n: step.objective_description,
        // This is a heading, not an activity or quest-state transition.
        intro_objective_key: `${quest.line_id}:${asset.task_id}:${step.step_id}`,
      };
    }
    const fields = [[quest.description, description]];
    for (const task of quest.tasks || []) for (const step of task.steps || []) {
      fields.push([step.objective_title, fill(step.objective_title,
        reference?.objectives?.[`${quest.line_id}:${task.task_id}:${step.step_id}`])]);
    }
    const transcribedFields = [reference?.description, ...Object.values(reference?.objectives || {})].filter(Boolean);
    const recordingLocalizationLanguages = ["en", "jp", "kr"].filter(language => (
      fields.some(([original, filled]) => original?.[language] !== filled?.[language]
        || (original?._references?.[language]?.status === "recording_transcript"
          && transcribedFields.some(field => field.cn === original?.cn && field[language] === original?.[language])))
    ));
    return { description, taskStartObjectives, objectiveTitlePlacements,
      encounterRewards: quest.encounter_rewards || [],
      recordingLocalization: recordingLocalizationLanguages.length > 0,
      recordingLocalizationLanguages };
  }

  function recordingNote(story, language) {
    if (!story?.recordingLocalizationLanguages?.includes(language)) return "";
    if (language === "en") return "Missing English summary and ‘Gather Berries’ wording transcribed from an English game recording supplied by the reader.";
    if (language === "jp") return "Missing Japanese summary and ‘ベリーの採集’ wording transcribed from Japanese game screenshots supplied by the reader.";
    return "";
  }

  function objectiveFields(story, reference) {
    const title = fill(story.objective_title_i18n, reference?.objectives?.[story.objective_key]);
    return title === story.objective_title_i18n ? story : { ...story,
      objective_title_i18n: title, objective_title_status: "recording_transcript" };
  }

  function forAsset(story, logicalStory) {
    if (!story) return story;
    const reference = recorded[String(story.exploration_line_id)];
    let result = objectiveFields(story, reference);
    const intro = !story.objective_key && logicalStory.taskStartObjectives?.[story.asset_key];
    if (intro) result = { ...result, intro_objective: intro };
    for (const position of ["before", "after"]) {
      const field = `objective_interludes_${position}`;
      if (!story[field]) continue;
      const entries = story[field].map(entry => objectiveFields(entry, reference));
      if (entries.some((entry, index) => entry !== story[field][index])) result = { ...result, [field]: entries };
    }
    for (const placement of logicalStory.objectiveTitlePlacements || []) {
      if (placement.heading && (placement.beforeAsset ? story.asset_key === placement.beforeAsset : story.objective_key === placement.beforeKey)) {
        const before = result.objective_interludes_before || [];
        if (!before.some(entry => entry.objective_heading_source_key === placement.sourceKey)) {
          result = {...result, objective_interludes_before: [...before, placement.heading]};
        }
      }
      for (const position of ["before", "after"]) {
        const field = `objective_interludes_${position}`;
        if (!result[field]) continue;
        const entries = [], headingPresent = result[field].some(entry => entry.objective_heading_source_key === placement.sourceKey);
        for (const entry of result[field]) {
          if (placement.heading && !placement.beforeAsset && !headingPresent && entry.objective_key === placement.beforeKey) entries.push(placement.heading);
          entries.push(entry.objective_key !== placement.sourceKey ? entry : {
            ...entry, objective_title_i18n: {}, objective_title_source_cn: "",
            objective_heading_presented_at: placement.beforeKey,
          });
        }
        result = {...result, [field]: entries};
      }
    }
    return result;
  }

  return { fromQuest, forAsset, recordingNote };
});

;
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StoryLocaleReferences = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Wiki passages verified against speakers and adjacent dialogue, 2026-10-11.
  // CC-BY-SA community content; attribution is shown in the reader footer.
  // Native locale files remain authoritative and are not modified.
  const sources = {
    shared: { title: "AFK Journey Wiki — Shared Moments",
      url: "https://afk-journey.fandom.com/wiki/Timeless_Gala/Shared_Moments" },
    fall: { title: "AFK Journey Wiki — Fall’s Prelude",
      url: "https://afk-journey.fandom.com/wiki/Fall_Carnival/Fall%27s_Prelude" },
  };
  const references = [
    { asset: "mn/quest_story_10297250", keys: ["say:8:1029725007:0"],
      hash: "0x4810EAAE66B83766", source: "shared",
      text: "Rowan quickly outlines his plans, goals, and the reason for visiting." },
    { asset: "mn/quest_story_10297290", keys: ["say:36:1029729021:0"],
      hash: "0x21408638BCDD5B65", source: "shared",
      text: "Very well, let's go. I'll walk with you a bit before heading back to review your proposal." },
    { asset: "mn/quest_story_10297620", keys: ["say:14:1029762010:0"],
      hash: "0x75AB5DE7CBECF4A9", source: "shared",
      text: "Yeah. You know him, <style=\"highlight\">Pinder</style>, the local rep for this area." },
    { asset: "ep2/gameplay_story_12600010", keys: ["say:18:1260001012:0"],
      hash: "0xF8087C2A5F973467", source: "fall",
      text: "I asked someone who knows their stuff. They said the ship can sail. With a little magical guidance, it'll head exactly where it needs to go." },
    { asset: "ep2/gameplay_story_12600010", keys: ["say:19:1260001013:0"],
      hash: "0x63605C37F2E2CCFF", source: "fall",
      text: "Apparently, it can <style=\"highlight\">reveal a magical game board and trigger a grand adventure</style>, or something like that." },
    { asset: "ep2/gameplay_story_12600030", keys: ["say:24:1260003016:0"],
      hash: "0x0D6A368FA5886C32", source: "fall",
      text: "Are you after the <style=\"highlight\">Void Relic</style> Hodgkin made off with?" },
    { asset: "ep2/gameplay_story_12600030", keys: ["say:35:1260003023:1", "choice_prompt:36:1260003023"],
      hash: "0xE9D85B8606846EEE", source: "fall",
      text: "In short, she's not with the Dead Tide Fleet and isn't seeking the Void Relic. That green monster's mischief was just her acting on a whim..." },
    { asset: "ep2/gameplay_story_12600030", keys: ["say:40:1260003028:1", "choice_prompt:42:1260003028"],
      hash: "0xB0499526C105F6AF", source: "fall",
      text: "And with that, I bid you farewell." },
    { asset: "ep2/gameplay_story_12600100", keys: ["say:15:1260010009:1"],
      hash: "0xD2BDB1142D4AADA5", source: "fall",
      text: "If they had truly transformed permanently, Rustport could have been overrun by them in no time." },
  ];

  // Exact cinematic actor identities, cross-checked against DialogueActor,
  // other dialogue by that actor, and the game's localized speaker names.
  // Never infer a name from a placeholder actor (e.g. actor 1 / Chris).
  const cinematicSpeakers = [
    { source: "黑魔法师", actor: "955", model: "blackmagician",
      assets: ["timeline/timeline_story_13110830", "timeline/timeline_story_13110880"],
      names: { en: "Cyran", jp: "ディアグレス", kr: "딜그레이" } },
    { source: "大主教", actor: "953", model: "zhujiaohuman",
      assets: ["timeline/timeline_story_13110860"],
      names: { en: "Hierophant Novik", jp: "ノヴィツキー大主教", kr: "노비츠키 대주교" } },
    { source: "大公", actor: "936", model: "duke",
      assets: ["timeline/timeline_story_13110880"],
      names: { en: "Archduke Sigmund", jp: "ヴァレサ大公", kr: "바레샤 대공" } },
  ];

  function applySpeakerNames(asset, language, locale, graph) {
    let result = locale;
    for (const reference of cinematicSpeakers) {
      if (!reference.assets.includes(asset) || !reference.names[language]) continue;
      const key = `speaker:${reference.source}`, row = locale?.speakers?.[key];
      if (!row || row.source !== reference.source || (row.text && row.text !== reference.source)) continue;
      const lines = Object.values(graph?.nodes || {}).filter(node => node.speaker_key === key);
      if (!lines.length || lines.some(node => !["subtitle", "cinematic_dialogue"].includes(node.entry_kind)
          || String(node.speaker_actor_id) !== reference.actor || node.speaker_actor_model !== reference.model)) continue;
      if (result === locale) result = { ...locale, speakers: { ...locale.speakers } };
      result.speakers[key] = { ...row, text: reference.names[language], status: "official_actor_reference" };
    }
    return result;
  }

  function apply(asset, language, locale, graph) {
    locale = applySpeakerNames(asset, language, locale, graph);
    if (!["en", "jp", "kr"].includes(language) || !locale?.texts) return locale;
    let result = locale;
    for (const reference of references) {
      if (reference.asset !== asset) continue;
      for (const key of reference.keys) {
        const row = locale.texts[key];
        // Scope by asset, node key, source hash and the explicitly empty target
        // status. A later native translation (including gender variants) wins.
        if (row?.hash_xxh64 !== reference.hash || row.status !== "target_text_empty"
          || row.male || row.female) continue;
        if (result === locale) result = { ...locale, texts: { ...locale.texts } };
        result.texts[key] = { ...row, text: reference.text,
          status: language === "en" ? "wiki_reference_en" : "english_reference_fallback",
          reference_source: reference.source };
      }
    }
    return result;
  }

  function credit(row, language) {
    if (!row?.reference_source || !sources[row.reference_source]) return null;
    const source = sources[row.reference_source];
    return { ...source, kind: "wiki_localization", language,
      license: "CC-BY-SA", licenseUrl: "https://www.fandom.com/licensing" };
  }

  return { apply, applySpeakerNames, credit, references };
});

;
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

;
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoryChapters=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function install(source,catalog,story,line,logical){
    if(!logical)return source;
    const plans=(catalog?.placements?.[source.asset_key]||[]).filter(plan=>plan.line===String(line)
      && plan.step===story.objective_key);
    if(!plans.length||source.nodes['chapter:before:0']||source.nodes['chapter:after:0'])return source;
    const graph=structuredClone(source);
    function chain(entries,target,prefix){
      for(let i=entries.length-1;i>=0;i--){const id=prefix+i;
        graph.nodes[id]={id,type:'line',entry_kind:'chapter_artwork',chapter_artwork:entries[i],next:target};target=id;}
      return target;
    }
    const after=plans.filter(plan=>plan.timing==='after');
    if(after.length){
      const ends=new Set(Object.values(graph.nodes).filter(node=>node.type==='end'&&!node.next).map(node=>node.id));
      if(ends.size){const target=chain(after,[...ends][0],'chapter:after:');
        for(const node of Object.values(graph.nodes)){
          if(node.entry_kind==='chapter_artwork')continue;
          for(const field of ['next','target','skip','return_to'])if(ends.has(node[field]))node[field]=target;
          for(const option of node.options||[])if(ends.has(option.target))option.target=target;
        }
        graph.roots=graph.roots.map(id=>ends.has(id)?target:id);
      }
    }
    const before=plans.filter(plan=>plan.timing==='before');
    if(before.length&&graph.roots.length===1)graph.roots=[chain(before,graph.roots[0],'chapter:before:')];
    return graph;
  }
  function gallery(catalog,collection,lineVisible=()=>true,chapterSourceTitle=''){
    return Object.values(catalog?.chapters||{}).filter(chapter=>chapter.collection===collection
      && (!chapterSourceTitle || chapter.title_i18n.cn===chapterSourceTitle)).map(chapter=>{
      if(!Object.keys(chapter.branches||{}).length)return chapter;
      return {...chapter,branches:Object.fromEntries(Object.entries(chapter.branches).filter(([,branch])=>
        !branch.lines?.length||branch.lines.some(lineVisible)))};
    });
  }
  function petalReadingPlan(asset){
    // Main-story order is fixed. These three festival activities may be read
    // in any order, so only their displayed counts are adjustable.
    const stages = {
      'ep3/quest_story_13102200':0, 'ep3/quest_story_13102230':1,
      'ep3/quest_story_13102300':2, 'ep3/quest_story_13102260':3,
      'ep3/quest_story_13102340':4, 'ep3/quest_story_13103520':5,
      'ep3/quest_story_13104130':6, 'ep3/quest_story_13105230':7,
    };
    const count=stages[asset];
    return count===undefined ? null : {key:asset,count,options:count>=2&&count<=4 ? [2,3,4] : []};
  }
  function collectionCards(source,catalog,story,line,logical){
    const plan=catalog?.placements?.[source.asset_key];
    if(!plan || (line&&plan.owner!==String(line)) || (story.objective_key&&plan.step!==story.objective_key)
      || (logical&&(!line||!story.objective_key)))return source;
    const id='collection-card:'+plan.source_node_id;
    if(source.nodes[id])return source;
    const card=catalog.cards?.[plan.card_id],target=source.nodes[plan.before_node];
    const count=card?.source_conditions?.length;
    if(!card||card.completion_written!==false||!Number.isInteger(count)||count<1
      ||card.stages?.length!==count+1||!target
      ||target.source_node_id!==plan.next_source_node_id)throw Error('Collection card source boundary changed.');
    const graph=structuredClone(source);
    for(const node of Object.values(graph.nodes)){
      for(const key of ['next','target','skip','return_to'])if(node[key]===plan.before_node)node[key]=id;
      for(const option of node.options||[])if(option.target===plan.before_node)option.target=id;
    }
    graph.roots=graph.roots.map(root=>root===plan.before_node?id:root);
    graph.nodes[id]={id,type:'line',entry_kind:'chapter_artwork',source_node_id:plan.source_node_id,
      chapter_artwork:{...card,kind:'collection_card',card_id:plan.card_id,
        reading: String(plan.card_id)==='1001' ? petalReadingPlan(source.asset_key) : null},next:plan.before_node};
    return graph;
  }
  return {install,gallery,collectionCards,petalReadingPlan};
});

;
/* Verified PictureView points, with progress local to the current reader session. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.StoryInspections=api;
})(typeof globalThis==='object'?globalThis:this,function() {
  const key=(asset,id)=>`${asset}::${id}`;
  function install(graph,contexts,catalog,group,logical) {
    if(!logical || !graph?.stats?.part_count) return graph;
    const byAsset=new Map(contexts.map(context=>[context.assetKey,context]));
    for(const line of Object.values(catalog?.picture_inspections?.lines || {})) {
      if(line.logical_group!==group) continue;
      for(const inspection of line.groups) {
        const first=inspection.members[0],header=graph.nodes[key(first,'asset_context')];
        const native=inspection.plan.evidence.inspection_points;
        // Install only complete, already verified groups with one terminal return
        // per child. Preserve unfamiliar graphs instead of changing their exits.
        if(!header || native.length!==inspection.members.length) continue;
        const points=native.map((point,index)=> {
          const context=byAsset.get(point.asset_key);
          const ends=Object.values(context?.graph.nodes || {}).filter(node=>node.type==='end');
          return {index,asset:point.asset_key,plot:point.plot,
            target:context?.graph.roots?.length===1 ? key(point.asset_key,context.graph.roots[0]) : '',
            end:ends.length===1 ? key(point.asset_key,ends[0].id) : ''};
        });
        if(points.some((point,index)=>point.asset!==inspection.members[index]
          || !graph.nodes[point.target] || !graph.nodes[point.end])) continue;
        const continuation=graph.nodes[points.at(-1).end].next;
        if(!continuation || !graph.nodes[continuation]) continue;
        const id=key(first,`inspection:${inspection.step}`);
        graph.nodes[id]={id,type:'inspection',step:inspection.step,plan:inspection.plan,points,next:continuation};
        header.next=id;
        for(const point of points) {
          const end=graph.nodes[point.end];
          graph.nodes[point.end]={...end,type:'inspection_return',inspection:id,point:point.asset,next:id};
        }
      }
    }
    return graph;
  }
  function progress(session,node) {
    const record=session.local(node.id).inspection_read || {};
    const read=node.points.filter(point=>record[point.asset]===true).map(point=>point.asset);
    return {read,total:node.points.length,complete:node.points.length>0 && read.length===node.points.length};
  }
  function markRead(session,node,asset) {
    if(!node?.points.some(point=>point.asset===asset)) throw new Error('Unknown inspection point.');
    (session.local(node.id).inspection_read ||= {})[asset]=true;
    return progress(session,node);
  }
  function select(session,node,asset) {
    const point=node.points.find(point=>point.asset===asset);
    if(!point) throw new Error('Unknown inspection point.');
    return {point,replay:progress(session,node).read.includes(asset)};
  }
  function complete(session,node) {
    if(!progress(session,node).complete) throw new Error('Read every inspection point before continuing.');
    return node.next;
  }
  function point(catalog,group,asset) {
    for(const line of Object.values(catalog?.picture_inspections?.lines || {})) {
      if(line.logical_group!==group) continue;
      for(const inspection of line.groups) {
        const index=inspection.members.indexOf(asset);
        if(index>=0) return {index,step:inspection.step};
      }
    }
    return null;
  }
  return {install,progress,markRead,select,complete,point};
});

;
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
