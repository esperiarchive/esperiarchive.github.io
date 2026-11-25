/* Prototype: render an exported wardrobe look with WebGL2, reproducing the
   Unity capture path (AFKRecovered/PortraitLighting + PortraitLinearDepth rim
   prepass + PortraitBloom + PortraitGrade with the dialogue LUT).
   Shader code is a direct port of the Unity sources; see comments per stage. */
'use strict';

const PROFILE = { // PortraitLightingProfiles.json, "dialogue"
  direction: [-0.3383031126, 0.2766602251, 0.8994501631], intensity: 1, probe: 0, specular: 1, emission: 1,
  neutral: 1, lut: 0.85, ambientColor: [0.155126363, 0.271165937, 0.396226406, 1], zoneColor: [1, 1, 1, 1],
  bloom: 2, bloomThreshold: 1, bloomClamp: 65472, bloomScatter: 0.7, bloomSkipIterations: 1, bloomQualitySkip: 0,
};

const COMMON = `#version 300 es
precision highp float; precision highp int;
vec3 FromSrgb(vec3 v){ return mix(v/12.92, pow(max((v+.055)/1.055,vec3(0)),vec3(2.4)), step(vec3(.04045),v)); }
vec3 ToSrgb(vec3 v){ return mix(v*12.92, 1.055*pow(max(v,vec3(0)),vec3(1.0/2.4))-.055, step(vec3(.0031308),v)); }
`;

// Mesh vertex shader. Positions/normals are already world space (baked pose).
const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec2 aUv; layout(location=3) in vec2 aUv1;
uniform mat4 uView, uProj; uniform vec4 uMainST, uMakeupST;
out vec2 vUv; out vec2 vUv1; out vec3 vNormal; out vec3 vWorld; out float vEyeDepth;
void main(){
  vec4 view = uView*vec4(aPos,1.0);
  gl_Position = uProj*view;
  vUv = aUv*uMainST.xy+uMainST.zw; vUv1 = aUv1*uMakeupST.xy+uMakeupST.zw;
  vNormal = aNormal; vWorld = aPos; vEyeDepth = -view.z;
}`;

// AFKRecovered/PortraitLinearDepth fragment.
const DEPTH_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vUv1; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth;
uniform sampler2D _MainTex; uniform vec4 _Color; uniform float _Cutoff, _ALPHATEST, _ProbeForceOpaque;
out vec4 outColor;
void main(){
  if(_ALPHATEST>.5 && _ProbeForceOpaque<.5 && texture(_MainTex,vUv).a*_Color.a-_Cutoff<0.0) discard;
  outColor = vec4(vEyeDepth,0,0,1);
}`;

