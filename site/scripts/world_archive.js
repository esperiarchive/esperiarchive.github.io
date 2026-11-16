(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderWorldArchive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const kinds = ["fish", "enemies"];
  const jobs = {1: "Tank", 2: "Warrior", 3: "Mage", 4: "Support", 5: "Marksman", 6: "Rogue"};
  const messages = {
    "Fish": ["鱼类", "魚", "물고기"], "Enemies": ["敌人", "敵", "적"],
    "Search fish": ["搜索鱼类", "魚を検索", "물고기 검색"],
    "Search enemies": ["搜索敌人", "敵を検索", "적 검색"],
    "Fish Archive": ["鱼类图鉴", "魚図鑑", "물고기 도감"],
    "Enemy Archive": ["敌人图鉴", "敵図鑑", "적 도감"],
    "All seasons": ["全部赛季", "全シーズン", "모든 시즌"],
    "All locations": ["全部地点", "すべての場所", "모든 지역"],
    "All classes": ["全部职业", "全クラス", "모든 직업"],
    "Season": ["赛季", "シーズン", "시즌"], "Location": ["地点", "場所", "지역"],
    "Class": ["职业", "クラス", "직업"], "Other": ["其他", "その他", "기타"],
    "Fish King": ["鱼王", "キングフィッシュ", "피쉬킹"],
    "Regions": ["地区", "地域", "지역"], "Events": ["活动", "イベント", "이벤트"],
    "Fish category": ["鱼类分类", "魚の分類", "물고기 분류"],
    "Event fish": ["活动鱼类", "イベントの魚", "이벤트 물고기"],
    "Normal": ["普通", "通常", "일반"], "Rare variant": ["异色", "珍種", "희귀종"],
    "Normal and rare": ["普通与异色", "通常種・珍種", "일반종 및 희귀종"],
    "Tank": ["坦克", "タンク", "탱커"], "Warrior": ["战士", "ウォリアー", "워리어"],
    "Mage": ["法师", "メイジ", "메이지"], "Support": ["辅助", "サポート", "서포터"],
    "Marksman": ["射手", "アーチャー", "아처"], "Rogue": ["游侠", "ローグ", "로그"],
    "Physical": ["物理", "物理", "물리"], "Magic": ["魔法", "魔法", "마법"],
    "Melee": ["近战", "近接", "근접"], "Ranged": ["远程", "遠隔", "원거리"],
    "Base stats": ["基础属性", "基礎ステータス", "기본 능력치"],
    "HP": ["生命值", "HP", "HP"], "ATK": ["攻击力", "攻撃力", "공격력"],
    "Physical DEF": ["物理护甲", "物理防御", "물리 방어력"],
    "Magic DEF": ["魔法抗性", "魔法防御", "마법 방어력"],
    "Level {level} · {quality}": ["等级 {level} · {quality}", "Lv. {level} · {quality}", "레벨 {level} · {quality}"],
    "Before equipment and battle modifiers. Enemy stats vary by encounter.": [
      "未计入装备与战斗修正。敌人属性随战斗而变化。",
      "装備や戦闘補正を含まない値です。敵のステータスは戦闘によって変わります。",
      "장비 및 전투 보정 전의 수치입니다. 적의 능력치는 전투에 따라 달라집니다."],
    "Skills": ["技能", "スキル", "스킬"], "Skill {number}": ["技能 {number}", "スキル {number}", "스킬 {number}"],
    "Skill level {level}": ["技能等级 {level}", "スキルLv. {level}", "스킬 레벨 {level}"],
    "{count} of {total} entries": ["{count} / {total} 条", "{total}件中{count}件", "{total}개 중 {count}개"],
    "Select a fish to learn more.": ["选择一种鱼以了解详情。", "魚を選んで詳細をご覧ください。", "물고기를 선택해 자세히 알아보세요."],
    "Select an enemy to learn more.": ["选择一个敌人以了解详情。", "敵を選んで詳細をご覧ください。", "적을 선택해 자세히 알아보세요."],
    "No matching entries.": ["没有匹配的条目。", "一致する項目がありません。", "일치하는 항목이 없습니다."],
    "This entry could not be found.": ["未找到此条目。", "この項目は見つかりません。", "이 항목을 찾을 수 없습니다."],
    "Chinese name: {name}": ["中文名称：{name}", "中国語名：{name}", "중국어 이름: {name}"],
  };
  function text(key, language, values = {}) {
    let value = messages[key]?.[{cn: 0, jp: 1, kr: 2}[language]] || key;
    return value.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  }
  function localized(value, language) { return value?.[language] || value?.en || value?.cn || ""; }
  function fishCategory(entry) { return entry?.category === "events" ? "events" : "regions"; }
  function compareSeasons(first, second) {
    const rank = key => /^\d+$/.test(String(key)) ? Number(key) : Number.MAX_SAFE_INTEGER;
    return rank(first) - rank(second);
  }
  function seasonKeys(catalog) {
    return [...new Set((catalog?.entries || []).filter(entry => fishCategory(entry) === "regions" && entry.season)
      .map(entry => entry.season))].sort(compareSeasons);
  }
  function find(catalog, address) {
    return catalog?.entries.find(entry => entry.slug === address || entry.id === String(address)
      || entry.aliases?.includes(String(address)));
  }
  function searchText(entry, language) {
    const variants = entry.variants || [entry];
    return [entry.id, ...variants.flatMap(v => [localized(v.names, language), localized(v.descriptions, language)]),
      ...(entry.locations || []).map(location => localized(location.names, language)),
      localized(entry.location_names, language), entry.fish_king ? text("Fish King", language) + " Fish King" : ""]
      .join(" ").normalize("NFKC").toLocaleLowerCase();
  }
  function filterEntries(catalog, {query = "", season = "", location = "", job = "", category = ""} = {}, language = "en") {
    const needle = query.trim().normalize("NFKC").toLocaleLowerCase();
    return (catalog?.entries || []).filter(entry => (!season || entry.season === season)
      && (!location || entry.locations?.some(row => row.id === location))
      && (!job || entry.job === job) && (!category || fishCategory(entry) === category)
      && (!needle || searchText(entry, language).includes(needle)))
      .sort((first, second) => Number(Boolean(first.fish_king)) - Number(Boolean(second.fish_king))
        || compareSeasons(first.season, second.season));
  }
  function create(options) {
    const {list, detail, filters, count, search, language, load, format, select} = options;
    const catalogs = {}, pending = new Map(), state = {fish: {category: "regions"}, enemies: {}}, variants = new Map();
    const t = (key, values) => text(key, language(), values);
    const loc = value => localized(value, language());
    const el = (tag, cls, content) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (content != null) node.textContent = content;
      return node;
    };
    function art(path, cls, name, lazy = false) {
      const image = el("img", cls);
      image.src = ReaderPublication.url("data/" + path);
      image.alt = name;
      image.decoding = "async";
      if (lazy) image.loading = "lazy";
      return image;
    }
    async function ensure(kind) {
      const lang = language(), key = kind + ":" + lang;
      if (!pending.has(key)) pending.set(key, load("world_archive/" + kind + ".json", lang)
        .catch(error => { pending.delete(key); throw error; }));
      const catalog = await pending.get(key);
      if (catalog.schema_version !== 1 || !Array.isArray(catalog.entries)) throw new Error("Unsupported world archive catalog");
      if (lang === language()) catalogs[kind] = catalog;
    }
    function seasonName(catalog, key) { return loc(catalog.seasons?.[key]) || (key === "special" ? t("Fish King") : ""); }
    function filter(kind, key, label, rows) {
      const wrapper = el("label", "world-filter"), control = el("select");
      wrapper.append(el("span", "world-filter-label", t(label)));
      control.setAttribute("aria-label", t(label));
      for (const [id, name] of rows) {
        const option = el("option", "", name); option.value = id; control.append(option);
      }
      control.value = state[kind][key] || "";
      control.addEventListener("change", () => {
        state[kind][key] = control.value;
        if (key === "season") state[kind].location = "";
        list.scrollTop = 0;
        select(kind, "", false, true);
      });
      wrapper.append(control); filters.append(wrapper);
    }
    function renderFilters(kind) {
      filters.replaceChildren();
      filters.hidden = !kinds.includes(kind);
      const catalog = catalogs[kind];
      if (!catalog) return;
      if (kind === "fish") {
        const categories = el("div", "world-collection-tabs");
        categories.setAttribute("role", "group"); categories.setAttribute("aria-label", t("Fish category"));
        for (const [key, label] of [["regions", "Regions"], ["events", "Events"]]) {
          const active = state.fish.category === key;
          const button = el("button", "archive-item-category" + (active ? " active" : ""), t(label));
          button.type = "button"; button.dataset.fishCategory = key;
          button.setAttribute("aria-pressed", String(active));
          button.addEventListener("click", () => {
            state.fish = {category: key}; search.value = ""; list.scrollTop = 0;
            select("fish", key === "events" ? "events" : "", false, true);
          }); categories.append(button);
        }
        filters.append(categories);
        if (state.fish.category === "regions") {
          const seasons = seasonKeys(catalog);
          filter(kind, "season", "Season", [["", t("All seasons")], ...seasons.map(key => [key, seasonName(catalog, key)])]);
          const locations = new Map(catalog.entries.filter(entry => fishCategory(entry) === "regions"
            && (!state.fish.season || entry.season === state.fish.season))
            .flatMap(entry => entry.locations.map(row => [row.id, loc(row.names)])));
          filter(kind, "location", "Location", [["", t("All locations")], ...locations]);
        }
      } else {
        filter(kind, "job", "Class", [["", t("All classes")], ...Object.entries(jobs).map(([key, name]) => [key, t(name)])]);
      }
    }
    function renderList(kind, id) {
      const catalog = catalogs[kind], previousTop = list.scrollTop;
      const entries = filterEntries(catalog, {...state[kind], query: search.value}, language());
      const total = kind === "fish" ? (catalog?.entries || []).filter(entry => fishCategory(entry) === state.fish.category).length
        : catalog?.entries.length || 0;
      count.textContent = t("{count} of {total} entries", {count: entries.length, total});
      list.classList.add("world-card-grid");
      list.replaceChildren();
      const selected = find(catalog, id);
      for (const entry of entries) {
        const button = el("button", "world-card" + (selected === entry ? " active" : ""));
        button.type = "button";
        button.setAttribute("aria-pressed", String(selected === entry));
        const image = kind === "fish" ? entry.variants[0].image : entry.image;
        if (image) button.append(art(image, "world-card-image", "", true));
        button.append(el("span", "world-card-name", loc(entry.names)));
        const meta = kind === "fish" ? (fishCategory(entry) === "events" ? "" : seasonName(catalog, entry.season)) : t(jobs[entry.job]);
        if (meta) button.append(el("span", "world-card-meta", meta));
        if (kind === "fish" && entry.fish_king) button.append(el("span", "world-card-meta", t("Fish King")));
        button.addEventListener("click", () => select(kind, entry.slug, false));
        list.append(button);
      }
      if (!entries.length) list.append(el("p", "archive-list-empty", t("No matching entries.")));
      // Selecting or translating a card never destroys the list's reading position.
      list.scrollTop = previousTop;
    }
    function body(raw, cls = "world-description") {
      const node = el("div", cls); format(node, raw); return node;
    }
    function renderDetail(kind, id) {
      const catalog = catalogs[kind], entry = find(catalog, id);
      detail.replaceChildren();
      detail.classList.add("world-detail");
      if (!entry) {
        detail.append(el("p", "archive-detail-empty", id ? t("This entry could not be found.")
          : t(kind === "fish" ? "Select a fish to learn more." : "Select an enemy to learn more.")));
        return;
      }
      detail.append(el("div", "archive-detail-kicker", t(kind === "fish"
        ? (fishCategory(entry) === "events" ? "Event fish" : entry.fish_king ? "Fish King" : "Fish") : "Enemies")));
      if (kind === "fish") {
        const variant = entry.variants.find(row => row.id === variants.get(entry.id)) || entry.variants[0];
        detail.append(el("h2", "archive-detail-title", loc(variant.names)));
        if (fishCategory(entry) === "regions") detail.append(el("p", "world-detail-meta", seasonName(catalog, entry.season)));
        const location = loc(entry.location_names) || entry.locations.map(row => loc(row.names)).join(" · ");
        if (location) detail.append(el("p", "world-detail-meta", t("Location") + ": " + location));
        if (entry.variants.length > 1) {
          const toggle = el("div", "world-variants"); toggle.setAttribute("role", "group");
          toggle.setAttribute("aria-label", t("Normal and rare"));
          for (const row of entry.variants) {
            const button = el("button", "archive-item-category" + (row === variant ? " active" : ""), t(row.rare ? "Rare variant" : "Normal"));
            button.type = "button"; button.setAttribute("aria-pressed", String(row === variant));
            button.addEventListener("click", () => {
              variants.set(entry.id, row.id); renderDetail(kind, id);
              // Focus the replacement toggle, without moving the page/list.
              detail.querySelector('.world-variants [aria-pressed="true"]')?.focus({preventScroll: true});
            }); toggle.append(button);
          }
          detail.append(toggle);
        }
        detail.append(art(variant.image, "world-fish-art", loc(variant.names)), body(loc(variant.descriptions)));
      } else {
        const header = el("header", "world-enemy-header");
        if (entry.image) header.append(art(entry.image, "world-enemy-art", loc(entry.names)));
        const identity = el("div"); identity.append(el("h2", "archive-detail-title", loc(entry.names)));
        identity.append(el("p", "world-detail-meta", [t("Other"), t(jobs[entry.job]), t(entry.damage), t(entry.attack_style)].join(" · ")));
        header.append(identity); detail.append(header, body(loc(entry.descriptions)));
        if (Object.keys(entry.stats || {}).length) {
          const section = el("section", "world-stats");
          section.append(el("h3", "", t("Base stats")), el("p", "world-detail-meta", t("Level {level} · {quality}",
            {level: catalog.preset.level, quality: loc(catalog.preset.quality_names)})));
          const stats = el("dl", "world-stat-grid");
          for (const [key, name] of [["HP", "HP"], ["ATK", "ATK"], ["ARM", "Physical DEF"], ["MR", "Magic DEF"]]) {
            const row = el("div"); row.append(el("dt", "", t(name)), el("dd", "", Number(entry.stats[key]).toLocaleString(
              {cn: "zh-CN", en: "en-US", jp: "ja-JP", kr: "ko-KR"}[language()], {maximumFractionDigits: 0}))); stats.append(row);
          }
          section.append(stats, el("p", "world-stat-note", t("Before equipment and battle modifiers. Enemy stats vary by encounter.")));
          detail.append(section);
        }
        if (entry.skills.length) detail.append(el("h3", "world-skill-heading", t("Skills")));
        for (const [index, skill] of entry.skills.entries()) {
          const card = el("section", "world-skill");
          const header = el("header", "world-skill-header");
          if (skill.image) header.append(art(skill.image, "world-skill-image", ""));
          const identity = el("div");
          const officialName = skill.names?.[language()] || (language() === "cn" ? skill.names?.cn : skill.names?.en);
          identity.append(el("h4", "", officialName || t("Skill {number}", {number: index + 1})),
            el("p", "world-detail-meta", t("Skill level {level}", {level: skill.level})));
          if (!officialName && skill.names?.cn) identity.append(el("p", "world-detail-meta", t("Chinese name: {name}", {name: skill.names.cn})));
          header.append(identity); card.append(header, body(loc(skill.descriptions))); detail.append(card);
        }
      }
    }
    function render(kind, id) {
      if (kind === "fish") {
        const category = id === "events" ? "events" : fishCategory(find(catalogs[kind], id));
        if (state.fish.category !== category) state.fish = {category};
      }
      // A category overview has its own readable address, without pretending to
      // be a selected fish. Entry links restore their category on refresh/history.
      const selectedId = kind === "fish" && id === "events" ? "" : id;
      renderFilters(kind); renderList(kind, selectedId); renderDetail(kind, selectedId);
    }
    function reset() { filters.hidden = true; list.classList.remove("world-card-grid"); detail.classList.remove("world-detail"); }
    return {ensure, render, renderList, reset, find: (kind, id) => find(catalogs[kind], id)};
  }
  return {kinds, jobs, text, localized, fishCategory, find, searchText, filterEntries, compareSeasons, seasonKeys, create};
});
