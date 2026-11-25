/* Effect shader ports for the 3D wardrobe (load after wardrobe-renderer.js).
   AFK/Avatar Layered Effect, AFKRecovered/EffectFXStyle, EffectGalaxy and EffectLiquid are
   line-for-line ports of the worker project's shaders (gamma color space paths, fixed
   capture effect time). "Standard" (one glass outfit part) is an approximation: Unity's
   Standard shader lit by RenderPose's three directional lights and the default ambient. */
'use strict';

const GAMMA_HELPERS = `
vec3 GammaToLinearSpace(vec3 c){ return c*(c*(c*0.305306011+0.682171111)+0.012522878); }
vec3 LinearToGammaSpace(vec3 c){ return max(1.055*pow(max(c,vec3(0)),vec3(0.416666667))-0.055,vec3(0)); }
float sat(float x){ return clamp(x,0.,1.); }`;
const FX_VARYINGS = 'in vec2 vUv; in vec2 vUv1; in vec2 vUvRaw; in vec3 vNormal; in vec3 vWorld; in float vEyeDepth; in vec4 vColor;';

const LAYERED_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform sampler2D _MainTex, _BlendTex, _MaskTex, _Soft_MaskTex, _TileTex, _AFKVertexMask;
uniform vec4 _MainTex_ST, _BlendTex_ST, _MaskTex_ST, _Soft_MaskTex_ST, _TileTex_ST, _AFKVertexMask_ST;
uniform vec4 _MainTex_CT, _BlendTex_CT, _Mask_CT, _MaskTex_CT, _Tile_CT, _Soft_Mask_CT, _PolarUV_Center_Main;
uniform vec4 _Main_Color, _Main_Dark_Color, _Light_Color, _Dark_Color, _Tile_Color, _Color;
uniform vec4 _MainTex_Color, _BlendTex_Color, _MainTex_Color_W, _White_Color, _Black_Color;
uniform float _AFKFxKind, _AFKPreviewTime, _TimeScale, _AlphaCT, _Alpha_CT, _Mask, _SoftMask, _Tile, _Blend;
uniform float _Light_Dark_Set, _RGB_Set, _MainTex_Channel_R_A, _OneMinus, _Soft_Mask_Oneminus, _Tile_OneMinus, _UseVertCol, _FadeRate;
uniform float _PolarUV_Main, _PolarUV_Tile, _PolarUV_Mask;
out vec4 outColor;
vec2 effectUV(vec2 uv, vec4 st, vec4 motion, float polar, float time){
  vec2 delta=uv-_PolarUV_Center_Main.xy;
  uv=mix(uv,vec2(atan(delta.y,delta.x)/6.2831853+0.5,length(delta)*2.),sat(polar));
  vec2 p=uv*st.xy+st.zw+motion.xy*time-0.5; float s=sin(radians(motion.z)), c=cos(radians(motion.z));
  return vec2(c*p.x+s*p.y,-s*p.x+c*p.y)+0.5;
}
void main(){
  vec2 uv=vUvRaw; float time=(_AFKPreviewTime>=0.?_AFKPreviewTime:1.35)*_TimeScale;
  vec4 tex=texture(_MainTex,effectUV(uv,_MainTex_ST,_MainTex_CT,_PolarUV_Main,time));
  float main=mix(tex.r,1.-tex.r,sat(_OneMinus)); float alpha=tex.a*main; vec3 color=tex.rgb;
  if(_AFKFxKind<0.5) color=mix(_Black_Color.rgb,_White_Color.rgb,main)*_MainTex_Color_W.rgb;
  else if(_AFKFxKind<1.5){
    vec4 blend=texture(_BlendTex,effectUV(uv,_BlendTex_ST,_BlendTex_CT,0.,time));
    color=tex.rgb*_MainTex_Color.rgb*mix(vec3(1),blend.rgb*_BlendTex_Color.rgb,sat(_Blend));
    alpha*=mix(1.,blend.r*blend.a,sat(_Blend))*_AlphaCT;
  } else if(_AFKFxKind<2.5){
    alpha=mix(tex.a,tex.r,sat(_MainTex_Channel_R_A));
    color=mix(_Main_Dark_Color.rgb,_Main_Color.rgb,main);
    color=mix(color,mix(_Dark_Color.rgb,_Light_Color.rgb,main),sat(_Light_Dark_Set));
    color=mix(color,tex.rgb,sat(_RGB_Set));
    float tile=texture(_TileTex,effectUV(uv,_TileTex_ST,_Tile_CT,_PolarUV_Tile,time)).r;
    tile=mix(tile,1.-tile,sat(_Tile_OneMinus))*sat(_Tile);
    color+=_Tile_Color.rgb*tile; alpha=sat(alpha+tile)*_Alpha_CT;
  } else {
    alpha=tex.a*texture(_AFKVertexMask,uv*_AFKVertexMask_ST.xy+_AFKVertexMask_ST.zw).r;
  }
  if(_AFKFxKind<2.5){
    vec4 motion=_AFKFxKind<1.5?_MaskTex_CT:_Mask_CT;
    float mask=texture(_MaskTex,effectUV(uv,_MaskTex_ST,motion,_PolarUV_Mask,time)).r;
    float soft=texture(_Soft_MaskTex,effectUV(uv,_Soft_MaskTex_ST,_Soft_Mask_CT,0.,time)).r;
    soft=mix(soft,1.-soft,sat(_Soft_Mask_Oneminus));
    alpha*=mix(1.,mask,sat(_Mask))*mix(1.,soft,sat(_SoftMask));
  }
  color*=_Color.rgb*mix(vec3(1),vColor.rgb,sat(_UseVertCol));
  outColor=vec4(max(vec3(0),color),sat(alpha*_Color.a*vColor.a*_FadeRate));
}`;

// FXStyle vertex program: normal push, noise displacement (world or view space), flipbook frame.
const FX_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec4 aTangent;
layout(location=3) in vec2 aUv; layout(location=4) in vec2 aUv1; layout(location=5) in vec3 aFigure;
layout(location=6) in vec4 aColor; layout(location=7) in vec4 aJoints; layout(location=8) in vec4 aWeights;
uniform sampler2D uBones, _NoiseTex; uniform mat4 uObject, uView, uProj; uniform vec4 uMainST, uMakeupST;
uniform float _Vertex_Intensity, _NoiseMoveRate, _vertOffset, _Is_VS, _PortraitEffectTime, _UseVertCol;
uniform float _Flipbook, _FlipFrequency, _FlipRow, _FlipCol, _FlipX, _FlipY; uniform vec4 _NoiseTiling;
out vec2 vUv; out vec2 vUv1; out vec2 vUvRaw; out vec3 vNormal; out vec3 vWorld; out float vEyeDepth; out vec4 vColor;
mat4 bone(float index){ int i=int(index)*4; return mat4(texelFetch(uBones,ivec2(i,0),0),texelFetch(uBones,ivec2(i+1,0),0),texelFetch(uBones,ivec2(i+2,0),0),texelFetch(uBones,ivec2(i+3,0),0)); }
void main(){
  mat4 skin = bone(aJoints.x)*aWeights.x + bone(aJoints.y)*aWeights.y + bone(aJoints.z)*aWeights.z + bone(aJoints.w)*aWeights.w;
  vec3 n=mat3(skin)*aNormal, p=(skin*vec4(aPos,1)).xyz + n*_Vertex_Intensity*.01;
  vec3 world=(uObject*vec4(p,1)).xyz, normal=normalize(transpose(inverse(mat3(uObject)))*n);
  float nz=textureLod(_NoiseTex,aUv,0.).r;
  vec3 moved=world+normal*sin(dot(world,_NoiseTiling.xyz)+3.*_PortraitEffectTime*_NoiseTiling.w)*_NoiseMoveRate*nz;
  vec3 view=(uView*vec4(world,1)).xyz;
  view.xy+=sin(view.yx*_NoiseTiling.yx+3.*_PortraitEffectTime*_NoiseTiling.wz)*_NoiseMoveRate*nz;
  moved=mix(moved,(inverse(uView)*vec4(view,1)).xyz,_Is_VS);
  world=mix(world,moved,_vertOffset);
  vec4 v=uView*vec4(world,1); gl_Position=uProj*v;
  vec2 uv=aUv;
  if(_Flipbook==1.){
    vec2 grid=max(vec2(_FlipRow,_FlipCol),vec2(1)); float frame=floor(fract(_PortraitEffectTime*_FlipFrequency)*grid.x*grid.y);
    float row=floor(frame/grid.x); vec2 tile=vec2(frame-row*grid.x,row);
    tile=abs(vec2(_FlipX,_FlipY)*grid-(tile+vec2(_FlipX,_FlipY))); uv=(aUv+tile)/grid;
  }
  vUv=uv*uMainST.xy+uMainST.zw; vUv1=aUv1; vUvRaw=uv; vNormal=normal; vWorld=world; vEyeDepth=-v.z;
  vColor=mix(vec4(1),aColor,_UseVertCol);
}`;

