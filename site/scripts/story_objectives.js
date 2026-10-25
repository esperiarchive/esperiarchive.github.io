(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StoryObjectives = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // REVIEWED_OBJECTIVE_TITLE_CONTRACTS
  const reviewedObjectiveTitles = [{"source_key":"10010224:2:5","owner":"10010224","task":"2","join_step":"5","before_key":"10010224:2:2","decision":"phase_heading","title_cn":"询问奇怪的镇民","summary_cn":"","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"询问愤怒的男镇民","3":"询问忧愁的女镇民","4":"询问路边的小孩"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"10010261:3:5","owner":"10010261","task":"3","join_step":"5","before_key":"10010261:3:3","decision":"phase_heading","title_cn":"调查两座女神像","summary_cn":"日神殿中突然出现的女神像是否与恶魔有关？值得调查。","pre_step_ids":["3","4"],"child_titles_cn":{"3":"感应女神像的魔力","4":"感应女神像的魔力"},"native_group":[3,4],"completion_written":false,"description_moved":false},{"source_key":"10010261:7:5","owner":"10010261","task":"7","join_step":"5","before_key":"10010261:7:2","decision":"phase_heading","title_cn":"收集不对称的素材","summary_cn":"为了逼迫追求极致对称的恶魔现身，需要找到素材来摆放出不对称的法阵图形。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"收集果子","3":"收集花","4":"收集树枝"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"10020113:5:5","owner":"10020113","task":"5","join_step":"5","before_key":"10020113:5:2","decision":"phase_heading","title_cn":"打发无聊时光","summary_cn":"","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"和埃隆聊聊","3":"看看洛桑他们","4":"问问漫漫在做什么"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"10020271:3:7","owner":"10020271","task":"3","join_step":"7","before_key":"10020271:3:5","decision":"duplicate_join_title","title_cn":"搜寻一叶的线索","summary_cn":"路上洒落了一些吃剩的萤瓤果，可能是一叶留下的，只要顺着这条线索，就能找到一叶了！","pre_step_ids":["5","6"],"child_titles_cn":{"5":"搜寻一叶的线索","6":"搜寻一叶的线索"},"native_group":[5,6],"completion_written":false,"description_moved":false},{"source_key":"10030121:2:8","owner":"10030121","task":"2","join_step":"8","before_key":"10030121:2:5","decision":"phase_heading","title_cn":"询问村民","summary_cn":"","pre_step_ids":["5","6","7"],"child_titles_cn":{"5":"询问村民兰兰丽拉","6":"询问村民柯柯芽","7":"询问村民荞普"},"native_group":[5,6,7],"completion_written":false,"description_moved":false},{"source_key":"10030284:3:4","owner":"10030284","task":"3","join_step":"4","before_key":"10030284:3:2","decision":"phase_heading","title_cn":"用药草治疗队员","summary_cn":"","pre_step_ids":["2","3"],"child_titles_cn":{"2":"治疗队员","3":"治疗队员"},"native_group":[2,3],"completion_written":false,"description_moved":false},{"source_key":"10040132:1:8","owner":"10040132","task":"1","join_step":"8","before_key":"10040132:1:5","decision":"phase_heading","title_cn":"收集情报","summary_cn":"","pre_step_ids":["5","6","7"],"child_titles_cn":{"5":"询问学者雷克索","6":"询问学者费里德","7":"询问学者格莉芙"},"native_group":[5,6,7],"completion_written":false,"description_moved":false},{"source_key":"10040133:2:9","owner":"10040133","task":"2","join_step":"9","before_key":"10040133:2:7","decision":"phase_heading","title_cn":"查看石碑线索","summary_cn":"","pre_step_ids":["7","8"],"child_titles_cn":{"7":"找到B-2号残碑","8":"找到B-13号残碑"},"native_group":[7,8],"completion_written":false,"description_moved":false},{"source_key":"10040135:1:7","owner":"10040135","task":"1","join_step":"7","before_key":"10040135:1:5","decision":"duplicate_join_title","title_cn":"调查魔偶零件","summary_cn":"","pre_step_ids":["5","6"],"child_titles_cn":{"5":"调查魔偶零件","6":"调查魔偶零件"},"native_group":[5,6],"completion_written":false,"description_moved":false},{"source_key":"10040136:3:9","owner":"10040136","task":"3","join_step":"9","before_key":"10040136:3:6","decision":"duplicate_join_title","title_cn":"调查掘金运道","summary_cn":"底部的空间意外地宽敞。以防万一，先调查看看吧。","pre_step_ids":["6","7","8"],"child_titles_cn":{"6":"调查掘金运道","7":"调查掘金运道","8":"调查掘金运道"},"native_group":[6,7,8],"completion_written":false,"description_moved":false},{"source_key":"10040296:3:14","owner":"10040296","task":"3","join_step":"14","before_key":"10040296:3:11","decision":"duplicate_join_title","title_cn":"寻找药草","summary_cn":"达赫妮认出阿尔法十一是受到黑魔法侵蚀，需要去月湖村外找到合适的药草，以抵御魔法侵蚀。","pre_step_ids":["11","12","13"],"child_titles_cn":{"11":"寻找药草","12":"寻找药草","13":"寻找药草"},"native_group":[11,12,13],"completion_written":false,"description_moved":false},{"source_key":"11010109:2:6","owner":"11010109","task":"2","join_step":"6","before_key":"11010109:2:3","decision":"duplicate_join_title","title_cn":"在集市里寻找项链","summary_cn":"萨忒娜丢失了重要的骨质项链，恰巧在集市附近，不知道能不能在摊位和商贩处有什么发现。","pre_step_ids":["3","4","5"],"child_titles_cn":{"3":"在集市里寻找项链","4":"在集市里寻找项链","5":"在集市里寻找项链"},"native_group":[3,4,5],"completion_written":false,"description_moved":false},{"source_key":"11010115:1:7","owner":"11010115","task":"1","join_step":"7","before_key":"11010115:1:4","decision":"duplicate_join_title","title_cn":"在附近寻觅线索","summary_cn":"在周围的石碑上发现了不少与残阳神陨落，及开启封印需要秘钥的信息。","pre_step_ids":["4","5","6"],"child_titles_cn":{"4":"在附近寻觅线索","5":"在附近寻觅线索","6":"在附近寻觅线索"},"native_group":[4,5,6],"completion_written":false,"description_moved":false},{"source_key":"11010202:2:7","owner":"11010202","task":"2","join_step":"7","before_key":"11010202:2:4","decision":"duplicate_join_title","title_cn":"在主营附近转转","summary_cn":"布鲁特斯帮我们一同见证比试，不过不知道黑嚎族内的熊人会有什么看法，在附近转转听听看吧。","pre_step_ids":["4","5","6"],"child_titles_cn":{"4":"在主营附近转转","5":"在主营附近转转","6":"在主营附近转转"},"native_group":[4,5,6],"completion_written":false,"description_moved":false},{"source_key":"11010202:6:5","owner":"11010202","task":"6","join_step":"5","before_key":"11010202:6:2","decision":"phase_heading","title_cn":"在黑嚎族内走走","summary_cn":"这次也一样，在黑嚎领地内听听黑嚎族人们的看法吧。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"听听黑嚎族人的看法","3":"听听黑嚎族人的看法","4":"听听黑嚎族人的看法"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"11010204:4:5","owner":"11010204","task":"4","join_step":"5","before_key":"11010204:4:2","decision":"phase_heading","title_cn":"获得全部情报","summary_cn":"伽利和梅丽莎意在寻找一位名叫埃莉诺的前辈，此外也需要寻找贾克松的母亲，向咸水镇民打听看看吧。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"向镇民打听情报","3":"向镇民打听情报","4":"向镇民打听情报"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"11010205:5:5","owner":"11010205","task":"5","join_step":"5","before_key":"11010205:5:2","decision":"phase_heading","title_cn":"在拍卖会调查线索","summary_cn":"拍卖会上展示着不少来自遗迹群山的水鸟，看来它们就是这一次的拍卖品。四处调查一下，想办法救出它们。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"调查被拍卖的水鸟","3":"调查洞穴内的杂物","4":"调查拍卖会的情报"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"13010219:1:8","owner":"13010219","task":"1","join_step":"8","before_key":"13010219:1:6","decision":"phase_heading","title_cn":"找到孩子","summary_cn":"","pre_step_ids":["6","7"],"child_titles_cn":{"6":"找到杰洛米","7":"找到里芙娜"},"native_group":[6,7],"completion_written":false,"description_moved":false},{"source_key":"14010106:5:7","owner":"14010106","task":"5","join_step":"7","before_key":"14010106:5:4","decision":"phase_heading","title_cn":"调查沉寂营巢","summary_cn":"这处营地堆满了龙蛋，在营地里调查一下，看看会有什么发现。","pre_step_ids":["4","5","6"],"child_titles_cn":{"4":"调查沉寂营巢西部","5":"调查沉寂营巢东部","6":"调查沉寂营巢北部"},"native_group":[4,5,6],"completion_written":false,"description_moved":false},{"source_key":"14010109:3:6","owner":"14010109","task":"3","join_step":"6","before_key":"14010109:3:3","decision":"phase_heading","title_cn":"感受地面风物","summary_cn":"带因度厄感受地表的风物。","pre_step_ids":["3","4","5"],"child_titles_cn":{"3":"带他感受阳光","4":"带他看看大海","5":"带他看看花朵"},"native_group":[3,4,5],"completion_written":false,"description_moved":false},{"source_key":"14010211:1:6","owner":"14010211","task":"1","join_step":"6","before_key":"14010211:1:4","decision":"phase_heading","title_cn":"与民众们交谈","summary_cn":"与民众们交谈，获得思路和灵感。","pre_step_ids":["4","5"],"child_titles_cn":{"4":"找男性民众采风","5":"找女性民众采风"},"native_group":[4,5],"completion_written":false,"description_moved":false},{"source_key":"14010212:4:8","owner":"14010212","task":"4","join_step":"8","before_key":"14010212:4:4","decision":"duplicate_join_title","title_cn":"查看斐利尔的宝藏","summary_cn":"看看斐利尔都留了什么宝藏。","pre_step_ids":["4","5","6","7"],"child_titles_cn":{"4":"查看斐利尔的宝藏","5":"查看斐利尔的宝藏","6":"查看斐利尔的宝藏","7":"查看斐利尔的宝藏"},"native_group":[4,5,6,7],"completion_written":false,"description_moved":false},{"source_key":"15010109:3:10","owner":"15010109","task":"3","join_step":"10","before_key":"15010109:3:8","decision":"phase_heading","title_cn":"与二人对话","summary_cn":"初代梅林坦白她就是女神艾雅，并表示只有利用狩猎神神陨的力量才能将你送回去。前路凶险，你需要劝说二人留下来。","pre_step_ids":["8","9"],"child_titles_cn":{"8":"与加拉对话","9":"与那非对话"},"native_group":[8,9],"completion_written":false,"description_moved":false},{"source_key":"15010110:2:5","owner":"15010110","task":"2","join_step":"5","before_key":"15010110:2:2","decision":"phase_heading","title_cn":"解除三个封印之楔","summary_cn":"与初代梅林对话，解除三个封印。","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"完成支线<sprite name=spui_icon_minimap_task_other_1>解除物质之楔","3":"完成支线<sprite name=spui_icon_minimap_task_other_1>解除精神之楔","4":"完成支线<sprite name=spui_icon_minimap_task_other_1>解除权能之楔"},"native_group":[2,3,4],"completion_written":false,"description_moved":false},{"source_key":"15010238:1:4","owner":"15010238","task":"1","join_step":"4","before_key":"15010238:1:2","decision":"duplicate_join_title","title_cn":"寻找相关笔记","summary_cn":"别想丰饶堕神的事了，先找到悬液的炼制配方吧。","pre_step_ids":["2","3"],"child_titles_cn":{"2":"寻找相关笔记","3":"寻找相关笔记"},"native_group":[2,3],"completion_written":false,"description_moved":false},{"source_key":"11010106:1:5","owner":"11010106","task":"1","join_step":"5","before_key":"11010106:1:2","before_asset":"ep1/quest_story_11106021","decision":"phase_heading","title_cn":"使用<b><color=#D0B0A3>战舞</color></b>与观众打招呼","summary_cn":"一路走来，索恩与阿尔萨也收获了一些支持者，这些支持者们会为参赛者加油打气！使用战歌节特有的战舞，与他们打招呼吧！","pre_step_ids":["2","3","4"],"child_titles_cn":{"2":"使用<b><color=#D0B0A3>战舞</color></b>与支持者招呼","3":"使用<b><color=#D0B0A3>战舞</color></b>与观众招呼","4":"使用<b><color=#D0B0A3>战舞</color></b>与他人支持者打招呼"},"native_group":[2,3,4],"completion_written":false,"description_moved":false,"observation":"User recording/screenshot,2026-10-20: conversation ends, War Dance becomes available, then Mikola Slim while three Use War Dance objectives are active.","evidence":{"file":"provenance:analysis/part1_callbacks_20261020_v3/war_dance_research.json","sha256":"1252a92e652b2897e5f6a01bbefddf466320e109985cb681d2b8f0ad01a465ec"}}];
  // END_REVIEWED_OBJECTIVE_TITLE_CONTRACTS

  // Exact wording supplied from an English recording and Japanese screenshots,
  // 2026-10-10. Installed targets for these sources are empty in both languages.
  const recorded = {
    "10010528": {
      description: {
        cn: "白雪纷飞的季节，与亲朋好友团聚的隆冬节到了，你与霍根一同主办了热闹晚宴，和朋友们交换了礼物与祝福，还亲手烤了蛋糕！隆冬节快乐！",
        en: "Snowflakes are swirling, and the Winter Carnival is here! It's the season to gather with your favorite people and share laughter and joy. With Hogan by your side, you've thrown a lively banquet, swapped heartfelt gifts and wishes, and even baked a cake yourself! Cheers to a magical Winter Carnival!",
        jp: "白雪舞う季節。家族や友人と集まって祝う冬祭りがやってきた。あなたはホーガンと共に賑やかなパーティーを開き、手作りケーキを皆に振る舞う。友人たちとプレゼントを交換し、互いに祝福を贈り合おう。素敵な冬祭りを！",
      },
      objectives: {
        "10010528:3:12": { cn: "采集浆果", en: "Gather Berries", jp: "ベリーの採集" },
      },
    },
  };

  function fill(value, reference) {
    if (!reference || value?.cn !== reference.cn) return value;
    let result = value;
    for (const language of ["en", "jp", "kr"]) {
      const wording = reference[language];
      if (value[language] || value._saved?.[language] || !wording) continue;
      result = { ...result, [language]: wording };
    }
    return result;
  }

  function fromQuest(quest) {
    const reference = recorded[String(quest.line_id)];
    const description = fill(quest.description, reference?.description);
    const tasks = new Map((quest.tasks || []).map(task => [String(task.task_id), task]));
    const objectiveTitlePlacements = [];
    for (const contract of reviewedObjectiveTitles) {
      if (String(quest.line_id) !== contract.owner) continue;
      const task = tasks.get(contract.task), byId = new Map((task?.steps || []).map(step => [String(step.step_id), step]));
      const source = byId.get(contract.join_step);
      if (!source || source.objective_title?.cn !== contract.title_cn
          || (source.objective_description?.cn || "") !== contract.summary_cn
          || JSON.stringify(source.pre_step_ids) !== JSON.stringify(contract.pre_step_ids)
          || (contract.before_asset && !(quest.assets || []).some(asset=>asset.asset_key===contract.before_asset))
          || !Object.entries(contract.child_titles_cn).every(([id, title]) => byId.get(id)?.objective_title?.cn === title)) continue;
      const heading = contract.decision === "phase_heading" ? {
        objective_key: "", objective_title_i18n: source.objective_title,
        objective_title_source_cn: source.objective_title_source_cn,
        objective_title_status: source.objective_title_status,
        objective_title_record_index: source.objective_title_record_index,
        objective_summary_i18n: {}, objective_summary_source_cn: "",
        objective_presentation_role: "task_heading", objective_heading_source_key: contract.source_key,
      } : null;
      objectiveTitlePlacements.push({sourceKey: contract.source_key, beforeKey: contract.before_key, heading,
        beforeAsset: contract.before_asset || "", displayDecision: contract.decision});
    }
    // Reader-supplied gameplay review, 2026-10-18: this is the inquiry phase's
    // heading. Keep the source join step and its return-to-Hogan description
    // intact; a display heading is not an earlier completion of that step.
    const inquiry = tasks.get("1"), opening = inquiry?.steps?.find(step => String(step.step_id) === "1");
    const join = inquiry?.steps?.find(step => String(step.step_id) === "5");
    if (String(quest.line_id) === "10010101"
        && opening?.objective_description?.cn === "听从霍根的建议，先在城中四处逛逛，也许能收集到什么信息。"
        && join?.objective_title?.cn === "去城中打听"
        && join?.objective_description?.cn === "是时候回去寻找霍根了！"
        && JSON.stringify(join.pre_step_ids) === JSON.stringify(["2", "3", "4"])) {
      objectiveTitlePlacements.push({sourceKey: "10010101:1:5", beforeKey: "10010101:1:2",
        heading: {objective_key: "", objective_title_i18n: join.objective_title,
          objective_title_source_cn: join.objective_title_source_cn,
          objective_title_status: join.objective_title_status,
          objective_title_record_index: join.objective_title_record_index,
          objective_summary_i18n: {}, objective_summary_source_cn: "",
          objective_presentation_role: "task_heading", objective_heading_source_key: "10010101:1:5"}});
    }
    const taskStartObjectives = {};
    for (const asset of quest.assets || []) {
      if (asset.step_id || !/^ExplTask\.RecvAction\./.test(asset.evidence_source || "")) continue;
      const step = tasks.get(String(asset.task_id))?.steps?.[0];
      if (!step || !step.objective_title?.cn) continue;
      taskStartObjectives[asset.asset_key] = {
        objective_title_i18n: fill(step.objective_title,
          reference?.objectives?.[`${quest.line_id}:${asset.task_id}:${step.step_id}`]),
        objective_summary_i18n: step.objective_description,
        // This is a heading, not an activity or quest-state transition.
        intro_objective_key: `${quest.line_id}:${asset.task_id}:${step.step_id}`,
      };
    }
    const fields = [[quest.description, description]];
    for (const task of quest.tasks || []) for (const step of task.steps || []) {
      fields.push([step.objective_title, fill(step.objective_title,
        reference?.objectives?.[`${quest.line_id}:${task.task_id}:${step.step_id}`])]);
    }
    const transcribedFields = [reference?.description, ...Object.values(reference?.objectives || {})].filter(Boolean);
    const recordingLocalizationLanguages = ["en", "jp", "kr"].filter(language => (
      fields.some(([original, filled]) => original?.[language] !== filled?.[language]
        || (original?._references?.[language]?.status === "recording_transcript"
          && transcribedFields.some(field => field.cn === original?.cn && field[language] === original?.[language])))
    ));
    return { description, taskStartObjectives, objectiveTitlePlacements,
      recordingLocalization: recordingLocalizationLanguages.length > 0,
      recordingLocalizationLanguages };
  }

  function recordingNote(story, language) {
    if (!story?.recordingLocalizationLanguages?.includes(language)) return "";
    if (language === "en") return "Missing English summary and ‘Gather Berries’ wording transcribed from an English game recording supplied by the reader.";
    if (language === "jp") return "Missing Japanese summary and ‘ベリーの採集’ wording transcribed from Japanese game screenshots supplied by the reader.";
    return "";
  }

  function objectiveFields(story, reference) {
    const title = fill(story.objective_title_i18n, reference?.objectives?.[story.objective_key]);
    return title === story.objective_title_i18n ? story : { ...story,
      objective_title_i18n: title, objective_title_status: "recording_transcript" };
  }

  function forAsset(story, logicalStory) {
    if (!story) return story;
    const reference = recorded[String(story.exploration_line_id)];
    let result = objectiveFields(story, reference);
    const intro = !story.objective_key && logicalStory.taskStartObjectives?.[story.asset_key];
    if (intro) result = { ...result, intro_objective: intro };
    for (const position of ["before", "after"]) {
      const field = `objective_interludes_${position}`;
      if (!story[field]) continue;
      const entries = story[field].map(entry => objectiveFields(entry, reference));
      if (entries.some((entry, index) => entry !== story[field][index])) result = { ...result, [field]: entries };
    }
    for (const placement of logicalStory.objectiveTitlePlacements || []) {
      if (placement.heading && (placement.beforeAsset ? story.asset_key === placement.beforeAsset : story.objective_key === placement.beforeKey)) {
        const before = result.objective_interludes_before || [];
        if (!before.some(entry => entry.objective_heading_source_key === placement.sourceKey)) {
          result = {...result, objective_interludes_before: [...before, placement.heading]};
        }
      }
      for (const position of ["before", "after"]) {
        const field = `objective_interludes_${position}`;
        if (!result[field]) continue;
        const entries = [], headingPresent = result[field].some(entry => entry.objective_heading_source_key === placement.sourceKey);
        for (const entry of result[field]) {
          if (placement.heading && !placement.beforeAsset && !headingPresent && entry.objective_key === placement.beforeKey) entries.push(placement.heading);
          entries.push(entry.objective_key !== placement.sourceKey ? entry : {
            ...entry, objective_title_i18n: {}, objective_title_source_cn: "",
            objective_heading_presented_at: placement.beforeKey,
          });
        }
        result = {...result, [field]: entries};
      }
    }
    return result;
  }

  return { fromQuest, forAsset, recordingNote };
});
