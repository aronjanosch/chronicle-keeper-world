// Vault page editor: raw-.md textarea + live preview, debounced auto-save.
import { html, useState, useEffect, useRef } from '../../vendor/htm-preact-standalone.mjs';
import { navigate, useStore } from '../core.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Btn, Empty, Icon, PageBody } from '../ui.js';
import { readVaultPage, saveVaultPage, openCampaign } from '../actions.js';
import { iconForKind, KINDS } from './codex.js';

function kindLabel(k) {
  return (KINDS.find((x) => x.value === k) || {}).label || k || 'page';
}

export function PageScreen() {
  const store = useStore();
  const c = store.campaign;
  const path = store.route.params.path;

  const [text, setText] = useState(null);
  const [kind, setKind] = useState(null);
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [missing, setMissing] = useState(false);
  const timer = useRef(null);
  const latest = useRef('');

  useEffect(() => {
    let cancelled = false;
    setText(null); setMissing(false);
    readVaultPage(path)
      .then((p) => { if (cancelled) return; setText(p.content); latest.current = p.content; setKind(p.kind); setTitle(p.title); setDirty(false); })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [path, c?.campaign_id]);

  async function flush() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await saveVaultPage(path, latest.current);
    setDirty(false);
  }

  function onInput(e) {
    const v = e.target.value;
    setText(v); latest.current = v; setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush().catch(() => {}); }, 800);
  }

  if (!c) { navigate('library'); return null; }

  const sidebar = html`<${Sidebar} variant="campaign" active="codex" campaign=${c} />`;
  const crumbs = [
    { label: 'Campaigns', onClick: () => navigate('library') },
    { label: c.name, onClick: () => openCampaign(c.campaign_id) },
    { label: 'Codex', onClick: () => navigate('codex', { id: c.campaign_id }) },
    title || path,
  ];

  if (missing) {
    return html`<${Shell} sidebar=${sidebar} topbar=${html`<${Topbar} crumbs=${crumbs} />`}>
      <${Empty} icon="scroll" title="Page not found">
        <a onClick=${() => navigate('codex', { id: c.campaign_id })} style=${{ color: 'var(--burgundy)', cursor: 'pointer' }}>Back to the codex</a>.
      </${Empty}>
    </${Shell}>`;
  }

  const topbar = html`<${Topbar} crumbs=${crumbs}
    right=${html`<div style=${{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
      <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10.5 }}>
        <${Icon} name=${iconForKind(kind)} size=${12} /> ${kindLabel(kind)}
      </span>
      <span title=${dirty ? 'Unsaved changes' : 'Saved'} style=${{
        width: 8, height: 8, borderRadius: 999,
        background: dirty ? 'var(--ochre)' : 'var(--moss)',
      }} />
      <${Btn} kind="ghost" size="sm" onClick=${() => navigate('codex', { id: c.campaign_id })}>Done</${Btn}>
    </div>`} />`;

  return html`<${Shell} sidebar=${sidebar} topbar=${topbar} bodyStyle=${{ padding: 0 }}>
    ${text === null
      ? html`<div style=${{ padding: 40, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Loading…</div>`
      : html`<div class="ck-page-split" style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', minHeight: 0 }}>
        <textarea value=${text} onInput=${onInput} spellcheck="false" style=${{
          width: '100%', height: '100%', boxSizing: 'border-box', resize: 'none', border: 'none',
          outline: 'none', padding: '28px 32px', background: 'var(--surface)',
          borderRight: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: 13.5,
          lineHeight: 1.6, color: 'var(--ink)',
        }} />
        <div style=${{ overflow: 'auto', padding: '28px 36px', background: 'var(--paper)' }}>
          <div style=${{ maxWidth: 680 }}>
            <${PageBody} text=${text} />
          </div>
        </div>
      </div>`}
  </${Shell}>`;
}
