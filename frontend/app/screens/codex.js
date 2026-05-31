// Codex — editable per-campaign glossary the summarizer is fed.
// Combines the freeform paste box (Phase 1, edited in the campaign modal) with
// the structured entries (Phase 2): NPCs / places / factions / items / lore.
import { html, useState, useEffect } from '../../vendor/htm-preact-standalone.mjs';
import { navigate, openModal, useStore } from '../core.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Btn, Empty, Icon, Markdown, Input, Textarea, Select } from '../ui.js';
import { loadCodexEntries, createCodexEntry, updateCodexEntry, deleteCodexEntry, openCampaign, updateCampaign } from '../actions.js';

const KINDS = [
  { value: 'npc',     label: 'NPC',     plural: 'NPCs' },
  { value: 'place',   label: 'Place',   plural: 'Places' },
  { value: 'faction', label: 'Faction', plural: 'Factions' },
  { value: 'item',    label: 'Item',    plural: 'Items' },
  { value: 'lore',    label: 'Lore',    plural: 'Lore' },
];

function SourceBadge({ source }) {
  const tone = source === 'manual'
    ? { bg: 'var(--moss-50)', col: 'var(--moss)', border: 'rgba(74,93,58,.22)' }
    : source === 'auto'
      ? { bg: 'var(--ink-blue-50)', col: 'var(--ink-blue)', border: 'rgba(53,83,112,.22)' }
      : { bg: 'var(--ochre-50)', col: 'var(--ochre)', border: 'rgba(168,115,40,.24)' };
  return html`<span style=${{
    display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 999,
    fontSize: 10.5, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
    background: tone.bg, color: tone.col, border: `1px solid ${tone.border}`,
  }}>${source || 'manual'}</span>`;
}

function EntryRow({ entry, onEdit, onDelete }) {
  return html`<div style=${{
    display: 'grid', gridTemplateColumns: '1fr auto', gap: 8,
    padding: '10px 14px', borderTop: '1px solid var(--rule-soft)',
  }}>
    <div style=${{ minWidth: 0 }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style=${{ fontWeight: 500, color: 'var(--ink)' }}>${entry.name}</span>
        <${SourceBadge} source=${entry.source} />
      </div>
      ${entry.body && html`<div style=${{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3, lineHeight: 1.45 }}>${entry.body}</div>`}
    </div>
    <div style=${{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <${Btn} kind="ghost" size="sm" icon="edit" onClick=${onEdit}>Edit</${Btn}>
      <${Btn} kind="ghost" size="sm" icon="trash" onClick=${onDelete}>Delete</${Btn}>
    </div>
  </div>`;
}

function EntryForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState(initial?.kind || 'npc');
  const [body, setBody] = useState(initial?.body || '');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { setErr('Name is required'); return; }
    setBusy(true); setErr(null);
    try {
      await onSubmit({ name: name.trim(), kind, body: body.trim() });
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return html`<div style=${{ background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style=${{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
      <${Input} value=${name} onInput=${setName} placeholder="Name (e.g. Aragorn)" />
      <${Select} value=${kind} onChange=${setKind} options=${KINDS.map((k) => ({ value: k.value, label: k.label }))} />
    </div>
    <${Textarea} value=${body} onInput=${setBody} placeholder="One-line description (optional) — what the summarizer should know" rows=${2} />
    ${err && html`<div style=${{ fontSize: 12, color: 'var(--burgundy-700)' }}>${err}</div>`}
    <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
      <${Btn} kind="ghost" size="sm" onClick=${onCancel}>Cancel</${Btn}>
      <${Btn} kind="primary" size="sm" icon="check" disabled=${busy} onClick=${submit}>Save</${Btn}>
    </div>
  </div>`;
}

