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
  const translate=()=>{document.documentElement.lang={en:'en',cn:'zh-Hans',jp:'ja',kr:'ko'}[language];translateDocument();};
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
  const reportExpanded=expanded=>window.parent.postMessage({type:'tea-wardrobe-expand',expanded},location.origin);
  const worker=new Worker('compositor.worker.js'),pending=new Map();let sequence=0;
  const lighting=()=>({rim:$('rim').checked,bloom:$('bloom').checked,grade:$('grade').checked,half:true,hiddenRgb:false,detail:true,clothingFit:$('clothing-fit').value==='clothing',hairFit:$('hair-fit').checked});
  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
  function setupPreviewNavigation(){
    const stage=$('stage'),canvas=$('avatar'),camera={zoom:1,y:0};let drag=null;
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    function update(){
      camera.zoom=Math.round(clamp(camera.zoom,.85,1.5)*100)/100;
      // Normal framing stays centered; pan room grows with magnification.
      const extra=Math.max(0,camera.zoom-1);
      camera.y=clamp(camera.y,-stage.clientHeight*.5*extra,stage.clientHeight*.5*extra);
      stage.style.setProperty('--preview-zoom',camera.zoom);
      stage.style.setProperty('--preview-x','0px');stage.style.setProperty('--preview-y',camera.y+'px');
      stage.classList.toggle('pannable',camera.zoom>1);
      $('zoom-value').textContent=Math.round(camera.zoom*100)+'%';
      $('zoom-out').disabled=camera.zoom<=.85;$('zoom-in').disabled=camera.zoom>=1.5;
      $('reset-view').disabled=camera.zoom===1&&camera.y===0;
    }
    function reset(){Object.assign(camera,{zoom:1,y:0});update();}
    function zoom(step){camera.zoom+=step;update();}
    $('zoom-out').onclick=()=>zoom(-.1);$('zoom-in').onclick=()=>zoom(.1);$('reset-view').onclick=reset;
    canvas.tabIndex=0;canvas.title='Right-drag left/right to zoom out/in. Drag up or down when zoomed in. Use + / − to zoom, up and down arrows to pan, or 0 to reset.';
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    canvas.addEventListener('pointerdown',event=>{
      const zooming=event.button===2&&event.pointerType!=='touch';
      if(canvas.hidden||!zooming&&(event.button!==0||camera.zoom<=1)||drag)return;
      event.preventDefault();canvas.focus({preventScroll:true});
      drag={pointer:event.pointerId,zooming,x:event.clientX,y:event.clientY,startZoom:camera.zoom,startY:camera.y};
      canvas.setPointerCapture(event.pointerId);stage.classList.add('dragging');
    });
    canvas.addEventListener('pointermove',event=>{
      if(!drag||drag.pointer!==event.pointerId)return;
      if(drag.zooming)camera.zoom=drag.startZoom+(event.clientX-drag.x)/300;
      else if(camera.zoom>1)camera.y=drag.startY+event.clientY-drag.y;
      update();
    });
    const end=()=>{drag=null;stage.classList.remove('dragging');};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();zoom(event.deltaY<0?.05:-.05);}},{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(['+','=','-','0','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();else return;
      if(event.key==='0')return reset();
      if(['+','=','-'].includes(event.key))return zoom(event.key==='-'?-.1:.1);
      if(camera.zoom<=1)return;
      camera.y+=event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0;update();
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
    const expand=node('button','expand-toggle'),expandIcon=document.createElementNS(svg,'svg');expand.type='button';expand.setAttribute('aria-label','Expand wardrobe');
    expandIcon.setAttribute('viewBox','0 0 24 24');expandIcon.setAttribute('aria-hidden','true');expandIcon.append(document.createElementNS(svg,'path'));expand.append(expandIcon);$('stage').append(expand);
    setExpanded=W.bindExpand(expand,matchMedia('(max-width: 760px)'),reportExpanded);
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
    const tall=window.parent.matchMedia('(min-height: 560px)');
    const report=()=>{
      const fit=tall.matches;document.documentElement.classList.toggle('reader-fit',fit);
      window.parent.postMessage({type:'tea-cosmetics-height',height:fit?null:Math.max(480,main.offsetHeight)},location.origin);
    };
    tall.addEventListener('change',report);new ResizeObserver(report).observe(main);report();
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
  let libraryWatched=true;
  // A release's indexes have fixed names, so they download alongside the catalogue.
  const early=new Map();
  function startEarly(){if(releasedLibrary)for(const path of ['items-startup.json','captures.json']){const request=get(path);request.catch(()=>{});early.set(path,request);}}
  function getEarly(path){const request=early.get(path);early.delete(path);return request||get(path);}
  async function getItems(){
    if(typeof DecompressionStream==='function')try{
      const [startup,head]=await Promise.all([getEarly('items-startup.json'),releasedLibrary?null:fetch(new URL('items.json',DATA),{method:'HEAD',cache:'no-cache'})]);
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
        const runtime=await WardrobeLibrary.open(metadata,read,[(embedded&&params.get('gender')==='male'?'male':'female')+'/normal/0']);libraryWatched=!released;
        return {library:runtime.library,runtime,stamp:WardrobeUpdates.responseStamp(released?startup:head)};
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
  async function loadLibrary(manifest){
    if(!manifest)return {library:null,stamp:null};
    if(manifest==='items.json')return getItems();
    const response=await get(manifest);return {library:await response.json(),stamp:WardrobeUpdates.responseStamp(response)};
  }
  function libraryStats(){
    $('total-count').textContent=catalogue.stats.items.toLocaleString();
    $('capture-count').textContent=Number.isInteger(catalogue.stats.previewReadyChoices)?catalogue.stats.previewReadyChoices.toLocaleString()+' preview-ready choices · '+catalogue.stats.presets+' complete looks':catalogue.stats.presets+' complete looks';
    if($('library-count'))$('library-count').textContent=itemLibrary?itemLibrary.parts.length.toLocaleString()+' reusable item views':'';
  }
  function watchLibrary(version){
    if(!catalogue.itemManifest||!libraryWatched)return;
    const controls=document.querySelector('.catalogue-stats'),progress=controls.querySelector('.capture-progress-link');
    const count=node('small');count.id='library-count';controls.insertBefore(count,progress);
    const button=node('button','library-refresh','Refresh previews');button.type='button';button.title='Check for newly published captures while keeping this look';controls.insertBefore(button,progress);
    const check=WardrobeUpdates.createUpdater({version,
      blocked:()=>exporting||document.hidden||(embedded&&window.frameElement?.hidden),
      check:async()=>{const response=await fetch(new URL(catalogue.itemManifest,DATA),{method:'HEAD',cache:'no-cache'});if(!response.ok)throw new Error('Could not check preview updates.');return WardrobeUpdates.responseStamp(response);},
      load:async()=>{const next=await(await get('catalogue.json')).json();const [loaded,complete]=await Promise.all([loadLibrary(next.itemManifest),next.captureManifest?get(next.captureManifest).then(r=>r.json()):{cases:[]}]);return {...loaded,catalogue:next,captures:complete};},
      apply:data=>{
        if(data.library?.schema!=='afk.wardrobe.items'||data.library.validation?.passed!==true)throw new Error('New previews have not passed validation.');
        const nextIndex=W.createIndex(data.catalogue,data.captures,data.library);
        catalogue=data.catalogue;captures=data.captures;itemLibrary=data.library;runtimeLibrary=data.runtime;index=nextIndex;
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
  function itemRows(matches,only){
    const rows=[],slot=W.categorySlot(category);
    for(const variants of families.values()){
      if(W.itemCategory(variants[0])!==category)continue;
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
  function drawItems(){
    const roster=$('items'),scrollTop=roster.scrollTop;
    const focused=roster.contains(document.activeElement)?document.activeElement.dataset.itemKey:null;
    const text=$('search').value.trim().toLocaleLowerCase(),only=readyFilter?.checked??true,sort=$('sort').value,presets=category==='presets';
    const direction=$('sort-order').value==='desc'?-1:1;
    const matches=(name,item)=>!text||`${name} ${item.id} ${item.colorName||''}`.toLocaleLowerCase().includes(text);
    const rows=presets?catalogue.presets
      .filter(p=>p.gender===state.gender&&matches(p.name,p))
      .map(item=>({item,name:item.name,ready:!!index.resolve(presetState(item)),sortName:item.name,sortId:item.id}))
      .filter(row=>!only||row.ready):itemRows(matches,only);
    W.sortRows(rows,sort,direction,language);
    $('category-title').textContent=presets?'Complete looks':W.browseCategories(catalogue.categories).find(c=>c.id===category)?.name||'Wardrobe';
    $('result-count').textContent=rows.length+' '+(presets?'look':'item')+(rows.length===1?'':'s');$('no-items').hidden=!!rows.length;
    if(!rows.length){
      const hint=$('no-items').querySelector('p');
      if(only&&!text&&category==='bodypaint')hint.textContent='Body paint previews depend on the outfit, skin, build and expression. Try another outfit or turn off Preview-ready to browse the full list.';
      else if(only&&!text&&category==='makeup')hint.textContent='Makeup previews depend on the face, skin, build and expression. Try another face or turn off Preview-ready to browse the full list.';
      else hint.textContent='Clear the search, choose a complete look, or turn off Preview-ready to browse the full list.';
      if(!readyFilter||!only)hint.textContent=hint.textContent.replace(', choose a complete look, or turn off Preview-ready to browse the full list.',' or choose a complete look.').replace(' or turn off Preview-ready to browse the full list.','.');
    }
    drawColors(only);
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
    }
    roster.replaceChildren(grid);
    fitItemNames();
    roster.scrollTop=scrollTop;
    if(focused)Array.from(roster.children).find(card=>card.dataset.itemKey===focused)?.focus({preventScroll:true});
  }
  function groupName(p){return p.group==='studio'?'Mix preview-ready parts':(p.group==='default'?'Default':/^s\d+$/.test(p.group)?'Season '+Number(p.group.slice(1)):p.group)+' · Look '+p.option;}
  function drawDetail(){const el=$('item-detail'),item=index.items.get(state.avatarIds[detailSlot]);
    // Headwear and Hero headgear share a slot; each caption only its own items.
    el.hidden=!item||item.slot===W.categorySlot(category)&&W.itemCategory(item)!==category;if(el.hidden)return;el.replaceChildren();
    // A description that only repeats the name (the Default outfit) stays blank.
    const title=itemLabel(item,state.gender),description=WardrobeLocale.description(item,language);
    el.append(node('strong','',title),node('div','detail-meta','AVATAR '+item.id+' · '+(readyFor(item)?'PREVIEW-READY':'CAPTURE NEEDED')),
    node('p','',description===title?'':description),node('small','',item.genders[state.gender].assetName||(item.slot==='bodyshape'?'Body build':'Material / appearance option')));
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
    const output=await compute({assetEntry:{layers:entry.layers,overlays:entry.overlays||[],surfaces:entry.surfaces||[],lut,clothingFit,hairFit},dataRoot:DATA.href,context,options,preview});
    if(output.cancelled||!isCurrent())return null;
    canvas.width=context.width;canvas.height=context.height;canvas.getContext('2d').putImageData(new ImageData(output.pixels,canvas.width,canvas.height),0,0);return canvas;
  }
  const detailIndexes=new WeakMap();
  async function resolveView(snapshot,pose=snapshot.pose||'normal'){
    if(!runtimeLibrary)return index.resolve(snapshot,pose);
    const library=await runtimeLibrary.ensure(snapshot.gender,pose,snapshot.yaw||0);
    if(!detailIndexes.has(library))detailIndexes.set(library,W.createIndex(catalogue,captures,library));
    const view=detailIndexes.get(library).resolve(snapshot,pose);
    return view?{...view,library}:null;
  }
  async function render(){
    const token=++generation,snapshot=clone(state);current=null;$('export-png').disabled=$('export-set').disabled=true;
    if(embedded)$('reader-use').disabled=true;
    $('loading').hidden=false;$('preview-status').textContent='Preparing the selected appearance…';
    let view;
    try{view=await resolveView(snapshot);}catch(error){if(token===generation){$('loading').hidden=true;$('preview-status').textContent='Preview could not load: '+error.message;}return;}
    if(token!==generation)return;
    const detailed=view?.kind==='baked'||!!view?.entry?.hdReference;
    const captured=detailed||view?.kind==='capture';
    $('fit-control').hidden=!(view?.kind==='items'&&view.entry.yaw===180&&(state.avatarIds.cloak||state.avatarIds.back));
    $('hair-fit-control').hidden=!(view?.kind==='items'&&HairFit.describe(view.entry,view.library||itemLibrary));
    const target=$('avatar');target.getContext('2d').clearRect(0,0,target.width,target.height);target.hidden=!view;$('empty-preview').hidden=!!view;$('loading').hidden=!view;
    $('light-controls').disabled=!view||captured;$('preview-kind').textContent=view?(captured?'COMPLETE UNITY CAPTURE':view.kind==='items'?'REUSABLE ITEM PREVIEW':'COMPOSED PREVIEW'):'CAPTURE NEEDED';$('resolution').textContent='';
    $('lighting-caption').textContent=captured?'Baked into portrait':'Capture lighting';$('light-note').textContent=captured?'This capture includes the original Unity lighting and effects.':'Rim lighting, bloom and grading use the capture profile. Effects are a fixed frame.';
    if(!view){$('preview-status').textContent='Some selected parts or appearance variants need preview data. You can still save or export the recipe.';return;}
    $('preview-status').textContent='Preparing the selected appearance…';
    try{const canvas=await renderView(view,lighting(),()=>token===generation,true);if(token!==generation)return;target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);current={view,canvas,token};
      $('resolution').textContent=canvas.width+' × '+canvas.height;$('preview-status').textContent=view.kind==='items'?'Assembled from reusable items · depth-aware veils and adjustable lighting.':view.kind==='layers'?(detailed?'Detailed Unity render · original lighting, 4× antialiasing.':'Preview-ready · this combination was checked against a complete Unity render.'):view.kind==='capture'?(detailed?'Detailed Unity render · original lighting, 4× antialiasing.':'Preview-ready · complete Unity capture with original lighting and effects.'):'Complete captured look · changing parts needs matching captures.';
      $('export-png').disabled=$('export-set').disabled=false;
      if(embedded)$('reader-use').disabled=readerBusy||!readerSession||!index.resolve({...state,yaw:0},'normal');
    }catch(error){if(token!==generation)return;target.hidden=true;$('preview-status').textContent='Preview could not load: '+error.message;}
    finally{if(token===generation)$('loading').hidden=true;}
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
    snapshot={...clone(snapshot),yaw:0};
    if(!index.resolve(snapshot,'normal'))throw new Error('A Hand on Hip preview is required to use this look for Merlin.');
    const pack={schema:'afk.reader.portrait-pack',version:1,gender:snapshot.gender,displayName:name.trim().slice(0,80)||'My Merlin',recipe:{avatarIds:Object.fromEntries(Object.entries(snapshot.avatarIds).filter(([slot])=>slot!=='footprint')),presentation:{rim:settings.rim,bloom:settings.bloom,grade:settings.grade,hairFit:settings.hairFit,clothingFit:settings.clothingFit}},poses:{}};
    for(const [pose,label] of poses){
      if(!index.resolve(snapshot,pose))continue;
      progress(label);const view=await resolveView(snapshot,pose),canvas=await renderView(view,settings);
      pack.framing ||= view.framing;pack.poses[pose]={png:canvas.toDataURL('image/png'),framing:view.framing};
      if(view.portrait?.choiceFraming)pack.poses[pose].choiceFraming=view.portrait.choiceFraming;
    }
    const source=JSON.stringify(pack);if(new Blob([source]).size>24*1024*1024)throw new Error('This look exceeds the 24 MB portrait-pack limit.');
    return source;
  }
  async function useForMerlin(){
    if(readerBusy||!readerSession||!current)return;
    readerBusy=exporting=true;$('reader-use').disabled=$('reader-back').disabled=$('random').disabled=true;
    const sessionId=readerSession,snapshot=clone(state),name=$('reader-look-name').value.trim()||title();
    try{
      const pack=await buildReaderPack(snapshot,lighting(),name,label=>{$('reader-save-status').textContent='Preparing '+label+'…';});
      if(sessionId!==readerSession)return;
      $('reader-save-status').textContent='Saving look…';
      window.parent.postMessage({type:'tea-wardrobe-apply',sessionId,pack},location.origin);
    }catch(error){$('reader-save-status').textContent=error.message;readerBusy=exporting=false;$('reader-back').disabled=$('random').disabled=false;$('reader-use').disabled=!current;}
  }
  window.addEventListener('message',event=>{
    if(!embedded||event.origin!==location.origin||event.source!==window.parent)return;
    const message=event.data||{};
    if(message.type==='tea-wardrobe-language'||message.type==='tea-wardrobe-init'){const next=WardrobeLocale.language(message.language);if(next!==language){language=next;translate();if(studioReady)refresh();}}
    if(message.type==='tea-wardrobe-init'&&studioReady){
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
        return;
      }
      if(recipe.avatarIds?.outfit)next={...next,avatarIds:W.normalize(recipe.avatarIds),name:seed.name||''};
      else if(preset)next={...next,avatarIds:W.normalize(preset.recipe)};
      else if(recipe.sourcePreset){$('reader-save-status').textContent='This preset is unavailable in the wardrobe. The default look is shown.';}
      const settings=recipe.presentation||{};for(const key of ['rim','bloom','grade'])$(key).checked=settings[key]!==false;
      $('hair-fit').checked=settings.hairFit!==false;$('clothing-fit').value=settings.clothingFit===false?'native':'clothing';
      history=[];future=[];detailSlot=null;$('reader-look-name').value=seed.name||'';setState(next,{record:false});
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
      for(const [pose,label] of poses){$('export-status').textContent='Preparing '+label.toLowerCase()+'…';const view=await resolveView(snapshot,pose),canvas=await renderView(view,settings),blob=await png(canvas);
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
    try{startEarly();catalogue=await(await get('catalogue.json')).json();
      const [complete,loaded]=await Promise.all([
        catalogue.captureManifest?getEarly(catalogue.captureManifest).then(response=>response.json()):{cases:[]},
        loadLibrary(catalogue.itemManifest)
      ]);
      captures=complete;itemLibrary=loaded.library;runtimeLibrary=loaded.runtime;
      buildFamilies();index=W.createIndex(catalogue,captures,itemLibrary);state=defaultState(embedded&&params.get('gender')==='male'?'male':'female');
      try{const stored=JSON.parse(localStorage.getItem(STORE)||'{}');if(stored.draft)state=W.parseRecipe(JSON.stringify(stored.draft),index.items);if(stored.presentation?.clothingFit===false)$('clothing-fit').value='native';if(stored.presentation?.hairFit===false)$('hair-fit').checked=false;}catch(_){}
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
      $('export-set').onclick=()=>{clearReadyDownload();const poses=portraitPoses.filter(([pose])=>(state.yaw!==180||backPoses.has(pose))&&index.resolve(state,pose));$('export-poses').textContent=(state.yaw===180?'Back view':'Front view')+' · Available poses: '+poses.map(p=>p[1]).join(', ')+'.';$('export-status').textContent='';$('export-dialog').showModal();};
      $('download-zip').onclick=()=>exportSet('zip');$('download-pack').onclick=()=>exportSet('pack');refresh();watchLibrary(loaded.stamp);
      studioReady=true;if(embedded)window.parent.postMessage({type:'tea-wardrobe-ready'},location.origin);
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
