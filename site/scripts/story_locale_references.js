(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StoryLocaleReferences = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Wiki passages verified against speakers and adjacent dialogue, 2026-10-11.
  // CC-BY-SA community content; attribution is shown in the reader footer.
  // Native locale files remain authoritative and are not modified.
  const sources = {
    shared: { title: "AFK Journey Wiki — Shared Moments",
      url: "https://afk-journey.fandom.com/wiki/Timeless_Gala/Shared_Moments" },
    fall: { title: "AFK Journey Wiki — Fall’s Prelude",
      url: "https://afk-journey.fandom.com/wiki/Fall_Carnival/Fall%27s_Prelude" },
  };
  const references = [
    { asset: "mn/quest_story_10297250", keys: ["say:8:1029725007:0"],
      hash: "0x4810EAAE66B83766", source: "shared",
      text: "Rowan quickly outlines his plans, goals, and the reason for visiting." },
    { asset: "mn/quest_story_10297290", keys: ["say:36:1029729021:0"],
      hash: "0x21408638BCDD5B65", source: "shared",
      text: "Very well, let's go. I'll walk with you a bit before heading back to review your proposal." },
    { asset: "mn/quest_story_10297620", keys: ["say:14:1029762010:0"],
      hash: "0x75AB5DE7CBECF4A9", source: "shared",
      text: "Yeah. You know him, <style=\"highlight\">Pinder</style>, the local rep for this area." },
    { asset: "ep2/gameplay_story_12600010", keys: ["say:18:1260001012:0"],
      hash: "0xF8087C2A5F973467", source: "fall",
      text: "I asked someone who knows their stuff. They said the ship can sail. With a little magical guidance, it'll head exactly where it needs to go." },
    { asset: "ep2/gameplay_story_12600010", keys: ["say:19:1260001013:0"],
      hash: "0x63605C37F2E2CCFF", source: "fall",
      text: "Apparently, it can <style=\"highlight\">reveal a magical game board and trigger a grand adventure</style>, or something like that." },
    { asset: "ep2/gameplay_story_12600030", keys: ["say:24:1260003016:0"],
      hash: "0x0D6A368FA5886C32", source: "fall",
      text: "Are you after the <style=\"highlight\">Void Relic</style> Hodgkin made off with?" },
    { asset: "ep2/gameplay_story_12600030", keys: ["say:35:1260003023:1", "choice_prompt:36:1260003023"],
      hash: "0xE9D85B8606846EEE", source: "fall",
      text: "In short, she's not with the Dead Tide Fleet and isn't seeking the Void Relic. That green monster's mischief was just her acting on a whim..." },
    { asset: "ep2/gameplay_story_12600030", keys: ["say:40:1260003028:1", "choice_prompt:42:1260003028"],
      hash: "0xB0499526C105F6AF", source: "fall",
      text: "And with that, I bid you farewell." },
    { asset: "ep2/gameplay_story_12600100", keys: ["say:15:1260010009:1"],
      hash: "0xD2BDB1142D4AADA5", source: "fall",
      text: "If they had truly transformed permanently, Rustport could have been overrun by them in no time." },
  ];

  // Exact cinematic actor identities, cross-checked against DialogueActor,
  // other dialogue by that actor, and the game's localized speaker names.
  // Never infer a name from a placeholder actor (e.g. actor 1 / Chris).
  const cinematicSpeakers = [
    { source: "黑魔法师", actor: "955", model: "blackmagician",
      assets: ["timeline/timeline_story_13110830", "timeline/timeline_story_13110880"],
      names: { en: "Cyran", jp: "ディアグレス", kr: "딜그레이" } },
    { source: "大主教", actor: "953", model: "zhujiaohuman",
      assets: ["timeline/timeline_story_13110860"],
      names: { en: "Hierophant Novik", jp: "ノヴィツキー大主教", kr: "노비츠키 대주교" } },
    { source: "大公", actor: "936", model: "duke",
      assets: ["timeline/timeline_story_13110880"],
      names: { en: "Archduke Sigmund", jp: "ヴァレサ大公", kr: "바레샤 대공" } },
  ];

  function applySpeakerNames(asset, language, locale, graph) {
    let result = locale;
    for (const reference of cinematicSpeakers) {
      if (!reference.assets.includes(asset) || !reference.names[language]) continue;
      const key = `speaker:${reference.source}`, row = locale?.speakers?.[key];
      if (!row || row.source !== reference.source || (row.text && row.text !== reference.source)) continue;
      const lines = Object.values(graph?.nodes || {}).filter(node => node.speaker_key === key);
      if (!lines.length || lines.some(node => !["subtitle", "cinematic_dialogue"].includes(node.entry_kind)
          || String(node.speaker_actor_id) !== reference.actor || node.speaker_actor_model !== reference.model)) continue;
      if (result === locale) result = { ...locale, speakers: { ...locale.speakers } };
      result.speakers[key] = { ...row, text: reference.names[language], status: "official_actor_reference" };
    }
    return result;
  }

  function apply(asset, language, locale, graph) {
    locale = applySpeakerNames(asset, language, locale, graph);
    if (!["en", "jp", "kr"].includes(language) || !locale?.texts) return locale;
    let result = locale;
    for (const reference of references) {
      if (reference.asset !== asset) continue;
      for (const key of reference.keys) {
        const row = locale.texts[key];
        // Scope by asset, node key, source hash and the explicitly empty target
        // status. A later native translation (including gender variants) wins.
        if (row?.hash_xxh64 !== reference.hash || row.status !== "target_text_empty"
          || row.male || row.female) continue;
        if (result === locale) result = { ...locale, texts: { ...locale.texts } };
        result.texts[key] = { ...row, text: reference.text,
          status: language === "en" ? "wiki_reference_en" : "english_reference_fallback",
          reference_source: reference.source };
      }
    }
    return result;
  }

  function credit(row, language) {
    if (!row?.reference_source || !sources[row.reference_source]) return null;
    const source = sources[row.reference_source];
    return { ...source, kind: "wiki_localization", language,
      license: "CC-BY-SA", licenseUrl: "https://www.fandom.com/licensing" };
  }

  return { apply, applySpeakerNames, credit, references };
});
