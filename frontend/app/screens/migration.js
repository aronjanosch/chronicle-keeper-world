// Migration screen — shown on startup when unmigrated sessions are detected.
// Prompts the user to migrate to the 1.0 files-as-truth world format.
import { html, useState } from '../../vendor/htm-preact-standalone.mjs';
import { runMigration } from '../actions.js';
import { BrandMark, Icon, Btn, Spinner } from '../ui.js';

function ResultView({ result, onDone }) {
  if (!result) return null;
  const hasErrors = result.errors && result.errors.length > 0;
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style=${{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px 20px',
      background: result.ok ? 'var(--moss-50)' : '#FBEDE9',
      border: `1px solid ${result.ok ? 'rgba(74,93,58,.3)' : 'rgba(122,46,31,.25)'}`,
      borderRadius: 8,
    }}>
      <${Icon} name=${result.ok ? 'check' : 'x'} size=${18} />
      <div>
        <div style=${{ fontWeight: 600, color: result.ok ? 'var(--moss)' : 'var(--burgundy-700)' }}>
          ${result.ok ? 'Migration complete' : 'Migration finished with errors'}
        </div>
        <div style=${{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>
          ${result.campaigns_migrated} world${result.campaigns_migrated === 1 ? '' : 's'} ·
          ${result.sessions_migrated} session${result.sessions_migrated === 1 ? '' : 's'} copied
          ${result.sessions_skipped > 0 ? ` · ${result.sessions_skipped} skipped (no campaign or number)` : ''}
        </div>
      </div>
    </div>
    ${hasErrors && html`<div style=${{ fontSize: 12.5, color: 'var(--burgundy-700)', background: '#FDF3F0', border: '1px solid rgba(122,46,31,.15)', borderRadius: 6, padding: '10px 14px', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
      ${result.errors.map((e, i) => html`<div key=${i}>${e}</div>`)}
    </div>`}
    <${Btn} kind="primary" onClick=${onDone}>Open Library</${Btn}>
  </div>`;
}

export function MigrationScreen({ store, onSkip }) {
  const [err, setErr] = useState(null);
  const status = store.migrationStatus;
  const result = store.migrationResult;
  const running = store.migrationRunning;
  const campaigns = status?.campaigns || [];

  async function migrate() {
    setErr(null);
    try { await runMigration(); }
    catch (e) { setErr(e.message); }
  }

  return html`<div style=${{
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--paper)', padding: 24,
  }}>
    <div style=${{ width: '100%', maxWidth: 480 }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <${BrandMark} size=${34} />
        <div>
          <div style=${{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>Chronicle Keeper</div>
          <div style=${{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>World format update</div>
        </div>
      </div>

      ${result ? html`<${ResultView} result=${result} onDone=${onSkip} />` : html`
        <div style=${{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style=${{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ink)', marginBottom: 8 }}>
              Update your worlds
            </h2>
            <p style=${{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>
              Chronicles now live in portable folders — one folder per world,
              files you own. Sessions move into
              <code style=${{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--paper-deep)', padding: '1px 5px', borderRadius: 3 }}>Sessions/</code>
              alongside their audio. Your recordings are <strong>copied</strong>, never deleted —
              the old library stays untouched.
            </p>
          </div>

          <div style=${{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
            <div style=${{ padding: '10px 16px', borderBottom: '1px solid var(--rule-soft)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              ${campaigns.length} world${campaigns.length === 1 ? '' : 's'} to migrate
            </div>
            <div style=${{ padding: '6px 0' }}>
              ${campaigns.map((c) => html`<div key=${c.campaign_id} style=${{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
              }}>
                <${Icon} name="globe" size=${13} className="ck-ink-muted" />
                <span style=${{ flex: 1, fontSize: 13.5, color: 'var(--ink)' }}>${c.name}</span>
                <span style=${{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>
                  ${c.session_count} session${c.session_count === 1 ? '' : 's'}
                </span>
              </div>`)}
            </div>
            ${status?.skipped_sessions > 0 && html`<div style=${{ padding: '8px 16px', borderTop: '1px solid var(--rule-soft)', fontSize: 12, color: 'var(--ink-faint)' }}>
              ${status.skipped_sessions} session${status.skipped_sessions === 1 ? '' : 's'} without a campaign or number will be skipped
            </div>`}
          </div>

          ${err && html`<div style=${{ color: 'var(--burgundy-700)', fontSize: 13, padding: '10px 14px', background: '#FBEDE9', borderRadius: 6 }}>${err}</div>`}

          ${running ? html`<div style=${{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', color: 'var(--ink-muted)', fontSize: 13.5 }}>
            <${Spinner} size=${18} />
            <span>Migrating — copying audio and writing session files…</span>
          </div>` : html`<div style=${{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <${Btn} kind="ghost" disabled=${running} onClick=${onSkip}>Skip for now</${Btn}>
            <${Btn} kind="primary" disabled=${running} onClick=${migrate}>Migrate worlds</${Btn}>
          </div>`}
        </div>
      `}
    </div>
  </div>`;
}