// AFKRecovered/PortraitLighting frag (gamma color space path), _PortraitLayerMode = 0.
const LIT_FS = COMMON + `
in vec2 vUv; in vec2 vUv1; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth;
uniform sampler2D _MainTex, _MiscMap, _Mask, _MAKEUP_Tex, _ProbeLinearDepth;
uniform float _MAKEUP, _ProbeSkin, _Thickness, _SubsurfaceNormalDistortion, _ScatteringExp, _ScatteringScale;
uniform vec4 _SubsurfaceAmbient, _SubsurfaceTint, _Color, _MidTint, _DarkTint, _EmissionColor;
uniform vec4 _ProbeLightDirection, _ProbeZoneColor, _ProbeAmbientColor, _ProbeSH;
uniform float _ShadowThreshold, _ShadowFeather, _DarkThreshold, _EnvColorWeight, _LightProbWeight, _GlobalColorFactorWeight, _ALPHATEST, _Cutoff;
uniform float _ProbeForceOpaque, _ProbeZoneIntensity, _ProbeShadowFactor, _ProbeGlobalFactor, _ProbeEmission;
uniform float _ProbeSpecular, _ProbeReflection, _Roughness, _Metallic, _SpecularRange, _SpecularFeather, _IndirectSpecular;
uniform vec4 _SpecularColor, _SpecularOffset;
uniform float _CharDepthRimState, _ProbeRim; uniform vec4 _ProbeRimShape, _ProbeRimColor;
uniform mat4 uView; uniform vec2 uResolution;
out vec4 outColor;
void main(){
  vec4 tex = texture(_MainTex,vUv);
  vec3 base = FromSrgb(tex.rgb);
  base *= _Color.rgb;
  if(_MAKEUP>0.0){ vec4 o=texture(_MAKEUP_Tex,vUv1); o.rgb=FromSrgb(o.rgb); base=mix(base,o.rgb,clamp(o.a*_MAKEUP,0.,1.)); }
  vec3 N = normalize(vNormal), L = normalize(_ProbeLightDirection.xyz);
  // Orthographic: V = UNITY_MATRIX_V[2].xyz (third row of the view matrix).
  vec3 V = vec3(uView[0][2], uView[1][2], uView[2][2]);
  vec4 misc = texture(_MiscMap,vUv);
  float rough = clamp(misc.b*_Roughness,0.,1.), metal = misc.a*_Metallic;
  vec3 diffuseBase = _ProbeSpecular>.5 ? max(base*(1.-metal),vec3(0.000061)) : base;
  float h = dot(N,L)*.5+.5;
  float feather = max(_ShadowFeather,0.000061);
  float a = min(_ProbeShadowFactor, clamp((h-(_ShadowThreshold-_ShadowFeather))/feather,0.,1.));
  float b = clamp((h-(_ShadowThreshold*_DarkThreshold-_ShadowFeather))/feather,0.,1.);
  vec3 dark = diffuseBase*_DarkTint.rgb;
  vec3 tone = mix(dark,diffuseBase,a);
  tone = mix(tone,diffuseBase*_MidTint.rgb,a*(1.-a));
  tone = mix(dark,tone,b);
  if(_ProbeSkin>.5 && _Thickness<1.){
    float scatter = pow(clamp(dot(normalize(V),-(L+N*_SubsurfaceNormalDistortion)),0.,1.),max(_ScatteringExp,.000061))*_ScatteringScale;
    tone += (_SubsurfaceAmbient.rgb+scatter*_SubsurfaceTint.rgb)*(1.-_Thickness)*(1.-texture(_Mask,vUv).a);
  }
  vec3 direct = min(_ProbeZoneIntensity,1.5)*mix(vec3(1),_ProbeZoneColor.rgb,_EnvColorWeight);
  float mixWeight = clamp((1.-_EnvColorWeight)*(1.-a)+a,0.,1.);
  vec3 ambient = mix(base,base*_ProbeAmbientColor.rgb,_ProbeAmbientColor.a);
  if(_ProbeSpecular>.5) ambient *= 1.-metal;
  ambient = max(ambient,vec3(0.000061));
  vec3 directSpec = vec3(0), indirectSpec = vec3(0);
  if(_ProbeSpecular>.5){
    vec3 f0 = mix(vec3(.04),base,metal);
    vec3 H = normalize(normalize(V+_SpecularOffset.xyz)+L);
    float alpha = max(rough*rough,0.000061), alpha2 = alpha*alpha;
    float nh = clamp(dot(N,H),0.,1.), lh = clamp(dot(L,H),0.,1.);
    float denominator = nh*nh*(alpha2-1.)+1.00001;
    denominator = denominator*denominator*max(lh*lh,.1)*(4.*alpha+2.);
    float brdf = clamp(alpha2/denominator-0.000061,0.,1.);
    float width = mix(.001,_SpecularRange,_SpecularFeather);
    float lo = clamp(_SpecularRange-width,0.,1.), hi = clamp(_SpecularRange+width,0.,1.);
    float t = clamp((brdf-lo)/max(hi-lo,0.000001),0.,1.);
    float shape = t*t*(3.-2.*t);
    directSpec = f0*shape*direct*_SpecularColor.rgb*clamp(dot(N,L),0.,1.)*(1.-rough);
    // Reflection cube (_ProbeReflection) not exported in this prototype.
  }
  vec3 result = mix(ambient*direct, tone*direct+directSpec, mixWeight);
  if(_ProbeRim>0. && _CharDepthRimState>=.5){
    vec2 lightVS = (mat3(uView)*L).xy; lightVS /= max(length(lightVS),.000061);
    vec2 normalVS = (mat3(uView)*N).xy;
    float weight = (max(dot(normalVS,lightVS),.001)+_ProbeRimShape.y)/(1.+_ProbeRimShape.y);
    vec2 uv = gl_FragCoord.xy/uResolution + normalVS*_ProbeRimShape.x*weight*.00125;
    float sampledDepth = texture(_ProbeLinearDepth,uv).r;
    float edge = clamp(sampledDepth-vEyeDepth,0.,1.)/max(_ProbeRimShape.z,.000061);
    vec3 tint = mix(_ProbeRimColor.rgb,_ProbeZoneColor.rgb,pow(clamp(weight,0.,1.),_ProbeRimShape.w));
    result += clamp(edge*tint,0.,1.)*direct*_ProbeRim;
  }
  result += misc.r*_EmissionColor.rgb*_ProbeEmission;
  result += max(_ProbeSH.rgb,vec3(0))*_LightProbWeight*base;
  result += indirectSpec;
  result = max(result,vec3(0))*(1.-_ProbeGlobalFactor*_GlobalColorFactorWeight);
  result = ToSrgb(result);
  float alphaOut = tex.a*_Color.a;
  if(_ALPHATEST>.5 && alphaOut-_Cutoff<0.0) discard;
  if(_ProbeForceOpaque>.5) alphaOut = 1.;
  outColor = vec4(result,alphaOut);
}`;

