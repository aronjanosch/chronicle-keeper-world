// Codex / Sources — designed but deferred (need a backend file indexer).
import { html } from '../../vendor/htm-preact-standalone.mjs';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Empty } from '../ui.js';

export function PlaceholderScreen({ store, kind }) {
  const inCampaign = !!store.campaign && kind === 'codex';
  const sidebar = inCampaign
    ? html`<${Sidebar} variant="campaign" active="codex" campaign=${store.campaign} />`
    : html`<${Sidebar} variant="library" active=${kind} />`;
  const crumbs = kind === 'codex' ? ['Campaigns', store.campaign?.name, 'Codex'] : ['Workshop', 'Sources'];
  const title = kind === 'codex' ? 'The Codex' : 'Sources';
  const body = kind === 'codex'
    ? "A read-only window into what the summarizer remembers — built from your notes, never edited here. Filename becomes the entry name, frontmatter and folders are optional hints, prose is passed verbatim. Not yet wired up."
    : "Connect an Obsidian vault, a Notion export, or a plain markdown folder so the summarizer can draw on your world. Not yet wired up.";
  return html`<${Shell} sidebar=${sidebar} topbar=${html`<${Topbar} crumbs=${crumbs} />`}>
    <div style=${{ maxWidth: 720, margin: '40px auto 0' }}>
      <${Empty} icon=${kind === 'codex' ? 'book' : 'folder'} title=${`${title} — coming soon`}>${body}</${Empty}>
    </div>
  </${Shell}>`;
}
