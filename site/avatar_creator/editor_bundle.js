void 0;
/* Data and selection rules shared by the standalone UI and Node checks. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Wardrobe=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SLOTS=['outfit','hair','face','skin','eyes','head','mask','cloak','back','beard','makeup','bodypaint','bodyshape','footprint'];
  const POSES=[['normal','Neutral'],['think_loop','Thinking'],['angry_loop','Angry'],['happy','Happy'],['sad','Sad']];
  const OPTIONAL=new Set(['head','mask','cloak','back','beard','makeup','bodypaint','footprint']);
  const normalize=values=>Object.fromEntries(SLOTS.map(key=>[key,values?.[key]||0]));
  const key=(gender,values)=>[gender,...SLOTS.map(slot=>values?.[slot]||0)].join(':');
  const label=(item,gender)=>item?.genders?.[gender]?.name||item?.name||'None';
  const SORT_OPTIONS=[['id:asc','ID ascending'],['id:desc','ID descending'],['name:asc','Name ascending'],['name:desc','Name descending']];
  function setupSortMenu(select,remember){
    for(const [value,label] of SORT_OPTIONS)select.add(new Option(label,value));
    if(!remember)return;
    const key='afk.reader.wardrobe.sort';
    try{
      const saved=sessionStorage.getItem(key);
      if(SORT_OPTIONS.some(([value])=>value===saved))select.value=saved;
    }catch(_){ /* Sorting still works if browser storage is unavailable. */ }
    select.addEventListener('change',()=>{
      try{sessionStorage.setItem(key,select.value);}catch(_){}
    });
  }
  const compareIds=new Intl.Collator(undefined,{numeric:true});
  const LANG_TAGS={en:'en',cn:'zh-Hans',jp:'ja',kr:'ko'};
  const documentLang=language=>LANG_TAGS[language]||'en';
  function expandCatalogueItem(item,hasExternalDetails=false){
    const genders={};
    for(const [gender,data] of Object.entries(item.genders||{})){
      genders[gender]={
        name:data.name||item.name,
        icon:data.icon??null,
        assetName:data.assetName||'',
        issue:data.issue||'',
        supported:data.supported!==false,
        ...(data.previewLod?{previewLod:data.previewLod}:{}),
        ...(data.names||item.names?{names:data.names||item.names}:{}),
      };
    }
    return {
      ...item,
      description:item.description||'',
      enabled:item.enabled!==false,
      order:item.order||0,
      swatch:item.swatch||'',
      setIds:item.setIds||[],
      excludeIds:item.excludeIds||[],
      excludeTypes:item.excludeTypes||[],
      genders,
      ...(hasExternalDetails?{detailsPending:true}:{}),
    };
  }
  function expandCatalogue(catalogue){
    if(!catalogue||!Array.isArray(catalogue.items))return catalogue;
    if(!catalogue.compact&&!catalogue.detailsManifest)return catalogue;
    const hasExternalDetails=Boolean(catalogue.detailsManifest);
    return {...catalogue,items:catalogue.items.map(item=>expandCatalogueItem(item,hasExternalDetails))};
  }
  function mergeCatalogueDetails(itemsById,details){
    const entries=details?.items||{};
    for(const item of itemsById.values()){
      const extra=entries[String(item.id)];
      if(extra){
        if(extra.description!==undefined)item.description=extra.description;
        if(extra.descriptions)item.descriptions=extra.descriptions;
        if(extra.setIds)item.setIds=extra.setIds;
        if(extra.assets){
          for(const [gender,assetName] of Object.entries(extra.assets)){
            if(item.genders?.[gender])item.genders[gender].assetName=assetName;
          }
        }
      }
      delete item.detailsPending;
    }
  }
  function itemDetailContent(item,gender,language,locale){
    const title=locale.label(item,gender,language);
    if(item?.detailsPending)return {title,description:''};
    // A description that only repeats the name (the Default outfit) stays blank.
    const described=locale.description(item,language);
    return {title,description:described===title?'':described};
  }
  function bindReaderFrameFit(sendHeight,onLayout){
    const tall=window.parent.matchMedia('(min-height: 560px)');
    const main=document.querySelector('main');
    const report=()=>{
      const fit=tall.matches;
      document.documentElement.classList.toggle('reader-fit',fit);
      if(onLayout)onLayout(fit);
      sendHeight(fit?null:Math.max(480,main.offsetHeight));
    };
    tall.addEventListener('change',report);
    new ResizeObserver(report).observe(main);
    report();
    return report;
  }
  function sortRows(rows,field,direction,language){
    const locale=documentLang(language);
    const byName=field==='name' ? new Intl.Collator(locale) : null;
    return rows.sort((a,b)=>(!!b.pinned-!!a.pinned) || direction*((byName && byName.compare(a.sortName,b.sortName)) || compareIds.compare(a.sortId,b.sortId)));
  }
  // The Default outfit is the basic body; it leads the outfit list in every sort.
  function isBasicOutfit(item){
    return item?.slot==='outfit'&&Object.values(item.genders||{}).some(entry=>/_body_00_show$/.test(entry?.assetName||''));
  }
  // Where the 2D and 3D libraries live: beside the editors in development, or in the
  // release repositories that a public reader names in its config (TEA_CONFIG).
  function libraryBase(key,fallback,root=globalThis){
    let config=root.TEA_CONFIG;
    try{if(root.parent&&root.parent!==root&&root.parent.TEA_CONFIG)config=root.parent.TEA_CONFIG;}catch(_){/* Only a same-origin reader shares its config. */}
    const value=typeof config?.[key]==='string'?config[key].trim():'';
    return new URL(value?value.replace(/\/*$/,'/'):fallback,root.location.href);
  }
  // Hero headgear (game type 18, the "Mini" heroes) mounts where other headwear does, so both
  // share the head slot and one replaces the other. The game lists them apart, and so do we.
  const HERO_HEADGEAR=18;
  const categorySlot=category=>category==='herohead'?'head':category;
  const itemCategory=item=>item?.slot==='head'&&item.typeId===HERO_HEADGEAR?'herohead':item?.slot;
  const browseCategories=rows=>rows.flatMap(row=>row.id==='head'?[row,{id:'herohead',name:'Hero headgear'}]:[row]);
  // Phones can hide the reader's bars and the look-name row, giving the wardrobe the whole screen.
  const EXPAND_PATHS={false:'M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5',true:'M12 3v18M7 4l5 5 5-5M7 20l5-5 5 5'};
  function bindExpand(button,media,report){
    const root=document.documentElement;
    const set=on=>{
      on=!!on&&media.matches;
      root.classList.toggle('wardrobe-expanded',on);
      button.setAttribute('aria-pressed',String(on));
      button.querySelector('path')?.setAttribute('d',EXPAND_PATHS[on]);
      return on;
    };
    button.addEventListener('click',()=>report(set(!root.classList.contains('wardrobe-expanded'))));
    media.addEventListener('change',()=>{if(!media.matches&&root.classList.contains('wardrobe-expanded'))report(set(false));});
    set(false);
    return set;
  }
  // Reuse the live stage in a modal: no second renderer, asset downloads or image capture.
  function bindPreviewFullscreen(stage,report,controls=[]){
    const root=document.documentElement,dialog=document.createElement('dialog');
    dialog.className='wardrobe-preview-dialog';dialog.setAttribute('aria-label','Full screen');
    const button=(label,text,cls)=>{
      const b=document.createElement('button');b.type='button';b.className=cls;
      b.setAttribute('aria-label',label);b.title=label;b.textContent=text;return b;
    };
    const open=button('Full screen','','fullscreen-toggle');
    open.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
    const close=button('Close full screen','×','preview-close');
    const actions=document.createElement('div');actions.className='preview-fullscreen-controls';
    for(const [original,label,text] of controls){
      const proxy=button(label,text,'');proxy.onclick=()=>original.click();
      const sync=()=>{proxy.disabled=original.disabled;};sync();
      new MutationObserver(sync).observe(original,{attributes:true,attributeFilter:['disabled']});
      actions.append(proxy);
    }
    dialog.append(close,actions);document.body.append(dialog);stage.append(open);
    let placeholder=null;
    open.onclick=()=>{
      if(dialog.open)return;
      placeholder=document.createComment('wardrobe preview');stage.before(placeholder);
      dialog.prepend(stage);root.classList.add('wardrobe-inspecting');
      stage.dispatchEvent(new CustomEvent('wardrobe-inspect',{detail:true}));
      dialog.showModal();close.focus({preventScroll:true});report(true);
    };
    close.onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{
      if(!placeholder)return;
      placeholder.replaceWith(stage);placeholder=null;root.classList.remove('wardrobe-inspecting');
      stage.dispatchEvent(new CustomEvent('wardrobe-inspect',{detail:false}));
      report(false);open.focus({preventScroll:true});
    });
    return dialog;
  }
  function familyKey(item){return item.colorGroup?`${item.slot}:${item.typeId}:${item.colorGroup}`:item.id;}
  function bindHorizontalWheel(row,media){
    row.addEventListener('wheel',event=>{
      if(media && !media.matches || event.ctrlKey || event.metaKey || row.scrollWidth<=row.clientWidth)return;
      const unit=event.deltaMode===1 ? row.clientHeight : event.deltaMode===2 ? row.clientWidth : 1;
      if(Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
      event.preventDefault();
      row.scrollLeft+=event.deltaY*unit;
    },{passive:false});
  }
  // Phones caption the preview with the selected item, so the catalogue keeps its rows.
  function placeItemDetail(detail,stage,media){
    const home=detail.parentNode,next=detail.nextSibling;
    const place=()=>{
      if(media.matches)stage.append(detail);
      else home.insertBefore(detail,next?.parentNode===home?next:null);
    };
    media.addEventListener('change',place);place();
  }
  function replacePoseButtons(row,buttons){
    const left=row.scrollLeft;
    const focusedPose=row.contains(document.activeElement) ? document.activeElement.dataset.pose : null;
    row.replaceChildren(...buttons);
    row.scrollLeft=left;
    const focused=focusedPose && buttons.find(button=>button.dataset.pose===focusedPose && !button.disabled);
    if(focused){
      focused.focus({preventScroll:true});
      const tab=focused.getBoundingClientRect(),strip=row.getBoundingClientRect();
      if(tab.right>strip.right)row.scrollLeft+=tab.right-strip.right;
      else if(tab.left<strip.left)row.scrollLeft+=tab.left-strip.left;
    }
  }
  function bindOptionsPanel(panel,toggle,back){
    let catalogueScroll=0;
    function show(open){
      if(open)catalogueScroll=panel.scrollTop;
      panel.classList.toggle('options-open',open);
      toggle.setAttribute('aria-expanded',String(open));
      panel.scrollTop=open?0:catalogueScroll;
      (open?back:toggle).focus({preventScroll:true});
    }
    toggle.onclick=()=>show(!panel.classList.contains('options-open'));
    back.onclick=()=>show(false);
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!event.defaultPrevented&&panel.classList.contains('options-open')){
        event.preventDefault();show(false);
      }
    });
  }
  const ITEM_DEPENDENCIES={body:['outfit','skin'],hair:['hair'],face:['face','skin','eyes','hair'],head:['head'],cloak:['cloak'],back:['back'],mask:['mask'],beard:['beard']};
  const SKIN_OVERLAYS={body:'bodypaint',face:'makeup'};
  function createItemIndex(library){
    const parts=new Map(),appearance=new Map(),invisible=new WeakMap();
    if(library?.schema!=='afk.wardrobe.items'||![1,2,3].includes(library.version)||library.validation?.passed!==true)return ()=>null;
    const dependencies=library.version>=2?{...ITEM_DEPENDENCIES,body:['outfit'],face:['face']}:ITEM_DEPENDENCIES;
    if(library.version===3){dependencies.body.push('bodyshape');dependencies.face.push('bodyshape');}
    const partKey=(group,gender,pose,yaw,ids)=>[group,gender,pose,yaw,...dependencies[group].map(slot=>ids[slot]||0)].join(':');
    for(const part of library.parts||[]){
      if(!ITEM_DEPENDENCIES[part.group]||!part.validated)continue;
      parts.set(partKey(part.group,part.gender,part.pose,part.yaw,part.avatarIds),part);
    }
    // Only selected parts need a patch lookup. Many availability rows share one patch list.
    function patchOptions(patches){
      if(appearance.has(patches))return appearance.get(patches);
      const slots=new Map(),overlays=new Map();
      for(const patch of patches||[]){
        if(patch.slot==='makeup'||patch.slot==='bodypaint'){
          const key=[patch.slot,patch.avatarId,patch.skinId].join(':');
          if(!overlays.has(key))overlays.set(key,patch);
        }else{
          if(!slots.has(patch.slot))slots.set(patch.slot,new Map());
          const choices=slots.get(patch.slot);
          if(!choices.has(patch.avatarId))choices.set(patch.avatarId,patch);
        }
      }
      const options={slots,overlays};
      appearance.set(patches,options);
      return options;
    }
    return (state,pose=state.pose||'normal',yaw=state.yaw||0)=>{
      const ids=normalize(state.avatarIds);
      for(const [slot,emptyIds] of Object.entries(library.emptyOptions||{}))if(emptyIds.includes(ids[slot]))ids[slot]=0;
      if(library.version===3&&!ids.bodyshape)ids.bodyshape=59;
      if(ids.footprint||(library.version<3&&ids.bodyshape))return null;
      const selected=[];
      for(const group of Object.keys(ITEM_DEPENDENCIES)){
        if(['head','cloak','back','mask','beard'].includes(group)&&!ids[group])continue;
        const part=parts.get(partKey(group,state.gender,pose,yaw,ids));if(!part)return null;selected.push(part);
      }
      const first=selected[0];if(!first||selected.some(p=>p.calibration!==first.calibration))return null;
      const layers=[];
      const appliedOverlays=new Set();
      for(const part of selected){
        const overlaySlot=SKIN_OVERLAYS[part.group];
        if(overlaySlot&&ids[overlaySlot]&&part.invisibleOverlays?.length){
          if(!invisible.has(part))invisible.set(part,new Set(part.invisibleOverlays));
          if(invisible.get(part).has([overlaySlot,ids[overlaySlot],ids.skin].join(':')))appliedOverlays.add(overlaySlot);
        }
        for(const layer of part.layers||[]){
        const patches=[];
        const options=patchOptions(layer.patches);
        for(const [slot,choices] of options.slots){
          const patch=choices.get(ids[slot]);if(!patch)return null;patches.push(patch);
        }
        const slot=SKIN_OVERLAYS[part.group];
        if(slot&&ids[slot]){
          const patch=options.overlays.get([slot,ids[slot],ids.skin].join(':'));
          if(patch){patches.push(patch);appliedOverlays.add(slot);}
        }
        layers.push({...layer,patches});
        }
      }
      if(Object.values(SKIN_OVERLAYS).some(slot=>ids[slot]&&!appliedOverlays.has(slot)))return null;
      return {kind:'items',framing:{focusX:.5,focusYTop:.24,zoom:4},entry:{
        width:library.width,height:library.height,farClip:first.farClip,lightVS:first.lightVS,profile:library.profile,lut:library.lut,
        layers,surfaces:selected.flatMap(p=>p.surfaces||[]),partIds:selected.map(p=>p.id),
        source:'independent-items',gender:state.gender,avatarIds:ids,pose,yaw
      }};
    };
  }
  function createIndex(catalogue,captures,itemLibrary=null){
    const items=new Map(catalogue.items.map(item=>[item.id,item])),views=new Map();
    function insert(gender,ids,pose,yaw,value){const k=key(gender,ids)+'/'+pose+'/'+yaw;if(!views.has(k))views.set(k,value);}
    // A measured layer capture takes priority over a baked appearance with the same recipe.
    for(const entry of captures.cases)if(!entry.error&&entry.validated===true)insert(entry.gender,entry.avatarIds,entry.pose,entry.yaw||0,{kind:entry.captureMode==='complete-unity'?'capture':'layers',entry,framing:{focusX:.5,focusYTop:.24,zoom:4}});
    for(const preset of catalogue.presets)for(const [pose,portrait] of Object.entries(preset.poses))insert(preset.gender,preset.recipe,pose,0,{kind:'baked',preset,portrait,framing:portrait.framing});
    const reusable=createItemIndex(itemLibrary);
    const resolve=(state,pose=state.pose||'normal',yaw=state.yaw||0)=>reusable(state,pose,yaw)||views.get(key(state.gender,state.avatarIds)+'/'+pose+'/'+yaw)||null;
    const available=(state,slot,id)=>!!resolve({...state,avatarIds:{...state.avatarIds,[slot]:id}});
    return {items,resolve,available,views};
  }
  function parseRecipe(source,items){
    if(typeof source!=='string'||source.length>131072)throw new Error('Choose a wardrobe recipe smaller than 128 KB.');
    let value;try{value=JSON.parse(source.replace(/^\uFEFF/,''));}catch(_){throw new Error('This file is not a JSON wardrobe recipe.');}
    if(value.schema!=='afk.wardrobe.recipe'||value.version!==1||!['female','male'].includes(value.gender))throw new Error('Unsupported wardrobe recipe.');
    if(!value.avatarIds||typeof value.avatarIds!=='object'||Array.isArray(value.avatarIds))throw new Error('The recipe needs avatar IDs.');
    for(const [slot,id] of Object.entries(value.avatarIds)){
      if(!SLOTS.includes(slot)||!Number.isSafeInteger(id)||id<0||id>2147483647)throw new Error('Invalid avatar ID or wardrobe category.');
      if(id&&(!items.has(id)||items.get(id).slot!==slot))throw new Error('An item is missing from this catalogue or belongs to a different category: '+id);
    }
    return {gender:value.gender,avatarIds:normalize(value.avatarIds),pose:'normal',yaw:0,name:String(value.name||'Imported look').slice(0,80)};
  }
  const exportRecipe=state=>({schema:'afk.wardrobe.recipe',version:1,name:String(state.name||'My Merlin').slice(0,80),gender:state.gender,avatarIds:normalize(state.avatarIds)});
  function conflicts(state,items){
    const selected=Object.values(state.avatarIds).filter(Boolean).map(id=>items.get(id)).filter(Boolean),messages=new Set();
    for(const item of selected){
      for(const other of selected)if(other!==item&&((item.excludeIds||[]).includes(other.id)||(item.excludeTypes||[]).includes(other.typeId)))messages.add(label(item,state.gender)+' and '+label(other,state.gender)+' have a game compatibility rule.');
      if(item.genders?.[state.gender]?.issue)messages.add(label(item,state.gender)+': '+item.genders[state.gender].issue);
    }
    return [...messages];
  }
  function randomLook(state,index,presets,random=Math.random){
    const {gender}=state;
    const original=key(gender,state.avatarIds);
    const usable=look=>index.resolve(look,'normal',0)&&!conflicts(look,index.items).length;
    const alternatives=presets.filter(p=>p.gender===gender&&p.poses.normal)
      .map(p=>({...state,avatarIds:normalize(p.recipe)}))
      .filter(look=>key(gender,look.avatarIds)!==original&&usable(look));
    const seed=alternatives.length?alternatives[Math.floor(random()*alternatives.length)]:state;
    const next={...state,name:'',avatarIds:normalize(seed.avatarIds)};
    next.avatarIds.footprint=0;
    const choices=new Map();
    for(const item of index.items.values()){
      if(item.slot==='footprint'||item.enabled===false||!item.genders?.[gender])continue;
      if(!choices.has(item.slot))choices.set(item.slot,[]);
      choices.get(item.slot).push(item.id);
    }
    for(const slot of SLOTS){
      const pool=choices.get(slot);
      if(!pool?.length)continue;
      const previous=next.avatarIds[slot];
      if(OPTIONAL.has(slot)&&random()<.5){
        next.avatarIds[slot]=0;
        if(usable(next))continue;
      }
      // Draw without replacement until the complete combination has a front portrait.
      while(pool.length){
        const i=Math.floor(random()*pool.length);
        next.avatarIds[slot]=pool[i];
        pool[i]=pool[pool.length-1];pool.pop();
        if(usable(next))break;
        next.avatarIds[slot]=previous;
      }
    }
    if(key(gender,next.avatarIds)===original)next.avatarIds=normalize(seed.avatarIds);
    if(key(gender,next.avatarIds)===original||!usable(next))return null;
    if(!index.resolve(next))next.yaw=0;
    if(!index.resolve(next))next.pose='normal';
    return next;
  }
  const CRC=Uint32Array.from({length:256},(_,x)=>{for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);return x>>>0;});
  function crc32(bytes){let c=0xffffffff;for(const n of bytes)c=(c>>>8)^CRC[(c^n)&255];return(c^0xffffffff)>>>0;}
  // ZIP STORE keeps PNG bytes unchanged and needs no third-party download or build step.
  function zip(files){
    const chunks=[],central=[];let offset=0,size=0;
    for(const file of files){
      const name=new TextEncoder().encode(file.name),bytes=file.bytes,crc=crc32(bytes),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);h.set(name,30);
      const d=new Uint8Array(46+name.length),dv=new DataView(d.buffer);dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);dv.setUint16(14,0x21,true);dv.setUint32(16,crc,true);dv.setUint32(20,bytes.length,true);dv.setUint32(24,bytes.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);d.set(name,46);
      chunks.push(h,bytes);central.push(d);offset+=h.length+bytes.length;size+=d.length;
    }
    const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,size,true);view.setUint32(16,offset,true);
    return new Blob([...chunks,...central,end],{type:'application/zip'});
  }
  return {SLOTS,POSES,OPTIONAL,documentLang,expandCatalogueItem,expandCatalogue,mergeCatalogueDetails,itemDetailContent,bindReaderFrameFit,setupSortMenu,bindOptionsPanel,bindHorizontalWheel,placeItemDetail,bindExpand,bindPreviewFullscreen,libraryBase,categorySlot,itemCategory,browseCategories,replacePoseButtons,familyKey,sortRows,isBasicOutfit,randomLook,ITEM_DEPENDENCIES,normalize,key,label,createItemIndex,createIndex,parseRecipe,exportRecipe,conflicts,zip,crc32};
});

;
/* Availability stays complete; detailed capture metadata loads by selected view. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WardrobeLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function matches(pointer, head) {
    return head.ok && (Number(head.headers.get('Content-Length')) === pointer.bytes ||
      ['"' + pointer.identityTag + '-gzip"', '"' + pointer.identityTag + '-identity"'].includes(head.headers.get('ETag'))) &&
      Math.floor(Date.parse(head.headers.get('Last-Modified')) / 1000) === pointer.modifiedSeconds;
  }

  function expandPatchScope(scope, slots) {
    if (!Array.isArray(scope)) throw Error('Invalid wardrobe appearance scope.');
    if (!scope.length || !Array.isArray(scope[0])) return scope;
    const patches = [];
    for (const entry of scope) {
      const slot = slots[entry[0]];
      if (entry.length === 2) {
        for (const avatarId of entry[1]) patches.push({ slot, avatarId });
      } else {
        const skinId = entry[1];
        for (const avatarId of entry[2]) patches.push({ slot, avatarId, skinId });
      }
    }
    return patches;
  }

  function expandInvisibleOverlays(entry, slots) {
    if (!Array.isArray(entry) || !entry.length || !Array.isArray(entry[0])) return entry;
    const overlays = [];
    for (const [slotIdx, skinId, ids] of entry) {
      const slot = slots[slotIdx];
      for (const avatarId of ids) overlays.push(slot + ':' + avatarId + ':' + skinId);
    }
    return overlays;
  }

  function expandAvatarIds(group, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (Array.isArray(value)) {
      if (group === 'body') return { outfit: value[0], bodyshape: value[1] };
      if (group === 'face') return { face: value[0], bodyshape: value[1] };
    }
    if (typeof value === 'number') return { [group]: value };
    return value || {};
  }

  function expandCoverage(library) {
    if (library.compact !== 1) {
      const scopes = library.patchScopes;
      if (!Array.isArray(scopes)) throw Error('Invalid wardrobe availability index.');
      for (const part of library.parts) {
        for (const layer of part.layers) {
          if (!Array.isArray(scopes[layer.patchScope])) throw Error('Invalid wardrobe appearance scope.');
          layer.patches = scopes[layer.patchScope];
          delete layer.patchScope;
        }
      }
      delete library.patchScopes;
      return library;
    }
    const slots = library.slots || [];
    const calibrations = library.calibrations || [];
    const rawScopes = library.patchScopes;
    const rawInvisible = library.invisibleOverlays || [[]];
    if (!Array.isArray(rawScopes) || !library.views || typeof library.views !== 'object') {
      throw Error('Invalid wardrobe availability index.');
    }
    const scopes = rawScopes.map(scope => expandPatchScope(scope, slots));
    const invisibleSets = rawInvisible.map(entry => expandInvisibleOverlays(entry, slots));
    const parts = [];
    for (const [viewKey, groups] of Object.entries(library.views)) {
      const [gender, pose, yawText] = viewKey.split('/');
      const yaw = Number(yawText);
      for (const [group, rows] of Object.entries(groups)) {
        for (const row of rows) {
          const [idVal, calIdx, layersVal, invIdx = 0, validFlag = 1] = row;
          const layerIndices = Array.isArray(layersVal) ? layersVal : [layersVal];
          const layers = layerIndices.map(scopeIdx => {
            if (!Array.isArray(scopes[scopeIdx])) throw Error('Invalid wardrobe appearance scope.');
            return { patches: scopes[scopeIdx] };
          });
          const part = {
            group,
            gender,
            pose,
            yaw,
            avatarIds: expandAvatarIds(group, idVal),
            validated: validFlag !== 0,
            layers,
          };
          if (calIdx >= 0) part.calibration = calibrations[calIdx];
          if (invIdx > 0 && invisibleSets[invIdx]) part.invisibleOverlays = invisibleSets[invIdx];
          parts.push(part);
        }
      }
    }
    const expanded = { ...library, parts };
    delete expanded.compact;
    delete expanded.slots;
    delete expanded.calibrations;
    delete expanded.invisibleOverlays;
    delete expanded.patchScopes;
    delete expanded.views;
    return expanded;
  }

  function expandViewShard(value) {
    if (value.compact !== 1) return value;
    const { gender, pose, yaw } = value;
    const slots = value.slots || [];
    const packs = value.packs || [];
    const rects = value.rects || [];
    const calibrations = value.calibrations || [];
    const farClips = value.farClips || [];
    const lightVSs = value.lightVSs || [];

    const expandRef = ref => {
      if (typeof ref !== 'string') return ref;
      const hash = ref.indexOf('#');
      if (hash <= 0) return ref;
      const index = Number(ref.slice(0, hash));
      if (!Number.isInteger(index) || index < 0 || index >= packs.length) return ref;
      return packs[index] + ref.slice(hash);
    };

    const expandPatch = patch => {
      if (!Array.isArray(patch)) return patch;
      const slot = slots[patch[0]];
      const avatarId = patch[1];
      const ref = expandRef(patch[2]);
      const rect = rects[patch[3]];
      if (patch.length === 4) {
        return { slot, delta: ref, avatarId, rect };
      }
      if (patch.length === 5) {
        return { slot, avatarId, skinId: patch[4], rect, blend: ref };
      }
      return { slot, delta: ref, avatarId, skinId: patch[4], rect };
    };

    const expandSurface = surface => {
      if (!Array.isArray(surface.levels) || !surface.levels.length || !Array.isArray(surface.levels[0])) {
        return surface;
      }
      return {
        ...surface,
        levels: surface.levels.map(([depth, color, transmission]) => ({
          depth: expandRef(depth),
          color: expandRef(color),
          transmission: expandRef(transmission),
        })),
      };
    };

    const parts = value.parts.map(part => {
      if (!('cal' in part)) return part;
      const layers = part.layers.map(layer => {
        if (!Array.isArray(layer)) return layer;
        return {
          id: layer[0],
          base: expandRef(layer[1]),
          gbuffer: expandRef(layer[2]),
          patches: layer[3] ? layer[3].map(expandPatch) : [],
        };
      });
      const surfaces = part.surfaces ? part.surfaces.map(expandSurface) : [];
      const expanded = {
        id: part.id,
        group: part.group,
        layers,
        surfaces,
        farClip: farClips[part.far],
        lightVS: lightVSs[part.light],
        gender,
        pose,
        yaw,
        avatarIds: part.avatarIds,
        validated: part.validated !== false,
        calibration: calibrations[part.cal],
      };
      if ('invisibleOverlays' in part) expanded.invisibleOverlays = part.invisibleOverlays;
      return expanded;
    });

    const expanded = { ...value, parts };
    delete expanded.compact;
    delete expanded.gender;
    delete expanded.pose;
    delete expanded.yaw;
    delete expanded.slots;
    delete expanded.packs;
    delete expanded.rects;
    delete expanded.calibrations;
    delete expanded.farClips;
    delete expanded.lightVSs;
    return expanded;
  }

  // `first`: views ("gender/pose/yaw") to download alongside the availability index.
  // When an opening micro-shard exists for a requested view, download that tiny shard
  // instead of pulling thousands of unrelated parts before Merlin becomes editable.
  async function open(pointer, read, first = []) {
    if (pointer.schema !== 'afk.wardrobe.runtime' || ![1, 2].includes(pointer.version)) {
      throw Error('Unsupported runtime library.');
    }
    const early = new Map();
    const earlyOpening = new Map();
    for (const key of first) {
      if (pointer.openingShards?.[key] && !earlyOpening.has(key)) {
        const request = read(pointer.openingShards[key]);
        request.catch(() => {});
        earlyOpening.set(key, request);
      } else if (pointer.shards?.[key] && !early.has(key)) {
        const request = read(pointer.shards[key]);
        request.catch(() => {});
        early.set(key, request);
      }
    }

    const rawCoverage = await read(pointer.coverage);
    if (!rawCoverage.metadataOnly) throw Error('Invalid wardrobe availability index.');
    const library = expandCoverage(rawCoverage);
    if (library.parts.length !== pointer.parts) throw Error('Invalid wardrobe availability index.');

    const shards = new Map();
    const pending = new Map();
    const openingShards = new Map();
    const openingPending = new Map();

    function validateView(raw, gender, pose, yaw) {
      const value = expandViewShard(raw);
      if (value.metadataOnly || value.schema !== library.schema || value.version !== library.version ||
          value.validation?.passed !== true ||
          value.parts.some(p => p.gender !== gender || p.pose !== pose || p.yaw !== yaw)) {
        throw Error('Invalid wardrobe view metadata.');
      }
      return value;
    }

    async function opening(gender, pose, yaw = 0) {
      const key = [gender, pose, yaw].join('/');
      if (openingShards.has(key)) return openingShards.get(key);
      if (openingPending.has(key)) return openingPending.get(key);
      const info = pointer.openingShards?.[key];
      if (!info) return null;
      const request = (earlyOpening.get(key) || read(info)).then(raw => {
        const value = validateView(raw, gender, pose, yaw);
        openingShards.set(key, value);
        while (openingShards.size > 2) openingShards.delete(openingShards.keys().next().value);
        return value;
      }).finally(() => openingPending.delete(key));
      earlyOpening.delete(key);
      openingPending.set(key, request);
      return request;
    }

    async function ensure(gender, pose, yaw = 0) {
      const key = [gender, pose, yaw].join('/');
      if (shards.has(key)) {
        const value = shards.get(key);
        shards.delete(key);
        shards.set(key, value);
        return value;
      }
      if (pending.has(key)) return pending.get(key);
      const info = pointer.shards[key];
      if (!info) return { ...library, metadataOnly: false, parts: [] };
      const request = (early.get(key) || read(info)).then(raw => {
        const value = validateView(raw, gender, pose, yaw);
        shards.set(key, value);
        while (shards.size > 2) shards.delete(shards.keys().next().value);
        return value;
      }).finally(() => pending.delete(key));
      early.clear();   // a guess the opening look didn't use is dropped
      pending.set(key, request);
      return request;
    }

    function viewDigest(gender, pose, yaw) {
      const shard = pointer.shards?.[[gender, pose, yaw].join('/')]?.sha256;
      if (shard && pointer.portraitAssetsSha256) return shard + '/' + pointer.portraitAssetsSha256;
    }

    return { library, ensure, opening, totalParts: pointer.parts, viewDigest };
  }

  return { matches, open };
});

;
/* Exact constant-background crops. Rendering reads them without full expansion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BufferView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const cropped=b=>b?.cropped===true;
  function valid(b,length){
    if(b instanceof Float32Array)return b.length===length;
    if(!cropped(b)||!(b.data instanceof Float32Array)||!(b.background instanceof Float32Array))return false;
    const [x,y,w,h]=b.rect||[];
    return [b.width,b.height,b.channels,x,y,w,h].every(Number.isSafeInteger)&&Math.min(b.width,b.height,x,y,w,h)>=0&&[1,4].includes(b.channels)&&
      x+w<=b.width&&y+h<=b.height&&b.length===length&&length===b.width*b.height*b.channels&&b.data.length===w*h*b.channels&&b.background.length===b.channels;
  }
  function get(b,i){
    if(!cropped(b))return b[i];
    const c=i%b.channels,p=(i-c)/b.channels,x=p%b.width,y=Math.floor(p/b.width),[left,bottom,w,h]=b.rect;
    return x>=left&&x<left+w&&y>=bottom&&y<bottom+h?b.data[((y-bottom)*w+x-left)*b.channels+c]:b.background[c];
  }
  function bounds(b,width,height,channel,predicate){
    return cropped(b)&&!predicate(b.background[channel])?b.rect:[0,0,width,height];
  }
  function materialize(b){
    if(!cropped(b))return b.slice();
    // Copy words, including signed zero/NaN payloads, rather than convert values.
    const words=new Uint32Array(b.length),background=new Uint32Array(b.background.buffer,b.background.byteOffset,b.channels);
    if(background.some(v=>v!==0))for(let i=0;i<words.length;i++)words[i]=background[i%b.channels];
    const [left,bottom,w,h]=b.rect,data=new Uint32Array(b.data.buffer,b.data.byteOffset,b.data.length);
    for(let y=0;y<h;y++)words.set(data.subarray(y*w*b.channels,(y+1)*w*b.channels),((bottom+y)*b.width+left)*b.channels);
    return new Float32Array(words.buffer);
  }
  return {cropped,valid,get,bounds,materialize};
});

;
/* Rear-view presentation rules for independent captures. Native QA keeps its
 * original compositor and depths; these disposable copies only affect the studio. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClothingFit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const B=typeof module==='object'&&module.exports?require('./buffer-view.js'):globalThis.BufferView,read=(b,i)=>B.get(b,i);
  const PELVIS_TAILS=new Set([84,162,163,535,735,736]);
  const ROLES=new Set(['body','cloak','back','hair','face']);
  function describe(entry,library,catalogue){
    if(entry.source!=='independent-items'||entry.yaw!==180||!entry.avatarIds?.cloak&&!entry.avatarIds?.back)return null;
    const selected=new Set(entry.partIds),layers=[],surfaces=[];
    for(const part of library.parts){
      if(!selected.has(part.id)||!ROLES.has(part.group))continue;
      for(const layer of part.layers){
        const skinMask=part.group==='body'?(layer.patches||[]).find(p=>p.slot==='skin'&&p.rect[2]>0&&p.rect[3]>0):null;
        layers.push({id:layer.id,group:part.group,...(skinMask?{skinMask:{rect:skinMask.rect,delta:skinMask.delta}}:{})});
      }
      for(const surface of part.surfaces)surfaces.push({id:surface.id,group:part.group});
    }
    const back=catalogue.items.find(item=>item.id===entry.avatarIds.back);
    return {version:1,yaw:180,layers,surfaces,tail:PELVIS_TAILS.has(back?.id)||/\btail\b/i.test(back?.name||'')};
  }
  function apply(layers,surfaces,context,metadata){
    const unchanged={layers,surfaces,changedPixels:0};
    if(metadata?.version!==1||metadata.yaw!==180)return unchanged;
    const {width,height,farClip}=context,pixels=width*height,epsilon=.002;
    const layerRoles=new Map(metadata.layers.map(l=>[l.id,l.group])),surfaceRoles=new Map(metadata.surfaces.map(s=>[s.id,s.group]));
    const max={body:new Float32Array(pixels),cloak:new Float32Array(pixels),back:new Float32Array(pixels)};
    const solidBack=new Float32Array(pixels);
    const valid=d=>d>0&&d<farClip-.001;
    // Protect the scalp and hair around the head; tuck only the hanging length.
    let headBottom=height;
    const headBounds=(buffer,channel)=>{const [x0,y0,w,h]=B.bounds(buffer,width,height,channel,valid),channels=channel===2?4:1;
      for(let y=y0;y<Math.min(y0+h,headBottom);y++)for(let x=x0;x<x0+w;x++)if(valid(read(buffer,(y*width+x)*channels+channel))){headBottom=y;return;}
    };
    for(const layer of layers)if(layerRoles.get(layer.id)==='face')headBounds(layer.gbuffer,2);
    for(const surface of surfaces)if(surfaceRoles.get(surface.id)==='face')for(const level of surface.levels)headBounds(level.depth,0);
    for(const layer of layers){const group=layerRoles.get(layer.id);if(!max[group])continue;
      const depths=max[group],[left,bottom,w,h]=B.bounds(layer.gbuffer,width,height,2,valid);
      for(let y=bottom;y<bottom+h;y++)for(let x=left;x<left+w;x++){const p=y*width+x,d=read(layer.gbuffer,p*4+2);if(valid(d)&&d>depths[p])depths[p]=d;}
    }
    solidBack.set(max.back);
    for(const surface of surfaces){const group=surfaceRoles.get(surface.id);if(!max[group])continue;
      const depths=max[group];for(const level of surface.levels){const [left,bottom,w,h]=B.bounds(level.depth,width,height,0,valid);
        for(let y=bottom;y<bottom+h;y++)for(let x=left;x<left+w;x++){const p=y*width+x,d=read(level.depth,p);if(valid(d)&&d>depths[p])depths[p]=d;
          // Solid equipment is often exported through an alpha/effect shader.
          // Zero transmission identifies its genuinely opaque pixels.
          if(group==='back'&&valid(d)&&[0,1,2,3].every(k=>Math.abs(read(level.transmission,p*4+k))<1e-6))solidBack[p]=Math.max(solidBack[p],d);
        }
      }
    }
    // A skin palette delta identifies exposed skin without another capture.
    // Preserve hands/arms when they are genuinely closer than the accessories.
    const skin=new Uint8Array(pixels);
    for(const row of metadata.layers){const patch=row.skinMask;if(row.group!=='body'||!patch)continue;
      const [left,bottom,w,h]=patch.rect;
      if(!B.valid(patch.delta,w*h*4)||left<0||bottom<0||left+w>width||bottom+h>height)throw new Error('Invalid clothing-fit skin mask.');
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        if(Math.max(Math.abs(read(patch.delta,i)),Math.abs(read(patch.delta,i+1)),Math.abs(read(patch.delta,i+2)))>1e-7)skin[(bottom+y)*width+left+x]=1;
      }
    }
    const tuck=new Uint8Array(pixels),bodyFloor=new Float32Array(pixels),cloakFloor=new Float32Array(pixels),backFloor=new Float32Array(pixels),hairFloor=new Float32Array(pixels);
    let affected=0;
    for(let p=0;p<pixels;p++){
      let cloak=max.cloak[p],back=max.back[p];
      if(!cloak&&!back)continue;
      // Where a tail passes over the dressed body's silhouette, let the cloak
      // cover its base. The portion emerging beyond the outfit stays outside.
      if(metadata.tail&&max.body[p]>0&&cloak>0&&back>0){tuck[p]=1;backFloor[p]=cloak+epsilon;back=Math.max(back,backFloor[p]);}
      else if(cloak>0&&back>0){cloakFloor[p]=back+epsilon;cloak=Math.max(cloak,cloakFloor[p]);}
      if(!skin[p])bodyFloor[p]=Math.max(cloak,back)+epsilon;
      // Long hair sits beneath solid back equipment. Use only opaque coverage:
      // veils/FX retain their measured transparency, and tails keep native hair order.
      if(!metadata.tail&&solidBack[p]>0&&Math.floor(p/width)<headBottom)hairFloor[p]=farClip;
      affected++;
    }
    if(!affected)return unchanged;
    const floors={body:bodyFloor,cloak:cloakFloor,back:backFloor,hair:hairFloor};let changedPixels=0;
    const fittedLayers=layers.map(layer=>{
      const group=layerRoles.get(layer.id),floor=floors[group];if(!floor)return layer;
      let gbuffer=layer.gbuffer;
      for(let p=0;p<pixels;p++){
        const d=read(layer.gbuffer,p*4+2),next=floor[p];
        if(next>d&&valid(d)){if(gbuffer===layer.gbuffer)gbuffer=B.materialize(gbuffer);gbuffer[p*4+2]=group==='hair'?next:Math.min(next,farClip-.002);changedPixels++;}
      }
      return gbuffer===layer.gbuffer?layer:{...layer,gbuffer};
    });
    // Preserve every native color/transmission buffer and each surface's own
    // triangle order. Only depth eligibility and the cross-item draw order move.
    const fitSurface=(surface,group,rank,region=null)=>{
      const floor=floors[group];
      const levels=surface.levels.map(level=>{
        let depth=level.depth;
        for(let p=0;p<pixels;p++){
          const d=read(level.depth,p);if(!valid(d))continue;
          const excluded=region==='root'?!tuck[p]:region==='outer'?!!tuck[p]:false;
          const next=excluded?farClip:Math.max(d,floor?.[p]||0);
          if(next!==d){if(depth===level.depth)depth=B.materialize(depth);depth[p]=next;changedPixels++;}
        }
        return depth===level.depth?level:{...level,depth};
      });
      return {...surface,id:surface.id+(region?'/fit-'+region:''),queue:rank*100000+surface.queue,levels};
    };
    const fittedSurfaces=surfaces.flatMap(surface=>{
      const group=surfaceRoles.get(surface.id);
      if(group==='back'&&metadata.tail)return [fitSurface(surface,group,.5,'root'),fitSurface(surface,group,2,'outer')];
      return [fitSurface(surface,group,group==='body'?0:group==='cloak'?1:group==='back'?2:3)];
    });
    return {layers:fittedLayers,surfaces:fittedSurfaces,changedPixels};
  }
  return {describe,apply};
});

;
/* Local front-lock depth guides for reusable 2D hair captures. A guide belongs
 * to a hairstyle/pose, never an outfit pairing. Color, normals and silhouette
 * remain untouched; face, hands and more distant back hair keep native depth. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HairFit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const B=typeof module==='object'&&module.exports?require('./buffer-view.js'):globalThis.BufferView,read=(b,i)=>B.get(b,i);
  const CALIBRATION='5d25c09198628cfd2d2c998fc804dbf66b3575397230d81dcfc9450c91e6ba2d';
  const FRONT_POSES=new Set(['normal','think_loop','standing','angry_loop','helpless','wow']);
  // Reviewed opaque front-hair families. Color variants share the same test.
  const REVIEWED={female:new Set([226, 258, 302, 317, 325, 572, 895, 903, 944, 1037, 1045]),male:new Set([87, 179, 361, 572, 649, 681])};
  const guides={
    normal:{depth:8.18,polygon:[[533,357],[550,357],[550,407],[541,425],[515,443],[493,455],[482,480],[472,477],[477,450],[494,433],[521,413],[530,386]]},
    think_loop:{depth:8.115,polygon:[[541,358],[558,358],[555,407],[545,425],[517,440],[489,451],[471,478],[460,477],[465,451],[487,434],[526,416],[538,391]]}
  };
  function describe(entry,library){
    const guide=guides[entry.pose];
    if(entry.source!=='independent-items'||entry.yaw!==0||entry.width!==1024||entry.height!==1536)return null;
    const selected=new Set(entry.partIds),parts=library.parts.filter(p=>selected.has(p.id));
    const original=entry.gender==='female'&&entry.avatarIds?.hair===1002&&guide&&parts.every(p=>p.calibration===CALIBRATION);
    const automatic=FRONT_POSES.has(entry.pose)&&REVIEWED[entry.gender]?.has(entry.avatarIds?.hair);
    if(!original&&!automatic)return null;
    const body=parts.find(p=>p.group==='body');
    const reference=automatic&&!original?library.parts.find(p=>p.group==='body'&&p.gender===entry.gender&&p.pose===entry.pose&&p.yaw===0&&p.avatarIds.outfit===246&&p.avatarIds.bodyshape===entry.avatarIds.bodyshape&&p.validated&&p.calibration===body?.calibration):null;
    if(!original&&!reference)return null;
    return {version:original?1:2,...(original?{guide}:{referenceBody:reference.layers.map(l=>l.gbuffer)}),layers:parts.flatMap(part=>part.layers.map(layer=>{
      const patch=part.group==='body'?(layer.patches||[]).find(p=>p.slot==='skin'&&p.rect[2]*p.rect[3]>0):null;
      return {id:layer.id,group:part.group,...(patch?{skinMask:{rect:patch.rect,delta:patch.delta}}:{})};
    }))};
  }
  function inside(x,y,polygon){
    let result=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [ax,ay]=polygon[i],[bx,by]=polygon[j];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)result=!result;
    }
    return result;
  }
  function apply(layers,context,metadata){
    const unchanged={layers,changedPixels:0};if(![1,2].includes(metadata?.version))return unchanged;
    const {width,height,farClip}=context,roles=new Map(metadata.layers.map(l=>[l.id,l.group]));
    const bodies=layers.filter(l=>roles.get(l.id)==='body'),others=layers.filter(l=>!['body','hair'].includes(roles.get(l.id)));
    if(!bodies.length)return unchanged;
    const skin=new Set();
    for(const row of metadata.layers){const patch=row.skinMask;if(!patch)continue;
      const [left,bottom,w,h]=patch.rect;
      if(!B.valid(patch.delta,w*h*4))throw Error('Invalid hair-fit skin mask.');
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;if(Math.max(Math.abs(read(patch.delta,i)),Math.abs(read(patch.delta,i+1)),Math.abs(read(patch.delta,i+2)))>1e-7)skin.add((bottom+y)*width+left+x);
      }
    }
    const valid=d=>d>0&&d<farClip-.001,automatic=metadata.version===2;let guide=metadata.guide,changedPixels=0,reference=null;
    if(automatic){
      const faces=layers.filter(l=>roles.get(l.id)==='face');let left=width,right=-1,top=height,bottom=-1;
      for(const face of faces){const [rx,ry,rw,rh]=B.bounds(face.gbuffer,width,height,2,valid);
        for(let by=ry;by<ry+rh;by++)for(let x=rx;x<rx+rw;x++)if(valid(read(face.gbuffer,(by*width+x)*4+2))){
          const y=height-1-by;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
      }
      if(right<left)return unchanged;
      const w=right-left+1,h=bottom-top+1,cx=(left+right)/2;
      left=Math.max(0,Math.floor(cx-1.5*w));right=Math.min(width-1,Math.ceil(cx+1.5*w));top=Math.max(0,Math.floor(bottom-.35*h));bottom=Math.min(height-1,Math.ceil(bottom+.85*h));
      guide={depth:farClip,polygon:[[left,top],[right+1,top],[right+1,bottom+1],[left,bottom+1]]};
      if(!metadata.referenceBody?.length||metadata.referenceBody.some(g=>!B.valid(g,width*height*4)))throw Error('Invalid hair-fit reference body.');
      reference=new Float32Array(width*height);reference.fill(farClip);
      // A strand qualifies only when it was already in front of the undressed
      // body. Extend shoulder depth upward through the empty collar area,
      // never through an existing arm, hand or chest surface.
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const p=(height-1-y)*width+x;
        for(let dy=0;dy<=56&&y+dy<height;dy++){
          const at=((height-1-y-dy)*width+x)*4+2;
          let d=farClip;for(const g of metadata.referenceBody)if(valid(read(g,at)))d=Math.min(d,read(g,at));
          if(valid(d)){reference[p]=d;break;}
        }
      }
    }
    const fitted=layers.map(layer=>{
      if(roles.get(layer.id)!=='hair')return layer;
      let gbuffer=layer.gbuffer;
      const minX=Math.max(0,Math.floor(Math.min(...guide.polygon.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...guide.polygon.map(p=>p[0]))));
      const minY=Math.max(0,Math.floor(Math.min(...guide.polygon.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...guide.polygon.map(p=>p[1]))));
      for(let top=minY;top<=maxY;top++)for(let x=minX;x<=maxX;x++){
        const p=(height-1-top)*width+x,i=p*4,d=read(layer.gbuffer,i+2);
        if(!valid(d)||d>guide.depth||skin.has(p)||!inside(x+.5,top+.5,guide.polygon))continue;
        if(automatic&&(!valid(reference[p])||d>reference[p]+.012))continue;
        const front=bodies.reduce((v,b)=>valid(read(b.gbuffer,i+2))?Math.min(v,read(b.gbuffer,i+2)):v,farClip);
        // Only a shallow collision with clothing is corrected. A raised arm,
        // face or accessory must still occlude the strand naturally.
        if(front>=d||d-front>.18||others.some(o=>valid(read(o.gbuffer,i+2))&&read(o.gbuffer,i+2)<=d))continue;
        if(gbuffer===layer.gbuffer)gbuffer=B.materialize(gbuffer);gbuffer[i+2]=Math.max(.001,front-.002);changedPixels++;
      }
      return gbuffer===layer.gbuffer?layer:{...layer,gbuffer};
    });
    return {layers:fitted,changedPixels};
  }
  return {describe,apply};
});

;
/* Reader language codes and game-native catalogue labels. No network translation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WardrobeLocale=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const messages={};
  const rows=`
Starry sky|星空|星空|별이 빛나는 하늘
Green fields|绿野|緑の草原|푸른 들판
Golden fields|金色原野|金色の草原|황금빛 들판
Moonlit fields|月下原野|月明かりの草原|달빛 들판
Misty fields|雾中原野|霧の草原|안개 낀 들판
Hearts|爱心|ハート|하트
Fireworks|烟花|花火|불꽃놀이
Golden pattern|金色纹样|金色の模様|황금빛 문양
3D Beta|3D 测试版|3D ベータ|3D 베타
This look needs the 3D wardrobe. Start a new 2D look to edit.|此造型需要 3D 衣橱。请新建 2D 造型。|このスタイルには3D衣装室が必要です。新しい2Dスタイルを作成してください。|이 외형은 3D 옷장이 필요합니다. 새 2D 외형을 만들어 주세요.
Merlin's Wardrobe|梅林的衣橱|マーリンのワードローブ|멀린의 옷장
Preview and combine cosmetics for Merlin.|预览并搭配梅林的装扮。|マーリンの衣装をプレビューして組み合わせましょう。|멀린의 외형을 미리 보고 조합하세요.
A LOOK OF YOUR OWN|你的专属造型|自分だけのスタイル|나만의 외형
Make it yours.|打造你的造型。|自分らしいスタイルに。|나만의 스타일을 완성하세요.
Explore Esperia’s wardrobe. Find your Merlin.|探索伊索米亚的衣橱，打造你的梅林。|エスペリアの衣装から、自分だけのマーリンを。|에스페리아의 의상으로 나만의 멀린을 만나세요.
Female|女|女性|여성
Male|男|男性|남성
Reset|重置|リセット|초기화
Back|背面|背面|뒷모습
Front|正面|正面|앞모습
Back to reader|返回阅读器|リーダーに戻る|리더로 돌아가기
Save and apply|保存并应用|保存して適用|저장 후 적용
Cosmetics|外观|コスチューム|코스튬
A wardrobe item from the current game catalogue.|来自当前游戏目录的衣橱物品。|ゲーム内のワードローブアイテムです。|현재 게임 목록에 있는 옷장 아이템입니다.
Changes your character’s physique while keeping the selected wardrobe.|更改角色体型，保留当前穿搭。|選択中の衣装のまま、キャラクターの体格を変更します。|선택한 의상을 유지하면서 캐릭터의 체형을 바꿉니다.
Options|选项|オプション|옵션
Look|造型|スタイル|외형
Random|随机|ランダム|무작위
Back to the wardrobe|返回衣橱|衣装室に戻る|옷장으로 돌아가기
Background|背景|背景|배경
No other preview-ready look is available.|没有其他可预览的造型。|ほかにプレビューできるスタイルがありません。|미리 볼 수 있는 다른 외형이 없습니다.
Reset look|重置造型|スタイルをリセット|외형 초기화
Download|下载|ダウンロード|다운로드
Download image (PNG)|下载图片 (PNG)|画像をダウンロード (PNG)|이미지 다운로드 (PNG)
Download this look as a transparent PNG|将此造型下载为透明PNG|このスタイルを透過PNGでダウンロード|이 외형을 투명 PNG로 다운로드
Sort items|排序|並べ替え|정렬
ID ascending|ID升序|ID昇順|ID 오름차순
ID descending|ID降序|ID降順|ID 내림차순
Name ascending|名称升序|名前昇順|이름 오름차순
Name descending|名称降序|名前降順|이름 내림차순
All categories|全部分类|すべてのカテゴリー|모든 카테고리
Clear the search or choose a complete look.|清除搜索或选择完整造型。|検索を解除するか、完成スタイルを選んでください。|검색을 지우거나 완성된 외형을 선택하세요.
Look name|造型名称|スタイル名|외형 이름
My Merlin|我的梅林|私のマーリン|나의 멀린
REUSABLE ITEM PREVIEW|独立部件预览|個別パーツのプレビュー|개별 아이템 미리보기
COMPLETE UNITY CAPTURE|完整捕获|完成スタイル画像|완성된 외형 이미지
COMPOSED PREVIEW|组合预览|合成プレビュー|조합 미리보기
CAPTURE NEEDED|需要捕获|撮影データが必要|캡처 필요
PREVIEW-READY|可预览|プレビュー可能|미리보기 가능
Brown|棕色|茶色|갈색
Green|绿色|緑|초록색
Blue|蓝色|青|파란색
Red|红色|赤|빨간색
Yellow|黄色|黄|노란색
White|白色|白|흰색
Black|黑色|黒|검은색
Purple|紫色|紫|보라색
Pink|粉色|ピンク|분홍색
Silver|银色|銀|은색
Gold|金色|金|금색
Gray|灰色|グレー|회색
Sky blue|天蓝色|空色|하늘색
Language|语言|言語|언어
{name} is unavailable for this look.|此造型无法使用{name}。|このスタイルでは{name}を利用できません。|현재 외형에서는 {name}을 사용할 수 없습니다.
Colors for {name}|{name}的颜色|{name}の色|{name} 색상
Remove {name}|移除{name}|{name}を外す|{name} 제거
Select {name}|选择{name}|{name}を選択|{name} 선택
CURRENT LOOK|当前造型|現在のスタイル|현재 외형
PREVIEW|预览|プレビュー|미리보기
Right-drag to zoom · zoom in to pan vertically|按住右键拖动缩放 · 放大后可上下平移|右ドラッグでズーム・拡大後は上下に移動|오른쪽 드래그로 확대/축소 · 확대 후 위아래 이동
Reset view|重置视图|表示をリセット|보기 초기화
Hand on Hip|叉腰|腰に手を当てる|우쭐
Standing|站立|立つ|차렷
Thinking|思考|熟考|고민
Rage|愤怒|激昂|분노
Helpless|无奈|しょうがない|유감
Wow|艳羡|いいなぁ|부러움
Shy|害羞|恥ずかしい|부끄
Dignified|威严|威厳|위엄
Confident|自信|自信|도도
Contemplative|沉思|考え込む|명상
Delighted|愉悦|ニコニコ|자신만만
Backdrop|背景|背景|배경
Studio|工作室|スタジオ|스튜디오
Light|浅色|明るい背景|밝게
Transparency|透明|透過|투명
View|视图|表示|보기
Full body|全身|全身|전신
Portrait|肖像|ポートレート|인물
Layer order|图层顺序|レイヤー順|레이어 순서
Outfit → Cloak → Back|服装 → 披风 → 背饰|衣装 → マント → 背中|의상 → 망토 → 등 장식
Original depth|原始深度|元の奥行き|원래 깊이
Tail bases tuck beneath the cloak where it covers the outfit.|披风覆盖服装时，尾巴根部藏在披风下。|マントが衣装を覆う部分では、尻尾の付け根をマントの下に隠します。|망토가 의상을 덮는 부분에서는 꼬리 밑부분이 망토 아래로 들어갑니다.
Keep front hair over collars|前侧发束显示在衣领上方|前髪を襟の手前に表示|앞쪽 머리카락을 옷깃 위로 표시
Lighting & effects|光照与特效|照明とエフェクト|조명 및 효과
Capture lighting|原始光照|撮影時の照明|캡처 조명
Baked into portrait|已包含在肖像中|画像に適用済み|이미지에 포함됨
Rim lighting|轮廓光|リムライト|윤곽 조명
Bloom|泛光|ブルーム|블룸
Color grading|色彩分级|カラーグレーディング|색 보정
Effects use a fixed captured frame.|特效使用固定帧。|エフェクトは固定フレームです。|효과는 고정된 프레임을 사용합니다.
This capture includes the original Unity lighting and effects.|此图包含原始光照和特效。|この画像には元の照明とエフェクトが含まれています。|이 이미지에는 원래 조명과 효과가 포함되어 있습니다.
Rim lighting, bloom and grading use the capture profile. Effects are a fixed frame.|轮廓光、泛光和色彩使用捕获设置。特效为固定帧。|撮影設定のリムライト、ブルーム、色補正を使用します。エフェクトは固定フレームです。|캡처 설정의 윤곽 조명, 블룸, 색 보정을 사용합니다. 효과는 고정 프레임입니다.
Preview-ready|可预览|プレビュー可能|미리보기 가능
Capture needed|需要捕获|撮影データが必要|캡처 필요
Complete looks|完整造型|完成スタイル|완성된 외형
Outfits|服装|衣装|의상
Hair|发型|髪型|헤어
Face|脸型|顔|얼굴형
Skin|肤色|肌の色|피부
Eyes|瞳色|目の色|동공
Headwear|头饰|頭飾り|머리 장식
Hero headgear|英雄头饰|英雄頭装飾|영웅 머리 장식
Stretch|展开|広げる|늘리기
Full screen|全屏|全画面|전체 화면
Close full screen|关闭全屏|全画面を閉じる|전체 화면 닫기
Masks|面饰|マスク|액세서리
Cloaks|披风|マント|망토
Back & tails|背饰与尾巴|背中・尻尾|등 장식 및 꼬리
Beards|胡子|ひげ|수염
Makeup|脸部妆容|メイク|메이크업
Body paint|身体彩绘|ペイント|보디 페인팅
Body shape|体型|体型|체형
Body build|体型|体型|체형
Type A|类型A|タイプA|타입 A
Type B|类型B|タイプB|타입 B
Wardrobe|衣橱|ワードローブ|옷장
Sort by|排序|並べ替え|정렬 기준
Name|名称|名前|이름
Ascending|升序|昇順|오름차순
Descending|降序|降順|내림차순
None|无|なし|없음
Remove this part|移除此部件|このパーツを外す|이 부위 제거
Default|默认|デフォルト|기본
Search names or avatar IDs…|搜索名称或外观ID…|名前・アバターIDを検索…|이름 또는 아바타 ID 검색…
Search wardrobe|搜索衣橱|ワードローブを検索|옷장 검색
No matching items|无匹配物品|一致するアイテムがありません|일치하는 아이템 없음
Clear the search, choose a complete look, or turn off Preview-ready to browse the full list.|清除搜索、选择完整造型，或关闭“可预览”查看全部。|検索を解除するか完成スタイルを選ぶか、「プレビュー可能」をオフにしてください。|검색을 지우거나 완성된 외형을 선택하세요. 전체 목록은 '미리보기 가능'을 끄면 볼 수 있습니다.
Refresh previews|刷新预览|プレビューを更新|미리보기 새로고침
Checking…|检查中…|確認中…|확인 중…
Previews are up to date.|预览已是最新。|プレビューは最新です。|미리보기가 최신 상태입니다.
Preview library updated. Your look is kept.|预览库已更新，当前造型已保留。|プレビューを更新しました。スタイルは保持されています。|미리보기가 업데이트되었습니다. 현재 외형은 유지됩니다.
Open recipe|打开搭配|レシピを開く|조합 열기
Save recipe|保存搭配|レシピを保存|조합 저장
Recipe opened.|搭配已打开。|レシピを開きました。|조합을 열었습니다.
Download PNG|下载PNG|PNGをダウンロード|PNG 다운로드
Portrait set|肖像集|ポートレートセット|인물 이미지 세트
Transparent images. The backdrop stays in the studio.|导出透明图片，不包含背景。|背景を含まない透過画像です。|배경을 제외한 투명 이미지입니다.
Loading catalogue…|正在加载目录…|カタログを読み込み中…|목록 불러오는 중…
The wardrobe library is unavailable|无法加载衣橱目录|ワードローブの一覧を読み込めません|옷장 목록을 불러올 수 없습니다
Reload the reader to try again.|请刷新阅读器后重试。|リーダーを再読み込みして、もう一度お試しください。|리더를 새로고침한 뒤 다시 시도하세요.
Preparing your look…|正在生成造型…|スタイルを準備中…|외형 준비 중…
Preparing the selected appearance…|正在生成所选外观…|選択した外見を準備中…|선택한 외형 준비 중…
Saving look…|正在保存造型…|スタイルを保存中…|외형 저장 중…
Look saved and applied. You can keep editing.|造型已保存并应用，可继续编辑。|スタイルを保存して適用しました。引き続き編集できます。|외형을 저장하고 적용했습니다. 계속 편집할 수 있습니다.
Preview data is missing|缺少预览数据|プレビューデータがありません|미리보기 데이터 없음
Choose a complete look|选择完整造型|完成スタイルを選択|완성된 외형 선택
Your selections are kept in the recipe. Choose Preview-ready items or a complete look to see a finished character.|选择已保存在搭配中。请选择可预览物品或完整造型。|選択内容はレシピに保持されています。プレビュー可能なアイテムか完成スタイルを選んでください。|선택한 항목은 조합에 유지됩니다. 미리보기 가능한 아이템이나 완성된 외형을 선택하세요.
Some selected parts or appearance variants need preview data. You can still save or export the recipe.|部分选择缺少预览数据，仍可保存或导出搭配。|一部の選択にプレビューデータが必要です。レシピは保存・出力できます。|일부 항목의 미리보기 데이터가 필요합니다. 조합은 저장하거나 내보낼 수 있습니다.
Assembled from reusable items · depth-aware veils and adjustable lighting.|独立部件组合 · 透明面纱与可调光照|個別パーツから合成 · 透けるベールと照明調整|개별 아이템 조합 · 투명 베일 및 조명 조절
Complete captured look · changing parts needs matching captures.|完整捕获造型 · 更换部件需要相应数据|完成スタイル画像 · パーツ変更には対応データが必要|완성된 외형 이미지 · 부위 변경 시 해당 데이터 필요
Available poses|可用姿势|使用可能なポーズ|사용 가능한 포즈
Happy|开心|喜び|기쁨
Sad|可怜|かわいそう|맴찢
Export portrait set|导出肖像集|ポートレートセットを出力|인물 이미지 세트 내보내기
The export includes poses available for this look and view.|导出包含该造型和视角可用的姿势。|このスタイルと視点で利用できるポーズを出力します。|현재 외형과 시점에서 가능한 포즈를 내보냅니다.
Download PNG set (.zip)|下载PNG集 (.zip)|PNGセットをダウンロード (.zip)|PNG 세트 다운로드 (.zip)
Download portrait pack (.json)|下载肖像包 (.json)|ポートレートパックをダウンロード (.json)|인물 이미지 팩 다운로드 (.json)
Close export options|关闭导出选项|出力設定を閉じる|내보내기 옵션 닫기
Zoom out preview|缩小预览|プレビューを縮小|미리보기 축소
Zoom in preview|放大预览|プレビューを拡大|미리보기 확대
Undo|撤销|元に戻す|실행 취소
Redo|重做|やり直す|다시 실행
Show back view|显示背面|背面を表示|뒷모습 보기
Show front view|显示正面|正面を表示|앞모습 보기
{n} items|{n}件物品|{n}個のアイテム|아이템 {n}개
{n} item|{n}件物品|{n}個のアイテム|아이템 {n}개
{n} looks|{n}个造型|{n}スタイル|외형 {n}개
{n} look|{n}个造型|{n}スタイル|외형 {n}개
{n} colors|{n}种颜色|{n}色|색상 {n}개
Season {n}|赛季{n}|シーズン{n}|시즌 {n}
Look {n}|造型{n}|スタイル{n}|외형 {n}
Preparing {pose}…|正在生成{pose}…|{pose}を準備中…|{pose} 준비 중…
Build: {name}|体型：{name}|体型：{name}|체형: {name}
`;
  for(const line of rows.trim().split('\n')){const [key,cn,jp,kr]=line.split('|');messages[key]={cn,jp,kr};}
  const language=value=>['en','cn','jp','kr'].includes(value)?value:'en';
  const patterns=Object.keys(messages).filter(key=>key.includes('{')).map(key=>({key,names:[...key.matchAll(/\{(\w+)\}/g)].map(m=>m[1]),pattern:new RegExp('^'+key.split(/(\{\w+\})/).map(part=>/^\{/.test(part)?'(.+?)':part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$')}));
  function text(value,locale='en',values={}){
    value=String(value??'');locale=language(locale);
    let key=value,params=values;
    if(!messages[key])for(const row of patterns){const match=value.match(row.pattern);if(match){key=row.key;params=Object.fromEntries(row.names.map((name,i)=>[name,match[i+1]]));break;}}
    const translated=(messages[key]?.[locale]||key).replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(params,name)?text(params[name],locale):match);
    if(translated!==value)return translated;
    if(value.includes(' · '))return value.split(' · ').map(part=>text(part,locale)).join(' · ');
    return value;
  }
  function label(item,gender,locale='en'){return item?.genders?.[gender]?.names?.[locale]||item?.names?.[locale]||item?.genders?.[gender]?.name||item?.name||'';}
  function description(item,locale='en'){
    return item.descriptions?.[locale] || item.description || text(item.slot==='bodyshape'
      ? 'Changes your character’s physique while keeping the selected wardrobe.'
      : 'A wardrobe item from the current game catalogue.',locale);
  }
  function observe(document,getLanguage){
    const remembered=new WeakMap();
    function translate(node,attribute){
      const value=attribute?node.getAttribute(attribute):node.nodeValue;if(!value?.trim())return;
      let entries=remembered.get(node);if(!entries){entries={};remembered.set(node,entries);}
      const key=attribute||'text',previous=entries[key],original=previous?.translated===value?previous.original:value;
      const translated=original.replace(/\S[\s\S]*\S|\S/,part=>text(part,getLanguage()));entries[key]={original,translated};
      if(translated!==value){if(attribute)node.setAttribute(attribute,translated);else node.nodeValue=translated;}
    }
    function apply(root=document.body){
      if(root.nodeType===3){translate(root);return;}
      if(root.nodeType!==1)return;
      const walker=document.createTreeWalker(root,4);let node;
      while((node=walker.nextNode()))if(!node.parentElement.closest('script,style,textarea,.item-name,#look-title,.selection-chip button,.appearance-user-name'))translate(node);
      for(const el of [root,...root.querySelectorAll('[placeholder],[aria-label],[title]')])for(const attr of ['placeholder','aria-label','title'])translate(el,attr);
    }
    let frame=0;const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;apply();});});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
    apply();return ()=>apply();
  }
  function bindItemTypography(grid,readerRoot){
    const nameMeasure=document.createElement('canvas').getContext('2d');
    // The reader's font-size setting, as a multiplier (1 outside the reader).
    function textScale(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wardrobe-text'))||1;}
    function fitLabels(labels){
      const scale=textScale(),maximum=12*scale,minimum=9*scale;
      const updates=Array.from(labels,label=>{
        const style=getComputedStyle(label);
        const available=label.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-1;
        if(available<=0)return null;
        const text=label.textContent,spacing=parseFloat(style.letterSpacing)||0;
        const measure=size=>{
          nameMeasure.font=`${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
          return nameMeasure.measureText(text).width+Math.max(0,Array.from(text).length-1)*spacing;
        };
        const width=measure(maximum);
        const size=Math.max(minimum,Math.min(maximum,Math.floor(maximum*available/Math.max(1,width)*10)/10));
        return {label,size,singleLine:measure(size)<=available};
      });
      // Read widths together before writing sizes, avoiding a layout per card.
      for(const update of updates){if(!update)continue;
        update.label.style.fontSize=update.size+'px';
        update.label.style.whiteSpace=update.singleLine?'nowrap':'normal';
      }
    }
    // The phone grid scrolls inside its own panel. Size names just ahead of scrolling.
    const nearby=new Set(),narrow=readerRoot&&matchMedia('(max-width: 760px)');
    let firstObservedCard=null;
    const observer=readerRoot&&typeof IntersectionObserver==='function'&&new IntersectionObserver(entries=>{
      const entering=[];
      for(const entry of entries){
        if(!firstObservedCard||!grid.contains(entry.target))continue;
        if(entry.isIntersecting){nearby.add(entry.target);entering.push(entry.target);}
        else nearby.delete(entry.target);
      }
      if(entering.length)fitLabels(entering);
    },{root:grid,rootMargin:'140px 0px'});
    function fitItemNames(){
      if(observer&&narrow.matches&&document.documentElement.classList.contains('reader-fit')){
        if(firstObservedCard===grid.firstElementChild){if(nearby.size)fitLabels(nearby);return;}
        observer.disconnect();nearby.clear();firstObservedCard=grid.firstElementChild;
        for(const label of grid.querySelectorAll('.item-name'))observer.observe(label);
        return;
      }
      if(firstObservedCard){observer.disconnect();nearby.clear();firstObservedCard=null;}
      fitLabels(grid.querySelectorAll('.item-name'));
    }
    let namesWidth=0;
    new ResizeObserver(entries=>{
      const width=entries[0]?.contentRect.width||0;
      if(Math.abs(width-namesWidth)>.5){namesWidth=width;fitItemNames();}
    }).observe(grid);
    document.fonts?.ready.then(fitItemNames);
    document.fonts?.addEventListener('loadingdone',fitItemNames);
    if(readerRoot){
      const followText=()=>{
        const ratio=parseFloat(getComputedStyle(readerRoot).getPropertyValue('--reader-font-ratio'))||1;
        const scale=String(Math.min(1.4,Math.max(.85,ratio)));
        if(document.documentElement.style.getPropertyValue('--wardrobe-text')===scale)return;
        document.documentElement.style.setProperty('--wardrobe-text',scale);
        fitItemNames();
      };
      new MutationObserver(followText).observe(readerRoot,{attributes:true,attributeFilter:['style']});followText();
    }
    return fitItemNames;
  }
  return {messages,language,text,label,description,observe,bindItemTypography};
});

;
/* Original game backgrounds, shared by the 2D and 3D studios. */
(function(root,factory){
  const script=typeof document==='undefined'?null:document.currentScript;
  const base=script?.dataset?.backgroundsBase
    ? new URL(script.dataset.backgroundsBase,script.src).href
    : (script?new URL('backgrounds/',script.src).href:'backgrounds/');
  const api=factory(base);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.WardrobeBackgrounds=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(base){
  const entries=Object.freeze([
    ['starry-sky','Starry sky'],['green-fields','Green fields'],['golden-fields','Golden fields'],
    ['moonlit-fields','Moonlit fields'],['misty-fields','Misty fields'],['hearts','Hearts'],
    ['fireworks','Fireworks'],['golden-pattern','Golden pattern'],
  ].map(([id,label])=>Object.freeze({id:'game-'+id,label,file:id+'.webp'})));
  const find=id=>entries.find(entry=>entry.id===id);
  const url=id=>{const entry=find(id);return entry?base+entry.file:null;};
  function apply(stage,id){
    const image=url(id);
    stage.style.backgroundImage=image?`url("${image}")`:'';
    stage.style.backgroundSize=image?'cover':'';
    stage.style.backgroundPosition=image?'center':'';
  }
  function decorate(button,id){
    const image=url(id);
    const preview=document.createElement(image?'img':'span');
    preview.className='background-preview';
    if(image){
      preview.src=image;
      preview.alt='';
      preview.loading='lazy';
    }else{
      preview.dataset.backdrop=id;
      preview.setAttribute('aria-hidden','true');
    }
    button.prepend(preview);
  }
  function addOptions(select){
    for(const entry of entries){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label;select.append(option);}
  }
  const images=new Map();
  function load(id){
    const source=url(id);if(!source)return Promise.resolve(null);
    if(!images.has(source))images.set(source,new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(source);reject(Error('Could not load background'));};image.src=source;
    }));
    return images.get(source);
  }
  function coverRect(sourceWidth,sourceHeight,width,height){
    const scale=Math.max(width/sourceWidth,height/sourceHeight),w=sourceWidth*scale,h=sourceHeight*scale;
    return [(width-w)/2,(height-h)/2,w,h];
  }
  async function paint(ctx,id,width,height){
    const image=await load(id);
    if(image)ctx.drawImage(image,...coverRect(image.naturalWidth,image.naturalHeight,width,height));
    else if(id!=='clear'){ctx.fillStyle=id==='white'?'#fff':'#101010';ctx.fillRect(0,0,width,height);}
  }
  return {entries,find,url,apply,decorate,addOptions,paint,coverRect};
});

;
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.WardrobeUpdates=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function createUpdater({version,check,load,apply,blocked=()=>false,onError=()=>{},onCurrent=()=>{},now=Date.now,interval=30000}){
    let busy=false,lastCheck=-Infinity,stamp=version;
    return async function(force=false){
      if(busy||blocked()||!force&&now()-lastCheck<interval)return false;
      busy=true;lastCheck=now();
      try{
        const next=await check();
        if(!next||next===stamp){onCurrent(force);return false;}
        const data=await load();
        if(blocked())return false;
        apply(data);stamp=data.stamp;return true;
      }catch(error){onError(error,force);return false;}finally{busy=false;}
    };
  }
  function responseStamp(response){
    const tag=response.headers.get('ETag');
    return tag?tag.replace(/-(?:gzip|identity)"$/,'"'):response.headers.get('Last-Modified');
  }
  return {createUpdater,responseStamp};
});
(function(){
  'use strict';
  if(typeof module==='object'&&module.exports)return;
  const $=id=>document.getElementById(id),W=Wardrobe,DATA=W.libraryBase('wardrobe_2d_base','data/'),STORE='afk.wardrobe.studio.v1';
  const params=new URLSearchParams(location.search),embedded=document.documentElement.classList.contains('reader-embedded');
  const readyFilter=$('ready-only');
  WardrobeBackgrounds.addOptions($('backdrop'));
  const poses=[['normal','Hand on Hip'],['standing','Standing'],['think_loop','Thinking'],['angry_loop','Rage'],['helpless','Helpless'],['wow','Wow']];
  const backPoses=new Set(['normal','standing']);
  let language=WardrobeLocale.language(params.get('lang'));
  const itemLabel=(item,gender)=>WardrobeLocale.label(item,gender,language);
  const translate=()=>{document.documentElement.lang=W.documentLang(language);translateDocument();};
  if(!embedded && ['127.0.0.1','localhost'].includes(location.hostname)){
    const progress=document.createElement('a');progress.href='http://127.0.0.1:8879/';
    progress.textContent='Capture progress ↗';progress.className='capture-progress-link';progress.target='_blank';progress.rel='noopener';
    document.querySelector('.catalogue-stats').append(progress);
  }
  const portraitPoses=[...poses,...W.POSES.filter(([id])=>!poses.some(([pose])=>pose===id))];
  if(location.protocol==='file:'){
    WardrobeLocale.observe(document,()=>language);
    $('capture-count').textContent='Start the local studio with Start Wardrobe.cmd.';
    $('preview-status').textContent='This source file needs a local server. Double-click Start Wardrobe.cmd in the same folder, then use http://127.0.0.1:8878/.';
    $('avatar').hidden=true;$('empty-preview').hidden=false;$('empty-preview').querySelector('h2').textContent='Open the local studio';
    $('empty-preview').querySelector('p').textContent='Double-click Start Wardrobe.cmd. It starts the wardrobe server and opens the working site.';$('find-ready').hidden=true;return;
  }
  let catalogue,captures,itemLibrary,runtimeLibrary,index,state,category='outfit',generation=0,current=null,detailSlot=null,exporting=false;
  const families=new Map(),readiness=new Map();
  let history=[],future=[],toastTimer;
  let readerSession='',readerBusy=false,studioReady=false,setExpanded=()=>false;
  let pendingReaderInit=null;
  let openingPacks=null;
  let standaloneOpeningSeed=null;
  let openingPortrait=null;
  const narrow=matchMedia('(max-width: 760px)');
  let rosterDeferred=false;
  const reportExpanded=expanded=>window.parent.postMessage({type:'tea-wardrobe-expand',expanded},location.origin);
  const worker=new Worker('compositor.worker.js'),pending=new Map();let sequence=0;
  const lighting=()=>({rim:$('rim').checked,bloom:$('bloom').checked,grade:$('grade').checked,half:true,hiddenRgb:false,detail:true,clothingFit:$('clothing-fit').value==='clothing',hairFit:$('hair-fit').checked});
  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
  function setupPreviewNavigation(){
    const stage=$('stage'),canvas=$('avatar'),camera={zoom:1,x:0,y:0};let drag=null,inspecting=false,savedCamera=null;
    const touches=new Map();let pinch=null;
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    function update(){
      camera.zoom=Math.round(clamp(camera.zoom,.85,inspecting?4:1.5)*100)/100;
      // Normal framing stays centered; pan room grows with magnification.
      const extra=Math.max(0,camera.zoom-1);
      camera.y=clamp(camera.y,-stage.clientHeight*.5*extra,stage.clientHeight*.5*extra);
      camera.x=inspecting?clamp(camera.x,-stage.clientWidth*.5*extra,stage.clientWidth*.5*extra):0;
      stage.style.setProperty('--preview-zoom',camera.zoom);
      stage.style.setProperty('--preview-x',camera.x+'px');stage.style.setProperty('--preview-y',camera.y+'px');
      stage.classList.toggle('pannable',camera.zoom>1);
      $('zoom-value').textContent=Math.round(camera.zoom*100)+'%';
      $('zoom-out').disabled=camera.zoom<=.85;$('zoom-in').disabled=camera.zoom>=(inspecting?4:1.5);
      $('reset-view').disabled=camera.zoom===1&&camera.x===0&&camera.y===0;
    }
    function reset(){Object.assign(camera,{zoom:1,x:0,y:0});update();}
    stage.addEventListener('wardrobe-inspect',event=>{
      inspecting=event.detail;
      if(inspecting){savedCamera={...camera};reset();}
      else if(savedCamera){Object.assign(camera,savedCamera);savedCamera=null;update();}
      drag=null;pinch=null;touches.clear();stage.classList.remove('dragging');
    });
    function zoom(step){camera.zoom+=step;update();}
    $('zoom-out').onclick=()=>zoom(-.1);$('zoom-in').onclick=()=>zoom(.1);$('reset-view').onclick=reset;
    canvas.tabIndex=0;canvas.title='Right-drag left/right to zoom out/in. Drag up or down when zoomed in. Use + / − to zoom, up and down arrows to pan, or 0 to reset.';
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    canvas.addEventListener('pointerdown',event=>{
      if(inspecting&&event.pointerType==='touch'&&!canvas.hidden){
        touches.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);
        if(touches.size===2){
          const [a,b]=[...touches.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:camera.zoom};
          drag=null;event.preventDefault();return;
        }
      }
      const zooming=event.button===2&&event.pointerType!=='touch';
      if(canvas.hidden||!zooming&&(event.button!==0||camera.zoom<=1)||drag)return;
      event.preventDefault();canvas.focus({preventScroll:true});
      drag={pointer:event.pointerId,zooming,x:event.clientX,y:event.clientY,startZoom:camera.zoom,startX:camera.x,startY:camera.y};
      canvas.setPointerCapture(event.pointerId);stage.classList.add('dragging');
    });
    canvas.addEventListener('pointermove',event=>{
      if(touches.has(event.pointerId))touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pinch&&touches.size===2){
        const [a,b]=[...touches.values()];camera.zoom=pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance);update();return;
      }
      if(!drag||drag.pointer!==event.pointerId)return;
      if(drag.zooming)camera.zoom=drag.startZoom+(event.clientX-drag.x)/300;
      else if(camera.zoom>1){camera.y=drag.startY+event.clientY-drag.y;if(inspecting)camera.x=drag.startX+event.clientX-drag.x;}
      update();
    });
    const end=event=>{touches.delete(event.pointerId);pinch=null;drag=null;stage.classList.remove('dragging');};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',event=>{if(inspecting||event.ctrlKey||event.metaKey){event.preventDefault();zoom(event.deltaY<0?.05:-.05);}},{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(['+','=','-','0','ArrowUp','ArrowDown',...(inspecting?['ArrowLeft','ArrowRight']:[])].includes(event.key))event.preventDefault();else return;
      if(event.key==='0')return reset();
      if(['+','=','-'].includes(event.key))return zoom(event.key==='-'?-.1:.1);
      if(camera.zoom<=1)return;
      camera.y+=event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0;
      camera.x+=event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0;update();
    });
    new ResizeObserver(update).observe(stage);update();return reset;
  }
  function node(tag,cls,text){const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=text;return element;}
  function image(url,name){const img=node('img');img.alt=name||'';img.loading='lazy';img.decoding='async';img.onerror=()=>{img.hidden=true;};img.src=new URL(url,DATA);return img;}
  function previewChoices(id,heading){
    const select=$(id),group=node('fieldset','option-group');
    group.append(node('legend','section-title',heading));
    const buttons=node('div','toggles');
    for(const option of select.options){
      const button=node('button','',option.textContent);
      button.type='button';button.value=option.value;
      button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));};
      buttons.append(button);
    }
    if(id==='backdrop'){buttons.classList.add('background-choices');for(const button of buttons.children)WardrobeBackgrounds.decorate(button,button.value);}
    const sync=()=>{for(const button of buttons.children)button.setAttribute('aria-pressed',String(button.value===select.value));};
    select.addEventListener('change',sync);sync();group.append(buttons);return group;
  }
  function embedInReader(){
    const main=document.querySelector('main'),intro=main.querySelector('.intro');
    intro.querySelector('h1').textContent='Cosmetics';
    intro.querySelector('p:last-child').textContent='Preview and combine cosmetics for Merlin.';
    intro.append(document.querySelector('.header-actions'));
    const bar=node('div','reader-use-bar');
    const nameLabel=node('label','','Look name'),name=node('input');name.id='reader-look-name';name.maxLength=80;name.placeholder='My Merlin';name.setAttribute('aria-label','Look name');nameLabel.append(name);
    const back=node('button');back.append(node('span','back-arrow','‹'),node('span','back-text','Back to reader'));back.setAttribute('aria-label','Back to reader');back.id='reader-back';back.type='button';back.onclick=()=>{if(!readerBusy)window.parent.postMessage({type:'tea-wardrobe-back',sessionId:readerSession},location.origin);};
    const use=node('button','primary','Save and apply');use.id='reader-use';use.type='button';use.disabled=true;use.onclick=useForMerlin;
    // The actions wrap as one group, so a narrow frame never strands a single button.
    const status=node('p'),buttons=node('div','reader-use-actions');status.id='reader-save-status';status.setAttribute('role','status');buttons.append(back,use);bar.append(nameLabel,buttons,status);
    const beta = node('button', '', '3D Beta');
    beta.id = 'reader-beta'; beta.type = 'button'; beta.hidden = true;
    beta.onclick = () => {
      if (!state || !readerSession || readerBusy) return;
      const {rim, bloom, grade, hairFit, clothingFit} = lighting();
      const seed = {gender:state.gender, name:name.value, recipe:{avatarIds:{...state.avatarIds},
        presentation:{rim,bloom,grade,hairFit,clothingFit}}};
      window.parent.postMessage({type:'tea-wardrobe-switch', sessionId:readerSession, editor:'3d', seed}, location.origin);
    };
    buttons.append(beta);
    // One compact header row: title, look name and the reader actions.
    intro.querySelector('.catalogue-stats').before(bar);
    // The gender switch floats over the stage.
    $('stage').prepend(document.querySelector('.preview-top'));
    const panel=document.querySelector('.wardrobe-panel');panel.id='wardrobe';panel.dataset.level='categories';
    const settings=node('section');settings.id='options';settings.setAttribute('aria-labelledby','options-title');
    const heading=node('div','options-head');
    const close=node('button','options-back','‹');close.type='button';close.setAttribute('aria-label','Back to the wardrobe');
    const title=node('h2','','Options');title.id='options-title';heading.append(close,title);
    const navigation=document.querySelector('.preview-navigation');navigation.querySelector('span').hidden=true;
    $('reset').textContent='Reset look';
    const actions=node('div','toggles');
    for(const action of [$('random'),$('reset')]){action.classList.remove('subtle');actions.append(action);}
    document.querySelector('.preview-options').hidden=true;
    settings.append(heading,node('p','section-title','Look'),actions,previewChoices('framing','View'),navigation,
      previewChoices('backdrop','Background'),$('fit-control'),$('hair-fit-control'),document.querySelector('.lighting'));
    panel.append(settings);
    const view=node('button','view-options','Options');view.type='button';view.setAttribute('aria-controls',settings.id);view.setAttribute('aria-expanded','false');
    W.bindOptionsPanel(panel,view,close);
    document.querySelector('.history').prepend(view);
    // The PNG export sits with the history buttons as a small download icon.
    const svg='http://www.w3.org/2000/svg',icon=document.createElementNS(svg,'svg'),shape=document.createElementNS(svg,'path');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('download-icon');
    shape.setAttribute('d','M10.6 2.5h2.8v8.6h3.7L12 16.7l-5.1-5.6h3.7zM2.5 14.5h2.8v4.7h13.4v-4.7h2.8v7.5h-19z');
    icon.append(shape);
    const save=$('export-png');save.classList.remove('primary');save.replaceChildren(icon);
    save.setAttribute('aria-label','Download image (PNG)');save.title='Download this look as a transparent PNG';
    document.querySelector('.history').append(save);
    // Phones choose a category first, then its items.
    const categories=node('button','category-back','‹');categories.type='button';categories.setAttribute('aria-label','All categories');
    categories.onclick=()=>{panel.dataset.level='categories';$('categories').querySelector('[aria-current=true]')?.focus({preventScroll:true});};
    document.querySelector('.results-heading>div').prepend(categories);
    W.bindHorizontalWheel($('categories'),matchMedia('(min-width: 761px)'));
    W.bindHorizontalWheel($('poses'));
    W.placeItemDetail($('item-detail'),$('stage'),matchMedia('(max-width: 760px)'));
    // Phones can hide the reader's bars and the look-name row; the stage keeps the way back.
    const expand=node('button','expand-toggle'),expandIcon=document.createElementNS(svg,'svg');expand.type='button';expand.setAttribute('aria-label','Stretch');expand.title='Stretch';
    expandIcon.setAttribute('viewBox','0 0 24 24');expandIcon.setAttribute('aria-hidden','true');expandIcon.append(document.createElementNS(svg,'path'));expand.append(expandIcon);$('stage').append(expand);
    setExpanded=W.bindExpand(expand,matchMedia('(max-width: 760px)'),reportExpanded);
    W.bindPreviewFullscreen($('stage'),open=>window.parent.postMessage({type:'tea-wardrobe-inspect',open},location.origin),[
      [$('zoom-out'),'Zoom out preview','−'],[$('reset-view'),'Reset view','↺'],[$('zoom-in'),'Zoom in preview','+']
    ]);
    // One sort menu instead of field and direction.
    const sort=node('select');sort.id='sort-combined';sort.setAttribute('aria-label','Sort items');
    W.setupSortMenu(sort,true);
    const syncSort=()=>{[$('sort').value,$('sort-order').value]=sort.value.split(':');};
    syncSort();
    sort.onchange=()=>{syncSort();drawRoster();};
    document.querySelector('.sort-controls').prepend(sort);
    // Colour choices share the heading row instead of a row of their own.
    document.querySelector('.sort-controls').before($('color-options'));
    // Routine progress text stays hidden; problems still show.
    const previewStatus=$('preview-status');
    new MutationObserver(()=>previewStatus.toggleAttribute('data-problem',/could not|need preview data|local server/i.test(previewStatus.textContent)))
      .observe(previewStatus,{childList:true,characterData:true,subtree:true});
    // Readers tall enough give the wardrobe the window, and it scrolls only its
    // own panels; short windows scroll the page, so the frame follows the content.
    const report=W.bindReaderFrameFit(
      height=>window.parent.postMessage({type:'tea-cosmetics-height',height},location.origin),
      fit=>{if(rosterDeferred&&(!fit||!narrow.matches))drawItems();}
    );
    narrow.addEventListener('change',report);
  }
  function openCategory(){
    const panel=document.querySelector('.wardrobe-panel');if(panel)panel.dataset.level='items';
    if(panel?.classList.contains('options-open'))document.querySelector('.view-options').click();
  }
  async function get(path,{cache=releasedLibrary?'default':'no-cache'}={}){const url=new URL(path,DATA);if(url.origin!==DATA.origin||!url.pathname.startsWith(DATA.pathname))throw new Error('Asset is outside the wardrobe library.');const response=await fetch(url,{cache});if(!response.ok)throw new Error('Could not load '+path+' ('+response.status+').');return response;}
  // Releases leave out items.json, the 118 MB build source. The startup index and its
  // verified shards are then the whole library, and a pinned release never changes.
  // A library at a configured address is such a release, so it is not asked for items.json.
  const releasedLibrary=DATA.href!==new URL('data/',location.href).href;
  function prepareOpeningPacks(seed){
    if(!openingPacks||!seed||generation)return;
    const recipe=seed.recipe||{},gender=seed.gender;
    if(recipe.wardrobe3d)return;
    const preset=recipe.avatarIds?.outfit
      ?Object.values(openingPacks).find(row=>row.gender===gender&&W.key(gender,row.recipe)===W.key(gender,recipe.avatarIds))
      :openingPacks[recipe.sourcePreset||('player_'+gender+'_default1')];
    if(preset?.gender!==gender||!Array.isArray(preset?.files))return;
    worker.postMessage({openingFiles:preset.files,dataRoot:DATA.href});
    openingPacks=null;
  }
  async function getItems(draftGender){
    if(typeof DecompressionStream==='function')try{
      const [startup,head]=await Promise.all([get('items-startup-v2.json').catch(()=>get('items-startup.json')),releasedLibrary?null:fetch(new URL('items.json',DATA),{method:'HEAD',cache:'no-cache'})]);
      const metadata=await startup.json(),released=releasedLibrary||head.status===404;
      if(released||WardrobeLibrary.matches(metadata,head)){
        const read=async info=>{
          const response=await get(info.url,{cache:'force-cache'}),bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
          // Plain-http previews on a home network have no Web Crypto; there the byte count still guards the file.
          const digest=globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''):info.sha256;
          if(bytes.byteLength!==info.bytes||digest!==info.sha256)throw Error('Wardrobe metadata verification failed.');
          return JSON.parse(new TextDecoder().decode(bytes));
        };
        // The opening look's view downloads with the availability index rather than after it.
        const gender=pendingReaderInit?.seed?.gender||state?.gender||(embedded?params.get('gender'):draftGender);
        if(metadata.presetPacks){
          openingPacks=metadata.presetPacks;
          prepareOpeningPacks(embedded?pendingReaderInit?.seed:standaloneOpeningSeed);
        }
        const runtime=await WardrobeLibrary.open(metadata,read,[(gender==='male'?'male':'female')+'/normal/0']);
        return {library:runtime.library,runtime,watch:!released,stamp:WardrobeUpdates.responseStamp(released?startup:head)};
      }
    }catch(error){if(releasedLibrary)throw error;/* Older publications use the complete canonical manifest below. */}
    if(releasedLibrary)throw new Error('This browser needs gzip decompression support.');
    if(typeof DecompressionStream==='function')try{
      const [metadata,head]=await Promise.all([get('items-transfer.json').then(r=>r.json()),fetch(new URL('items.json',DATA),{method:'HEAD',cache:'no-cache'})]);
      // Older import tools may still update only items.json. In that case the
      // ordinary manifest remains the source, never a stale compressed copy.
      if(metadata.schema==='afk.wardrobe.transport'&&metadata.version===1&&head.ok
          &&(Number(head.headers.get('Content-Length'))===metadata.bytes
             ||(metadata.identityTag&&['"'+metadata.identityTag+'-gzip"','"'+metadata.identityTag+'-identity"'].includes(head.headers.get('ETag'))))
          &&Math.floor(Date.parse(head.headers.get('Last-Modified'))/1000)===metadata.modifiedSeconds){
        const packed=await get(metadata.url),bytes=await new Response(packed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        if(bytes.byteLength!==metadata.bytes||digest!==metadata.sha256)throw new Error('Wardrobe transport verification failed.');
        return {library:JSON.parse(new TextDecoder().decode(bytes)),stamp:WardrobeUpdates.responseStamp(head)};
      }
    }catch(_){/* The canonical manifest also supports older browsers and servers. */}
    const response=await get('items.json');
    return {library:await response.json(),stamp:WardrobeUpdates.responseStamp(response)};
  }
  async function loadLibrary(manifest,draftGender){
    if(!manifest)return {library:null,stamp:null};
    if(manifest==='items.json')return getItems(draftGender);
    const response=await get(manifest);return {library:await response.json(),stamp:WardrobeUpdates.responseStamp(response)};
  }
  async function loadStartupData(draftGender){
    const readJson=path=>get(path).then(response=>response.json());
    const expand=data=>typeof W==='object'&&W.expandCatalogue?W.expandCatalogue(data):data;
    const catalogueRequest=readJson('catalogue-core.json').catch(()=>readJson('catalogue.json')).then(expand);
    // Pinned releases use these manifests. Start their dependent requests during the catalogue download.
    let items=releasedLibrary?getItems(draftGender):null;
    let complete=releasedLibrary?readJson('captures.json'):null;
    items?.catch(()=>{});complete?.catch(()=>{});
    const data=await catalogueRequest;
    if(!items||data.itemManifest!=='items.json')items=loadLibrary(data.itemManifest,draftGender);
    if(!complete||data.captureManifest!=='captures.json')complete=data.captureManifest?readJson(data.captureManifest):{cases:[]};
    const [loaded,captures]=await Promise.all([items,complete]);
    return {catalogue:data,loaded,captures};
  }
  function libraryStats(){
    $('total-count').textContent=catalogue.stats.items.toLocaleString();
    $('capture-count').textContent=Number.isInteger(catalogue.stats.previewReadyChoices)?catalogue.stats.previewReadyChoices.toLocaleString()+' preview-ready choices · '+catalogue.stats.presets+' complete looks':catalogue.stats.presets+' complete looks';
    if($('library-count'))$('library-count').textContent=itemLibrary?itemLibrary.parts.length.toLocaleString()+' reusable item views':'';
  }
  function watchLibrary(version){
    if(!catalogue.itemManifest)return;
    const controls=document.querySelector('.catalogue-stats'),progress=controls.querySelector('.capture-progress-link');
    const count=node('small');count.id='library-count';controls.insertBefore(count,progress);
    const button=node('button','library-refresh','Refresh previews');button.type='button';button.title='Check for newly published captures while keeping this look';controls.insertBefore(button,progress);
    const check=WardrobeUpdates.createUpdater({version,
      blocked:()=>exporting||document.hidden||(embedded&&window.frameElement?.hidden),
      check:async()=>{const response=await fetch(new URL(catalogue.itemManifest,DATA),{method:'HEAD',cache:'no-cache'});if(!response.ok)throw new Error('Could not check preview updates.');return WardrobeUpdates.responseStamp(response);},
      load:async()=>{const next=W.expandCatalogue(await get('catalogue-core.json').catch(()=>get('catalogue.json')).then(r=>r.json()));const [loaded,complete]=await Promise.all([loadLibrary(next.itemManifest),next.captureManifest?get(next.captureManifest).then(r=>r.json()):{cases:[]}]);return {...loaded,catalogue:next,captures:complete};},
      apply:data=>{
        if(data.library?.schema!=='afk.wardrobe.items'||data.library.validation?.passed!==true)throw new Error('New previews have not passed validation.');
        const nextIndex=W.createIndex(data.catalogue,data.captures,data.library);
        catalogue=data.catalogue;captures=data.captures;itemLibrary=data.library;runtimeLibrary=data.runtime;index=nextIndex;detailsRequest=null;
        buildFamilies();libraryStats();refresh();notify('Preview library updated. Your look is kept.');
      },
      onCurrent:manual=>{if(manual)notify('Previews are up to date.');},
      onError:(error,manual)=>{if(manual)notify('Could not refresh previews. Your current library is kept.');}
    });
    button.onclick=async()=>{button.disabled=true;button.textContent='Checking…';try{await check(true);}finally{button.disabled=false;button.textContent='Refresh previews';}};
    setInterval(()=>check(),30000);window.addEventListener('focus',()=>check());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
    libraryStats();
  }
  function compute(payload){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{worker.postMessage({id,...payload});}catch(error){pending.delete(id);reject(error);}});}
  worker.onmessage=event=>{const entry=pending.get(event.data.id);if(!entry)return;pending.delete(event.data.id);event.data.error?entry.reject(new Error(event.data.error)):entry.resolve(event.data);};
  worker.onerror=()=>{for(const entry of pending.values())entry.reject(new Error('The preview renderer stopped. Reload the studio to retry.'));pending.clear();};
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function canonicalState(next){
    next.avatarIds.footprint=0;
    if(!backPoses.has(next.pose))next.yaw=0;
    if(itemLibrary?.version===3&&!next.avatarIds.bodyshape&&index.resolve(next)?.kind==='items'
      &&!index.views.has(W.key(next.gender,next.avatarIds)+'/normal/0'))next.avatarIds.bodyshape=59;
    return next;
  }
  function persist(){try{const stored=JSON.parse(localStorage.getItem(STORE)||'{}');localStorage.setItem(STORE,JSON.stringify({...stored,draft:W.exportRecipe(state)}));}catch(_){notify('Browser storage is full. Save a recipe to keep this look.');}}
  function setState(next,{record=true}={}){if(record){history.push(clone(state));if(history.length>40)history.shift();future=[];}state=canonicalState(clone(next));persist();refresh();}
  function defaultState(gender){
    const preset=catalogue.presets.find(p=>p.gender===gender&&p.group==='default'&&Number(p.option)===1);
    const sample=captures.cases.find(c=>c.gender===gender&&c.pose==='normal'&&c.validated===true);
    return {gender,avatarIds:W.normalize(preset?.recipe||catalogue.defaultRecipe?.avatarIds||sample?.avatarIds),pose:'normal',yaw:0,name:''};
  }
  function title(){return state.name||itemLabel(index.items.get(state.avatarIds.outfit),state.gender)||'My Merlin';}
  // Hovering or focusing a card for a moment starts loading that look's buffers,
  // so the click itself mostly draws. Prefetch never renders or changes the preview.
  let hoverTimer=0;
  function prefetchLook(look){
    clearTimeout(hoverTimer);
    hoverTimer=setTimeout(async()=>{
      try{
        const view=await resolveView(look);
        if(view?.kind!=='items')return;
        const entry=view.entry;
        worker.postMessage({prefetch:true,dataRoot:DATA.href,assetEntry:{layers:entry.layers,overlays:entry.overlays||[],surfaces:entry.surfaces||[],lut:entry.lut||captures.lut}});
      }catch(_){}
    },120);
  }
  function selectItem(item){detailSlot=item.slot;setState({...state,name:'',avatarIds:{...state.avatarIds,[item.slot]:item.id}});}
  function presetState(preset,yaw=state.yaw){
    const look={gender:preset.gender,avatarIds:W.normalize(preset.recipe),pose:state.pose,yaw,name:preset.name};
    return look;
  }
  function selectPreset(preset){
    detailSlot=null;
    let look=presetState(preset);
    if(look.yaw&&!index.resolve(look))look=presetState(preset,0);
    if(!index.resolve(look))look.pose='normal';
    setState(look);
  }
  function drawCategories(){const nav=$('categories'),left=nav.scrollLeft;nav.replaceChildren();for(const row of [{id:'presets',name:'Complete looks'},...W.browseCategories(catalogue.categories.filter(row=>row.id!=='footprint'))]){
    const b=node('button','',row.name);b.dataset.category=row.id;b.setAttribute('aria-current',String(category===row.id));b.onclick=()=>{category=row.id;detailSlot=W.categorySlot(row.id);openCategory();drawCategories();drawRoster();drawDetail();};
    // The current choice, shown where phones list the categories.
    const picked=state&&index.items.get(state.avatarIds[W.categorySlot(row.id)]);if(picked&&W.itemCategory(picked)===row.id)b.append(node('small','category-pick',itemLabel(picked,state.gender)));nav.append(b);
  }nav.scrollLeft=left;}
  function drawSelection(){const strip=$('selection-strip');strip.replaceChildren();for(const slot of W.SLOTS){const item=index.items.get(state.avatarIds[slot]);if(!item)continue;const chip=node('span','selection-chip');const data=item.genders[state.gender];if(data.icon)chip.append(image(data.icon,''));
    const b=node('button','',(slot==='bodyshape'?'Build: ':'')+itemLabel(item,state.gender));b.style.cssText='padding:0;background:none;border:0;font-size:inherit;color:inherit';b.title=slot==='bodyshape'?'Body build':slot;b.onclick=()=>{category=W.itemCategory(item);detailSlot=slot;openCategory();drawCategories();drawRoster();drawDetail();};chip.append(b);
    if(W.OPTIONAL.has(slot)){const x=node('button','clear','×');x.setAttribute('aria-label','Remove '+itemLabel(item,state.gender));x.onclick=()=>setState({...state,name:'',avatarIds:{...state.avatarIds,[slot]:0}});chip.append(x);}strip.append(chip);
  }}
  function readyFor(item){
    if(!readiness.has(item.id))readiness.set(item.id,index.available(state,item.slot,item.id));
    return readiness.get(item.id);
  }
  function buildFamilies(){
    families.clear();
    for(const item of catalogue.items){
      const key=W.familyKey(item);
      if(!families.has(key))families.set(key,[]);
      families.get(key).push(item);
    }
    for(const variants of families.values())variants.sort((a,b)=>a.order-b.order||a.id-b.id);
  }
  function* itemRows(matches,only){
    const rows=[],slot=W.categorySlot(category);
    for(const variants of families.values()){
      if(W.itemCategory(variants[0])!==category)continue;
      yield;
      const options=[];
      const visible=only?variants.filter(readyFor):variants;
      for(const item of visible){
        const name=itemLabel(item,state.gender);
        if(!matches(name,item))continue;
        options.push({item,name,ready:only||readyFor(item)});
      }
      if(!options.length)continue;
      const ready=options.find(row=>row.ready);
      const primary=options.find(row=>row.item.id===state.avatarIds[slot])||ready||options[0];
      rows.push({...primary,colors:visible.length,sortName:options[0].name,sortId:Math.min(...options.map(row=>row.item.id)),pinned:options.some(row=>W.isBasicOutfit(row.item))});
    }
    return rows;
  }
  function drawColors(only){
    const palette=$('color-options'),selected=index.items.get(state.avatarIds[W.categorySlot(category)]);
    const family=W.itemCategory(selected)===category?families.get(W.familyKey(selected))||[]:[];
    const variants=only?family.filter(readyFor):family;
    palette.hidden=variants.length<2;
    palette.replaceChildren();
    if(palette.hidden)return;
    const name=itemLabel(selected,state.gender);
    palette.setAttribute('aria-label','Colors for '+name);
    palette.append(node('span','color-caption',selected.colorName?name+' · '+selected.colorName:name));
    const swatches=node('div','color-swatches');
    for(const item of variants){
      const label=itemLabel(item,state.gender)+(item.colorName?' · '+item.colorName:'')+' · Avatar '+item.id;
      const button=node('button','color-swatch');
      const active=item.id===selected.id;
      button.dataset.avatarId=item.id;
      button.setAttribute('aria-label',label);
      button.setAttribute('aria-pressed',String(active));
      button.title=label;
      if(item.colorIcon)button.append(image(item.colorIcon,''));
      else if(/^#[0-9a-f]{6}$/i.test(item.swatch))button.style.backgroundColor=item.swatch;
      else if(item.genders[state.gender].icon)button.append(image(item.genders[state.gender].icon,''));
      else button.textContent='◇';
      button.onclick=()=>{
        if(active)return;
        selectItem(item);
        palette.querySelector(`[data-avatar-id="${item.id}"]`)?.focus({preventScroll:true});
      };
      swatches.append(button);
    }
    palette.append(swatches);
  }
  function drawRoster(){drawItems();$('items').scrollTop=0;}
  const fitItemNames=WardrobeLocale.bindItemTypography($('items'),embedded ? parent.document.documentElement : null);
  function rosterSettings(){
    const text=$('search').value.trim().toLocaleLowerCase(),only=readyFilter?.checked??true,sort=$('sort').value;
    const direction=$('sort-order').value==='desc'?-1:1;
    return {category,text,only,sort,direction,language};
  }
  function* buildRoster({text,only,sort,direction}){
    const presets=category==='presets';
    const matches=(name,item)=>!text||`${name} ${item.id} ${item.colorName||''}`.toLocaleLowerCase().includes(text);
    const rows=presets?catalogue.presets
      .filter(p=>p.gender===state.gender&&matches(p.name,p))
      .map(item=>({item,name:item.name,ready:!!index.resolve(presetState(item)),sortName:item.name,sortId:item.id}))
      .filter(row=>!only||row.ready):(yield* itemRows(matches,only));
    W.sortRows(rows,sort,direction,language);
    const grid=document.createDocumentFragment();
    const slot=W.categorySlot(category);
    if(!presets&&W.OPTIONAL.has(slot)&&!text){const none=node('button','item-card');none.dataset.itemKey='none';none.append(node('span','item-art fallback-icon','◇'),node('span','item-name','None'),node('span','item-state','Remove this part'));none.setAttribute('aria-pressed',String(!state.avatarIds[slot]));none.onclick=()=>setState({...state,name:'',avatarIds:{...state.avatarIds,[slot]:0}});grid.append(none);}
    for(const {item,name,ready,colors} of rows){const card=node('button','item-card'+(presets?' preset':''));const colorCount=colors>1?colors+' colors':'';card.setAttribute('aria-label',(presets?'Use look: ':'Select ')+name+(presets?' — '+groupName(item):' — avatar '+item.id)+(colorCount?' — '+colorCount:''));
      card.setAttribute('aria-pressed',String(presets?W.key(item.gender,item.recipe)===W.key(state.gender,state.avatarIds):state.avatarIds[item.slot]===item.id));
      card.dataset.itemKey=String(presets?item.id:W.familyKey(item));
      const art=node('span','item-art'),url=presets?item.poses.normal.url:item.genders[state.gender].icon;
      if(url)art.append(image(url,''));else art.append(node('span','fallback-icon',category==='skin'?'●':'◇'));
      if(colorCount)art.append(node('span','color-count',colorCount));
      card.append(art,node('span','item-name',name),node('span','item-state'+(ready?' ready':!presets&&!item.enabled?' retired':''),presets?groupName(item):!item.enabled?'Config disabled · #'+item.id:ready?'Preview-ready':'Capture needed'));
      card.onclick=()=>presets?selectPreset(item):selectItem(item);
      const candidate=()=>presets?presetState(item):{...state,avatarIds:{...state.avatarIds,[item.slot]:item.id}};
      card.onpointerenter=card.onfocus=()=>prefetchLook(candidate());card.onpointerleave=()=>clearTimeout(hoverTimer);
      grid.append(card);
      yield;
    }
    return {grid,count:rows.length};
  }
  let openingRoster=null;
  function warmOpeningRoster(){
    if(!rosterDeferred||category!=='outfit'||openingRoster||document.hidden||!current)return;
    // Keep the partially built grid detached so a tap can take over between slices.
    const settings=rosterSettings(),job={key:JSON.stringify(settings),steps:buildRoster(settings)};
    openingRoster=job;
    const schedule=()=>window.requestIdleCallback?window.requestIdleCallback(advance):setTimeout(advance,32);
    function advance(deadline){
      if(openingRoster!==job)return;
      if(document.hidden){openingRoster=null;return;}
      const until=performance.now()+Math.min(6,deadline?deadline.timeRemaining():6);
      while(performance.now()<until){
        let step;
        try{step=job.steps.next();}
        catch{openingRoster=null;return;} // Opening the category can retry in the foreground.
        if(step.done){
          job.result=step.value;
          const connection=navigator.connection;
          if(!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType)){
            // Reuse these same images on tap. The rest can wait until the grid is visible.
            for(const img of job.result.grid.querySelectorAll('.item-card:nth-child(-n+4) img')){
              img.fetchPriority='low';img.loading='eager';
            }
          }
          return;
        }
      }
      schedule();
    }
    schedule();
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)warmOpeningRoster();});
  function drawItems(){
    rosterDeferred=embedded&&narrow.matches&&document.documentElement.classList.contains('reader-fit')&&$('wardrobe').dataset.level==='categories';
    if(rosterDeferred)return;
    const roster=$('items'),scrollTop=roster.scrollTop;
    const focused=roster.contains(document.activeElement)?document.activeElement.dataset.itemKey:null;
    const settings=rosterSettings(),{text,only}=settings,presets=category==='presets';
    const prepared=openingRoster?.key===JSON.stringify(settings)?openingRoster:null;
    openingRoster=null;
    const steps=prepared?.steps||buildRoster(settings);
    let result=prepared?.result;
    if(!result){
      let step;
      do{step=steps.next();}while(!step.done);
      result=step.value;
    }
    const {grid,count}=result;
    $('category-title').textContent=presets?'Complete looks':W.browseCategories(catalogue.categories).find(c=>c.id===category)?.name||'Wardrobe';
    $('result-count').textContent=count+' '+(presets?'look':'item')+(count===1?'':'s');$('no-items').hidden=!!count;
    if(!count){
      const hint=$('no-items').querySelector('p');
      if(only&&!text&&category==='bodypaint')hint.textContent='Body paint previews depend on the outfit, skin, build and expression. Try another outfit or turn off Preview-ready to browse the full list.';
      else if(only&&!text&&category==='makeup')hint.textContent='Makeup previews depend on the face, skin, build and expression. Try another face or turn off Preview-ready to browse the full list.';
      else hint.textContent='Clear the search, choose a complete look, or turn off Preview-ready to browse the full list.';
      if(!readyFilter||!only)hint.textContent=hint.textContent.replace(', choose a complete look, or turn off Preview-ready to browse the full list.',' or choose a complete look.').replace(' or turn off Preview-ready to browse the full list.','.');
    }
    drawColors(only);
    roster.replaceChildren(grid);
    fitItemNames();
    roster.scrollTop=scrollTop;
    if(focused)Array.from(roster.children).find(card=>card.dataset.itemKey===focused)?.focus({preventScroll:true});
  }
  function groupName(p){return p.group==='studio'?'Mix preview-ready parts':(p.group==='default'?'Default':/^s\d+$/.test(p.group)?'Season '+Number(p.group.slice(1)):p.group)+' · Look '+p.option;}
  let detailsRequest=null;
  function ensureCatalogueDetails(){
    if(!catalogue?.detailsManifest||detailsRequest)return;
    const currentCatalogue=catalogue;
    detailsRequest=get(catalogue.detailsManifest).then(r=>r.json()).then(details=>{
      if(catalogue!==currentCatalogue||!index)return;
      W.mergeCatalogueDetails(index.items,details);
      drawDetail();
    }).catch(()=>{detailsRequest=null;});
  }
  function drawDetail(){const el=$('item-detail'),item=index.items.get(state.avatarIds[detailSlot]);
    // Headwear and Hero headgear share a slot; each caption only its own items.
    el.hidden=!item||item.slot===W.categorySlot(category)&&W.itemCategory(item)!==category;if(el.hidden)return;el.replaceChildren();
    if(item.detailsPending)ensureCatalogueDetails();
    const {title,description}=W.itemDetailContent(item,state.gender,language,WardrobeLocale);
    el.append(node('strong','',title),node('div','detail-meta','AVATAR '+item.id+' · '+(readyFor(item)?'PREVIEW-READY':'CAPTURE NEEDED')),
    node('p','',description),node('small','',item.genders[state.gender].assetName||(item.detailsPending?'':item.slot==='bodyshape'?'Body build':'Material / appearance option')));
    if(item.genders[state.gender].previewLod)el.append(node('p','','Uses the game’s available lower-detail model.'));
  }
  function drawPoses(){
    const buttons=[];
    for(const [id,name] of poses){
      const pose=id;
      let yaw=backPoses.has(pose)?state.yaw||0:0;
      if(yaw&&!index.resolve(state,pose,yaw))yaw=0;
      const available=!!index.resolve(state,pose,yaw),button=node('button','',name);
      button.dataset.pose=pose;
      button.setAttribute('aria-pressed',String(state.pose===pose));
      button.disabled=!available;
      button.title=available?name:`${name} is unavailable for this look.`;
      button.onclick=()=>{state.pose=pose;state.yaw=yaw;persist();refresh();};
      buttons.push(button);
    }
    W.replacePoseButtons($('poses'),buttons);
  }
  function refresh(){
    openingRoster=null;
    readiness.clear();
    $('look-title').textContent=title();$('undo').disabled=!history.length;$('redo').disabled=!future.length;
    for(const b of document.querySelectorAll('[data-gender]'))b.setAttribute('aria-pressed',String(b.dataset.gender===state.gender));
    drawCategories();drawSelection();drawPoses();drawItems();drawDetail();
    const turn=$('toggle-view'),nextYaw=state.yaw===180?0:180;
    turn.hidden=!backPoses.has(state.pose);turn.textContent=nextYaw===180?'Back':'Front';
    turn.disabled=!index.resolve(state,state.pose,nextYaw);
    turn.title=turn.disabled?'This view is not yet available for the selected look.':`Show ${nextYaw===180?'back':'front'} view`;
    turn.setAttribute('aria-label',`Show ${nextYaw===180?'back':'front'} view`);
    const warnings=W.conflicts(state,index.items);$('compatibility').hidden=!warnings.length;$('compatibility').textContent=warnings.join(' ');
    render();
  }
  const sentDirectories=new WeakSet();
  async function renderView(view,options,isCurrent=()=>true,preview=false){
    const canvas=document.createElement('canvas');
    if(view.kind==='baked'||view.kind==='capture'||options.detail&&view.entry.hdReference){
      // CORS keeps the export canvas readable when the library is on another site.
      const img=new Image();img.crossOrigin='anonymous';img.src=new URL(view.kind==='baked'?view.portrait.url:view.entry.hdReference,DATA);await img.decode();
      const fast=view.kind==='capture'&&!options.detail;canvas.width=fast?512:img.naturalWidth;canvas.height=fast?768:img.naturalHeight;
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas;
    }
    const entry=view.entry,context={width:entry.width||captures.width,height:entry.height||captures.height,farClip:entry.farClip??captures.farClip,lightVS:entry.lightVS||captures.lightVS,profile:{...captures.profile,...entry.profile}};
    const lut=entry.lut||captures.lut;
    if(!isCurrent())return null;
    // Only URLs/metadata cross the worker boundary. Large transparent stacks
    // stay in the worker instead of requiring a second multi-gigabyte copy.
    const library=view.library||itemLibrary;
    if(library?.metadataOnly&&view.kind==='items')throw Error('The selected view metadata has not loaded.');
    const clothingFit=view.kind==='items'?ClothingFit.describe(entry,library,catalogue):null;
    const hairFit=view.kind==='items'&&options.hairFit?HairFit.describe(entry,library):null;
    const openingMembers=preview&&generation===1?library?.openingMembers:undefined;
    const packDirectories=library?.packDirectories&&!sentDirectories.has(library)?library.packDirectories:undefined;
    if(packDirectories)sentDirectories.add(library);
    const output=await compute({assetEntry:{layers:entry.layers,overlays:entry.overlays||[],surfaces:entry.surfaces||[],lut,clothingFit,hairFit},dataRoot:DATA.href,context,options,preview,openingMembers,packDirectories});
    if(output.cancelled||!isCurrent())return null;
    canvas.width=context.width;canvas.height=context.height;canvas.getContext('2d').putImageData(new ImageData(output.pixels,canvas.width,canvas.height),0,0);return canvas;
  }
  const detailIndexes=new WeakMap();
  async function resolveView(snapshot,pose=snapshot.pose||'normal'){
    if(!runtimeLibrary)return index.resolve(snapshot,pose);
    const yaw=snapshot.yaw||0;
    if(runtimeLibrary.opening){
      try{
        const fast=await runtimeLibrary.opening(snapshot.gender,pose,yaw);
        if(fast){
          if(!detailIndexes.has(fast))detailIndexes.set(fast,W.createIndex(catalogue,captures,fast));
          const hit=detailIndexes.get(fast).resolve(snapshot,pose);
          if(hit)return {...hit,library:fast};
        }
      }catch(_){/* Fall back to the full view shard if the opening micro-shard cannot load. */}
    }
    const library=await runtimeLibrary.ensure(snapshot.gender,pose,yaw);
    if(!detailIndexes.has(library))detailIndexes.set(library,W.createIndex(catalogue,captures,library));
    const view=detailIndexes.get(library).resolve(snapshot,pose);
    return view?{...view,library}:null;
  }
  function normalPortraitKey(snapshot,options){
    const digest=runtimeLibrary?.viewDigest?.(snapshot.gender,'normal',0);
    if(!digest||snapshot.yaw||snapshot.pose!=='normal')return '';
    // Bump the rendering revision when changing the compositor's visible output.
    return JSON.stringify(['2d-normal-v1',digest,W.key(snapshot.gender,snapshot.avatarIds),options]);
  }
  async function render(){
    const token=++generation,snapshot=clone(state);current=null;$('export-png').disabled=$('export-set').disabled=true;
    const target=$('avatar'),settings=lighting(),saved=openingPortrait;
    openingPortrait=null;
    let painted=false,preparing=true;
    if(saved&&saved.key===normalPortraitKey(snapshot,settings)&&saved.key&&typeof saved.source==='string'
        &&saved.source.startsWith('blob:'+location.origin+'/')&&index.resolve(snapshot)?.kind==='items'){
      const image=new Image();image.src=saved.source;
      image.decode().then(()=>{
        if(token!==generation||!preparing)return;
        target.width=image.naturalWidth;target.height=image.naturalHeight;
        target.getContext('2d').drawImage(image,0,0);target.hidden=false;
        $('empty-preview').hidden=true;$('loading').hidden=true;painted=true;
      }).catch(()=>{});
    }
    if(embedded)$('reader-use').disabled=true;
    $('loading').hidden=false;$('preview-status').textContent='Preparing the selected appearance…';
    let view;
    try{view=await resolveView(snapshot);}catch(error){preparing=false;if(token===generation){$('loading').hidden=true;target.hidden=true;$('preview-status').textContent='Preview could not load: '+error.message;}return;}
    if(token!==generation)return;
    const detailed=view?.kind==='baked'||!!view?.entry?.hdReference;
    const captured=detailed||view?.kind==='capture';
    $('fit-control').hidden=!(view?.kind==='items'&&view.entry.yaw===180&&(state.avatarIds.cloak||state.avatarIds.back));
    $('hair-fit-control').hidden=!(view?.kind==='items'&&HairFit.describe(view.entry,view.library||itemLibrary));
    preparing=!!view;
    if(!painted)target.getContext('2d').clearRect(0,0,target.width,target.height);
    target.hidden=!view;$('empty-preview').hidden=!!view;$('loading').hidden=!view||painted;
    $('light-controls').disabled=!view||captured;$('preview-kind').textContent=view?(captured?'COMPLETE UNITY CAPTURE':view.kind==='items'?'REUSABLE ITEM PREVIEW':'COMPOSED PREVIEW'):'CAPTURE NEEDED';$('resolution').textContent='';
    $('lighting-caption').textContent=captured?'Baked into portrait':'Capture lighting';$('light-note').textContent=captured?'This capture includes the original Unity lighting and effects.':'Rim lighting, bloom and grading use the capture profile. Effects are a fixed frame.';
    if(!view){$('preview-status').textContent='Some selected parts or appearance variants need preview data. You can still save or export the recipe.';return;}
    $('preview-status').textContent='Preparing the selected appearance…';
    try{const canvas=await renderView(view,settings,()=>token===generation,true);if(token!==generation)return;target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);current={view,canvas,token};
      $('resolution').textContent=canvas.width+' × '+canvas.height;$('preview-status').textContent=view.kind==='items'?'Assembled from reusable items · depth-aware veils and adjustable lighting.':view.kind==='layers'?(detailed?'Detailed Unity render · original lighting, 4× antialiasing.':'Preview-ready · this combination was checked against a complete Unity render.'):view.kind==='capture'?(detailed?'Detailed Unity render · original lighting, 4× antialiasing.':'Preview-ready · complete Unity capture with original lighting and effects.'):'Complete captured look · changing parts needs matching captures.';
      $('export-png').disabled=$('export-set').disabled=false;
      warmOpeningRoster();
      if(embedded)$('reader-use').disabled=readerBusy||!readerSession||!index.resolve({...state,yaw:0},'normal');
    }catch(error){if(token!==generation)return;target.hidden=true;$('preview-status').textContent='Preview could not load: '+error.message;}
    finally{preparing=false;if(token===generation)$('loading').hidden=true;}
  }
  const downloadUrls=new Set();
  function clearReadyDownload(){const old=$('export-dialog').querySelector('.ready-download');if(old){URL.revokeObjectURL(old.href);downloadUrls.delete(old.href);old.remove();}}
  function download(blob,name,readyLabel){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    if(readyLabel){clearReadyDownload();a.textContent=readyLabel;a.className='ready-download';$('export-dialog').querySelector('form').append(a);downloadUrls.add(url);}
    else setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  window.addEventListener('pagehide',()=>{for(const url of downloadUrls)URL.revokeObjectURL(url);});
  const slug=name=>(name||'merlin').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'merlin';
  const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png'));
  async function buildReaderPack(snapshot,settings,name,progress=()=>{}){
    snapshot={...clone(snapshot),pose:'normal',yaw:0};
    let previewKey='';
    if(!index.resolve(snapshot,'normal'))throw new Error('A Hand on Hip preview is required to use this look for Merlin.');
    const pack={schema:'afk.reader.portrait-pack',version:1,gender:snapshot.gender,displayName:name.trim().slice(0,80)||'My Merlin',recipe:{avatarIds:Object.fromEntries(Object.entries(snapshot.avatarIds).filter(([slot])=>slot!=='footprint')),presentation:{rim:settings.rim,bloom:settings.bloom,grade:settings.grade,hairFit:settings.hairFit,clothingFit:settings.clothingFit}},poses:{}};
    for(const [pose,label] of poses){
      if(!index.resolve(snapshot,pose))continue;
      progress(label);const view=await resolveView(snapshot,pose),canvas=await renderView(view,settings);
      if(pose==='normal'&&view.kind==='items')previewKey=normalPortraitKey(snapshot,settings);
      pack.framing ||= view.framing;pack.poses[pose]={png:canvas.toDataURL('image/png'),framing:view.framing};
      if(view.portrait?.choiceFraming)pack.poses[pose].choiceFraming=view.portrait.choiceFraming;
    }
    const source=JSON.stringify(pack);if(new Blob([source]).size>24*1024*1024)throw new Error('This look exceeds the 24 MB portrait-pack limit.');
    return {pack:source,previewKey};
  }
  async function useForMerlin(){
    if(readerBusy||!readerSession||!current)return;
    readerBusy=exporting=true;$('reader-use').disabled=$('reader-back').disabled=$('random').disabled=true;
    const sessionId=readerSession,snapshot=clone(state),name=$('reader-look-name').value.trim()||title();
    try{
      const saved=await buildReaderPack(snapshot,lighting(),name,label=>{$('reader-save-status').textContent='Preparing '+label+'…';});
      if(sessionId!==readerSession)return;
      $('reader-save-status').textContent='Saving look…';
      window.parent.postMessage({type:'tea-wardrobe-apply',sessionId,...saved},location.origin);
    }catch(error){$('reader-save-status').textContent=error.message;readerBusy=exporting=false;$('reader-back').disabled=$('random').disabled=false;$('reader-use').disabled=!current;}
  }
  function applyReaderInit(message){
    $('reader-beta').hidden = !message.hasBeta;
    reportExpanded(setExpanded(message.expanded===true));
    if(message.sessionId===readerSession)return;
    readerSession=message.sessionId;readerBusy=exporting=false;$('reader-back').disabled=$('random').disabled=false;$('reader-save-status').textContent='';
    const seed=message.seed||{},gender=seed.gender==='male'?'male':'female',recipe=seed.recipe||{};
    const preset=catalogue.presets.find(row=>row.id===recipe.sourcePreset&&row.gender===gender);
    let next=defaultState(gender);
    if (recipe.wardrobe3d) {
      // The installed 3D editor may be unavailable. Keep the saved look intact.
      $('reader-save-status').textContent = 'This look needs the 3D wardrobe. Start a new 2D look to edit.';
      readerSession = '';
      $('reader-use').disabled = true;
      refresh();
      return;
    }
    if(recipe.avatarIds?.outfit)next={...next,avatarIds:W.normalize(recipe.avatarIds),name:seed.name||''};
    else if(preset)next={...next,avatarIds:W.normalize(preset.recipe)};
    else if(recipe.sourcePreset){$('reader-save-status').textContent='This preset is unavailable in the wardrobe. The default look is shown.';}
    const settings=recipe.presentation||{};for(const key of ['rim','bloom','grade'])$(key).checked=settings[key]!==false;
    $('hair-fit').checked=settings.hairFit!==false;$('clothing-fit').value=settings.clothingFit===false?'native':'clothing';
    openingPortrait=seed.openingPortrait||null;
    history=[];future=[];detailSlot=null;$('reader-look-name').value=seed.name||'';setState(next,{record:false});
  }
  window.addEventListener('message',event=>{
    if(!embedded||event.origin!==location.origin||event.source!==window.parent)return;
    const message=event.data||{},init=message.type==='tea-wardrobe-init';
    if(init||message.type==='tea-wardrobe-language'){
      const next=WardrobeLocale.language(message.language);
      if(next!==language){
        language=next;translate();
        if(studioReady&&(!init||message.sessionId===readerSession))refresh();
      }
      if(init){
        if(studioReady)applyReaderInit(message);
        else {pendingReaderInit=message;prepareOpeningPacks(message.seed);}
      }
      return;
    }
    if(message.sessionId===readerSession&&['tea-wardrobe-error','tea-wardrobe-saved'].includes(message.type)){
      readerBusy=exporting=false;$('reader-back').disabled=$('random').disabled=false;$('reader-use').disabled=!current;
      $('reader-save-status').textContent=message.type==='tea-wardrobe-error'?message.message:'Look saved and applied. You can keep editing.';
      if(message.type==='tea-wardrobe-saved')notify('Look saved and applied. You can keep editing.');
    }
  });
  async function exportSet(kind){
    if(exporting)return;const snapshot=clone(state),settings=lighting(),name=title();exporting=true;$('download-zip').disabled=$('download-pack').disabled=true;
    const token=generation;try{
      const poses=portraitPoses.filter(([pose])=>(snapshot.yaw!==180||backPoses.has(pose))&&index.resolve(snapshot,pose));if(!poses.some(([p])=>p==='normal'))throw new Error('A Hand on Hip capture is required to export a portrait set.');
      const files=[],pack={schema:'afk.reader.portrait-pack',version:1,gender:snapshot.gender,displayName:name.slice(0,80),recipe:{avatarIds:Object.fromEntries(Object.entries(snapshot.avatarIds).filter(([slot])=>slot!=='footprint'))},poses:{}};
      for(const [pose,label] of poses){$('export-status').textContent='Preparing '+label+'…';const view=await resolveView(snapshot,pose),canvas=await renderView(view,settings),blob=await png(canvas);
        files.push({name:pose+'.png',bytes:new Uint8Array(await blob.arrayBuffer())});const framing=view.framing;pack.framing||=framing;
        pack.poses[pose]={png:canvas.toDataURL('image/png'),framing};if(view.portrait?.choiceFraming)pack.poses[pose].choiceFraming=view.portrait.choiceFraming;
      }
      files.push({name:'appearance.recipe.json',bytes:new TextEncoder().encode(JSON.stringify(W.exportRecipe({...snapshot,name}),null,2))});
      const fileStem=slug(name)+(snapshot.yaw===180?'-back':'')+(settings.detail?'-hd':'');
      if(kind==='zip')download(W.zip(files),fileStem+'-portraits.zip','Download ready PNG set');else{const blob=new Blob([JSON.stringify(pack)],{type:'application/json'});if(blob.size>24*1024*1024)throw new Error('Pack is larger than the supported 24 MB. Download the PNG set instead.');download(blob,fileStem+'.portraitpack.json','Download ready portrait pack');}
      $('export-status').textContent='Prepared '+poses.length+' poses'+(token!==generation?' from the look selected when export started.':'.')+' If the download did not start, use the ready-file link below.';
    }catch(error){$('export-status').textContent=error.message;}finally{exporting=false;$('download-zip').disabled=$('download-pack').disabled=false;}
  }
  async function start(){
    try{
      // The parent can supply the opening look while the assets are still downloading.
      if(embedded)window.parent.postMessage({type:'tea-wardrobe-ready'},location.origin);
      let stored;
      try{stored=JSON.parse(localStorage.getItem(STORE));}catch(_){}
      if(!embedded)standaloneOpeningSeed={gender:stored?.draft?.gender||'female',recipe:stored?.draft};
      const data=await loadStartupData(stored?.draft?.gender),loaded=data.loaded;
      catalogue=data.catalogue;captures=data.captures;itemLibrary=loaded.library;runtimeLibrary=loaded.runtime;
      buildFamilies();index=W.createIndex(catalogue,captures,itemLibrary);state=defaultState(embedded&&params.get('gender')==='male'?'male':'female');
      try{if(stored?.draft)state=W.parseRecipe(JSON.stringify(stored.draft),index.items);if(stored?.presentation?.clothingFit===false)$('clothing-fit').value='native';if(stored?.presentation?.hairFit===false)$('hair-fit').checked=false;}catch(_){}
      libraryStats();
      $('coverage-note').textContent=itemLibrary?'Development: full catalogue · Reusable items compose as you choose':'Development: full catalogue · Preview-ready is specific to the selected look';
      $('search').oninput=drawRoster;readyFilter?.addEventListener('change',drawRoster);$('sort').onchange=drawRoster;$('sort-order').onchange=drawRoster;
      $('find-ready').onclick=()=>{category='presets';$('search').value='';openCategory();drawCategories();drawRoster();$('category-title').scrollIntoView({behavior:'smooth',block:'center'});};
      state=canonicalState(state);
      $('random').disabled=false;
      $('random').onclick=()=>{
        if(readerBusy||exporting)return;
        const next=W.randomLook(state,index,catalogue.presets);
        if(!next){notify(WardrobeLocale.text('No other preview-ready look is available.',language));return;}
        detailSlot='outfit';setState(next);
      };
      for(const b of document.querySelectorAll('[data-gender]'))b.onclick=()=>{if(state.gender!==b.dataset.gender){detailSlot=null;setState(defaultState(b.dataset.gender));}};
      $('reset').onclick=()=>{detailSlot=null;setState(defaultState(state.gender));};$('undo').onclick=()=>{if(history.length){future.push(clone(state));setState(history.pop(),{record:false});}};$('redo').onclick=()=>{if(future.length){history.push(clone(state));setState(future.pop(),{record:false});}};
      const resetPreview=setupPreviewNavigation();
      $('backdrop').onchange=()=>{const id=$('backdrop').value;$('stage').classList.remove('light','checker');if(['light','checker'].includes(id))$('stage').classList.add(id);WardrobeBackgrounds.apply($('stage'),id);};$('framing').onchange=()=>{$('stage').classList.toggle('portrait',$('framing').value==='portrait');resetPreview();};
      $('toggle-view').onclick=()=>{state.yaw=state.yaw===180?0:180;persist();refresh();};
      $('mobile-preview').onclick=()=>$('stage').scrollIntoView({behavior:'smooth',block:'start'});
      new IntersectionObserver(entries=>{$('mobile-preview').hidden=entries[0].isIntersecting;}).observe($('stage'));
      for(const id of ['rim','bloom','grade'])$(id).onchange=render;
      $('clothing-fit').onchange=()=>{try{const stored=JSON.parse(localStorage.getItem(STORE)||'{}');stored.presentation={...stored.presentation,clothingFit:$('clothing-fit').value==='clothing'};localStorage.setItem(STORE,JSON.stringify(stored));}catch(_){}render();};
      $('hair-fit').onchange=()=>{try{const stored=JSON.parse(localStorage.getItem(STORE)||'{}');stored.presentation={...stored.presentation,hairFit:$('hair-fit').checked};localStorage.setItem(STORE,JSON.stringify(stored));}catch(_){}render();};
      $('load-recipe').onclick=()=>$('recipe-file').click();$('recipe-file').onchange=async()=>{const file=$('recipe-file').files[0];try{if(!file)return;if(file.size>131072)throw new Error('Choose a recipe smaller than 128 KB.');setState(W.parseRecipe(await file.text(),index.items));notify('Recipe opened.');}catch(error){notify(error.message);}finally{$('recipe-file').value='';}};
      $('save-recipe').onclick=()=>download(new Blob([JSON.stringify(W.exportRecipe({...state,name:title()}),null,2)],{type:'application/json'}),slug(title())+'.recipe.json');
      $('export-png').onclick=async()=>{const selected=current,name=slug(title())+'-'+state.pose+(state.yaw===180?'-back':'')+'.png';if(!selected)return;try{download(await png(selected.canvas),name);}catch(e){notify(e.message);}};
      $('export-set').onclick=()=>{
        clearReadyDownload();
        const poses=portraitPoses.filter(([pose])=>(state.yaw!==180||backPoses.has(pose))&&index.resolve(state,pose));
        const summary=$('export-poses');
        summary.replaceChildren(node('span','',state.yaw===180?'Back':'Front'),' · ',node('span','','Available poses'),': ');
        poses.forEach(([,label],i)=>{if(i)summary.append(', ');summary.append(node('span','',label));});
        $('export-status').textContent='';$('export-dialog').showModal();
      };
      $('download-zip').onclick=()=>exportSet('zip');$('download-pack').onclick=()=>exportSet('pack');
      studioReady=true;
      if(pendingReaderInit){applyReaderInit(pendingReaderInit);pendingReaderInit=null;}
      else{
        refresh();
        if(embedded)window.parent.postMessage({type:'tea-wardrobe-ready'},location.origin);
      }
      if(loaded.watch!==false)watchLibrary(loaded.stamp);
    }catch(error){
      const empty=$('empty-preview');
      empty.hidden=false;
      empty.querySelector('h2').textContent='The wardrobe library is unavailable';
      $('find-ready').hidden=true;
      if(embedded){
        empty.querySelector('p').textContent='Reload the reader to try again.';
        $('preview-status').textContent='';
        empty.title=error.message;
      }else{
        $('preview-status').textContent='The studio could not start: '+error.message;
        $('capture-count').textContent='Run Start Wardrobe.cmd to open the local studio.';
        empty.querySelector('p').textContent='Open this app with Start Wardrobe.cmd. It serves the catalogue and captures together, without starting the reader.';
      }
    }
  }
  if(embedded){
    embedInReader();
    document.documentElement.classList.remove('reader-opening');
  }
  else {
    const languageLabel=node('label','','Language '),select=node('select');select.setAttribute('aria-label','Language');
    for(const code of ['en','cn','jp','kr']){const option=node('option','',code.toUpperCase());option.value=code;select.append(option);}
    select.value=language;select.onchange=()=>{language=select.value;const url=new URL(location.href);url.searchParams.set('lang',language);window.history.replaceState(null,'',url);translate();if(studioReady)refresh();};
    languageLabel.append(select);document.querySelector('.header-actions').prepend(languageLabel);
  }
  const translateDocument=WardrobeLocale.observe(document,()=>language);
  translate();
  start();
})();