// AFK/Avatar Surface (unlit texture x tint), gamma color space: raw output.
const SURFACE_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vUv1; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth;
uniform sampler2D _MainTex; uniform vec4 _Color; uniform float _ALPHATEST, _Cutoff;
out vec4 outColor;
void main(){ vec4 c=texture(_MainTex,vUv)*_Color; if(_ALPHATEST>.5 && c.a-_Cutoff<0.0) discard; outColor=c; }`;

const SHADERS = { 'AFKRecovered/PortraitLighting': 'lit', 'AFK/Avatar Surface': 'surface' };

const QUAD_VS = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
out vec2 vUv; void main(){ vec2 p=P[gl_VertexID]; vUv=p*.5+.5; gl_Position=vec4(p,0,1); }`;

// AFKRecovered/PortraitBloom passes.
const BLOOM_FS = {
  prefilter: COMMON + `in vec2 vUv; uniform sampler2D _MainTex; uniform vec4 _BloomParams; out vec4 o;
    void main(){ vec3 color=FromSrgb(texture(_MainTex,vUv).rgb); color=min(color,vec3(_BloomParams.y));
      float brightness=max(color.r,max(color.g,color.b));
      float soft=clamp(brightness-_BloomParams.z+_BloomParams.w,0.,2.*_BloomParams.w);
      soft=soft*soft/(4.*_BloomParams.w+.0001);
      o=vec4(max(color*(max(soft,brightness-_BloomParams.z)/max(brightness,.0001)),vec3(0)),0); }`,
  horizontal: `#version 300 es
    precision highp float; in vec2 vUv; uniform sampler2D _MainTex; uniform vec4 _MainTex_TexelSize; out vec4 o;
    void main(){ vec2 s=vec2(_MainTex_TexelSize.x*2.,0);
      vec4 c=texture(_MainTex,vUv)*.227027;
      c+=(texture(_MainTex,vUv-s)+texture(_MainTex,vUv+s))*.194595;
      c+=(texture(_MainTex,vUv-2.*s)+texture(_MainTex,vUv+2.*s))*.121622;
      c+=(texture(_MainTex,vUv-3.*s)+texture(_MainTex,vUv+3.*s))*.054054;
      o=c+(texture(_MainTex,vUv-4.*s)+texture(_MainTex,vUv+4.*s))*.016216; }`,
  vertical: `#version 300 es
    precision highp float; in vec2 vUv; uniform sampler2D _MainTex; uniform vec4 _MainTex_TexelSize; out vec4 o;
    void main(){ vec2 a=vec2(0,_MainTex_TexelSize.y*1.384615), b=vec2(0,_MainTex_TexelSize.y*3.230769);
      o=texture(_MainTex,vUv)*.227027+(texture(_MainTex,vUv-a)+texture(_MainTex,vUv+a))*.316216
        +(texture(_MainTex,vUv-b)+texture(_MainTex,vUv+b))*.070270; }`,
  upsample: `#version 300 es
    precision highp float; in vec2 vUv; uniform sampler2D _MainTex, _LowMip; uniform vec4 _BloomParams; out vec4 o;
    void main(){ o=mix(texture(_MainTex,vUv),texture(_LowMip,vUv),_BloomParams.x); }`,
};

