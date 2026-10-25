/* Native role-banner events, attached to the existing story traversal. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoryPerspectives=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const fields=['next','target','return_to','skip'];
  function edges(node){
    const result=fields.filter(k=>typeof node[k]==='string'&&node[k]).map(k=>[node,k]);
    for(const option of node.options||[])if(option.target)result.push([option,'target']);
    return result;
  }
  function install(graph,contexts,catalog){
    if(!graph||graph._perspectivesInstalled||!catalog?.transitions)return;
    graph._perspectivesInstalled=true;
    const nodes=graph.nodes,groups=new Map();
    const originals=new Map(contexts.map(c=>[c,Object.keys(c.graph.nodes||{})]));
    const originalRoots=new Map(contexts.map(c=>[c,[...(c.graph.roots||[])]]));
    const contextsFor=event=>contexts.filter(c=>String(c.story?.objective_key?.split(':')[0]||c.story?.exploration_line_id)===event.line);
    const idsFor=context=>originals.get(context).map(id=>nodes[`${context.assetKey}::${id}`]?`${context.assetKey}::${id}`:id).filter(id=>nodes[id]);
    for(const event of catalog.transitions){
      const scope=contextsFor(event);if(!scope.length)continue;
      const key=JSON.stringify([event.line,event.anchor]);
      if(!groups.has(key))groups.set(key,{event,scope,events:[]});
      groups.get(key).events.push(event);
    }
    let serial=0;
    function chain(events,next,asset){
      for(const event of [...events].reverse()){
        const id=`perspective:${event.id}:${serial++}`;
        nodes[id]={id,type:'asset_context',asset_key:asset||'',objective_key:'',
          metadata:{perspective:event},next};next=id;
      }
      return next;
    }
    for(const {event,scope,events} of groups.values()){
      const anchor=event.anchor;
      const context=anchor.asset&&scope.find(c=>c.assetKey===anchor.asset);
      const owned=new Set(context?idsFor(context):[]);
      if(anchor.objective){
        for(const c of scope)if(c.story?.objective_key===anchor.objective)for(const id of idsFor(c))owned.add(id);
        for(const [id,node] of Object.entries(nodes))if(!node.metadata?.perspective && (node.objective_key===anchor.objective
            || id.includes(`objective_interlude:${anchor.objective}`)))owned.add(id);
      }
      if(!owned.size)continue;
      if(anchor.position==='before'&&context){
        const roots=new Set(originalRoots.get(context).map(id=>nodes[`${context.assetKey}::${id}`]?`${context.assetKey}::${id}`:id));
        const entries=new Map([...roots].map(root=>[root,chain(events,root,context.assetKey)]));
        for(const node of Object.values(nodes))if(!node.metadata?.perspective)
          for(const [owner,key]of edges(node))if(roots.has(owner[key]))owner[key]=entries.get(owner[key]);
        graph.roots=graph.roots.map(id=>entries.get(id)||id);
      }else{
        for(const id of owned){
          const node=nodes[id];
          for(const [owner,key]of edges(node)){
            if(key==='skip'||owned.has(owner[key]))continue;
            owner[key]=chain(events,owner[key],context?.assetKey);
          }
          if(node.type==='end'&&!node.next)node.next=chain(events,'',context?.assetKey);
        }
      }
    }
    const first=contexts[0],line=String(first?.story?.objective_key?.split(':')[0]||first?.story?.exploration_line_id);
    const initial=catalog.asset_viewpoints?.find(row=>row.line===line&&row.asset===first?.assetKey);
    const states=new Map(),queue=(graph.roots||[]).map(id=>[id,catalog.vehicles?.[initial?.vehicle]?.model||'merlin']);
    for(let i=0;i<queue.length;i++){
      const [id,previous]=queue[i],node=nodes[id];if(!node)continue;
      if(node.metadata?.perspective){
        const incoming=node.metadata.perspectiveIncoming ||= [];
        if(!incoming.includes(previous))incoming.push(previous);
      }
      const model=node.metadata?.perspective?.model||previous;
      const seen=states.get(id)||new Set();if(seen.has(model))continue;seen.add(model);states.set(id,seen);
      for(const [owner,key]of edges(node))queue.push([owner[key],model]);
    }
    for(const [id,models]of states){nodes[id].reader_viewpoint_model=models.size===1?[...models][0]:'';nodes[id].reader_viewpoint_ambiguous=models.size>1;}
  }
  return {install};
});
