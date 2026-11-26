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
/* Prototype: render an exported wardrobe look with WebGL2, reproducing the
   Unity capture path (AFKRecovered/PortraitLighting + PortraitLinearDepth rim
   prepass + PortraitBloom + PortraitGrade with the dialogue LUT).
   Shader code is a direct port of the Unity sources; see comments per stage. */
'use strict';

const PROFILE = { // PortraitLightingProfiles.json, "dialogue"
  direction: [-0.3383031126, 0.2766602251, 0.8994501631], intensity: 1, probe: 0, specular: 1, emission: 1,
  neutral: 1, lut: 0.85, ambientColor: [0.155126363, 0.271165937, 0.396226406, 1], zoneColor: [1, 1, 1, 1],
  bloom: 2, bloomThreshold: 1, bloomClamp: 65472, bloomScatter: 0.7, bloomSkipIterations: 1, bloomQualitySkip: 0,
};

const COMMON = `#version 300 es
precision highp float; precision highp int;
vec3 FromSrgb(vec3 v){ return mix(v/12.92, pow(max((v+.055)/1.055,vec3(0)),vec3(2.4)), step(vec3(.04045),v)); }
vec3 ToSrgb(vec3 v){ return mix(v*12.92, 1.055*pow(max(v,vec3(0)),vec3(1.0/2.4))-.055, step(vec3(.0031308),v)); }
`;

// Mesh vertex shader. Positions/normals are already world space (baked pose).
const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec2 aUv; layout(location=3) in vec2 aUv1;
uniform mat4 uView, uProj; uniform vec4 uMainST, uMakeupST;
out vec2 vUv; out vec2 vUv1; out vec3 vNormal; out vec3 vWorld; out float vEyeDepth;
void main(){
  vec4 view = uView*vec4(aPos,1.0);
  gl_Position = uProj*view;
  vUv = aUv*uMainST.xy+uMainST.zw; vUv1 = aUv1*uMakeupST.xy+uMakeupST.zw;
  vNormal = aNormal; vWorld = aPos; vEyeDepth = -view.z;
}`;

// AFKRecovered/PortraitLinearDepth fragment.
const DEPTH_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vUv1; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth;
uniform sampler2D _MainTex; uniform vec4 _Color; uniform float _Cutoff, _ALPHATEST, _ProbeForceOpaque;
out vec4 outColor;
void main(){
  if(_ALPHATEST>.5 && _ProbeForceOpaque<.5 && texture(_MainTex,vUv).a*_Color.a-_Cutoff<0.0) discard;
  outColor = vec4(vEyeDepth,0,0,1);
}`;

// AFKRecovered/PortraitLighting frag (gamma color space path), _PortraitLayerMode = 0.
const LIT_FS = COMMON + `
in vec2 vUv; in vec2 vUv1; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth;
uniform sampler2D _MainTex, _MiscMap, _Mask, _MAKEUP_Tex, _ProbeLinearDepth;
uniform float _MAKEUP, _ProbeSkin, _Thickness, _SubsurfaceNormalDistortion, _ScatteringExp, _ScatteringScale;
uniform vec4 _SubsurfaceAmbient, _SubsurfaceTint, _Color, _MidTint, _DarkTint, _EmissionColor;
uniform vec4 _ProbeLightDirection, _ProbeZoneColor, _ProbeAmbientColor, _ProbeSH;
uniform float _ShadowThreshold, _ShadowFeather, _DarkThreshold, _EnvColorWeight, _LightProbWeight, _GlobalColorFactorWeight, _ALPHATEST, _Cutoff;
uniform float _ProbeForceOpaque, _ProbeZoneIntensity, _ProbeShadowFactor, _ProbeGlobalFactor, _ProbeEmission;
uniform float _ProbeSpecular, _ProbeReflection, _Roughness, _Metallic, _SpecularRange, _SpecularFeather, _IndirectSpecular;
uniform vec4 _SpecularColor, _SpecularOffset;
uniform float _CharDepthRimState, _ProbeRim; uniform vec4 _ProbeRimShape, _ProbeRimColor;
uniform mat4 uView; uniform vec2 uResolution;
out vec4 outColor;
void main(){
  vec4 tex = texture(_MainTex,vUv);
  vec3 base = FromSrgb(tex.rgb);
  base *= _Color.rgb;
  if(_MAKEUP>0.0){ vec4 o=texture(_MAKEUP_Tex,vUv1); o.rgb=FromSrgb(o.rgb); base=mix(base,o.rgb,clamp(o.a*_MAKEUP,0.,1.)); }
  vec3 N = normalize(vNormal), L = normalize(_ProbeLightDirection.xyz);
  // Orthographic: V = UNITY_MATRIX_V[2].xyz (third row of the view matrix).
  vec3 V = vec3(uView[0][2], uView[1][2], uView[2][2]);
  vec4 misc = texture(_MiscMap,vUv);
  float rough = clamp(misc.b*_Roughness,0.,1.), metal = misc.a*_Metallic;
  vec3 diffuseBase = _ProbeSpecular>.5 ? max(base*(1.-metal),vec3(0.000061)) : base;
  float h = dot(N,L)*.5+.5;
  float feather = max(_ShadowFeather,0.000061);
  float a = min(_ProbeShadowFactor, clamp((h-(_ShadowThreshold-_ShadowFeather))/feather,0.,1.));
  float b = clamp((h-(_ShadowThreshold*_DarkThreshold-_ShadowFeather))/feather,0.,1.);
  vec3 dark = diffuseBase*_DarkTint.rgb;
  vec3 tone = mix(dark,diffuseBase,a);
  tone = mix(tone,diffuseBase*_MidTint.rgb,a*(1.-a));
  tone = mix(dark,tone,b);
  if(_ProbeSkin>.5 && _Thickness<1.){
    float scatter = pow(clamp(dot(normalize(V),-(L+N*_SubsurfaceNormalDistortion)),0.,1.),max(_ScatteringExp,.000061))*_ScatteringScale;
    tone += (_SubsurfaceAmbient.rgb+scatter*_SubsurfaceTint.rgb)*(1.-_Thickness)*(1.-texture(_Mask,vUv).a);
  }
  vec3 direct = min(_ProbeZoneIntensity,1.5)*mix(vec3(1),_ProbeZoneColor.rgb,_EnvColorWeight);
  float mixWeight = clamp((1.-_EnvColorWeight)*(1.-a)+a,0.,1.);
  vec3 ambient = mix(base,base*_ProbeAmbientColor.rgb,_ProbeAmbientColor.a);
  if(_ProbeSpecular>.5) ambient *= 1.-metal;
  ambient = max(ambient,vec3(0.000061));
  vec3 directSpec = vec3(0), indirectSpec = vec3(0);
  if(_ProbeSpecular>.5){
    vec3 f0 = mix(vec3(.04),base,metal);
    vec3 H = normalize(normalize(V+_SpecularOffset.xyz)+L);
    float alpha = max(rough*rough,0.000061), alpha2 = alpha*alpha;
    float nh = clamp(dot(N,H),0.,1.), lh = clamp(dot(L,H),0.,1.);
    float denominator = nh*nh*(alpha2-1.)+1.00001;
    denominator = denominator*denominator*max(lh*lh,.1)*(4.*alpha+2.);
    float brdf = clamp(alpha2/denominator-0.000061,0.,1.);
    float width = mix(.001,_SpecularRange,_SpecularFeather);
    float lo = clamp(_SpecularRange-width,0.,1.), hi = clamp(_SpecularRange+width,0.,1.);
    float t = clamp((brdf-lo)/max(hi-lo,0.000001),0.,1.);
    float shape = t*t*(3.-2.*t);
    directSpec = f0*shape*direct*_SpecularColor.rgb*clamp(dot(N,L),0.,1.)*(1.-rough);
    // Reflection cube (_ProbeReflection) not exported in this prototype.
  }
  vec3 result = mix(ambient*direct, tone*direct+directSpec, mixWeight);
  if(_ProbeRim>0. && _CharDepthRimState>=.5){
    vec2 lightVS = (mat3(uView)*L).xy; lightVS /= max(length(lightVS),.000061);
    vec2 normalVS = (mat3(uView)*N).xy;
    float weight = (max(dot(normalVS,lightVS),.001)+_ProbeRimShape.y)/(1.+_ProbeRimShape.y);
    vec2 uv = gl_FragCoord.xy/uResolution + normalVS*_ProbeRimShape.x*weight*.00125;
    float sampledDepth = texture(_ProbeLinearDepth,uv).r;
    float edge = clamp(sampledDepth-vEyeDepth,0.,1.)/max(_ProbeRimShape.z,.000061);
    vec3 tint = mix(_ProbeRimColor.rgb,_ProbeZoneColor.rgb,pow(clamp(weight,0.,1.),_ProbeRimShape.w));
    result += clamp(edge*tint,0.,1.)*direct*_ProbeRim;
  }
  result += misc.r*_EmissionColor.rgb*_ProbeEmission;
  result += max(_ProbeSH.rgb,vec3(0))*_LightProbWeight*base;
  result += indirectSpec;
  result = max(result,vec3(0))*(1.-_ProbeGlobalFactor*_GlobalColorFactorWeight);
  result = ToSrgb(result);
  float alphaOut = tex.a*_Color.a;
  if(_ALPHATEST>.5 && alphaOut-_Cutoff<0.0) discard;
  if(_ProbeForceOpaque>.5) alphaOut = 1.;
  outColor = vec4(result,alphaOut);
}`;

// AFK/Avatar Surface (unlit texture x tint), gamma color space: raw output.
const SURFACE_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vUv1; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth;
uniform sampler2D _MainTex; uniform vec4 _Color; uniform float _ALPHATEST, _Cutoff;
out vec4 outColor;
void main(){ vec4 c=texture(_MainTex,vUv)*_Color; if(_ALPHATEST>.5 && c.a-_Cutoff<0.0) discard; outColor=c; }`;

const SHADERS = { 'AFKRecovered/PortraitLighting': 'lit', 'AFK/Avatar Surface': 'surface' };

const QUAD_VS = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
out vec2 vUv; void main(){ vec2 p=P[gl_VertexID]; vUv=p*.5+.5; gl_Position=vec4(p,0,1); }`;

// AFKRecovered/PortraitBloom passes.
const BLOOM_FS = {
  prefilter: COMMON + `in vec2 vUv; uniform sampler2D _MainTex; uniform vec4 _BloomParams; out vec4 o;
    void main(){ vec3 color=FromSrgb(texture(_MainTex,vUv).rgb); color=min(color,vec3(_BloomParams.y));
      float brightness=max(color.r,max(color.g,color.b));
      float soft=clamp(brightness-_BloomParams.z+_BloomParams.w,0.,2.*_BloomParams.w);
      soft=soft*soft/(4.*_BloomParams.w+.0001);
      o=vec4(max(color*(max(soft,brightness-_BloomParams.z)/max(brightness,.0001)),vec3(0)),0); }`,
  horizontal: `#version 300 es
    precision highp float; in vec2 vUv; uniform sampler2D _MainTex; uniform vec4 _MainTex_TexelSize; out vec4 o;
    void main(){ vec2 s=vec2(_MainTex_TexelSize.x*2.,0);
      vec4 c=texture(_MainTex,vUv)*.227027;
      c+=(texture(_MainTex,vUv-s)+texture(_MainTex,vUv+s))*.194595;
      c+=(texture(_MainTex,vUv-2.*s)+texture(_MainTex,vUv+2.*s))*.121622;
      c+=(texture(_MainTex,vUv-3.*s)+texture(_MainTex,vUv+3.*s))*.054054;
      o=c+(texture(_MainTex,vUv-4.*s)+texture(_MainTex,vUv+4.*s))*.016216; }`,
  vertical: `#version 300 es
    precision highp float; in vec2 vUv; uniform sampler2D _MainTex; uniform vec4 _MainTex_TexelSize; out vec4 o;
    void main(){ vec2 a=vec2(0,_MainTex_TexelSize.y*1.384615), b=vec2(0,_MainTex_TexelSize.y*3.230769);
      o=texture(_MainTex,vUv)*.227027+(texture(_MainTex,vUv-a)+texture(_MainTex,vUv+a))*.316216
        +(texture(_MainTex,vUv-b)+texture(_MainTex,vUv+b))*.070270; }`,
  upsample: `#version 300 es
    precision highp float; in vec2 vUv; uniform sampler2D _MainTex, _LowMip; uniform vec4 _BloomParams; out vec4 o;
    void main(){ o=mix(texture(_MainTex,vUv),texture(_LowMip,vUv),_BloomParams.x); }`,
};

// AFKRecovered/PortraitGrade.
const GRADE_FS = COMMON + `in vec2 vUv; uniform sampler2D _MainTex, _UserLut, _BloomTex; uniform vec4 _UserLut_TexelSize;
uniform float _Neutral, _Contribution, _BloomIntensity, _Unpremultiply; out vec4 o;
vec3 Neutral(vec3 v){ v=max(v,vec3(0)); vec3 a=v*.262677+.0696; vec3 b=v*1.313386; vec3 c=b*(v*.262677+.29)+.0816; return ((b*a+.00544)/c-.066667)*1.313386; }
vec3 Lookup(vec3 color){ float n=_UserLut_TexelSize.w; vec3 p=clamp(color,0.,1.)*(n-1.); float slice=floor(p.b);
  vec2 uv=(p.rg+.5)*_UserLut_TexelSize.xy; uv.x+=slice/n;
  vec3 a=textureLod(_UserLut,uv,0.).rgb; vec3 b=textureLod(_UserLut,uv+vec2(1./n,0),0.).rgb; return mix(a,b,fract(p.b)); }
void main(){ vec4 value=texture(_MainTex,vUv); vec3 linearColor=value.rgb;
  if(_Unpremultiply>.5) linearColor=value.a>0.?linearColor/max(value.a,.000061):vec3(0);
  linearColor=FromSrgb(linearColor);
  linearColor+=texture(_BloomTex,vUv).rgb*_BloomIntensity;
  if(_Neutral>.5) linearColor=Neutral(linearColor);
  vec3 gamma=ToSrgb(max(linearColor,vec3(0)));
  if(_Contribution>0.) gamma=mix(clamp(gamma,0.,1.),Lookup(gamma),_Contribution);
  o=vec4(gamma,value.a); }`;

const BLEND = [0, 1, 0x0306, 0x0300, 0x0307, 0x0302, 0x0301, 0x0304, 0x0305, 0x0308, 0x0303]; // Unity BlendMode -> GL

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available.');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets are not supported.');
    gl.getExtension('OES_texture_float_linear');
    this.programs = {};
    this.frontFace = gl.CW;
  }
  program(key, vs, fs) {
    if (this.programs[key]) return this.programs[key];
    const gl = this.gl, compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(key + ': ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(key + ': ' + gl.getProgramInfoLog(p));
    const uniforms = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); uniforms[info.name] = { loc: gl.getUniformLocation(p, info.name), type: info.type }; }
    return this.programs[key] = { p, uniforms };
  }
  target(width, height, format = this.gl.RGBA16F, filter = this.gl.LINEAR) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, width, height };
  }
  async load(base) {
    const gl = this.gl, manifest = this.manifest = await (await fetch(base + 'manifest.json')).json();
    this.textures = {}; const images = new Map();
    const textureFor = async name => {
      if (!name || name.startsWith('cube:')) return null;
      if (!images.has(name)) images.set(name, (async () => {
        const blob = await (await fetch(base + name)).blob();
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        const mips = !/[?&]nomip/.test(location.search);
        if (mips) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return tex;
      })());
      return images.get(name);
    };
    const solid = rgba => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); return t; };
    this.white = solid([255, 255, 255, 255]); this.black = solid([0, 0, 0, 0]);
    this.materials = {};
    for (const m of manifest.materials) {
      const props = {};
      for (const p of m.props) props[p.name] = p.type === 'texture' ? { texture: await textureFor(p.texture), st: p.st } : p.type === 'vector' ? p.vector : p.value;
      this.materials[m.id] = { ...m, values: props };
    }
    this.parts = [];
    let bytes = 0;
    for (const part of manifest.parts) {
      const buffer = await (await fetch(base + part.file)).arrayBuffer(); bytes += buffer.byteLength;
      const n = part.vertexCount; let o = 0;
      const take = (count, Type) => { const a = new Type(buffer, o, count); o += count * Type.BYTES_PER_ELEMENT; return a; };
      const pos = take(n * 3, Float32Array), nor = take(n * 3, Float32Array), uv = take(n * 2, Float32Array), uv1 = part.hasUv1 ? take(n * 2, Float32Array) : null;
      const index = new Uint32Array(buffer, o);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const attr = (loc, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
      attr(0, pos, 3); attr(1, nor, 3); attr(2, uv, 2);
      if (uv1) attr(3, uv1, 2); else { gl.disableVertexAttribArray(3); gl.vertexAttrib2f(3, 0, 0); }
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
      this.parts.push({ ...part, vao, center: [cx / n, cy / n, cz / n] });
    }
    this.geometryBytes = bytes;
    this.lut = await new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = reject; img.src = base + 'lut.png'; });
    const lutTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.lut); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.lutTex = lutTex;
  }
  cameraMatrices() {
    const c = this.manifest.camera;
    const view = new Float32Array(c.worldToCamera); // Unity worldToCameraMatrix, column-major, OpenGL view convention.
    const r = c.size * c.aspect, t = c.size, n = c.near, f = c.far;
    const proj = new Float32Array([1 / r, 0, 0, 0, 0, 1 / t, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
    return { view, proj, width: c.width, height: c.height };
  }
  draws() {
    // Unity: opaque queue (<=2500) front-to-back; transparent back-to-front by distance.
    const { view } = this.cameraMatrices(), list = [];
    for (const part of this.parts) for (const sub of part.submeshes) {
      const material = this.materials[sub.material]; if (!material || !SHADERS[material.shader]) continue;
      const p = part.center, z = view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14];
      list.push({ part, sub, material, distance: -z });
    }
    const opaque = list.filter(d => d.material.queue <= 2500).sort((a, b) => a.material.queue - b.material.queue || a.distance - b.distance);
    const transparent = list.filter(d => d.material.queue > 2500).sort((a, b) => a.material.queue - b.material.queue || b.distance - a.distance);
    return { opaque, transparent, all: [...opaque, ...transparent] };
  }
  bindMaterial(prog, material, unitStart = 0) {
    const gl = this.gl, v = material.values; let unit = unitStart;
    for (const [name, u] of Object.entries(prog.uniforms)) {
      if (u.type === gl.SAMPLER_2D) {
        if (name === '_ProbeLinearDepth') continue;
        const value = v[name]; gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value?.texture || (name === '_MainTex' ? this.white : this.black)); gl.uniform1i(u.loc, unit++);
      } else if (u.type === gl.FLOAT && name in v) gl.uniform1f(u.loc, v[name]);
      else if (u.type === gl.FLOAT_VEC4 && name in v && Array.isArray(v[name])) gl.uniform4fv(u.loc, v[name]);
    }
    const st = name => v[name]?.st || [1, 1, 0, 0];
    if (prog.uniforms.uMainST) gl.uniform4fv(prog.uniforms.uMainST.loc, st('_MainTex'));
    if (prog.uniforms.uMakeupST) gl.uniform4fv(prog.uniforms.uMakeupST.loc, st('_MAKEUP_Tex'));
    const cull = v._CullMode ?? 2;
    if (cull === 0) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(cull === 1 ? gl.FRONT : gl.BACK); }
    return unit;
  }
  render() {
    const gl = this.gl, { view, proj, width, height } = this.cameraMatrices(), { opaque, all } = this.draws();
    const t0 = performance.now();
    gl.frontFace(this.frontFace);
    // 1. Depth-rim prepass (RenderType=Opaque materials only), cleared to the far plane.
    const depth = this.depthTarget ||= (() => { const t = this.target(width, height, gl.R32F, gl.NEAREST);
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); return t; })();
    gl.bindFramebuffer(gl.FRAMEBUFFER, depth.fb); gl.viewport(0, 0, width, height);
    gl.clearColor(this.manifest.camera.far, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    const dp = this.program('depth', MESH_VS, DEPTH_FS); gl.useProgram(dp.p);
    gl.uniformMatrix4fv(dp.uniforms.uView.loc, false, view); gl.uniformMatrix4fv(dp.uniforms.uProj.loc, false, proj);
    for (const d of all) {
      // RenderWithShader(..,"RenderType"): only materials tagged Opaque. Lit copies of
      // transparent sources are re-tagged Transparent; Avatar Surface is always Opaque.
      if (d.material.shader === 'AFKRecovered/PortraitLighting' && (d.material.values._ProbeDstBlend ?? 0) !== 0) continue;
      this.bindMaterial(dp, d.material); gl.bindVertexArray(d.part.vao);
      gl.drawElements(gl.TRIANGLES, d.sub.indexCount, gl.UNSIGNED_INT, d.sub.indexOffset * 4);
    }
    // 2. Lit pass into a 4x MSAA half-float target, cleared to transparent black.
    if (!this.msaa) {
      const fb = gl.createFramebuffer(), color = gl.createRenderbuffer(), z = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, color); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA16F, width, height);
      gl.bindRenderbuffer(gl.RENDERBUFFER, z); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, z);
      this.msaa = fb; this.lit = this.target(width, height);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const programs = { lit: this.program('lit', MESH_VS, LIT_FS), surface: this.program('surface', MESH_VS, SURFACE_FS) };
    for (const d of all) {
      const kind = SHADERS[d.material.shader], lp = programs[kind]; gl.useProgram(lp.p);
      gl.uniformMatrix4fv(lp.uniforms.uView.loc, false, view); gl.uniformMatrix4fv(lp.uniforms.uProj.loc, false, proj);
      if (lp.uniforms.uResolution) gl.uniform2f(lp.uniforms.uResolution.loc, width, height);
      const v = d.material.values, unit = this.bindMaterial(lp, d.material);
      if (lp.uniforms._ProbeLinearDepth) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, depth.tex); gl.uniform1i(lp.uniforms._ProbeLinearDepth.loc, unit); }
      const src = kind === 'lit' ? (v._ProbeSrcBlend ?? 1) : (v._SrcBlend ?? 1), dst = kind === 'lit' ? (v._ProbeDstBlend ?? 0) : (v._DstBlend ?? 0);
      const srcA = kind === 'lit' ? (v._ProbeSrcBlendAlpha ?? 1) : src;
      if (src === 1 && dst === 0 && srcA === 1) gl.disable(gl.BLEND);
      else { gl.enable(gl.BLEND); gl.blendFuncSeparate(BLEND[src], BLEND[dst], BLEND[srcA], BLEND[dst]); }
      gl.depthMask((v._ZWriteMode ?? 1) > 0.5);
      gl.bindVertexArray(d.part.vao); gl.drawElements(gl.TRIANGLES, d.sub.indexCount, gl.UNSIGNED_INT, d.sub.indexOffset * 4);
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.lit.fb);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    // 3. Bloom (PortraitRecoveredLighting.Bloom).
    let w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
    const count = Math.min(16, Math.max(1, Math.floor(Math.log2(Math.max(w, h))) - 1 - PROFILE.bloomSkipIterations - PROFILE.bloomQualitySkip));
    const threshold = PROFILE.bloomThreshold <= 0.04045 ? PROFILE.bloomThreshold / 12.92 : Math.pow((PROFILE.bloomThreshold + 0.055) / 1.055, 2.4);
    const params = [0.05 + 0.9 * Math.min(1, Math.max(0, PROFILE.bloomScatter)), PROFILE.bloomClamp, threshold, threshold * 0.5];
    this.pool ||= {}; const rt = (key, ww, hh) => this.pool[key] ||= this.target(ww, hh);
    const pass = (fsKey, src, dstT, extra) => {
      const p = this.program('bloom-' + fsKey, QUAD_VS, BLOOM_FS[fsKey]); gl.useProgram(p.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstT.fb); gl.viewport(0, 0, dstT.width, dstT.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(p.uniforms._MainTex.loc, 0);
      if (p.uniforms._MainTex_TexelSize) gl.uniform4f(p.uniforms._MainTex_TexelSize.loc, 1 / src.width, 1 / src.height, src.width, src.height);
      if (p.uniforms._BloomParams) gl.uniform4fv(p.uniforms._BloomParams.loc, params);
      if (extra) extra(p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const down = [rt('d0', w, h)]; pass('prefilter', this.lit, down[0]);
    for (let i = 1; i < count; i++) {
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      const horizontal = rt('h' + i, w, h); down[i] = rt('d' + i, w, h);
      pass('horizontal', down[i - 1], horizontal); pass('vertical', horizontal, down[i]);
    }
    let low = down[count - 1];
    for (let i = count - 2; i >= 0; i--) {
      const up = rt('u' + i, down[i].width, down[i].height), lowNow = low;
      pass('upsample', down[i], up, p => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lowNow.tex); gl.uniform1i(p.uniforms._LowMip.loc, 1); });
      low = up;
    }
    // 4. Grade into an 8-bit target (Unity ReadPixels from ARGB32).
    this.graded ||= this.target(width, height, gl.RGBA8);
    const gp = this.program('grade', QUAD_VS, GRADE_FS); gl.useProgram(gp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.graded.fb); gl.viewport(0, 0, width, height);
    const bindTex = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gp.uniforms[name].loc, unit); };
    bindTex('_MainTex', this.lit.tex, 0); bindTex('_BloomTex', low.tex, 1); bindTex('_UserLut', this.lutTex, 2);
    gl.uniform4f(gp.uniforms._UserLut_TexelSize.loc, 1 / this.lut.width, 1 / this.lut.height, this.lut.width, this.lut.height);
    gl.uniform1f(gp.uniforms._Neutral.loc, PROFILE.neutral); gl.uniform1f(gp.uniforms._Contribution.loc, PROFILE.lut);
    gl.uniform1f(gp.uniforms._BloomIntensity.loc, PROFILE.bloom); gl.uniform1f(gp.uniforms._Unpremultiply.loc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    this.milliseconds = performance.now() - t0;
    return { width, height, bloomMips: count };
  }
  read(targetObj, float = false) {
    const gl = this.gl, { width, height } = targetObj; gl.bindFramebuffer(gl.FRAMEBUFFER, targetObj.fb);
    const out = float ? new Float32Array(width * height * 4) : new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, out);
    return out; // bottom-up rows
  }
}

// Same metrics as avatar_creator/compositor.js compare(): foreground MAE (0-255),
// alpha MAE and silhouette error (%), over the union foreground.
function compare(reference, actual) {
  let foreground = 0, mae = 0, alpha = 0, silhouette = 0; const difference = new Uint8ClampedArray(actual.length);
  for (let i = 0; i < actual.length; i += 4) {
    const union = reference[i + 3] > 0 || actual[i + 3] > 0;
    if (union) {
      foreground++; alpha += Math.abs(reference[i + 3] - actual[i + 3]);
      if ((reference[i + 3] >= 128) !== (actual[i + 3] >= 128)) silhouette++;
      for (let c = 0; c < 3; c++) { const d = Math.abs(reference[i + c] - actual[i + c]); mae += d; difference[i + c] = Math.min(255, d * 4); }
    }
    difference[i + 3] = 255;
  }
  return { foregroundMae: mae / Math.max(1, foreground * 3), alphaMae: alpha / Math.max(1, foreground), silhouetteError: 100 * silhouette / Math.max(1, foreground), difference };
}

window.ModelPrototype = { Renderer, compare, PROFILE };

;
/* Prototype 3D wardrobe renderer: skinned parts posed by exported bone matrices,
   rendered through the same capture path as renderer.js (load renderer.js first;
   it provides LIT_FS, SURFACE_FS, DEPTH_FS, BLOOM_FS, GRADE_FS, QUAD_VS, BLEND, PROFILE). */
'use strict';

