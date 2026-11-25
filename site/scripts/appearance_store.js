/* User-created portrait packs live in IndexedDB; startup reads only metadata. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ReaderAppearanceStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function create(database=globalThis.indexedDB){
    let opening;
    function open(){
      return opening ||= new Promise((resolve,reject)=>{
        if(!database)return reject(new Error('Saved looks require browser storage.'));
        const request=database.open('afkReaderLooks',1);
        request.onupgradeneeded=()=>{request.result.createObjectStore('looks',{keyPath:'id'});request.result.createObjectStore('packs');};
        request.onerror=()=>{opening=null;reject(request.error);};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
        request.onblocked=()=>{opening=null;reject(new Error('Close other reader tabs to update saved looks.'));};
      });
    }
    async function transact(stores,mode,run){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(stores,mode);let value;
        tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Could not save this look. Browser storage may be full.'));
        try{run(tx,result=>{value=result;});}catch(error){tx.abort();reject(error);}
      });
    }
    const read=(store,key)=>transact([store],'readonly',(tx,done)=>{const request=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);request.onsuccess=()=>done(request.result);});
    return {
      list:()=>read('looks'),get:id=>read('packs',id),
      put:(row,source)=>transact(['looks','packs'],'readwrite',tx=>{tx.objectStore('looks').put(row);tx.objectStore('packs').put(source,row.id);}),
      rename:(id,displayName)=>transact(['looks'],'readwrite',tx=>{const store=tx.objectStore('looks'),request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,displayName});};}),
      updateThumbnail:(id,thumbnail,thumbnailVersion)=>transact(['looks'],'readwrite',tx=>{const store=tx.objectStore('looks'),request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,thumbnail,thumbnailVersion});};}),
      remove:id=>transact(['looks','packs'],'readwrite',tx=>{tx.objectStore('looks').delete(id);tx.objectStore('packs').delete(id);})
    };
  }
  return {create};
});
