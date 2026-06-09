// The Timeline (Phase 11): in-world events (pages with `date:` frontmatter,
// parsed + sorted server-side on the world's `[calendar]`) and a real-world
// session lane. Two tabs — the axes are different calendars, so they don't mix.
import { html, useState, useEffect } from '../../vendor/htm-preact-standalone.mjs';
import { navigate, useStore, apiFetch } from '../core.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Icon, Empty } from '../ui.js';
import { refreshCampaignSessions, loadSession } from '../actions.js';
import { iconForKind } from './codex.js';

// Consecutive events of the same era+year share one header.
function groupEvents(events) {
  const groups = [];
  let cur = null;
  for (const ev of events) {
    const key = `${ev.era || ''}·${ev.year}`;
    if (!cur || cur.key !== key) {
      cur = { key, era: ev.era, year: ev.year, items: [] };
      groups.push(cur);
    }
    cur.items.push(ev);
  }
  return groups;
}

function Tab({ active, onClick, icon, children }) {
  return html`<span onClick=${onClick} style=${{
    padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12.5,
    display: 'flex', alignItems: 'center', gap: 6,
    background: active ? 'var(--paper-deep)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: active ? 500 : 400,
  }}><${Icon} name=${icon} size=${12} /> ${children}</span>`;
}

function Rail({ children }) {
  return html`<div style=${{ position: 'relative', paddingLeft: 22, borderLeft: '2px solid var(--rule)', marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>${children}</div>`;
}

function Dot() {
  return html`<span style=${{ position: 'absolute', left: -27, top: 5, width: 8, height: 8, borderRadius: 999, background: 'var(--burgundy)', border: '2px solid var(--paper)' }} />`;
}

function WorldLane({ events }) {
  if (!events.length) {
    return html`<${Empty} icon="time" title="No dated pages yet">
      Give any page a <code>date:</code> frontmatter field (<code>1374-08-12 DR</code> style —
      year, optional month/day, optional era) and it appears here. The <b>event</b> kind
      carries the field by default; month and era names come from <code>[calendar]</code>
      in <code>.ck/config.toml</code>.
    </${Empty}>`;
  }
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 22 }}>
    ${groupEvents(events).map((g) => html`<div key=${g.key}>
      <div style=${{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)', marginBottom: 10 }}>
        ${g.year}${g.era ? ` ${g.era}` : ''}
      </div>
      <${Rail}>
        ${g.items.map((ev) => html`<div key=${ev.path} style=${{ position: 'relative' }}>
          <${Dot} />
          <div style=${{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>${ev.display}</div>
          <div onClick=${() => navigate('page', { path: ev.path })}
            style=${{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginTop: 2 }}>
            <${Icon} name=${iconForKind(ev.kind)} size=${13} className="ck-ink-muted" />
            <span style=${{ fontSize: 14.5, fontWeight: 500, color: 'var(--burgundy)' }}>${ev.title}</span>
          </div>
          ${ev.summary && html`<div style=${{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 3, maxWidth: 560 }}>${ev.summary}</div>`}
        </div>`)}
      </${Rail}>
    </div>`)}
  </div>`;
}

function SessionLane({ sessions }) {
  if (!sessions.length) {
    return html`<${Empty} icon="mic" title="No sessions yet">Recorded sessions plot here by their real-world date.</${Empty}>`;
  }
  return html`<${Rail}>
    ${sessions.map((s) => html`<div key=${s.session_id} style=${{ position: 'relative' }}>
      <${Dot} />
      <div style=${{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
        ${s.date || 'no date'} · session ${String(s.session_number || 0).padStart(2, '0')}
      </div>
      <div onClick=${() => loadSession(s.session_id)} style=${{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginTop: 2 }}>
        <${Icon} name="mic" size=${13} className="ck-ink-muted" />
        <span style=${{ fontSize: 14.5, fontWeight: 500, color: 'var(--burgundy)' }}>
          ${s.title || 'Untitled session'}
        </span>
      </div>
    </div>`)}
  </${Rail}>`;
}

export function TimelineScreen() {
  const store = useStore();
  const c = store.campaign;
  const [tab, setTab] = useState('world');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!c) return;
    setData(null);
    apiFetch(`/campaigns/${c.campaign_id}/timeline`)
      .then(setData)
      .catch(() => setData({ events: [] }));
    if (!(store.campaignSessions || []).length) refreshCampaignSessions();
  }, [c?.campaign_id]);

  if (!c) { navigate('library'); return null; }

  const sessions = [...(store.campaignSessions || [])]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.session_number || 0) - (b.session_number || 0));

  const topbar = html`<${Topbar} crumbs=${[
    { label: 'Worlds', onClick: () => navigate('library') },
    { label: c.name, onClick: () => navigate('campaign', { id: c.campaign_id }) },
    'Timeline',
  ]} right=${html`<div style=${{ display: 'flex', gap: 2, padding: 2, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6 }}>
    <${Tab} icon="globe" active=${tab === 'world'} onClick=${() => setTab('world')}>World</${Tab}>
    <${Tab} icon="mic" active=${tab === 'sessions'} onClick=${() => setTab('sessions')}>Sessions</${Tab}>
  </div>`} />`;

  return html`<${Shell} sidebar=${html`<${Sidebar} variant="campaign" active="timeline" campaign=${c} />`}
    topbar=${topbar} bodyStyle=${{ padding: '30px 36px' }}>
    <div style=${{ maxWidth: 760, margin: '0 auto' }}>
      ${data === null
        ? html`<div style=${{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>Loading…</div>`
        : tab === 'world'
          ? html`<${WorldLane} events=${data.events || []} />`
          : html`<${SessionLane} sessions=${sessions} />`}
    </div>
  </${Shell}>`;
}
