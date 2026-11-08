/* Native loading-screen glossary, shared by the two private readers. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderGlossary = api;
})(typeof globalThis === "object" ? globalThis : this, function() {
  "use strict";
  function path(page = "", term = "") {
    return "/story-archive" + (page ? "/" + page : "") + (term ? "/" + term : "");
  }
  function normalized(value) { return String(value || "").normalize("NFKC").toLocaleLowerCase().trim(); }
  function matches(entry, query) {
    const tokens = normalized(query).split(/\s+/).filter(Boolean);
    const haystack = normalized([
      ...Object.values(entry.names || {}),
      ...(entry.definitions || []).flatMap(row => Object.values(row.text || {})),
      ...Object.values(entry.title || {}), ...Object.values(entry.description || {}),
    ].join("\n"));
    return tokens.every(token => haystack.includes(token));
  }
  function render(options) {
    const {root, glossary, state, text, href, icon, onQuery} = options;
    function element(tag, className, content) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (content !== undefined) node.textContent = content;
      return node;
    }
    function link(label, target, className = "archive-back") {
      const node = element("a", className, label); node.href = target; return node;
    }
    function value(locales) { return locales?.[state.language] || locales?.en || ""; }
    function heading(label, description) {
      const header = element("header", "story-archive-heading");
      header.append(link("‹ " + text("Story Archive"), href(path())), element("h1", "", text(label)));
      if (description) header.append(element("p", "", text(description)));
      root.append(header);
    }
    function searchField(placeholder, label, query) {
      const wrapper = element("div", "archive-lore-toolbar");
      const input = element("input", "archive-lore-search"); input.type = "search";input.autocomplete = "off";
      input.placeholder = text(placeholder);input.setAttribute("aria-label", text(label));input.value = query;
      const count = element("p", "archive-result-count");count.setAttribute("role", "status");
      wrapper.append(input, count);root.append(wrapper);return {input,count};
    }
      heading("Glossary", "Explore the world and lore of Esperia.");
      const {input,count} = searchField("Search the glossary", "Search the glossary", state.query || "");
      const layout = element("div", "archive-glossary-layout");
      const list = element("nav", "archive-term-list");list.setAttribute("aria-label", text("Glossary terms"));
      const detail = element("article", "archive-term-detail");detail.id = "glossary-detail";detail.tabIndex = 0;
      const selected = glossary.entries.find(entry => entry.id === state.term);
      if (selected) {
        detail.append(link("‹ " + text("All terms"), href(path("glossary"), {q:state.query || ""}), "archive-term-back"),
          element("p", "archive-eyebrow", text("Glossary")), element("h2", "", value(selected.names)));
        for (const description of selected.definitions) detail.append(element("p", "archive-lore-definition", value(description.text)));
        layout.classList.add("has-selected-term");
      } else if (state.term) {
        detail.append(element("h2", "", text("Term not found")), link(text("All terms"), href(path("glossary"))));
      } else {
        detail.classList.add("archive-term-welcome");if (icon) detail.append(icon("glossary"));
        detail.append(element("h2", "", text("A world of stories")),
          element("p", "", text("Choose a term to learn more about Esperia.")));
      }
      const collator = new Intl.Collator({cn:"zh-Hans",jp:"ja",kr:"ko",en:"en"}[state.language]);
      function filter() {
        const query = input.value;state.query = query;onQuery(query);
        const entries = glossary.entries.filter(entry => matches(entry, query)).sort((a,b) => collator.compare(value(a.names), value(b.names)));
        count.textContent = text("{count} terms", {count:entries.length});list.replaceChildren();
        for (const entry of entries) {
          const row = link(value(entry.names), href(path("glossary", entry.id), {q:query}), "archive-term-link");
          if (selected?.id === entry.id) row.setAttribute("aria-current", "page");list.append(row);
        }
        if (!entries.length) list.append(element("p", "archive-no-results", text("No matching terms.")));
      }
      input.addEventListener("input", filter);layout.append(list,detail);root.append(layout);filter();
    }
  return {render, normalized, matches};
});
