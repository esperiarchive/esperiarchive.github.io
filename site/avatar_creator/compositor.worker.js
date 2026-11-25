importScripts('buffer-view.js','compositor.js','clothing-fit.js','hair-fit.js','item-storage.js');
const cache=new Map(),rangesBlocked=new Set();let cacheBytes=0,queue=Promise.resolve(),latestPreview=0,previewFrame=null;
// Keep compressed transport separate from immutable decoded crops. A new
// hairstyle can reuse the current body, face and palette without expanding them.
const TRANSFER_CACHE_LIMIT=24*1024*1024;
const decodedCache=new Map();let decodedBytes=0;
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
async function packedMembers(url,keys,isCurrent){
  const result=new Map(),missing=[];
  for(const key of keys){const value=decodedGet(url+'#'+key);if(value)result.set(key,value);else missing.push(key);}
  if(!missing.length)return result;
  const first=await range(url,0,65535,true),head=new Uint8Array(first);
  if(head.length<8||!ItemStorage.MAGICS.has(String.fromCharCode(...head.subarray(0,4))))throw new Error('Invalid wardrobe pack.');
  const length=new DataView(first).getUint32(4,true);
  if(length>16*1024*1024)throw new Error('Wardrobe pack index is too large.');
  const header=length+8<=head.length?head.subarray(8,8+length):new Uint8Array(await range(url,8,7+length));
  const index=JSON.parse(new TextDecoder().decode(header));
  const valid=meta=>meta&&[meta.offset,meta.length].every(Number.isSafeInteger)&&meta.offset>=0&&meta.length>0;
  // Members that lie close together arrive in one request, and every request starts now:
  // otherwise each member past the first 64 KiB waits a round trip behind the one before.
  const wanted=new Set(),want=key=>{if(wanted.has(key)||!valid(index[key]))return;wanted.add(key);if(index[key].master)want(index[key].master);};
  missing.forEach(want);
  const spans=[];
  for(const [start,end] of [...wanted].map(key=>[8+length+index[key].offset,8+length+index[key].offset+index[key].length])
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
    const cached=decodedGet(url+'#'+key);
    if(cached)return cached;
    const meta=index[key];
    if(!valid(meta))throw new Error('Missing wardrobe member.');
    const start=8+length+meta.offset,end=start+meta.length;
    const bytes=end<=head.length?head.subarray(start,end):await slice(start,end);
    if(meta.master&&(!Object.hasOwn(index,meta.master)||index[meta.master].master))throw Error('Invalid shared pixel dependency');
    const master=meta.master?await readMember(meta.master):null;
    return decodedRemember(url+'#'+key,await decodeSlot(()=>ItemStorage.decodeMember(meta,bytes,{cropped:true,master})));
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
async function load(entry,dataRoot,isCurrent){
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
  const requests=[...new Set([...names].map(name=>name.split('#')[0]))].map(name=>{
    const url=new URL(name,root);
    if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw new Error('Asset is outside the wardrobe library.');
    return [name,url.href];
  });
  const loaded=new Map(),decoded=new Map();let cursor=0,failure=null;
  // Keep one copy per URL in this render. Packs download several at a time, since each
  // waits mostly on the network; decodeSlot bounds the decompression allocations.
  // Queueing also prevents overlapping multi-GB loads.
  await Promise.all(Array.from({length:Math.min(NETWORK_LANES,requests.length)},async()=>{
    while(!failure&&isCurrent()&&cursor<requests.length){
      const [name,url]=requests[cursor++];
      try{
        const keys=[...names].filter(value=>value.startsWith(name+'#')).map(value=>value.split('#')[1]);
        if(keys.length){for(const [key,value] of await packedMembers(url,keys,isCurrent))decoded.set(name+'#'+key,value);}
        else loaded.set(name,await bytes(url));
      }catch(error){failure=error;}
    }
  }));
  if(!isCurrent())return null;if(failure)throw failure;
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
        const loaded=await load(job.assetEntry,job.dataRoot,isCurrent);
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
  if(job.prefetch){prefetch(job);return;}
  if(job.preview)latestPreview=job.id;
  pendingRenders++;
  queue=queue.then(()=>render(job)).finally(()=>{pendingRenders--;});
};