export function CodexScreen() {
  const store = useStore();
  const c = store.campaign;
  const [editId, setEditId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editFree, setEditFree] = useState(false);
  const [freeDraft, setFreeDraft] = useState('');
  const [savingFree, setSavingFree] = useState(false);

  useEffect(() => {
    if (c?.campaign_id) loadCodexEntries(c.campaign_id);
  }, [c?.campaign_id]);

  if (!c) { navigate('library'); return null; }

  const entries = store.codexEntries || [];
  const grouped = KINDS.map((k) => ({ kind: k, items: entries.filter((e) => e.kind === k.value) }))
    .filter((g) => g.items.length > 0);
  const freeform = (c.codex || '').trim();

  const sidebar = html`<${Sidebar} variant="campaign" active="codex" campaign=${c} />`;
  const topbar = html`<${Topbar} crumbs=${[
    { label: 'Campaigns', onClick: () => navigate('library') },
    { label: c.name, onClick: () => openCampaign(c.campaign_id) },
    'Codex',
  ]}
    right=${html`<div style=${{ display: 'flex', gap: 6 }}>
      <${Btn} kind="ghost" size="sm" icon="sparkle" onClick=${() => openModal('codexImport')}>Import</${Btn}>
      <${Btn} kind="primary" size="sm" icon="plus" onClick=${() => { setAdding(true); setEditId(null); }}>Add entry</${Btn}>
    </div>`} />`;

  async function onCreate(payload) {
    await createCodexEntry(payload);
    setAdding(false);
  }
  async function onSave(entryId, payload) {
    await updateCodexEntry(entryId, payload);
    setEditId(null);
  }
  function onDelete(entryId, name) {
    openModal('confirm', {
      title: 'Delete codex entry',
      message: `Delete "${name}" from the codex? This cannot be undone.`,
      onConfirm: () => deleteCodexEntry(entryId),
    });
  }

  return html`<${Shell} sidebar=${sidebar} topbar=${topbar}>
    <div style=${{ maxWidth: 820, margin: '0 auto' }}>
      <p style=${{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
        What the summarizer remembers about <strong>${c.name}</strong>. Edit a name the model keeps mangling, and
        the correct spelling will be used in future summaries. Auto entries come from past sessions; edit one
        and it's marked manual so future runs won't overwrite it.
      </p>

      <!-- Freeform paste box (Phase 1) — campaign-wide note, always injected -->
      <div style=${{ marginBottom: 22 }}>
        <div style=${{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, margin: 0 }}>Freeform notes</h3>
          <span style=${{ fontSize: 11.5, color: 'var(--ink-faint)' }}>passed verbatim into every summary</span>
          <span style=${{ flex: 1 }} />
          ${!editFree && html`<${Btn} kind="ghost" size="sm" icon="edit" onClick=${() => { setFreeDraft(freeform); setEditFree(true); }}>Edit</${Btn}>`}
        </div>
        ${editFree
          ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <${Textarea} value=${freeDraft} onInput=${setFreeDraft} rows=${8}
                placeholder="A brief setting, tone, or anything the model should know for every summary." />
              <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <${Btn} kind="ghost" size="sm" disabled=${savingFree} onClick=${() => setEditFree(false)}>Cancel</${Btn}>
                <${Btn} kind="primary" size="sm" icon="check" disabled=${savingFree} onClick=${async () => {
                  setSavingFree(true);
                  try { await updateCampaign({ codex: freeDraft.trim() }); setEditFree(false); }
                  finally { setSavingFree(false); }
                }}>Save</${Btn}>
              </div>
            </div>`
          : freeform
            ? html`<div class="ck-prose" style=${{ background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px 18px' }}>
                <${Markdown} text=${freeform} />
              </div>`
            : html`<div style=${{ fontSize: 12.5, color: 'var(--ink-faint)', fontStyle: 'italic', padding: '8px 0' }}>
                Empty — paste a brief setting or anything the model should know about this campaign.
              </div>`}
      </div>

      <!-- Structured entries (Phase 2) -->
      <div style=${{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, margin: 0 }}>Entries</h3>
        <span style=${{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
          ${entries.length === 0 ? 'nothing yet' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>

      ${adding && html`<div style=${{ marginBottom: 14 }}>
        <${EntryForm} onSubmit=${onCreate} onCancel=${() => setAdding(false)} />
      </div>`}

      ${grouped.length === 0 && !adding
        ? html`<${Empty} icon="book" title="No entries yet">
            Add an NPC, place, or item, or run a summary — the summarizer pulls names from your sessions automatically.
          </${Empty}>`
        : grouped.map((g) => html`<div key=${g.kind.value} style=${{ marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8 }}>
            <div style=${{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <${Icon} name=${iconForKind(g.kind.value)} size=${13} />
              <span style=${{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 500 }}>${g.kind.plural}</span>
              <span style=${{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>${g.items.length}</span>
            </div>
            ${g.items.map((e) => editId === e.entry_id
              ? html`<div key=${e.entry_id} style=${{ padding: '10px 14px', borderTop: '1px solid var(--rule-soft)' }}>
                  <${EntryForm} initial=${e} onSubmit=${(p) => onSave(e.entry_id, p)} onCancel=${() => setEditId(null)} />
                </div>`
              : html`<${EntryRow} key=${e.entry_id} entry=${e}
                  onEdit=${() => { setEditId(e.entry_id); setAdding(false); }}
                  onDelete=${() => onDelete(e.entry_id, e.name)} />`)}
          </div>`)}
    </div>
  </${Shell}>`;
}

function iconForKind(k) {
  return { npc: 'users', place: 'map', faction: 'shield', item: 'gem', lore: 'scroll' }[k] || 'doc';
}
