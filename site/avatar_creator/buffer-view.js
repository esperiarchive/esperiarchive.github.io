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