// Web build formats (build_web.mjs): KTX2 textures (Basis Universal) and meshopt-packed, gzipped
// meshes. Decoders live in lib/ next to this script and load on first use.
const W3D_LIB = new URL('lib/', document.currentScript?.src || location.href).href;
const W3DFormats = {
  basis: null, meshopt: null,
  loadBasis() {
    return this.basis ||= new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = W3D_LIB + 'basis_transcoder.js';
      s.onload = () => BASIS({ locateFile: f => W3D_LIB + f }).then(M => { M.initializeBasis(); resolve(M); }, reject);
      s.onerror = () => reject(new Error('Could not load the texture decoder')); document.head.append(s);
    }).catch(error => { this.basis = null; throw error; });
  },
  loadMeshopt() { return this.meshopt ||= import(W3D_LIB + 'meshopt_decoder.js').then(async m => { await m.MeshoptDecoder.ready; return m.MeshoptDecoder; }); },
  // The best GPU format this browser takes; ?tex=rgba forces uncompressed upload (for comparisons).
  target(gl, M) {
    // Texture extensions must be enabled on each new WebGL context.
    if (this.targetContext === gl && this._target) return this._target;
    this.targetContext = gl;
    const F = Object.fromEntries(Object.entries(M.transcoder_texture_format).map(([k, v]) => [k, v?.value ?? v])), forced = new URLSearchParams(location.search).get('tex');
    const options = [
      ['astc', 'WEBGL_compressed_texture_astc', F.cTFASTC_4x4_RGBA, 'COMPRESSED_RGBA_ASTC_4x4_KHR'],
      ['bc7', 'EXT_texture_compression_bptc', F.cTFBC7_RGBA, 'COMPRESSED_RGBA_BPTC_UNORM_EXT'],
      ['etc2', 'WEBGL_compressed_texture_etc', F.cTFETC2_RGBA, 'COMPRESSED_RGBA8_ETC2_EAC'],
      ['bc3', 'WEBGL_compressed_texture_s3tc', F.cTFBC3_RGBA, 'COMPRESSED_RGBA_S3TC_DXT5_EXT'],
    ];
    for (const [name, ext, basisFormat, glName] of options) {
      if (forced && forced !== name) continue;
      const e = gl.getExtension(ext); if (e) return this._target = { name, basisFormat, glFormat: e[glName], compressed: true };
    }
    return this._target = { name: 'rgba8', basisFormat: F.cTFRGBA32, glFormat: gl.RGBA8, compressed: false };
  },
  // A packed mesh back to the export's exact byte layout (see build_web.mjs).
  async unpackMesh(buffer) {
    let bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'W3DM') return bytes.buffer;
    const D = await this.loadMeshopt(), v = new DataView(bytes.buffer, bytes.byteOffset), raw = new Uint8Array(v.getUint32(8, true)), count = v.getUint32(12, true);
    let at = 16 + count * 20;
    for (let i = 0; i < count; i++) {
      const o = 16 + i * 20, offset = v.getUint32(o, true), n = v.getUint32(o + 4, true), stride = v.getUint32(o + 8, true), mode = v.getUint32(o + 12, true), len = v.getUint32(o + 16, true);
      const src = bytes.subarray(at, at + len), dst = raw.subarray(offset, offset + n * stride); at += len;
      if (mode === 2) dst.set(src); else D.decodeGltfBuffer(dst, n, stride, src, mode === 1 ? 'TRIANGLES' : 'ATTRIBUTES');
    }
    return raw.buffer;
  },
};

const SKIN_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec4 aTangent;
layout(location=3) in vec2 aUv; layout(location=4) in vec2 aUv1; layout(location=5) in vec3 aFigure;
layout(location=6) in vec4 aColor; layout(location=7) in vec4 aJoints; layout(location=8) in vec4 aWeights;
layout(location=9) in vec3 aFigureNormal; layout(location=10) in vec3 aFigureTangent;
uniform sampler2D uBones; uniform mat4 uObject, uView, uProj; uniform vec4 uMainST, uMakeupST;
uniform float _AFKFigureEnabled, _StrongFactor, _FigureSeamFix;
out vec2 vUv; out vec2 vUv1; out vec2 vUvRaw; out vec3 vNormal; out vec3 vWorld; out float vEyeDepth; out vec4 vColor;
mat4 bone(float index){ int i=int(index)*4; return mat4(texelFetch(uBones,ivec2(i,0),0),texelFetch(uBones,ivec2(i+1,0),0),texelFetch(uBones,ivec2(i+2,0),0),texelFetch(uBones,ivec2(i+3,0),0)); }
// AvatarFigure.cginc, recovered CharShow _FIGURE_ON offset in the skinned object basis.
vec3 AFKFigurePosition(vec3 position, vec3 normal, vec3 tangent, vec3 offset, float seamMask){
  if(_AFKFigureEnabled<.5 || _StrongFactor==0. || dot(offset,offset)==0.) return position;
  vec3 b=cross(tangent,normal); if(dot(b,b)<1e-12) return position;
  b=normalize(b); vec3 t=normalize(cross(normal,b)); vec3 n=normalize(cross(b,t));
  float seam=mix(1.,seamMask,_FigureSeamFix);
  return position+_StrongFactor*((t*offset.x+b*offset.z)*seam+n*offset.y);
}
void main(){
  mat4 skin = bone(aJoints.x)*aWeights.x + bone(aJoints.y)*aWeights.y + bone(aJoints.z)*aWeights.z + bone(aJoints.w)*aWeights.w;
  vec3 p=(skin*vec4(aPos,1)).xyz, n=mat3(skin)*aNormal, t=mat3(skin)*aTangent.xyz;
  // Added inner surfaces have reversed lighting normals. Keep the original
  // garment's deformation basis so the rim stays joined in either body shape.
  vec3 fn=dot(aFigureNormal,aFigureNormal)>0. ? mat3(skin)*aFigureNormal : n;
  vec3 ft=dot(aFigureNormal,aFigureNormal)>0. ? mat3(skin)*aFigureTangent : t;
  p=AFKFigurePosition(p,fn,ft,aFigure,aColor.g);
  vec4 world=uObject*vec4(p,1); vec4 view=uView*world;
  gl_Position=uProj*view;
  vUv=aUv*uMainST.xy+uMainST.zw; vUv1=aUv1*uMakeupST.xy+uMakeupST.zw; vUvRaw=aUv;
  vNormal=normalize(transpose(inverse(mat3(uObject)))*n); vWorld=world.xyz; vEyeDepth=-view.z; vColor=aColor;
}`;

// AFK/Avatar Water Fabric (gamma color space path), fixed preview time.
const WATER_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vUv1; in vec2 vUvRaw; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth; in vec4 vColor;
uniform sampler2D _MainTex, _MaskTex, _Soft_MaskTex, _TileTex, _TextureSample0, _TextureSample1;
uniform vec4 _MainTex_ST, _MaskTex_ST, _Soft_MaskTex_ST, _TileTex_ST, _TextureSample0_ST, _TextureSample1_ST;
uniform vec4 _MainTex_CT, _Mask_CT, _Soft_Mask_CT, _Tile_CT, _CT;
uniform vec4 _Color, _Color0, _Color1, _Main_Color, _Main_Dark_Color, _Light_Color, _Dark_Color, _Tile_Color, _BackColor;
uniform float _TimeScale, _AFKPreviewTime, _Float6, _Float7, _Alpha_CT, _OneMinus, _MainTex_Channel_R_A;
uniform float _Light_Dark_Set, _U_V_Set, _U_V_Tilling, _SoftRange, _Offset, _Mask, _SoftMask, _Soft_Mask_Oneminus;
uniform float _Tile, _Tile_OneMinus, _Tile_Mask, _Mask_Oneminus, _Dark_Set, _Dissolve_Cus_W;
uniform float _SmoothBorder, _Alpha_Clip_Smooth, _FadeRate, _BackColor_Add, _UseVertCol;
out vec4 outColor;
float sat(float x){ return clamp(x,0.,1.); }
vec2 effectUV(vec2 uv, vec4 st, vec4 motion, float time){
  vec2 p=uv*st.xy+st.zw+motion.xy*time-0.5; float s=sin(radians(motion.z)), c=cos(radians(motion.z));
  return vec2(c*p.x+s*p.y,-s*p.x+c*p.y)+0.5;
}
vec3 LinearToGammaSpace(vec3 c){ c=max(c,vec3(0)); return max(1.055*pow(c,vec3(0.416666667))-0.055,vec3(0)); }
void main(){
  vec2 uv=vUvRaw; float time=_AFKPreviewTime*_TimeScale;
  vec4 noise=texture(_MainTex,effectUV(uv,_MainTex_ST,_MainTex_CT,time*3.));
  float main=mix(noise.r,1.-noise.r,sat(_OneMinus))*_MainTex_CT.w;
  float mask=texture(_MaskTex,effectUV(uv,_MaskTex_ST,_Mask_CT,time*3.)).r*_Mask_CT.w;
  float dissolved=mix(1.,mask,sat(_Mask))-_Dissolve_Cus_W;
  float coverage=mix(step(main,dissolved),smoothstep(0.,max(0.0001,main),dissolved),sat(_SmoothBorder));
  coverage=smoothstep(_Alpha_Clip_Smooth,1.,coverage);
  float alpha=coverage*mix(noise.a,noise.r,sat(_MainTex_Channel_R_A));
  float hem=texture(_Soft_MaskTex,effectUV(uv,_Soft_MaskTex_ST,_Soft_Mask_CT,0.)).r;
  hem=mix(hem,1.-hem,sat(_Soft_Mask_Oneminus))*_Soft_Mask_CT.w;
  alpha*=mix(1.,sat(hem),sat(_SoftMask));
  alpha*=sat(_Alpha_CT)*_FadeRate*vColor.a*_Color.a;
  float axis=fract(mix(uv.y,uv.x,sat(_U_V_Set))*_U_V_Tilling);
  float gradient=sat(axis*_SoftRange+_Offset);
  vec3 base=mix(_Main_Dark_Color.rgb,_Main_Color.rgb,sat(main));
  base=mix(base,mix(_Light_Color.rgb,_Dark_Color.rgb,gradient),sat(_Light_Dark_Set));
  float cloud=texture(_TextureSample0,uv*_TextureSample0_ST.xy+_TextureSample0_ST.zw).r*_Float6;
  float caustics=texture(_TileTex,effectUV(uv,_TileTex_ST,_Tile_CT,time*3.)+cloud).r;
  caustics=mix(caustics,1.-caustics,sat(_Tile_OneMinus))*_Tile_CT.w;
  caustics*=mix(1.,mix(axis,1.-axis,sat(_Mask_Oneminus)),sat(_Tile_Mask));
  caustics*=sat(_Tile);
  vec3 additive=base+_Tile_Color.rgb*caustics;
  vec3 multiplied=mix(base,base*_Tile_Color.rgb*caustics,caustics);
  base=mix(additive,multiplied,sat(_Dark_Set));
  float pattern=texture(_TextureSample1,effectUV(uv,_TextureSample1_ST,_CT,time)+cloud*_Float7).r;
  base+=mix(_Color0.rgb,_Color1.rgb,pattern);
  if(!gl_FrontFacing) base=mix(base*_BackColor.rgb,1.-(1.-base)*(1.-_BackColor.rgb),sat(_BackColor_Add));
  vec3 color=max(vec3(0),base)*_Color.rgb*mix(vec3(1),vColor.rgb,sat(_UseVertCol));
  outColor=vec4(LinearToGammaSpace(color),sat(alpha));
}`;

const KIND = { 'AFKRecovered/PortraitLighting': 'lit', 'AFK/Avatar Surface': 'surface', 'AFK/Avatar Water Fabric': 'water' };

// Small column-major mat4 helpers.
const mat4 = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  invert(m) {
    const o = new Float32Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return o;
  },
  trs(p, q) { // Unity TRS with unit scale; q = [x,y,z,w]
    const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return new Float32Array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0, 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0, 2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0, p[0], p[1], p[2], 1]);
  },
};
const quatYaw = deg => { const h = deg * Math.PI / 360; return [0, Math.sin(h), 0, Math.cos(h)]; };
const quatMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];

class WardrobeRenderer extends Renderer {
  constructor(canvas) { super(canvas); this.base = ''; this.parts = new Map(); this.textureCache = new Map(); this.bytes = 0; this.yaw = 0; this.zoom = 1; this.pan = [0, 0]; this.lightFollows = false; }
  async open(base) {
    this.base = base; this.manifest = await (await fetch(base + 'manifest.json')).json();
    for (const p of this.manifest.parts) this.parts.set(p.id, p);
    this.materials = Object.fromEntries(this.manifest.materials.map(m => [m.id, m]));
    const gl = this.gl, solid = rgba => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); return t; };
    this.white = solid([255, 255, 255, 255]); this.black = solid([0, 0, 0, 0]); this.gray = solid([128, 128, 128, 128]);
    const lut = await new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('LUT failed to load')); img.src = base + 'lut.png'; }); this.lut = lut;
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, lut); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.lutTex = t;
    const front = this.manifest.cameras.find(c => c.yaw === 0), back = this.manifest.cameras.find(c => c.yaw === 180);
    this.cam0 = front; this.pivot = back ? front.position.map((v, i) => (v + back.position[i]) / 2) : [front.position[0], front.position[1], 0];
    return this.manifest;
  }
  async fetchBytes(url, as = 'arrayBuffer') { const r = await fetch(this.base + url); if (!r.ok) throw new Error(r.status + ' ' + url); const b = await r[as](); this.bytes += b.size ?? b.byteLength; return b; }
  texture(name) {
    if (!name || name.startsWith('cube:')) return Promise.resolve(null);
    if (!this.textureCache.has(name)) this.textureCache.set(name, name.endsWith('.ktx2') ? this.ktx2Texture(name) : (async () => {
      const gl = this.gl, blob = await this.fetchBytes(name, 'blob');
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      // Match Unity's import: effect masks and a few atlases have no mipmaps.
      const mips = !this.noMipmaps?.has(name);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap); if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.texturePixels = (this.texturePixels || 0) + bitmap.width * bitmap.height; (this.textureSizes ||= new Map()).set(tex, bitmap.width * bitmap.height);
      const gpu = bitmap.width * bitmap.height * 4 * (mips ? 4 / 3 : 1); (this.textureBytes ||= new Map()).set(tex, gpu); this.textureGpuBytes = (this.textureGpuBytes || 0) + gpu;
      bitmap.close();
      return tex;
    })());
    const pending = this.textureCache.get(name);
    return pending.catch(error => {
      if (this.textureCache.get(name) === pending) this.textureCache.delete(name);
      throw error;
    });
  }
  // KTX2 (Basis Universal): transcoded to the GPU's own compressed format, all mip levels as encoded.
  async ktx2Texture(name) {
    const [M, data] = await Promise.all([W3DFormats.loadBasis(), this.fetchBytes(name)]);
    const gl = this.gl, target = W3DFormats.target(gl, M), file = new M.KTX2File(new Uint8Array(data));
    try {
      if (!file.isValid() || !file.startTranscoding()) throw new Error('Bad texture ' + name);
      const levels = file.getLevels(), w = file.getWidth(), h = file.getHeight(), tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex); let bytes = 0;
      for (let l = 0; l < levels; l++) {
        const info = file.getImageLevelInfo(l, 0, 0), size = file.getImageTranscodedSizeInBytes(l, 0, 0, target.basisFormat), dst = new Uint8Array(size);
        if (!file.transcodeImage(dst, l, 0, 0, target.basisFormat, 0, -1, -1)) throw new Error('Could not decode ' + name);
        if (target.compressed) gl.compressedTexImage2D(gl.TEXTURE_2D, l, target.glFormat, info.origWidth, info.origHeight, 0, dst);
        else gl.texImage2D(gl.TEXTURE_2D, l, gl.RGBA8, info.origWidth, info.origHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, dst);
        bytes += size;
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.texturePixels = (this.texturePixels || 0) + w * h; (this.textureSizes ||= new Map()).set(tex, w * h); (this.textureBytes ||= new Map()).set(tex, bytes); this.textureGpuBytes = (this.textureGpuBytes || 0) + bytes;
      this.textureFormat = target.name;
      return tex;
    } finally { file.close(); file.delete(); }
  }
  async material(id) {
    const m = this.materials[id]; if (!m) return null;
    if (!m.values) {
      const values = {};
      for (const p of m.props) values[p.name] = p.type === 'texture' ? { texture: await this.texture(p.texture), st: p.st } : p.type === 'vector' ? p.vector : p.value;
      m.values = values;
    }
    return m;
  }
  async ensurePart(id) {
    const part = this.parts.get(id); if (part.gpu) return part;
    const gl = this.gl, buffer = await this.fetchBytes(part.file), n = part.vertexCount, L = part.layout;
    const f32 = (offset, count) => new Float32Array(buffer, offset, count);
    part.basePos = f32(L.positions, n * 3); part.baseNor = f32(L.normals, n * 3);
    part.pos = new Float32Array(part.basePos); part.nor = new Float32Array(part.baseNor);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const attr = (loc, data, size, type = gl.FLOAT, dynamic = false) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, false, 0, 0); return b; };
    part.posBuffer = attr(0, part.pos, 3, gl.FLOAT, true); part.norBuffer = attr(1, part.nor, 3, gl.FLOAT, true);
    attr(2, f32(L.tangents, n * 4), 4); attr(3, f32(L.uv0, n * 2), 2);
    if (L.uv1 >= 0) attr(4, f32(L.uv1, n * 2), 2); else { gl.disableVertexAttribArray(4); gl.vertexAttrib2f(4, 0, 0); }
    if (L.figure >= 0) attr(5, f32(L.figure, n * 3), 3); else { gl.disableVertexAttribArray(5); gl.vertexAttrib3f(5, 0, 0, 0); }
    if (L.color >= 0) attr(6, f32(L.color, n * 4), 4); else { gl.disableVertexAttribArray(6); gl.vertexAttrib4f(6, 1, 1, 1, 1); }
    attr(7, new Uint16Array(buffer, L.joints, n * 4), 4, gl.UNSIGNED_SHORT); attr(8, f32(L.weights, n * 4), 4);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(buffer, L.indices, L.indexCount), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    part.shapeData = part.shapes.map(s => ({ name: s.name, index: new Uint32Array(buffer, s.offset, s.count), delta: new Float32Array(buffer, s.offset + s.count * 4, s.count * 6) }));
    part.boneTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, part.boneTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, part.boneCount * 4, 1);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const s of part.submeshes) s.mat = await this.material(s.material);
    part.gpu = { vao };
    return part;
  }
  applyPose(part, poseName) {
    const gl = this.gl, state = part.poses.find(p => p.pose === poseName) || part.poses[0];
    part.state = state;
    if (part.appliedPose === poseName) return;
    const object = new Float32Array(state.objectToWorld), inv = mat4.invert(object), skin = new Float32Array(part.boneCount * 16);
    for (let b = 0; b < part.boneCount; b++) {
      const boneM = state.bones.slice(b * 16, b * 16 + 16), bind = part.bindposes.slice(b * 16, b * 16 + 16);
      skin.set(part.skinned ? mat4.mul(inv, mat4.mul(boneM, bind)) : mat4.mul(inv, boneM), b * 16);
    }
    gl.bindTexture(gl.TEXTURE_2D, part.boneTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, part.boneCount * 4, 1, gl.RGBA, gl.FLOAT, skin);
    part.object = object;
    // Blend shapes (Unity weights 0-100 on a single full-weight frame), before skinning.
    part.pos.set(part.basePos); part.nor.set(part.baseNor);
    (state.shapeWeights || []).forEach((w, s) => {
      if (!w) return; const k = w / 100, d = part.shapeData[s];
      for (let j = 0; j < d.index.length; j++) { const v = d.index[j] * 3, o = j * 6;
        part.pos[v] += d.delta[o] * k; part.pos[v + 1] += d.delta[o + 1] * k; part.pos[v + 2] += d.delta[o + 2] * k;
        part.nor[v] += d.delta[o + 3] * k; part.nor[v + 1] += d.delta[o + 4] * k; part.nor[v + 2] += d.delta[o + 5] * k; }
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, part.posBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, part.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, part.norBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, part.nor);
    // Approximate world center for transparent sorting.
    let c = [0, 0, 0]; const n = part.vertexCount, step = Math.max(1, Math.floor(n / 64)); let m = 0;
    const s0 = skin.slice(0, 16);
    for (let i = 0; i < n; i += step, m++) for (let a = 0; a < 3; a++) c[a] += part.pos[i * 3 + a];
    c = c.map(v => v / m); const w = mat4.mul(object, s0);
    part.center = [0, 1, 2].map(r => w[r] * c[0] + w[4 + r] * c[1] + w[8 + r] * c[2] + w[12 + r]);
    part.appliedPose = poseName;
  }
  async setSelection(partIds, poseName) {
    const parts = []; for (const id of partIds) parts.push(await this.ensurePart(id));
    for (const p of parts) this.applyPose(p, poseName);
    this.active = parts.filter(p => p.state.visible); this.pose = poseName;
  }
  camera(viewport) {
    const c = this.cam0, exact = this.manifest.cameras.find(k => Math.abs(k.yaw - this.yaw) < 1e-6);
    let view;
    if (exact) view = new Float32Array(exact.worldToCamera);
    else {
      const q = quatYaw(this.yaw), rel = c.position.map((v, i) => v - this.pivot[i]);
      const r = mat4.trs([0, 0, 0], q), p = [0, 1, 2].map(i => this.pivot[i] + r[i] * rel[0] + r[4 + i] * rel[1] + r[8 + i] * rel[2]);
      const world = mat4.trs(p, quatMul(q, c.rotation)), flip = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
      view = mat4.mul(flip, mat4.invert(world));
    }
    const aspect = viewport ? viewport.width / viewport.height : c.aspect;
    const size = c.size / this.zoom * Math.max(1, c.aspect / aspect), rr = size * aspect, n = c.near, f = c.far;
    // Pan: the camera slides in its own plane (view-space units), i.e. an offset of the ortho window.
    const [px, py] = this.pan || [0, 0];
    const proj = new Float32Array([1 / rr, 0, 0, 0, 0, 1 / size, 0, 0, 0, 0, -2 / (f - n), 0, -px / rr, -py / size, -(f + n) / (f - n), 1]);
    const scale = matchMedia('(pointer:coarse)').matches ? 0.625 : 1;
    return { view, proj, width: viewport?.width ?? Math.round(c.width * scale), height: viewport?.height ?? Math.round(c.height * scale), far: f };
  }
  draws(view) {
    const list = [];
    for (const part of this.active) part.submeshes.forEach((sub, index) => {
      if (!sub.mat || !KIND[sub.mat.shader]) return;
      const p = part.center, distance = -(view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14]);
      list.push({ part, sub, index, material: sub.mat, kind: KIND[sub.mat.shader], distance });
    });
    const opaque = list.filter(d => d.material.queue <= 2500).sort((a, b) => a.material.queue - b.material.queue || a.distance - b.distance);
    const transparent = list.filter(d => d.material.queue > 2500).sort((a, b) => a.material.queue - b.material.queue || b.distance - a.distance);
    return [...opaque, ...transparent];
  }
  unsupported() { const s = new Set(); for (const p of this.active || []) for (const sub of p.submeshes) if (sub.mat && !KIND[sub.mat.shader]) s.add(sub.mat.name + ' / ' + sub.mat.shader); return [...s]; }
  bindDraw(prog, d, camera) {
    const gl = this.gl, v = d.material.values; let unit = 0;
    for (const [name, u] of Object.entries(prog.uniforms)) {
      if (u.type === gl.SAMPLER_2D) {
        if (name === '_ProbeLinearDepth' || name === 'uBones') continue;
        const value = v[name]; gl.activeTexture(gl.TEXTURE0 + unit);
        const fallback = { white: this.white, gray: this.gray, black: this.black }[this.textureDefault(d.kind, name)];
        gl.bindTexture(gl.TEXTURE_2D, value?.texture || fallback); gl.uniform1i(u.loc, unit++);
      } else if (u.type === gl.FLOAT && name in v && typeof v[name] === 'number') gl.uniform1f(u.loc, v[name]);
      else if (u.type === gl.FLOAT_VEC4) {
        if (Array.isArray(v[name])) gl.uniform4fv(u.loc, v[name]);
        else if (name.endsWith('_ST') && v[name.slice(0, -3)]?.st) gl.uniform4fv(u.loc, v[name.slice(0, -3)].st);
      }
    }
    const st = name => v[name]?.st || [1, 1, 0, 0];
    gl.uniform4fv(prog.uniforms.uMainST.loc, st('_MainTex'));
    if (prog.uniforms.uMakeupST) gl.uniform4fv(prog.uniforms.uMakeupST.loc, st('_MAKEUP_Tex'));
    // Per-pose property-block overrides (renderer-wide = -1, or this submesh).
    for (const o of d.part.state.overrides || []) {
      if (o.submesh !== -1 && o.submesh !== d.index) continue;
      if (o.name === '_MainTex_ST') { gl.uniform4fv(prog.uniforms.uMainST.loc, o.vector); continue; }
      const u = prog.uniforms[o.name]; if (!u) continue;
      if (o.isVector) gl.uniform4fv(u.loc, o.vector); else gl.uniform1f(u.loc, o.value);
    }
    if (this.lightFollows && prog.uniforms._ProbeLightDirection) {
      const L = v._ProbeLightDirection || [0, 0, 1, 0], q = quatYaw(this.yaw), r = mat4.trs([0, 0, 0], q);
      gl.uniform4f(prog.uniforms._ProbeLightDirection.loc, r[0] * L[0] + r[8] * L[2], L[1], r[2] * L[0] + r[10] * L[2], 0);
    }
    gl.uniformMatrix4fv(prog.uniforms.uObject.loc, false, d.part.object);
    gl.uniformMatrix4fv(prog.uniforms.uView.loc, false, camera.view); gl.uniformMatrix4fv(prog.uniforms.uProj.loc, false, camera.proj);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, d.part.boneTex); gl.uniform1i(prog.uniforms.uBones.loc, unit++);
    const cull = this.passState(d).cull;
    if (cull === 0) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(cull === 1 ? gl.FRONT : gl.BACK); }
    if (prog.uniforms.uCameraPos) { const inv = mat4.invert(camera.view); gl.uniform3f(prog.uniforms.uCameraPos.loc, inv[12], inv[13], inv[14]); }
    return unit;
  }
  // Per shader kind: program, Unity Blend/ZWrite/Cull state. Unity BlendMode numbers.
  passState(d) {
    const v = d.material.values, fix = fs => fs.replace('in vec2 vUv; in vec2 vUv1;', 'in vec2 vUv; in vec2 vUv1; in vec2 vUvRaw; in vec4 vColor;');
    if (d.kind === 'water') return { program: this.program('skin-water', SKIN_VS, WATER_FS), blend: [5, 10, 1, 10], depthWrite: false, cull: 0 };
    if (d.kind === 'surface') { const src = v._SrcBlend ?? 1, dst = v._DstBlend ?? 0;
      return { program: this.program('skin-surface', SKIN_VS, fix(SURFACE_FS)), blend: [src, dst, src, dst], depthWrite: (v._ZWriteMode ?? 1) > .5, cull: v._CullMode ?? 2 }; }
    const dst = v._ProbeDstBlend ?? 0;
    return { program: this.program('skin-lit', SKIN_VS, fix(LIT_FS)), blend: [v._ProbeSrcBlend ?? 1, dst, v._ProbeSrcBlendAlpha ?? 1, dst], depthWrite: (v._ZWriteMode ?? 1) > .5, cull: v._CullMode ?? 2 };
  }
  textureDefault(kind, name) { return name === '_MainTex' || name === '_MaskTex' || name === '_Soft_MaskTex' ? 'white' : name === '_TextureSample0' ? 'gray' : 'black'; }
  render(premultiplied = false, viewport) {
    const gl = this.gl, camera = this.camera(viewport), { width, height } = camera, list = this.draws(camera.view), t0 = performance.now();
    if (this.depthTarget && (this.depthTarget.width !== width || this.depthTarget.height !== height)) {
      const targets = [this.depthTarget, this.lit, this.graded, ...Object.values(this.pool || {})];
      for (const target of targets.filter(Boolean)) {
        gl.deleteTexture(target.tex);
        gl.deleteFramebuffer(target.fb);
      }
      for (const buffer of this.renderbuffers || []) gl.deleteRenderbuffer(buffer);
      gl.deleteFramebuffer(this.msaa);
      this.depthTarget = this.lit = this.graded = this.msaa = this.pool = null;
    }
    gl.frontFace(this.frontFace);
    const depth = this.depthTarget ||= (() => { const t = this.target(width, height, gl.R32F, gl.NEAREST);
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      this.renderbuffers = [rb];
      return t;
    })();
    gl.bindFramebuffer(gl.FRAMEBUFFER, depth.fb); gl.viewport(0, 0, width, height);
    gl.clearColor(camera.far, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    const dp = this.program('skin-depth', SKIN_VS, DEPTH_FS.replace('in vec2 vUv; in vec2 vUv1;', 'in vec2 vUv; in vec2 vUv1; in vec2 vUvRaw; in vec4 vColor;')); gl.useProgram(dp.p);
    for (const d of list) {
      if (d.material.renderType !== 'Opaque') continue; // RenderWithShader(.., "RenderType")
      this.bindDraw(dp, d, camera); gl.bindVertexArray(d.part.gpu.vao); gl.drawElements(gl.TRIANGLES, d.sub.indexCount, gl.UNSIGNED_INT, d.sub.indexOffset * 4);
    }
    if (!this.msaa) {
      const supported = format => [...gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES)];
      const depthSamples = supported(gl.DEPTH_COMPONENT24);
      const samples = supported(gl.RGBA16F).find(n => n <= 4 && depthSamples.includes(n)) || 0;
      const fb = gl.createFramebuffer(), color = gl.createRenderbuffer(), z = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, color); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, width, height);
      gl.bindRenderbuffer(gl.RENDERBUFFER, z); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, z); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Unsupported render target.');
      this.msaa = fb; this.renderbuffers.push(color, z); this.lit = this.target(width, height);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const d of list) {
      const state = this.passState(d), prog = state.program, v = d.material.values; gl.useProgram(prog.p);
      if (prog.uniforms.uResolution) gl.uniform2f(prog.uniforms.uResolution.loc, width, height);
      const unit = this.bindDraw(prog, d, camera);
      if (prog.uniforms._ProbeLinearDepth) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, depth.tex); gl.uniform1i(prog.uniforms._ProbeLinearDepth.loc, unit); }
      const [src, dst, srcA, dstA] = state.blend;
      if (src === 1 && dst === 0 && srcA === 1 && dstA === 0) gl.disable(gl.BLEND); else { gl.enable(gl.BLEND); gl.blendFuncSeparate(BLEND[src], BLEND[dst], BLEND[srcA], BLEND[dstA]); }
      gl.depthMask(state.depthWrite); gl.depthFunc(state.depthFunc ?? gl.LEQUAL);
      // A blended layer drawn over a copy of the same surface (sheer stockings over the leg, 869) sits at
      // the same depth: pull it a hair forward so rounding never lets the surface underneath win.
      if (this.layerOffset !== false && gl.isEnabled(gl.BLEND)) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4); } else gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindVertexArray(d.part.gpu.vao); gl.drawElements(gl.TRIANGLES, d.sub.indexCount, gl.UNSIGNED_INT, d.sub.indexOffset * 4);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.lit.fb);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    this.post(width, height, premultiplied);
    gl.finish(); this.milliseconds = performance.now() - t0;
    // Present: copy the graded 8-bit image to the canvas.
    if (gl.canvas.width !== width) gl.canvas.width = width;
    if (gl.canvas.height !== height) gl.canvas.height = height;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.graded.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    return { width, height, draws: list.length };
  }
  post(width, height, premultiplied) {
    const gl = this.gl; let w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
    const count = Math.min(16, Math.max(1, Math.floor(Math.log2(Math.max(w, h))) - 1 - PROFILE.bloomSkipIterations - PROFILE.bloomQualitySkip));
    const params = [0.05 + 0.9 * PROFILE.bloomScatter, PROFILE.bloomClamp, 1, 0.5];
    this.pool ||= {}; const rt = (key, ww, hh) => this.pool[key] ||= this.target(ww, hh);
    const pass = (key, src, dst, extra) => { const p = this.program('bloom-' + key, QUAD_VS, BLOOM_FS[key]); gl.useProgram(p.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.width, dst.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(p.uniforms._MainTex.loc, 0);
      if (p.uniforms._MainTex_TexelSize) gl.uniform4f(p.uniforms._MainTex_TexelSize.loc, 1 / src.width, 1 / src.height, src.width, src.height);
      if (p.uniforms._BloomParams) gl.uniform4fv(p.uniforms._BloomParams.loc, params); if (extra) extra(p); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    const down = [rt('d0', w, h)]; pass('prefilter', this.lit, down[0]);
    for (let i = 1; i < count; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); const hz = rt('h' + i, w, h); down[i] = rt('d' + i, w, h); pass('horizontal', down[i - 1], hz); pass('vertical', hz, down[i]); }
    let low = down[count - 1];
    for (let i = count - 2; i >= 0; i--) { const up = rt('u' + i, down[i].width, down[i].height), l = low;
      pass('upsample', down[i], up, p => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, l.tex); gl.uniform1i(p.uniforms._LowMip.loc, 1); }); low = up; }
    this.graded ||= this.target(width, height, gl.RGBA8);
    const gp = this.program('grade', QUAD_VS, GRADE_FS); gl.useProgram(gp.p); gl.bindFramebuffer(gl.FRAMEBUFFER, this.graded.fb); gl.viewport(0, 0, width, height);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gp.uniforms[name].loc, unit); };
    bind('_MainTex', this.lit.tex, 0); bind('_BloomTex', low.tex, 1); bind('_UserLut', this.lutTex, 2);
    gl.uniform4f(gp.uniforms._UserLut_TexelSize.loc, 1 / this.lut.width, 1 / this.lut.height, this.lut.width, this.lut.height);
    gl.uniform1f(gp.uniforms._Neutral.loc, PROFILE.neutral); gl.uniform1f(gp.uniforms._Contribution.loc, PROFILE.lut);
    gl.uniform1f(gp.uniforms._BloomIntensity.loc, PROFILE.bloom); gl.uniform1f(gp.uniforms._Unpremultiply.loc, premultiplied ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  pixels() { return this.read(this.graded); }
}
window.WardrobeRenderer = WardrobeRenderer;

