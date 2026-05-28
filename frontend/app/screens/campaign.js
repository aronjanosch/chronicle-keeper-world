// Screen 02 — Campaign Overview. Hero + party + codex teaser + sessions list.
import { html } from '../../vendor/htm-preact-standalone.mjs';
import { navigate, openModal, fmtDate, toneFor } from '../core.js';
import { loadSession } from '../actions.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Icon, Sigil, Btn, StagePill, Empty } from '../ui.js';

function PartyMember({ player, onClick }) {
  const ch = player.character_name || '—';
  return html`<div style=${{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--rule-soft)', borderRadius: 6 }}>
    <${Sigil} ch=${(ch[0] || '?').toUpperCase()} tone=${toneFor(player.player_name || ch)} size="lg" />
    <div style=${{ flex: 1, minWidth: 0 }}>
      <div style=${{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${ch}</div>
      <div style=${{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>${player.player_name || '—'}</div>
    </div>
  </div>`;
}

function SessionRow({ s, onClick }) {
  const stages = [
    { stage: 'upload', complete: !!s.has_transcription, current: !s.has_transcription },
    { stage: 'transcribe', complete: !!s.has_transcription, current: s.has_transcription && !s.has_summary },
    { stage: 'summarize', complete: !!s.has_summary, current: s.has_summary },
    { stage: 'export' },
  ];
  return html`<div onClick=${onClick} style=${{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderBottom: '1px solid var(--rule-soft)', cursor: 'pointer' }}
    onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--paper)'; }}
    onMouseLeave=${(e) => { e.currentTarget.style.background = 'transparent'; }}>
    <div style=${{ width: 38, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
      <div style=${{ fontSize: 16, color: 'var(--ink)', fontWeight: 500 }}>${String(s.session_number || 0).padStart(2, '0')}</div>
      <div style=${{ marginTop: -2 }}>session</div>
    </div>
    <div style=${{ width: 1, height: 36, background: 'var(--rule-soft)' }} />
    <div style=${{ flex: 1, minWidth: 0 }}>
      <div style=${{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        ${s.title || html`<span style=${{ fontStyle: 'italic', color: 'var(--ink-muted)' }}>Untitled session</span>`}
      </div>
      <div style=${{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
        <span style=${{ display: 'flex', alignItems: 'center', gap: 4 }}><${Icon} name="cal" size=${11} /> ${fmtDate(s.date) || 'no date'}</span>
      </div>
    </div>
    <div style=${{ display: 'flex', gap: 5 }}>${stages.map((st, i) => html`<${StagePill} key=${i} ...${st} />`)}</div>
    <${Icon} name="chev-r" size=${14} className="ck-ink-muted" />
  </div>`;
}

function Stat({ value, label, italic }) {
  return html`<div>
    <div style=${{ fontFamily: italic ? 'var(--font-display)' : 'var(--font-mono)', fontStyle: italic ? 'italic' : 'normal', fontSize: 22, fontWeight: 500, color: 'var(--ink)' }}>${value}</div>
    <div style=${{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginTop: -2 }}>${label}</div>
  </div>`;
}

