/* Story Archive entrance, season gallery and native loading-screen glossary. */
(function(root, factory) {
  const glossary = typeof module === "object" && module.exports ? require("./reader_glossary.js") : root.ReaderGlossary;
  const api = factory(glossary);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderStoryArchive = api;
})(typeof globalThis === "object" ? globalThis : this, function(Glossary) {
  "use strict";
  const PAGES = ["stories", "glossary", "search"];
  const LABELS = {stories: "Stories", glossary: "Glossary", search: "Search"};
  const DESCRIPTIONS = {
    stories: "Revisit the chapters and seasons of Esperia.",
    glossary: "Discover the places, people, and ideas behind the stories.",
    search: "Find a story or a term from the world of Esperia.",
  };
  const {normalized, matches} = Glossary;
  function parse(path) {
    const parts = String(path).replace(/^#?\/?/, "").split("/").filter(Boolean);
    if (parts[0] !== "story-archive") return null;
    if (parts.length > 3 || (parts[1] && !PAGES.includes(parts[1]))
        || (parts[2] && (parts[1] !== "glossary" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2])))) return null;
    return {view: "story-archive", archivePage: parts[1] || "", glossaryTerm: parts[2] || ""};
  }
  function path(page = "", term = "") {
    return "/story-archive" + (page ? "/" + page : "") + (page === "glossary" && term ? "/" + term : "");
  }
  function create(options) {
    const {root, text, href, url, read, collections, storyHref, onQuery} = options;
    let glossary = null, artwork = {}, illustrations = {}, artLoad = null, loreLoad = null, state = {}, slide = 0;
    let glossaryListViewport = null;
    function element(tag, className, content) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (content !== undefined) node.textContent = content;
      return node;
    }
    function icon(kind) {
      const node = element("span", "archive-illustration");
      const source = illustrations[kind] || illustrations.stories;
      if (source) {
        const image = element("img"); image.src = ReaderPublication.url(url(source.image)); image.alt = "";
        image.width = source.width; image.height = source.height; image.decoding = "async";
        node.append(image);
      }
      return node;
    }
    function link(label, target, className = "archive-back") {
      const node = element("a", className, label); node.href = target; return node;
    }
    function value(locales) { return locales?.[state.language] || locales?.en || ""; }
    async function prepare(page) {
      if (!artLoad) artLoad = read("story_archive/index.json").then(art => {
        if (art.schema_version !== 1) throw new Error("Invalid Story Archive artwork catalog");
        artwork = art.artwork || {}; illustrations = art.illustrations || {};
      }).catch(error => { artLoad = null; throw error; });
      const tasks = [artLoad];
      if (["glossary", "search"].includes(page)) {
        if (!loreLoad) loreLoad = read("glossary/index.json").then(lore => {
          if (lore.schema_version !== 1 || !Array.isArray(lore.entries)) throw new Error("Invalid glossary catalog");
          glossary = lore;
        }).catch(error => { loreLoad = null; throw error; });
        tasks.push(loreLoad);
      }
      await Promise.all(tasks);
    }
    function heading(label, description) {
      const header = element("header", "story-archive-heading");
      header.append(link("‹ " + text("Story Archive"), href(path())), element("h1", "", text(label)));
      if (description) header.append(element("p", "", text(description)));
      root.append(header);
    }
    function renderLanding() {
      const header = element("header", "archive-entrance-heading");
      header.append(element("p", "archive-eyebrow", text("The Esperia Archive")), element("h1", "", text("Story Archive")));
      const carousel = element("div", "archive-carousel");
      carousel.setAttribute("aria-label", text("Explore the archive"));
      const previous = element("button", "archive-turn", "‹"); previous.type = "button";
      previous.setAttribute("aria-label", text("Previous archive page"));
      const next = element("button", "archive-turn", "›"); next.type = "button";
      next.setAttribute("aria-label", text("Next archive page"));
      const center = element("div", "archive-portal-slot");
      const portals = PAGES.map(page => {
        const portal = link("", href(path(page)), "archive-portal");
        portal.append(icon(page), element("h2", "", text(LABELS[page])), element("p", "archive-portal-description", text(DESCRIPTIONS[page])),
          element("span", "archive-open", text("Open") + " →"));
        center.append(portal);
        return portal;
      });
      const tabs = element("nav", "archive-page-choices"); tabs.setAttribute("aria-label", text("Archive pages"));
      const buttons = PAGES.map((page, index) => {
        const button = element("button", "", text(LABELS[page])); button.type = "button";
        button.addEventListener("click", () => choose(index)); tabs.append(button); return button;
      });
      const status = element("p", "archive-sr-only");status.setAttribute("aria-live", "polite");
      function choose(index) {
        slide = (index + PAGES.length) % PAGES.length;
        const page = PAGES[slide];
        portals.forEach((portal, i) => {
          const active = i === slide;
          portal.classList.toggle("archive-portal-inactive", !active);
          portal.setAttribute("aria-hidden", String(!active));
          portal.inert = !active;
          portal.tabIndex = active ? 0 : -1;
        });
        buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === slide)));
        status.textContent = text(LABELS[page]);
      }
      previous.addEventListener("click", () => choose(slide - 1)); next.addEventListener("click", () => choose(slide + 1));
      carousel.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); choose(slide + (event.key === "ArrowRight" ? 1 : -1));
      });
      let touch = null, swiped = false;
      carousel.addEventListener("touchstart", event => {touch = event.touches[0]; swiped = false;}, {passive:true});
      carousel.addEventListener("touchend", event => {
        if (!touch) return;
        const end = event.changedTouches[0], dx = end.clientX - touch.clientX, dy = end.clientY - touch.clientY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {swiped = true; choose(slide + (dx < 0 ? 1 : -1));}
        touch = null;
      }, {passive:true});
      carousel.addEventListener("click", event => {if (swiped) {event.preventDefault(); swiped = false;}}, true);
      carousel.append(previous, center, next); root.append(header, carousel, tabs, status); choose(slide);
    }
    function renderGallery() {
      heading("Stories", "Choose a chapter of Esperia.");
      const grid = element("div", "archive-season-grid");
      for (const collection of collections()) {
        const card = link("", collection.href, "archive-season-card");card.dataset.collection = collection.key;
        const art = element("div", "archive-season-art");
        const cover = artwork[collection.key];
        if (cover) {
          const window = element("figure", "archive-season-window");
          window.style.aspectRatio = `${cover.width} / ${cover.height}`;
          const image = element("img"); image.src = ReaderPublication.url(url(cover.image)); image.alt = ""; image.width = cover.width; image.height = cover.height; image.loading = "lazy";
          image.addEventListener("error", () => {window.hidden = true; art.append(icon("stories"));}, {once:true});
          const caption = element("figcaption", "archive-window-caption");
          caption.append(element("h2", "archive-window-title", collection.label));
          window.append(image, caption);art.append(window);
        } else art.append(icon("events"));
        const number = /^season_(\d+)$/.exec(collection.key);
        const kicker = !cover ? collection.label : number
          ? text("Season {number}", {number:number[1]})
          : text(collection.key === "base_campaign" ? "Starter Story" : "Special Events");
        card.append(art, element("span", "archive-season-kicker", kicker),
          element("span", "archive-season-open", text("Read stories") + " →"));
        grid.append(card);
      }
      root.append(grid);
    }
    function searchField(placeholder, label, query) {
      const wrapper = element("div", "archive-lore-toolbar");
      const input = element("input", "archive-lore-search"); input.type = "search";input.autocomplete = "off";
      input.placeholder = text(placeholder);input.setAttribute("aria-label", text(label));input.value = query;
      const count = element("p", "archive-result-count");count.setAttribute("role", "status");
      wrapper.append(input, count);root.append(wrapper);return {input,count};
    }
    function renderGlossary() {
      Glossary.render({root, glossary, state, text, href, icon, onQuery});
    }
    function renderSearch() {
      heading("Search", "Find stories by title and search the glossary in any of the four languages.");
      const {input,count} = searchField("Search stories and glossary", "Search stories and glossary", state.query || "");
      const results = element("div", "archive-search-results");root.append(results);
      const stories = collections().flatMap(collection => collection.stories.map(story => ({...story,collection})));
      function filter() {
        state.query = input.value;onQuery(state.query);results.replaceChildren();
        if (!normalized(state.query)) {count.textContent = "";results.append(element("p", "archive-search-hint", text("Enter a story title, place, or lore term.")));return;}
        const foundStories = stories.filter(story => matches(story,state.query));
        const foundTerms = glossary.entries.filter(entry => matches(entry,state.query));
        count.textContent = text("{count} results", {count:foundStories.length + foundTerms.length});
        if (!foundStories.length && !foundTerms.length) {results.append(element("p", "archive-no-results", text("No matching stories or terms.")));return;}
        for (const [label, rows] of [["Stories",foundStories],["Glossary",foundTerms]]) {
          if (!rows.length) continue;
          const section = element("section", "archive-search-section");section.append(element("h2", "", text(label)));
          let shown = 0;
          function more() {
            button.remove();
            for (const entry of rows.slice(shown, shown + 60)) {
              const row = link("", label === "Stories" ? storyHref(entry) : href(path("glossary",entry.id)), "archive-search-result");
              row.append(element("strong", "", value(label === "Stories" ? entry.title : entry.names)),
                element("span", "", label === "Stories" ? entry.collection.label : value(entry.definitions[0].text)));
              section.append(row);
            }
            shown += 60;if (shown < rows.length) section.append(button);
          }
          const button = element("button", "archive-show-more", text("Show more"));button.type="button";button.addEventListener("click",more);
          more();results.append(section);
        }
      }
      input.addEventListener("input", filter);filter();
    }
    function render(route, language, viewport = {}) {
      const nextState = {page:route.archivePage || "", term:route.glossaryTerm || "", query:route.archiveQuery || "", language};
      const continuingGlossary = viewport.active !== false && state.page === "glossary" && nextState.page === "glossary"
        && state.language === language && state.query === nextState.query;
      const previousList = continuingGlossary ? root.querySelector(".archive-term-list") : null;
      const listScrollTop = previousList?.scrollTop || 0;
      let position = continuingGlossary ? viewport : null;
      if (!continuingGlossary) glossaryListViewport = null;
      if (continuingGlossary && viewport.stacked && nextState.term !== state.term) {
        if (nextState.term) {
          // Keep the list's position relative to the screen, even when a definition above it changes height.
          const rect = previousList?.getBoundingClientRect();
          if (rect && (!state.term || (rect.bottom > 0 && rect.top < viewport.height))) {
            glossaryListViewport = {listOffset:rect.top};
          }
          position = {termHeading:true};
        } else position = glossaryListViewport || viewport;
      }
      if (!continuingGlossary && viewport.stacked && nextState.page === "glossary" && nextState.term) position = {termHeading:true};
      state = nextState;
      root.replaceChildren();root.dataset.page = state.page || "entrance";
      if (!state.page) renderLanding();
      else if (state.page === "stories") renderGallery();
      else if (state.page === "glossary") renderGlossary();
      else renderSearch();
      if (continuingGlossary) root.querySelector(".archive-term-list").scrollTop = listScrollTop;
      return position;
    }
    return {prepare,render};
  }
  return {create,parse,path,matches};
});
