/* Map requirements and verified catch callbacks at exact objective positions. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.StoryActivities=api;
})(typeof globalThis==='object'?globalThis:this,function() {
  function lookup(placements,group,asset,step,position,logical) {
    return (logical?placements?.logical_groups:placements?.groups)?.[group]?.[asset]?.[`${position}:${step}`] || null;
  }
  function map(catalog,group,asset,step,position='objective',logical=false) {
    if(logical) for(const line of Object.values(catalog?.picture_inspections?.lines || {})) {
      if(line.logical_group !== group) continue;
      const inspection=line.groups.find(entry=>entry.step===step);
      if(inspection) return position==='objective' && asset===inspection.members[0] ? inspection.plan : null;
    }
    return lookup(catalog?.map_activities,group,asset,step,position,logical);
  }
  function pictureCatalog(source,exploration) {
    if(source?.schema_version!==1) return null;
    const quests=new Map((exploration?.collections || []).flatMap(c=>(c.chapters || [])
      .flatMap(h=>(h.groups || []).flatMap(g=>g.stories || []))).map(s=>[String(s.line_id),s]));
    const lines={};
    for(const [id,line] of Object.entries(source.lines || {})) {
      const quest=quests.get(id);
      const keys=[...new Set((quest?.assets || []).map(a=>a.asset_key).filter(Boolean))];
      if(keys.length!==line.source_asset_keys.length || !keys.every((key,i)=>key===line.source_asset_keys[i])) continue;
      if(line.ordered_asset_keys.length!==keys.length || new Set(line.ordered_asset_keys).size!==keys.length
         || !line.ordered_asset_keys.every(key=>keys.includes(key))) continue;
      if(!line.groups.every(g=>g.members.length && g.members.every(key=>keys.includes(key))
         && keys.includes(g.before_asset) && g.plan.step===g.step && g.plan.activity_type==='PictureView')) continue;
      lines[id]=line;
    }
    return {...source,lines};
  }
  function pictureStory(catalog,lineId) {
    return catalog?.picture_inspections?.lines?.[String(lineId)] || null;
  }
  function pictureAsset(story,inspection,catalog) {
    if(!inspection) return story;
    let result=story;
    const group=inspection.groups.find(g=>g.members.includes(story.asset_key));
    if(group) result={...story,objective_key:group.step,
      objective_title_i18n:group.plan.objective_title_i18n,
      objective_summary_i18n:group.plan.objective_summary_i18n,
      objective_title_status:'native_picture_inspection',objective_summary_status:'native_picture_inspection'};
    const steps=new Set(inspection.groups.map(g=>g.step));
    for(const field of ['objective_interludes_before','objective_interludes_after']) {
      if(!story[field]) continue;
      const entries=story[field].filter(entry=>!steps.has(entry.objective_key));
      if(entries.length!==story[field].length) result={...result,[field]:entries};
    }
    // Preserve an existing activity that precedes this inspection's first plot.
    // For group 7, the bag puzzle completes by opening the picture activity.
    const preceding=group && story.asset_key===group.members[0] && story.objective_key!==group.step
      && lookup(catalog?.map_activities,inspection.logical_group,story.asset_key,
        story.objective_key,'objective',true);
    if(preceding && preceding.activity_type!=='PictureView') {
      const entries=result.objective_interludes_before || [];
      if(!entries.some(entry=>entry.objective_key===story.objective_key)) result={...result,
        objective_interludes_before:[...entries,{objective_key:story.objective_key,
          objective_title_i18n:story.objective_title_i18n,
          objective_summary_i18n:story.objective_summary_i18n,objective_position:'objective'}]};
    }
    return result;
  }
  function fishing(catalog,group,asset,step,position='objective',logical=false) {
    return lookup(catalog?.fishing?.placements,group,asset,step,position,logical);
  }
  function visible(plan,session) {
    const value=session.evaluate(plan.gate);
    if(typeof value!=='boolean') throw new Error('Unresolved activity storyline.');
    return value;
  }
  function insertFishing(graph,catalog,plan,next,prefix) {
    const continuation=next;
    for(let index=plan.catches.length-1;index>=0;index--) {
      const caught=plan.catches[index];
      const dialogue=caught.dialogue && catalog.fishing.dialogues[caught.dialogue];
      if(dialogue && !caught.completion_followup) {
        const child=dialogue.success.graph;
        for(const id of [...dialogue.success.lines].reverse()) {
          const source=child.nodes[id],name=`${prefix}:catch:${index}:line:${id}`;
          const node={...structuredClone(source),id:name,next,
            portrait_source_asset:caught.dialogue,portrait_source_node:id};
          for(const [field,entries,localeField] of [['text_key','text_entries','texts'],['speaker_key','speaker_entries','speakers']]) {
            if(!source[field]) continue;
            const key=`${prefix}:catch:${index}:${source[field]}`;
            node[field]=key;
            graph[entries][key]={...structuredClone(child[entries][source[field]]),key};
            for(const [language,locale] of Object.entries(dialogue.locales)) {
              const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
              if(locale[localeField]?.[source[field]]) embedded[localeField][key]=structuredClone(locale[localeField][source[field]]);
            }
          }
          graph.nodes[name]=node; next=name;
        }
      }
      const id=`${prefix}:catch:${index}:result`;
      graph.nodes[id]={id,type:'runtime',runtime_scope:prefix,next,
        instruction:{op:'fishing_result',result:{kind:'fishing',fish:caught.fish,key:`${plan.step}:${index}`,
          sequence:plan.catches.length>1?`Catch ${index+1} of ${plan.catches.length}`:''}}};
      next=id;
    }
    const id=prefix+':gate';
    graph.nodes[id]={id,type:'runtime',runtime_scope:prefix,instruction:{op:'gate',expression:plan.gate},next,skip:continuation};
    return id;
  }
  function inlineDialogues(catalog,plan) {
    return [['start',plan.start_dialogue],['completion',plan.completion_dialogue]].flatMap(([phase,asset])=> {
      const dialogue=catalog.map_activities.status_dialogues?.[asset];
      return dialogue?.[phase] ? [{phase,asset,dialogue,variant:dialogue[phase]}] : [];
    });
  }
  function encounterDialogues(catalog,plan) {
    return (plan.encounter_dialogues || []).flatMap(({asset,condition})=> {
      const dialogue=catalog.map_activities.status_dialogues?.[asset];
      return condition?.kind==='active_encounter_elapsed' && condition.operator==='>='
        && Number.isFinite(condition.value) && condition.value>=0 && dialogue?.encounter
        ? [{asset,condition,dialogue,variant:dialogue.encounter}] : [];
    });
  }
  function route(catalog,plan,asset,group,logical) {
    if(!logical || !['MapEscort','Stalking'].includes(plan.activity_type)) return null;
    const entry=catalog?.route_dialogues?.plans?.[plan.step];
    return entry && entry.group===String(plan.evidence.group) && entry.anchor_asset===asset
      && entry.scope===group && (!entry.activity_type || entry.activity_type===plan.activity_type)
      && (!entry.slot || entry.slot===`${plan.position || 'objective'}:${plan.step}`) ? entry : null;
  }
  function presumedRoute(catalog,group,owner,asset,step,position,logical) {
    if(!logical)return null;
    const entry=catalog?.route_dialogues?.plans?.[step],a=entry?.admission;
    return entry&&a?.kind==='user_requested_presumed_route_owner'&&a.status==='presumed'
      &&a.policy?.user_requested===true&&a.policy.id==='presumed_source_paths_20261023'
      &&a.source_verification===false&&a.runtime_owner_attachment_verified===false
      &&typeof a.evidence_file==='string'&&/^[a-f0-9]{64}$/.test(a.evidence_sha256||'')
      &&entry.scope===group&&entry.step.split(':')[0]===String(owner)
      &&entry.anchor_asset===asset&&entry.slot===`${position}:${step}` ? entry : null;
  }
  function installRoute(source,catalog,plan,sceneInstall) {
    if(!plan?.inline_graph || !plan.sequence_complete || source.route_sequences?.includes(plan.step)) return source;
    const graph=structuredClone(source);
    if(graph.roots.length!==1) throw new Error('Ambiguous route continuation');
    let continuation=graph.roots[0];
    for(const entry of [...plan.sequence].reverse()) {
      // This exact final request already has its authored quest asset. Join
      // that existing continuation instead of copying it a second time.
      if(entry.delegated_to_anchor) continue;
      if(entry.kind==='object_state_request') {
        const request=entry.request;
        if(request?.operation!=='set_final_states' || !Array.isArray(request.object_ids)
            || !request.object_ids.length || !request.object_ids.every(id=>Number.isSafeInteger(id)&&id>0))
          throw new Error('Unsupported route state request');
        const id=`route:${plan.step}:${entry.id}:object-state-request`;
        if(graph.nodes[id]) throw new Error('Duplicate route state request');
        graph.nodes[id]={id,type:'runtime',runtime_scope:plan.step,next:continuation,
          instruction:{op:'object_state_request',request:structuredClone(request)}};
        continuation=id;
        continue;
      }
      const dialogue=catalog.route_dialogues.dialogues[entry.asset];
      const child=sceneInstall(dialogue.graph,dialogue.scene_summary);
      const prefix=`route:${plan.step}:${entry.id}:${entry.asset}:`;
      const key=value=>value ? prefix+value : '';
      for(const [family,localeField] of [['text_entries','texts'],['speaker_entries','speakers']]) {
        for(const [id,value]of Object.entries(child[family]||{})) graph[family][key(id)]={...structuredClone(value),key:key(id)};
        for(const language of ['cn','en','jp','kr']) {
          const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
          for(const [id,value]of Object.entries({...dialogue.locales[language]?.[localeField],...child.embedded_locales?.[language]?.[localeField]})) {
            embedded[localeField][key(id)]=structuredClone(value);
          }
        }
      }
      for(const [id,value]of Object.entries(child.nodes)) {
        const node=structuredClone(value),name=key(id);
        if(graph.nodes[name]) throw new Error('Duplicate route node');
        node.id=name;node.portrait_source_asset=entry.asset;node.portrait_source_node=id;
        // Local menu reads belong to this plot launch. Reusing the same asset
        // at a later waypoint must not inherit the previous launch's topics.
        if(node.route_choice && !node.persistent_choice)node.runtime_scope=prefix+(node.runtime_scope || entry.asset);
        for(const field of ['text_key','speaker_key','summary_text_key','next','return_to','skip','target']) if(node[field]) node[field]=key(node[field]);
        if(node.prompt_text_keys)node.prompt_text_keys=node.prompt_text_keys.map(key);
        if(node.options)node.options=node.options.map(option=>({...option,text_key:key(option.text_key),target:key(option.target)}));
        if(node.type==='end') {
          node.type='runtime';node.runtime_scope=entry.asset;node.instruction={op:'continue'};node.next=continuation;
        }
        graph.nodes[name]=node;
      }
      if(child.roots.length!==1)throw new Error('Ambiguous route entry');
      continuation=key(child.roots[0]);
    }
    graph.roots=[continuation];graph.route_sequences=[...(graph.route_sequences||[]),plan.step];
    return graph;
  }
  function insertStart(graph,catalog,plan,next,prefix) {
    for(const {phase,asset,dialogue,variant} of inlineDialogues(catalog,plan).reverse()) {
    const child=variant.graph;
    for(const id of [...variant.lines].reverse()) {
      const source=child.nodes[id],name=`${prefix}:${phase}:line:${id}`;
      const node={...structuredClone(source),id:name,next,
        portrait_source_asset:asset,portrait_source_node:id};
      for(const [field,entries,localeField] of [['text_key','text_entries','texts'],['speaker_key','speaker_entries','speakers']]) {
        if(!source[field]) continue;
        const key=`${prefix}:${phase}:${source[field]}`;node[field]=key;
        graph[entries][key]={...structuredClone(child[entries][source[field]]),key};
        for(const [language,locale] of Object.entries(dialogue.locales)) {
          const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
          if(locale[localeField]?.[source[field]]) embedded[localeField][key]=structuredClone(locale[localeField][source[field]]);
        }
      }
      graph.nodes[name]=node;next=name;
    }
    }
    return next;
  }
  function insertRoute(graph,catalog,plan,next,prefix,sceneInstall) {
    const child=installRoute({roots:['join'],nodes:{join:{id:'join',type:'runtime',instruction:{op:'continue'}}},
      text_entries:{},speaker_entries:{}},catalog,plan,sceneInstall);
    const key=id=>id ? prefix+':'+id : '';
    for(const family of ['text_entries','speaker_entries']) for(const [id,value]of Object.entries(child[family]))
      graph[family][key(id)]={...structuredClone(value),key:key(id)};
    for(const [language,locale]of Object.entries(child.embedded_locales||{})) {
      const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
      for(const family of ['texts','speakers'])for(const [id,value]of Object.entries(locale[family]||{}))
        embedded[family][key(id)]=structuredClone(value);
    }
    for(const [id,value]of Object.entries(child.nodes)) {
      const node=structuredClone(value);node.id=key(id);
      if(graph.nodes[node.id])throw new Error('Duplicate interlude route node');
      for(const field of ['text_key','speaker_key','summary_text_key','next','return_to','skip','target'])if(node[field])node[field]=key(node[field]);
      if(node.prompt_text_keys)node.prompt_text_keys=node.prompt_text_keys.map(key);
      if(node.options)node.options=node.options.map(o=>({...o,text_key:key(o.text_key),target:key(o.target)}));
      if(id==='join')node.next=next;
      graph.nodes[node.id]=node;
    }
    return key(child.roots[0]);
  }
  function presentation(catalog,story,scope,owner,logical) {
    const entry=catalog?.route_dialogues?.story_presentations?.[story.asset_key];
    if(!logical || !entry || entry.scope!==scope || entry.owner!==owner || entry.step!==story.objective_key)return null;
    return structuredClone(entry.dialogue.graph);
  }
  function movement(catalog,story,scope,owner,logical) {
    const entry=catalog?.route_dialogues?.movement_presentations?.[story.asset_key];
    const admitted=entry?.admission?.kind==='auxiliary_range_window' && entry.window?.end_step===entry.step
      || entry?.admission?.kind==='user_observation_and_source_range_window'
        && entry.admission.boundary_verified===true && typeof entry.admission.observation_file==='string'
        && entry.admission.observation_file.length>0 && Array.isArray(entry.admission.source_windows)
        && entry.admission.source_windows.length>0
      || entry?.admission?.kind==='user_requested_presumed_source_placement'
        && entry.admission.user_requested===true && entry.admission.placement_status==='presumed'
        && typeof entry.admission.audit_file==='string' && entry.admission.audit_file.length>0
        && Array.isArray(entry.admission.source_bindings) && entry.admission.source_bindings.length>0
      || entry?.admission?.kind==='user_observation_and_source_location_phase'
        && entry.admission.phase_verified===true && typeof entry.admission.observation_file==='string'
        && entry.admission.observation_file.length>0 && Array.isArray(entry.admission.source_triggers)
        && entry.admission.source_triggers.length>0
      || entry?.admission?.kind==='source_location_navigation_phase'
        && entry.admission.phase_verified===true
        && Array.isArray(entry.admission.source_triggers) && entry.admission.source_triggers.length>0
        && typeof entry.admission.evidence_file==='string' && entry.admission.evidence_file.length>0
        && /^[0-9a-f]{64}$/.test(entry.admission.evidence_sha256||'')
        && typeof entry.admission.enable_after_step==='string' && entry.admission.enable_after_step.length>0
        && entry.admission.checked_start_cells>0 && entry.admission.checked_corridor_walks>0
        && entry.admission.exact_live_playback_claimed===false;
    return logical && entry?.scope===scope && entry.owner===String(owner)
      && entry.step===story.objective_key && entry.before_asset===story.asset_key
      && admitted && entry.reader_policy==='ordinary_route'
      ? entry : null;
  }
  function reentryWarnings(entry) {
    const a=entry.admission,cc=entry.warning_contracts;
    return entry.reader_policy==='conditional_reentry_warning'&&a.optional_trigger===true
      &&Array.isArray(cc)&&cc.length===entry.dialogues.length&&cc.every((c,i)=>{
        const h=c.source_helper||{},s=c.source_enable_step||{},r=c.source_retirement_step||{},object=c.object_id;
        const expected=c.trigger==='interact'?`ed.ConditionX.C_ObjInteracted(${object},"*")`:`ed.ConditionX.IsInRange(${object})`;
        return ['range','interact'].includes(c.trigger)&&c.asset===entry.dialogues[i]&&c.asset.endsWith(`_${c.plot_id}`)&&Number.isInteger(object)&&object>0
          &&h.record_key===c.helper_step&&(c.trigger==='interact'?h.ClientFinishCondition===expected:h.FinishCondition===expected)
          &&(h.FinishAction+h.ClientFinishActionByMove).includes(`C_RunPlot(${c.plot_id})`)
          &&s.LineID===entry.owner&&r.LineID===entry.owner&&s.FinishAction.includes(`AddStates(${object},`)
          &&new RegExp(`SetFinalStates\\([^)]*\\b${object}\\b`).test(r.FinishAction);
      });
  }
  function objectiveCallbacks(catalog,scope,owner,asset,step,position,logical) {
    const entry=catalog?.route_dialogues?.objective_presentations?.[step],a=entry?.admission;
    if(!logical || entry?.scope!==scope || entry.owner!==String(owner) || entry.anchor_asset!==asset
        || entry.step!==step || entry.position!==position || a?.boundary_verified!==true
        || typeof a.evidence_file!=='string' || !a.evidence_file || !/^[0-9a-f]{64}$/.test(a.evidence_sha256||'')
        || a.source_completion_written!==false || a.native_task_order_inferred!==false
        || !Array.isArray(entry.dialogues) || !entry.dialogues.length) return null;
    if(a.kind==='user_observed_reentry_with_source_window')return reentryWarnings(entry) ? entry : null;
    if(a.kind==='verified_tracked_document_interaction') {
      const h=a.source_helper || {},p=a.source_parent_task || {},m=a.source_objective || {},s=a.source_enable_step || {};
      const object=a.interaction_object;
      let predecessors;
      try {predecessors=JSON.parse(m.PreStepList);} catch {return null;}
      return entry.reader_policy==='optional_objective_reference' && entry.dialogues.length===1
        && entry.dialogues[0].endsWith(`_${a.plot_id}`) && Number.isInteger(object) && object>0 && a.textdes_id
        && a.document_before_helper_delivery_claimed===false && a.order_between_sibling_objectives_claimed===false
        && h.ClientFinishCondition===`ed.ConditionX.C_ObjInteracted(${object},"*")`
        && h.FinishCondition==='true' && h.PreStepList==='[]'
        && h.FinishAction===`ed.ActionX.C_RunPlot(${a.plot_id})` && a.helper_step===h.record_key
        && p.record_key===String(a.helper_step).split(':').slice(0,2).join(':')
        && p.RecvCondition===`ed.ConditionX.IsExplTaskFinished(${entry.owner},${a.parent_task})`
        && entry.step===m.record_key && String(m.TrackObject).replace(/[\[\]]/g,'').split(' | ').includes(String(object))
        && Array.isArray(predecessors) && predecessors.length===1 && predecessors[0]===Number(s.StepID)
        && s.LineID===entry.owner && m.LineID===entry.owner && s.TaskID===m.TaskID
        && String(s.FinishAction).includes(`ed.ActionX.AddStates(${object},"Interactive")`)
        && a.document_source?.object_id===String(object) && a.document_source?.textdes_id===a.textdes_id
        ? entry : null;
    }
    if(a.kind==='verified_objective_inspection_callbacks') {
      const contracts=a.inspection_contracts;
      return entry.reader_policy==='optional_objective_reference' && a.order_between_inspections_claimed===false
        && Array.isArray(contracts) && contracts.length===entry.dialogues.length
        && contracts.every((c,i)=>c.asset===entry.dialogues[i] && c.full_guard===c.source_trigger?.source_condition
          && c.parent_guard===c.source_trigger?.source_parent_task?.RecvCondition
          && c.source_trigger?.asset===c.asset && c.interaction_object>0 && c.interaction_removed_at_step===entry.step
          && c.prerequisite_assumed_complete===false && c.expiry_task && c.full_guard && c.parent_guard)
        ? entry : null;
    }
    if(a.kind!=='verified_objective_state_callback' || !Array.isArray(a.source_triggers) || a.source_triggers.length!==1
        || a.source_triggers[0].source_condition!==a.full_guard
        || a.helper_prerequisite_assumed_complete!==false || !a.helper_prerequisite
        || entry.dialogues.length!==1) return null;
    if(entry.reader_policy==='objective_dialogue') return a.state_join==='matching_main_state_predicate'
      && a.helper_prerequisite.FinishCondition==='true' ? entry : null;
    return entry.reader_policy==='optional_objective_reference' && a.state_join==='show_window_before_npc_interaction'
      ? entry : null;
  }
  function installMovement(source,catalog,entry,sceneInstall) {
    if(!entry) return source;
    // Reuse the checked graph/locale splice, retaining the range admission as
    // its own contract rather than creating an escort or a task completion.
    const plan={step:`movement:${entry.step}`,inline_graph:true,sequence_complete:true,
      sequence:entry.dialogues.map((asset,index)=>({asset,id:String(index)}))};
    const graph=installRoute(source,catalog,plan,sceneInstall);
    if(graph!==source && entry.admission?.kind==='user_requested_presumed_source_placement') {
      for(const node of Object.values(graph.nodes)) {
        if(node.type==='line' && node.id.startsWith(`route:${plan.step}:`)
            && entry.dialogues.includes(node.portrait_source_asset)) {
          node.reader_placement_audit={placement_status:'presumed',observation_status:'not_observed',
            native_activation_resolved:false,audit_file:entry.admission.audit_file};
        }
      }
    }
    return graph;
  }
  function completion(catalog,story,scope,owner,logical) {
    const entry=catalog?.route_dialogues?.completion_presentations?.[story.asset_key];
    return logical && entry?.scope===scope && entry.owner===String(owner)
      && entry.step===story.objective_key && entry.after_asset===story.asset_key
      && entry.admission?.kind==='verified_task_completion_join'
      && entry.admission.reading_context_projection?.scope===scope
      && entry.gate && typeof entry.gate==='object'
      && Array.isArray(entry.checkpoint_ids) && entry.checkpoint_ids.length>0
      && entry.checkpoint_ids.every(id=>catalog.progression?.checkpoints?.[id])
      ? entry : null;
  }
  function installCompletion(source,catalog,entry,sceneInstall,preview=false) {
    if(!entry || source.completion_supplements?.includes(entry.id))return source;
    if(preview) {
      // A story viewer offers the verified epilogue as optional reading. Keep
      // the exact gameplay gate on its payload, without asserting completion.
      const graph=structuredClone(source),terminal=`completion:${entry.id}:preview:end`;
      const endings=Object.values(graph.nodes).filter(node=>node.type==='end');
      if(!endings.length)throw new Error('Completion supplement has no authored ending');
      if(graph.nodes[terminal])throw new Error('Duplicate completion preview');
      graph.nodes[terminal]={id:terminal,type:'end'};
      for(const node of endings)Object.assign(node,{type:'line',entry_kind:'completion_preview',
        completion_preview:structuredClone(entry),next:terminal});
      graph.completion_supplements=[...(graph.completion_supplements||[]),entry.id];
      return graph;
    }
    const terminal=`completion:${entry.id}:end`,plan={step:`completion:${entry.id}`,
      inline_graph:true,sequence_complete:true,
      sequence:entry.dialogues.map((asset,index)=>({asset,id:String(index)}))};
    const child=installRoute({roots:[terminal],nodes:{[terminal]:{id:terminal,type:'end'}},
      text_entries:{},speaker_entries:{}},catalog,plan,sceneInstall);
    const graph=structuredClone(source);
    const endings=Object.values(graph.nodes).filter(node=>node.type==='end');
    if(!endings.length)throw new Error('Completion supplement has no authored ending');
    for(const [key,node]of Object.entries(child.nodes)) {
      if(graph.nodes[key])throw new Error('Duplicate completion supplement node');
      graph.nodes[key]=node;
    }
    for(const family of ['text_entries','speaker_entries'])Object.assign(graph[family],child[family]);
    for(const [language,locale]of Object.entries(child.embedded_locales||{})) {
      const embedded=(graph.embedded_locales ||= {})[language] ||= {texts:{},speakers:{}};
      for(const family of ['texts','speakers'])Object.assign(embedded[family],locale[family]);
    }
    for(const node of endings)Object.assign(node,{type:'runtime',runtime_scope:entry.id,
      instruction:{op:'gate',expression:structuredClone(entry.gate)},next:child.roots[0],skip:terminal});
    graph.completion_supplements=[...(graph.completion_supplements||[]),entry.id];
    return graph;
  }
  function helperLifecycleContext(entry,where) {
    const c=entry.display_context,regions=c?.region_objects,objects=c?.source_region_objects,main=c?.source_main_step,task=c?.source_main_task;
    const activation=c?.source_activation,source=activation?.source_row,helper=entry.source_step,parent=entry.source_parent_task,steps=c?.helper_steps,cleanup=c?.source_cleanup,owner=entry.owner;
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),ids=s=>String(s).match(/\d+/g)||[];
    const args=(row,column,name)=>Array.from(String(row?.[column]).matchAll(new RegExp('ed\\.ActionX\\.'+name+'\\(([^()]*)\\)','g')))
      .flatMap(m=>{try{return[JSON.parse('['+m[1]+']')];}catch{return[];}});
    if(!where||c?.kind!=='source_helper_lifecycle'||c.step!==where.step||c.anchor_asset!==where.asset||c.position!==where.position
        ||!Array.isArray(regions)||!regions.length||new Set(regions).size!==regions.length||!regions.every(i=>Number.isInteger(i)&&i>0)
        ||!Array.isArray(objects)||objects.length!==regions.length||!Array.isArray(steps)||!steps.length||!equal(steps.at(-1),helper)
        ||!Array.isArray(cleanup)||cleanup.length!==regions.length||!main||!task||!source
        ||c.source_guard!==entry.source_condition||c.parent_guard!==parent.RecvCondition||c.source_guard!==regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        ||c.prerequisites_assumed_complete!==false||c.native_traversal_order_claimed!==false||c.source_completion_written!==false
        ||c.main_phase_end_claimed!==false||c.accepted_helper_state_is_external!==true)return false;
    if(main.record_key!==c.step||main.LineID!==owner||task.record_key!==`${owner}:${main.TaskID}`||task.LineID!==owner
        ||activation.record!==source.record_key||!regions.every(i=>args(source,activation.field,'AddStates').some(a=>equal(a,[i,'Show','Interactive']))))return false;
    const seen=new Set();
    for(const s of steps){if(s.LineID!==helper.LineID||s.TaskID!==helper.TaskID||seen.has(s.record_key)
        ||!ids(s.PreStepList).every(i=>seen.has(`${helper.LineID}:${helper.TaskID}:${i}`)))return false;seen.add(s.record_key);}
    const origin=c.activation_origin,terminal=activation.terminal_owned_line;
    if(origin==='owned_main_step') {
      if(activation.family!=='ExplStep'||source.LineID!==owner)return false;
      if(terminal){if(c.display_policy!=='after_terminal_activation'||c.position!=='after_asset'||!equal(main,source)
          ||terminal.LineID!==owner||terminal.LastTaskID!==source.TaskID||task.LastStepID!==source.StepID)return false;}
      else if(c.display_policy!=='earliest_source_eligible_objective')return false;
      else if(main.TaskID===source.TaskID){if(!ids(main.PreStepList).includes(source.StepID))return false;}
      else{const prior=activation.source_completed_main_task;
        if(prior?.LineID!==owner||prior.TaskID!==source.TaskID||prior.LastStepID!==source.StepID||Number(main.TaskID)!==Number(source.TaskID)+1
            ||main.PreStepList!=='[]'||!['[]',`[${main.TaskID}]`].includes(prior.NextTaskIDs)
            ||!['true',`ed.ConditionX.IsExplTaskFinished(${owner},${source.TaskID})`].includes(task.RecvCondition))return false;
      }
    } else if(['helper_receive_action','helper_predecessor'].includes(origin)) {
      const prior=activation.source_completed_main_task,guard=`ed.ConditionX.IsExplTaskFinished(${owner},${prior?.TaskID})`;
      if(c.display_policy!=='earliest_source_eligible_objective'||parent.RecvCondition!==guard||prior?.LineID!==owner
          ||Number(main.TaskID)!==Number(prior.TaskID)+1||!['[]',`[${main.TaskID}]`].includes(prior.NextTaskIDs)
          ||!['true',guard].includes(task.RecvCondition)||main.PreStepList!=='[]')return false;
      if(origin==='helper_receive_action'){if(activation.family!=='ExplTask'||activation.field!=='RecvAction'||!equal(source,parent))return false;}
      else if(activation.family!=='ExplStep'||activation.field!=='FinishAction'||!steps.slice(0,-1).some(s=>equal(s,source)))return false;
    } else return false;
    const retired=new Set([...args(helper,'FinishAction','SetFinalStates').flat(),...args(helper,'FinishAction','DelStates').filter(a=>a.slice(1).includes('Interactive')).map(a=>a[0])]);
    return objects.every((o,i)=>o.ID===String(regions[i])&&o.ClientType==='VirtualRange'&&o.InitStates==='[1]'&&o.FinalStates==='[]'
      &&cleanup[i].object===regions[i]&&cleanup[i].mode===(retired.has(regions[i])?'helper_state_action':'accepted_helper_step')
      &&Array.isArray(cleanup[i].actions)&&(cleanup[i].actions.length>0)===retired.has(regions[i]))
      &&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
  }
  function phaseReferenceContext(entry,context) {
    const c=entry.display_context;
    if(c?.kind==='source_helper_lifecycle')return helperLifecycleContext(entry,context);
    if(c?.kind==='source_cross_task_state_window') {
      const steps=c.source_steps,path=c.source_task_path,regions=c.region_objects,objects=c.source_region_objects,pre=c.helper_prerequisites;
      if(!context||!Array.isArray(steps)||steps.length<2||!Array.isArray(path)||path.length<2
          ||!Array.isArray(regions)||!regions.length||new Set(regions).size!==regions.length||!regions.every(i=>Number.isInteger(i)&&i>0)
          ||!Array.isArray(objects)||objects.length!==regions.length||!Array.isArray(pre))return false;
      const owner=entry.owner,enable=steps[0],end=steps.at(-1),first=Number(enable.TaskID),last=Number(end.TaskID);
      const expectedTasks=Array.from({length:last-first+1},(_,i)=>String(first+i));
      if(JSON.stringify(path.map(t=>t.TaskID))!==JSON.stringify(expectedTasks))return false;
      const tasks=new Map(path.map(t=>[t.TaskID,t])),seen=new Set();
      if(!path.every(t=>t.LineID===owner&&t.record_key===`${owner}:${t.TaskID}`))return false;
      for(const s of steps){const task=s.TaskID,key=s.record_key;
        if(seen.has(key)||s.LineID!==owner||key!==`${owner}:${task}:${s.StepID}`||!tasks.has(task))return false;
        if(seen.size){const ids=String(s.PreStepList).match(/\d+/g)||[];
          if(ids.length){if(!ids.every(i=>seen.has(`${owner}:${task}:${i}`)))return false;}
          else{const previous=tasks.get(String(Number(task)-1)),current=tasks.get(task);
            if(!previous||!['[]',`[${task}]`].includes(previous.NextTaskIDs)
                ||!['true',`ed.ConditionX.IsExplTaskFinished(${owner},${previous.TaskID})`].includes(current.RecvCondition)
                ||!seen.has(`${owner}:${previous.TaskID}:${previous.LastStepID}`))return false;
          }
        }seen.add(key);
      }
      const start=steps.slice(1).reduce((a,b)=>Number(a.record_order)<Number(b.record_order)?a:b);
      const retired=Array.from(String(end.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g)).flatMap(m=>m[1].split(',').map(Number));
      const expected=Array.from(entry.source_step.PreStepList.matchAll(/\d+/g),m=>entry.source_record.split(':').slice(0,-1).join(':')+':'+m[0]);
      return c.step===context.step&&c.anchor_asset===context.asset&&c.position===context.position&&c.step===start.record_key
        &&c.source_guard===entry.source_condition&&c.parent_guard===entry.source_parent_task.RecvCondition
        &&c.source_guard===regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        &&JSON.stringify(c.source_enable_step)===JSON.stringify(enable)&&JSON.stringify(c.source_retirement_step)===JSON.stringify(end)
        &&JSON.stringify(pre.map(p=>p.record_key))===JSON.stringify(expected)
        &&c.prerequisites_assumed_complete===false&&c.native_traversal_order_claimed===false&&c.source_completion_written===false
        &&c.requires_interactive_region===true&&c.retirement_is_applied_state_boundary===true
        &&c.task_transition_policy==='original_task_model_default_or_single_successor'
        &&objects.every((o,i)=>o.ID===String(regions[i])&&o.ClientType==='VirtualRange'&&o.InitStates==='[1]'&&o.FinalStates==='[]'
          &&retired.includes(regions[i])&&String(enable.FinishAction).includes(`ed.ActionX.AddStates(${regions[i]},"Show","Interactive")`))
        &&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    if(c?.kind==='source_activation_retirement_window') {
      const chain=c.source_chain,regions=c.region_objects,objects=c.source_region_objects,pre=c.helper_prerequisites;
      if(!Array.isArray(chain)||chain.length<2||!Array.isArray(regions)||!regions.length||!Array.isArray(objects)
          ||!Array.isArray(pre)||new Set(regions).size!==regions.length||!regions.every(i=>Number.isInteger(i)&&i>0))return false;
      const enable=chain[0],end=chain.at(-1),task=enable.TaskID;
      const retired=Array.from(String(end.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g)).flatMap(m=>m[1].split(',').map(Number));
      const expected=Array.from(entry.source_step.PreStepList.matchAll(/\d+/g),m=>entry.source_record.split(':').slice(0,-1).join(':')+':'+m[0]);
      return c.step===context?.step&&c.anchor_asset===context?.asset&&c.position===context?.position
        &&c.source_guard===entry.source_condition&&c.parent_guard===entry.source_parent_task.RecvCondition
        &&c.source_guard===regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        &&JSON.stringify(c.source_enable_step)===JSON.stringify(enable)&&JSON.stringify(c.source_retirement_step)===JSON.stringify(end)
        &&c.step===chain[1].record_key&&chain.every((s,i)=>s.LineID===entry.owner&&s.TaskID===task
          &&s.record_key===`${entry.owner}:${task}:${s.StepID}`&&(!i||s.PreStepList===`[${chain[i-1].StepID}]`))
        &&JSON.stringify(pre.map(p=>p.record_key))===JSON.stringify(expected)
        &&c.prerequisites_assumed_complete===false&&c.native_traversal_order_claimed===false&&c.source_completion_written===false
        &&c.requires_interactive_region===true&&c.retirement_is_applied_state_boundary===true
        &&objects.length===regions.length&&objects.every((o,i)=>o.ID===String(regions[i])&&o.ClientType==='VirtualRange'
          &&o.FinalStates==='[]'&&retired.includes(regions[i])&&String(enable.FinishAction).includes(`ed.ActionX.AddStates(${regions[i]},"Show","Interactive")`))
        &&!!c.evidence_file&&/^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    if(c?.position==='after_asset') {
      const o=c.observed_order;
      if(o?.source!=='user_recording_observation' || o.anchor_asset!==c.anchor_asset
          || o.completion_written!==false || !Array.isArray(o.assets) || new Set(o.assets).size!==o.assets.length
          || !Number.isInteger(o.index) || o.index<0 || o.assets[o.index]!==entry.asset
          || !o.evidence_file || !/^[0-9a-f]{64}$/.test(o.evidence_sha256||''))return false;
    }
    if(c?.kind==='task_receive_region_retirement_window') {
      const task=c.source_task || {},end=c.source_retirement_step || {},regions=c.region_objects,objects=c.source_region_objects;
      const retired=Array.from(String(end.FinishAction).matchAll(/ed\.ActionX\.SetFinalStates\(([\d,\s]+)\)/g))
        .flatMap(match=>match[1].split(',').map(Number));
      return c.step===context?.step && c.anchor_asset===context?.asset && c.position===context?.position
        && typeof c.step==='string' && c.step.startsWith(entry.owner+':')
        && Array.isArray(regions) && regions.length>0 && new Set(regions).size===regions.length
        && regions.every(i=>Number.isInteger(i)&&i>0)
        && c.source_guard===entry.source_condition && c.parent_guard===entry.source_parent_task.RecvCondition
        && c.source_guard===regions.map(i=>`ed.ConditionX.IsInRange(${i})`).join(' or ')
        && task.RecvCondition===c.parent_guard && task.record_key===c.step.split(':').slice(0,-1).join(':')
        && task.LineID===entry.owner && end.record_key===c.step && end.PreStepList==='[]'
        && c.prerequisites_assumed_complete===false && Array.isArray(c.helper_prerequisites)
        && c.native_traversal_order_claimed===false && c.source_completion_written===false
        && c.requires_interactive_region===true && c.retirement_is_applied_state_boundary===true
        && Array.isArray(objects) && objects.length===regions.length && objects.every((o,i)=>
          o.ID===String(regions[i])&&o.ClientType==='VirtualRange'&&o.FinalStates==='[]'&&retired.includes(regions[i]))
        && typeof c.evidence_file==='string' && c.evidence_file.length>0 && /^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
    }
    return c?.kind==='source_enabled_exploration_phase' && c.step===context?.step
      && c.anchor_asset===context.asset && c.position===context.position
      && typeof c.step==='string' && c.step.startsWith(entry.owner+':')
      && typeof c.enable_after_step==='string' && c.enable_after_step.startsWith(entry.owner+':')
      && c.source_guard===entry.source_condition && c.parent_guard===entry.source_parent_task.RecvCondition
      && Number.isInteger(c.region_object) && c.region_object>0
      && c.prerequisites_assumed_complete===false && Array.isArray(c.helper_prerequisites)
      && c.native_traversal_order_claimed===false && c.source_completion_written===false
      && typeof c.evidence_file==='string' && c.evidence_file.length>0
      && /^[0-9a-f]{64}$/.test(c.evidence_sha256||'');
  }
  function parallelReadingGroup(catalog,scope,owner,logical) {
    if(!logical)return null;
    const g=(catalog?.route_dialogues?.parallel_reading_groups||[]).find(g=>g.scope===scope&&g.owner===String(owner));
    if(!g || g.presentation_only!==true || g.completion_written!==false || g.source_order_is_mandatory!==false
        || !/^[0-9a-f]{64}$/.test(g.evidence_sha256||'') || !g.evidence_file
        || !Array.isArray(g.branches)||g.branches.length<2 || !g.source_join || !g.source_predecessor
        || !g.branches.every(b=>b?.source_step && Array.isArray(b.assets)))return null;
    const ids=g.branches.map(b=>b.step),task=g.source_join.record_key?.split(':').slice(0,-1).join(':');
    if(new Set(ids).size!==ids.length || new Set(g.branches.flatMap(b=>b.assets)).size!==g.branches.flatMap(b=>b.assets).length
        || g.source_predecessor.LineID!==g.owner || g.source_join.LineID!==g.owner
        || g.source_predecessor.TaskID!==g.source_join.TaskID
        || g.source_join.PreStepList!==`[${g.branches.map(b=>b.source_step.StepID).join(' | ')}]`
        || !g.branches.every(b=>b.step===b.source_step?.record_key && b.step.startsWith(g.owner+':')
          && b.source_step.PreStepList===`[${g.source_predecessor.StepID}]`
          && b.step.split(':').slice(0,-1).join(':')===task && b.assets?.length>0 && b.textdes_id))return null;
    return g;
  }
  function parallelReadingOrder(contexts,group,first) {
    if(!group)return contexts;
    const branches=group.branches,assets=new Set(branches.flatMap(b=>b.assets));
    const indices=contexts.map((c,i)=>assets.has(c.assetKey)?i:-1).filter(i=>i>=0);
    if(indices.length!==assets.size || !indices.length || indices.at(-1)-indices[0]+1!==indices.length)return contexts;
    const byAsset=new Map(contexts.slice(indices[0],indices.at(-1)+1).map(c=>[c.assetKey,c]));
    if(byAsset.size!==assets.size || !branches.every(b=>b.assets.every(a=>byAsset.get(a)?.story?.objective_key===b.step)))return contexts;
    const chosen=branches.find(b=>b.step===first)||branches[0];
    const ordered=[chosen,...branches.filter(b=>b!==chosen)].flatMap(b=>b.assets.map(a=>byAsset.get(a)));
    return [...contexts.slice(0,indices[0]),...ordered,...contexts.slice(indices.at(-1)+1)];
  }
  function phaseReferences(catalog,scope,owner,logical,context=null) {
    if(!logical) return [];
    const assets=new Set();
    return (catalog?.route_dialogues?.phase_references || []).filter(entry=> {
      const dialogue=catalog.route_dialogues.dialogues[entry.asset];
      if(entry.scope!==scope || entry.owner!==String(owner)
          || entry.reader_policy!=='optional_reference_not_chronological'
          || entry.admission?.kind!=='verified_named_quest_helper_reference'
          || entry.admission.exact_playback_order_claimed!==false
          || entry.admission.progression_facts_written!==false
          || !dialogue || assets.has(entry.asset)
          || (entry.display_context ? !phaseReferenceContext(entry,context) : context!==null)) return false;
      assets.add(entry.asset);return true;
    }).sort((a,b)=>(a.display_context?.observed_order?.index||0)-(b.display_context?.observed_order?.index||0));
  }
  // An independent transcript view. It has no History/Session and cannot
  // complete quests or leak a local question-menu selection into another scene.
  function referenceTranscript(dialogue,decisions=[],automatic=false) {
    const graph=dialogue.graph,items=[],reads=new Map();let current=graph.roots[0],decision=0;
    if(graph.roots.length!==1) throw new Error('Ambiguous reference entry');
    for(let count=0;current && count<1000;count++) {
      const node=graph.nodes[current];
      if(!node) throw new Error('Missing reference target');
      if(node.type==='end')return {items,choice:null};
      if(node.type==='runtime' && node.instruction?.op==='continue') {current=node.next;continue;}
      if(node.type==='choice') {
        if(!node.route_choice || node.persistent_choice) throw new Error('Unsupported reference choice');
        const key=node.runtime_scope+':'+node.runtime_choice,seen=reads.get(key)||new Set();reads.set(key,seen);
        const options=node.options.filter(o=>o.guard?.kind==='literal' && o.guard.value===true
          && (o.display_reads||[]).every(index=>seen.has(index)));
        const chosen=options.find(o=>o.index===decisions[decision]) || (automatic ? options[0] : null);
        if(!chosen)return {items,choice:{node,options,decision}};
        seen.add(chosen.index+1);items.push({node,option:chosen,options,decision});decision++;current=chosen.target;continue;
      }
      if(!['line','document','picture','cinematic'].includes(node.type)) throw new Error('Unsupported reference event');
      items.push({node});current=node.next;
    }
    throw new Error('Unbounded reference transcript');
  }
  function hasObjectiveDialogue(catalog,scope,asset,step,logical) {
    const owner=String(step||'').split(':')[0];
    return phaseReferences(catalog,scope,owner,logical,{asset,step,position:'objective'}).length>0
      || Boolean(objectiveCallbacks(catalog,scope,owner,asset,step,'objective',logical))
      || Boolean(presumedRoute(catalog,scope,owner,asset,step,'objective',logical));
  }
  function routeParts(plan) {
    const sequence=plan.inline_graph?[]:plan.sequence,parts=[];
    let optionalShown=false;
    const optional=()=> {for(const entry of plan.optional)parts.push({lane:'optional',entry});optionalShown=true;};
    for(const entry of sequence) {
      if(entry.trigger==='route_success' && !optionalShown)optional();
      if(!entry.delegated_to_anchor)parts.push({lane:'sequence',entry});
    }
    if(!optionalShown)optional();
    return parts;
  }
  return {objectiveCallbacks,map,fishing,visible,insertFishing,insertStart,insertRoute,inlineDialogues,encounterDialogues,route,presumedRoute,installRoute,presentation,movement,installMovement,completion,installCompletion,pictureCatalog,pictureStory,pictureAsset,phaseReferences,referenceTranscript,hasObjectiveDialogue,routeParts,parallelReadingGroup,parallelReadingOrder};
});
