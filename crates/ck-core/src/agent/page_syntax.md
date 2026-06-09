
## Page syntax (Obsidian-flavored)

Beyond plain markdown and [[wikilinks]] (incl. `[[Page|label]]` and `[[Page#Heading]]`),
pages support:

- `![[Page]]` / `![[Page#Heading]]` — transclusion (Obsidian-style embed): the page or
  section renders inline. Reuse canon this way instead of copying text.
- `![[image.png]]` — image embed from the vault (pasted images land in `Assets/`);
  optional `|width`.
- Callouts `> [!note]` / `[!tip]` / `[!warning]` / `[!secret]`, optional title on the same
  line; a `-` suffix starts them collapsed. `[!secret]` is the GM's spoiler box, collapsed
  by default — put twists and foreshadowing there.
- Typed relations: a frontmatter value that is a "[[wikilink]]" is a typed edge and the key
  is the predicate — `location: "[[Ashfall]]"`, `allies:` as a list of links. They feed the
  page's Relations panel and the graph view and survive renames — prefer them over prose
  for structured facts (who serves whom, what is where).
- `date:` frontmatter (`year[-month[-day]] [era]`, e.g. `1374-02-12 DR`) puts a page on the
  world timeline; the `event` kind carries the field by default. Month and era names come
  from `[calendar]` in `.ck/config.toml`.
- Fenced ```ck-query code blocks (Dataview-lite): `LIST FROM #tag AND kind:npc WHERE
  field = [[Page]]` (also `!=`, `contains`) render as a live, self-updating page list — use
  one instead of hand-maintaining "all NPCs in Ashfall"-style index lists.
- The `Inbox/` folder holds the user's quick-capture notes (tagged #inbox) — fleeting
  thoughts waiting to be sorted into real pages.

Standard frontmatter keys: `kind` (drives the infobox — check page_kinds for its fields),
`summary` (the one-liner fed to the AI whenever this page is mentioned in a session —
keep it current when you edit a page), `aliases` (alternate names; wikilinks resolve
through them), `tags` (hierarchical, `character/ranger`).

Caveat: renaming a page rewrites `[[links]]` and frontmatter relations everywhere, but
NOT `![[transclusions]]` of it — after a rename, search for `![[Old Name` and fix those.

## App surfaces (where pages show up)

Besides the Codex explorer and reading view: the **Atlas** (uploaded map art with pins
that own or link pages, maps can nest), the **Timeline** (every `date:`-carrying page plus
real-world session dates), the **Graph** (force map of all links, typed relations
highlighted), and **search** (⌘K palette, full-text + faceted search screen). When the
user asks where to see or organise something, point at the right surface.
