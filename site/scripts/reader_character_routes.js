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
      for (const name of [entry.slug, ...(entry.aliases || [])]) {
        if (!slug.test(name) || byName.has(name)) throw new Error('Invalid or duplicate character name: ' + name);
        byName.set(name, id);
      }
      const interactions = new Map();
      for (const [key, interaction] of Object.entries(entry.interactions || {})) {
        if (!asset.test(key)) throw new Error('Invalid interaction asset: ' + key);
        for (const name of [interaction.slug, ...(interaction.aliases || [])]) {
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
      const characterId = byName.get(name) || (actor.test(name) ? name : '');
      if (!characterId || (parts.length === 3 && !conversation)) return null;
      const known = byId.get(characterId), interactionId = known?.interactions.get(conversation)
        || (asset.test(conversation) ? conversation : '');
      if (conversation && !interactionId) return null;
      return {characterId, interactionId, namedCharacter: byName.has(name),
        namedInteraction: Boolean(conversation && known?.interactions.has(conversation))};
    }

    function path(id = '', interaction = '') {
      if (!id) return '#/mystical-house';
      const known = byId.get(String(id));
      const characterPath = '#/mystical-house/' + (known?.entry.slug || encodeURIComponent(id));
      return characterPath + (interaction ? '/' + (known?.entry.interactions?.[interaction]?.slug || encodeURIComponent(interaction)) : '');
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