export function CampaignScreen({ store }) {
  const c = store.campaign;
  if (!c) return html`<div />`;
  const sessions = store.campaignSessions;
  const players = c.players || [];
  const latest = sessions[0];

  return html`<${Shell}
    sidebar=${html`<${Sidebar} variant="campaign" active="overview" campaign=${c} />`}
    topbar=${html`<${Topbar} crumbs=${['Campaigns', c.name]} right=${html`
      <div style=${{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <${Btn} kind="ghost" icon="edit" onClick=${() => openModal('campaign', { edit: c })}>Edit campaign</${Btn}>
        <${Btn} kind="primary" icon="mic" onClick=${() => navigate('newSession', { id: c.campaign_id })}>New session</${Btn}>
      </div>`} />`}
  >
    <!-- Hero -->
    <div style=${{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, padding: '24px 28px', display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
      <div style=${{ position: 'absolute', top: 0, right: 0, width: 220, height: '100%', background: 'radial-gradient(circle at 100% 0%, rgba(122,46,31,.07), transparent 60%)' }} />
      <${Sigil} ch=${c.sigil} tone=${c.tone} size="xl" />
      <div style=${{ flex: 1 }}>
        <div style=${{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--burgundy)', marginBottom: 4 }}>
          Chronicle${c.system ? ` · ${c.system}` : ''}
        </div>
        <h1 style=${{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)', lineHeight: 1.1 }}>${c.name}</h1>
        <div style=${{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-muted)', marginTop: 6 }}>
          ${[c.setting, c.gm && `GM ${c.gm}`].filter(Boolean).join(' · ') || 'No setting recorded yet'}
        </div>
        <div style=${{ display: 'flex', gap: 22, marginTop: 16 }}>
          <${Stat} value=${sessions.length} label="Sessions" />
          <${Stat} value=${players.length} label="Players" />
          <${Stat} value=${`#${c.next_session_number || 1}`} label="Next session" />
        </div>
      </div>
      ${latest && html`<div style=${{ width: 260, padding: 16, borderRadius: 6, background: 'var(--paper)', border: '1px solid var(--rule-soft)' }}>
        <div style=${{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>Latest session</div>
        <div style=${{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink)', lineHeight: 1.3 }}>
          ${latest.title || 'Untitled'}
        </div>
        <div style=${{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>#${latest.session_number} · ${fmtDate(latest.date) || '—'}</div>
        <div style=${{ height: 1, background: 'var(--rule-soft)', margin: '10px 0' }} />
        <div style=${{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <${StagePill} stage="upload" complete=${!!latest.has_transcription} />
          <${StagePill} stage="transcribe" complete=${!!latest.has_transcription} />
          <${StagePill} stage="summarize" complete=${!!latest.has_summary} />
          <${StagePill} stage="export" current=${!!latest.has_summary} />
        </div>
      </div>`}
    </div>

    <!-- Party + Codex teaser -->
    <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
      <div style=${{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
        <div style=${{ padding: '14px 18px 10px', display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--rule-soft)' }}>
          <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>The Party</h3>
          <span style=${{ fontSize: 12, color: 'var(--ink-muted)' }}>· ${players.length} ${players.length === 1 ? 'soul' : 'souls'}</span>
          <span style=${{ flex: 1 }} />
          <${Btn} kind="ghost" size="sm" icon="plus" onClick=${() => openModal('campaign', { edit: c })}>Add</${Btn}>
        </div>
        <div style=${{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          ${players.length
            ? players.map((p, i) => html`<${PartyMember} key=${i} player=${p} />`)
            : html`<div style=${{ gridColumn: 'span 2' }}><${Empty} icon="users" title="No players yet">Add the company that will tell this story.</${Empty}></div>`}
        </div>
      </div>

      <div style=${{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style=${{ padding: '14px 18px 10px', display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--rule-soft)' }}>
          <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>Codex</h3>
          <span style=${{ fontSize: 12, color: 'var(--ink-muted)' }}>· the LLM's memory</span>
        </div>
        <div style=${{ flex: 1, display: 'flex' }}>
          <${Empty} icon="book" title="Codex — coming soon">
            A read-only window into what the summarizer remembers, built from your Obsidian / Notion / markdown notes. Not yet wired up.
          </${Empty}>
        </div>
      </div>
    </div>

    <!-- Sessions -->
    <div style=${{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
      <div style=${{ padding: '14px 18px 10px', display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--rule-soft)' }}>
        <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>Sessions</h3>
        <span style=${{ fontSize: 12, color: 'var(--ink-muted)' }}>· ${sessions.length} recorded</span>
      </div>
      ${sessions.length
        ? sessions.map((s) => html`<${SessionRow} key=${s.session_id} s=${s} onClick=${() => loadSession(s.session_id)} />`)
        : html`<${Empty} icon="scroll" title="No sessions yet">Upload a Craig recording to begin the first chronicle entry.</${Empty}>`}
    </div>
  </${Shell}>`;
}