const FXSTYLE_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uObject; uniform vec3 uCameraPos;
uniform sampler2D _MainTex, _NoiseTex, _TileTex, _MaskTex, _Soft_MaskTex;
uniform vec4 _MainTex_ST, _NoiseTex_ST, _TileTex_ST, _MaskTex_ST, _Soft_MaskTex_ST;
uniform float _ShaderMode, _TimeScale, _BackColor_Add, _LightColor_Set, _Trail_Dissolve, _Dissolve_Cus_W, _Alpha_CT;
uniform vec4 _Color, _BackColor, _Main_Color, _Main_Dark_Color, _Light_Color, _Dark_Color, _Tile_Color, _Edge_Color, _Fresnel_Color;
uniform float _Light_Dark_Set, _U_V_Set, _U_V_Tilling, _SoftRange, _Offset, _Mul_R_Set, _Min, _RGB_Set, _MainTex_Channel_R_A, _OneMinus;
uniform vec4 _MainTex_CT, _Noise_CT, _Tile_CT, _Mask_CT, _Soft_Mask_CT, _PolarUV_Center_Main, _PortraitZoneLight;
uniform float _MainTex_Panner_Once, _RandomOffset, _PolarUV_Main, _Noise_FromCenter, _Dark_Set, _PolarUV_Tile, _Tile_OneMinus, _Tile_Mask, _Mask_Oneminus;
uniform float _TileTex_Panner_Once, _PolarUV_Mask, _Mask_Type, _Mask_Fresenl, _MaskTiling_T, _Edge_Width, _Multiplt_Color;
uniform float _Fresnel, _Fresnel_Oneminus, _Fresnel_Intensity, _Fresnel_Alpha, _FresnelAlphaType, _Fresnel_Alpha_Intensity, _Fresnel_Alpha_Inverse, _Fresnel_Alpha_MaskInverse;
uniform float _SoftMask, _PolarUV_Soft_Mask, _Soft_Mask_Oneminus, _SmoothBorder, _Alpha_Clip_Smooth, _Edge_Smooth, _AlphaTest, _AUTO_UV, _FadeRate;
uniform float _PortraitEffectTime, _PortraitMask, _PortraitTile, _PortraitNoise;
out vec4 outColor;
vec2 RotateUV(vec2 uv,float degrees){ float s=sin(degrees*.01745329252), c=cos(degrees*.01745329252); uv-=.5; return vec2(c*uv.x+s*uv.y,-s*uv.x+c*uv.y)+.5; }
float S(float low,float high,float v){ float x=sat((v-low)/max(high-low,.000001)); return x*x*(3.-2.*x); }
float FresnelAlpha(vec3 N,vec3 V){
  if(_Fresnel_Alpha<=0.) return 1.;
  vec3 n=N*_Fresnel_Alpha_Inverse;
  float d=mix(sat(dot(V,n)),sat(dot(V.xz,n.xz)),_FresnelAlphaType);
  d=mix(d,1.-d,_Fresnel_Alpha_MaskInverse);
  return mix(1.,min(pow(max(d,.000001),_Fresnel_Alpha_Intensity),1.),_Fresnel_Alpha);
}
vec2 BaseUV(vec2 uv,vec4 st,float polar){ if(polar>.5){ vec2 d=uv-_PolarUV_Center_Main.xy; uv=vec2(length(d),atan(d.x,d.y)*.159236); } return uv*st.xy+st.zw; }
vec2 StyleUV(vec2 uv,vec4 st,vec4 ct,float once,float custom,float polar){ return RotateUV(BaseUV(uv,st,polar)+mix(3.*_PortraitEffectTime*_TimeScale,custom,once)*ct.xy,ct.z); }
void main(){
  vec4 iuv=vec4(vUvRaw,0,0);
  vec2 uv=iuv.xy; uv.x*=mix(1.,abs(uObject[0][0]),_AUTO_UV);
  vec2 mainBase=BaseUV(uv,_MainTex_ST,_PolarUV_Main);
  if(_PortraitNoise>.5 && _PolarUV_Main<=.5){
    vec2 nu=uv*_NoiseTex_ST.xy+_NoiseTex_ST.zw+3.*_PortraitEffectTime*_TimeScale*_Noise_CT.xy;
    mainBase+=texture(_NoiseTex,nu).r*_Noise_CT.w*(1.+_Noise_FromCenter*(mainBase-1.5));
  }
  vec2 mu=RotateUV(mainBase+mix(3.*_PortraitEffectTime*_TimeScale,iuv.w,_MainTex_Panner_Once)*_MainTex_CT.xy,_MainTex_CT.z);
  mu=RotateUV(RotateUV(mu,-_MainTex_CT.z)+_RandomOffset*.5*(uObject[3][0]+uObject[3][2]),_MainTex_CT.z);
  vec4 main=texture(_MainTex,mu);
  float noise=mix(main.r,1.-main.r,_OneMinus)*_MainTex_CT.w;
  vec3 rgb=mix(_Main_Dark_Color.rgb,_Main_Color.rgb,noise);
  float axis=fract(mix(uv.y,uv.x,_U_V_Set)*_U_V_Tilling);
  float gradient=axis*_SoftRange+_Offset;
  float g=S(_Min,1.,S(0.,1.,gradient/max(1.-main.r,.000001)));
  gradient=sat(mix(gradient,g,_Mul_R_Set));
  rgb=mix(rgb,mix(_Dark_Color.rgb,_Light_Color.rgb,gradient),_Light_Dark_Set);
  rgb=mix(rgb,main.rgb,_RGB_Set);
  vec3 edge=mix(_Edge_Color.rgb,_Edge_Color.rgb*rgb*vColor.rgb,_Multiplt_Color);
  vec2 maskuv=StyleUV(uv,_MaskTex_ST,_Mask_CT,_MaskTiling_T,iuv.w,_PolarUV_Mask);
  float dissolve=mix(_Dissolve_Cus_W,mix(iuv.z,1.-vColor.a,_Trail_Dissolve),_ShaderMode);
  float mask=texture(_MaskTex,maskuv).r*_Mask_CT.w-dissolve;
  float den=max(noise,.000001);
  float border=mix(step(noise,mask-_Edge_Width),S(_Edge_Smooth,1.,S(0.,1.,(mask-_Edge_Width)/den)),_SmoothBorder);
  rgb=mix(edge,rgb*vColor.rgb,border);
  if(_PortraitTile>.5){
    vec2 tu=StyleUV(uv,_TileTex_ST,_Tile_CT,_TileTex_Panner_Once,iuv.w,_PolarUV_Tile);
    float tr=texture(_TileTex,tu).r;
    tr=mix(tr,1.-tr,_Tile_OneMinus)*border*_Tile_CT.w;
    tr*=mix(1.,mix(axis,1.-axis,_Mask_Oneminus),_Tile_Mask);
    rgb=mix(rgb+_Tile_Color.rgb*tr,mix(rgb,_Tile_Color.rgb*tr,tr),_Dark_Set);
  }
  if(!gl_FrontFacing) rgb=rgb*_BackColor.rgb+_BackColor_Add*(rgb+_BackColor.rgb-rgb*_BackColor.rgb);
  rgb*=vColor.rgb;
  vec3 N=vNormal*inversesqrt(max(dot(vNormal,vNormal),.000001)), V=normalize(uCameraPos-vWorld);
  float f=min(pow(max(1.-dot(V,N),.000001),_Fresnel_Intensity),1.);
  f=mix(f,1.-f,_Fresnel_Oneminus)*_Fresnel;
  rgb=mix(rgb,_Fresnel_Color.rgb,f)*mix(vec3(1),_PortraitZoneLight.rgb,_LightColor_Set);
  float alpha=mix(main.a,main.r,_MainTex_Channel_R_A);
  if(_PortraitMask>.5){ float ab=mix(step(noise,mask),S(_Alpha_Clip_Smooth,1.,S(0.,1.,mask/den)),_SmoothBorder); alpha=ab*mix(alpha,1.,_Mask_Type); }
  alpha*=mix(vColor.a,1.,_Trail_Dissolve)*mix(1.,f,_Mask_Fresenl);
  vec2 su=StyleUV(uv,_Soft_MaskTex_ST,_Soft_Mask_CT,0.,0.,_PolarUV_Soft_Mask);
  float soft=texture(_Soft_MaskTex,su).r;
  soft=mix(soft,1.-soft,_Soft_Mask_Oneminus)*_Soft_Mask_CT.w;
  alpha=sat(alpha*mix(1.,soft,_SoftMask))*_Alpha_CT*FresnelAlpha(N,V);
  if(alpha-.5*_AlphaTest<0.) discard;
  alpha*=_FadeRate*_Color.a; rgb=max(rgb,vec3(0))*_Color.rgb;
  outColor=vec4(ToSrgb(max(rgb,vec3(0))),sat(alpha));
}`;

const GALAXY_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uView;
uniform sampler2D _MainTex, _Mask, _StarTex, _StarMaskTex, _LineTex, _FlowLightTex, _LineFlowTex, _GalaxyTex, _Fresnel_Mask;
uniform vec4 _Color, _StarColor, _StarParam, _StarColor_2, _StarParam_2, _LineTint, _LineStaticColor, _FlowColor, _FlowParam, _SpecularColor;
uniform vec4 _LineFlowParam, _GalaxyColor, _GalaxyParam, _Fresnel_Color, _Fresnel_Param;
uniform float _StarUVType, _StarMaskScale, _StarMaskSpeedX, _StarMaskSpeedY, _starSmooth, _StarTwinklePower, _StarTwinkleType, _StarBlendPower;
uniform float _FlowPow, _FlowSpeed, _LineIntensity, _LineRange, _LineFlowIntensity, _PortraitEffectTime, _PortraitGalaxy, _PortraitFlow, _PortraitFresnel;
out vec4 outColor;
float Twinkle(float a,float mask){ return mix(smoothstep(0.,max(_starSmooth,.00001),a-mask),smoothstep(.2,.2+max(_starSmooth,.00001),a)*mask,_StarTwinkleType); }
void main(){
  float t=_PortraitEffectTime; vec2 uv=vUvRaw;
  vec3 N=normalize(vNormal), V=vec3(uView[0][2],uView[1][2],uView[2][2]);
  vec4 mask=texture(_Mask,uv);
  vec3 color=GammaToLinearSpace(texture(_MainTex,uv).rgb)*_Color.rgb;
  if(_PortraitGalaxy>.5) color=mix(color,GammaToLinearSpace(texture(_GalaxyTex,vWorld.xy*_GalaxyParam.xy+t*_GalaxyParam.zw).rgb)*_GalaxyColor.rgb,mask.a*_GalaxyColor.a);
  vec2 uv1=mix(vWorld.xy,uv,_StarUVType), uv2=mix(vWorld.zy,uv,_StarUVType);
  vec3 weights=max(pow(abs(N),vec3(_StarBlendPower)),vec3(.0001)); weights/=weights.x+weights.y+weights.z;
  vec4 a=texture(_StarTex,uv1*_StarParam.xy+t*_StarParam.zw)*weights.z+texture(_StarTex,uv2*_StarParam.xy+t*_StarParam.zw)*weights.x;
  float sm=sat(texture(_StarMaskTex,uv1*_StarMaskScale+t*vec2(_StarMaskSpeedX,_StarMaskSpeedY)).g+_StarTwinklePower);
  color+=GammaToLinearSpace(a.rgb)*Twinkle(a.a,sm)*mask.r*_StarColor.rgb*_StarColor.a;
  vec4 b=texture(_StarTex,uv1*_StarParam_2.xy+t*_StarParam_2.zw);
  color+=GammaToLinearSpace(b.rgb)*Twinkle(b.a,sm)*mask.r*_StarColor_2.rgb*_StarColor_2.a;
  if(_PortraitFlow>.5){
    float coord=uv.x*_LineFlowParam.x+t*_LineFlowParam.z;
    float offset=texture(_LineFlowTex,vec2(coord,coord)).r*_LineFlowIntensity;
    vec4 lineSample=texture(_LineTex,uv+offset*mask.g);
    color=mix(color,_LineStaticColor.rgb,mask.b);
    color=mix(color,GammaToLinearSpace(lineSample.rgb)*_LineTint.rgb,lineSample.a);
    float spec=sat(pow(max(dot(V,N),.000001),_LineRange)*(mask.b+lineSample.a));
    color+=spec*_SpecularColor.rgb*_LineIntensity;
    float flow=pow(max(texture(_FlowLightTex,uv*_FlowParam.xy+t*_FlowSpeed*.1*_FlowParam.zw).g,.000001),max(_FlowPow,.000061));
    color+=sat(flow*(mask.b+lineSample.a))*_FlowColor.rgb*_FlowColor.a;
  }
  if(_PortraitFresnel>.5){
    float fres=sat(1.-dot(N,V));
    fres=sat(fres+texture(_Fresnel_Mask,uv*_Fresnel_Param.x).r*fres*_Fresnel_Param.y);
    fres=smoothstep(_Fresnel_Param.z-_Fresnel_Param.w,_Fresnel_Param.z+_Fresnel_Param.w,fres)*texture(_Fresnel_Mask,uv).r*_Fresnel_Color.a;
    color=mix(color,_Fresnel_Color.rgb,fres);
  }
  outColor=vec4(LinearToGammaSpace(max(color,vec3(0))),1);
}`;