;
/* Effect shader ports for the 3D wardrobe (load after wardrobe-renderer.js).
   AFK/Avatar Layered Effect, AFKRecovered/EffectFXStyle, EffectGalaxy and EffectLiquid are
   line-for-line ports of the worker project's shaders (gamma color space paths, fixed
   capture effect time). "Standard" (one glass outfit part) is an approximation: Unity's
   Standard shader lit by RenderPose's three directional lights and the default ambient. */
'use strict';

const GAMMA_HELPERS = `
vec3 GammaToLinearSpace(vec3 c){ return c*(c*(c*0.305306011+0.682171111)+0.012522878); }
vec3 LinearToGammaSpace(vec3 c){ return max(1.055*pow(max(c,vec3(0)),vec3(0.416666667))-0.055,vec3(0)); }
float sat(float x){ return clamp(x,0.,1.); }`;
const FX_VARYINGS = 'in vec2 vUv; in vec2 vUv1; in vec2 vUvRaw; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth; in vec4 vColor;';

const LAYERED_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform sampler2D _MainTex, _BlendTex, _MaskTex, _Soft_MaskTex, _TileTex, _AFKVertexMask;
uniform vec4 _MainTex_ST, _BlendTex_ST, _MaskTex_ST, _Soft_MaskTex_ST, _TileTex_ST, _AFKVertexMask_ST;
uniform vec4 _MainTex_CT, _BlendTex_CT, _Mask_CT, _MaskTex_CT, _Tile_CT, _Soft_Mask_CT, _PolarUV_Center_Main;
uniform vec4 _Main_Color, _Main_Dark_Color, _Light_Color, _Dark_Color, _Tile_Color, _Color;
uniform vec4 _MainTex_Color, _BlendTex_Color, _MainTex_Color_W, _White_Color, _Black_Color;
uniform float _AFKFxKind, _AFKPreviewTime, _TimeScale, _AlphaCT, _Alpha_CT, _Mask, _SoftMask, _Tile, _Blend;
uniform float _Light_Dark_Set, _RGB_Set, _MainTex_Channel_R_A, _OneMinus, _Soft_Mask_Oneminus, _Tile_OneMinus, _UseVertCol, _FadeRate;
uniform float _PolarUV_Main, _PolarUV_Tile, _PolarUV_Mask;
out vec4 outColor;
vec2 effectUV(vec2 uv, vec4 st, vec4 motion, float polar, float time){
  vec2 delta=uv-_PolarUV_Center_Main.xy;
  uv=mix(uv,vec2(atan(delta.y,delta.x)/6.2831853+0.5,length(delta)*2.),sat(polar));
  vec2 p=uv*st.xy+st.zw+motion.xy*time-0.5; float s=sin(radians(motion.z)), c=cos(radians(motion.z));
  return vec2(c*p.x+s*p.y,-s*p.x+c*p.y)+0.5;
}
void main(){
  vec2 uv=vUvRaw; float time=(_AFKPreviewTime>=0.?_AFKPreviewTime:1.35)*_TimeScale;
  vec4 tex=texture(_MainTex,effectUV(uv,_MainTex_ST,_MainTex_CT,_PolarUV_Main,time));
  float main=mix(tex.r,1.-tex.r,sat(_OneMinus)); float alpha=tex.a*main; vec3 color=tex.rgb;
  if(_AFKFxKind<0.5) color=mix(_Black_Color.rgb,_White_Color.rgb,main)*_MainTex_Color_W.rgb;
  else if(_AFKFxKind<1.5){
    vec4 blend=texture(_BlendTex,effectUV(uv,_BlendTex_ST,_BlendTex_CT,0.,time));
    color=tex.rgb*_MainTex_Color.rgb*mix(vec3(1),blend.rgb*_BlendTex_Color.rgb,sat(_Blend));
    alpha*=mix(1.,blend.r*blend.a,sat(_Blend))*_AlphaCT;
  } else if(_AFKFxKind<2.5){
    alpha=mix(tex.a,tex.r,sat(_MainTex_Channel_R_A));
    color=mix(_Main_Dark_Color.rgb,_Main_Color.rgb,main);
    color=mix(color,mix(_Dark_Color.rgb,_Light_Color.rgb,main),sat(_Light_Dark_Set));
    color=mix(color,tex.rgb,sat(_RGB_Set));
    float tile=texture(_TileTex,effectUV(uv,_TileTex_ST,_Tile_CT,_PolarUV_Tile,time)).r;
    tile=mix(tile,1.-tile,sat(_Tile_OneMinus))*sat(_Tile);
    color+=_Tile_Color.rgb*tile; alpha=sat(alpha+tile)*_Alpha_CT;
  } else {
    alpha=tex.a*texture(_AFKVertexMask,uv*_AFKVertexMask_ST.xy+_AFKVertexMask_ST.zw).r;
  }
  if(_AFKFxKind<2.5){
    vec4 motion=_AFKFxKind<1.5?_MaskTex_CT:_Mask_CT;
    float mask=texture(_MaskTex,effectUV(uv,_MaskTex_ST,motion,_PolarUV_Mask,time)).r;
    float soft=texture(_Soft_MaskTex,effectUV(uv,_Soft_MaskTex_ST,_Soft_Mask_CT,0.,time)).r;
    soft=mix(soft,1.-soft,sat(_Soft_Mask_Oneminus));
    alpha*=mix(1.,mask,sat(_Mask))*mix(1.,soft,sat(_SoftMask));
  }
  color*=_Color.rgb*mix(vec3(1),vColor.rgb,sat(_UseVertCol));
  outColor=vec4(max(vec3(0),color),sat(alpha*_Color.a*vColor.a*_FadeRate));
}`;

// FXStyle vertex program: normal push, noise displacement (world or view space), flipbook frame.
const FX_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec4 aTangent;
layout(location=3) in vec2 aUv; layout(location=4) in vec2 aUv1; layout(location=5) in vec3 aFigure;
layout(location=6) in vec4 aColor; layout(location=7) in vec4 aJoints; layout(location=8) in vec4 aWeights;
uniform sampler2D uBones, _NoiseTex; uniform mat4 uObject, uView, uProj; uniform vec4 uMainST, uMakeupST;
uniform float _Vertex_Intensity, _NoiseMoveRate, _vertOffset, _Is_VS, _PortraitEffectTime, _UseVertCol;
uniform float _Flipbook, _FlipFrequency, _FlipRow, _FlipCol, _FlipX, _FlipY; uniform vec4 _NoiseTiling;
out vec2 vUv; out vec2 vUv1; out vec2 vUvRaw; out vec3 vNormal; out vec3 vWorld; out float vEyeDepth; out vec4 vColor;
mat4 bone(float index){ int i=int(index)*4; return mat4(texelFetch(uBones,ivec2(i,0),0),texelFetch(uBones,ivec2(i+1,0),0),texelFetch(uBones,ivec2(i+2,0),0),texelFetch(uBones,ivec2(i+3,0),0)); }
void main(){
  mat4 skin = bone(aJoints.x)*aWeights.x + bone(aJoints.y)*aWeights.y + bone(aJoints.z)*aWeights.z + bone(aJoints.w)*aWeights.w;
  vec3 n=mat3(skin)*aNormal, p=(skin*vec4(aPos,1)).xyz + n*_Vertex_Intensity*.01;
  vec3 world=(uObject*vec4(p,1)).xyz, normal=normalize(transpose(inverse(mat3(uObject)))*n);
  float nz=textureLod(_NoiseTex,aUv,0.).r;
  vec3 moved=world+normal*sin(dot(world,_NoiseTiling.xyz)+3.*_PortraitEffectTime*_NoiseTiling.w)*_NoiseMoveRate*nz;
  vec3 view=(uView*vec4(world,1)).xyz;
  view.xy+=sin(view.yx*_NoiseTiling.yx+3.*_PortraitEffectTime*_NoiseTiling.wz)*_NoiseMoveRate*nz;
  moved=mix(moved,(inverse(uView)*vec4(view,1)).xyz,_Is_VS);
  world=mix(world,moved,_vertOffset);
  vec4 v=uView*vec4(world,1); gl_Position=uProj*v;
  vec2 uv=aUv;
  if(_Flipbook==1.){
    vec2 grid=max(vec2(_FlipRow,_FlipCol),vec2(1)); float frame=floor(fract(_PortraitEffectTime*_FlipFrequency)*grid.x*grid.y);
    float row=floor(frame/grid.x); vec2 tile=vec2(frame-row*grid.x,row);
    tile=abs(vec2(_FlipX,_FlipY)*grid-(tile+vec2(_FlipX,_FlipY))); uv=(aUv+tile)/grid;
  }
  vUv=uv*uMainST.xy+uMainST.zw; vUv1=aUv1; vUvRaw=uv; vNormal=normal; vWorld=world; vEyeDepth=-v.z;
  vColor=mix(vec4(1),aColor,_UseVertCol);
}`;

const FXSTYLE_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uObject; uniform vec3 uCameraPos;
uniform sampler2D _MainTex, _NoiseTex, _TileTex, _MaskTex, _Soft_MaskTex;
uniform vec4 _MainTex_ST, _NoiseTex_ST, _TileTex_ST, _MaskTex_ST, _Soft_MaskTex_ST;
uniform float _ShaderMode, _TimeScale, _BackColor_Add, _LightColor_Set, _Trail_Dissolve, _Dissolve_Cus_W, _Alpha_CT;
uniform vec4 _Color, _BackColor, _Main_Color, _Main_Dark_Color, _Light_Color, _Dark_Color, _Tile_Color, _Edge_Color, _Fresnel_Color;
uniform float _Light_Dark_Set, _U_V_Set, _U_V_Tilling, _SoftRange, _Offset, _Mul_R_Set, _Min, _RGB_Set, _MainTex_Channel_R_A, _OneMinus;
uniform vec4 _MainTex_CT, _Noise_CT, _Tile_CT, _Mask_CT, _Soft_Mask_CT, _PolarUV_Center_Main, _PortraitZoneLight;
uniform float _MainTex_Panner_Once, _RandomOffset, _PolarUV_Main, _Noise_FromCenter, _Dark_Set, _PolarUV_Tile, _Tile_OneMinus, _Tile_Mask, _Mask_Oneminus;
uniform float _TileTex_Panner_Once, _PolarUV_Mask, _Mask_Type, _Mask_Fresenl, _MaskTiling_T, _Edge_Width, _Multiplt_Color;
uniform float _Fresnel, _Fresnel_Oneminus, _Fresnel_Intensity, _Fresnel_Alpha, _FresnelAlphaType, _Fresnel_Alpha_Intensity, _Fresnel_Alpha_Inverse, _Fresnel_Alpha_MaskInverse;
uniform float _SoftMask, _PolarUV_Soft_Mask, _Soft_Mask_Oneminus, _SmoothBorder, _Alpha_Clip_Smooth, _Edge_Smooth, _AlphaTest, _AUTO_UV, _FadeRate;
uniform float _PortraitEffectTime, _PortraitMask, _PortraitTile, _PortraitNoise;
out vec4 outColor;
vec2 RotateUV(vec2 uv,float degrees){ float s=sin(degrees*.01745329252), c=cos(degrees*.01745329252); uv-=.5; return vec2(c*uv.x+s*uv.y,-s*uv.x+c*uv.y)+.5; }
float S(float low,float high,float v){ float x=sat((v-low)/max(high-low,.000001)); return x*x*(3.-2.*x); }
float FresnelAlpha(vec3 N,vec3 V){
  if(_Fresnel_Alpha<=0.) return 1.;
  vec3 n=N*_Fresnel_Alpha_Inverse;
  float d=mix(sat(dot(V,n)),sat(dot(V.xz,n.xz)),_FresnelAlphaType);
  d=mix(d,1.-d,_Fresnel_Alpha_MaskInverse);
  return mix(1.,min(pow(max(d,.000001),_Fresnel_Alpha_Intensity),1.),_Fresnel_Alpha);
}
vec2 BaseUV(vec2 uv,vec4 st,float polar){ if(polar>.5){ vec2 d=uv-_PolarUV_Center_Main.xy; uv=vec2(length(d),atan(d.x,d.y)*.159236); } return uv*st.xy+st.zw; }
vec2 StyleUV(vec2 uv,vec4 st,vec4 ct,float once,float custom,float polar){ return RotateUV(BaseUV(uv,st,polar)+mix(3.*_PortraitEffectTime*_TimeScale,custom,once)*ct.xy,ct.z); }
void main(){
  vec4 iuv=vec4(vUvRaw,0,0);
  vec2 uv=iuv.xy; uv.x*=mix(1.,abs(uObject[0][0]),_AUTO_UV);
  vec2 mainBase=BaseUV(uv,_MainTex_ST,_PolarUV_Main);
  if(_PortraitNoise>.5 && _PolarUV_Main<=.5){
    vec2 nu=uv*_NoiseTex_ST.xy+_NoiseTex_ST.zw+3.*_PortraitEffectTime*_TimeScale*_Noise_CT.xy;
    mainBase+=texture(_NoiseTex,nu).r*_Noise_CT.w*(1.+_Noise_FromCenter*(mainBase-1.5));
  }
  vec2 mu=RotateUV(mainBase+mix(3.*_PortraitEffectTime*_TimeScale,iuv.w,_MainTex_Panner_Once)*_MainTex_CT.xy,_MainTex_CT.z);
  mu=RotateUV(RotateUV(mu,-_MainTex_CT.z)+_RandomOffset*.5*(uObject[3][0]+uObject[3][2]),_MainTex_CT.z);
  vec4 main=texture(_MainTex,mu);
  float noise=mix(main.r,1.-main.r,_OneMinus)*_MainTex_CT.w;
  vec3 rgb=mix(_Main_Dark_Color.rgb,_Main_Color.rgb,noise);
  float axis=fract(mix(uv.y,uv.x,_U_V_Set)*_U_V_Tilling);
  float gradient=axis*_SoftRange+_Offset;
  float g=S(_Min,1.,S(0.,1.,gradient/max(1.-main.r,.000001)));
  gradient=sat(mix(gradient,g,_Mul_R_Set));
  rgb=mix(rgb,mix(_Dark_Color.rgb,_Light_Color.rgb,gradient),_Light_Dark_Set);
  rgb=mix(rgb,main.rgb,_RGB_Set);
  vec3 edge=mix(_Edge_Color.rgb,_Edge_Color.rgb*rgb*vColor.rgb,_Multiplt_Color);
  vec2 maskuv=StyleUV(uv,_MaskTex_ST,_Mask_CT,_MaskTiling_T,iuv.w,_PolarUV_Mask);
  float dissolve=mix(_Dissolve_Cus_W,mix(iuv.z,1.-vColor.a,_Trail_Dissolve),_ShaderMode);
  float mask=texture(_MaskTex,maskuv).r*_Mask_CT.w-dissolve;
  float den=max(noise,.000001);
  float border=mix(step(noise,mask-_Edge_Width),S(_Edge_Smooth,1.,S(0.,1.,(mask-_Edge_Width)/den)),_SmoothBorder);
  rgb=mix(edge,rgb*vColor.rgb,border);
  if(_PortraitTile>.5){
    vec2 tu=StyleUV(uv,_TileTex_ST,_Tile_CT,_TileTex_Panner_Once,iuv.w,_PolarUV_Tile);
    float tr=texture(_TileTex,tu).r;
    tr=mix(tr,1.-tr,_Tile_OneMinus)*border*_Tile_CT.w;
    tr*=mix(1.,mix(axis,1.-axis,_Mask_Oneminus),_Tile_Mask);
    rgb=mix(rgb+_Tile_Color.rgb*tr,mix(rgb,_Tile_Color.rgb*tr,tr),_Dark_Set);
  }
  if(!gl_FrontFacing) rgb=rgb*_BackColor.rgb+_BackColor_Add*(rgb+_BackColor.rgb-rgb*_BackColor.rgb);
  rgb*=vColor.rgb;
  vec3 N=vNormal*inversesqrt(max(dot(vNormal,vNormal),.000001)), V=normalize(uCameraPos-vWorld);
  float f=min(pow(max(1.-dot(V,N),.000001),_Fresnel_Intensity),1.);
  f=mix(f,1.-f,_Fresnel_Oneminus)*_Fresnel;
  rgb=mix(rgb,_Fresnel_Color.rgb,f)*mix(vec3(1),_PortraitZoneLight.rgb,_LightColor_Set);
  float alpha=mix(main.a,main.r,_MainTex_Channel_R_A);
  if(_PortraitMask>.5){ float ab=mix(step(noise,mask),S(_Alpha_Clip_Smooth,1.,S(0.,1.,mask/den)),_SmoothBorder); alpha=ab*mix(alpha,1.,_Mask_Type); }
  alpha*=mix(vColor.a,1.,_Trail_Dissolve)*mix(1.,f,_Mask_Fresenl);
  vec2 su=StyleUV(uv,_Soft_MaskTex_ST,_Soft_Mask_CT,0.,0.,_PolarUV_Soft_Mask);
  float soft=texture(_Soft_MaskTex,su).r;
  soft=mix(soft,1.-soft,_Soft_Mask_Oneminus)*_Soft_Mask_CT.w;
  alpha=sat(alpha*mix(1.,soft,_SoftMask))*_Alpha_CT*FresnelAlpha(N,V);
  if(alpha-.5*_AlphaTest<0.) discard;
  alpha*=_FadeRate*_Color.a; rgb=max(rgb,vec3(0))*_Color.rgb;
  outColor=vec4(ToSrgb(max(rgb,vec3(0))),sat(alpha));
}`;

const GALAXY_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uView;
uniform sampler2D _MainTex, _Mask, _StarTex, _StarMaskTex, _LineTex, _FlowLightTex, _LineFlowTex, _GalaxyTex, _Fresnel_Mask;
uniform vec4 _Color, _StarColor, _StarParam, _StarColor_2, _StarParam_2, _LineTint, _LineStaticColor, _FlowColor, _FlowParam, _SpecularColor;
uniform vec4 _LineFlowParam, _GalaxyColor, _GalaxyParam, _Fresnel_Color, _Fresnel_Param;
uniform float _StarUVType, _StarMaskScale, _StarMaskSpeedX, _StarMaskSpeedY, _starSmooth, _StarTwinklePower, _StarTwinkleType, _StarBlendPower;
uniform float _FlowPow, _FlowSpeed, _LineIntensity, _LineRange, _LineFlowIntensity, _PortraitEffectTime, _PortraitGalaxy, _PortraitFlow, _PortraitFresnel;
out vec4 outColor;
float Twinkle(float a,float mask){ return mix(smoothstep(0.,max(_starSmooth,.00001),a-mask),smoothstep(.2,.2+max(_starSmooth,.00001),a)*mask,_StarTwinkleType); }
void main(){
  float t=_PortraitEffectTime; vec2 uv=vUvRaw;
  vec3 N=normalize(vNormal), V=vec3(uView[0][2],uView[1][2],uView[2][2]);
  vec4 mask=texture(_Mask,uv);
  vec3 color=GammaToLinearSpace(texture(_MainTex,uv).rgb)*_Color.rgb;
  if(_PortraitGalaxy>.5) color=mix(color,GammaToLinearSpace(texture(_GalaxyTex,vWorld.xy*_GalaxyParam.xy+t*_GalaxyParam.zw).rgb)*_GalaxyColor.rgb,mask.a*_GalaxyColor.a);
  vec2 uv1=mix(vWorld.xy,uv,_StarUVType), uv2=mix(vWorld.zy,uv,_StarUVType);
  vec3 weights=max(pow(abs(N),vec3(_StarBlendPower)),vec3(.0001)); weights/=weights.x+weights.y+weights.z;
  vec4 a=texture(_StarTex,uv1*_StarParam.xy+t*_StarParam.zw)*weights.z+texture(_StarTex,uv2*_StarParam.xy+t*_StarParam.zw)*weights.x;
  float sm=sat(texture(_StarMaskTex,uv1*_StarMaskScale+t*vec2(_StarMaskSpeedX,_StarMaskSpeedY)).g+_StarTwinklePower);
  color+=GammaToLinearSpace(a.rgb)*Twinkle(a.a,sm)*mask.r*_StarColor.rgb*_StarColor.a;
  vec4 b=texture(_StarTex,uv1*_StarParam_2.xy+t*_StarParam_2.zw);
  color+=GammaToLinearSpace(b.rgb)*Twinkle(b.a,sm)*mask.r*_StarColor_2.rgb*_StarColor_2.a;
  if(_PortraitFlow>.5){
    float coord=uv.x*_LineFlowParam.x+t*_LineFlowParam.z;
    float offset=texture(_LineFlowTex,vec2(coord,coord)).r*_LineFlowIntensity;
    vec4 lineSample=texture(_LineTex,uv+offset*mask.g);
    color=mix(color,_LineStaticColor.rgb,mask.b);
    color=mix(color,GammaToLinearSpace(lineSample.rgb)*_LineTint.rgb,lineSample.a);
    float spec=sat(pow(max(dot(V,N),.000001),_LineRange)*(mask.b+lineSample.a));
    color+=spec*_SpecularColor.rgb*_LineIntensity;
    float flow=pow(max(texture(_FlowLightTex,uv*_FlowParam.xy+t*_FlowSpeed*.1*_FlowParam.zw).g,.000001),max(_FlowPow,.000061));
    color+=sat(flow*(mask.b+lineSample.a))*_FlowColor.rgb*_FlowColor.a;
  }
  if(_PortraitFresnel>.5){
    float fres=sat(1.-dot(N,V));
    fres=sat(fres+texture(_Fresnel_Mask,uv*_Fresnel_Param.x).r*fres*_Fresnel_Param.y);
    fres=smoothstep(_Fresnel_Param.z-_Fresnel_Param.w,_Fresnel_Param.z+_Fresnel_Param.w,fres)*texture(_Fresnel_Mask,uv).r*_Fresnel_Color.a;
    color=mix(color,_Fresnel_Color.rgb,fres);
  }
  outColor=vec4(LinearToGammaSpace(max(color,vec3(0))),1);
}`;

