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
  function name(row, slot) {
    if (!row) return tr(slot === 'bodyshape' ? 'Original' : 'None');
    const names = metadata.names[row.id]?.[slot === 'outfit' ? view.outfitGender : gender];
    return names?.[language] || row.name;
  }
  function showItemDetail() {
    const item = ids && view && catalog && catalogueItems?.get(ids[slotOf()]);
    const panel = $('item-detail');
    panel.hidden = !item || Wardrobe.itemCategory(item) !== category;
    if (panel.hidden) return;
    const itemGender = category === 'outfit' ? view.outfitGender : gender;
    const title = StudioLocale.label(item, itemGender, language);
    // A description that only repeats the name (the Default outfit) stays blank.
    const described = StudioLocale.description(item, language), description = described === title ? '' : described;
    if ($('detail-name').textContent !== title) $('detail-name').textContent = title;
    if ($('detail-description').textContent !== description) $('detail-description').textContent = description;
  }
  async function loadItemDetails() {
    // Both editors read the same localized catalogue. Descriptions can arrive after the model.
    try {
      const response = await fetch(new URL('catalogue.json', library2d));
      if (!response.ok) return;
      const {items} = await response.json();
      catalogueItems = new Map(items.map(item => [item.id, item]));
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
    document.documentElement.lang = {en:'en',cn:'zh-Hans',jp:'ja',kr:'ko'}[language];
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
      const result=await Promise.all([opening,fetch(new URL('../metadata.json', library3d)).then(res=>{
        if(!res.ok) throw Error('metadata.json ('+res.status+')'); return res.json();
      })]);
      if(closed || canvas!==$('view') || generation!==bootGeneration || renderer.gl.isContextLost()) return;
      [catalog,metadata]=result; lost=false;
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
    const tall = parent.matchMedia('(min-height:560px)');
    const main = document.querySelector('main');
    const fitFrame = () => {
      document.documentElement.classList.toggle('reader-fit',tall.matches);
      send('tea-cosmetics-height',{height:tall.matches ? null : Math.max(480,main.offsetHeight)});
    };
    tall.addEventListener('change',fitFrame);
    new ResizeObserver(fitFrame).observe(main);
    fitFrame();
  }
  seed={gender:params.get('gender')};initializeLook(seed);refresh();
  send('tea-wardrobe-ready');boot();loadItemDetails();
})();
