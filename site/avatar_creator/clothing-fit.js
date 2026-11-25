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
