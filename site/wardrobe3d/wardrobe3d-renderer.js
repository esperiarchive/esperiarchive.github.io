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
    this.instances = new Map();
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
    const [catalog, tables, mips, overlays, legFill, lut] = await Promise.all([get('catalog.json'), get('tables.json'), get('tex-mips.json'), get('overlays.json'), get('leg-fill.json'), image(base + 'lut.png')]);
    this.catalog = catalog; this.tables = tables;
    this.validation = {references: []};
    this.noMipmaps = new Set(mips.noMipmaps);
    this.tables.overlays = overlays.overlays;
    this.legFill = legFill;
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
      const data = await (await fetch(this.base + file + '?v=poses-20261115')).json(); this.bytes += JSON.stringify(data).length; fixSockets(data); return data;
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
    // hand-fitted legs (blender/legfit_save.py) in every pose.
    const entry = outfit && this.fillLegs !== false ? this.legFill?.outfits?.[body]?.[outfit.id] : null;
    const fillPose = entry?.hand?.replaceLegFill ? null : entry?.hand || entry?.poses?.[poseName] || null;
    const [fillItem, repair] = await Promise.all([fillPose ? this.item(this.legFill.base[body]) : null, entry ? this.repairItem(body, outfit.id, entry.hand) : null]);
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
