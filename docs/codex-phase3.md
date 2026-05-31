# Codex — Phase 3 plan (entry detail · skill-style body · summary linking)

> Hand-off plan for a fresh session. Phases 1 + 2 (manual + auto-extract) and the
> LLM importer (paste / files / folder, override-on-reimport, language-aware) are
> **done**. This phase makes the codex a real *inspector into the LLM's memory*
> without turning it into an Obsidian clone.

## Context & vision (read first)

- A codex entry today = `name + kind + one-line body`. The one-liner is the only
  thing fed into summaries (`prompts.rs` "Known names & lore"). The codex can grow
  to hundreds of entries, so we never feed verbatim prose — distillation is the point.
- Design north star (`design chat`, paraphrased): the codex is **a window into a
  black box** — "why did the summary call Tannerheim friendly?" → click through and
  see what the LLM was told. It is **not** a wiki, not a graph, not an editor. Don't
  compete with Obsidian.
- User's own v2 framing: entries behave **like Claude skills** — a short one-liner
  for overview, a fuller body opened **on demand** for detail. This phase *stores*
  that fuller body and shows it; the agentic on-demand retrieval is a later phase.

## Design reference
The mockup screens (`codex.jsx`, `codex-entry.jsx`, `tokens.css`, `atoms.jsx`) live at
the design canvas: `https://api.anthropic.com/v1/design/h/t3ehJ12W4ikgasw0YsV1dg`
(WebFetch returns a gzip tarball — pipe through `gunzip | tar x`). Match the layout,
type, spacing, colour, and copy; ignore the hardcoded mock data and the telemetry bits
this plan cuts. The live design system already exists in `frontend/tokens.css`.

## Build

### 1. Detailed body (stored, distilled — not raw)
- **Schema** (`db.rs`): add `detail TEXT NOT NULL DEFAULT ''` to `codex_entries`
  (migration, backfill empty). Participates in `dirty`/sync.
- **Models** (`models.rs`): `CodexEntry.detail`; `CodexEntryCreate.detail` (default);
  `CodexEntryUpdate.detail: Option<String>`.
- **Store** (`store/codex.rs`): `create_entry` / `update_entry` / `upsert_manual`
  read & write `detail`. `COLS` + `row_to_entry` include it. On import override,
  `upsert_manual` replaces `detail` too.
- **Import** (`codex_import.rs`): prompt returns `{name, kind, body, detail}` where
  `body` = ONE sentence (unchanged) and `detail` = a short **distilled paragraph**
  (2–5 sentences, source-language, no markdown) — NOT the raw file. Parse + carry
  `detail`. Keep dedupe/longest-body merge logic; prefer the richer `detail` too.
  **Decision:** `detail` is distilled, not the raw note — keeps storage bounded and
  matches the "we summarize, we don't mirror your vault" principle. Raw file discarded.
- **Feeding:** summaries still receive **only the one-liner** (no change to
  `summarize.rs` / `prompts.rs`). `detail` is for the human inspector + future agentic.
- **Sync** (`sync.rs`): add `detail` to the round-trip; update the test.

### 2. Codex overview redesign (adopt the designer's look — minus telemetry)
Rebuild `screens/codex.js` toward the mockup's overview (`design: screens/codex.jsx`),
keeping the parchment aesthetic but cutting the theater:
- **Card grid** of entries (replaces the current plain rows): each card = kind icon +
  name, kind label, the one-liner in italic serif, a `manual`/`auto` source badge.
- **Kind rail / filter** down the left (NPCs / Places / Factions / Items / Lore) with
  live counts — the design's "What the LLM remembers" rail. Clicking filters.
- **Search box** in the topbar (client-side filter by name/body).
- Cards are **clickable** → entry-detail (§3).
- **Cut from the mockup:** the "cited 9× · last S14" line, the "Cited · S14" fresh
  badge, the Sources rail/sync, the indexing banner with file paths. No telemetry.

### 3. Entry-detail view (the inspector — most important screen)
Adopt the mockup's detail layout (`design: screens/codex-entry.jsx`), trimmed:
- New route + screen `frontend/app/screens/codexEntry.js` (register in `core.js`
  router; nav from codex cards). Make cards **clickable** → open detail.
- Layout: **source bar** (manual/auto + `updated_at`), kind eyebrow, big serif title,
  one-liner as the italic subtitle, then `detail` rendered as markdown prose.
- **Inline edit** (name/kind/one-liner/detail) + delete, reusing existing actions.
- **"Mentioned in" list (cheap, no new telemetry):** scan stored session metadata
  (`characters`/`locations`/`items` already persisted per session) for this entry's
  name; render matching sessions as links. This is the design's "mentioned in N
  sessions" — but built from data we already have, zero instrumentation. It's the
  honest substitute for the ditched cite-counter.
- The mockup's right-rail ("How this is used" cite stats, frontmatter "what we picked
  up", co-citation "linked entries") is **cut** — telemetry + provenance we don't track.

### 4. Summary → codex name-linking
- When rendering a summary (`screens/session.js` / wherever `Markdown` shows it),
  match active codex entry names (case-insensitive, word-boundary, **longest-first**
  to avoid partial overlaps) and wrap occurrences as links to the entry-detail view.
- Mis-links are corrected by editing/deleting the codex entry — no separate UI.
- Pure frontend (entries already loaded for the campaign). Keep it a render-time pass.

## DITCH (decided — do not build)
- **Cite-count / "fed to LLM 9× · last S14" / mention telemetry** — theater; large
  backend instrumentation for vanity metrics. The "Mentioned in" list (§2) is the
  cheap honest replacement.
- **Sources screen + multi-source provenance/sync/file-paths** — the fs/sync rabbit
  hole; paste/files import already covers ingestion.
- **Native folder/vault picker (Tauri dialog/fs)** — rejected as too risky; revisit
  post-launch only if users ask.
- **Confirm-before-add for auto-extracted entries** — keep silent `upsert_auto`;
  user corrects after the fact.
- **Agentic on-demand detail retrieval (RAG / skill-execution)** — real v2 with its
  own design. This phase only *stores & displays* `detail`.
- **Category rail, source badges beyond manual/auto, graph/relationships editor** —
  not building.

## Files to touch
- Backend: `db.rs` (migration), `models.rs`, `store/codex.rs`, `http/codex.rs`
  (import returns `detail`; entry GET if needed), `codex_import.rs` (prompt+parse),
  `sync.rs`. **No change** to `summarize.rs`/`prompts.rs` feeding.
- Frontend: `screens/codex.js` (clickable rows, search), new `screens/codexEntry.js`,
  `core.js` (route), `actions.js` (load one entry + compute mentions), `modals.js`
  (import review can stay one-liner-only; `detail` saved silently and edited in the
  entry view — keeps the review grid simple).

## Verification
1. Migrate (existing entries get empty `detail`). `cargo test -p ck-core`.
2. Import a German vault → entries have one-liner + a German `detail` paragraph.
3. Click an entry → detail view renders the paragraph + a "Mentioned in" list of
   real sessions.
4. Open a session summary → codex names are linked; clicking opens the entry.
5. Search filters the codex list.

## Open question for the build session
- `detail` = distilled paragraph (**recommended**) vs raw source text. Recommend
  distilled. If the user later wants true full-text recall, that's the agentic v2.
