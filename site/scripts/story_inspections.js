/* Verified PictureView points, with progress local to the current reader session. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.StoryInspections=api;
})(typeof globalThis==='object'?globalThis:this,function() {
  const key=(asset,id)=>`${asset}::${id}`;
  function install(graph,contexts,catalog,group,logical) {
    if(!logical || !graph?.stats?.part_count) return graph;
    const byAsset=new Map(contexts.map(context=>[context.assetKey,context]));
    for(const line of Object.values(catalog?.picture_inspections?.lines || {})) {
      if(line.logical_group!==group) continue;
      for(const inspection of line.groups) {
        const first=inspection.members[0],header=graph.nodes[key(first,'asset_context')];
        const native=inspection.plan.evidence.inspection_points;
        // Install only complete, already verified groups with one terminal return
        // per child. Preserve unfamiliar graphs instead of changing their exits.
        if(!header || native.length!==inspection.members.length) continue;
        const points=native.map((point,index)=> {
          const context=byAsset.get(point.asset_key);
          const ends=Object.values(context?.graph.nodes || {}).filter(node=>node.type==='end');
          return {index,asset:point.asset_key,plot:point.plot,
            target:context?.graph.roots?.length===1 ? key(point.asset_key,context.graph.roots[0]) : '',
            end:ends.length===1 ? key(point.asset_key,ends[0].id) : ''};
        });
        if(points.some((point,index)=>point.asset!==inspection.members[index]
          || !graph.nodes[point.target] || !graph.nodes[point.end])) continue;
        const continuation=graph.nodes[points.at(-1).end].next;
        if(!continuation || !graph.nodes[continuation]) continue;
        const id=key(first,`inspection:${inspection.step}`);
        graph.nodes[id]={id,type:'inspection',step:inspection.step,plan:inspection.plan,points,next:continuation};
        header.next=id;
        for(const point of points) {
          const end=graph.nodes[point.end];
          graph.nodes[point.end]={...end,type:'inspection_return',inspection:id,point:point.asset,next:id};
        }
      }
    }
    return graph;
  }
  function progress(session,node) {
    const record=session.local(node.id).inspection_read || {};
    const read=node.points.filter(point=>record[point.asset]===true).map(point=>point.asset);
    return {read,total:node.points.length,complete:node.points.length>0 && read.length===node.points.length};
  }
  function markRead(session,node,asset) {
    if(!node?.points.some(point=>point.asset===asset)) throw new Error('Unknown inspection point.');
    (session.local(node.id).inspection_read ||= {})[asset]=true;
    return progress(session,node);
  }
  function select(session,node,asset) {
    const point=node.points.find(point=>point.asset===asset);
    if(!point) throw new Error('Unknown inspection point.');
    return {point,replay:progress(session,node).read.includes(asset)};
  }
  function complete(session,node) {
    if(!progress(session,node).complete) throw new Error('Read every inspection point before continuing.');
    return node.next;
  }
  function point(catalog,group,asset) {
    for(const line of Object.values(catalog?.picture_inspections?.lines || {})) {
      if(line.logical_group!==group) continue;
      for(const inspection of line.groups) {
        const index=inspection.members.indexOf(asset);
        if(index>=0) return {index,step:inspection.step};
      }
    }
    return null;
  }
  return {install,progress,markRead,select,complete,point};
});
