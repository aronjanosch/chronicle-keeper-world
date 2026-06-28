---
name: Authoring a skill
description: How to write a good Keeper skill — naming, the all-important description, structure, what belongs in a skill vs memory vs a Codex page. Use whenever the user asks you to make, create, capture, edit, or improve a skill, or to "remember how to" do a recurring task.
---

## What a skill is

A skill is an app-global reference you pull on demand with `use_skill` — system rules,
house rules, a prep workflow, a formatting or lore-style convention, a reference table.
Only its **name + description** ride in your context at all times (the Skills index);
the body loads only when you reach for it. Skills are GM tooling shared by every world —
they are NOT world lore (that's a Codex page) and NOT a work preference (that's a memory).

Save one with the `save_skill` tool (omit `slug` to create, pass an existing `slug` to
update or rename).

## The description is the whole game

The description is the only thing you ever see until you pull the skill, so it alone
decides whether you reach for it. Write it to two ends:

1. **What it does** — the substance, concretely (not "helps with rules" but "the 2d12
   duality dice, Hope/Fear, damage thresholds").
2. **When to use it** — name the triggers in the user's words: "Use when the user asks
   about Daggerheart rolls, adjudication, or character options."

Lean **slightly pushy** — models under-reach for skills, so err toward "use this whenever
…" over "you may consult this if …". Keep it to a sentence or two. If a skill keeps not
firing when it should, the fix is almost always a sharper, pushier description — rewrite it.

## Body: lean and structured

The body is reference you apply, not orders to obey. Keep it tight — a few screens, not a
manual. A reliable shape:

```
## When to use
The situations this covers (mirrors the description, with more nuance).

## How
The steps, rules, or reference to apply — tables, checklists, examples.
```

If a body wants to grow past a few hundred lines, that's a sign it's two skills, or that
the bulk is a lookup table the user would rather keep as a Codex page and you link to.

## kinds → page chips

`kinds: [npc, place]` makes the skill show as a one-click chip on pages of those kinds — a
zero-inference shortcut for the user. Set it only when the skill is genuinely page-kind
specific (a "flesh out an NPC" worksheet). Leave it empty for skills you pull on your own
judgement (a rules reference, a prep workflow).

## Capturing a skill from this chat

When the user says "save that as a skill" / "remember how to do this":

1. Look back over what worked — the steps you took, the tools, the corrections the user
   made, the format they liked.
2. Draft a name, a pushy description, and a lean body in that structure.
3. **Show the user the draft and confirm** before calling `save_skill` — never save silently.
4. After saving, tell them it's live (no restart) and editable in Settings → Keeper skills.

## Skill vs memory vs page

- Recurring *how-to* knowledge you'll pull deliberately → **skill**.
- A standing work preference or correction ("always X") → **memory** (`write_memory`).
- A fact about this world (an NPC, a place, a faction) → **Codex page**.
