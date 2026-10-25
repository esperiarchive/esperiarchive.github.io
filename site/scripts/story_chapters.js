(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoryChapters=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function install(source,catalog,story,line,logical){
    if(!logical)return source;
    const plans=(catalog?.placements?.[source.asset_key]||[]).filter(plan=>plan.line===String(line)
      && plan.step===story.objective_key);
    if(!plans.length||source.nodes['chapter:before:0']||source.nodes['chapter:after:0'])return source;
    const graph=structuredClone(source);
    function chain(entries,target,prefix){
      for(let i=entries.length-1;i>=0;i--){const id=prefix+i;
        graph.nodes[id]={id,type:'line',entry_kind:'chapter_artwork',chapter_artwork:entries[i],next:target};target=id;}
      return target;
    }
    const after=plans.filter(plan=>plan.timing==='after');
    if(after.length){
      const ends=new Set(Object.values(graph.nodes).filter(node=>node.type==='end'&&!node.next).map(node=>node.id));
      if(ends.size){const target=chain(after,[...ends][0],'chapter:after:');
        for(const node of Object.values(graph.nodes)){
          if(node.entry_kind==='chapter_artwork')continue;
          for(const field of ['next','target','skip','return_to'])if(ends.has(node[field]))node[field]=target;
          for(const option of node.options||[])if(ends.has(option.target))option.target=target;
        }
        graph.roots=graph.roots.map(id=>ends.has(id)?target:id);
      }
    }
    const before=plans.filter(plan=>plan.timing==='before');
    if(before.length&&graph.roots.length===1)graph.roots=[chain(before,graph.roots[0],'chapter:before:')];
    return graph;
  }
  function gallery(catalog,collection,lineVisible=()=>true,chapterSourceTitle=''){
    return Object.values(catalog?.chapters||{}).filter(chapter=>chapter.collection===collection
      && (!chapterSourceTitle || chapter.title_i18n.cn===chapterSourceTitle)).map(chapter=>{
      if(!Object.keys(chapter.branches||{}).length)return chapter;
      return {...chapter,branches:Object.fromEntries(Object.entries(chapter.branches).filter(([,branch])=>
        !branch.lines?.length||branch.lines.some(lineVisible)))};
    });
  }
  function petalReadingPlan(asset){
    // Main-story order is fixed. These three festival activities may be read
    // in any order, so only their displayed counts are adjustable.
    const stages = {
      'ep3/quest_story_13102200':0, 'ep3/quest_story_13102230':1,
      'ep3/quest_story_13102300':2, 'ep3/quest_story_13102260':3,
      'ep3/quest_story_13102340':4, 'ep3/quest_story_13103520':5,
      'ep3/quest_story_13104130':6, 'ep3/quest_story_13105230':7,
    };
    const count=stages[asset];
    return count===undefined ? null : {key:asset,count,options:count>=2&&count<=4 ? [2,3,4] : []};
  }
  function collectionCards(source,catalog,story,line,logical){
    const plan=catalog?.placements?.[source.asset_key];
    if(!plan || (line&&plan.owner!==String(line)) || (story.objective_key&&plan.step!==story.objective_key)
      || (logical&&(!line||!story.objective_key)))return source;
    const id='collection-card:'+plan.source_node_id;
    if(source.nodes[id])return source;
    const card=catalog.cards?.[plan.card_id],target=source.nodes[plan.before_node];
    const count=card?.source_conditions?.length;
    if(!card||card.completion_written!==false||!Number.isInteger(count)||count<1
      ||card.stages?.length!==count+1||!target
      ||target.source_node_id!==plan.next_source_node_id)throw Error('Collection card source boundary changed.');
    const graph=structuredClone(source);
    for(const node of Object.values(graph.nodes)){
      for(const key of ['next','target','skip','return_to'])if(node[key]===plan.before_node)node[key]=id;
      for(const option of node.options||[])if(option.target===plan.before_node)option.target=id;
    }
    graph.roots=graph.roots.map(root=>root===plan.before_node?id:root);
    graph.nodes[id]={id,type:'line',entry_kind:'chapter_artwork',source_node_id:plan.source_node_id,
      chapter_artwork:{...card,kind:'collection_card',card_id:plan.card_id,
        reading: String(plan.card_id)==='1001' ? petalReadingPlan(source.asset_key) : null},next:plan.before_node};
    return graph;
  }
  return {install,gallery,collectionCards,petalReadingPlan};
});