const LIQUID_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uObject, uView;
uniform sampler2D _MainTex, _WaveTex;
uniform vec4 _Color, _MidTint, _DarkTint, _WaveTexUVParam, _LiquidColor, _LiquidDarkColor, _LiquidLineColor, _LiquidMask_ST, _LiquidFresnel_Param, _LiquidFresnel_Color;
uniform vec4 _LiquidTopColor, _LiquidTopDarkColor, _LiquidTop_ST, _LiquidPupple_Color, _LiquidPupple_TexUVParam;
uniform vec4 _ProbeLightDirection, _ProbeZoneColor, _ProbeAmbientColor;
uniform float _MeshType, _Cutoff, _LightProbWeight, _ShadowFeather, _ShadowThreshold, _DarkThreshold, _EnvColorWeight;
uniform float _CharInfo_FeetHeight, _CharInfo_HeadHeight, _CharInfo_OriginalHeight, _Height, _LightHeight, _Alpha, _WavePower;
uniform float _LiquidMask_WavePower, _LiquidTop_WavePower, _LiquidPupple_Size, _LiquidPupple_Smooth, _LiquidPupple_WavePower;
uniform float _PortraitEffectTime, _ProbeZoneIntensity, _ProbeSH;
out vec4 outColor;
void main(){
  vec2 uv=vUvRaw; vec3 relative=vWorld-uObject[3].xyz;
  float wave=texture(_WaveTex,relative.xz*_WaveTexUVParam.xy+_PortraitEffectTime*_WaveTexUVParam.zw).r;
  float height=(2.*_Height-1.)*length(uObject[1].xyz);
  height*=mix(1.,(_CharInfo_HeadHeight-_CharInfo_FeetHeight)/max(_CharInfo_OriginalHeight,.01),_MeshType);
  float y=relative.y+_WavePower*wave;
  float inside=step(y,height+_LightHeight);
  if(inside-max(_Cutoff,.000061)<0.) discard;
  vec3 N=normalize(vNormal), V=normalize(vec3(uView[0][2],uView[1][2],uView[2][2]));
  vec3 base;
  if(gl_FrontFacing){
    float mask=texture(_MainTex,uv*_LiquidMask_ST.xy+_LiquidMask_ST.zw+wave*_LiquidMask_WavePower).r;
    base=mix(_LiquidDarkColor.rgb,_LiquidColor.rgb,mask);
    float fresnel=_LiquidFresnel_Param.x+_LiquidFresnel_Param.y*pow(max(1.-dot(N,V),0.),_LiquidFresnel_Param.z);
    base=mix(base,_LiquidFresnel_Color.rgb,fresnel)+(inside-step(y,height))*_LiquidLineColor.rgb;
    float bubble=texture(_MainTex,uv*_LiquidPupple_TexUVParam.xy+_PortraitEffectTime*_LiquidPupple_TexUVParam.zw+wave*_LiquidPupple_WavePower).b;
    float amount=sat((bubble-max(relative.y+_LiquidPupple_Size,.01))/max(_LiquidPupple_Smooth,.000061));
    base+=amount*amount*(3.-2.*amount)*_LiquidPupple_Color.rgb;
  } else {
    float top=texture(_MainTex,uv*_LiquidTop_ST.xy+_PortraitEffectTime*_LiquidTop_ST.zw+wave*_LiquidTop_WavePower).g;
    base=mix(_LiquidTopDarkColor.rgb,_LiquidTopColor.rgb,top);
  }
  base*=_Color.rgb;
  float h=dot(N,normalize(_ProbeLightDirection.xyz))*.5+.5;
  float feather=max(_ShadowFeather,.000061);
  float a=sat((h-(_ShadowThreshold-_ShadowFeather))/feather);
  float b=sat((h-(_ShadowThreshold*_DarkThreshold-_ShadowFeather))/feather);
  vec3 dark=base*_DarkTint.rgb; vec3 tone=mix(dark,base,a); tone=mix(tone,base*_MidTint.rgb,a*(1.-a)); tone=mix(dark,tone,b);
  vec3 direct=min(_ProbeZoneIntensity,1.5)*mix(vec3(1),_ProbeZoneColor.rgb,_EnvColorWeight);
  float weight=sat((1.-_EnvColorWeight)*(1.-a)+a);
  vec3 ambient=max(mix(base,base*_ProbeAmbientColor.rgb,_ProbeAmbientColor.a),vec3(.000061));
  vec3 color=direct*mix(ambient,tone,weight)+_ProbeSH*_LightProbWeight*base;
  outColor=vec4(max(color,vec3(0)),sat(_Color.a*_Alpha));
}`;

// Approximation of Unity Standard (Fade) under RenderPose's lights, gamma color space.
const STANDARD_FS = COMMON + GAMMA_HELPERS + FX_VARYINGS + `
uniform mat4 uView; uniform sampler2D _MainTex; uniform vec4 _Color, _EmissionColor; uniform float _Glossiness, _Metallic;
uniform vec3 uLightDir[3], uLightColor[3]; uniform vec3 uAmbient;
out vec4 outColor;
void main(){
  vec4 albedo=texture(_MainTex,vUv)*_Color; vec3 N=normalize(vNormal), V=vec3(uView[0][2],uView[1][2],uView[2][2]);
  vec3 diffuse=uAmbient, spec=vec3(0); float rough=max(1.-_Glossiness,.08), a2=rough*rough*rough*rough;
  for(int i=0;i<3;i++){ vec3 L=uLightDir[i]; float nl=max(dot(N,L),0.); diffuse+=uLightColor[i]*nl;
    vec3 H=normalize(L+V); float nh=max(dot(N,H),0.), d=nh*nh*(a2-1.)+1.; spec+=uLightColor[i]*nl*a2/(3.14159*d*d+1e-5)*0.2209; }
  vec3 color=albedo.rgb*(1.-_Metallic)*diffuse+spec*0.25+_EmissionColor.rgb;
  outColor=vec4(color,albedo.a);
}`;

(function install() {
  Object.assign(KIND, { 'AFK/Avatar Layered Effect': 'layered', 'AFKRecovered/EffectFXStyle': 'fxstyle', 'AFKRecovered/EffectGalaxy': 'galaxy', 'AFKRecovered/EffectLiquid': 'liquid', 'Standard': 'standard' });
  const ZTEST = [0x0207, 0x0200, 0x0201, 0x0202, 0x0203, 0x0204, 0x0205, 0x0206, 0x0207]; // Unity CompareFunction -> GL
  const DEFAULTS = {
    layered: { _MainTex: 'white', _BlendTex: 'white', _MaskTex: 'white', _Soft_MaskTex: 'white', _AFKVertexMask: 'white' },
    fxstyle: { _MainTex: 'white', _TileTex: 'white', _MaskTex: 'white', _Soft_MaskTex: 'white', _VertSecondaryMask: 'white' },
    galaxy: { _MainTex: 'white', _Fresnel_Mask: 'white', _UIModelInternalLut: 'white', _OutlineDetailTex: 'white', _OutlineDetailTex2: 'white', _EFX_Mask: 'white', _EFX_STARFIELD_Tex: 'white' },
    liquid: { _MainTex: 'white', _WaveTex: 'white' },
    standard: { _MainTex: 'white' },
  };
  const proto = WardrobeRenderer.prototype, basePass = proto.passState, baseDefault = proto.textureDefault;
  proto.textureDefault = function (kind, name) { return DEFAULTS[kind] ? (DEFAULTS[kind][name] || 'black') : baseDefault.call(this, kind, name); };
  // RenderPose's DialoguePoseKey / Fill / Rim directional lights (Euler pitch, yaw; intensity; color).
  const lights = [[35, -35, 1.15, [1, .94, .86]], [20, 145, .7, [.68, .8, 1]], [-35, 180, .85, [.78, .7, 1]]].map(([pitch, yaw, k, c]) => {
    const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180, forward = [Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
    return { dir: forward.map(v => -v), color: c.map(v => v * k) };
  });
  proto.passState = function (d) {
    const v = d.material.values;
    switch (d.kind) {
      case 'layered': return { program: this.program('fx-layered', SKIN_VS, LAYERED_FS), blend: [5, v._AFKDestinationBlend ?? 10, 1, 10], depthWrite: (v._AFKDepthWrite ?? 0) > .5, cull: v._CullMode ?? 0 };
      case 'fxstyle': return { program: this.program('fx-style', FX_VS, FXSTYLE_FS), blend: [5, v._BlendMode ?? 10, 1, 10], depthWrite: (v._Z_Write ?? 0) > .5, depthFunc: ZTEST[v._Z_Test ?? 4], cull: v._CullMode ?? 0 };
      case 'galaxy': return { program: this.program('fx-galaxy', SKIN_VS, GALAXY_FS), blend: [1, 0, 1, 0], depthWrite: true, cull: v._CullMode ?? 2 };
      case 'liquid': return { program: this.program('fx-liquid', SKIN_VS, LIQUID_FS), blend: [5, 10, 5, 10], depthWrite: (v._ZWriteMode ?? 1) > .5, cull: 0 };
      case 'standard': {
        const program = this.program('fx-standard', SKIN_VS, STANDARD_FS), gl = this.gl;
        if (!program.lightsSet) { // uniforms persist per program; restore whichever program was bound
          const previous = gl.getParameter(gl.CURRENT_PROGRAM); gl.useProgram(program.p);
          gl.uniform3fv(program.uniforms['uLightDir[0]'].loc, lights.flatMap(l => l.dir)); gl.uniform3fv(program.uniforms['uLightColor[0]'].loc, lights.flatMap(l => l.color));
          gl.uniform3f(program.uniforms.uAmbient.loc, .212, .227, .259); // Unity default ambient sky color
          gl.useProgram(previous); program.lightsSet = true;
        }
        const src = v._SrcBlend ?? 1, dst = v._DstBlend ?? 0;
        return { program, blend: [src, dst, src, dst], depthWrite: (v._ZWrite ?? 1) > .5, cull: 2 };
      }
      default: return basePass.call(this, d);
    }
  };
})();
