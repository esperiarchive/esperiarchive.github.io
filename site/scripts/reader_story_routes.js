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
