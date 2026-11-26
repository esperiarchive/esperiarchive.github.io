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
