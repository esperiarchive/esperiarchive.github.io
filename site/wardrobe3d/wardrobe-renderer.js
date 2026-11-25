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