const LIQUID_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uObject, uView;
uniform sampler2D _MainTex, _WaveTex;
uniform vec4 _Color, _MidTint, _DarkTint, _WaveTexUVParam, _LiquidColor, _LiquidDarkColor, _LiquidLineColor, _LiquidMask_ST, _LiquidFresnel_Param, _LiquidFresnel_Color;
uniform vec4 _LiquidTopColor, _LiquidTopDarkColor, _LiquidTop_ST, _LiquidPupple_Color, _LiquidPupple_TexUVParam;
uniform vec4 _ProbeLightDirection, _ProbeZoneColor, _ProbeAmbientColor;
uniform float _MeshType, _Cutoff, _LightProbWeight, _ShadowFeather, _ShadowThreshold, _DarkThreshold, _EnvColorWeight;
uniform float _CharInfo_FeetHeight, _CharInfo_HeadHeight, _CharInfo_OriginalHeight, _Height, _LightHeight, _Alpha, _WavePower;
uniform float _LiquidMask_WavePower, _LiquidTop_WavePower, _LiquidPupple_Size, _LiquidPupple_Smooth, _LiquidPupple_WavePower;
uniform float _PortraitEffectTime, _ProbeZoneIntensity, _ProbeSH;
out vec4 outColor;
void main(){
  vec2 uv=vUvRaw; vec3 relative=vWorld-uObject[3].xyz;
  float wave=texture(_WaveTex,relative.xz*_WaveTexUVParam.xy+_PortraitEffectTime*_WaveTexUVParam.zw).r;
  float height=(2.*_Height-1.)*length(uObject[1].xyz);
  height*=mix(1.,(_CharInfo_HeadHeight-_CharInfo_FeetHeight)/max(_CharInfo_OriginalHeight,.01),_MeshType);
  float y=relative.y+_WavePower*wave;
  float inside=step(y,height+_LightHeight);
  if(inside-max(_Cutoff,.000061)<0.) discard;
  vec3 N=normalize(vNormal), V=normalize(vec3(uView[0][2],uView[1][2],uView[2][2]));
  vec3 base;
  if(gl_FrontFacing){
    float mask=texture(_MainTex,uv*_LiquidMask_ST.xy+_LiquidMask_ST.zw+wave*_LiquidMask_WavePower).r;
    base=mix(_LiquidDarkColor.rgb,_LiquidColor.rgb,mask);
    float fresnel=_LiquidFresnel_Param.x+_LiquidFresnel_Param.y*pow(max(1.-dot(N,V),0.),_LiquidFresnel_Param.z);
    base=mix(base,_LiquidFresnel_Color.rgb,fresnel)+(inside-step(y,height))*_LiquidLineColor.rgb;
    float bubble=texture(_MainTex,uv*_LiquidPupple_TexUVParam.xy+_PortraitEffectTime*_LiquidPupple_TexUVParam.zw+wave*_LiquidPupple_WavePower).b;
    float amount=sat((bubble-max(relative.y+_LiquidPupple_Size,.01))/max(_LiquidPupple_Smooth,.000061));
    base+=amount*amount*(3.-2.*amount)*_LiquidPupple_Color.rgb;
  } else {
    float top=texture(_MainTex,uv*_LiquidTop_ST.xy+_PortraitEffectTime*_LiquidTop_ST.zw+wave*_LiquidTop_WavePower).g;
    base=mix(_LiquidTopDarkColor.rgb,_LiquidTopColor.rgb,top);
  }
  base*=_Color.rgb;
  float h=dot(N,normalize(_ProbeLightDirection.xyz))*.5+.5;
  float feather=max(_ShadowFeather,.000061);
  float a=sat((h-(_ShadowThreshold-_ShadowFeather))/feather);
  float b=sat((h-(_ShadowThreshold*_DarkThreshold-_ShadowFeather))/feather);
  vec3 dark=base*_DarkTint.rgb; vec3 tone=mix(dark,base,a); tone=mix(tone,base*_MidTint.rgb,a*(1.-a)); tone=mix(dark,tone,b);
  vec3 direct=min(_ProbeZoneIntensity,1.5)*mix(vec3(1),_ProbeZoneColor.rgb,_EnvColorWeight);
  float weight=sat((1.-_EnvColorWeight)*(1.-a)+a);
  vec3 ambient=max(mix(base,base*_ProbeAmbientColor.rgb,_ProbeAmbientColor.a),vec3(.000061));
  vec3 color=direct*mix(ambient,tone,weight)+_ProbeSH*_LightProbWeight*base;
  outColor=vec4(max(color,vec3(0)),sat(_Color.a*_Alpha));
}`;

// Approximation of Unity Standard (Fade) under RenderPose's lights, gamma color space.
const STANDARD_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uView; uniform sampler2D _MainTex; uniform vec4 _Color, _EmissionColor; uniform float _Glossiness, _Metallic;
uniform vec3 uLightDir[3], uLightColor[3]; uniform vec3 uAmbient;
out vec4 outColor;
void main(){
  vec4 albedo=texture(_MainTex,vUv)*_Color; vec3 N=normalize(vNormal), V=vec3(uView[0][2],uView[1][2],uView[2][2]);
  vec3 diffuse=uAmbient, spec=vec3(0); float rough=max(1.-_Glossiness,.08), a2=rough*rough*rough*rough;
  for(int i=0;i<3;i++){ vec3 L=uLightDir[i]; float nl=max(dot(N,L),0.); diffuse+=uLightColor[i]*nl;
    vec3 H=normalize(L+V); float nh=max(dot(N,H),0.), d=nh*nh*(a2-1.)+1.; spec+=uLightColor[i]*nl*a2/(3.14159*d*d+1e-5)*0.2209; }
  vec3 color=albedo.rgb*(1.-_Metallic)*diffuse+spec*0.25+_EmissionColor.rgb;
  outColor=vec4(color,albedo.a);
}`;

(function install() {
  Object.assign(KIND, { 'AFK/Avatar Layered Effect': 'layered', 'AFKRecovered/EffectFXStyle': 'fxstyle', 'AFKRecovered/EffectGalaxy': 'galaxy', 'AFKRecovered/EffectLiquid': 'liquid', 'Standard': 'standard' });
  const ZTEST = [0x0207, 0x0200, 0x0201, 0x0202, 0x0203, 0x0204, 0x0205, 0x0206, 0x0207]; // Unity CompareFunction -> GL
  const DEFAULTS = {
    layered: { _MainTex: 'white', _BlendTex: 'white', _MaskTex: 'white', _Soft_MaskTex: 'white', _AFKVertexMask: 'white' },
    fxstyle: { _MainTex: 'white', _TileTex: 'white', _MaskTex: 'white', _Soft_MaskTex: 'white', _VertSecondaryMask: 'white' },
    galaxy: { _MainTex: 'white', _Fresnel_Mask: 'white', _UIModelInternalLut: 'white', _OutlineDetailTex: 'white', _OutlineDetailTex2: 'white', _EFX_Mask: 'white', _EFX_STARFIELD_Tex: 'white' },
    liquid: { _MainTex: 'white', _WaveTex: 'white' },
    standard: { _MainTex: 'white' },
  };
  const proto = WardrobeRenderer.prototype, basePass = proto.passState, baseDefault = proto.textureDefault;
  proto.textureDefault = function (kind, name) { return DEFAULTS[kind] ? (DEFAULTS[kind][name] || 'black') : baseDefault.call(this, kind, name); };
  // RenderPose's DialoguePoseKey / Fill / Rim directional lights (Euler pitch, yaw; intensity; color).
  const lights = [[35, -35, 1.15, [1, .94, .86]], [20, 145, .7, [.68, .8, 1]], [-35, 180, .85, [.78, .7, 1]]].map(([pitch, yaw, k, c]) => {
    const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180, forward = [Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
    return { dir: forward.map(v => -v), color: c.map(v => v * k) };
  });
  proto.passState = function (d) {
    const v = d.material.values;
    switch (d.kind) {
      case 'layered': return { program: this.program('fx-layered', SKIN_VS, LAYERED_FS), blend: [5, v._AFKDestinationBlend ?? 10, 1, 10], depthWrite: (v._AFKDepthWrite ?? 0) > .5, cull: v._CullMode ?? 0 };
      case 'fxstyle': return { program: this.program('fx-style', FX_VS, FXSTYLE_FS), blend: [5, v._BlendMode ?? 10, 1, 10], depthWrite: (v._Z_Write ?? 0) > .5, depthFunc: ZTEST[v._Z_Test ?? 4], cull: v._CullMode ?? 0 };
      case 'galaxy': return { program: this.program('fx-galaxy', SKIN_VS, GALAXY_FS), blend: [1, 0, 1, 0], depthWrite: true, cull: v._CullMode ?? 2 };
      case 'liquid': return { program: this.program('fx-liquid', SKIN_VS, LIQUID_FS), blend: [5, 10, 5, 10], depthWrite: (v._ZWriteMode ?? 1) > .5, cull: 0 };
      case 'standard': {
        const program = this.program('fx-standard', SKIN_VS, STANDARD_FS), gl = this.gl;
        if (!program.lightsSet) { // uniforms persist per program; restore whichever program was bound
          const previous = gl.getParameter(gl.CURRENT_PROGRAM); gl.useProgram(program.p);
          gl.uniform3fv(program.uniforms['uLightDir[0]'].loc, lights.flatMap(l => l.dir)); gl.uniform3fv(program.uniforms['uLightColor[0]'].loc, lights.flatMap(l => l.color));
          gl.uniform3f(program.uniforms.uAmbient.loc, .212, .227, .259); // Unity default ambient sky color
          gl.useProgram(previous); program.lightsSet = true;
        }
        const src = v._SrcBlend ?? 1, dst = v._DstBlend ?? 0;
        return { program, blend: [src, dst, src, dst], depthWrite: (v._ZWrite ?? 1) > .5, cull: 2 };
      }
      default: return basePass.call(this, d);
    }
  };
})();

;
/* Full-coverage 3D wardrobe: items exported once, combined on a shared skeleton.
   Requires renderer.js and wardrobe-renderer.js (shaders, post-processing, draw path).
   Posing: each bone's local transform takes the clip-driven components for the pose and
   the selected outfit's (or item's own) rest values otherwise, as Unity's clip sampling does.
   Appearance follows AvatarAppearancePresets / AvatarPhysique: skin, eye and eyebrow
   texture swaps by texture name, physique on "comface"/"body" materials. Makeup and body paint
   follow AvatarItemCapture: a _MAKEUP_Tex overlay on the opaque skin materials of the face
   (makeup) or of everything outside the named groups (body paint). */
'use strict';

const SKIN_ATLAS = /pbsc_avatar_(comface\d+|combody\d+)_(male|female)_color\d+_skin/i;
const MESH_SLOTS = ['outfit', 'face', 'hair', 'head', 'mask', 'cloak', 'back', 'beard'];
const LOOK_SLOTS = ['outfit', 'hair', 'face', 'skin', 'eyes', 'head', 'mask', 'back', 'cloak', 'beard', 'bodyshape', 'makeup', 'bodypaint'];
const SKIN_ROLE = /^pbsc_avatar_com(?:face|body)\d+_(male|female)_color\d+_skin/;
const GROUPS = ['hair', 'face', 'cloak', 'head', 'back', 'mask', 'beard'];
// Affected leg and blends for thigh, calf, foot and toes. These trims only
// apply to the female Wow pose. The Moth dresses keep the raised left leg.
const WOW_LEG_FIT = {
  71: ['L', .65, .65, .65, .65], 315: ['L', .65, .65, .65, .65],
  387: ['L', .65, .65, .65, .65],
  406: ['R', .3, .4, .55, .55], 414: ['R', .3, .4, .55, .55],
  462: ['L', .65, .65, .65, .65], 470: ['L', .65, .65, .65, .65],
  573: ['L', .65, .65, .65, .65], 674: ['L', .65, .65, .65, .65],
  676: ['L', .65, .65, .65, .65], 758: ['L', .65, .65, .65, .65],
  816: ['L', .65, .65, .65, .65], 818: ['L', .65, .65, .65, .65],
  1015: ['L', .25, .55, .55, .55],
  1036: ['L', .65, .65, .65, .65], 1044: ['L', .65, .65, .65, .65],
  1063: ['L', .1, .55, .6, .6], 1130: ['L', .1, .55, .6, .6],
};
// AvatarItemCapture.Group: the first named group found on the renderer's transform path, else body.
const PELVIS_TAILS = new Set([84, 162, 163, 535, 735, 736]);   // back items worn as tails (avatar_creator/clothing-fit.js)
const groupOf = path => { const names = path.split('/').reverse(); for (const n of names) for (const g of GROUPS) if (n.includes('_' + g + '_')) return g; return 'body'; };
// Reviewed back sockets (AvatarAssemblerWindow.ResolveAttachmentTarget, added 2026-11-14 after this export):
// bindTransform = fix * bindTransform on the "AFK Socket" bone, as the 2D wardrobe's captures use. `from` is
// the socket's exported position; a later export that already carries the fix is left alone.
const SOCKET_FIXES = [
  { prefab: /^AFK Socket - pbsc_avatar_common_back_12(_|$)/, from: [0, 0, 0],   // Bone Horn: carried upright, closer to the spine
    p: [-0.053, 0.236, 0.137], r: [0, -Math.SQRT1_2, 0, Math.SQRT1_2], s: 0.8 },
  { prefab: /^AFK Socket - pbsc_avatar_common_back_79(_|$)/, from: [0.18, -0.14, 0],   // Oathbound / Ember Feathers: wing root toward the back
    p: [0, 0.335, -0.062], r: [0, 0, 0, 1], s: 1 },
];
function fixSockets(item) {
  if (item.slot !== 'back') return;
  const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const turn = (q, v) => { const [x, y, z, w] = q, t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + y * t[2] - z * t[1], v[1] + w * t[1] + z * t[0] - x * t[2], v[2] + w * t[2] + x * t[1] - y * t[0]]; };
  for (const bone of item.bones || []) {
    const fix = SOCKET_FIXES.find(f => f.prefab.test(bone.path.split('/').pop()));
    if (!fix || bone.p.some((v, i) => Math.abs(v - fix.from[i]) > 1e-3)) continue;
    const apply = (p, r, s) => [turn(fix.r, p.map(v => v * fix.s)).map((v, i) => v + fix.p[i]), mul(fix.r, r), s.map(v => v * fix.s)];
    [bone.p, bone.r, bone.s] = apply(bone.p, bone.r, bone.s);
    for (let o = 0; o + 10 <= (bone.poses?.length || 0); o += 10) {
      const [p, r, s] = apply(bone.poses.slice(o, o + 3), bone.poses.slice(o + 3, o + 7), bone.poses.slice(o + 7, o + 10));
      bone.poses.splice(o, 10, ...p, ...r, ...s);
    }
  }
}

