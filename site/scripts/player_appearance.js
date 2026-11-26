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
