/* Fixed-camera experiment, not a general 3D renderer.
 * Input: bottom-up RGBA Float32 buffers. Base RGB is the capture's HDR gamma
 * framebuffer; gbuffer=(view normal XY, linear eye depth, rim switch).
 * Mirrors PortraitRecoveredLighting/Grade/Bloom shaders in the capture tools.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AvatarCompositor=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const B=typeof module==='object'&&module.exports?require('./buffer-view.js'):globalThis.BufferView,read=(buffer,i)=>B.get(buffer,i);
  const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  const fromSrgb=x=>x<.04045?x/12.92:Math.pow(Math.max((x+.055)/1.055,0),2.4);
  const toSrgb=x=>x<.0031308?x*12.92:1.055*Math.pow(Math.max(x,0),1/2.4)-.055;
  const vec=(v,fallback)=>Array.isArray(v)?v:v?['x','y','z'].map(k=>v[k]):fallback;
  const defaults={intensity:1,zoneColor:[1,1,1],rim:1,rimWidth:1.75,rimLength:0,rimFeather:1,rimSideExponent:10.5,
    rimColor:[.155126363,.271165937,.396226406],bloom:2,bloomThreshold:1,bloomClamp:65472,bloomScatter:.7,
    bloomSkipIterations:1,bloomQualitySkip:0,neutral:1,lut:.85,unpremultiply:false};
  function halfExact(value){
    if(!Number.isFinite(value)||value===0)return value;
    const sign=value<0?-1:1, magnitude=Math.abs(value);
    if(magnitude>=65520)return sign*Infinity;
    const step=magnitude<.00006103515625?Math.pow(2,-24):Math.pow(2,Math.floor(Math.log2(magnitude))-10);
    const scaled=magnitude/step, integer=Math.floor(scaled), fraction=scaled-integer;
    return sign*step*(fraction>.5||fraction===.5&&integer%2?integer+1:integer);
  }
  // Math.f16round rounds a double to float16 exactly like halfExact, about twice as fast.
  const half=typeof Math.f16round==='function'?Math.f16round:halfExact;
  // Composed values are already float16, so their sRGB decode can be read from an
  // exact table indexed by the half bits. Other values use the formula.
  const F16=typeof Float16Array==='function'?new Float16Array(1):null,F16_BITS=F16?new Uint16Array(F16.buffer):null;
  let FROM_SRGB_HALF=null;
  function fromSrgbFast(value){
    if(!F16)return fromSrgb(value);
    F16[0]=value;
    if(F16[0]!==value&&value===value)return fromSrgb(value);
    if(!FROM_SRGB_HALF){FROM_SRGB_HALF=new Float64Array(65536);for(let bits=0;bits<65536;bits++){F16_BITS[0]=bits;FROM_SRGB_HALF[bits]=fromSrgb(F16[0]);}F16[0]=value;}
    return FROM_SRGB_HALF[F16_BITS[0]];
  }
  function sample(image,u,v,channel=0){
    const x=clamp(u*image.width-.5,0,image.width-1),y=clamp(v*image.height-.5,0,image.height-1);
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,image.width-1),y1=Math.min(y0+1,image.height-1);
    const a=image.data[(y0*image.width+x0)*4+channel],b=image.data[(y0*image.width+x1)*4+channel];
    const c=image.data[(y1*image.width+x0)*4+channel],d=image.data[(y1*image.width+x1)*4+channel];
    return mix(mix(a,b,x-x0),mix(c,d,x-x0),y-y0);
  }
  function sample3(image,u,v,out){
    const x=clamp(u*image.width-.5,0,image.width-1),y=clamp(v*image.height-.5,0,image.height-1);
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,image.width-1),y1=Math.min(y0+1,image.height-1),fx=x-x0,fy=y-y0;
    const d=image.data,a=(y0*image.width+x0)*4,b=(y0*image.width+x1)*4,c=(y1*image.width+x0)*4,e=(y1*image.width+x1)*4;
    out[0]=mix(mix(d[a],d[b],fx),mix(d[c],d[e],fx),fy);
    out[1]=mix(mix(d[a+1],d[b+1],fx),mix(d[c+1],d[e+1],fx),fy);
    out[2]=mix(mix(d[a+2],d[b+2],fx),mix(d[c+2],d[e+2],fx),fy);
    return out;
  }
  function image(width,height){return {width,height,data:new Float32Array(width*height*4)};}
  // Bilinear sample positions depend only on the column or the row, so each pass
  // computes them once with the same expressions sample() uses.
  function axis(count,size,coordinate){
    const low=new Int32Array(count),high=new Int32Array(count),fraction=new Float64Array(count);
    for(let i=0;i<count;i++){const t=clamp(coordinate(i)*size-.5,0,size-1),t0=Math.floor(t);low[i]=t0;high[i]=Math.min(t0+1,size-1);fraction[i]=t-t0;}
    return {low,high,fraction};
  }
  function blend(image,xs,xi,ys,yi,out){
    const d=image.data,w=image.width,fx=xs.fraction[xi],fy=ys.fraction[yi],r0=ys.low[yi]*w,r1=ys.high[yi]*w;
    const a=(r0+xs.low[xi])*4,b=(r0+xs.high[xi])*4,c=(r1+xs.low[xi])*4,e=(r1+xs.high[xi])*4;
    out[0]=mix(mix(d[a],d[b],fx),mix(d[c],d[e],fx),fy);
    out[1]=mix(mix(d[a+1],d[b+1],fx),mix(d[c+1],d[e+1],fx),fy);
    out[2]=mix(mix(d[a+2],d[b+2],fx),mix(d[c+2],d[e+2],fx),fy);
  }
  function bloom(source,profile,quantize){
    // A Float16Array rounds on write exactly like half(), without a call per value.
    const native=quantize===half&&typeof Float16Array==='function';
    const image=(w,h)=>({width:w,height:h,data:native?new Float16Array(w*h*4):new Float32Array(w*h*4)}),q=native?v=>v:quantize;
    let width=Math.max(1,Math.floor(source.width/2)),height=Math.max(1,Math.floor(source.height/2));
    const count=clamp(Math.floor(Math.log2(Math.max(width,height)))-1-profile.bloomSkipIterations-profile.bloomQualitySkip,1,16);
    const threshold=fromSrgb(profile.bloomThreshold),knee=threshold*.5,scatter=.05+.9*clamp(profile.bloomScatter);
    const s0=new Float64Array(3),s1=new Float64Array(3),s2=new Float64Array(3),s3=new Float64Array(3),s4=new Float64Array(3);
    let first=image(width,height);const down=[first];
    {
      const w=width,h=height,xs=axis(w,source.width,x=>(x+.5)/w),ys=axis(h,source.height,y=>(y+.5)/h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;blend(source,xs,x,ys,y,s0);
        const r=Math.min(fromSrgb(s0[0]),profile.bloomClamp),g=Math.min(fromSrgb(s0[1]),profile.bloomClamp),b=Math.min(fromSrgb(s0[2]),profile.bloomClamp);
        const brightness=Math.max(r,g,b);let soft=clamp(brightness-threshold+knee,0,2*knee);soft=soft*soft/(4*knee+.0001);
        const contribution=Math.max(soft,brightness-threshold)/Math.max(brightness,.0001);
        first.data[i]=q(Math.max(r*contribution,0));first.data[i+1]=q(Math.max(g*contribution,0));first.data[i+2]=q(Math.max(b*contribution,0));
      }
    }
    const weights=[.194595,.121622,.054054,.016216];
    for(let level=1;level<count;level++){
      const source=down[level-1];width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));
      const w=width,h=height,horizontal=image(w,h),vertical=image(w,h);
      // Horizontal: centre plus four taps each side at the previous level.
      const center=axis(w,source.width,x=>(x+.5)/w),rows=axis(h,source.height,y=>(y+.5)/h);
      const left=[],right=[];
      for(let k=1;k<=4;k++){left.push(axis(w,source.width,x=>(x+.5)/w-k*2/source.width));right.push(axis(w,source.width,x=>(x+.5)/w+k*2/source.width));}
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;blend(source,center,x,rows,y,s0);
        let r=s0[0]*.227027,g=s0[1]*.227027,b=s0[2]*.227027;
        for(let k=0;k<4;k++){blend(source,left[k],x,rows,y,s1);blend(source,right[k],x,rows,y,s2);const wk=weights[k];r+=(s1[0]+s2[0])*wk;g+=(s1[1]+s2[1])*wk;b+=(s1[2]+s2[2])*wk;}
        horizontal.data[i]=q(r);horizontal.data[i+1]=q(g);horizontal.data[i+2]=q(b);
      }
      // Vertical: same level, centre plus two linear taps each side.
      const columns=axis(w,w,x=>(x+.5)/w),mid=axis(h,h,y=>(y+.5)/h);
      const up1=axis(h,h,y=>(y+.5)/h-1.384615/h),down1=axis(h,h,y=>(y+.5)/h+1.384615/h),up2=axis(h,h,y=>(y+.5)/h-3.230769/h),down2=axis(h,h,y=>(y+.5)/h+3.230769/h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        blend(horizontal,columns,x,mid,y,s0);blend(horizontal,columns,x,up1,y,s1);blend(horizontal,columns,x,down1,y,s2);blend(horizontal,columns,x,up2,y,s3);blend(horizontal,columns,x,down2,y,s4);
        for(let c=0;c<3;c++)vertical.data[i+c]=q(s0[c]*.227027+(s1[c]+s2[c])*.316216+(s3[c]+s4[c])*.070270);
      }
      down.push(vertical);
    }
    let low=down.at(-1);
    for(let level=count-2;level>=0;level--){
      const high=down[level],up=image(high.width,high.height),w=up.width,h=up.height;
      const hx=axis(w,high.width,x=>(x+.5)/w),hy=axis(h,high.height,y=>(y+.5)/h),lx=axis(w,low.width,x=>(x+.5)/w),ly=axis(h,low.height,y=>(y+.5)/h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;blend(high,hx,x,hy,y,s1);blend(low,lx,x,ly,y,s2);
        up.data[i]=q(mix(s1[0],s2[0],scatter));up.data[i+1]=q(mix(s1[1],s2[1],scatter));up.data[i+2]=q(mix(s1[2],s2[2],scatter));
      }
      low=up;
    }
    return low;
  }
  function neutral(value){const v=Math.max(value,0),a=v*.262677+.0696,b=v*1.313386,c=b*(v*.262677+.29)+.0816;return ((b*a+.00544)/c-.066667)*1.313386;}
  function lookup(lut,rgb){
    const n=lut.height,p=rgb.map(c=>clamp(c)*(n-1)),slice=Math.floor(p[2]);
    const u=(p[0]+.5)/lut.width+slice/n,v=(p[1]+.5)/lut.height;
    return [0,1,2].map(c=>mix(sample(lut,u,v,c),sample(lut,u+1/n,v,c),p[2]-slice)/255);
  }
  // Direct reads of full or cropped buffers, returning exactly what BufferView.get
  // returns, without per-read division and destructuring.
  function view(buffer,width,channels){
    if(!B.cropped(buffer))return {data:buffer,crop:false,width,channels};
    const [left,bottom,w,h]=buffer.rect;
    return {data:buffer.data,crop:true,width:buffer.width,channels:buffer.channels,left,bottom,w,h,background:buffer.background};
  }
  function offset(v,x,y){
    if(!v.crop)return (y*v.width+x)*v.channels;
    const cx=x-v.left,cy=y-v.bottom;
    return cx>=0&&cx<v.w&&cy>=0&&cy<v.h?(cy*v.w+cx)*v.channels:-1;
  }
  function composeFrame(layers,context,options={}){
    const {width,height,farClip}=context,profile={...defaults,...context.profile};
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||!Number.isFinite(farClip)||farClip<=0)throw new Error('Invalid capture dimensions or far clip.');
    if(!Array.isArray(layers)||!layers.length||layers.length>32)throw new Error('Supply between 1 and 32 layers.');
    const pixels=width*height,size=pixels*4;
    for(const layer of layers)for(const key of ['base','gbuffer'])if(!B.valid(layer[key],size))throw new Error('Invalid '+key+' buffer for '+layer.id);
    for(const layer of layers)for(const patch of layer.patches||[]){
      const r=patch.rect,buffer=patch.blend||patch.delta;
      if(!Array.isArray(r)||r.length!==4||r.some(v=>!Number.isSafeInteger(v)||v<0)||r[0]+r[2]>width||r[1]+r[3]>height||(patch.blend&&patch.delta)||!B.valid(buffer,r[2]*r[3]*4))throw new Error('Invalid appearance patch.');
    }
    for(const overlay of context.overlays||[])if(!B.valid(overlay.color,size)||overlay.combinationSpecific!==true)throw new Error('Overlays require a matching buffer and combinationSpecific:true.');
    const surfaces=[...(context.surfaces||[])];
    for(const surface of surfaces){
      if(!Array.isArray(surface.levels)||surface.levels.length>32||![surface.queue,surface.sortingLayer,surface.sortingOrder,surface.distance].every(Number.isFinite))throw new Error('Invalid reusable transparent surface.');
      for(const level of surface.levels){
        if(!B.valid(level.depth,pixels))throw new Error('Invalid transparent depth stack.');
        for(const name of ['color','transmission'])if(!B.valid(level[name],size))throw new Error('Invalid transparent '+name+' stack.');
      }
    }
    const zone=vec(profile.zoneColor,[1,1,1]),rimTint=vec(profile.rimColor,defaults.rimColor);
    if(zone.some(c=>Math.abs(c-1)>1e-6)||profile.intensity!==1||profile.globalFactor)throw new Error('This experiment requires dialogue white zone light, intensity 1 and no global darkening.');
    const lighting=options.rim!==false&&profile.rim>0;
    // With half precision, a Float16Array working frame rounds every write exactly
    // like half(); it is widened to the usual Float32Array once at the end.
    const native=options.half!==false&&half===Math.f16round&&typeof Float16Array==='function';
    const quantize=options.half===false||native?x=>x:half;
    const composed={width,height,data:native?new Float16Array(pixels*4):new Float32Array(pixels*4)};
    const depth=new Float32Array(pixels).fill(farClip),winner=new Int16Array(pixels).fill(-1);
    const bases=layers.map(l=>view(l.base,width,4)),gbuffers=layers.map(l=>view(l.gbuffer,width,4));
    // Ordinary patches add a delta. A computed body paint or makeup ("blend") stores
    // keep and colour, and paints over the skinned pixel in linear light afterwards.
    const patches=layers.map(l=>(l.patches||[]).filter(patch=>!patch.blend).map(patch=>({rect:patch.rect,skin:patch.slot==='skin',delta:view(patch.delta,patch.rect[2],4)})));
    const blends=layers.map(l=>(l.patches||[]).filter(patch=>patch.blend).map(patch=>({rect:patch.rect,blend:view(patch.blend,patch.rect[2],4)})));
    for(let k=0;k<layers.length;k++){
      const gb=gbuffers[k],[left,bottom,w,h]=B.bounds(layers[k].gbuffer,width,height,2,d=>d>0&&d<farClip);
      for(let y=bottom;y<bottom+h;y++)for(let x=left;x<left+w;x++){
        const p=y*width+x,o=offset(gb,x,y),d=o>=0?gb.data[o+2]:gb.background[2];if(d>0&&d<depth[p]){depth[p]=d;winner[p]=k;}
      }
    }
    const light=context.lightVS||[1,0],length=Math.max(Math.hypot(light[0],light[1]),.000061),lx=light[0]/length,ly=light[1]/length;
    const rimPower=new Float64Array(3);
    for(let y=0,p=0;y<height;y++)for(let x=0;x<width;x++,p++){
      const k=winner[p];if(k<0)continue;
      const i=p*4,base=bases[k],gb=gbuffers[k],bo=offset(base,x,y),go=offset(gb,x,y);
      let d0=0,d1=0,d2=0,d3=0,skin0=0,skin1=0,skin2=0;
      for(const patch of patches[k]){const [left,bottom,w,h]=patch.rect;if(x>=left&&x<left+w&&y>=bottom&&y<bottom+h){
        const v=patch.delta,o=offset(v,x-left,y-bottom);
        if(o>=0){d0+=v.data[o];d1+=v.data[o+1];d2+=v.data[o+2];d3+=v.data[o+3];}else{d0+=v.background[0];d1+=v.background[1];d2+=v.background[2];d3+=v.background[3];}
        if(patch.skin){skin0+=o>=0?v.data[o]:v.background[0];skin1+=o>=0?v.data[o+1]:v.background[1];skin2+=o>=0?v.data[o+2]:v.background[2];}
      }}
      for(const patch of blends[k]){const [left,bottom,w,h]=patch.rect;if(x>=left&&x<left+w&&y>=bottom&&y<bottom+h){
        const v=patch.blend,o=offset(v,x-left,y-bottom);
        const keep=o>=0?v.data[o]:v.background[0],c0=o>=0?v.data[o+1]:v.background[1],c1=o>=0?v.data[o+2]:v.background[2],c2=o>=0?v.data[o+3]:v.background[3];
        if(keep===1&&c0===0&&c1===0&&c2===0)continue;
        // Captured overlays are independent deltas. Preserve eye and eyebrow
        // patches, and any other overlay, instead of painting over their sum.
        const s0=(bo>=0?base.data[bo]:base.background[0])+skin0,s1=(bo>=0?base.data[bo+1]:base.background[1])+skin1,s2=(bo>=0?base.data[bo+2]:base.background[2])+skin2;
        d0+=toSrgb(keep*fromSrgb(s0)+c0)-s0;d1+=toSrgb(keep*fromSrgb(s1)+c1)-s1;d2+=toSrgb(keep*fromSrgb(s2)+c2)-s2;
      }}
      let edge=0,weight=0;
      if(lighting&&(go>=0?gb.data[go+3]:gb.background[3])>=.5){
        const nx=go>=0?gb.data[go]:gb.background[0],ny=go>=0?gb.data[go+1]:gb.background[1];
        weight=(Math.max(nx*lx+ny*ly,.001)+profile.rimLength)/(1+profile.rimLength);
        const u=(x+.5)/width+nx*profile.rimWidth*weight*.00125,v=(y+.5)/height+ny*profile.rimWidth*weight*.00125;
        const neighbor=depth[clamp(Math.floor(v*height),0,height-1)*width+clamp(Math.floor(u*width),0,width-1)];
        edge=clamp(neighbor-depth[p])/Math.max(profile.rimFeather,.000061);
      }
      const b0=bo>=0?base.data[bo]:base.background[0],b1=bo>=0?base.data[bo+1]:base.background[1];
      const b2=bo>=0?base.data[bo+2]:base.background[2],b3=bo>=0?base.data[bo+3]:base.background[3];
      if(edge>0){
        const side=Math.pow(clamp(weight),profile.rimSideExponent);
        for(let c=0;c<3;c++)rimPower[c]=clamp(edge*mix(rimTint[c],zone[c],side))*profile.rim;
        composed.data[i]=quantize(toSrgb(fromSrgb(b0+d0)+rimPower[0]));
        composed.data[i+1]=quantize(toSrgb(fromSrgb(b1+d1)+rimPower[1]));
        composed.data[i+2]=quantize(toSrgb(fromSrgb(b2+d2)+rimPower[2]));
      }else{
        composed.data[i]=quantize(b0+d0);composed.data[i+1]=quantize(b1+d1);composed.data[i+2]=quantize(b2+d2);
      }
      composed.data[i+3]=quantize(b3+d3);
    }
    // A reusable surface contains cumulative native blending up to each depth.
    // Select only the prefix in front of the OTHER selected items, retaining
    // the original triangle order within a draw (depth-sorting fragments would
    // change two-sided veil blending). Re-evaluate after depth-writing effects.
    surfaces.sort((a,b)=>a.queue-b.queue||a.sortingLayer-b.sortingLayer||a.sortingOrder-b.sortingOrder||b.distance-a.distance);
    for(const surface of surfaces){
      let left=width,bottom=height,right=0,top=0;
      for(const level of surface.levels){const [x,y,w,h]=B.bounds(level.depth,width,height,0,d=>d>0&&d<farClip-.001);left=Math.min(left,x);bottom=Math.min(bottom,y);right=Math.max(right,x+w);top=Math.max(top,y+h);}
      const levels=surface.levels.map(level=>({depth:view(level.depth,width,1),color:view(level.color,width,4),transmission:view(level.transmission,width,4)}));
      const firstDepth=levels[0]?.depth;
      for(let y=bottom;y<top;y++)for(let x=left;x<right;x++){
      const p=y*width+x;
      let selected=null;
      for(const level of levels){const o=offset(level.depth,x,y),d=o>=0?level.depth.data[o]:level.depth.background[0];if(d>0&&d<farClip-.001&&d<=depth[p]+.00001)selected=level;}
      if(!selected)continue;
      const i=p*4,co=offset(selected.color,x,y),to=offset(selected.transmission,x,y);
      for(let c=0;c<4;c++)composed.data[i+c]=quantize((co>=0?selected.color.data[co+c]:selected.color.background[c])+composed.data[i+c]*(to>=0?selected.transmission.data[to+c]:selected.transmission.background[c]));
      if(surface.depthWrite){const o=offset(firstDepth,x,y);depth[p]=Math.min(depth[p],o>=0?firstDepth.data[o]:firstDepth.background[0]);}
      }
    }
    // A black/white backing pair captures native per-channel transmission, with
    // opaque depth still present. It is valid only for this exact recipe/view.
    // Older captures without transmission retain their source-over fallback.
    for(const overlay of context.overlays||[]){
      if(overlay.transmission){
        if(!B.valid(overlay.transmission,size))throw new Error('Invalid captured transparent transmission.');
        for(let i=0;i<size;i++)composed.data[i]=quantize(read(overlay.color,i)+composed.data[i]*read(overlay.transmission,i));
        continue;
      }
      for(let i=0;i<size;i+=4){
      const alpha=clamp(read(overlay.color,i+3));
      for(let c=0;c<3;c++)composed.data[i+c]=quantize(read(overlay.color,i+c)+composed.data[i+c]*(1-alpha));
      composed.data[i+3]=quantize(alpha+composed.data[i+3]*(1-alpha));
      }
    }
    return native?new Float32Array(composed.data):composed.data;
  }
  function compose(layers,context,options={}){
    return postprocess(composeFrame(layers,context,options),context,options);
  }
  function postprocess(raw,context,options={}){
    const {width,height}=context,profile={...defaults,...context.profile},size=width*height*4;
    if(!(raw instanceof Float32Array)||raw.length!==size)throw new Error('Invalid complete framebuffer.');
    const composed={width,height,data:raw},doBloom=options.bloom!==false&&profile.bloom>0,doGrade=options.grade!==false;
    const quantize=options.half===false?x=>x:half;
    const glow=doBloom?bloom(composed,profile,quantize):null,lut=context.lut;
    const useLut=doGrade&&profile.lut>0,useNeutral=doGrade&&profile.neutral>.5,unpremultiply=!!profile.unpremultiply;
    // hiddenRgb:false leaves fully transparent pixels black. A canvas discards their
    // color, so previews and PNG exports are unchanged, but bloom no longer has to
    // be graded across the empty background. The default keeps every byte.
    const keepHidden=options.hiddenRgb!==false;
    if(useLut&&(!lut||lut.width!==lut.height*lut.height||lut.data.length!==lut.width*lut.height*4))throw new Error('A raw RGBA 3D strip LUT is required.');
    const output=new Uint8ClampedArray(size),rgb=new Float64Array(3),mapped=new Float64Array(3),s0=new Float64Array(3),s1=new Float64Array(3);
    const n=useLut?lut.height:0;
    // Same arithmetic as before, one channel at a time: sRGB decode, bloom, neutral
    // tone curve, encode, then the strip LUT blend.
    const glowX=glow?axis(width,glow.width,x=>(x+.5)/width):null,glowY=glow?axis(height,glow.height,y=>(y+.5)/height):null;
    function grade(r,g,b,alpha,x,y){
      rgb[0]=r;rgb[1]=g;rgb[2]=b;
      if(unpremultiply)for(let c=0;c<3;c++)rgb[c]=alpha>0?rgb[c]/Math.max(alpha,.000061):0;
      if(glow)blend(glow,glowX,x,glowY,y,s0);
      for(let c=0;c<3;c++){
        let linear=fromSrgbFast(rgb[c])+(glow?s0[c]*profile.bloom:0);
        if(useNeutral)linear=neutral(linear);
        rgb[c]=toSrgb(Math.max(linear,0));
      }
      if(useLut){
        const p0=clamp(rgb[0])*(n-1),p1=clamp(rgb[1])*(n-1),p2=clamp(rgb[2])*(n-1),slice=Math.floor(p2),t=p2-slice;
        const u=(p0+.5)/lut.width+slice/n,v=(p1+.5)/lut.height;
        sample3(lut,u,v,s0);sample3(lut,u+1/n,v,s1);
        for(let c=0;c<3;c++)mapped[c]=mix(s0[c],s1[c],t)/255;
        for(let c=0;c<3;c++)rgb[c]=mix(clamp(rgb[c]),mapped[c],profile.lut);
      }
    }
    // Without bloom every empty pixel grades to the same color; compute it once.
    let empty=null;
    if((doGrade||doBloom)&&!glow){grade(0,0,0,0,0,0);empty=[Math.round(clamp(rgb[0])*255),Math.round(clamp(rgb[1])*255),Math.round(clamp(rgb[2])*255)];}
    const data=composed.data;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const i=(y*width+x)*4,o=((height-1-y)*width+x)*4,alpha=data[i+3];
        if(!keepHidden&&alpha===0){output[o+3]=0;continue;}
        const r=data[i],g=data[i+1],b=data[i+2];
        if(doGrade||doBloom){
          if(empty&&r===0&&g===0&&b===0&&alpha===0&&1/r>0&&1/g>0&&1/b>0){output[o]=empty[0];output[o+1]=empty[1];output[o+2]=empty[2];output[o+3]=0;continue;}
          grade(r,g,b,alpha,x,y);
          output[o]=Math.round(clamp(rgb[0])*255);output[o+1]=Math.round(clamp(rgb[1])*255);output[o+2]=Math.round(clamp(rgb[2])*255);
        }else{
          output[o]=Math.round(clamp(r)*255);output[o+1]=Math.round(clamp(g)*255);output[o+2]=Math.round(clamp(b)*255);
        }
        output[o+3]=Math.round(clamp(alpha)*255);
      }
    }
    return output;
  }
  function compare(reference,actual){
    if(reference.length!==actual.length||actual.length%4)throw new Error('Comparison dimensions do not match.');
    let foreground=0,mae=0,alpha=0,silhouette=0;const difference=new Uint8ClampedArray(actual.length);
    for(let i=0;i<actual.length;i+=4){
      const union=reference[i+3]>0||actual[i+3]>0;if(union){foreground++;alpha+=Math.abs(reference[i+3]-actual[i+3]);
        if((reference[i+3]>=128)!==(actual[i+3]>=128))silhouette++;
        for(let c=0;c<3;c++){const delta=Math.abs(reference[i+c]-actual[i+c]);mae+=delta;difference[i+c]=Math.min(255,delta*4);}
        difference[i+3]=255;
      }
    }
    return {foregroundPixels:foreground,foregroundMae:foreground?mae/(foreground*3):0,alphaMae:foreground?alpha/foreground:0,
      silhouetteError:foreground?100*silhouette/foreground:0,difference};
  }
  return {compose,composeFrame,postprocess,compare,half,halfExact,sample,fromSrgb,toSrgb,neutral,lookup};
});