function composeTRS(p, r, s) {
  const [x, y, z, w] = r, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([(1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0, 2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, p[0], p[1], p[2], 1]);
}

class FullWardrobe extends WardrobeRenderer {
  constructor(canvas) {
    super(canvas);
    this.items = new Map();
    this.meshes = new Map();
    this.posesByGender = {};
    this.posesPending = new Map();
    this.resolvedMaterials = new Map();
    this.fillLegs = true;
    this.legFill = null;
    this.legFillPending = null;
    this.legFillOutfits = null;
    this.instances = new Map();
  }
  setLegFillOutfits(outfits) {
    if (!outfits || typeof outfits !== 'object') {
      this.legFillOutfits = null;
      return;
    }
    this.legFillOutfits = new Map(
      Object.entries(outfits).map(([gender, ids]) => [gender, new Set((ids || []).map(Number))])
    );
  }
  needsLegFill(gender, outfitId) {
    if (this.fillLegs === false || !outfitId) return false;
    // Without an outfit list, stay conservative and load leg-fill before rendering.
    if (!this.legFillOutfits) return true;
    return this.legFillOutfits.get(gender)?.has(Number(outfitId)) || false;
  }
  async ensureLegFill() {
    if (this.legFill) return this.legFill;
    if (!this.legFillPending) {
      const pending = (async () => {
        const response = await fetch(this.base + 'leg-fill.json');
        if (!response.ok) throw new Error('leg-fill.json (' + response.status + ')');
        return this.legFill = await response.json();
      })();
      this.legFillPending = pending;
    }
    const pending = this.legFillPending;
    try { return await pending; }
    catch (error) {
      if (this.legFillPending === pending) this.legFillPending = null;
      throw error;
    }
  }
  async openCatalog(base) {
    this.base = base;
    const get = async path => {
      const response = await fetch(base + path);
      if (!response.ok) throw new Error(path + ' (' + response.status + ')');
      return response.json();
    };
    const image = url => new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('LUT failed to load')); img.src = url; });
    // All at once: from a distant library each request costs a round trip, so none waits on another.
    // leg-fill.json only applies to a small set of outfits and loads on demand before their first render.
    const [catalog, tables, mips, overlays, lut] = await Promise.all([get('catalog.json'), get('tables.json'), get('tex-mips.json'), get('overlays.json'), image(base + 'lut.png')]);
    this.catalog = catalog; this.tables = tables;
    this.validation = {references: []};
    this.noMipmaps = new Set(mips.noMipmaps);
    this.tables.overlays = overlays.overlays;
    this.legFill = null;
    this.legFillPending = null;
    this.fillParts = new Map();
    this.repairItems = new Map();
    const index = (rows, keyed) => { const m = new Map(); for (const r of rows || []) m.set(r.id + '|' + r.key, r.texture); return m; };
    this.skinTex = index(this.tables.skins); this.eyeTex = index(this.tables.eyes); this.browTex = index(this.tables.brows); this.overlayTex = index(this.tables.overlays);
    this.physique = new Map((this.tables.physique || []).map(r => [r.id, Number(r.key)]));
    const gl = this.gl, solid = rgba => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); return t; };
    this.white = solid([255, 255, 255, 255]); this.black = solid([0, 0, 0, 0]); this.gray = solid([128, 128, 128, 128]);
    this.lut = lut; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, lut); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.lutTex = t;
    return this.catalog;
  }
  canPreviewItem(row, slot, gender) {
    if (row.error || row.catalogueOnly) return false;
    if (MESH_SLOTS.includes(slot)) return !!(row.file || row.empty);
    if (slot === 'bodyshape') return this.physique.has(row.id);
    if (slot === 'eyes') return !!this.eyeTex.get(row.id + '|' + gender);
    if (slot === 'skin') return this.tables.skins.some(skin => skin.id === row.id && skin.key.startsWith(gender + '/') && skin.texture);
    return !!this.overlayTex.get(row.id + '|' + gender + '/' + slot);
  }
  // One request per gender, shared by every caller while it is under way.
  posesOf(g) {
    if (this.posesByGender[g]) return Promise.resolve(this.posesByGender[g]);
    if (!this.posesPending.has(g)) this.posesPending.set(g, (async () => {
      const response = await fetch(this.base + 'poses/' + g + '.json?v=poses-20261115');
      if (!response.ok) throw new Error('poses/' + g + '.json (' + response.status + ')');
      return this.posesByGender[g] = await response.json();
    })());
    return this.cachedValue(this.posesPending, g);
  }
  // Starts every mesh and texture download a look needs at once. The steps that build the look
  // (hair collision, layer fit, GPU upload) then find them in the caches instead of asking in turn;
  // a failure here is left for those steps to report.
  prefetchParts(entries, selection) {
    for (const { item, part } of entries) {
      if (!part.mesh) continue;
      this.mesh(part.mesh).catch(() => {});
      const submeshes = item.meshes?.find(m => m.file === part.mesh)?.submeshes || [];
      for (let s = 0; s < submeshes.length; s++) if (part.materials?.[s] >= 0)
        this.resolveMaterial(item, part.materials[s], selection, item.slot === 'face', groupOf(part.path)).catch(() => {});
    }
  }
  // Resting on a card: that item and the meshes and maps it would bring, ahead of the click.
  async prefetchItem(file, selection) {
    try {
      const item = await this.item(file);
      this.prefetchParts(item.parts.map(part => ({ item, part })), selection);
    } catch (_) { /* the click reports any failure */ }
  }
  // `gender`: the character's (face, hair and the other items). `body`: the outfit's version, which
  // brings its own body and so its height and motion (Options: "Other gender's outfits"); the camera frames it.
  async useGender(gender, body = gender) {
    await Promise.all([...new Set([gender, body])].map(g => this.posesOf(g)));
    const poses = this.posesByGender[body]; this.gender = gender;
    this.manifest = { cameras: poses.cameras };
    const front = poses.cameras.find(c => c.yaw === 0), back = poses.cameras.find(c => c.yaw === 180);
    this.cam0 = front; this.pivot = back ? front.position.map((v, i) => (v + back.position[i]) / 2) : [front.position[0], front.position[1], 0];
  }
  async cachedValue(map, key) {
    const pending = map.get(key);
    try { return await pending; }
    catch (error) {
      if (map.get(key) === pending) map.delete(key);
      throw error;
    }
  }
  async item(file) {
    if (!this.items.has(file)) this.items.set(file, (async () => {
      const response = await fetch(this.base + file + '?v=poses-20261115');
      if (!response.ok) throw new Error(file + ' (' + response.status + ')');
      const size = Number(response.headers.get('Content-Length'));
      if (size > 0) this.bytes += size;
      const data = await response.json();
      fixSockets(data);
      return data;
    })());
    return this.cachedValue(this.items, file);
  }
  async mesh(file) {
    if (!this.meshes.has(file)) this.meshes.set(file, (async () => {
      const buffer = await W3DFormats.unpackMesh(await this.fetchBytes(file)); return { buffer };
    })());
    return this.cachedValue(this.meshes, file);
  }
  async repairItem(gender, outfitId, hand) {
    if (!hand?.additions?.length && !hand?.additionsFile) return null;
    const key = gender + ':' + outfitId;
    if (!this.repairItems.has(key)) this.repairItems.set(key, (async () => {
      const item = { id: outfitId, gender, slot: 'legfit', parts: [], meshes: [], materials: [], bones: [] };
      const additions = hand.additions || (await this.item(hand.additionsFile)).additions;
      for (const [i, addition] of additions.entries()) {
        const source = await this.item(addition.source), sourcePart = source.parts[addition.part];
        const materialSource = await this.item(addition.materialSource || addition.source);
        const raw = atob(addition.data), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
        const file = 'legfit:' + key + ':' + i;
        this.meshes.set(file, Promise.resolve({ buffer: bytes.buffer }));
        const materials = addition.materials.map(index => { item.materials.push(materialSource.materials[index]); return item.materials.length - 1; });
        item.bones.push(...source.bones);
        item.meshes.push({ file, layout: addition.layout, bindposes: addition.bindposes, submeshes: addition.submeshes, shapes: [] });
        item.parts.push({ ...sourcePart, mesh: file, materials, shapeWeights: [], instance: null });
      }
      return item;
    })());
    return this.cachedValue(this.repairItems, key);
  }
  async gpuPart(item, part) {
    // One GPU instance per item part; static attributes come from the shared mesh buffer.
    part.instance ||= (async () => {
      const gl = this.gl, meshInfo = item.meshes.find(m => m.file === part.mesh), { buffer } = await this.mesh(part.mesh), L = meshInfo.layout, n = L.vertexCount;
      const f32 = (offset, count) => new Float32Array(buffer, offset, count);
      const inst = { meshInfo, layout: L, vertexCount: n, basePos: f32(L.positions, n * 3), baseNor: f32(L.normals, n * 3) };
      inst.pos = new Float32Array(inst.basePos); inst.nor = new Float32Array(inst.baseNor);
      const vao = gl.createVertexArray();
      inst.gpu = {vao, buffers:[]};
      this.instances.set(part, inst);
      gl.bindVertexArray(vao);
      const attr = (loc, data, size, type = gl.FLOAT, usage = gl.STATIC_DRAW) => { const b = gl.createBuffer(); inst.gpu.buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, false, 0, 0); return b; };
      inst.posBuffer = attr(0, inst.pos, 3, gl.FLOAT, gl.DYNAMIC_DRAW); inst.norBuffer = attr(1, inst.nor, 3, gl.FLOAT, gl.DYNAMIC_DRAW);
      attr(2, f32(L.tangents, n * 4), 4); attr(3, f32(L.uv0, n * 2), 2);
      if (L.uv1 >= 0) attr(4, f32(L.uv1, n * 2), 2); else { gl.disableVertexAttribArray(4); gl.vertexAttrib2f(4, 0, 0); }
      if (L.figure >= 0) attr(5, f32(L.figure, n * 3), 3); else { gl.disableVertexAttribArray(5); gl.vertexAttrib3f(5, 0, 0, 0); }
      if (L.color >= 0) attr(6, f32(L.color, n * 4), 4); else { gl.disableVertexAttribArray(6); gl.vertexAttrib4f(6, 1, 1, 1, 1); }
      attr(7, new Uint16Array(buffer, L.joints, n * 4), 4, gl.UNSIGNED_SHORT); attr(8, f32(L.weights, n * 4), 4);
      for (const [loc, name] of [[9, 'figureNormal'], [10, 'figureTangent']]) {
        if (L[name] >= 0) attr(loc, f32(L[name], n * 3), 3);
        else { gl.disableVertexAttribArray(loc); gl.vertexAttrib3f(loc, 0, 0, 0); }
      }
      inst.indices = this.hideUnderShell(item, part, meshInfo, inst.basePos, new Uint32Array(buffer, L.indices, L.indexCount));
      const ib = gl.createBuffer(); inst.gpu.buffers.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, inst.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      inst.shapes = meshInfo.shapes.map(s => ({ index: new Uint32Array(buffer, s.offset, s.count), delta: new Float32Array(buffer, s.offset + s.count * 4, s.count * 6) }));
      const boneCount = Math.max(1, part.bones.length);
      inst.boneCount = boneCount; inst.boneTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, inst.boneTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, boneCount * 4, 1);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);

      // Blend shapes are static per item in the wardrobe poses (weights from the export).
      (part.shapeWeights || []).forEach((w, s) => { if (!w) return; const k = w / 100, d = inst.shapes[s];
        for (let j = 0; j < d.index.length; j++) { const v = d.index[j] * 3, o = j * 6; for (let a = 0; a < 3; a++) { inst.pos[v + a] += d.delta[o + a] * k; inst.nor[v + a] += d.delta[o + 3 + a] * k; } } });
      gl.bindBuffer(gl.ARRAY_BUFFER, inst.posBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst.norBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.nor);
      inst.restPos = new Float32Array(inst.pos); inst.offsets = null;
      return inst;
    })();
    try { return await part.instance; }
    catch (error) { part.instance = null; throw error; }
  }
  // A shell layer: a blended, opaque submesh (texture alpha ~1, `shellAlpha`) that copies the skin 2 mm further out (Phantom
  // Play's stockings, 869). The skin under it never shows, but its flat triangles cut through the thin
  // gap on bends; those triangles are dropped (made degenerate).
  hideUnderShell(item, part, meshInfo, pos, indices) {
    const mat = s => item.materials[part.materials[s]], subs = meshInfo.submeshes;
    const tex = m => m?.props.find(p => p.name === '_MainTex')?.textureName || '';
    // only opaque layers: sheer stockings (760, 135, 297: texture alpha ~0.75, build_catalog.mark_shells) show the skin through
    const shells = subs.filter((_, s) => mat(s)?.renderType === 'Transparent' && (mat(s).props.find(p => p.name === '_Color')?.vector?.[3] ?? 1) >= .99 && (mat(s).shellAlpha ?? 0) >= .95);
    const skins = subs.filter((_, s) => mat(s)?.renderType === 'Opaque' && SKIN_ROLE.test(tex(mat(s))));
    if (!shells.length || !skins.length) return indices;
    const cell = .003, reach = .0026, key = (x, y, z) => x + ',' + y + ',' + z, grid = new Map();   // the shell sits 2.1 mm out
    for (const sub of shells) for (let i = sub.indexOffset; i < sub.indexOffset + sub.indexCount; i++) {
      const v = indices[i], k = key(Math.floor(pos[v * 3] / cell), Math.floor(pos[v * 3 + 1] / cell), Math.floor(pos[v * 3 + 2] / cell));
      if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v);
    }
    const covered = v => { const x = Math.floor(pos[v * 3] / cell), y = Math.floor(pos[v * 3 + 1] / cell), z = Math.floor(pos[v * 3 + 2] / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const w of grid.get(key(x + a, y + b, z + c)) || [])
        if (Math.hypot(pos[v * 3] - pos[w * 3], pos[v * 3 + 1] - pos[w * 3 + 1], pos[v * 3 + 2] - pos[w * 3 + 2]) < reach) return true;
      return false; };
    let out = indices, hidden = 0;
    for (const sub of skins) for (let i = sub.indexOffset; i < sub.indexOffset + sub.indexCount; i += 3) {
      if (!covered(indices[i]) || !covered(indices[i + 1]) || !covered(indices[i + 2])) continue;
      if (out === indices) out = new Uint32Array(indices);
      out[i + 1] = out[i + 2] = out[i]; hidden++;
    }
    if (hidden) console.info('shell layer hides', hidden, 'skin triangles of', part.path);
    return out;
  }
  async resolveMaterial(item, index, selection, fromFace, group) {
    const source = item.materials[index]; if (!source) return null;
    const g = this.gender, values = {}, overrides = {};
    for (const p of source.props) if (p.type === 'texture') {
      let file = p.texture, name = p.textureName || '';
      if (p.name === '_MainTex') {
        const skin = SKIN_ATLAS.exec(name);   // the atlas's own gender: an outfit worn by the other gender keeps its body's atlas
        if (skin && selection.skin) file = this.skinTex.get(selection.skin + '|' + skin[2].toLowerCase() + '/' + skin[1].toLowerCase()) || file;
        else if (/^pbsc_avatar_pupil/i.test(name) && selection.eyes) file = this.eyeTex.get(selection.eyes + '|' + g) || file;
        else if (fromFace && /^pbsc_avatar_hair/i.test(name) && selection.hair) file = this.browTex.get(selection.hair + '|' + g) || file;
      }
      overrides[p.name] = file;
    }
    // Overlay: opaque PortraitLighting skin materials only (the source name decides the role).
    const main = source.props.find(p => p.name === '_MainTex'), slot = group === 'face' ? 'makeup' : group === 'body' ? 'bodypaint' : null;
    const opaque = source.shader === 'AFKRecovered/PortraitLighting' && source.props.find(p => p.name === '_ProbeDstBlend')?.value === 0;
    const role = SKIN_ROLE.exec(main?.textureName || '');   // painted for that skin's own gender (body paint on the other gender's outfit)
    const overlay = slot && selection[slot] && opaque && role && source.props.some(p => p.name === '_MAKEUP_Tex')
      ? this.overlayTex.get(selection[slot] + '|' + role[1] + '/' + slot) : null;
    if (overlay) overrides._MAKEUP_Tex = overlay;
    const strength = selection.bodyshape ? this.physique.get(selection.bodyshape) : 0;
    const figure = strength > 0 && source.shader !== 'Standard' && /comface|body/.test(source.name);
    const key = JSON.stringify([item.gender, item.slot, item.id, index, overrides, figure ? strength : 0, !!overlay]);
    if (!this.resolvedMaterials.has(key)) this.resolvedMaterials.set(key, (async () => {
      // Request every map at once; a failure still surfaces at its own await below.
      const textures = new Map(source.props.filter(p => p.type === 'texture').map(p => {
        const pending = this.texture(overrides[p.name]); pending.catch(() => {}); return [p.name, pending];
      }));
      for (const p of source.props) values[p.name] = p.type === 'texture' ? { texture: await textures.get(p.name), st: p.st } : p.type === 'vector' ? p.vector : p.value;
      // Reviewed hair families whose native anisotropic HDR tint becomes a broad
      // false patch under the recovered isotropic lobe. Keep painted highlights,
      // diffuse/metal maps and geometry; do not suppress unrelated accessory glints.
      // Keep this scope in sync with PortraitRecoveredLighting.cs for 2D captures.
      if (item.slot === 'hair' && source.shader === 'AFKRecovered/PortraitLighting' &&
          /^pbsc_avatar_hair(?:06_(?:female|male)|10_(?:female|male)|60_female|111_female|145_(?:female|male))(?:_color\d+)?$/i.test(main?.textureName || '') && values._SpecularType === 4) {
        values._SpecularColor = [0, 0, 0, values._SpecularColor?.[3] ?? 1];
      }
      if (figure) { values._AFKFigureEnabled = 1; values._StrongFactor = strength; }
      if (overlay) values._MAKEUP = 1;
      return { ...source, values };
    })());
    return this.cachedValue(this.resolvedMaterials, key);
  }
  // A filler copy of Default's body part, with its own index buffer (only the selected triangles).
  // `fit` (build_fill.leg_fit) moves each leg onto the outfit's sock, boot or shoe opening and
  // draws it e inside its surface, fully up to the opening (or the knee) and fading out at the
  // hip, where it is drawn `inset` inside; legs without a fit (no legwear) are drawn `inset` inside.
  // `shrink` (per vertex, mm, per pose) narrows the leg where the outfit's cloth crosses it.
  // A hand-fitted entry (`hand`, blender/legfit_save.py) instead moves each vertex by `delta`
  // (int16, 0.1 mm, mesh space) and is drawn in every pose.
  fillPart(gender, outfitId, item, pose, fit, inset, booted = false) {
    const key = [gender, outfitId, pose.bits, pose.shrink || '', pose.delta || '', inset, JSON.stringify(fit), booted].join('|');   // one filler per pose's triangle set
    if (!this.fillParts.has(key)) {
      const bytes = b64 => { const raw = atob(b64), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
      this.fillParts.set(key, { ...item.parts[0], materials: [item.parts[0].materials[0]], fill: bytes(pose.bits), shrink: pose.shrink ? bytes(pose.shrink) : null, delta: pose.delta ? new Int16Array(bytes(pose.delta).buffer) : null, fit: pose.delta ? null : fit, inset, taper: this.legFill.taper?.[gender], booted, instance: null });
    }
    return this.fillParts.get(key);
  }
  applyFill(inst, mask, part) {
    const { fit, inset = 0, taper, shrink, delta } = part;
    const all = inst.indices, kept = [];
    for (let t = 0; t < all.length / 3; t++) if (mask[t >> 3] & (1 << (t & 7)) && !(part.drop?.[t >> 3] & (1 << (t & 7)))) kept.push(all[t * 3], all[t * 3 + 1], all[t * 3 + 2]);
    const gl = this.gl; gl.bindVertexArray(inst.gpu.vao); const ib = gl.createBuffer(); inst.gpu.buffers.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(kept), gl.STATIC_DRAW); gl.bindVertexArray(null);
    inst.fillCount = kept.length; inst.layout = { ...inst.layout, indexCount: kept.length };
    const [knee, hip] = taper || [0, 1];
    if (delta) for (let v = 0; v < inst.pos.length; v++) inst.pos[v] += delta[v] / 10000;
    else for (let v = 0; v < inst.pos.length; v += 3) {   // mesh space: z up, the character's left at -x
      const f = fit?.[inst.pos[v] < 0 ? 'L' : 'R'], z = inst.pos[v + 2];
      const full = f ? Math.min(Math.max(f.z, knee), hip - .05) : 0, k = f ? Math.min(1, Math.max(0, (hip - z) / (hip - full))) : 0;
      if (f) { inst.pos[v] += f.d[0] * k; inst.pos[v + 1] += f.d[1] * k; }
      const e = (f ? k * f.e + (1 - k) * inset : inset) + (shrink ? shrink[v / 3] / 1000 : 0), n = inst.nor.subarray(v, v + 3), l = Math.hypot(n[0], n[1], n[2]) || 1;
      for (let a = 0; a < 3; a++) inst.pos[v + a] -= n[a] / l * e;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, inst.posBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.pos);
  }
  // Borrowed boots (leg-fill entry `boots`, an outfit id of the same gender; `this.bootDonor` {outfit: donor}
  // previews another): that outfit's body triangles below the knee, drawn with its own materials on this
  // outfit's skeleton wherever the leg fill is drawn. Default's fill then leaves out its own lower legs.
  // Triangles whose corners are all mostly weighted to a calf, foot or toe bone and stay near that leg: within 13 cm
  // (mesh space, z up) of the vertical through its ankle, plus 23 cm forward for the toes below 15 cm. Coat tails and
  // flaps skinned to the calves (Dusknight 573, Forgotten Grace 1110) hang further out and would poke through a skirt.
  async lowerMask(inst, part) {
    if (inst.lower) return inst.lower;
    const { buffer } = await this.mesh(part.mesh), L = inst.layout, n = inst.vertexCount, idx = inst.indices;
    const joints = new Uint16Array(buffer, L.joints, n * 4), weights = new Float32Array(buffer, L.weights, n * 4), pos = new Float32Array(buffer, L.positions, n * 3);
    const names = part.bones.map(p => (p || '').split('/').pop());
    const side = names.map(s => /^Bip001 L (Calf|Foot|Toe)/.test(s) ? 1 : /^Bip001 R (Calf|Foot|Toe)/.test(s) ? 2 : 0), foot = names.map(s => /^Bip001 [LR] Foot/.test(s));
    const sideOf = new Uint8Array(n), ankle = [null, [0, 0, 0], [0, 0, 0]], low = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const s = [0, 0, 0]; let f = 0;
      for (let j = 0; j < 4; j++) { const b = joints[v * 4 + j], w = weights[v * 4 + j]; s[side[b]] += w; if (foot[b]) f += w; }
      if (s[1] + s[2] < .5) continue;
      const sd = sideOf[v] = s[1] >= s[2] ? 1 : 2, z = pos[v * 3 + 2];
      if (f > .5 && z > .06 && z < .16) { ankle[sd][0] += pos[v * 3]; ankle[sd][1] += pos[v * 3 + 1]; ankle[sd][2]++; }
    }
    for (const a of ankle) if (a?.[2]) { a[0] /= a[2]; a[1] /= a[2]; }
    for (let v = 0; v < n; v++) {
      const a = ankle[sideOf[v]]; if (!a) continue;
      if (!a[2]) { low[v] = 1; continue; }
      const x = pos[v * 3] - a[0], y = pos[v * 3 + 1] - a[1], z = pos[v * 3 + 2];
      const ahead = y < 0 ? Math.max(0, -y - (z < .15 ? .23 : 0)) : y;
      low[v] = Math.hypot(x, ahead) <= .13 ? 1 : 0;
    }
    const mask = new Uint8Array(Math.ceil(idx.length / 24));
    for (let t = 0; t < idx.length / 3; t++) if (low[idx[t * 3]] && low[idx[t * 3 + 1]] && low[idx[t * 3 + 2]]) mask[t >> 3] |= 1 << (t & 7);
    return inst.lower = mask;
  }
  // `tex` (leg-fill `bootsTex`): the donor's outfit texture recoloured to suit the wearer (wardrobe3d/tools/boot_tone.py);
  // the boots then use a copy of the donor item whose cloth materials point at it, so the donor outfit itself is unchanged.
  async bootParts(gender, donorId, tex = null) {
    this.bootCache ||= new Map();
    const key = gender + ':' + donorId + ':' + (tex || '');
    if (!this.bootCache.has(key)) this.bootCache.set(key, (async () => {
      const row = this.catalog.genders[gender].outfit.find(r => r.id === donorId); if (!row?.file || row.error) return null;
      let item = await this.item(row.file);
      if (tex) {
        const cloth = p => p.name === '_MainTex' && p.texture && !SKIN_ATLAS.test(p.textureName || '');
        item = { ...item, id: item.id + ':' + tex, materials: item.materials.map(m => !m.props.some(cloth) ? m
          : { ...m, props: m.props.map(p => cloth(p) ? { ...p, texture: tex } : p) }) };
      }
      return { item, parts: item.parts.filter(p => p.skinned && groupOf(p.path) === 'body').map(p => ({ ...p, boots: true, instance: null })) };
    })());
    return this.cachedValue(this.bootCache, key);
  }
  async applyBoots(inst, part) {
    const mask = await this.lowerMask(inst, part), all = inst.indices, kept = [], subs = [];
    for (const sub of inst.meshInfo.submeshes) {   // keep each submesh's material, packed into one index buffer
      const start = kept.length;
      for (let i = sub.indexOffset; i < sub.indexOffset + sub.indexCount; i += 3) { const t = i / 3; if (mask[t >> 3] & (1 << (t & 7))) kept.push(all[i], all[i + 1], all[i + 2]); }
      subs.push({ ...sub, indexOffset: start, indexCount: kept.length - start });
    }
    const gl = this.gl; gl.bindVertexArray(inst.gpu.vao); const ib = gl.createBuffer(); inst.gpu.buffers.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(kept), gl.STATIC_DRAW); gl.bindVertexArray(null);
    inst.bootSubs = subs;
  }
  // CPU skinning of some vertices of a part: world positions (and normals) in the current pose.
  async skinned(item, part, compute, pick = null) {
    const inst = await this.gpuPart(item, part), { buffer } = await this.mesh(part.mesh), L = inst.layout, n = inst.vertexCount;
    const joints = new Uint16Array(buffer, L.joints, n * 4), weights = new Float32Array(buffer, L.weights, n * 4), bind = inst.meshInfo.bindposes;
    const mats = part.skinned ? part.bones.map((path, b) => path ? mat4.mul(compute(path), bind.slice(b * 16, b * 16 + 16)) : bind.slice(b * 16, b * 16 + 16)) : [compute(part.path)];
    const ids = pick || Array.from({ length: n }, (_, i) => i), pos = new Float32Array(ids.length * 3), nor = new Float32Array(ids.length * 3);
    ids.forEach((v, k) => {
      const m = new Float32Array(16);
      if (part.skinned) for (let j = 0; j < 4; j++) { const w = weights[v * 4 + j]; if (!w) continue; const M = mats[joints[v * 4 + j]]; for (let e = 0; e < 16; e++) m[e] += M[e] * w; }
      else m.set(mats[0]);
      const P = inst.offsets ? inst.restPos : inst.pos;   // as exported, without hair-lock offsets
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = inst.nor[v * 3], b = inst.nor[v * 3 + 1], c = inst.nor[v * 3 + 2];
      for (let e = 0; e < 3; e++) { pos[k * 3 + e] = m[e] * x + m[4 + e] * y + m[8 + e] * z + m[12 + e]; nor[k * 3 + e] = m[e] * a + m[4 + e] * b + m[8 + e] * c; }
      const l = Math.hypot(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]) || 1; for (let e = 0; e < 3; e++) nor[k * 3 + e] /= l;
    });
    return { pos, nor, inst, joints, weights };
  }
  // Hair collision: the game swings hair chains (bones under the head, e.g. side curls) with spring
  // bones at run time. The browser adjusts chains near the outfit, cloak and
  // back item, and lifts front locks that would otherwise cross a collar.
  // Returns a Map of bone path -> extra local rotation (empty when nothing collides).
  async hairCollision(hair, colliders, tables, poseIndex, root, poseName, margin = .004, reach = .035, layer = .045, collarLayer = .12, sink = .006, maxTurn = .22, lockTop = .16) {
    const extra = new Map();
    const parts = hair.parts.filter(p => p.skinned); if (!parts.length || !colliders.length) return extra;
    const name = path => path.split('/').pop(), isBody = n => /^Bip001|^RootBone$|Twist|xiuxing/.test(n);
    const byPath = new Map(hair.bones.map(b => [b.path, b]));
    const chainBones = hair.bones.filter(b => !isBody(name(b.path)) && /Bip001 (Head|Neck)\//.test(b.path) && b.parent);
    const roots = chainBones.filter(b => isBody(name(b.parent)));
    const children = new Map(); for (const b of chainBones) { if (!children.has(b.parent)) children.set(b.parent, []); children.get(b.parent).push(b.path); }
    const subtree = path => { const out = [path]; for (let i = 0; i < out.length; i++) out.push(...(children.get(out[i]) || [])); return out; };
    let compute = this.skeleton(tables, poseIndex, root, extra);
    // the body's centre line (pelvis to neck): "outward" for a hair point is away from it, level
    const bodyPath = n => tables[0].find(b => name(b.path) === n)?.path;
    const pelvis = bodyPath('Bip001 Pelvis'), neck = bodyPath('Bip001 Neck');
    if (!pelvis || !neck) return extra;
    const A = compute(pelvis).slice(12, 15), N0 = compute(neck).slice(12, 15);
    const neckHeight = Math.hypot(N0[0] - A[0], N0[1] - A[1], N0[2] - A[2]), up = [0, 1, 2].map(k => (N0[k] - A[k]) / neckHeight);
    const heightOf = (x, y, z) => (x - A[0]) * up[0] + (y - A[1]) * up[1] + (z - A[2]) * up[2];
    // forward: from the ankles to the toes, level
    const feet = ['L', 'R'].map(sd => [bodyPath(`Bip001 ${sd} Foot`), bodyPath(`Bip001 ${sd} Toe0`)]).filter(([a, b]) => a && b);
    let fwd = [0, 0, 0]; for (const [a, b] of feet) { const p = compute(a), q = compute(b); for (let k = 0; k < 3; k++) fwd[k] += q[12 + k] - p[12 + k]; }
    { const h = fwd[0] * up[0] + fwd[1] * up[1] + fwd[2] * up[2]; fwd = fwd.map((v, k) => v - h * up[k]); const l = Math.hypot(...fwd) || 1; fwd = fwd.map(v => v / l); }
    // In a twisted pose such as Wow, use the chest when the feet point away.
    const left = bodyPath('Bip001 L Clavicle'), right = bodyPath('Bip001 R Clavicle');
    let collarFwd = fwd;
    if (left && right) {
      const L = compute(left), R = compute(right);
      const [x, y, z] = [R[12] - L[12], R[13] - L[13], R[14] - L[14]];
      const front = [y * up[2] - z * up[1], z * up[0] - x * up[2], x * up[1] - y * up[0]];
      const length = Math.hypot(...front);
      if (length > 1e-4 && front.reduce((dot, v, i) => dot + v * fwd[i], 0) < .25 * length) {
        collarFwd = front.map(v => v / length);
      }
    }
    // hair vertices that hang on a chain (weight >= .3 on its bones), and locks: the other hair vertices
    // below the jaw (skinned to the head and spine, e.g. a front lock falling over the collar), which no
    // bone can swing without the body, so they are bent themselves
    const chainSet = new Set(chainBones.map(b => b.path)), strands = [], locks = [];
    for (const part of parts) {
      const inst = await this.gpuPart(hair, part), { buffer } = await this.mesh(part.mesh), L = inst.layout, n = inst.vertexCount;
      const joints = new Uint16Array(buffer, L.joints, n * 4), weights = new Float32Array(buffer, L.weights, n * 4), ids = [], low = [];
      const { pos } = await this.skinned(hair, part, compute);
      for (let v = 0; v < n; v++) {
        let w = 0; for (let j = 0; j < 4; j++) if (chainSet.has(part.bones[joints[v * 4 + j]])) w += weights[v * 4 + j];
        if (w >= .3) ids.push(v); else if (heightOf(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) < neckHeight + lockTop) low.push(v);
      }
      if (ids.length) strands.push({ part, ids, joints, weights });
      if (!low.length) continue;
      // split into the mesh's separate pieces (a lock, an earring in the same mesh): each lock moves on
      // its own; pieces under 8 cm across (earrings, clips) are left alone
      const parent = new Int32Array(n).map((_, i) => i), findRoot = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
      const weld = new Map(); for (let v = 0; v < n; v++) { const k = [0, 1, 2].map(a => Math.round(inst.basePos[v * 3 + a] * 1e5)).join(','); if (weld.has(k)) parent[findRoot(v)] = findRoot(weld.get(k)); else weld.set(k, v); }
      const idx = inst.indices; for (let t = 0; t + 2 < idx.length; t += 3) { const a = findRoot(idx[t]); parent[findRoot(idx[t + 1])] = a; parent[findRoot(idx[t + 2])] = a; }
      const box = new Map(); for (let v = 0; v < n; v++) { const r = findRoot(v); if (!box.has(r)) box.set(r, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]); const b = box.get(r); for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], inst.basePos[v * 3 + a]); b[a + 3] = Math.max(b[a + 3], inst.basePos[v * 3 + a]); } }
      const pieces = new Map(); for (const v of low) { const r = findRoot(v), b = box.get(r); if (Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) < .08) continue; if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(v); }
      // only locks hanging in front of the body (a front lock over the collar): side and back hair hangs
      // on chains, and bending it out from under a cape only flicks it sideways
      for (const ids of pieces.values()) {
        const pick = new Set(ids); let c = [0, 0, 0], k = 0;
        for (let v = 0; v < n; v++) if (pick.has(v)) { for (let a = 0; a < 3; a++) c[a] += pos[v * 3 + a]; k++; }
        c = c.map(x => x / k); const r = [c[0] - A[0], c[1] - A[1], c[2] - A[2]], h = r[0] * up[0] + r[1] * up[1] + r[2] * up[2];
        const o = [r[0] - h * up[0], r[1] - h * up[1], r[2] - h * up[2]], ol = Math.hypot(...o) || 1;
        // and only pieces that hang down like a lock (taller than wide): a helmet rim or a mask's chin is wide
        const side = [up[1] * collarFwd[2] - up[2] * collarFwd[1], up[2] * collarFwd[0] - up[0] * collarFwd[2], up[0] * collarFwd[1] - up[1] * collarFwd[0]];
        let h0 = Infinity, h1 = -Infinity, f0 = Infinity, f1 = -Infinity, s0 = Infinity, s1 = -Infinity;
        for (const v of ids) {
          const x = pos[v * 3] - A[0], y = pos[v * 3 + 1] - A[1], z = pos[v * 3 + 2] - A[2];
          const hv = x * up[0] + y * up[1] + z * up[2], fv = x * collarFwd[0] + y * collarFwd[1] + z * collarFwd[2], sv = x * side[0] + y * side[1] + z * side[2];
          h0 = Math.min(h0, hv); h1 = Math.max(h1, hv); f0 = Math.min(f0, fv); f1 = Math.max(f1, fv); s0 = Math.min(s0, sv); s1 = Math.max(s1, sv);
        }
        const tall = h1 - h0 >= .8 * Math.max(f1 - f0, s1 - s0);
        if ((o[0] * collarFwd[0] + o[1] * collarFwd[1] + o[2] * collarFwd[2]) / ol > .3 && tall) locks.push({ part, ids, inst });
      }
    }
    if (!strands.length && !locks.length) return extra;
    // collider surface: points over the outfit triangles near the hair (about 1.2 cm apart), with normals
    const first = await Promise.all([...strands, ...locks].map(s => this.skinned(hair, s.part, compute, s.ids)));
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of first) for (let i = 0; i < f.pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], f.pos[i + a] - .2); hi[a] = Math.max(hi[a], f.pos[i + a] + .2); }
    const cell = .02, grid = new Map(), sp = [], sn = [], sa = [], key = (x, y, z) => x + ',' + y + ',' + z;
    for (const item of colliders) for (const part of item.parts) {
      const { pos, nor, inst, joints, weights } = await this.skinned(item, part, compute), idx = inst.indices;
      // arms are not colliders: they swing far between poses, and a hand at the face or a sleeve at the
      // side would fling or bend the hair out (the torso, collar and cape are what it should lie on)
      const arm = part.skinned ? part.bones.map(b => /(UpperArm|Forearm|Hand|Finger)/.test(name(b || ''))) : [];
      const upper = part.skinned ? part.bones.map(b => /UpperArm/.test(name(b || ''))) : [];
      const share = (flags, v) => { if (!part.skinned) return 0; let w = 0; for (let k = 0; k < 4; k++) if (flags[joints[v * 4 + k]]) w += weights[v * 4 + k]; return w; };
      const onArm = v => share(arm, v) > .5;
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const A = idx[t] * 3, B = idx[t + 1] * 3, C = idx[t + 2] * 3; if (A === B) continue;   // degenerate (hidden)
        if (onArm(idx[t]) && onArm(idx[t + 1]) && onArm(idx[t + 2])) continue;
        let inside = false; for (const V of [A, B, C]) if (pos[V] > lo[0] && pos[V] < hi[0] && pos[V + 1] > lo[1] && pos[V + 1] < hi[1] && pos[V + 2] > lo[2] && pos[V + 2] < hi[2]) inside = true;
        if (!inside) continue;
        const edge = Math.max(Math.hypot(pos[A] - pos[B], pos[A + 1] - pos[B + 1], pos[A + 2] - pos[B + 2]), Math.hypot(pos[B] - pos[C], pos[B + 1] - pos[C + 1], pos[B + 2] - pos[C + 2]), Math.hypot(pos[C] - pos[A], pos[C + 1] - pos[A + 1], pos[C + 2] - pos[A + 2]));
        const k = Math.min(16, Math.max(1, Math.ceil(edge / .012))), upperArm = share(upper, idx[t]) > .5 ? 1 : 0;
        for (let i = 0; i <= k; i++) for (let j = 0; i + j <= k; j++) {
          const u = i / k, v = j / k, w = 1 - u - v, P = [], N = [];
          for (let a = 0; a < 3; a++) { P.push(pos[A + a] * w + pos[B + a] * u + pos[C + a] * v); N.push(nor[A + a] * w + nor[B + a] * u + nor[C + a] * v); }
          const l = Math.hypot(...N) || 1, id = sp.length / 3; sp.push(...P); sn.push(N[0] / l, N[1] / l, N[2] / l); sa.push(upperArm);
          const g = key(Math.floor(P[0] / cell), Math.floor(P[1] / cell), Math.floor(P[2] / cell)); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(id);
        }
      }
    }
    if (!sp.length) return extra;
    // the collar's points: collider points around the neck (from 8 cm below it to 15 cm above), in a coarse grid
    const ccell = .06, collar = new Map();
    for (let id = 0; id < sp.length / 3; id++) {
      const hq = heightOf(sp[id * 3], sp[id * 3 + 1], sp[id * 3 + 2]);
      if (sa[id] || hq < neckHeight - .08 || hq > neckHeight + .15) continue;
      const g = key(Math.floor(sp[id * 3] / ccell), Math.floor(sp[id * 3 + 1] / ccell), Math.floor(sp[id * 3 + 2] / ccell)); if (!collar.has(g)) collar.set(g, []); collar.get(g).push(id);
    }
    // push needed at a hair point (null if clear); hair only grazing a surface (less than `sink` into it,
    // which never shows) is left alone:
    //  - inside: out along the nearest collider normal, to the margin;
    //  - under a layer (front locks being bent only, `ring`): an outward-facing collider surface lies over
    //    the point along its own normal, within 4.5 cm, or 12 cm in front of the neck (hair between a cape,
    //    collar or collar flap and the shirt, where the nearest surface is the shirt), so out past that layer.
    //    Upper arms are left out here (hair may hang between the arm and the body), and only hair down
    //    to 10 cm below the neck (the collar), in the front half of the body, is tested this way.
    const push = (x, y, z, ring = false) => {
      // in front of the body, linings (surfaces facing the centre line, e.g. the inside of a collar) never push
      // hair inward; at the sides and back they count, so hair tucked under a cape stays tucked
      let ox = 0, oy = 0, oz = 0;
      { const rx = x - A[0], ry = y - A[1], rz = z - A[2], hh = rx * up[0] + ry * up[1] + rz * up[2]; ox = rx - hh * up[0]; oy = ry - hh * up[1]; oz = rz - hh * up[2]; const l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l; }
      const front = ring ? collarFwd : fwd;
      if (ox * front[0] + oy * front[1] + oz * front[2] <= .3) ox = oy = oz = 0;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); let best = -1, bd = reach * reach;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const id of grid.get(key(cx + a, cy + b, cz + c)) || []) {
        if (sn[id * 3] * ox + sn[id * 3 + 1] * oy + sn[id * 3 + 2] * oz < -.2) continue;
        const dx = x - sp[id * 3], dy = y - sp[id * 3 + 1], dz = z - sp[id * 3 + 2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = id; }
      }
      let out = null;
      if (best >= 0) {
        const s = (x - sp[best * 3]) * sn[best * 3] + (y - sp[best * 3 + 1]) * sn[best * 3 + 1] + (z - sp[best * 3 + 2]) * sn[best * 3 + 2];
        if (s < -sink) out = [sn[best * 3] * (margin - s), sn[best * 3 + 1] * (margin - s), sn[best * 3 + 2] * (margin - s)];
      }
      if (ring) {   // under a layer: front locks being bent only (swinging a chain out from under a cape makes stiff wings)
        const r = [x - A[0], y - A[1], z - A[2]], h = r[0] * up[0] + r[1] * up[1] + r[2] * up[2], o = [r[0] - h * up[0], r[1] - h * up[1], r[2] - h * up[2]], ol = Math.hypot(...o);
        if (ol > 1e-4 && h > neckHeight - .1) {   // the collar zone only: lifting a lock over a whole shoulder cape makes a stiff wing
          for (let a = 0; a < 3; a++) o[a] /= ol;
          const facing = o[0] * front[0] + o[1] * front[1] + o[2] * front[2];
          if (facing < 0) return out;   // front half only: long hair at the sides and back may tuck under a cape or collar
          // under a layer: an outward-facing surface (facing away from the centre line, and away from the
          // point's side of it) lies over the point along its own normal; the nearest such layer counts.
          // Within 4.5 cm (a collar flap beside a lock), or, for bent locks, 12 cm in front of the neck (a
          // lock passing inside a collar ring; a chain swung that far from the scalp makes a stiff wing),
          // checked against the collar's own points there
          let near = Infinity, dir = null;
          const over = id => {
            if (sa[id]) return;
            const qx = sp[id * 3], qy = sp[id * 3 + 1], qz = sp[id * 3 + 2], nx = sn[id * 3], ny = sn[id * 3 + 1], nz = sn[id * 3 + 2];
            if (nx * o[0] + ny * o[1] + nz * o[2] < .2) return;   // facing out on this side of the body
            const dx = qx - x, dy = qy - y, dz = qz - z, t = dx * nx + dy * ny + dz * nz;   // > 0: the point is behind it
            if (t <= sink || t >= near || t > (inCollar ? collarLayer : layer)) return;
            if (Math.hypot(dx - t * nx, dy - t * ny, dz - t * nz) > .012) return;
            const rx = qx - A[0], ry = qy - A[1], rz = qz - A[2], hq = rx * up[0] + ry * up[1] + rz * up[2];
            if ((rx - hq * up[0]) * nx + (ry - hq * up[1]) * ny + (rz - hq * up[2]) * nz <= 0) return;
            near = t; dir = [nx, ny, nz];
          };
          const inCollar = h > neckHeight - .1 && h < neckHeight + .16 && facing > .3;   // in front of the neck (lock bending only)
          if (inCollar) { const gx = Math.floor(x / ccell), gy = Math.floor(y / ccell), gz = Math.floor(z / ccell); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const id of collar.get(key(gx + a, gy + b, gz + c)) || []) over(id); }
          else { const R = Math.ceil(layer / cell); for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) for (const id of grid.get(key(cx + a, cy + b, cz + c)) || []) over(id); }
          const far = near;
          if (dir) { const m = far + margin; if (!out || m > Math.hypot(...out)) out = [dir[0] * m, dir[1] * m, dir[2] * m]; }
        }
      }
      return out;
    };
    // root bone first, then down each chain. A bone below one that turned first turns back to the direction
    // it hung in (so the lock bends over the layer and hangs down again, instead of the whole lock pivoting
    // at the scalp), then turns about its joint just enough to clear the hair it carries itself.
    const order = []; for (const r of roots) order.push(...subtree(r.path));
    const hung = new Map(order.map(p => [p, compute(p)]));
    const turn = (path, R) => {   // world rotation R (3x3 in a mat4) about the bone's joint, as a local post-multiplier
      const W = compute(path), j = [W[12], W[13], W[14]];
      const Rj = new Float32Array(R); Rj[12] = j[0] - (R[0] * j[0] + R[4] * j[1] + R[8] * j[2]); Rj[13] = j[1] - (R[1] * j[0] + R[5] * j[1] + R[9] * j[2]); Rj[14] = j[2] - (R[2] * j[0] + R[6] * j[1] + R[10] * j[2]);
      const X = mat4.mul(mat4.invert(W), mat4.mul(Rj, W));
      extra.set(path, extra.has(path) ? mat4.mul(extra.get(path), X) : X); compute = this.skeleton(tables, poseIndex, root, extra);
    };
    const rot = m => { const o = new Float32Array(16); for (let c = 0; c < 3; c++) { const l = Math.hypot(m[c * 4], m[c * 4 + 1], m[c * 4 + 2]) || 1; for (let r = 0; r < 3; r++) o[c * 4 + r] = m[c * 4 + r] / l; } o[15] = 1; return o; };
    const transpose3 = m => { const o = new Float32Array(16); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 4 + r] = m[r * 4 + c]; o[15] = 1; return o; };
    // settle: a bone below one that turned first turns back to the direction it hung in
    const settle = path => {
      if (!extra.size) return;
      const now = rot(compute(path)), then = rot(hung.get(path)), R = mat4.mul(then, transpose3(now));
      if (Math.abs(R[0] + R[5] + R[10] - 3) > 1e-4) turn(path, R);
    };
    // solve: swing `path` about its joint (no twist, at most maxTurn) to clear the hair on the bones in
    // `below`; undone when it cannot clear three quarters of it (half a fix only bends the lock oddly).
    // Returns false when it had hair to clear and was undone.
    const solve = async (path, below, keep = .25, limit = maxTurn) => {
      const saved = extra.get(path); let total = 0, first = null, depth = 0;
      for (let step = 0; step <= 8; step++) {
        const W = compute(path), j = [W[12], W[13], W[14]];
        let tx = 0, ty = 0, tz = 0, rr = 0, hits = 0, mx = 0, my = 0, mz = 0; depth = 0;
        for (const s of strands) {
          const ids = s.ids.filter(v => { let w = 0; for (let k = 0; k < 4; k++) if (below.has(s.part.bones[s.joints[v * 4 + k]])) w += s.weights[v * 4 + k]; return w >= .3; });
          if (!ids.length) continue;
          const { pos } = await this.skinned(hair, s.part, compute, ids);
          for (let i = 0; i < pos.length; i += 3) {
            const d = push(pos[i], pos[i + 1], pos[i + 2]); if (!d) continue;
            const r = [pos[i] - j[0], pos[i + 1] - j[1], pos[i + 2] - j[2]]; depth += Math.hypot(...d); mx += r[0]; my += r[1]; mz += r[2];
            tx += r[1] * d[2] - r[2] * d[1]; ty += r[2] * d[0] - r[0] * d[2]; tz += r[0] * d[1] - r[1] * d[0]; rr += r[0] * r[0] + r[1] * r[1] + r[2] * r[2]; hits++;
          }
        }
        if (first === null) first = depth;
        if (!hits || step === 8 || total >= limit) break;
        const ml = Math.hypot(mx, my, mz); if (ml > 1e-9) { const a = [mx / ml, my / ml, mz / ml], t = tx * a[0] + ty * a[1] + tz * a[2]; tx -= t * a[0]; ty -= t * a[1]; tz -= t * a[2]; }
        const len = Math.hypot(tx, ty, tz); if (len < 1e-9) break;
        const angle = Math.min(.15, limit - total, 1.5 * len / rr), ax = [tx / len, ty / len, tz / len], h = angle / 2, q = [ax[0] * Math.sin(h), ax[1] * Math.sin(h), ax[2] * Math.sin(h), Math.cos(h)];
        turn(path, mat4.trs([0, 0, 0], q)); total += angle;
      }
      const undo = !!first && depth > keep * first;
      if (this.hairDebug) this.hairDebug.push({ bone: name(path), for: [...below].map(name).join('+'), first: +(first || 0).toFixed(3), last: +depth.toFixed(3), turned: Math.round(total * 57.3), undone: undo });
      if (undo) { if (saved) extra.set(path, saved); else extra.delete(path); compute = this.skeleton(tables, poseIndex, root, extra); }
      return !undo;
    };
    const snapshot = () => new Map(extra), restore = m => { extra.clear(); for (const [k, v] of m) extra.set(k, v); compute = this.skeleton(tables, poseIndex, root, extra); };
    // total push still needed for the hair on `below` (optionally with another set of bone turns)
    const depthOf = async (below, state = null) => {
      const keepExtra = state ? snapshot() : null; if (state) restore(state);
      let total = 0;
      for (const s of strands) {
        const ids = s.ids.filter(v => { let w = 0; for (let k = 0; k < 4; k++) if (below.has(s.part.bones[s.joints[v * 4 + k]])) w += s.weights[v * 4 + k]; return w >= .3; });
        if (!ids.length) continue;
        const { pos } = await this.skinned(hair, s.part, compute, ids);
        for (let i = 0; i < pos.length; i += 3) { const d = push(pos[i], pos[i + 1], pos[i + 2]); if (d) total += Math.hypot(...d); }
      }
      if (keepExtra) restore(keepExtra);
      return total;
    };
    for (const path of order) {
      settle(path);
      if (await solve(path, new Set([path]))) continue;
      // its joint is already inside the layer (a lock entering a collar ring): the bone above swings the
      // whole lock from higher up instead, then this bone hangs from there and clears what is left
      // (at most 9 degrees: a bigger lift from the scalp makes a stiff wing of a long lock; kept only if
      // the two together clear three quarters of it)
      const parent = byPath.get(path)?.parent;
      if (!parent || !chainSet.has(parent)) continue;
      const before = snapshot();
      if (!(await solve(parent, new Set(subtree(path)), .6, .16) && await solve(path, new Set([path]), 1)) || (await depthOf(new Set(subtree(path)))) > .25 * (await depthOf(new Set(subtree(path)), before))) restore(before);
    }
    const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    // Shift each cross-section together around the contact, with the root and
    // the length below the collar anchored. This preserves the strand's width.
    const liftLock = (points, heights) => {
      const covered = points.map((p, i) => heights[i] >= neckHeight - .10 ? push(...p, true) : null);
      const contact = covered.flatMap((d, i) => d ? [{ i, depth: Math.min(.04, Math.hypot(...d)) }] : []);
      if (contact.length < 3) return null;
      const lowest = contact.reduce((a, b) => heights[a.i] < heights[b.i] ? a : b).i;
      // Preserve locks that end tucked inside the collar. Only lift a lock that
      // emerges again directly below the obstruction.
      const emerges = points.some((p, i) => {
        const h = heights[i] - heights[lowest];
        return h < -.025 && Math.hypot(...p.map((v, a) => v - points[lowest][a] - up[a] * h)) < .1 && !push(...p, true);
      });
      if (!emerges) return null;

      const total = contact.reduce((sum, c) => sum + c.depth, 0);
      const centre = contact.reduce((sum, c) => sum + heights[c.i] * c.depth, 0) / total;
      const lower = Math.max(Math.min(...heights), centre - .16);
      const upper = Math.min(neckHeight + lockTop, centre + .12);
      if (upper - lower < .09) return null;
      const peak = Math.max(lower + .045, Math.min(upper - .045, centre));
      const fade = heights.map(h => smooth((h - lower) / (peak - lower)) * smooth((upper - h) / (upper - peak)));
      const normalize = v => v.map(x => x / (Math.hypot(...v) || 1));
      const outward = normalize(up.map((_, a) => covered.reduce((sum, d) => sum + (d?.[a] || 0), 0)));
      // Alongside the surface normals, try away from the torso. The nearest
      // normal on the folded edge of a lapel can point along the wrong side.
      const radial = normalize(up.map((v, a) => contact.reduce((sum, { i, depth }) =>
        sum + depth * (points[i][a] - A[a] - heights[i] * v), 0)));
      const directions = [up, normalize(up.map((v, a) => .45 * v + outward[a])),
        normalize(up.map((v, a) => .15 * v + outward[a] + .5 * collarFwd[a])),
        normalize(up.map((v, a) => .2 * v + radial[a] + .5 * collarFwd[a]))];
      // Compare the same points before and after, including the fades, so new
      // intersections count against the improvement.
      const active = points.map((p, i) => ({ p, i })).filter(({ i }) => fade[i] > .001);
      active.sort((a, b) => heights[a.i] - heights[b.i]);
      const stride = Math.ceil(active.length / 80);
      const sample = active.filter((_, i) => i % stride === 0);
      const cost = (vertices, lift) => vertices.reduce((sum, { p, i }) => {
        const point = lift ? p.map((v, a) => v + lift[a] * fade[i]) : p;
        const d = push(...point, true);
        return sum + (d ? Math.min(Math.hypot(...d), .04) : 0);
      }, 0);
      const baseline = cost(sample);
      if (!baseline) return null;
      let lift = null, best = baseline;
      const deepest = Math.max(...contact.map(({ i }) => Math.hypot(...covered[i])));
      const maxLift = Math.min(.085, .9 * Math.min(peak - lower, upper - peak), .008 + 1.5 * deepest);
      for (const direction of directions) {
        for (const fraction of [.2, .4, .6, .8, 1]) {
          const shift = direction.map(x => x * maxLift * fraction);
          const score = cost(sample, shift) + baseline * fraction * .12;
          if (score < best) { best = score; lift = shift; }
        }
      }
      if (!lift || best > baseline * .80) return null;
      const before = cost(active), after = cost(active, lift);
      if (this.hairDebug) this.hairDebug.push({ lock: points.length, maxOffset: Math.hypot(...lift), baseline: before, score: after });
      return after <= before * .80 ? fade.map(f => lift.map(x => x * f)) : null;
    };
    // Fragrant Tresses over the Forest Secrets collar. Fit the middle of the
    // left front lock and taper back to the hair above and below the collar.
    const thinking = poseName === 'think_loop';
    const forestCollar = hair.gender === 'female' && hair.id === 1002 && (poseName === 'normal' || thinking)
      && colliders.some(item => item.slot === 'outfit' && item.id === 832 && item.gender === 'female');
    extra.locks = new Map();
    for (const { part, ids, inst } of locks) {
      const { pos: base } = await this.skinned(hair, part, compute, ids);
      const points = ids.map((_, i) => Array.from(base.subarray(i * 3, i * 3 + 3)));
      // Vertex 511 identifies this lock in this revision of the shared hair mesh.
      // Shift each cross-section left and forward in world metres for this pose.
      const deltas = forestCollar && part.mesh.endsWith('_62234e315d68.bin') && ids.includes(511)
        ? points.map(([, y]) => {
          const h = y - N0[1];
          if (thinking) {
            // The tilted head puts the upper part of the lock inside the lapel.
            const shoulder = smooth((.155 - h) / .113) * smooth((h + .06) / .102);
            const chest = smooth((.045 - h) / .085) * smooth((h + .115) / .075);
            const clearance = smooth((.155 - h) / .12) * smooth((h + .13) / .165);
            return [-.041 * shoulder + .018 * chest, .014 * clearance, .098 * clearance];
          }
          return [
            -.048 * smooth((.145 - h) / .12) * smooth((h + .15) / .122),
            .010 * smooth((.145 - h) / .13) * smooth((h + .15) / .10),
            .091 * smooth((.145 - h) / .17) * smooth((h + .15) / .085),
          ];
        })
        : liftLock(points, points.map(p => heightOf(...p)));
      if (!deltas) continue;
      // back to bind space: linear blend skinning is linear in the position
      const { buffer } = await this.mesh(part.mesh), L = inst.layout, joints = new Uint16Array(buffer, L.joints, inst.vertexCount * 4), weights = new Float32Array(buffer, L.weights, inst.vertexCount * 4), bind = inst.meshInfo.bindposes;
      const mats = part.bones.map((path, b) => path ? mat4.mul(compute(path), bind.slice(b * 16, b * 16 + 16)) : bind.slice(b * 16, b * 16 + 16));
      const outIdx = [], outDelta = [];
      ids.forEach((v, i) => {
        const d = deltas[i]; if (Math.hypot(...d) < 2e-4) return;
        const m = new Float32Array(16); for (let j = 0; j < 4; j++) { const w = weights[v * 4 + j]; if (!w) continue; const M = mats[joints[v * 4 + j]]; for (let e = 0; e < 16; e++) m[e] += M[e] * w; }
        const inv = mat4.invert(m); outIdx.push(v); for (let a = 0; a < 3; a++) outDelta.push(inv[a] * d[0] + inv[4 + a] * d[1] + inv[8 + a] * d[2]);
      });
      if (!outIdx.length) continue;
      if (!extra.locks.has(part)) extra.locks.set(part, { idx: [], delta: [] });
      const into = extra.locks.get(part); into.idx.push(...outIdx); into.delta.push(...outDelta);
    }
    return extra;
  }
  // Layers: the outfit and face lie under the cloak, and all of them under the back item (the order the
  // capture wardrobe's clothing fit used); a tail passes through the cloak as modelled. Unity draws
  // whatever pokes through; here a vertex of an inner layer that lies outside an outer layer, on the
  // line from the skeleton out through it, is pulled back to `margin` under that layer: fully when it
  // is up to `full` outside, fading out by `reach` (a deeper part is the inner item's own shape, such
  // as a wing). Outer layers are their opaque triangles; effect and glass passes do not count.
  // Returns a Map of part -> bind-space offsets (setOffsets).
  async layerFit(chosen, tables, compute, margin = .004, full = .05, reach = .08) {
    const out = new Map(); out.moved = 0;
    const rank = { outfit: 0, face: 0, cloak: 1, back: 2 };
    const back = chosen.find(i => i.slot === 'back'), backName = this.catalog.genders[this.gender].back?.find(r => r.id === back?.id)?.name || '';
    const tail = back && (PELVIS_TAILS.has(back.id) || /\btail\b/i.test(backName));
    const outerOf = inner => chosen.filter(o => rank[o.slot] > rank[inner.slot] && !(tail && o === back && inner.slot === 'cloak'));
    if (!chosen.some(i => rank[i.slot] > 0)) return out;
    // skeleton segments (parent to child, Bip001 bones without fingers and twists): the ray's origin
    const bip = tables[0].filter(b => /^Bip001 /.test(b.path.split('/').pop()) && !/Finger|Twist/.test(b.path.split('/').pop()));
    const bipSet = new Set(bip.map(b => b.path)), at = p => compute(p).slice(12, 15);
    // arms stay in front (as the capture wardrobe kept them): no pull on the forearm and hand, nor on
    // the upper arm past its first third (a pauldron or puffed sleeve at the shoulder still goes under)
    const limb = path => { const n = path.split('/').pop(); return /Forearm|Hand/.test(n) ? 0 : /UpperArm/.test(n) ? .35 : 1; };
    const segs = bip.filter(b => bipSet.has(b.parent)).map(b => [at(b.parent), at(b.path), limb(b.parent)]);
    if (!segs.length) return out;
    const origin = (x, y, z) => {
      let best = Infinity, O = null;
      for (const [a, b, keep] of segs) {
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        const t = l2 ? Math.min(1, Math.max(0, ((x - a[0]) * d[0] + (y - a[1]) * d[1] + (z - a[2]) * d[2]) / l2)) : 0;
        const q = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], e = (x - q[0]) ** 2 + (y - q[1]) ** 2 + (z - q[2]) ** 2;
        if (e < best) { best = e; O = t <= keep ? q : null; }
      }
      return O;   // null: an arm, left as it is
    };
    // outer surfaces: triangles in a grid (each in every cell its box, grown by half a cell, touches)
    const cell = .04, key = (x, y, z) => x + ',' + y + ',' + z, surfaces = new Map();
    const surface = async item => {
      if (surfaces.has(item)) return surfaces.get(item);
      const tri = [], grid = new Map();
      for (const part of item.parts) {
        const { pos, inst } = await this.skinned(item, part, compute), idx = inst.indices, seen = new Set();
        inst.meshInfo.submeshes.forEach((sub, s) => {
          const m = item.materials[part.materials[s]], r = sub.indexOffset + ':' + sub.indexCount;
          if (!m || m.renderType === 'Transparent' || m.shader === 'Standard' || seen.has(r)) return; seen.add(r);
          for (let t = sub.indexOffset; t + 2 < sub.indexOffset + sub.indexCount; t += 3) {
            const A = idx[t] * 3, B = idx[t + 1] * 3, C = idx[t + 2] * 3; if (A === B) continue;
            const id = tri.length / 9; tri.push(pos[A], pos[A + 1], pos[A + 2], pos[B], pos[B + 1], pos[B + 2], pos[C], pos[C + 1], pos[C + 2]);
            const lo = [0, 1, 2].map(a => Math.floor((Math.min(pos[A + a], pos[B + a], pos[C + a]) - cell / 2) / cell));
            const hi = [0, 1, 2].map(a => Math.floor((Math.max(pos[A + a], pos[B + a], pos[C + a]) + cell / 2) / cell));
            for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = key(x, y, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id); }
          }
        });
      }
      const s = { tri: new Float32Array(tri), grid, stamp: new Uint32Array(tri.length / 9), mark: 0 };
      surfaces.set(item, s); return s;
    };
    // nearest hit (fraction of O->P) of the segment's last `reach` with a surface, or Infinity
    const hit = (s, O, P, len) => {
      const D = [P[0] - O[0], P[1] - O[1], P[2] - O[2]], from = Math.max(0, 1 - (reach + margin) / len), steps = Math.ceil((1 - from) * len / (cell / 2));
      let best = Infinity; s.mark++;
      for (let i = 0; i <= steps; i++) {
        const f = from + (1 - from) * i / steps, k = key(Math.floor((O[0] + D[0] * f) / cell), Math.floor((O[1] + D[1] * f) / cell), Math.floor((O[2] + D[2] * f) / cell));
        for (const id of s.grid.get(k) || []) {
          if (s.stamp[id] === s.mark) continue; s.stamp[id] = s.mark;
          const T = s.tri, o = id * 9, e1 = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]], e2 = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]];
          const p = [D[1] * e2[2] - D[2] * e2[1], D[2] * e2[0] - D[0] * e2[2], D[0] * e2[1] - D[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
          if (Math.abs(det) < 1e-12) continue;
          const tv = [O[0] - T[o], O[1] - T[o + 1], O[2] - T[o + 2]], u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) / det; if (u < 0 || u > 1) continue;
          const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (D[0] * q[0] + D[1] * q[1] + D[2] * q[2]) / det; if (v < 0 || u + v > 1) continue;
          const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; if (t >= from && t <= 1 && t < best) best = t;
        }
      }
      return best;
    };
    for (const inner of chosen) {
      if (!(inner.slot in rank)) continue;
      const outers = outerOf(inner); if (!outers.length) continue;
      const shells = await Promise.all(outers.map(surface)); if (!shells.some(s => s.tri.length)) continue;
      for (const part of inner.parts) {
        const { pos, inst, joints, weights } = await this.skinned(inner, part, compute), n = inst.vertexCount;
        const bind = inst.meshInfo.bindposes, mats = part.skinned ? part.bones.map((path, b) => path ? mat4.mul(compute(path), bind.slice(b * 16, b * 16 + 16)) : bind.slice(b * 16, b * 16 + 16)) : [compute(part.path)];
        const idx = [], delta = [];
        for (let v = 0; v < n; v++) {
          const P = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], O = origin(...P); if (!O) continue;
          const len = Math.hypot(P[0] - O[0], P[1] - O[1], P[2] - O[2]); if (len < .01) continue;
          let t = Infinity; for (const s of shells) t = Math.min(t, hit(s, O, P, len));
          if (t === Infinity) continue;
          const depth = (1 - t) * len, w = depth <= full ? 1 : Math.max(0, (reach - depth) / (reach - full)); if (!w) continue;
          const k = -(depth + margin) * w / len, d = [(P[0] - O[0]) * k, (P[1] - O[1]) * k, (P[2] - O[2]) * k];
          const m = new Float32Array(16);
          if (part.skinned) for (let j = 0; j < 4; j++) { const wj = weights[v * 4 + j]; if (!wj) continue; const M = mats[joints[v * 4 + j]]; for (let e = 0; e < 16; e++) m[e] += M[e] * wj; }
          else m.set(mats[0]);
          const inv = mat4.invert(m); idx.push(v); for (let a = 0; a < 3; a++) delta.push(inv[a] * d[0] + inv[4 + a] * d[1] + inv[8 + a] * d[2]);
        }
        if (idx.length) { out.set(part, { idx, delta }); out.moved += idx.length; }
      }
    }
    return out;
  }
  // Other gender's outfit (experimental): the head's place on the body. Every face of a gender carries the
  // same Head bone (8.1 cm above the neck for female, 11.2 cm for male, with that gender's head motion); the
  // outfit's body takes its own gender's, as its own faces would. A head whose chin hangs further below its
  // joint (male 3.0 cm, female 0.3 cm) is raised by the difference, so the chin sits where that body's poses
  // put a hand to it (Thinking, Wow); neckJoin then stretches the neck down to the body.
  async bodyHead(body, face) {
    this.bodyHeads ||= new Map();
    const key = body + ':' + face.gender + ':' + face.id;
    if (!this.bodyHeads.has(key)) this.bodyHeads.set(key, (async () => {
      const ref = await this.item(this.catalog.genders[body].face.find(r => r.file && !r.error).file);
      const bone = ref.bones.find(b => /(^|\/)Bip001 Head$/.test(b.path)); if (!bone) return [];
      const worn = await this.chin(face), own = await this.chin(ref), raise = worn && own ? worn.drop - own.drop : 0;
      if (!(raise > 1e-3)) return [bone];
      const lift = worn.up.map(x => x * raise), rotate = (q, v) => { const [x, y, z, w] = q, t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
        return [v[0] + w * t[0] + y * t[2] - z * t[1], v[1] + w * t[1] + z * t[0] - x * t[2], v[2] + w * t[2] + x * t[1] - y * t[0]]; };
      const moved = (p, q) => { const d = rotate(q, lift); return [p[0] + d[0], p[1] + d[1], p[2] + d[2]]; };   // in the head's own frame
      const poses = bone.poses ? Array.from(bone.poses) : null;
      if (poses) for (let o = 0; o + 10 <= poses.length; o += 10) poses.splice(o, 3, ...moved(poses.slice(o, o + 3), poses.slice(o + 3, o + 7)));
      return [{ ...bone, p: moved(bone.p, bone.r), poses }];
    })());
    return this.bodyHeads.get(key);
  }
  // How far a head's chin hangs below its Head joint (mesh space, z up), and the head's own up axis.
  async chin(face) {
    const part = face.parts.find(p => p.skinned && p.bones.some(b => /(^|\/)Bip001 Head$/.test(b || ''))); if (!part) return null;
    part.chinData ||= (async () => {
      const { w, pos } = await this.neckWeights(face, part), info = face.meshes.find(m => m.file === part.mesh);
      const h = part.bones.findIndex(b => /(^|\/)Bip001 Head$/.test(b || '')), bind = info.bindposes.slice(h * 16, h * 16 + 16), joint = mat4.invert(bind);
      let low = Infinity; for (let v = 0; v < w.length; v++) if (w[v] < .3 && Math.abs(pos[v * 3]) < .006) low = Math.min(low, pos[v * 3 + 2]);   // the chin, on the centre line
      const up = [bind[8], bind[9], bind[10]], l = Math.hypot(...up) || 1;
      return low < Infinity ? { drop: joint[14] - low, up: up.map(x => x / l) } : null;
    })();
    return part.chinData;
  }
  // Per vertex: its weight on Bip001 Neck, and the mesh's raw arrays (no GPU upload: also used for faces not worn).
  async neckWeights(item, part) {
    part.neckData ||= (async () => {
      const meshInfo = item.meshes.find(m => m.file === part.mesh), L = meshInfo.layout, { buffer } = await this.mesh(part.mesh), n = L.vertexCount;
      const joints = new Uint16Array(buffer, L.joints, n * 4), weights = new Float32Array(buffer, L.weights, n * 4), w = new Float32Array(n);
      if (part.skinned) for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) if (/(^|\/)Bip001 Neck$/.test(part.bones[joints[v * 4 + k]] || '')) w[v] += weights[v * 4 + k];
      return { w, pos: new Float32Array(buffer, L.positions, n * 3) };
    })();
    return part.neckData;
  }
  // The head mesh ends in a ring held by the neck alone (every face of a gender has the same one), shaped for its
  // own gender's neck; outfits meet that ring. Move the worn head's ring onto the ring a head of the outfit's
  // gender would have, angle by angle around the neck, and the rest of the head's neck by the same amount times
  // its neck weight (the rig's own blend into the head). Returns Map part -> bind-space offsets (setOffsets).
  async neckJoin(face, body, compute) {
    const out = new Map(), bone = (part, n) => part.bones.find(p => p && p.split('/').pop() === n);
    const headPart = item => item.parts.find(p => p.skinned && bone(p, 'Bip001 Neck') && bone(p, 'Bip001 Head'));
    const ref = await this.item(this.catalog.genders[body].face.find(r => r.file && !r.error).file), rpart = headPart(ref);
    const fpart = headPart(face); if (!fpart || !rpart) return out;
    const { w } = await this.neckWeights(face, fpart), ring = [], region = [];
    for (let v = 0; v < w.length; v++) { if (w[v] > .99) ring.push(v); if (w[v] > .01) region.push(v); }
    // the outfit gender's ring, on the neck alone: neck * bindpose * position
    const rdata = await this.neckWeights(ref, rpart), rinfo = ref.meshes.find(m => m.file === rpart.mesh), target = [];
    const rn = rpart.bones.indexOf(bone(rpart, 'Bip001 Neck')), RM = mat4.mul(compute(rpart.bones[rn]), rinfo.bindposes.slice(rn * 16, rn * 16 + 16));
    for (let v = 0; v < rdata.w.length; v++) if (rdata.w[v] > .99) { const p = rdata.pos.subarray(v * 3, v * 3 + 3); target.push([0, 1, 2].map(a => RM[a] * p[0] + RM[4 + a] * p[1] + RM[8 + a] * p[2] + RM[12 + a])); }
    if (ring.length < 6 || target.length < 6) return out;
    const N = compute(bone(fpart, 'Bip001 Neck')).slice(12, 15), H = compute(bone(fpart, 'Bip001 Head')).slice(12, 15);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], unit = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
    const axis = unit(sub(H, N)), e1 = unit(cross(axis, Math.abs(axis[0]) < .9 ? [1, 0, 0] : [0, 0, 1])), e2 = cross(axis, e1);
    // a ring as points sorted by angle around its centre; at(angle) interpolates between neighbours
    const loop = points => {
      const c = [0, 1, 2].map(a => points.reduce((s, p) => s + p[a], 0) / points.length);
      const sorted = points.map(p => { const d = sub(p, c); return { t: Math.atan2(dot(d, e2), dot(d, e1)), p }; }).sort((a, b) => a.t - b.t);
      return { c, at: t => {
        let j = sorted.findIndex(s => s.t >= t); if (j < 0) j = 0;
        const b = sorted[j], a = sorted[(j - 1 + sorted.length) % sorted.length];
        let span = b.t - a.t, k = t - a.t; if (span <= 0) span += 2 * Math.PI; if (k < 0) k += 2 * Math.PI;
        const f = span > 1e-6 ? Math.min(1, k / span) : 0; return a.p.map((x, i) => x + (b.p[i] - x) * f);
      } };
    };
    const points = (pos, n) => Array.from({ length: n }, (_, i) => Array.from(pos.subarray(i * 3, i * 3 + 3)));
    const headRing = loop(points((await this.skinned(face, fpart, compute, ring)).pos, ring.length)), bodyRing = loop(target);
    const { pos, inst, joints, weights } = await this.skinned(face, fpart, compute, region), bind = inst.meshInfo.bindposes;
    const mats = fpart.bones.map((path, b) => path ? mat4.mul(compute(path), bind.slice(b * 16, b * 16 + 16)) : bind.slice(b * 16, b * 16 + 16));
    const idx = [], delta = [];
    region.forEach((v, i) => {
      const d = sub(pos.subarray(i * 3, i * 3 + 3), headRing.c), t = Math.atan2(dot(d, e2), dot(d, e1));
      const move = sub(bodyRing.at(t), headRing.at(t)).map(x => x * Math.min(1, w[v]));
      const m = new Float32Array(16); for (let j = 0; j < 4; j++) { const wj = weights[v * 4 + j]; if (!wj) continue; const M = mats[joints[v * 4 + j]]; for (let e = 0; e < 16; e++) m[e] += M[e] * wj; }
      const inv = mat4.invert(m); idx.push(v); for (let a = 0; a < 3; a++) delta.push(inv[a] * move[0] + inv[4 + a] * move[1] + inv[8 + a] * move[2]);
    });
    out.set(fpart, { idx, delta });
    return out;
  }
  // Bind-space vertex offsets on a part (hair locks bent over a collar); null puts it back as exported.
  setOffsets(inst, offsets) {
    if (inst.offsets === offsets || (!inst.offsets && !offsets)) return;
    inst.pos.set(inst.restPos);
    if (offsets) offsets.idx.forEach((v, i) => { for (let a = 0; a < 3; a++) inst.pos[v * 3 + a] += offsets.delta[i * 3 + a]; });
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, inst.posBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.pos); inst.offsets = offsets;
  }
  // World matrices on the shared skeleton. Each bone's local transform is the value Unity's
  // Animator produced for this pose: base bones from the selected outfit, grafted bones from
  // the item that brought them (outfit first, as the assembler merges parts onto its skeleton).
  skeleton(boneTables, poseIndex, root, extra = null) {
    const owner = new Map(); for (const table of boneTables) for (const b of table) if (!owner.has(b.path)) owner.set(b.path, b);
    const world = new Map();
    const compute = path => {
      if (world.has(path)) return world.get(path);
      const b = owner.get(path); if (!b) throw new Error('Unknown bone ' + path);
      const o = poseIndex * 10, v = b.poses;
      let local = v ? composeTRS(v.slice(o, o + 3), v.slice(o + 3, o + 7), v.slice(o + 7, o + 10)) : composeTRS(b.p, b.r, b.s);
      if (extra?.has(path)) local = mat4.mul(local, extra.get(path));   // hair collision (hairCollision)
      const m = mat4.mul(b.parent ? compute(b.parent) : root, local); world.set(path, m); return m;
    };
    return compute;
  }
  wowLegFit(outfit, poseIndex, standingIndex, fit = WOW_LEG_FIT[outfit.id]) {
    const result = new Map();
    if (!fit || standingIndex < 0) return result;
    const [side, ...weights] = fit;
    const names = ['Thigh', 'Calf', 'Foot', 'Toe0'];
    for (const bone of outfit.bones) {
      const index = names.findIndex(name => bone.path.endsWith('/Bip001 ' + side + ' ' + name));
      if (index < 0 || !weights[index] || !bone.poses) continue;
      const from = bone.poses.slice(poseIndex * 10 + 3, poseIndex * 10 + 7);
      const to = bone.poses.slice(standingIndex * 10 + 3, standingIndex * 10 + 7);
      const sign = from.reduce((dot, x, i) => dot + x * to[i], 0) < 0 ? -1 : 1;
      const weight = weights[index];
      const blend = from.map((x, i) => x * (1 - weight) + sign * to[i] * weight);
      const length = Math.hypot(...blend);
      const original = composeTRS([0, 0, 0], from, [1, 1, 1]);
      const corrected = composeTRS([0, 0, 0], blend.map(x => x / length), [1, 1, 1]);
      result.set(bone.path, mat4.mul(mat4.invert(original), corrected));
    }
    return result;
  }
  async select(selection, poseName) {
    // `selection.outfitGender`: wear that gender's version of the outfit (experimental). The outfit brings
    // its body, skeleton and motion; leg fills, repairs and the Wow trim belong to that version.
    const g = this.gender, slots = this.catalog.genders[g], files = [];
    for (const slot of MESH_SLOTS) {
      const id = selection[slot]; if (!id) continue;
      const list = slot === 'outfit' && selection.outfitGender ? this.catalog.genders[selection.outfitGender].outfit : slots[slot];
      const row = list.find(r => r.id === id); if (!row?.file || row.error) continue;
      files.push(row.file);
    }
    const chosen = await Promise.all(files.map(file => this.item(file)));
    this.prefetchParts(chosen.flatMap(item => item.parts.map(part => ({ item, part }))), selection);
    const outfit = chosen.find(i => i.slot === 'outfit'), body = outfit?.gender || g;
    const poses = (await this.posesOf(body)).poses, poseIndex = Math.max(0, poses.findIndex(p => p.name === poseName)), root = new Float32Array(poses[poseIndex].root);
    // Leg fill (build_fill.py): Default's legs where this outfit models none, only in the poses where the gap shows;
    // hand-fitted legs (blender/legfit_save.py) in every pose. Loaded on demand before any repair outfit renders.
    const legFill = outfit && this.needsLegFill(body, outfit.id) ? await this.ensureLegFill() : this.legFill;
    const entry = outfit && this.fillLegs !== false ? legFill?.outfits?.[body]?.[outfit.id] : null;
    const fillPose = entry?.hand?.replaceLegFill ? null : entry?.hand || entry?.poses?.[poseName] || null;
    const [fillItem, repair] = await Promise.all([fillPose ? this.item(legFill.base[body]) : null, entry ? this.repairItem(body, outfit.id, entry.hand) : null]);
    if (repair) this.prefetchParts(repair.parts.map(part => ({ item: repair, part })), selection);
    const bootsId = fillItem ? (this.bootDonor?.[outfit.id] ?? entry.boots) : null;
    const bootsTex = bootsId ? (this.bootTex?.[outfit.id] !== undefined ? this.bootTex[outfit.id] : this.bootDonor?.[outfit.id] ? null : entry.bootsTex) : null;
    const boots = bootsId ? await this.bootParts(body, bootsId, bootsTex) : null;
    // the other gender's outfit: the head goes where that body's own head would (bodyHead), then neckJoin
    const face = chosen.find(i => i.slot === 'face'), crossBody = !!(outfit && face && face.gender !== body);
    const head = crossBody ? await this.bodyHead(body, face) : [];
    const tables = [outfit?.bones || [], head, ...chosen.filter(i => i !== outfit).map(i => i.bones), ...(fillItem ? [fillItem.bones] : []), ...(boots ? [boots.item.bones] : []), ...(repair ? [repair.bones] : [])];
    const adjustments = outfit && body === 'female' && poseName === 'wow' && this.wowFit !== false
      ? this.wowLegFit(outfit, poseIndex, poses.findIndex(p => p.name === 'standing')) : new Map();
    const fittedLeg = adjustments.size > 0;
    let hairMoved = 0, hairLocks = null;
    const hairItem = chosen.find(i => i.slot === 'hair');
    if (hairItem && this.hairCollide !== false) {
      const extra = await this.hairCollision(hairItem, chosen.filter(i => ['outfit', 'cloak', 'back'].includes(i.slot)), tables, poseIndex, root, poses[poseIndex].name);
      for (const [path, transform] of extra) adjustments.set(path, transform);
      hairMoved = extra.size;
      hairLocks = extra.locks || null; if (hairLocks?.size) hairMoved += hairLocks.size;
    }
    const compute = this.skeleton(tables, poseIndex, root, adjustments);
    const layers = this.layerFitOn !== false ? await this.layerFit(chosen, tables, compute) : new Map();
    if (crossBody) for (const [part, join] of await this.neckJoin(face, body, compute)) {   // offsets add up per vertex (setOffsets)
      const had = layers.get(part); layers.set(part, had ? { idx: [...had.idx, ...join.idx], delta: [...had.delta, ...join.delta] } : join);
    }
    const entries = chosen.flatMap(item => item.parts.map(part => ({ item, part })));
    if (repair) entries.push(...repair.parts.map(part => ({ item: repair, part })));
    if (boots) entries.unshift(...boots.parts.map(part => ({ item: boots.item, part })));
    if (fillItem) entries.unshift({ item: fillItem, part: this.fillPart(body, outfit.id, fillItem, fillPose, entry.fit || null, entry.inset ?? .005, !!boots) });   // first: the outfit wins where they touch
    const active = [];
    for (const { item, part } of entries) {
      const inst = await this.gpuPart(item, part);
      if (part.fill && !inst.fillCount) { if (part.booted) part.drop = await this.lowerMask(inst, part); this.applyFill(inst, part.fill, part); }
      if (part.boots && !inst.bootSubs) await this.applyBoots(inst, part);
      if (!part.fill && !part.boots) this.setOffsets(inst, (item === hairItem ? hairLocks?.get(part) : layers.get(part)) || null);
      const object = compute(part.path), inv = mat4.invert(object), skin = new Float32Array(inst.boneCount * 16);
      if (part.skinned) part.bones.forEach((path, b) => { const bind = inst.meshInfo.bindposes.slice(b * 16, b * 16 + 16); skin.set(path ? mat4.mul(inv, mat4.mul(compute(path), bind)) : bind, b * 16); });
      else skin.set(mat4.mul(inv, object));
      const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, inst.boneTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, inst.boneCount * 4, 1, gl.RGBA, gl.FLOAT, skin);
      const subs = part.fill ? [{ indexOffset: 0, indexCount: inst.fillCount, material: 0 }] : part.boots ? inst.bootSubs : inst.meshInfo.submeshes;
      const submeshes = []; for (let s = 0; s < subs.length; s++) {
        const sub = subs[s];
        let mat = part.materials[s] >= 0 ? await this.resolveMaterial(item, part.materials[s], selection, item.slot === 'face', groupOf(part.path)) : null;
        submeshes.push({ ...sub, mat });
      }
      // Extra material passes (same index range as an earlier submesh): an opaque one goes first, so
      // the submesh's own material wins at equal depth, as Unity's opaque ordering shows (cloak 19).
      const range = o => o.indexOffset + ':' + o.indexCount, seen = new Set(), early = new Map();
      for (const sub of submeshes) {
        if (seen.has(range(sub)) && sub.mat?.renderType === 'Opaque' && sub.mat.queue < 2500) { if (!early.has(range(sub))) early.set(range(sub), []); early.get(range(sub)).push(sub); }
        seen.add(range(sub));
      }
      if (early.size) {
        const moved = new Set([...early.values()].flat()), placed = new Set(), ordered = [];
        for (const sub of submeshes) { if (moved.has(sub)) continue; if (!placed.has(range(sub))) { ordered.push(...(early.get(range(sub)) || [])); placed.add(range(sub)); } ordered.push(sub); }
        submeshes.splice(0, submeshes.length, ...ordered);
      }
      // Transparent sort key: center of sampled skinned vertices (Unity sorts by bounds center).
      const { buffer } = await this.mesh(part.mesh), joints = new Uint16Array(buffer, inst.layout.joints, inst.vertexCount * 4);
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < inst.vertexCount; i += Math.max(1, Math.floor(inst.vertexCount / 96))) {
        const j = part.skinned ? joints[i * 4] : 0, m = mat4.mul(object, skin.subarray(j * 16, j * 16 + 16)), v = inst.pos.subarray(i * 3, i * 3 + 3);
        for (let a = 0; a < 3; a++) { const w = m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a]; lo[a] = Math.min(lo[a], w); hi[a] = Math.max(hi[a], w); }
      }
      active.push({ ...inst, item, path: part.path, object, submeshes, state: { visible: true, overrides: [] }, center: lo.map((v, a) => (v + hi[a]) / 2), layout: inst.layout });
    }
    this.active = active; this.pose = poseName; this.selection = selection; this.filled = !!(fillItem || repair); this.hairMoved = hairMoved; this.fittedLeg = fittedLeg; this.layersMoved = layers.moved || 0;
    const faceHead = face?.bones.find(b => b.path.split('/').pop() === 'Bip001 Head');
    this.headTransform = faceHead ? compute(faceHead.path) : null;
    await this.releaseUnused(entries);
    this.evictTextures(matchMedia('(pointer:coarse)').matches ? 64e6 : 128e6);
    return active;
  }
  // Fitted copies own independent GPU buffers. Drop geometry outside the current look.
  async releaseUnused(entries) {
    const activeParts = new Set(entries.map(entry => entry.part));
    const activeItems = new Set(entries.map(entry => entry.item));
    const activeMeshes = new Set(entries.map(entry => entry.part.mesh));
    const gl = this.gl;
    for (const [part, inst] of this.instances) {
      if (activeParts.has(part)) continue;
      for (const buffer of inst.gpu.buffers) gl.deleteBuffer(buffer);
      gl.deleteVertexArray(inst.gpu.vao);
      gl.deleteTexture(inst.boneTex);
      this.instances.delete(part);
      part.instance = null;
    }
    for (const [key, promise] of this.items) if (!activeItems.has(await promise)) this.items.delete(key);
    for (const key of this.meshes.keys()) if (!activeMeshes.has(key)) this.meshes.delete(key);
    for (const [key, part] of this.fillParts) if (!activeParts.has(part)) this.fillParts.delete(key);
    for (const [key, promise] of this.repairItems) if (!activeItems.has(await promise)) this.repairItems.delete(key);
    for (const [key, promise] of this.bootCache || []) if (!activeItems.has((await promise)?.item)) this.bootCache.delete(key);
    const activeMaterials = new Set(this.active.flatMap(part => part.submeshes.map(sub => sub.mat)));
    for (const [key, promise] of this.resolvedMaterials) if (!activeMaterials.has(await promise)) this.resolvedMaterials.delete(key);
    this.bodyHeads?.clear();
  }
  // Keep GPU texture memory bounded: drop textures the current look does not use once the
  // loaded total passes the budget (bytes on the GPU: compressed textures count a quarter of RGBA8) (they reload from the HTTP cache if selected again).
  evictTextures(budgetBytes = 384e6) {
    if ((this.textureGpuBytes || 0) <= budgetBytes) return;
    const used = new Set(); for (const p of this.active) for (const sub of p.submeshes) for (const v of Object.values(sub.mat?.values || {})) if (v?.texture) used.add(v.texture);
    const gl = this.gl;
    for (const [name, promise] of this.textureCache) promise.then(tex => {
      if (!tex || used.has(tex) || !this.textureCache.has(name)) return;
      this.textureCache.delete(name); this.texturePixels -= this.textureSizes.get(tex) || 0; this.textureSizes.delete(tex); this.textureGpuBytes -= this.textureBytes?.get(tex) || 0; this.textureBytes?.delete(tex); gl.deleteTexture(tex);
    });
    for (const [key, promise] of this.resolvedMaterials) promise.then(m => {
      if (Object.values(m.values).some(v => v?.texture && !used.has(v.texture))) this.resolvedMaterials.delete(key);
    });
  }
  matchingReference(selection, poseName, yaw) {
    if (selection.outfitGender && selection.outfitGender !== this.gender) return null;   // Unity never rendered these
    const same = r => r.female === (this.gender === 'female') && r.pose === poseName && Math.round(r.yaw) === yaw && !r.error &&
      LOOK_SLOTS.every(k => (r.recipe[k] || 0) === (selection[k] || 0));
    return this.validation.references.find(same);
  }
}
window.FullWardrobe = FullWardrobe;

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
// Reader codes and shared wardrobe vocabulary come from avatar_creator/locale.js.
const StudioLocale = (() => {
  const rows = `
3D Beta|3D 测试版|3D ベータ|3D 베타
2D version|2D 版|2D版|2D 버전
Start a new 2D look|新建 2D 造型|新しい2Dスタイルを作る|새 2D 외형 만들기
Retry|重试|再試行|다시 시도
3D preview unavailable|3D 预览不可用|3Dプレビューを利用できません|3D 미리보기를 사용할 수 없습니다
Graphics context lost. Recovering preview…|图形连接已中断，正在恢复预览…|描画が中断されました。復旧中…|그래픽 연결이 끊어져 미리보기를 복구하는 중입니다…
Could not load the selected look|无法加载所选造型|選んだスタイルを読み込めません|선택한 외형을 불러올 수 없습니다
This item or preset is unavailable|此外观或预设不可用|このアイテムまたはプリセットは利用できません|이 아이템 또는 프리셋을 사용할 수 없습니다
Could not save this look|无法保存造型|スタイルを保存できません|외형을 저장할 수 없습니다
This look exceeds the portrait-pack size limit.|造型超过肖像包大小限制。|肖像パックの容量を超えています。|초상화 팩의 크기 제한을 초과했습니다.
Drag to rotate · right-drag up or down to pan · scroll to zoom|拖动旋转 · 按住右键上下拖动平移 · 滚动缩放|ドラッグで回転・右ドラッグで上下移動・スクロールでズーム|드래그로 회전 · 오른쪽 버튼으로 위아래 이동 · 스크롤로 확대/축소
3D character preview|3D 角色预览|3Dキャラクタープレビュー|3D 캐릭터 미리보기
Character preview|角色预览|キャラクタープレビュー|캐릭터 미리보기
Gender|性别|性別|성별
View|视图|表示|보기
Pose|姿势|ポーズ|포즈
Categories|分类|カテゴリー|분류
Turntable|自动旋转|自動回転|자동 회전
Back to categories|返回分类|カテゴリーに戻る|분류로 돌아가기
Version|款式|バージョン|버전
Experimental|实验性|試験機能|실험 기능
Light follows view|光照随视角旋转|視点に光を追従|시점에 맞춰 조명 회전
Fill hidden legs|补全隐藏的腿部|隠れた脚を補完|가려진 다리 보완
Hair collision|发型防穿模|髪の干渉を補正|머리카락 겹침 보정
Keep layers apart|防止衣物重叠|衣装の重なりを補正|옷 겹침 보정
Wow leg fit|艳羡姿势腿部修正|いいなぁポーズの脚補正|부러움 포즈 다리 보정
Dark|深色|暗色|어둡게
Transparent|透明|透明|투명
Other gender's outfits|另一性别的服装|別の性別の衣装|다른 성별 의상
The outfit version determines the body and poses.|服装款式决定体型和姿势。|衣装のバージョンで体型とポーズが決まります。|의상 버전에 따라 체형과 포즈가 결정됩니다.
Original|原始|オリジナル|기본
Loading…|加载中…|読み込み中…|불러오는 중…
3D uses capture lighting.|3D 使用拍摄光照。|3Dでは撮影時の照明を使います。|3D에서는 촬영 조명을 사용합니다.
`;
  for (const line of rows.trim().split('\n')) {
    const [key, cn, jp, kr] = line.split('|');
    WardrobeLocale.messages[key] = {cn, jp, kr};
  }
  return WardrobeLocale;
})();

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
/* Private reader editor. The reader owns the saved pack and the selected appearance. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const embedded = window.parent !== window && params.get('embed') === 'reader';
  const slots = {outfit:'Outfits', hair:'Hair', face:'Face', skin:'Skin', eyes:'Eyes', head:'Headwear',
    mask:'Masks', cloak:'Cloaks', back:'Back & tails', beard:'Beards', makeup:'Makeup', bodypaint:'Body paint', bodyshape:'Body shape'};
  // Browsing tabs: Hero headgear shares the head slot but has a tab of its own, as in the game.
  const categories = Object.fromEntries(Wardrobe.browseCategories(Object.entries(slots).map(([id,label]) => ({id,name:label}))).map(row => [row.id,row.name]));
  const poses = {normal:'Hand on Hip', standing:'Standing', think_loop:'Thinking', angry_loop:'Rage',
    helpless:'Helpless', wow:'Wow', shy:'Shy', confident:'Confident', delighted:'Delighted'};
  const controls = {light:'lightFollows', legs:'fillLegs', hairfix:'hairCollide', layerfit:'layerFitOn', wowfit:'wowFit'};
  const required = new Set(['outfit','hair','face','skin','eyes']);
  // The 3D library, and the 2D catalogue it shares names and colour icons with.
  const library3d = Wardrobe.libraryBase('wardrobe_3d_base','data/'), library2d = Wardrobe.libraryBase('wardrobe_2d_base','../avatar_creator/data/');
  let language = StudioLocale.language(params.get('lang'));
  const tr = (text, values) => StudioLocale.text(text, language, values);
  const sort = $('sort-combined');
  const readyFilter = $('ready-only');
  Wardrobe.setupSortMenu(sort,embedded);
  const fitItemNames = StudioLocale.bindItemTypography($('items'), embedded ? parent.document.documentElement : null);
  $('bgs').classList.add('background-choices');
  for(const entry of WardrobeBackgrounds.entries){
    const button=document.createElement('button');button.type='button';button.dataset.bg=entry.id;button.textContent=entry.label;
    button.setAttribute('aria-pressed','false');$('bgs').append(button);
  }
  for(const button of $('bgs').children)WardrobeBackgrounds.decorate(button,button.dataset.bg);
  const staticLabels = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue.trim() && !node.parentElement.closest('script')) staticLabels.push([node, node.nodeValue.trim()]);
  }
  const attributes = [];
  for (const el of document.querySelectorAll('[aria-label],[placeholder]')) {
    for (const attr of ['aria-label','placeholder']) if (el.hasAttribute(attr)) attributes.push([el, attr, el.getAttribute(attr)]);
  }
  let renderer, catalog, metadata, seed, session, hasClassic = false;
  let catalogueItems;
  let revision = 0, committed = -1, queue = Promise.resolve(), saving = false, lost = false, closed = false;
  let category = 'outfit', query = '', spin = 0, frame = 0, message = '', detail = '';
  let gender, ids, view, presentation;
  let failureKey = '', failureDetail = '';
  const send = (type, data = {}) => { if (embedded) parent.postMessage({type,sessionId:session,...data}, location.origin); };
  function initializeLook(value = {}) {
    gender = value.gender === 'male' ? 'male' : 'female';
    const recipe = value.recipe || {};
    const preset = metadata?.presets.find(row => row.id === recipe.sourcePreset && row.gender === gender);
    if (recipe.sourcePreset && !preset && !recipe.avatarIds?.outfit) {
      ids = view = null;
      throw Error(recipe.sourcePreset);
    }
    ids = {outfit:2, hair:28, face:gender === 'female' ? 57 : 1, skin:48, eyes:52};
    const selected = recipe.avatarIds?.outfit ? recipe.avatarIds : preset?.recipe || {};
    for (const slot of Object.keys(slots)) ids[slot] = selected[slot] ?? ids[slot] ?? 0;
    presentation = recipe.presentation;
    view = {version:1, outfitGender:gender, pose:'normal', background:'dark', yaw:0, zoom:1, pan:[0,0], cross:false,
      fillLegs:true, hairCollide:presentation?.hairFit !== false, layerFitOn:presentation?.clothingFit !== false,
      wowFit:true, lightFollows:false, ...structuredClone(recipe.wardrobe3d || {}), assetRevision:metadata?.revision};
    if(!['dark','white','clear'].includes(view.background) && !WardrobeBackgrounds.find(view.background))view.background='dark';
    view.pan = [0, view.pan[1]];
  }
  function rows(slot) { return catalog.genders[slot === 'outfit' ? view.outfitGender : gender][slot]; }
  const slotOf = (id = category) => Wardrobe.categorySlot(id);
  const previewReady = (row,slot) => renderer.canPreviewItem(row,slot,slot === 'outfit' ? view.outfitGender : gender);
  // Headwear and Hero headgear split the head slot by the catalogue's game type.
  function categoryRows(id = category) {
    const slot = slotOf(id);
    return slot === 'head' ? rows(slot).filter(row => (Wardrobe.itemCategory(catalogueItems?.get(row.id)) || 'head') === id) : rows(slot);
  }
  function browseRows(slot) {
    const exported = categoryRows();
    if (readyFilter?.checked !== false) return exported.filter(row => previewReady(row,slot));
    const result = exported.slice(), known = new Set(exported.map(row => row.id));
    const itemGender = slot === 'outfit' ? view.outfitGender : gender;
    for (const item of catalogueItems?.values() || []) {
      if (Wardrobe.itemCategory(item) !== category || known.has(item.id)) continue;
      result.push({id:item.id, name:StudioLocale.label(item,itemGender,language), icon:item.genders[itemGender]?.icon, catalogueOnly:true});
    }
    return result;
  }
  async function loadMetadata() {
    const read = async file => {
      const response = await fetch(new URL('../' + file, library3d));
      if (!response.ok) throw Error(file + ' (' + response.status + ')');
      return response.json();
    };
    // Existing releases and already-open editors keep using the legacy address.
    return read('metadata-v2.json').catch(() => read('metadata.json'));
  }
  function name(row, slot) {
    if (!row) return tr(slot === 'bodyshape' ? 'Original' : 'None');
    const entry = metadata.names[row.id];
    const names = entry?.[slot === 'outfit' ? view.outfitGender : gender] || entry?.all;
    return names?.[language] || row.name;
  }
  let catalogueDetailsManifest = null, catalogueDetailsRequest = null;
  function ensureItemDetails() {
    if (!catalogueDetailsManifest || catalogueDetailsRequest || !catalogueItems) return;
    catalogueDetailsRequest = fetch(new URL(catalogueDetailsManifest, library2d))
      .then(res => {
        if (!res.ok) throw Error(catalogueDetailsManifest + ' (' + res.status + ')');
        return res.json();
      })
      .then(details => {
        if (!catalogueItems) return;
        Wardrobe.mergeCatalogueDetails(catalogueItems, details);
        showItemDetail();
      })
      .catch(() => { catalogueDetailsRequest = null; });
  }
  function showItemDetail() {
    const item = ids && view && catalog && catalogueItems?.get(ids[slotOf()]);
    const panel = $('item-detail');
    panel.hidden = !item || Wardrobe.itemCategory(item) !== category;
    if (panel.hidden) return;
    if (item.detailsPending) ensureItemDetails();
    const itemGender = category === 'outfit' ? view.outfitGender : gender;
    const {title, description} = Wardrobe.itemDetailContent(item, itemGender, language, StudioLocale);
    if ($('detail-name').textContent !== title) $('detail-name').textContent = title;
    if ($('detail-description').textContent !== description) $('detail-description').textContent = description;
  }
  async function loadItemDetails() {
    // Both editors share the slim core catalogue; descriptions arrive on demand.
    try {
      let response = await fetch(new URL('catalogue-core.json', library2d));
      if (!response.ok) response = await fetch(new URL('catalogue.json', library2d));
      if (!response.ok) return;
      const data = Wardrobe.expandCatalogue(await response.json());
      catalogueDetailsManifest = data.detailsManifest || null;
      catalogueItems = new Map(data.items.map(item => [item.id, item]));
      refresh();
    } catch (error) {
      console.warn('Wardrobe descriptions unavailable', error);
    }
  }
  function button(label, active, action) {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('aria-pressed', String(active));
    b.onclick = action;
    return b;
  }
  function notify(key = '', value = '') {
    message = key; detail = value;
    $('reader-save-status').textContent = key ? tr(key) + (value ? ' · ' + value : '') : '';
  }
  function poseLabel(pose) {
    if (view.outfitGender === 'male' && pose === 'shy') return tr('Dignified');
    if (view.outfitGender === 'male' && pose === 'confident') return tr('Contemplative');
    return tr(poses[pose]);
  }
  const poseRow=$('poses');
  function fitPoseSpacing(){
    const buttons=Array.from(poseRow.children);
    if(!buttons.length || !poseRow.clientWidth || !matchMedia('(min-width:761px)').matches)return;
    const style=getComputedStyle(buttons[0]);
    const padding=parseFloat(style.paddingInlineStart)+parseFloat(style.paddingInlineEnd);
    const labels=buttons.reduce((width,button)=>width+button.getBoundingClientRect().width-padding,0);
    const gaps=(buttons.length-1)*parseFloat(getComputedStyle(poseRow).columnGap);
    const available=(poseRow.clientWidth-labels-gaps)/(2*buttons.length);
    poseRow.style.setProperty('--pose-padding',Math.max(2,Math.min(10,Math.floor(available)))+'px');
  }
  new ResizeObserver(fitPoseSpacing).observe(poseRow);
  document.fonts?.addEventListener('loadingdone',fitPoseSpacing);
  function drawSwatches(variants) {
    const palette = $('color-options');
    palette.replaceChildren();
    palette.hidden = !variants || variants.length < 2;
    if (palette.hidden) return;
    const swatches = document.createElement('div');
    swatches.className = 'color-swatches';
    const caption = document.createElement('span');
    caption.className = 'color-caption';
    for (const row of variants) {
      const item = catalogueItems.get(row.id);
      const label = [name(row,slotOf()),item.colorName].filter(Boolean).join(' · ');
      const active = row.id === ids[slotOf()];
      if (active) caption.textContent = label;
      const swatch = button('',active,()=>chooseItem(row.id));
      warmOnHover(swatch,row);
      swatch.className = 'color-swatch';
      swatch.dataset.avatarId = row.id;
      swatch.title = label;
      swatch.setAttribute('aria-label',label);
      swatch.disabled = !previewReady(row,slotOf());
      if (item.colorIcon || row.icon) {
        const img = new Image();
        img.alt = '';
        img.src = new URL(item.colorIcon || row.icon, item.colorIcon || row.catalogueOnly ? library2d : library3d).href;
        swatch.append(img);
      } else if (item.swatch) swatch.style.backgroundColor = item.swatch;
      swatches.append(swatch);
    }
    palette.append(caption,swatches);
  }
  function chooseItem(id) {
    if (id === ids[slotOf()]) return;
    ids[slotOf()] = id;
    update();
  }
  // Resting on a card or swatch starts that item's downloads, so the click mostly draws.
  let hoverTimer = 0;
  function warmItem(row) {
    clearTimeout(hoverTimer);
    if (!row.file || !renderer?.catalog || lost || closed || !previewReady(row,slotOf())) return;
    const selection = {...ids, [slotOf()]: row.id, outfitGender: view.outfitGender};
    hoverTimer = setTimeout(() => renderer.prefetchItem(row.file, selection), 150);
  }
  function warmOnHover(element, row) {
    element.onpointerenter = element.onfocus = () => warmItem(row);
    element.onpointerleave = () => clearTimeout(hoverTimer);
  }
  function itemCard(row, colors) {
    const label = name(row.id ? row : null,slotOf());
    const card = button('',ids[slotOf()] === row.id,()=>chooseItem(row.id));
    card.className = 'item-card'; card.dataset.avatarId = row.id;
    warmOnHover(card,row);
    card.disabled = !!row.id && !previewReady(row,slotOf());
    if (card.disabled) card.title = tr('3D preview unavailable');
    const art = document.createElement('span');
    art.className = 'item-art';
    if (row.icon) {
      const img = new Image(); img.alt=''; img.loading='lazy'; img.decoding='async';
      img.src=new URL(row.icon, row.catalogueOnly ? library2d : library3d).href; art.append(img);
    } else {
      art.classList.add('fallback-icon'); art.textContent = category==='skin'?'●':'◇';
    }
    if (colors > 1) {
      const count = document.createElement('span');
      count.className='color-count'; count.textContent=colors; art.append(count);
    }
    const title = document.createElement('span');
    title.className='item-name'; title.textContent=label;
    card.append(art,title);
    return card;
  }
  function drawCatalogue() {
    const grid = $('items'), scrollTop = grid.scrollTop;
    const focused = document.activeElement;
    const focusParent = focused?.closest('#items,#color-options');
    const families = new Map();
    const slot = slotOf();
    for (const row of browseRows(slot)) {
      const item = catalogueItems?.get(row.id);
      const key = Wardrobe.familyKey(item || row);
      if (!families.has(key)) families.set(key,[]);
      families.get(key).push(row);
    }
    const groups = [];
    let selectedVariants;
    for (const variants of families.values()) {
      variants.sort((a,b)=>(catalogueItems?.get(a.id)?.order || 0)-(catalogueItems?.get(b.id)?.order || 0) || a.id-b.id);
      const selected = variants.find(row=>row.id===ids[slot]);
      if (selected) selectedVariants = variants;
      const matches = query ? variants.filter(row=>[name(row,slot), row.name, row.id, catalogueItems?.get(row.id)?.colorName].join(' ').toLocaleLowerCase().includes(query)) : variants;
      if (!matches.length) continue;
      const primary = matches.includes(selected) ? selected : matches.find(row=>previewReady(row,slot)) || matches[0];
      groups.push({primary,colors:variants.length,sortName:name(matches[0],slot),sortId:Math.min(...matches.map(row=>row.id)),
        pinned:matches.some(row=>Wardrobe.isBasicOutfit(catalogueItems?.get(row.id)))});
    }
    const [field, order] = sort.value.split(':');
    Wardrobe.sortRows(groups,field,order==='desc'?-1:1,language);
    const cards = groups.map(group=>itemCard(group.primary,group.colors));
    if (!required.has(slot) && !query) cards.unshift(itemCard({id:0},0));
    grid.replaceChildren(...cards);
    $('count').textContent = tr('{n} items',{n:groups.length});
    $('no-items').hidden = cards.length > 0;
    drawSwatches(selectedVariants);
    fitItemNames();
    grid.scrollTop = scrollTop;
    if (focusParent && focused.dataset.avatarId) {
      focusParent.querySelector('[data-avatar-id="'+focused.dataset.avatarId+'"]')?.focus({preventScroll:true});
    }
  }
  function refresh() {
    document.documentElement.lang = Wardrobe.documentLang(language);
    for (const [node, key] of staticLabels) node.nodeValue = tr(key);
    for (const [el, attr, key] of attributes) el.setAttribute(attr,tr(key));
    $('classic').hidden = !hasClassic;
    $('classic').textContent = tr('2D version');
    $('classic').title = tr(seed?.recipe?.wardrobe3d ? 'Start a new 2D look' : '2D version');
    $('reader-use').disabled = !session || !renderer || lost || saving || committed !== revision;
    $('classic').disabled = saving;
    document.querySelector('.workspace').inert = saving || lost || !catalog || !view;
    $('reader-look-name').disabled = saving;
    notify(message,detail);
    $('status').textContent = failureKey ? tr(failureKey) + (failureDetail ? ' · ' + failureDetail : '') : '';
    showItemDetail();
    if (!catalog || !view || !ids) return;
    $('look-title').textContent = name(rows('outfit').find(row => row.id === ids.outfit),'outfit');
    $('genders').replaceChildren(...['female','male'].map(g => button(tr(g === 'male' ? 'Male':'Female'), gender === g, () => {
      if (gender === g) return;
      initializeLook({gender:g}); update();
    })));
    const categoryScroll = $('categories').scrollLeft;
    $('categories').replaceChildren(...Object.entries(categories).map(([id,label]) => {
      const slot = slotOf(id);
      const b = button(tr(label), id === category, () => {
        category = id; $('wardrobe').dataset.level = 'items'; $('items').scrollTop = 0; refresh();
      });
      b.dataset.category = id;
      b.setAttribute('aria-current', String(id === category));
      // A head item from the other headwear tab leaves this one blank rather than "None".
      const picked = categoryRows(id).find(item=>item.id===ids[slot]);
      const pick = document.createElement('span'); pick.className = 'category-pick'; pick.textContent = picked || !ids[slot] ? name(picked,slot) : '';
      b.append(pick); return b;
    }));
    $('categories').scrollLeft = categoryScroll;
    $('catTitle').textContent = tr(categories[category]);
    drawCatalogue();
    const available = renderer?.posesByGender[view.outfitGender]?.poses || [];
    Wardrobe.replacePoseButtons(poseRow,Object.keys(poses).filter(id=>available.some(p=>p.name===id)).map(id=>{
      const pose=button(poseLabel(id),view.pose===id,()=>{view.pose=id;update();});
      pose.dataset.pose=id;
      return pose;
    }));
    fitPoseSpacing();
    $('cut').hidden = !view.cross || category !== 'outfit';
    for(const b of $('cut').querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.g === view.outfitGender));
    for(const [id,key] of Object.entries(controls)) $(id).setAttribute('aria-pressed',String(view[key]));
    $('wowfit').hidden = view.outfitGender !== 'female' || view.pose !== 'wow' || !WOW_LEG_FIT[ids.outfit];
    $('cross').setAttribute('aria-pressed', String(view.cross));
    $('stage').dataset.bg = view.background;
    WardrobeBackgrounds.apply($('stage'),view.background);
    for (const b of $('bgs').querySelectorAll('[data-bg]')) b.setAttribute('aria-pressed',String(b.dataset.bg===view.background));
  }
  function camera() {
    renderer.yaw = view.yaw; renderer.zoom = view.zoom; renderer.pan = [...view.pan];
    renderer.lightFollows = view.lightFollows;
  }
  function showFailure(key, error) {
    $('busy').hidden = true;
    failureKey=key; failureDetail=error?.message || '';
    $('status').textContent = tr(key) + (failureDetail ? ' · ' + failureDetail : '');
    $('retry').hidden = false;
  }
  function draw() {
    if (!renderer || lost || closed || saving || committed !== revision) return;
    camera(); renderPreview();
    $('angle').textContent = Math.round(view.yaw) + '°';
  }
  function renderPreview() {
    const canvas = $('view'), width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const maxSide = matchMedia('(pointer:coarse)').matches ? 960 : 1536;
    const scale = Math.min(devicePixelRatio || 1, 2, maxSide / Math.max(width, height));
    renderer.render(false, {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    });
  }
  function scheduleDraw() {
    if (!frame) frame=requestAnimationFrame(()=>{frame=0;try{draw();}catch(error){committed=-1;showFailure('3D preview unavailable',error);refresh();}});
  }
  function stopSpin() { cancelAnimationFrame(spin); spin=0; $('spin').setAttribute('aria-pressed','false'); }
  function update() {
    const current = ++revision;
    committed=-1; refresh();
    if (!renderer || !catalog || closed || lost) return queue;
    const selection={...ids, outfitGender:view.outfitGender}, character=gender, settings=structuredClone(view);
    failureKey=''; failureDetail=''; $('busy').hidden=false; $('status').textContent=''; $('retry').hidden=true;
    queue=queue.then(async()=>{
      if (current!==revision || lost || closed) return;
      for (const slot of Object.keys(slots)) {
        const id=selection[slot];
        if ((id || required.has(slot)) && !rows(slot).some(row=>row.id===id && previewReady(row,slot)))
          throw Error(tr('This item or preset is unavailable')+' · '+tr(slots[slot])+' #'+id);
      }
      await renderer.useGender(character,settings.outfitGender);
      if (current!==revision || lost || closed) return;
      if (!renderer.posesByGender[settings.outfitGender].poses.some(p=>p.name===settings.pose)) throw Error(settings.pose);
      for (const key of Object.values(controls)) renderer[key]=settings[key];
      await renderer.select(selection,settings.pose);
      if (current!==revision || lost || closed) return;
      committed=current; draw(); $('busy').hidden=true; refresh();
    }).catch(error=>{
      if (current!==revision || closed || lost) return;
      committed=-1; showFailure('Could not load the selected look',error);refresh();
    });
    return queue;
  }
  const snapshot = () => ({gender, name:$('reader-look-name').value, recipe:{
    avatarIds:{...ids}, ...(presentation ? {presentation:{...presentation}} : {}), wardrobe3d:structuredClone(view)}});
  function applySeed() {
    stopSpin(); saving=false; notify(); $('reader-look-name').value=seed?.name || '';
    try {
      initializeLook(seed);
      if (['rim','bloom','grade'].some(key => presentation?.[key] === false) && !seed?.recipe?.wardrobe3d) notify('3D uses capture lighting.');
      return update();
    } catch(error){++revision;committed=-1;showFailure('This item or preset is unavailable',error);refresh();}
  }
  let bootGeneration=0;
  async function boot(restore = false) {
    const generation=++bootGeneration;
    const preservedSeedSession=session;
    const preserved=restore && metadata && ids && view && view.assetRevision ? snapshot() : null;
    lost=true; ++revision; committed=-1; saving=false; stopSpin(); refresh();
    await queue;
    if (closed || generation!==bootGeneration) return;
    const old=$('view'), canvas=old.cloneNode(false);
    old.replaceWith(canvas);
    renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
    renderer=null; catalog=null;
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault(); if (canvas!==$('view') || closed) return;
      lost=true; ++revision; committed=-1;saving=false;stopSpin();
      showFailure('Graphics context lost. Recovering preview…');refresh();
    });
    canvas.addEventListener('webglcontextrestored',()=>{if (canvas===$('view') && !closed) boot(true);});
    try {
      renderer=new FullWardrobe(canvas);
      const opening=renderer.openCatalog(library3d.href);
      // The opening look's body is known already, so its poses needn't wait for the catalogue.
      if(gender) for(const body of new Set([gender,view?.outfitGender||gender])) renderer.posesOf(body).catch(()=>{});
      const result=await Promise.all([opening,loadMetadata()]);
      if(closed || canvas!==$('view') || generation!==bootGeneration || renderer.gl.isContextLost()) return;
      [catalog,metadata]=result; renderer.setLegFillOutfits(metadata.legFillOutfits); lost=false;
      if(preserved && preservedSeedSession===session) {
        initializeLook(preserved); $('reader-look-name').value=preserved.name; await update();
      } else await applySeed();
    } catch(error){if(!closed && generation===bootGeneration){lost=true;showFailure('3D preview unavailable',error);refresh();}}
  }
  $('classic').onclick=()=>{
    const originalGender = seed?.gender === 'female' ? 'female' : 'male';
    const classicSeed=seed?.recipe?.wardrobe3d ? {gender:originalGender,recipe:{sourcePreset:'player_'+originalGender+'_default1'}} : seed;
    send('tea-wardrobe-switch',{editor:'2d',seed:classicSeed});
  };
  $('retry').onclick=()=>boot(true);
  window.addEventListener('message',event=>{
    if(!embedded || event.source!==parent || event.origin!==location.origin) return;
    const msg=event.data || {};
    if(msg.type==='tea-wardrobe-init' || msg.type==='tea-wardrobe-language') {
      language=StudioLocale.language(msg.language);
      if(msg.type==='tea-wardrobe-init') reportExpanded(setExpanded(msg.expanded===true));
      if(msg.type==='tea-wardrobe-init' && session!==msg.sessionId) {
        session=msg.sessionId; seed=msg.seed || {}; hasClassic=!!msg.hasClassic;
        if(catalog && !lost) applySeed();
      }
      refresh(); return;
    }
    if(msg.sessionId!==session || !saving) return;
    if(msg.type==='tea-wardrobe-saved' || msg.type==='tea-wardrobe-error'){
      saving=false;
      notify(msg.type==='tea-wardrobe-saved'?'Look saved and applied. You can keep editing.':'Could not save this look',msg.message || '');
      refresh();scheduleDraw();
    }
  });
  function portraitFrame() {
    const head=renderer.headTransform;
    if(!head) return {focusX:.5,focusYTop:.24,zoom:4};
    const camera=renderer.camera(), projected=mat4.mul(mat4.mul(camera.proj,camera.view),head);
    const unit=n=>Math.max(0,Math.min(1,n));
    return {focusX:unit(.5+projected[12]/2),focusYTop:unit(.5-projected[13]/2-.02),zoom:5};
  }
  function capture() {
    const {width,height}=renderer.render(false), bytes=renderer.pixels();
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'), image=ctx.createImageData(width,height), stride=width*4;
    for(let y=0;y<height;y++)image.data.set(bytes.subarray((height-y-1)*stride,(height-y)*stride),y*stride);
    ctx.putImageData(image,0,0);return canvas;
  }
  $('reader-use').onclick=()=>{
    if(!session || saving || lost || committed!==revision) return;
    const current=revision, savingSession=session, look=snapshot(), r=renderer;
    const valid=()=>current===revision && !closed && !lost && savingSession===session;
    saving=true;stopSpin();refresh();
    queue=queue.then(async()=>{
      const pack={schema:'afk.reader.portrait-pack',version:1,gender:look.gender,
        displayName:look.name.trim() || name(rows('outfit').find(row=>row.id===ids.outfit),'outfit'),recipe:look.recipe,poses:{}};
      const selection={...look.recipe.avatarIds,outfitGender:look.recipe.wardrobe3d.outfitGender};
      const available=r.posesByGender[selection.outfitGender].poses;
      let size=0;
      try {
        r.yaw=0;r.pan=[0,0];r.zoom=1;
        for(const pose of Object.keys(poses).filter(id=>available.some(p=>p.name===id))) {
          if(!valid())return;
          notify(tr('Preparing {pose}…',{pose:poseLabel(pose)}));
          await r.select(selection,pose);
          if(!valid())return;
          const canvas=capture();const framing=portraitFrame();
          const choiceFraming={...framing,focusYTop:Math.min(1,framing.focusYTop+.045),zoom:4};
          const png=canvas.toDataURL('image/png');size+=png.length;
          if(!png.startsWith('data:image/png;base64,') || png.length>22+4*Math.ceil(4*1024*1024/3) || size>24*1024*1024)
            throw Error(tr('This look exceeds the portrait-pack size limit.'));
          pack.poses[pose]={png,framing,choiceFraming};
          canvas.width=canvas.height=1;
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        if(!pack.poses.normal) throw Error('normal');
        pack.framing=pack.poses.normal.framing;
        const source=JSON.stringify(pack);
        if(new Blob([source]).size>24*1024*1024) throw Error(tr('This look exceeds the portrait-pack size limit.'));
        if(valid()){await r.select(selection,view.pose);camera();renderPreview();}
        if(valid()){notify('Saving look…');send('tea-wardrobe-apply',{pack:source});}
      } catch(error) {
        if(valid()){saving=false;notify('Could not save this look',error.message);update();}
      }
    });
  };
  window.addEventListener('pagehide',()=>{
    closed=true;++revision;stopSpin();cancelAnimationFrame(frame);
    renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
  for(const [id,key] of Object.entries(controls)) $(id).onclick=()=>{view[key]=!view[key];update();};
  for(const b of $('cut').querySelectorAll('button')) b.onclick=()=>{view.outfitGender=b.dataset.g;update();};
  $('cross').onclick=()=>{view.cross=!view.cross;if(!view.cross)view.outfitGender=gender;update();};
  sort.onchange = () => { $('items').scrollTop=0; if (catalog && view) drawCatalogue(); };
  Wardrobe.bindHorizontalWheel($('categories'),matchMedia('(min-width:761px)'));
  Wardrobe.placeItemDetail($('item-detail'),$('stage'),matchMedia('(max-width:760px)'));
  // Phones can hide the reader's bars and the look-name row; the stage keeps the way back.
  const reportExpanded = expanded => send('tea-wardrobe-expand',{expanded});
  const setExpanded = Wardrobe.bindExpand($('expand'),matchMedia('(max-width:760px)'),reportExpanded);
  Wardrobe.bindPreviewFullscreen($('stage'),open=>send('tea-wardrobe-inspect',{open}));
  Wardrobe.bindHorizontalWheel(poseRow);
  $('search').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase();$('items').scrollTop=0;refresh();};
  readyFilter?.addEventListener('change',()=>{$('items').scrollTop=0;refresh();});
  $('backCat').onclick=()=>{$('wardrobe').dataset.level='categories';};
  Wardrobe.bindOptionsPanel($('wardrobe'),$('optionsBtn'),$('closeOptions'));
  function setView(yaw, zoom=1, panY=0) {
    view.yaw=((yaw%360)+360)%360;view.zoom=Math.min(4,Math.max(1,zoom));
    const size=renderer.cam0.size, limit=size*(1-1/view.zoom);
    view.pan=[0,Math.max(-limit,Math.min(limit,panY))];
    scheduleDraw();
  }
  $('front').onclick=()=>setView(0);$('back').onclick=()=>setView(180);
  $('reset').onclick=()=>{const previous=view;initializeLook({gender});view={...previous,outfitGender:gender};update();};
  $('random').onclick=()=>{
    view.outfitGender=view.cross && Math.random()<.5 ? (gender==='male'?'female':'male') : gender;
    for(const slot of Object.keys(slots)){
      const choices=rows(slot).filter(row=>previewReady(row,slot) && !row.empty);
      ids[slot]=choices.length && (required.has(slot) || Math.random()<.5) ? choices[Math.floor(Math.random()*choices.length)].id : 0;
    }
    update();
  };
  $('spin').onclick=()=>{
    if(spin){stopSpin();return;}
    let last=performance.now();$('spin').setAttribute('aria-pressed','true');
    const tick=t=>{view.yaw=(view.yaw+(t-last)*.03)%360;last=t;scheduleDraw();spin=requestAnimationFrame(tick);};
    spin=requestAnimationFrame(tick);
  };
  for(const b of $('bgs').querySelectorAll('[data-bg]')) b.onclick=()=>{view.background=b.dataset.bg;refresh();};
  $('savePng').onclick=async()=>{
    if(lost || saving || revision!==committed)return;
    const background=view.background;camera();const portrait=capture(), c=document.createElement('canvas');c.width=portrait.width;c.height=portrait.height;
    saving=true;refresh();
    try{
      const ctx=c.getContext('2d');await WardrobeBackgrounds.paint(ctx,background,c.width,c.height);
      ctx.drawImage(portrait,0,0);const a=document.createElement('a');a.download='merlin-'+gender+'-'+view.pose+'.png';a.href=c.toDataURL('image/png');a.click();
    }catch(error){showFailure('Could not save this look',error);}
    finally{saving=false;refresh();scheduleDraw();}
  };
  const stage=$('stage'), pointers=new Map();
  new ResizeObserver(scheduleDraw).observe(stage);
  const centroid=()=>{
    const points=[...pointers.values()], [a,b]=points;
    return {x:b?(a.x+b.x)/2:a.x,y:b?(a.y+b.y)/2:a.y,d:b?Math.hypot(a.x-b.x,a.y-b.y):0};
  };
  stage.oncontextmenu=e=>e.preventDefault();
  stage.onpointerdown=e=>{
    if(e.target.closest('button') || !renderer?.cam0)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove=e=>{
    if(!pointers.has(e.pointerId) || !renderer?.cam0 || saving || lost)return;
    const before=centroid();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const after=centroid();
    const dx=after.x-before.x, dy=after.y-before.y;
    const rect=$('view').getBoundingClientRect(), scale=2*renderer.cam0.size/(view.zoom*rect.height);
    const panning=e.shiftKey || (e.buttons & 6) || pointers.size>1;
    const yaw=panning ? view.yaw : view.yaw-dx*.6;
    const zoom=view.zoom*(before.d && after.d ? after.d/before.d : 1);
    setView(yaw,zoom,view.pan[1]+dy*scale);
  };
  stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=e=>pointers.delete(e.pointerId);
  stage.ondblclick=()=>{if(renderer?.cam0)setView(view.yaw);};
  stage.addEventListener('wheel',e=>{if(!renderer?.cam0 || saving || lost)return;e.preventDefault();setView(view.yaw,view.zoom*(e.deltaY<0?1.1:1/1.1),view.pan[1]);},{passive:false});
  $('view').tabIndex=0;
  stage.onkeydown=e=>{
    if(e.target.id!=='view' || !renderer?.cam0)return;
    if(e.key==='ArrowLeft' || e.key==='ArrowRight')setView(view.yaw+(e.key==='ArrowLeft'?-10:10),view.zoom,view.pan[1]);
    else if(e.key==='ArrowUp' || e.key==='ArrowDown')setView(view.yaw,view.zoom,view.pan[1]+(e.key==='ArrowUp'?-1:1)*renderer.cam0.size*.08/view.zoom);
    else if(['+','=','-'].includes(e.key))setView(view.yaw,view.zoom*(e.key==='-'?1/1.1:1.1),view.pan[1]);
    else if(e.key==='0')setView(0);else return;
    e.preventDefault();
  };
  if (embedded) {
    Wardrobe.bindReaderFrameFit(height => send('tea-cosmetics-height', {height}));
  }
  seed={gender:params.get('gender')};initializeLook(seed);refresh();
  send('tea-wardrobe-ready');boot();loadItemDetails();
})();
