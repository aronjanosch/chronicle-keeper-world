// App shell: sidebar + topbar + body slot. Ported from the design's shell.jsx,
// wired to the store's router.
import { html } from '../vendor/htm-preact-standalone.mjs';
import { navigate, store } from './core.js';
import { Icon, Sigil, BrandMark } from './ui.js';

function NavItem({ icon, label, count, active, indent, onClick }) {
  return html`<div onClick=${onClick} style=${{
    display: 'flex', alignItems: 'center', gap: 9,
    padding: indent ? '6px 9px 6px 30px' : '7px 9px',
    borderRadius: 4, color: active ? 'var(--ink)' : 'var(--ink-soft)',
    fontSize: 13, fontWeight: 500,
    background: active ? 'var(--surface)' : 'transparent',
    border: active ? '1px solid var(--rule-soft)' : '1px solid transparent',
    boxShadow: active ? '0 1px 0 rgba(120,90,40,.05)' : 'none', cursor: 'pointer',
  }}
    onMouseEnter=${(e) => { if (!active) e.currentTarget.style.background = 'rgba(120,90,40,.08)'; }}
    onMouseLeave=${(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
    ${icon && html`<${Icon} name=${icon} />`}
    <span style=${{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${label}</span>
    ${count != null && html`<span style=${{ fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? 'var(--burgundy)' : 'var(--ink-faint)' }}>${count}</span>`}
  </div>`;
}
function codexCount(_campaign) {
  // Live from the store so the sidebar reflects post-summarize auto-extract.
  const count = (store.codexEntries || []).length;
  const hasFreeform = !!(_campaign?.codex || '').trim();
  if (count > 0) return count;
  return hasFreeform ? '●' : null;
}

function NavHead({ children }) {
  return html`<div style=${{ padding: '14px 8px 4px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>${children}</div>`;
}

export function Sidebar({ variant = 'library', active, campaign }) {
  const ollamaReady = (store.llmProviders || []).some((p) => p.id === 'ollama');
  return html`<aside style=${{
    background: 'var(--paper-deep)', borderRight: '1px solid var(--rule)',
    padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2,
    width: 220, flex: '0 0 220px',
  }}>
    <div style=${{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 14px', borderBottom: '1px solid var(--rule-soft)', marginBottom: 4, cursor: 'pointer' }}
      onClick=${() => navigate('library')}>
      <${BrandMark} size=${30} />
      <div style=${{ lineHeight: 1.15 }}>
        <div style=${{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>Chronicle Keeper</div>
        <div style=${{ fontSize: 10, fontWeight: 500, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>v0.4 · local</div>
      </div>
    </div>

    ${variant === 'library' ? html`
      <${NavHead}>Library</${NavHead}>
      <${NavItem} icon="book" label="Campaigns" active=${active === 'campaigns'} onClick=${() => navigate('library')} />
      <${NavHead}>Workshop</${NavHead}>
      <${NavItem} icon="folder" label="Sources" active=${active === 'sources'} onClick=${() => navigate('sources')} />
      <${NavItem} icon="cog" label="Settings" active=${active === 'settings'} onClick=${() => navigate('settings')} />
    ` : html`
      <${NavHead}>Library</${NavHead}>
      <${NavItem} icon="chev-l" label="All campaigns" onClick=${() => navigate('library')} />
      <div style=${{ margin: '10px 4px 6px', padding: '10px', background: 'var(--surface)', border: '1px solid var(--rule-soft)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <${Sigil} ch=${campaign?.sigil || '?'} tone=${campaign?.tone || 'burgundy'} />
        <div style=${{ lineHeight: 1.2, minWidth: 0 }}>
          <div style=${{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${campaign?.name || 'Campaign'}</div>
          <div style=${{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>${campaign?.system || '—'}</div>
        </div>
      </div>
      <${NavItem} icon="compass" label="Overview" active=${active === 'overview'} onClick=${() => navigate('campaign', { id: campaign?.campaign_id })} />
      <${NavItem} icon="book" label="Codex" count=${codexCount(campaign)} active=${active === 'codex'} onClick=${() => navigate('codex', { id: campaign?.campaign_id })} />
      <${NavHead}>Workshop</${NavHead}>
      <${NavItem} icon="folder" label="Sources" active=${active === 'sources'} onClick=${() => navigate('sources')} />
      <${NavItem} icon="cog" label="Settings" active=${active === 'settings'} onClick=${() => navigate('settings')} />
    `}

    <div style=${{ flex: 1 }} />
    <div style=${{ margin: '8px 4px 0', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--rule-soft)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink-muted)' }}>
      <span style=${{ width: 8, height: 8, borderRadius: '50%', background: 'var(--moss)', boxShadow: '0 0 0 2px var(--moss-50)', flex: '0 0 auto' }} />
      <div style=${{ lineHeight: 1.3 }}>
        <div style=${{ color: 'var(--ink-soft)', fontWeight: 500 }}>Local · on-device</div>
        <div>Parakeet ready${ollamaReady ? ' · Ollama' : ''}</div>
      </div>
    </div>
  </aside>`;
}

export function Topbar({ crumbs = [], right }) {
  return html`<div style=${{
    padding: '0 24px', borderBottom: '1px solid var(--rule-soft)',
    display: 'flex', alignItems: 'center', gap: 12, background: 'var(--paper)',
    flex: '0 0 auto', height: 52,
  }}>
    <div style=${{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-muted)' }}>
      ${crumbs.map((c, i) => html`
        ${i > 0 && html`<span style=${{ color: 'var(--ink-faint)' }}>›</span>`}
        <span style=${{ color: i === crumbs.length - 1 ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: i === crumbs.length - 1 ? 500 : 400 }}>${c}</span>
      `)}
    </div>
    <div style=${{ flex: 1 }} />
    ${right}
  </div>`;
}

export function Shell({ sidebar, topbar, children, bodyStyle = {} }) {
  return html`<div class="ck" style=${{ display: 'flex', width: '100%', height: '100%', background: 'var(--paper)' }}>
    ${sidebar}
    <main style=${{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      ${topbar}
      <div style=${{ flex: 1, overflow: 'auto', padding: '24px 28px', ...bodyStyle }}>${children}</div>
    </main>
  </div>`;
}