// AFKRecovered/PortraitGrade.
const GRADE_FS = COMMON + `in vec2 vUv; uniform sampler2D _MainTex, _UserLut, _BloomTex; uniform vec4 _UserLut_TexelSize;
uniform float _Neutral, _Contribution, _BloomIntensity, _Unpremultiply; out vec4 o;
vec3 Neutral(vec3 v){ v=max(v,vec3(0)); vec3 a=v*.262677+.0696; vec3 b=v*1.313386; vec3 c=b*(v*.262677+.29)+.0816; return ((b*a+.00544)/c-.066667)*1.313386; }
vec3 Lookup(vec3 color){ float n=_UserLut_TexelSize.w; vec3 p=clamp(color,0.,1.)*(n-1.); float slice=floor(p.b);
  vec2 uv=(p.rg+.5)*_UserLut_TexelSize.xy; uv.x+=slice/n;
  vec3 a=textureLod(_UserLut,uv,0.).rgb; vec3 b=textureLod(_UserLut,uv+vec2(1./n,0),0.).rgb; return mix(a,b,fract(p.b)); }
void main(){ vec4 value=texture(_MainTex,vUv); vec3 linearColor=value.rgb;
  if(_Unpremultiply>.5) linearColor=value.a>0.?linearColor/max(value.a,.000061):vec3(0);
  linearColor=FromSrgb(linearColor);
  linearColor+=texture(_BloomTex,vUv).rgb*_BloomIntensity;
  if(_Neutral>.5) linearColor=Neutral(linearColor);
  vec3 gamma=ToSrgb(max(linearColor,vec3(0)));
  if(_Contribution>0.) gamma=mix(clamp(gamma,0.,1.),Lookup(gamma),_Contribution);
  o=vec4(gamma,value.a); }`;

