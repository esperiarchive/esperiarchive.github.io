/* Saved Unity appearances. Only the selected look's portrait catalog is loaded. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReaderPlayerAppearance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const STORAGE = 'afkReader.playerAppearances.v1';
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
  function create({read, url, gender, text, storage, onApply, mount, makePortrait}) {
    let choices = {}, indexPromise, revision = 0;
    try { choices = JSON.parse(storage.getItem(STORAGE) || '{}') || {}; } catch (_) {}
    const loaded = new Map(), pending = new Map();
    const currentGender = () => gender() === 'female' ? 'female' : 'male';
    const selected = g => typeof choices[g] === 'string' ? choices[g] : `player_${g}_default1`;
    const index = () => indexPromise ||= read('catalogs/player_presets/index.json').catch(error => { indexPromise = null; throw error; });
    async function load(id) {
      if (!pending.has(id)) pending.set(id, (async () => {
        const catalog = await index(), row = catalog.presets.find(row => row.id === id);
        if (!row) throw new Error('Appearance unavailable');
        const data = await read(row.catalog);
        loaded.set(id, data);
        return data;
      })().catch(error => { pending.delete(id); throw error; }));
      return pending.get(id);
    }
    async function ensure() {
      const genders = gender() === 'both' ? ['male','female'] : [currentGender()];
      await Promise.all(genders.map(async g => {
        const catalog = await index();
        if (!catalog.presets.some(row => row.id === selected(g) && row.gender === g)) delete choices[g];
        await load(selected(g));
      }));
    }
    function resolve(model, pose) {
      const g = playerGender(model);
      return g ? portrait(loaded.get(selected(g)), pose) : null;
    }
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'player-appearance-button';
    button.dataset.i18n = 'Merlin appearance'; button.textContent = text('Merlin appearance');
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
      const title = element('h2', '', text('Merlin appearance')); title.id = 'player-appearance-title';
      const exit = element('button', '', text('Close')); exit.type = 'button'; exit.onclick = close;
      header.append(title, exit); dialog.append(header);
      const status = element('p', 'appearance-status', text('Loading…'));
      status.setAttribute('role', 'status'); dialog.append(status);
      try {
        const catalog = await index(); if (token !== generation) return;
        if (initial) group = catalog.presets.find(row => row.id === draft)?.group || 'default';
        status.remove();
        const filters = element('div', 'appearance-filters');
        const genderTitle = text(chooseGender ? 'Gender' : 'Preview gender');
        const genderLabel = element('label', '', genderTitle);
        const sex = element('select', ''); sex.setAttribute('aria-label', genderTitle);
        for (const g of ['male','female']) { const option = element('option','',text(g === 'male' ? 'Male' : 'Female')); option.value = g; sex.append(option); }
        sex.value = draftGender;
        sex.onchange = () => { draftGender = sex.value; draft = selected(draftGender); draw(); };
        genderLabel.append(sex); filters.append(genderLabel);
        const groupLabel = element('label', '', text('Outfit group'));
        const season = element('select',''); season.setAttribute('aria-label', text('Outfit group'));
        for (const key of ['default', ...Array.from({length:8}, (_,i) => `s${String(i+1).padStart(2,'0')}`)]) {
          const option = element('option','',key === 'default' ? text('Default') : text('Season {n}', {n:Number(key.slice(1))}));
          option.value = key; season.append(option);
        }
        season.value = group; season.onchange = () => { group = season.value; draw(); };
        groupLabel.append(season); filters.append(groupLabel); dialog.append(filters);
        const rows = catalog.presets.filter(row => row.group === group && row.gender === draftGender);
        if (!rows.some(row => row.id === draft)) draft = rows[0]?.id || '';
        const grid = element('div', 'appearance-grid'); grid.setAttribute('role','group'); grid.setAttribute('aria-label',text('Available looks'));
        const preview = element('div', 'appearance-preview');
        const footer = element('footer','appearance-footer');
        const apply = element('button','',text('Apply appearance')); apply.type='button'; apply.disabled=true;
        const cancel = element('button','',text('Cancel')); cancel.type='button'; cancel.onclick=close;
        const note = element('p','appearance-note',text('Appearance is saved separately for each gender.'));
        async function select(row) {
          draft = row.id; apply.disabled = true;
          for (const card of grid.children) card.setAttribute('aria-pressed', String(card.dataset.presetId === draft));
          preview.replaceChildren(element('p','',text('Loading…')));
          try {
            const data = await load(row.id);
            if (token !== generation || draft !== row.id) return;
            const full = element('img','appearance-full'); full.src = ReaderPublication.url(url(row.preview)); full.alt = text('Look {n}', {n:row.option});
            const crop = element('div','appearance-crop');
            crop.append(element('span','',text('Dialogue preview')));
            const face = makePortrait(portrait(data,'normal'), 'Merlin', 'primary'); crop.append(face);
            preview.replaceChildren(full,crop); apply.disabled=false;
          } catch (_) { if (token === generation) preview.replaceChildren(element('p','',text('Could not load appearance. Try again.'))); }
        }
        for (const row of rows) {
          const card = element('button','appearance-card'); card.type='button'; card.dataset.presetId=row.id;
          const image = element('img',''); image.src=ReaderPublication.url(url(row.thumbnail)); image.alt=''; image.decoding='async';
          card.append(image,element('span','',text('Look {n}',{n:row.option}))); card.onclick=()=>select(row); grid.append(card);
        }
        apply.onclick = () => {
          choices[draftGender]=draft;
          try { storage.setItem(STORAGE, JSON.stringify(choices)); } catch (_) {}
          revision++; close(); onApply({gender:draftGender, chooseGender});
        };
        footer.append(note,cancel,apply); dialog.append(grid,preview,footer);
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
    return {ensure, resolve, open, get revision() { return revision; }, selected};
  }
  return {create, playerGender, portrait, installPrompt};
});
