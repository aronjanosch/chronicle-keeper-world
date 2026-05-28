// Codex — read-only view of the campaign glossary (known names & lore) that the
// summarizer is fed. Phase 1: a single freeform field, edited in the campaign modal.
import { html } from '../../vendor/htm-preact-standalone.mjs';
import { openModal, navigate } from '../core.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Btn, Empty, Markdown } from '../ui.js';

export function CodexScreen({ store }) {
  const c = store.campaign;
  if (!c) { navigate('library'); return null; }
  const codex = (c.codex || '').trim();
  const sidebar = html`<${Sidebar} variant="campaign" active="codex" campaign=${c} />`;
  const topbar = html`<${Topbar} crumbs=${['Campaigns', c.name, 'Codex']}
    right=${html`<${Btn} kind="ghost" size="sm" icon="edit" onClick=${() => openModal('campaign', { edit: c })}>Edit codex</${Btn}>`} />`;

  return html`<${Shell} sidebar=${sidebar} topbar=${topbar}>
    <div style=${{ maxWidth: 760, margin: '0 auto' }}>
      <p style=${{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
        Known names &amp; lore for <strong>${c.name}</strong> — NPCs, places, factions, items. Fed verbatim into
        every summary so the model recognises and correctly spells what the transcription mangles.
      </p>
      ${codex
        ? html`<div class="ck-prose" style=${{ background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 10, padding: '18px 22px' }}>
            <${Markdown} text=${codex} />
          </div>`
        : html`<${Empty} icon="book" title="No codex yet">
            Add the names and lore the summarizer should know — paste them however you keep them.
            <div style=${{ marginTop: 14 }}><${Btn} kind="primary" size="sm" icon="edit" onClick=${() => openModal('campaign', { edit: c })}>Add codex</${Btn}></div>
          </${Empty}>`}
    </div>
  </${Shell}>`;
}
