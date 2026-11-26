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