const BLEND = [0, 1, 0x0306, 0x0300, 0x0307, 0x0302, 0x0301, 0x0304, 0x0305, 0x0308, 0x0303]; // Unity BlendMode -> GL

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available.');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets are not supported.');
    gl.getExtension('OES_texture_float_linear');
    this.programs = {};
    this.frontFace = gl.CW;
  }
  program(key, vs, fs) {
    if (this.programs[key]) return this.programs[key];
    const gl = this.gl, compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(key + ': ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(key + ': ' + gl.getProgramInfoLog(p));
    const uniforms = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); uniforms[info.name] = { loc: gl.getUniformLocation(p, info.name), type: info.type }; }
    return this.programs[key] = { p, uniforms };
  }
  target(width, height, format = this.gl.RGBA16F, filter = this.gl.LINEAR) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, width, height };
  }
  async load(base) {
    const gl = this.gl, manifest = this.manifest = await (await fetch(base + 'manifest.json')).json();
    this.textures = {}; const images = new Map();
    const textureFor = async name => {
      if (!name || name.startsWith('cube:')) return null;
      if (!images.has(name)) images.set(name, (async () => {
        const blob = await (await fetch(base + name)).blob();
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        const mips = !/[?&]nomip/.test(location.search);
        if (mips) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return tex;
      })());
      return images.get(name);
    };
    const solid = rgba => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); return t; };
    this.white = solid([255, 255, 255, 255]); this.black = solid([0, 0, 0, 0]);
    this.materials = {};
    for (const m of manifest.materials) {
      const props = {};
      for (const p of m.props) props[p.name] = p.type === 'texture' ? { texture: await textureFor(p.texture), st: p.st } : p.type === 'vector' ? p.vector : p.value;
      this.materials[m.id] = { ...m, values: props };
    }
    this.parts = [];
    let bytes = 0;
    for (const part of manifest.parts) {
      const buffer = await (await fetch(base + part.file)).arrayBuffer(); bytes += buffer.byteLength;
      const n = part.vertexCount; let o = 0;
      const take = (count, Type) => { const a = new Type(buffer, o, count); o += count * Type.BYTES_PER_ELEMENT; return a; };
      const pos = take(n * 3, Float32Array), nor = take(n * 3, Float32Array), uv = take(n * 2, Float32Array), uv1 = part.hasUv1 ? take(n * 2, Float32Array) : null;
      const index = new Uint32Array(buffer, o);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const attr = (loc, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
      attr(0, pos, 3); attr(1, nor, 3); attr(2, uv, 2);
      if (uv1) attr(3, uv1, 2); else { gl.disableVertexAttribArray(3); gl.vertexAttrib2f(3, 0, 0); }
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
      this.parts.push({ ...part, vao, center: [cx / n, cy / n, cz / n] });
    }
    this.geometryBytes = bytes;
    this.lut = await new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = reject; img.src = base + 'lut.png'; });
    const lutTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.lut); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.lutTex = lutTex;
  }
  cameraMatrices() {
    const c = this.manifest.camera;
    const view = new Float32Array(c.worldToCamera); // Unity worldToCameraMatrix, column-major, OpenGL view convention.
    const r = c.size * c.aspect, t = c.size, n = c.near, f = c.far;
    const proj = new Float32Array([1 / r, 0, 0, 0, 0, 1 / t, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
    return { view, proj, width: c.width, height: c.height };
  }
  draws() {
    // Unity: opaque queue (<=2500) front-to-back; transparent back-to-front by distance.
    const { view } = this.cameraMatrices(), list = [];
    for (const part of this.parts) for (const sub of part.submeshes) {
      const material = this.materials[sub.material]; if (!material || !SHADERS[material.shader]) continue;
      const p = part.center, z = view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14];
      list.push({ part, sub, material, distance: -z });
    }
    const opaque = list.filter(d => d.material.queue <= 2500).sort((a, b) => a.material.queue - b.material.queue || a.distance - b.distance);
    const transparent = list.filter(d => d.material.queue > 2500).sort((a, b) => a.material.queue - b.material.queue || b.distance - a.distance);
    return { opaque, transparent, all: [...opaque, ...transparent] };
  }
  bindMaterial(prog, material, unitStart = 0) {
    const gl = this.gl, v = material.values; let unit = unitStart;
    for (const [name, u] of Object.entries(prog.uniforms)) {
      if (u.type === gl.SAMPLER_2D) {
        if (name === '_ProbeLinearDepth') continue;
        const value = v[name]; gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value?.texture || (name === '_MainTex' ? this.white : this.black)); gl.uniform1i(u.loc, unit++);
      } else if (u.type === gl.FLOAT && name in v) gl.uniform1f(u.loc, v[name]);
      else if (u.type === gl.FLOAT_VEC4 && name in v && Array.isArray(v[name])) gl.uniform4fv(u.loc, v[name]);
    }
    const st = name => v[name]?.st || [1, 1, 0, 0];
    if (prog.uniforms.uMainST) gl.uniform4fv(prog.uniforms.uMainST.loc, st('_MainTex'));
    if (prog.uniforms.uMakeupST) gl.uniform4fv(prog.uniforms.uMakeupST.loc, st('_MAKEUP_Tex'));
    const cull = v._CullMode ?? 2;
    if (cull === 0) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(cull === 1 ? gl.FRONT : gl.BACK); }
    return unit;
  }
  render() {
    const gl = this.gl, { view, proj, width, height } = this.cameraMatrices(), { opaque, all } = this.draws();
    const t0 = performance.now();
    gl.frontFace(this.frontFace);
    // 1. Depth-rim prepass (RenderType=Opaque materials only), cleared to the far plane.
    const depth = this.depthTarget ||= (() => { const t = this.target(width, height, gl.R32F, gl.NEAREST);
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); return t; })();
    gl.bindFramebuffer(gl.FRAMEBUFFER, depth.fb); gl.viewport(0, 0, width, height);
    gl.clearColor(this.manifest.camera.far, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    const dp = this.program('depth', MESH_VS, DEPTH_FS); gl.useProgram(dp.p);
    gl.uniformMatrix4fv(dp.uniforms.uView.loc, false, view); gl.uniformMatrix4fv(dp.uniforms.uProj.loc, false, proj);
    for (const d of all) {
      // RenderWithShader(..,"RenderType"): only materials tagged Opaque. Lit copies of
      // transparent sources are re-tagged Transparent; Avatar Surface is always Opaque.
      if (d.material.shader === 'AFKRecovered/PortraitLighting' && (d.material.values._ProbeDstBlend ?? 0) !== 0) continue;
      this.bindMaterial(dp, d.material); gl.bindVertexArray(d.part.vao);
      gl.drawElements(gl.TRIANGLES, d.sub.indexCount, gl.UNSIGNED_INT, d.sub.indexOffset * 4);
    }
    // 2. Lit pass into a 4x MSAA half-float target, cleared to transparent black.
    if (!this.msaa) {
      const fb = gl.createFramebuffer(), color = gl.createRenderbuffer(), z = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, color); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA16F, width, height);
      gl.bindRenderbuffer(gl.RENDERBUFFER, z); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, z);
      this.msaa = fb; this.lit = this.target(width, height);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const programs = { lit: this.program('lit', MESH_VS, LIT_FS), surface: this.program('surface', MESH_VS, SURFACE_FS) };
    for (const d of all) {
      const kind = SHADERS[d.material.shader], lp = programs[kind]; gl.useProgram(lp.p);
      gl.uniformMatrix4fv(lp.uniforms.uView.loc, false, view); gl.uniformMatrix4fv(lp.uniforms.uProj.loc, false, proj);
      if (lp.uniforms.uResolution) gl.uniform2f(lp.uniforms.uResolution.loc, width, height);
      const v = d.material.values, unit = this.bindMaterial(lp, d.material);
      if (lp.uniforms._ProbeLinearDepth) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, depth.tex); gl.uniform1i(lp.uniforms._ProbeLinearDepth.loc, unit); }
      const src = kind === 'lit' ? (v._ProbeSrcBlend ?? 1) : (v._SrcBlend ?? 1), dst = kind === 'lit' ? (v._ProbeDstBlend ?? 0) : (v._DstBlend ?? 0);
      const srcA = kind === 'lit' ? (v._ProbeSrcBlendAlpha ?? 1) : src;
      if (src === 1 && dst === 0 && srcA === 1) gl.disable(gl.BLEND);
      else { gl.enable(gl.BLEND); gl.blendFuncSeparate(BLEND[src], BLEND[dst], BLEND[srcA], BLEND[dst]); }
      gl.depthMask((v._ZWriteMode ?? 1) > 0.5);
      gl.bindVertexArray(d.part.vao); gl.drawElements(gl.TRIANGLES, d.sub.indexCount, gl.UNSIGNED_INT, d.sub.indexOffset * 4);
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.lit.fb);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    // 3. Bloom (PortraitRecoveredLighting.Bloom).
    let w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
    const count = Math.min(16, Math.max(1, Math.floor(Math.log2(Math.max(w, h))) - 1 - PROFILE.bloomSkipIterations - PROFILE.bloomQualitySkip));
    const threshold = PROFILE.bloomThreshold <= 0.04045 ? PROFILE.bloomThreshold / 12.92 : Math.pow((PROFILE.bloomThreshold + 0.055) / 1.055, 2.4);
    const params = [0.05 + 0.9 * Math.min(1, Math.max(0, PROFILE.bloomScatter)), PROFILE.bloomClamp, threshold, threshold * 0.5];
    this.pool ||= {}; const rt = (key, ww, hh) => this.pool[key] ||= this.target(ww, hh);
    const pass = (fsKey, src, dstT, extra) => {
      const p = this.program('bloom-' + fsKey, QUAD_VS, BLOOM_FS[fsKey]); gl.useProgram(p.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstT.fb); gl.viewport(0, 0, dstT.width, dstT.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(p.uniforms._MainTex.loc, 0);
      if (p.uniforms._MainTex_TexelSize) gl.uniform4f(p.uniforms._MainTex_TexelSize.loc, 1 / src.width, 1 / src.height, src.width, src.height);
      if (p.uniforms._BloomParams) gl.uniform4fv(p.uniforms._BloomParams.loc, params);
      if (extra) extra(p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const down = [rt('d0', w, h)]; pass('prefilter', this.lit, down[0]);
    for (let i = 1; i < count; i++) {
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      const horizontal = rt('h' + i, w, h); down[i] = rt('d' + i, w, h);
      pass('horizontal', down[i - 1], horizontal); pass('vertical', horizontal, down[i]);
    }
    let low = down[count - 1];
    for (let i = count - 2; i >= 0; i--) {
      const up = rt('u' + i, down[i].width, down[i].height), lowNow = low;
      pass('upsample', down[i], up, p => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lowNow.tex); gl.uniform1i(p.uniforms._LowMip.loc, 1); });
      low = up;
    }
    // 4. Grade into an 8-bit target (Unity ReadPixels from ARGB32).
    this.graded ||= this.target(width, height, gl.RGBA8);
    const gp = this.program('grade', QUAD_VS, GRADE_FS); gl.useProgram(gp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.graded.fb); gl.viewport(0, 0, width, height);
    const bindTex = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gp.uniforms[name].loc, unit); };
    bindTex('_MainTex', this.lit.tex, 0); bindTex('_BloomTex', low.tex, 1); bindTex('_UserLut', this.lutTex, 2);
    gl.uniform4f(gp.uniforms._UserLut_TexelSize.loc, 1 / this.lut.width, 1 / this.lut.height, this.lut.width, this.lut.height);
    gl.uniform1f(gp.uniforms._Neutral.loc, PROFILE.neutral); gl.uniform1f(gp.uniforms._Contribution.loc, PROFILE.lut);
    gl.uniform1f(gp.uniforms._BloomIntensity.loc, PROFILE.bloom); gl.uniform1f(gp.uniforms._Unpremultiply.loc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    this.milliseconds = performance.now() - t0;
    return { width, height, bloomMips: count };
  }
  read(targetObj, float = false) {
    const gl = this.gl, { width, height } = targetObj; gl.bindFramebuffer(gl.FRAMEBUFFER, targetObj.fb);
    const out = float ? new Float32Array(width * height * 4) : new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, out);
    return out; // bottom-up rows
  }
}

// Same metrics as avatar_creator/compositor.js compare(): foreground MAE (0-255),
// alpha MAE and silhouette error (%), over the union foreground.
function compare(reference, actual) {
  let foreground = 0, mae = 0, alpha = 0, silhouette = 0; const difference = new Uint8ClampedArray(actual.length);
  for (let i = 0; i < actual.length; i += 4) {
    const union = reference[i + 3] > 0 || actual[i + 3] > 0;
    if (union) {
      foreground++; alpha += Math.abs(reference[i + 3] - actual[i + 3]);
      if ((reference[i + 3] >= 128) !== (actual[i + 3] >= 128)) silhouette++;
      for (let c = 0; c < 3; c++) { const d = Math.abs(reference[i + c] - actual[i + c]); mae += d; difference[i + c] = Math.min(255, d * 4); }
    }
    difference[i + 3] = 255;
  }
  return { foregroundMae: mae / Math.max(1, foreground * 3), alphaMae: alpha / Math.max(1, foreground), silhouetteError: 100 * silhouette / Math.max(1, foreground), difference };
}

window.ModelPrototype = { Renderer, compare, PROFILE };
