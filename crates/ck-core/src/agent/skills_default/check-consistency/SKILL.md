---
name: Check consistency
description: Sweep the world for contradictions — dead-but-active NPCs, broken containment, timeline impossibilities, unit/currency drift. Use when the user asks to check, audit, or find inconsistencies in the world.
---

Produce a consistency report for the world. This is a **read-only audit**: you find
and list problems, you never fix them. End by offering to address specific items — let
the user decide what to act on.

How to work:
- Be systematic, not impressionistic. Lean on `query_world` and `vault_diagnostics` for
  coverage so you are not blind-searching — these find what reading a few pages misses.
- Report only real, specific contradictions with the pages involved (cite them as
  [[wikilinks]]). Skip vague "could be richer" notes — that is not this skill's job.
- If you find nothing in a category, say so briefly rather than padding.
- Group findings by category. For each: what is wrong, which pages, why it is a conflict.

Run these passes (adapt to what the world actually has):

**Status drift** — entities marked one way but spoken of another.
- `query_world` `FROM kind:npc WHERE status = dead` (or `WHERE alive != true`), then check
  whether other pages still describe them acting in the present tense.
- Same for `kind:faction WHERE status = disbanded`, ruined places still inhabited, etc.

**Containment & membership** — Phase 18 part_of / typed relations.
- `query_world` `WHERE part_of = "[[X]]"` to enumerate a place's children; check none also
  claim a different parent, and that the parent page's own description agrees.
- Faction membership: a page listing `member_of: "[[Guild]]"` while the Guild page (or a
  session) says they left or were expelled.

**Broken structure** — run `vault_diagnostics`: broken [[wikilinks]], broken ![[embeds]],
orphan pages, sync-conflict files. Report the broken links and embeds; orphans are weaker
signals (mention only if many).

**Timeline impossibilities** — dated pages and the world calendar.
- An event referencing a person/place that did not yet exist (or was already destroyed) at
  that date. A birth after a death. Two mutually exclusive events on the same date.
- Use the timeline view / dated pages; cross-check against `caused_by` / `leads_to` chains
  if present (an effect dated before its cause).

**Unit & currency drift** — the same quantity named inconsistently across pages (a distance
in leagues on one page and "three days' ride" implying a different scale on another; coin
named "crowns" here and "sovereigns" there for the same currency; a population that
contradicts a "small village" description). These are easy to miss and break immersion.

Format the report as grouped sections with a one-line summary at the top (how many issues,
how many categories). Then: "Want me to fix any of these? Tell me which." Never edit a page
as part of this audit.
