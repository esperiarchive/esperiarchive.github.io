/* Apply the recovered old-photo LUT to portrait crops, without changing assets. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DialogueColorLookup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  function grade(pixels, lut, size, contribution) {
    const amount = Math.max(0, Math.min(1, contribution));
    const last = size - 1, width = size * size;
    const index = (r,g,b) => ((last-g)*width+b*size+r)*4;
    for (let p=0;p<pixels.length;p+=4) {
      if (!pixels[p+3]) continue;
      const r=pixels[p]/255*last,g=pixels[p+1]/255*last,b=pixels[p+2]/255*last;
      const r0=Math.floor(r),g0=Math.floor(g),b0=Math.floor(b);
      const r1=Math.min(last,r0+1),g1=Math.min(last,g0+1),b1=Math.min(last,b0+1);
      const fr=r-r0,fg=g-g0,fb=b-b0;
      const indices=[index(r0,g0,b0),index(r1,g0,b0),index(r0,g1,b0),index(r1,g1,b0),
        index(r0,g0,b1),index(r1,g0,b1),index(r0,g1,b1),index(r1,g1,b1)];
      const weights=[(1-fr)*(1-fg)*(1-fb),fr*(1-fg)*(1-fb),(1-fr)*fg*(1-fb),fr*fg*(1-fb),
        (1-fr)*(1-fg)*fb,fr*(1-fg)*fb,(1-fr)*fg*fb,fr*fg*fb];
      for(let c=0;c<3;c++) {
        let mapped=0;for(let k=0;k<8;k++) mapped+=lut[indices[k]+c]*weights[k];
        pixels[p+c]=Math.round(pixels[p+c]*(1-amount)+mapped*amount);
      }
    }
    return pixels;
  }
  let lookupPromise;
  function loadLookup() {
    if (!lookupPromise) lookupPromise = new Promise((resolve,reject)=>{
      const image=new Image();
      image.crossOrigin="anonymous";
      image.onload=()=>{
        try {
          const size=image.naturalHeight;
          if(image.naturalWidth!==size*size) throw new Error("Invalid memory color lookup dimensions");
          const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=size;
          const context=canvas.getContext("2d",{willReadFrequently:true});
          context.drawImage(image,0,0);
          resolve({size,pixels:context.getImageData(0,0,canvas.width,canvas.height).data});
        } catch(error) {reject(error);}
      };
      image.onerror=()=>reject(new Error("Memory color lookup could not be loaded"));
      image.src=ReaderPublication.url("assets/dialogue_effects/memory/oldphotos-lut.v1.png");
    });
    return lookupPromise;
  }
  const portraits=new WeakMap();
  function refresh(frame) {
    const entry=portraits.get(frame);
    if(!entry?.lookup || !frame.isConnected) return;
    const {image,canvas,lookup}=entry;
    const fw=frame.clientWidth,fh=frame.clientHeight;
    const iw=parseFloat(image.style.width),ih=parseFloat(image.style.height);
    const ix=parseFloat(image.style.left),iy=parseFloat(image.style.top);
    if(!image.naturalWidth || !fw || !fh || ![iw,ih,ix,iy].every(Number.isFinite)) return;
    const key=[image.currentSrc,fw,fh,iw,ih,ix,iy].join("|");
    if(entry.key===key) return;
    const scale=Math.min(512/fw,Math.max(2,128/fw));
    canvas.width=Math.round(fw*scale);canvas.height=Math.round(fh*scale);
    const context=canvas.getContext("2d",{willReadFrequently:true});
    context.drawImage(image,ix*scale,iy*scale,iw*scale,ih*scale);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    grade(pixels.data,lookup.pixels,lookup.size,.85);
    context.putImageData(pixels,0,0);
    entry.key=key;frame.dataset.memoryGraded="true";
  }
  function decorate(frame) {
    const image=frame.querySelector(".dialogue-line-portrait-image");
    if(!image || portraits.has(frame)) return;
    const canvas=document.createElement("canvas");canvas.className="dialogue-memory-color";
    canvas.setAttribute("aria-hidden","true");frame.appendChild(canvas);
    const vignette=document.createElement("span");vignette.className="dialogue-memory-vignette";
    vignette.setAttribute("aria-hidden","true");frame.appendChild(vignette);
    frame.dataset.memory="nostalgic";
    const entry={image,canvas,lookup:null,key:""};portraits.set(frame,entry);
    image.addEventListener("load",()=>refresh(frame));
    loadLookup().then(lookup=>{entry.lookup=lookup;refresh(frame);}).catch(error=>{
      // Keep the original portrait if grading fails; no blank/broken replacement.
      canvas.remove();vignette.remove();delete frame.dataset.memory;portraits.delete(frame);
      console.warn(error.message);
    });
  }
  return {grade,decorate,refresh};
});
