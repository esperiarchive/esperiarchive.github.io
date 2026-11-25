/* Availability stays complete; detailed capture metadata loads by selected view. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WardrobeLibrary=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function matches(pointer,head){
    return head.ok&&(Number(head.headers.get('Content-Length'))===pointer.bytes||
      ['"'+pointer.identityTag+'-gzip"','"'+pointer.identityTag+'-identity"'].includes(head.headers.get('ETag')))&&
      Math.floor(Date.parse(head.headers.get('Last-Modified'))/1000)===pointer.modifiedSeconds;
  }
  // `first`: views ("gender/pose/yaw") to download alongside the availability index.
  async function open(pointer,read,first=[]){
    if(pointer.schema!=='afk.wardrobe.runtime'||pointer.version!==1)throw Error('Unsupported runtime library.');
    const early=new Map();
    for(const key of first)if(pointer.shards?.[key]&&!early.has(key)){const request=read(pointer.shards[key]);request.catch(()=>{});early.set(key,request);}
    const library=await read(pointer.coverage),scopes=library.patchScopes;
    if(!library.metadataOnly||!Array.isArray(scopes)||library.parts.length!==pointer.parts)throw Error('Invalid wardrobe availability index.');
    for(const part of library.parts)for(const layer of part.layers){
      if(!Array.isArray(scopes[layer.patchScope]))throw Error('Invalid wardrobe appearance scope.');
      layer.patches=scopes[layer.patchScope];delete layer.patchScope;
    }
    delete library.patchScopes;
    const shards=new Map(),pending=new Map();
    async function ensure(gender,pose,yaw=0){
      const key=[gender,pose,yaw].join('/');
      if(shards.has(key)){const value=shards.get(key);shards.delete(key);shards.set(key,value);return value;}
      if(pending.has(key))return pending.get(key);
      const info=pointer.shards[key];if(!info)return {...library,metadataOnly:false,parts:[]};
      const request=(early.get(key)||read(info)).then(value=>{
        if(value.metadataOnly||value.schema!==library.schema||value.version!==library.version||value.validation?.passed!==true||
          value.parts.some(p=>p.gender!==gender||p.pose!==pose||p.yaw!==yaw))throw Error('Invalid wardrobe view metadata.');
        shards.set(key,value);while(shards.size>2)shards.delete(shards.keys().next().value);
        return value;
      }).finally(()=>pending.delete(key));
      early.clear();   // a guess the opening look didn't use is dropped
      pending.set(key,request);return request;
    }
    return {library,ensure,totalParts:pointer.parts};
  }
  return {matches,open};
});
