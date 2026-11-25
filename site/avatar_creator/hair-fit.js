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
