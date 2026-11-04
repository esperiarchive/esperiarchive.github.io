/* Presentation-only boundaries between source-established encounter visits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoryEncounters=api;})(typeof globalThis==='object'?globalThis:this,function(){
  const displayed=new Set(['line','document','picture','cinematic','choice']);
  const external=/ed\.ConditionX\.(?:FishAmount|HasItem|ItemCount|TouchedSteleCount|C_ObjInteracted|IsInRange|IsWildMonsterKilled|WearingAvatarCount|\w*TimeOfDay\w*|\w*Weather\w*|\w*MiniGame\w*)\(/;
  function titles(value,kind){
    if(!['easter_egg','exploration_activity'].includes(kind)||typeof value?.en!=='string')return value;
    // The recovered Latin face uses full-em curly quotes. Keep source metadata
    // intact and use its proportional ASCII quotes in editorial English titles.
    return {...value,en:value.en.replace(/[‘’＇]/g,"'").replace(/[“”＂]/g,'"')};
  }
  function joinsFor(story){return story.easter_egg_evidence?.joins||[];}
  function receiver(join,evidence){
    const menus=(evidence.menu_receivers||[]).filter(m=>String(m.plot)===String(join.plot_id)&&String(m.task||'1')===String(join.task_id)&&String(m.step)===String(join.record).split(':').at(-1));
    if(menus.length===1&&menus[0].object)return{object:String(menus[0].object),kind:'menu'};
    const step=(evidence.steps||[]).find(s=>s.record_key===join.record);
    const match=step?.ClientFinishCondition?.match(/^ed\.ConditionX\.C_ObjInteracted\((\d+),(?:"\*"|\d+)\)$/);
    return match&&['FinishAction','ClientFinishActionByMove'].includes(join.field)?{object:match[1],kind:'object_interaction'}:null;
  }
  function gap(current,previous,evidence){
    const steps=new Map((evidence.steps||[]).map(s=>[s.record_key,s]));
    const next=steps.get(current.record),before=steps.get(previous.record);if(!next||!before)return null;
    if(next.LineID!==before.LineID)return null;
    if(next.TaskID!==before.TaskID){
      const task=(evidence.tasks||[]).find(t=>t.TaskID===next.TaskID);
      return task?.RecvCondition===`ed.ConditionX.IsExplTaskFinished(${before.LineID},${before.TaskID})`?{kind:'completed_previous_task',record:task.record_key}:null;
    }
    const pending=(String(next.PreStepList).match(/\d+/g)||[]).map(id=>({id,via:[]})),seen=new Set();
    while(pending.length){
      const {id,via}=pending.shift(),key=`${next.LineID}:${next.TaskID}:${id}`;
      if(key===before.record_key){if(via.length)return{kind:'intervening_gameplay',records:via};continue;}
      if(seen.has(key))continue;seen.add(key);const step=steps.get(key);if(!step)continue;
      const stages=external.test(step.FinishCondition+' '+step.ClientFinishCondition)?[...via,key]:via;
      for(const pre of String(step.PreStepList).match(/\d+/g)||[])pending.push({id:pre,via:stages});
    }
    return null;
  }
  function visits(story){
    if(!['easter_egg','exploration_activity'].includes(story?.logical_story_kind)||!story.easter_egg_evidence)return{};
    const evidence=story.easter_egg_evidence,joins=joinsFor(story),objects=new Map((evidence.objects||[]).map(o=>[String(o.ID),o]));
    const seen=new Map();for(const j of joins){const rows=seen.get(j.asset_key)||[];rows.push(j);seen.set(j.asset_key,rows);}
    const result={};let previous=null;
    for(const join of joins){
      const here=receiver(join,evidence);if(!here)continue;
      if(previous&&seen.get(join.asset_key)?.length===1){
        const a=objects.get(here.object),b=objects.get(previous.receiver.object);
        const elsewhere=here.object!==previous.receiver.object&&a&&b&&(a.Loc!==b.Loc||a.ZoneID!==b.ZoneID);
        const interval=gap(join,previous.join,evidence);
        if(elsewhere||interval)result[join.asset_key]={kind:'separate_interaction',record:join.record,object:here.object,previous_record:previous.join.record,
          reason:elsewhere?{kind:'different_object_location',previous_object:previous.receiver.object}:interval};
      }
      previous={join,receiver:here};
    }
    return result;
  }
  function install(graph,story){
    const boundaries=visits(story);if(!Object.keys(boundaries).length)return graph;
    const fallback=story.source_asset_key||story.asset_key,source=node=>node?.portrait_source_asset||fallback;
    const starts=new Set(graph.roots||[]);
    for(const node of Object.values(graph.nodes))for(const target of [node.next,node.skip,...(node.options||[]).map(o=>o.target)]){
      if(target&&graph.nodes[target]&&source(node)!==source(graph.nodes[target]))starts.add(target);
    }
    const marks=new Map();
    for(const root of starts){
      const first=graph.nodes[root],asset=source(first),boundary=boundaries[asset];if(!first||!boundary)continue;
      const queue=[root],seen=new Set();
      while(queue.length){
        const id=queue.shift();if(seen.has(id))continue;seen.add(id);const node=graph.nodes[id];if(!node||source(node)!==asset)continue;
        if(displayed.has(node.type)){marks.set(id,{...boundary,source_asset:asset});continue;}
        for(const target of [node.next,node.skip,...(node.options||[]).map(o=>o.target)])if(target)queue.push(target);
      }
    }
    if(!marks.size)return graph;
    const result=structuredClone(graph);for(const [id,boundary] of marks)result.nodes[id].encounter_visit_boundary=boundary;
    return result;
  }
  return{visits,install,titles};
});
