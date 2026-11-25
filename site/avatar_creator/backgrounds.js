/* Original game backgrounds, shared by the 2D and 3D studios. */
(function(root,factory){
  const script=typeof document==='undefined'?null:document.currentScript;
  const api=factory(script?new URL('backgrounds/',script.src).href:'backgrounds/');
  if(typeof module==='object'&&module.exports)module.exports=api;else root.WardrobeBackgrounds=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(base){
  const entries=Object.freeze([
    ['starry-sky','Starry sky'],['green-fields','Green fields'],['golden-fields','Golden fields'],
    ['moonlit-fields','Moonlit fields'],['misty-fields','Misty fields'],['hearts','Hearts'],
    ['fireworks','Fireworks'],['golden-pattern','Golden pattern'],
  ].map(([id,label])=>Object.freeze({id:'game-'+id,label,file:id+'.webp'})));
  const find=id=>entries.find(entry=>entry.id===id);
  const url=id=>{const entry=find(id);return entry?base+entry.file:null;};
  function apply(stage,id){
    const image=url(id);
    stage.style.backgroundImage=image?`url("${image}")`:'';
    stage.style.backgroundSize=image?'cover':'';
    stage.style.backgroundPosition=image?'center':'';
  }
  function decorate(button,id){
    const image=url(id);if(!image)return;
    const thumbnail=document.createElement('img');thumbnail.src=image;thumbnail.alt='';thumbnail.loading='lazy';
    button.prepend(thumbnail);
  }
  function addOptions(select){
    for(const entry of entries){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label;select.append(option);}
  }
  const images=new Map();
  function load(id){
    const source=url(id);if(!source)return Promise.resolve(null);
    if(!images.has(source))images.set(source,new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(source);reject(Error('Could not load background'));};image.src=source;
    }));
    return images.get(source);
  }
  function coverRect(sourceWidth,sourceHeight,width,height){
    const scale=Math.max(width/sourceWidth,height/sourceHeight),w=sourceWidth*scale,h=sourceHeight*scale;
    return [(width-w)/2,(height-h)/2,w,h];
  }
  async function paint(ctx,id,width,height){
    const image=await load(id);
    if(image)ctx.drawImage(image,...coverRect(image.naturalWidth,image.naturalHeight,width,height));
    else if(id!=='clear'){ctx.fillStyle=id==='white'?'#fff':'#101010';ctx.fillRect(0,0,width,height);}
  }
  return {entries,find,url,apply,decorate,addOptions,paint,coverRect};
});
