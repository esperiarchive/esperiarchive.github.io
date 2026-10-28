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

  function create(data) {
    if (data?.schemaVersion !== 1 || !data.stories) throw new Error('Invalid story address registry');
    const byPath = new Map(), byStory = new Map();
    const categories = new Set(['main', 'side', 'reputation', 'mini', 'heart_to_heart', 'daily', 'exploration']);
    const slugPath = /^stories\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const [key, entry] of Object.entries(data.stories)) {
      const parts = key.split('/');
      if (parts.length !== 3 || section(parts[0]) !== parts[0] || !categories.has(parts[1]) || !parts[2]) {
        throw new Error('Invalid story address key: ' + key);
      }
      const target = {section: parts[0], category: parts[1], storyId: parts[2]};
      for (const path of [entry.path, ...(entry.aliases || [])]) {
        if (!slugPath.test(path) || byPath.has(path)) throw new Error('Invalid or duplicate story address: ' + path);
        byPath.set(path, target);
      }
      byStory.set(key, entry.path);
    }

    function resolve(value) {
      const path = String(value).split('?')[0].replace(/^#?\/?/, '');
      const target = byPath.get(path);
      if (target) return {...target, named: true};
      const parts = path.split('/');
      // Keep both historical collection/category/id and collection/chapter/category/id links.
      const offset = parts.length === 4 ? 2 : 1;
      if (![3, 4].includes(parts.length) || !categories.has(parts[offset])
          || !/^(?:base|base_campaign|special-events|special_events|season[-_]\d+)$/.test(parts[0])) return null;
      let id;
      try { id = decodeURIComponent(parts[offset + 1]); } catch (_) { return null; }
      if (!id || /[/?#\s]/.test(id)) return null;
      return {section: section(parts[0]), category: parts[offset], storyId: id};
    }

    function path(collection, category, id) {
      const key = `${section(collection)}/${category}/${id}`;
      return '#/' + (byStory.get(key) || `${section(collection)}/${category}/${encodeURIComponent(id)}`);
    }

    function canonicalHash(value) {
      const route = resolve(value);
      if (!route) return value;
      const queryAt = String(value).indexOf('?');
      return path(route.section, route.category, route.storyId) + (queryAt < 0 ? '' : String(value).slice(queryAt));
    }

    function mainReturn(value) {
      if (typeof value !== 'string' || value.length > 4000 || !value.startsWith('#/') || value.slice(1).includes('#')) return '';
      const target = resolve(value);
      return target?.category === 'main' && !new URLSearchParams(value.split('?')[1] || '').has('return') ? value : '';
    }
    return {resolve, path, canonicalHash, mainReturn};
  }
  return {...create(registry), create};
});
