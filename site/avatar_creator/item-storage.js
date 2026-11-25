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
