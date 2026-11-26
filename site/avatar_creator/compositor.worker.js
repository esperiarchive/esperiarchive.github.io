/* Exact constant-background crops. Rendering reads them without full expansion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BufferView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const cropped=b=>b?.cropped===true;
  function valid(b,length){
    if(b instanceof Float32Array)return b.length===length;
    if(!cropped(b)||!(b.data instanceof Float32Array)||!(b.background instanceof Float32Array))return false;
    const [x,y,w,h]=b.rect||[];
    return [b.width,b.height,b.channels,x,y,w,h].every(Number.isSafeInteger)&&Math.min(b.width,b.height,x,y,w,h)>=0&&[1,4].includes(b.channels)&&
      x+w<=b.width&&y+h<=b.height&&b.length===length&&length===b.width*b.height*b.channels&&b.data.length===w*h*b.channels&&b.background.length===b.channels;
  }
  function get(b,i){
    if(!cropped(b))return b[i];
    const c=i%b.channels,p=(i-c)/b.channels,x=p%b.width,y=Math.floor(p/b.width),[left,bottom,w,h]=b.rect;
    return x>=left&&x<left+w&&y>=bottom&&y<bottom+h?b.data[((y-bottom)*w+x-left)*b.channels+c]:b.background[c];
  }
  function bounds(b,width,height,channel,predicate){
    return cropped(b)&&!predicate(b.background[channel])?b.rect:[0,0,width,height];
  }
  function materialize(b){
    if(!cropped(b))return b.slice();
    // Copy words, including signed zero/NaN payloads, rather than convert values.
    const words=new Uint32Array(b.length),background=new Uint32Array(b.background.buffer,b.background.byteOffset,b.channels);
    if(background.some(v=>v!==0))for(let i=0;i<words.length;i++)words[i]=background[i%b.channels];
    const [left,bottom,w,h]=b.rect,data=new Uint32Array(b.data.buffer,b.data.byteOffset,b.data.length);
    for(let y=0;y<h;y++)words.set(data.subarray(y*w*b.channels,(y+1)*w*b.channels),((bottom+y)*b.width+left)*b.channels);
    return new Float32Array(words.buffer);
  }
  return {cropped,valid,get,bounds,materialize};
});

;
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
  // Background far from anything bright blooms to exact zeros. Per row, the first and last
  // columns with any non-zero RGB (NaN counts as non-zero); an empty row has first > last.
  function extent(image){
    const {width:w,height:h,data:d}=image,first=new Int32Array(h).fill(w),last=new Int32Array(h).fill(-1);
    for(let y=0;y<h;y++)for(let x=0,i=y*w*4;x<w;x++,i+=4)if(d[i]!==0||d[i+1]!==0||d[i+2]!==0){if(first[y]===w)first[y]=x;last[y]=x;}
    return {first,last};
  }
  // For each output column, the lowest and highest source column any of the axes reads.
  function reach(count,axes){
    const low=new Int32Array(count),high=new Int32Array(count);
    for(let i=0;i<count;i++){let a=Infinity,b=-Infinity;for(const s of axes){a=Math.min(a,s.low[i]);b=Math.max(b,s.high[i]);}low[i]=a;high[i]=b;}
    return {low,high};
  }
  // Source columns holding non-zero RGB across the given rows, as [first, last].
  function span(e,rows){let a=Infinity,b=-Infinity;for(const r of rows){a=Math.min(a,e.first[r]);b=Math.max(b,e.last[r]);}return [a,b];}
  // A pixel whose taps all read zero computes exactly +0 in every pass below (mixes and
  // weighted sums of +0, and Math.max(...,0) in the prefilter), which is what a fresh
  // typed array already holds, so such pixels are skipped rather than written.
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
      // With a positive threshold, zero color contributes exactly +0.
      const e=threshold>0?extent(source):null;
      for(let y=0;y<h;y++){
        const [from,to]=e?span(e,[ys.low[y],ys.high[y]]):[0,source.width];if(from>to)continue;
        for(let x=0;x<w;x++){
        if(xs.high[x]<from||xs.low[x]>to)continue;
        const i=(y*w+x)*4;blend(source,xs,x,ys,y,s0);
        const r=Math.min(fromSrgb(s0[0]),profile.bloomClamp),g=Math.min(fromSrgb(s0[1]),profile.bloomClamp),b=Math.min(fromSrgb(s0[2]),profile.bloomClamp);
        const brightness=Math.max(r,g,b);let soft=clamp(brightness-threshold+knee,0,2*knee);soft=soft*soft/(4*knee+.0001);
        const contribution=Math.max(soft,brightness-threshold)/Math.max(brightness,.0001);
        first.data[i]=q(Math.max(r*contribution,0));first.data[i+1]=q(Math.max(g*contribution,0));first.data[i+2]=q(Math.max(b*contribution,0));
        }
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
      const across=reach(w,[center,...left,...right]),sourceExtent=extent(source);
      for(let y=0;y<h;y++){
        const [from,to]=span(sourceExtent,[rows.low[y],rows.high[y]]);if(from>to)continue;
        for(let x=0;x<w;x++){
        if(across.high[x]<from||across.low[x]>to)continue;
        const i=(y*w+x)*4;blend(source,center,x,rows,y,s0);
        let r=s0[0]*.227027,g=s0[1]*.227027,b=s0[2]*.227027;
        for(let k=0;k<4;k++){blend(source,left[k],x,rows,y,s1);blend(source,right[k],x,rows,y,s2);const wk=weights[k];r+=(s1[0]+s2[0])*wk;g+=(s1[1]+s2[1])*wk;b+=(s1[2]+s2[2])*wk;}
        horizontal.data[i]=q(r);horizontal.data[i+1]=q(g);horizontal.data[i+2]=q(b);
        }
      }
      // Vertical: same level, centre plus two linear taps each side.
      const columns=axis(w,w,x=>(x+.5)/w),mid=axis(h,h,y=>(y+.5)/h);
      const up1=axis(h,h,y=>(y+.5)/h-1.384615/h),down1=axis(h,h,y=>(y+.5)/h+1.384615/h),up2=axis(h,h,y=>(y+.5)/h-3.230769/h),down2=axis(h,h,y=>(y+.5)/h+3.230769/h);
      const horizontalExtent=extent(horizontal),taps=[mid,up1,down1,up2,down2];
      for(let y=0;y<h;y++){
        const [from,to]=span(horizontalExtent,taps.flatMap(a=>[a.low[y],a.high[y]]));if(from>to)continue;
        for(let x=0;x<w;x++){
        if(columns.high[x]<from||columns.low[x]>to)continue;
        const i=(y*w+x)*4;
        blend(horizontal,columns,x,mid,y,s0);blend(horizontal,columns,x,up1,y,s1);blend(horizontal,columns,x,down1,y,s2);blend(horizontal,columns,x,up2,y,s3);blend(horizontal,columns,x,down2,y,s4);
        for(let c=0;c<3;c++)vertical.data[i+c]=q(s0[c]*.227027+(s1[c]+s2[c])*.316216+(s3[c]+s4[c])*.070270);
        }
      }
      down.push(vertical);
    }
    let low=down.at(-1);
    for(let level=count-2;level>=0;level--){
      const high=down[level],up=image(high.width,high.height),w=up.width,h=up.height;
      const hx=axis(w,high.width,x=>(x+.5)/w),hy=axis(h,high.height,y=>(y+.5)/h),lx=axis(w,low.width,x=>(x+.5)/w),ly=axis(h,low.height,y=>(y+.5)/h);
      const highExtent=extent(high),lowExtent=extent(low);
      for(let y=0;y<h;y++){
        const [hFrom,hTo]=span(highExtent,[hy.low[y],hy.high[y]]),[lFrom,lTo]=span(lowExtent,[ly.low[y],ly.high[y]]);if(hFrom>hTo&&lFrom>lTo)continue;
        for(let x=0;x<w;x++){
        if((hx.high[x]<hFrom||hx.low[x]>hTo)&&(lx.high[x]<lFrom||lx.low[x]>lTo))continue;
        const i=(y*w+x)*4;blend(high,hx,x,hy,y,s1);blend(low,lx,x,ly,y,s2);
        up.data[i]=q(mix(s1[0],s2[0],scatter));up.data[i+1]=q(mix(s1[1],s2[1],scatter));up.data[i+2]=q(mix(s1[2],s2[2],scatter));
        }
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

;
/* Rear-view presentation rules for independent captures. Native QA keeps its
 * original compositor and depths; these disposable copies only affect the studio. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClothingFit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const B=typeof module==='object'&&module.exports?require('./buffer-view.js'):globalThis.BufferView,read=(b,i)=>B.get(b,i);
  const PELVIS_TAILS=new Set([84,162,163,535,735,736]);
  const ROLES=new Set(['body','cloak','back','hair','face']);
  function describe(entry,library,catalogue){
    if(entry.source!=='independent-items'||entry.yaw!==180||!entry.avatarIds?.cloak&&!entry.avatarIds?.back)return null;
    const selected=new Set(entry.partIds),layers=[],surfaces=[];
    for(const part of library.parts){
      if(!selected.has(part.id)||!ROLES.has(part.group))continue;
      for(const layer of part.layers){
        const skinMask=part.group==='body'?(layer.patches||[]).find(p=>p.slot==='skin'&&p.rect[2]>0&&p.rect[3]>0):null;
        layers.push({id:layer.id,group:part.group,...(skinMask?{skinMask:{rect:skinMask.rect,delta:skinMask.delta}}:{})});
      }
      for(const surface of part.surfaces)surfaces.push({id:surface.id,group:part.group});
    }
    const back=catalogue.items.find(item=>item.id===entry.avatarIds.back);
    return {version:1,yaw:180,layers,surfaces,tail:PELVIS_TAILS.has(back?.id)||/\btail\b/i.test(back?.name||'')};
  }
  function apply(layers,surfaces,context,metadata){
    const unchanged={layers,surfaces,changedPixels:0};
    if(metadata?.version!==1||metadata.yaw!==180)return unchanged;
    const {width,height,farClip}=context,pixels=width*height,epsilon=.002;
    const layerRoles=new Map(metadata.layers.map(l=>[l.id,l.group])),surfaceRoles=new Map(metadata.surfaces.map(s=>[s.id,s.group]));
    const max={body:new Float32Array(pixels),cloak:new Float32Array(pixels),back:new Float32Array(pixels)};
    const solidBack=new Float32Array(pixels);
    const valid=d=>d>0&&d<farClip-.001;
    // Protect the scalp and hair around the head; tuck only the hanging length.
    let headBottom=height;
    const headBounds=(buffer,channel)=>{const [x0,y0,w,h]=B.bounds(buffer,width,height,channel,valid),channels=channel===2?4:1;
      for(let y=y0;y<Math.min(y0+h,headBottom);y++)for(let x=x0;x<x0+w;x++)if(valid(read(buffer,(y*width+x)*channels+channel))){headBottom=y;return;}
    };
    for(const layer of layers)if(layerRoles.get(layer.id)==='face')headBounds(layer.gbuffer,2);
    for(const surface of surfaces)if(surfaceRoles.get(surface.id)==='face')for(const level of surface.levels)headBounds(level.depth,0);
    for(const layer of layers){const group=layerRoles.get(layer.id);if(!max[group])continue;
      const depths=max[group],[left,bottom,w,h]=B.bounds(layer.gbuffer,width,height,2,valid);
      for(let y=bottom;y<bottom+h;y++)for(let x=left;x<left+w;x++){const p=y*width+x,d=read(layer.gbuffer,p*4+2);if(valid(d)&&d>depths[p])depths[p]=d;}
    }
    solidBack.set(max.back);
    for(const surface of surfaces){const group=surfaceRoles.get(surface.id);if(!max[group])continue;
      const depths=max[group];for(const level of surface.levels){const [left,bottom,w,h]=B.bounds(level.depth,width,height,0,valid);
        for(let y=bottom;y<bottom+h;y++)for(let x=left;x<left+w;x++){const p=y*width+x,d=read(level.depth,p);if(valid(d)&&d>depths[p])depths[p]=d;
          // Solid equipment is often exported through an alpha/effect shader.
          // Zero transmission identifies its genuinely opaque pixels.
          if(group==='back'&&valid(d)&&[0,1,2,3].every(k=>Math.abs(read(level.transmission,p*4+k))<1e-6))solidBack[p]=Math.max(solidBack[p],d);
        }
      }
    }
    // A skin palette delta identifies exposed skin without another capture.
    // Preserve hands/arms when they are genuinely closer than the accessories.
    const skin=new Uint8Array(pixels);
    for(const row of metadata.layers){const patch=row.skinMask;if(row.group!=='body'||!patch)continue;
      const [left,bottom,w,h]=patch.rect;
      if(!B.valid(patch.delta,w*h*4)||left<0||bottom<0||left+w>width||bottom+h>height)throw new Error('Invalid clothing-fit skin mask.');
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        if(Math.max(Math.abs(read(patch.delta,i)),Math.abs(read(patch.delta,i+1)),Math.abs(read(patch.delta,i+2)))>1e-7)skin[(bottom+y)*width+left+x]=1;
      }
    }
    const tuck=new Uint8Array(pixels),bodyFloor=new Float32Array(pixels),cloakFloor=new Float32Array(pixels),backFloor=new Float32Array(pixels),hairFloor=new Float32Array(pixels);
    let affected=0;
    for(let p=0;p<pixels;p++){
      let cloak=max.cloak[p],back=max.back[p];
      if(!cloak&&!back)continue;
      // Where a tail passes over the dressed body's silhouette, let the cloak
      // cover its base. The portion emerging beyond the outfit stays outside.
      if(metadata.tail&&max.body[p]>0&&cloak>0&&back>0){tuck[p]=1;backFloor[p]=cloak+epsilon;back=Math.max(back,backFloor[p]);}
      else if(cloak>0&&back>0){cloakFloor[p]=back+epsilon;cloak=Math.max(cloak,cloakFloor[p]);}
      if(!skin[p])bodyFloor[p]=Math.max(cloak,back)+epsilon;
      // Long hair sits beneath solid back equipment. Use only opaque coverage:
      // veils/FX retain their measured transparency, and tails keep native hair order.
      if(!metadata.tail&&solidBack[p]>0&&Math.floor(p/width)<headBottom)hairFloor[p]=farClip;
      affected++;
    }
    if(!affected)return unchanged;
    const floors={body:bodyFloor,cloak:cloakFloor,back:backFloor,hair:hairFloor};let changedPixels=0;
    const fittedLayers=layers.map(layer=>{
      const group=layerRoles.get(layer.id),floor=floors[group];if(!floor)return layer;
      let gbuffer=layer.gbuffer;
      for(let p=0;p<pixels;p++){
        const d=read(layer.gbuffer,p*4+2),next=floor[p];
        if(next>d&&valid(d)){if(gbuffer===layer.gbuffer)gbuffer=B.materialize(gbuffer);gbuffer[p*4+2]=group==='hair'?next:Math.min(next,farClip-.002);changedPixels++;}
      }
      return gbuffer===layer.gbuffer?layer:{...layer,gbuffer};
    });
    // Preserve every native color/transmission buffer and each surface's own
    // triangle order. Only depth eligibility and the cross-item draw order move.
    const fitSurface=(surface,group,rank,region=null)=>{
      const floor=floors[group];
      const levels=surface.levels.map(level=>{
        let depth=level.depth;
        for(let p=0;p<pixels;p++){
          const d=read(level.depth,p);if(!valid(d))continue;
          const excluded=region==='root'?!tuck[p]:region==='outer'?!!tuck[p]:false;
          const next=excluded?farClip:Math.max(d,floor?.[p]||0);
          if(next!==d){if(depth===level.depth)depth=B.materialize(depth);depth[p]=next;changedPixels++;}
        }
        return depth===level.depth?level:{...level,depth};
      });
      return {...surface,id:surface.id+(region?'/fit-'+region:''),queue:rank*100000+surface.queue,levels};
    };
    const fittedSurfaces=surfaces.flatMap(surface=>{
      const group=surfaceRoles.get(surface.id);
      if(group==='back'&&metadata.tail)return [fitSurface(surface,group,.5,'root'),fitSurface(surface,group,2,'outer')];
      return [fitSurface(surface,group,group==='body'?0:group==='cloak'?1:group==='back'?2:3)];
    });
    return {layers:fittedLayers,surfaces:fittedSurfaces,changedPixels};
  }
  return {describe,apply};
});

;
/* Local front-lock depth guides for reusable 2D hair captures. A guide belongs
 * to a hairstyle/pose, never an outfit pairing. Color, normals and silhouette
 * remain untouched; face, hands and more distant back hair keep native depth. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HairFit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const B=typeof module==='object'&&module.exports?require('./buffer-view.js'):globalThis.BufferView,read=(b,i)=>B.get(b,i);
  const CALIBRATION='5d25c09198628cfd2d2c998fc804dbf66b3575397230d81dcfc9450c91e6ba2d';
  const FRONT_POSES=new Set(['normal','think_loop','standing','angry_loop','helpless','wow']);
  // Reviewed opaque front-hair families. Color variants share the same test.
  const REVIEWED={female:new Set([226, 258, 302, 317, 325, 572, 895, 903, 944, 1037, 1045]),male:new Set([87, 179, 361, 572, 649, 681])};
  const guides={
    normal:{depth:8.18,polygon:[[533,357],[550,357],[550,407],[541,425],[515,443],[493,455],[482,480],[472,477],[477,450],[494,433],[521,413],[530,386]]},
    think_loop:{depth:8.115,polygon:[[541,358],[558,358],[555,407],[545,425],[517,440],[489,451],[471,478],[460,477],[465,451],[487,434],[526,416],[538,391]]}
  };
  function describe(entry,library){
    const guide=guides[entry.pose];
    if(entry.source!=='independent-items'||entry.yaw!==0||entry.width!==1024||entry.height!==1536)return null;
    const selected=new Set(entry.partIds),parts=library.parts.filter(p=>selected.has(p.id));
    const original=entry.gender==='female'&&entry.avatarIds?.hair===1002&&guide&&parts.every(p=>p.calibration===CALIBRATION);
    const automatic=FRONT_POSES.has(entry.pose)&&REVIEWED[entry.gender]?.has(entry.avatarIds?.hair);
    if(!original&&!automatic)return null;
    const body=parts.find(p=>p.group==='body');
    const reference=automatic&&!original?library.parts.find(p=>p.group==='body'&&p.gender===entry.gender&&p.pose===entry.pose&&p.yaw===0&&p.avatarIds.outfit===246&&p.avatarIds.bodyshape===entry.avatarIds.bodyshape&&p.validated&&p.calibration===body?.calibration):null;
    if(!original&&!reference)return null;
    return {version:original?1:2,...(original?{guide}:{referenceBody:reference.layers.map(l=>l.gbuffer)}),layers:parts.flatMap(part=>part.layers.map(layer=>{
      const patch=part.group==='body'?(layer.patches||[]).find(p=>p.slot==='skin'&&p.rect[2]*p.rect[3]>0):null;
      return {id:layer.id,group:part.group,...(patch?{skinMask:{rect:patch.rect,delta:patch.delta}}:{})};
    }))};
  }
  function inside(x,y,polygon){
    let result=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [ax,ay]=polygon[i],[bx,by]=polygon[j];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)result=!result;
    }
    return result;
  }
  function apply(layers,context,metadata){
    const unchanged={layers,changedPixels:0};if(![1,2].includes(metadata?.version))return unchanged;
    const {width,height,farClip}=context,roles=new Map(metadata.layers.map(l=>[l.id,l.group]));
    const bodies=layers.filter(l=>roles.get(l.id)==='body'),others=layers.filter(l=>!['body','hair'].includes(roles.get(l.id)));
    if(!bodies.length)return unchanged;
    const skin=new Set();
    for(const row of metadata.layers){const patch=row.skinMask;if(!patch)continue;
      const [left,bottom,w,h]=patch.rect;
      if(!B.valid(patch.delta,w*h*4))throw Error('Invalid hair-fit skin mask.');
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;if(Math.max(Math.abs(read(patch.delta,i)),Math.abs(read(patch.delta,i+1)),Math.abs(read(patch.delta,i+2)))>1e-7)skin.add((bottom+y)*width+left+x);
      }
    }
    const valid=d=>d>0&&d<farClip-.001,automatic=metadata.version===2;let guide=metadata.guide,changedPixels=0,reference=null;
    if(automatic){
      const faces=layers.filter(l=>roles.get(l.id)==='face');let left=width,right=-1,top=height,bottom=-1;
      for(const face of faces){const [rx,ry,rw,rh]=B.bounds(face.gbuffer,width,height,2,valid);
        for(let by=ry;by<ry+rh;by++)for(let x=rx;x<rx+rw;x++)if(valid(read(face.gbuffer,(by*width+x)*4+2))){
          const y=height-1-by;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
      }
      if(right<left)return unchanged;
      const w=right-left+1,h=bottom-top+1,cx=(left+right)/2;
      left=Math.max(0,Math.floor(cx-1.5*w));right=Math.min(width-1,Math.ceil(cx+1.5*w));top=Math.max(0,Math.floor(bottom-.35*h));bottom=Math.min(height-1,Math.ceil(bottom+.85*h));
      guide={depth:farClip,polygon:[[left,top],[right+1,top],[right+1,bottom+1],[left,bottom+1]]};
      if(!metadata.referenceBody?.length||metadata.referenceBody.some(g=>!B.valid(g,width*height*4)))throw Error('Invalid hair-fit reference body.');
      reference=new Float32Array(width*height);reference.fill(farClip);
      // A strand qualifies only when it was already in front of the undressed
      // body. Extend shoulder depth upward through the empty collar area,
      // never through an existing arm, hand or chest surface.
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const p=(height-1-y)*width+x;
        for(let dy=0;dy<=56&&y+dy<height;dy++){
          const at=((height-1-y-dy)*width+x)*4+2;
          let d=farClip;for(const g of metadata.referenceBody)if(valid(read(g,at)))d=Math.min(d,read(g,at));
          if(valid(d)){reference[p]=d;break;}
        }
      }
    }
    const fitted=layers.map(layer=>{
      if(roles.get(layer.id)!=='hair')return layer;
      let gbuffer=layer.gbuffer;
      const minX=Math.max(0,Math.floor(Math.min(...guide.polygon.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...guide.polygon.map(p=>p[0]))));
      const minY=Math.max(0,Math.floor(Math.min(...guide.polygon.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...guide.polygon.map(p=>p[1]))));
      for(let top=minY;top<=maxY;top++)for(let x=minX;x<=maxX;x++){
        const p=(height-1-top)*width+x,i=p*4,d=read(layer.gbuffer,i+2);
        if(!valid(d)||d>guide.depth||skin.has(p)||!inside(x+.5,top+.5,guide.polygon))continue;
        if(automatic&&(!valid(reference[p])||d>reference[p]+.012))continue;
        const front=bodies.reduce((v,b)=>valid(read(b.gbuffer,i+2))?Math.min(v,read(b.gbuffer,i+2)):v,farClip);
        // Only a shallow collision with clothing is corrected. A raised arm,
        // face or accessory must still occlude the strand naturally.
        if(front>=d||d-front>.18||others.some(o=>valid(read(o.gbuffer,i+2))&&read(o.gbuffer,i+2)<=d))continue;
        if(gbuffer===layer.gbuffer)gbuffer=B.materialize(gbuffer);gbuffer[i+2]=Math.max(.001,front-.002);changedPixels++;
      }
      return gbuffer===layer.gbuffer?layer:{...layer,gbuffer};
    });
    return {layers:fitted,changedPixels};
  }
  return {describe,apply};
});

;
/* Cropped buffer transport, including optional reduced geometry. Keeps the Float32 contract. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ItemStorage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // WPK2 packs may contain row-predicted planes; WPK1 never does. WPK4 adds
  // reduced geometry: 8-bit normals and 16-bit depth codes over the member's range.
  const MAGICS=new Set(['WPK1','WPK2','WPK3','WPK4']);
  function quantization(meta,channels){
    const quant=meta.quant||null;
    if(!quant)return null;
    if(!Array.isArray(quant)||quant.length!==channels)throw new Error('Invalid wardrobe member quantization.');
    return quant.map((q,c)=>{
      if(q===null)return null;
      if(q&&q.snorm8===127&&meta.types[c]===1)return {kind:'snorm8',scale:127};
      if(q&&Array.isArray(q.unorm16)&&q.unorm16.length===2&&q.unorm16.every(Number.isFinite)&&meta.types[c]===2)return {kind:'unorm16',lo:q.unorm16[0],step:(q.unorm16[1]-q.unorm16[0])/65534,background:meta.background[c]>>>0};
      throw new Error('Invalid wardrobe member quantization.');
    });
  }
  let halfWords;
  function halfTable(){
    if(halfWords)return halfWords;
    halfWords=new Uint32Array(65536);
    for(let h=0;h<65536;h++){
      const sign=(h&32768)<<16;let exp=(h>>>10)&31,mant=h&1023;
      if(exp===0){if(mant){exp=113;while(!(mant&1024)){mant<<=1;exp--;}mant&=1023;} }
      else exp=exp===31?255:exp+112;
      halfWords[h]=(sign|(exp<<23)|(mant<<13))>>>0;
    }
    return halfWords;
  }
  function open(bytes){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(data.length<8||!MAGICS.has(String.fromCharCode(...data.subarray(0,4))))throw new Error('Invalid wardrobe pack.');
    const length=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(4,true);
    if(length>data.length-8)throw new Error('Truncated wardrobe pack.');
    return {index:JSON.parse(new TextDecoder().decode(data.subarray(8,8+length))),data:data.subarray(8+length)};
  }
  function member(pack,key){
    const meta=pack.index[key];
    if(!meta||!Number.isSafeInteger(meta.offset)||!Number.isSafeInteger(meta.length)||meta.offset<0||meta.length<0||meta.offset+meta.length>pack.data.length)throw new Error('Missing or truncated wardrobe member.');
    return {meta,bytes:pack.data.subarray(meta.offset,meta.offset+meta.length)};
  }
  function restoreShared(meta,payload,master){
    const [, ,w,h]=meta.rect,channels=meta.shape[2],count=w*h;
    if(!master?.cropped||master.channels!==channels||!Array.isArray(meta.masterOffset)||meta.masterOffset.length!==2||!meta.masterOffset.every(Number.isSafeInteger))throw Error('Invalid shared pixel master');
    const [dx,dy]=meta.masterOffset,[,,mw,mh]=master.rect;
    const words=new Uint32Array(count*channels),source=new Uint32Array(master.data.buffer,master.data.byteOffset,master.data.length);
    const bg=new Uint32Array(master.background.buffer);
    if(bg.some(v=>v!==0))for(let p=0;p<count;p++)words.set(bg,p*channels);
    const left=Math.max(0,dx),right=Math.min(w,dx+mw);
    if(right>left)for(let y=Math.max(0,dy);y<Math.min(h,dy+mh);y++){
      const i=((y-dy)*mw+left-dx)*channels;
      words.set(source.subarray(i,i+(right-left)*channels),(y*w+left)*channels);
    }
    const bit=(offset,p)=>(payload[offset+(p>>3)]>>(p&7))&1;
    const maskBytes=Math.ceil(count/8);
    let changed=0,literals=0;
    for(let p=0;p<count;p++)changed+=bit(0,p);
    for(let p=0;p<changed;p++)literals+=bit(maskBytes,p);
    let start=maskBytes+Math.ceil(changed/8);
    const starts=meta.types.map(size=>{const s=start;start+=size*literals;return s;});
    if(start!==payload.length)throw Error('Invalid shared pixel payload');
    const half=halfTable();let ci=0,li=0;
    for(let p=0;p<count;p++){
      if(!bit(0,p))continue;
      if(!bit(maskBytes,ci++)){words.set(meta.background,p*channels);continue;}
      for(let c=0;c<channels;c++){
        const i=starts[c]+li;
        const low=payload[i]|payload[i+literals]<<8;
        words[p*channels+c]=meta.types[c]===2?half[low]:low|payload[i+2*literals]<<16|payload[i+3*literals]<<24;
      }
      li++;
    }
    return words;
  }
  function expand(meta,payload,{cropped=false,master=null}={}){
    const [width,height,channels]=meta.shape,[x,y,w,h]=meta.rect;
    const quant=meta.types?.length===channels?quantization(meta,channels):null;
    if(![width,height,channels,x,y,w,h].every(Number.isSafeInteger)||Math.min(width,height,x,y,w,h)<0||![1,4].includes(channels)||width*height*channels>32*1024*1024||x+w>width||y+h>height||meta.types.length!==channels||meta.background.length!==channels||meta.types.some((v,c)=>v!==2&&v!==4&&!(v===1&&quant?.[c]))||(meta.master&&quant)||(!meta.master&&payload.length!==w*h*meta.types.reduce((a,b)=>a+b,0)))throw new Error('Invalid wardrobe buffer dimensions.');
    const predict=meta.predict||null;
    if(predict&&(!Array.isArray(predict)||predict.length!==channels||predict.some(p=>p!==null&&p!=='up')))throw new Error('Invalid wardrobe member prediction.');
    const restored=meta.master?restoreShared(meta,payload,master):null;
    const words=cropped&&restored?restored:new Uint32Array((cropped?w*h:width*height)*channels),count=w*h,table=halfTable();
    const floats=new Float32Array(words.buffer);
    if(!cropped&&meta.background.some(v=>v!==0))for(let i=0;i<words.length;i++)words[i]=meta.background[i%channels];
    let offset=0;
    if(restored&&!cropped)for(let row=0;row<h;row++)words.set(restored.subarray(row*w*channels,(row+1)*w*channels),((y+row)*width+x)*channels);
    for(let c=0;!restored&&c<channels;c++){
      const size=meta.types[c],up=predict?.[c]==='up',previous=up?new Uint32Array(w):null,q=quant?.[c];let pixel=0;
      for(let row=0;row<h;row++)for(let col=0;col<w;col++,pixel++){
        let bits=payload[offset+pixel];
        if(size>1)bits|=payload[offset+count+pixel]<<8;
        if(size===4)bits|=(payload[offset+2*count+pixel]<<16)|(payload[offset+3*count+pixel]<<24);
        // A predicted plane stores the difference from the row above, modulo the word size.
        if(up){if(row)bits=size===1?(bits+previous[col])&255:size===2?(bits+previous[col])&65535:(bits+previous[col])>>>0;else bits>>>=0;previous[col]=bits;}
        const index=(cropped?row*w+col:(y+row)*width+x+col)*channels+c;
        if(!q)words[index]=size===2?table[bits]:bits;
        else if(q.kind==='snorm8')floats[index]=((bits<<24)>>24)/q.scale;
        else if(bits===0)words[index]=q.background;
        else floats[index]=q.lo+(bits-1)*q.step;
      }
      offset+=count*size;
    }
    const data=new Float32Array(words.buffer);
    return cropped?{cropped:true,width,height,channels,rect:[x,y,w,h],background:new Float32Array(new Uint32Array(meta.background).buffer),data,length:width*height*channels,byteLength:data.byteLength+channels*4}:data;
  }
  function expandMember(pack,key,inflate,options={}){
    const {meta,bytes}=member(pack,key);
    let master=null;
    if(meta.master){
      const base=member(pack,meta.master);
      if(base.meta.master)throw Error('Nested shared pixel master');
      master=expand(base.meta,inflate(base.bytes),{cropped:true});
    }
    return expand(meta,inflate(bytes),{...options,master});
  }
  async function decode(pack,key){
    const {meta,bytes}=member(pack,key);
    let master=null;
    if(meta.master){
      const base=member(pack,meta.master);
      if(base.meta.master)throw Error('Nested shared pixel master');
      master=await decodeMember(base.meta,base.bytes,{cropped:true});
    }
    return decodeMember(meta,bytes,{master});
  }
  async function decodeMember(meta,bytes,options){
    const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return expand(meta,new Uint8Array(raw),options);
  }
  return {open,member,expand,expandMember,decode,decodeMember,MAGICS};
});

;
const cache=new Map(),rangesBlocked=new Set();let cacheBytes=0,queue=Promise.resolve(),latestPreview=0,previewFrame=null;
// Keep compressed transport separate from immutable decoded crops. A new
// hairstyle can reuse the current body, face and palette without expanding them.
const TRANSFER_CACHE_LIMIT=24*1024*1024;
const decodedCache=new Map();let decodedBytes=0;
const packDirectories=new Map();
const openingRequests=new Map();
function prepareOpeningFiles(files,root){
  for(const file of files){
    if(!/^runtime\/[a-f0-9]{64}\.wpack$/.test(file))continue;
    const url=new URL(file,root).href;
    if(cache.has(url)||openingRequests.has(url))continue;
    const request=fetch(url).then(response=>{
      if(response.status!==200)throw Error('Opening pack unavailable.');
      return response.arrayBuffer();
    }).then(value=>remember(url,value)).finally(()=>openingRequests.delete(url));
    openingRequests.set(url,request);
    request.catch(()=>{}); // A normal range request retries a failed early transfer.
  }
}
const DECODED_MEMBER_LIMIT=160*1024*1024;
// Remote packs cost a round trip per request. Up to ten packs download at once and nearby
// members share a request (gaps up to 256 KiB, spans up to 8 MiB); at most four members
// decode at a time, which bounds peak memory on phones.
const NETWORK_LANES=10,DECODE_SLOTS=4,SPAN_GAP=256*1024,SPAN_LIMIT=8*1024*1024;
let decoding=0;const decodeWaiting=[];
async function decodeSlot(task){
  if(decoding<DECODE_SLOTS)decoding++;else await new Promise(resolve=>decodeWaiting.push(resolve));
  try{return await task();}
  finally{const next=decodeWaiting.shift();if(next)next();else decoding--;}   // a freed slot passes straight to the next waiter
}
function decodedGet(key){
  if(!decodedCache.has(key))return null;
  const value=decodedCache.get(key);decodedCache.delete(key);decodedCache.set(key,value);return value;
}
function decodedRemember(key,value){
  if(decodedCache.has(key)){decodedBytes-=decodedCache.get(key).byteLength;decodedCache.delete(key);}
  if(value.byteLength>DECODED_MEMBER_LIMIT)return value;
  decodedCache.set(key,value);decodedBytes+=value.byteLength;
  while(decodedBytes>DECODED_MEMBER_LIMIT){const old=decodedCache.keys().next().value;decodedBytes-=decodedCache.get(old).byteLength;decodedCache.delete(old);}
  return value;
}
function remember(key,value){
  if(cache.has(key)){cacheBytes-=cache.get(key).byteLength;cache.delete(key);}
  cache.set(key,value);cacheBytes+=value.byteLength;
  while(cacheBytes>TRANSFER_CACHE_LIMIT&&cache.size){const old=cache.keys().next().value;cacheBytes-=cache.get(old).byteLength;cache.delete(old);}
  return value;
}
async function range(url,start,end,allowShort=false){
  const checked=value=>{
    if(!value.byteLength||value.byteLength>end-start+1||(!allowShort&&value.byteLength!==end-start+1))throw new Error('Invalid wardrobe range length.');
    return value;
  };
  const key=url+'@'+start+':'+end;
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return checked(value);}
  // Plain static hosts may ignore Range; cache their complete response once.
  if(cache.has(url))return checked(cache.get(url).slice(start,end+1));
  if(openingRequests.has(url)){
    try{return checked((await openingRequests.get(url)).slice(start,end+1));}catch(_){}
  }
  // If a host refuses a browser's range request, retry it without the Range header.
  // A successful fallback switches only that origin to whole-pack requests.
  let response;const origin=new URL(url).origin;
  if(rangesBlocked.has(origin))response=await fetch(url);
  else try{response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`}});}
  catch(error){if(origin===self.location.origin)throw error;response=await fetch(url);if(response.ok)rangesBlocked.add(origin);}
  if(!response.ok)throw new Error('Could not load '+url+' ('+response.status+').');
  const value=await response.arrayBuffer();
  if(response.status===200){const slice=checked(value.slice(start,end+1));remember(url,value);return slice;}
  // Other sites hide Content-Range unless they expose it; then the length must fit the request.
  const contentRange=response.headers.get('Content-Range');
  const match=contentRange&&/^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange);
  if(response.status!==206||(contentRange&&(!match||Number(match[1])!==start||Number(match[2])!==start+value.byteLength-1)))throw new Error('Invalid wardrobe range response.');
  return remember(key,checked(value));
}
async function packedMembers(url,keys,isCurrent,cacheKey=key=>url+'#'+key){
  const result=new Map(),missing=[];
  for(const key of keys){const value=decodedGet(cacheKey(key));if(value)result.set(key,value);else missing.push(key);}
  if(!missing.length)return result;
  let index=packDirectories.get(url),head=new Uint8Array(0),payloadStart=0;
  if(!index){
    const first=await range(url,0,65535,true);head=new Uint8Array(first);
    if(head.length<8||!ItemStorage.MAGICS.has(String.fromCharCode(...head.subarray(0,4))))throw new Error('Invalid wardrobe pack.');
    const length=new DataView(first).getUint32(4,true);
    if(length>16*1024*1024)throw new Error('Wardrobe pack index is too large.');
    const header=length+8<=head.length?head.subarray(8,8+length):new Uint8Array(await range(url,8,7+length));
    index=JSON.parse(new TextDecoder().decode(header));payloadStart=8+length;
  }
  const valid=meta=>meta&&[meta.offset,meta.length].every(Number.isSafeInteger)&&meta.offset>=0&&meta.length>0;
  // Members that lie close together arrive in one request, and every request starts now:
  // otherwise each member past the first 64 KiB waits a round trip behind the one before.
  const wanted=new Set(),want=key=>{if(wanted.has(key)||!valid(index[key]))return;wanted.add(key);if(index[key].master)want(index[key].master);};
  missing.forEach(want);
  const spans=[];
  for(const [start,end] of [...wanted].map(key=>[payloadStart+index[key].offset,payloadStart+index[key].offset+index[key].length])
    .filter(([,end])=>end>head.length).sort((a,b)=>a[0]-b[0])){
    const last=spans[spans.length-1];
    if(last&&start-last.end<=SPAN_GAP&&Math.max(end,last.end)-last.start<=SPAN_LIMIT)last.end=Math.max(last.end,end);
    else spans.push({start,end});
  }
  for(const span of spans){span.bytes=range(url,span.start,span.end-1).then(value=>new Uint8Array(value));span.bytes.catch(()=>{});}
  const slice=async(start,end)=>{
    const span=spans.find(s=>s.start<=start&&end<=s.end);
    return span?(await span.bytes).subarray(start-span.start,end-span.start):new Uint8Array(await range(url,start,end-1));
  };
  async function readMember(key){
    const cached=decodedGet(cacheKey(key));
    if(cached)return cached;
    const meta=index[key];
    if(!valid(meta))throw new Error('Missing wardrobe member.');
    const start=payloadStart+meta.offset,end=start+meta.length;
    const bytes=end<=head.length?head.subarray(start,end):await slice(start,end);
    if(meta.master&&(!Object.hasOwn(index,meta.master)||index[meta.master].master))throw Error('Invalid shared pixel dependency');
    const master=meta.master?await readMember(meta.master):null;
    return decodedRemember(cacheKey(key),await decodeSlot(()=>ItemStorage.decodeMember(meta,bytes,{cropped:true,master})));
  }
  for(const key of missing){
    if(!isCurrent())return result;
    result.set(key,await readMember(key));
  }
  return result;
}
async function bytes(url){
  if(cache.has(url)){const value=cache.get(url);cache.delete(url);cache.set(url,value);return value;}
  const response=await fetch(url);if(!response.ok)throw new Error('Could not load '+url+' ('+response.status+').');
  let value;
  if(/\/[a-f0-9]{64}\.f32\.gz$/.test(new URL(url).pathname)&&!response.headers.get('Content-Encoding')&&response.body){
    if(typeof DecompressionStream==='undefined')throw new Error('This browser needs gzip decompression support.');
    value=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }else{
    value=await response.arrayBuffer();
    const head=new Uint8Array(value,0,Math.min(2,value.byteLength));
    if(head[0]===31&&head[1]===139){
      if(typeof DecompressionStream==='undefined')throw new Error('This browser needs gzip decompression support.');
      value=await new Response(new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
  }
  return remember(url,value);
}
async function load(entry,dataRoot,isCurrent,openingMembers){
  const root=new URL(dataRoot,self.location.href);
  // The library may be a release on another site; every asset must still sit inside it.
  if(!/^https?:$/.test(root.protocol)||!root.pathname.endsWith('/'))throw new Error('Invalid wardrobe data root.');
  const names=new Set([entry.lut.url]);
  for(const l of entry.layers){names.add(l.base).add(l.gbuffer);for(const p of l.patches||[])names.add(p.blend||p.delta);}
  for(const o of entry.overlays||[]){names.add(o.color);if(o.transmission)names.add(o.transmission);}
  for(const s of entry.surfaces||[])for(const l of s.levels)names.add(l.depth).add(l.color).add(l.transmission);
  for(const row of entry.clothingFit?.layers||[])if(row.skinMask)names.add(row.skinMask.delta);
  for(const row of entry.hairFit?.layers||[])if(row.skinMask)names.add(row.skinMask.delta);
  for(const name of entry.hairFit?.referenceBody||[])names.add(name);
  const packed=[...names].filter(name=>name.includes('#'));
  const grouped=openingMembers&&packed.length>0&&packed.every(name=>Object.hasOwn(openingMembers,name));
  const files=new Map();
  for(const name of names){
    const address=grouped&&name.includes('#')?openingMembers[name]:name;
    const [file,key]=address.split('#');
    if(!files.has(file))files.set(file,new Map());
    if(key)files.get(file).set(key,name);
  }
  const requests=[...files].map(([name,members])=>{
    const url=new URL(name,root);
    if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw new Error('Asset is outside the wardrobe library.');
    return [name,url.href,members];
  });
  const loaded=new Map(),decoded=new Map();let cursor=0,failure=null;
  // Keep one copy per URL in this render. Packs download several at a time, since each
  // waits mostly on the network; decodeSlot bounds the decompression allocations.
  // Queueing also prevents overlapping multi-GB loads.
  await Promise.all(Array.from({length:Math.min(NETWORK_LANES,requests.length)},async()=>{
    while(!failure&&isCurrent()&&cursor<requests.length){
      const [name,url,members]=requests[cursor++];
      try{
        if(members.size){
          // Grouped member names preserve the original pack hash and member key,
          // including shared-pixel masters. Later edits reuse the same decoded buffers.
          const originalKey=grouped?key=>{
            const match=/^([a-f0-9]{64})\.([\w.-]+)$/.exec(key);
            if(!match)throw Error('Invalid grouped wardrobe member.');
            return new URL('items/packs/'+match[1]+'.wpack#'+match[2],root).href;
          }:undefined;
          for(const [key,value] of await packedMembers(url,[...members.keys()],isCurrent,originalKey))decoded.set(members.get(key),value);
        }
        else loaded.set(name,await bytes(url));
      }catch(error){failure=error;}
    }
  }));
  if(!isCurrent())return null;
  if(failure&&grouped)return load(entry,dataRoot,isCurrent);
  if(failure)throw failure;
  const floats=name=>decoded.get(name)||new Float32Array(loaded.get(name));
  return {
    layers:entry.layers.map(l=>({...l,base:floats(l.base),gbuffer:floats(l.gbuffer),patches:(l.patches||[]).map(p=>p.blend?{...p,blend:floats(p.blend)}:{...p,delta:floats(p.delta)})})),
    overlays:(entry.overlays||[]).map(o=>({...o,color:floats(o.color),transmission:o.transmission?floats(o.transmission):null})),
    surfaces:(entry.surfaces||[]).map(s=>({...s,levels:s.levels.map(l=>({depth:floats(l.depth),color:floats(l.color),transmission:floats(l.transmission)}))})),
    lut:{width:entry.lut.width,height:entry.lut.height,data:new Uint8Array(loaded.get(entry.lut.url))},
    clothingFit:entry.clothingFit?{...entry.clothingFit,layers:entry.clothingFit.layers.map(row=>({...row,...(row.skinMask?{skinMask:{...row.skinMask,delta:floats(row.skinMask.delta)}}:{})}))}:null,
    hairFit:entry.hairFit?{...entry.hairFit,...(entry.hairFit.referenceBody?{referenceBody:entry.hairFit.referenceBody.map(floats)}:{}),layers:entry.hairFit.layers.map(row=>({...row,...(row.skinMask?{skinMask:{...row.skinMask,delta:floats(row.skinMask.delta)}}:{})}))}:null
  };
}
// Finished preview images for recent looks, so undo, redo and switching back
// are immediate. Each 1024x1536 image is 6 MiB; exports are never cached.
const FINISHED_LIMIT=6,finished=new Map();
function finishedKey(job){return job.preview&&job.assetEntry?JSON.stringify([job.dataRoot,job.assetEntry,job.context,job.options||{}]):null;}
let pendingRenders=0,prefetchToken=0;
async function render(job){
  const {id,raw,options}=job,isCurrent=()=>!job.preview||id===latestPreview;
  try{
    if(!isCurrent()){self.postMessage({id,cancelled:true});return;}
    const start=performance.now();let {layers,context}=job;
    const doneKey=finishedKey(job);
    if(doneKey&&finished.has(doneKey)){
      const kept=finished.get(doneKey);finished.delete(doneKey);finished.set(doneKey,kept);
      const pixels=kept.slice();self.postMessage({id,pixels,milliseconds:performance.now()-start,cached:true},[pixels.buffer]);return;
    }
    let frame=raw;
    if(!frame&&job.assetEntry){
      // Rim and half precision affect the assembled pixels. Bloom and grading
      // only need the last preview's framebuffer and its color LUT.
      const key=job.preview?JSON.stringify([job.dataRoot,job.assetEntry,context,options?.rim!==false,options?.half!==false,options?.clothingFit===true,options?.hairFit===true]):null;
      if(key&&previewFrame?.key===key){
        ({frame,context}=previewFrame);
      }else{
        if(job.preview)previewFrame=null;
        const loaded=await load(job.assetEntry,job.dataRoot,isCurrent,job.openingMembers);
        if(!loaded){self.postMessage({id,cancelled:true});return;}
        const postContext={...context,lut:loaded.lut};
        const fit=options?.clothingFit&&loaded.clothingFit?ClothingFit.apply(loaded.layers,loaded.surfaces,context,loaded.clothingFit):loaded;
        const hair=options?.hairFit&&loaded.hairFit?HairFit.apply(fit.layers,context,loaded.hairFit):fit;
        frame=AvatarCompositor.composeFrame(hair.layers,{...postContext,overlays:loaded.overlays,surfaces:fit.surfaces},options);
        context=postContext;
        if(key)previewFrame={key,frame,context};
      }
    }
    const pixels=frame?AvatarCompositor.postprocess(frame,context,options):AvatarCompositor.compose(layers,context,options);
    if(doneKey&&isCurrent()){
      finished.set(doneKey,pixels.slice());
      while(finished.size>FINISHED_LIMIT)finished.delete(finished.keys().next().value);
    }
    self.postMessage({id,pixels,milliseconds:performance.now()-start},[pixels.buffer]);
  }catch(error){self.postMessage({id,error:error.message});}
}
// Prefetch only fills the transport and decoded caches. It runs outside the
// render queue and stops as soon as a render arrives or a newer prefetch starts.
function prefetch(job){
  const token=++prefetchToken;
  queue.then(()=>{
    if(token!==prefetchToken||pendingRenders)return;
    return load(job.assetEntry,job.dataRoot,()=>token===prefetchToken&&!pendingRenders);
  }).catch(()=>{});
}
self.onmessage=event=>{
  const job=event.data;
  if(job.openingFiles){prepareOpeningFiles(job.openingFiles,job.dataRoot);return;}
  if(job.packDirectories){
    for(const [file,directory] of Object.entries(job.packDirectories)){
      if(!/^(?:items\/packs|runtime)\/[a-f0-9]{64}\.wpack$/.test(file))continue;
      packDirectories.set(new URL(file,job.dataRoot).href,directory);
    }
    while(packDirectories.size>64)packDirectories.delete(packDirectories.keys().next().value);
  }
  if(job.prefetch){prefetch(job);return;}
  if(job.preview)latestPreview=job.id;
  pendingRenders++;
  queue=queue.then(()=>render(job)).finally(()=>{pendingRenders--;});
};
