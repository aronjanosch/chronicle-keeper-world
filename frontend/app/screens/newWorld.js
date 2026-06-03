// Screen — New World (Phase 1.7-C). Explicit full-screen flow replacing the
// campaign create modal. The modal stays for Edit world.
import { html, useState } from '../../vendor/htm-preact-standalone.mjs';
import { navigate } from '../core.js';
import { createCampaign, pickVaultFolder } from '../actions.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Icon, Btn, Field, Input, Textarea, Select } from '../ui.js';

const PRONOUNS = ['she/her', 'he/him', 'they/them'];
const SCAFFOLD_FOLDERS = ['NPCs', 'Places', 'Factions', 'Items', 'Lore'];

function PronounSelect({ value, onChange }) {
  return html`<select value=${value || ''} onChange=${(e) => onChange(e.target.value)}
    style=${{ flex: '0 0 116px', padding: '7px 10px', background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', cursor: 'pointer' }}>
    <option value="">pronouns</option>
    ${PRONOUNS.map((p) => html`<option key=${p} value=${p}>${p}</option>`)}
  </select>`;
}

function PlayerRows({ players, onChange }) {
  const upd = (i, k, v) => onChange(players.map((p, j) => j === i ? { ...p, [k]: v } : p));
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    ${players.map((p, i) => html`<div key=${i} style=${{ display: 'flex', gap: 6 }}>
      <${Input} value=${p.player_name} placeholder="Player" onInput=${(v) => upd(i, 'player_name', v)} />
      <${Input} value=${p.character_name} placeholder="Character" onInput=${(v) => upd(i, 'character_name', v)} />
      <${PronounSelect} value=${p.pronouns} onChange=${(v) => upd(i, 'pronouns', v)} />
      <${Btn} kind="ghost" size="sm" icon="x" onClick=${() => onChange(players.filter((_, j) => j !== i))} />
    </div>`)}
    <${Btn} kind="ghost" size="sm" icon="plus" onClick=${() => onChange([...players, { player_name: '', character_name: '', pronouns: '' }])}>Add player</${Btn}>
  </div>`;
}

function VaultPreview({ name, scaffold, worldPath }) {
  const rootName = worldPath
    ? (worldPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || worldPath)
    : (name.trim() || 'My World');
  const tree = [
    { indent: 0, label: rootName, icon: '📁' },
    { indent: 1, label: 'Codex', icon: '📁' },
    ...(scaffold ? SCAFFOLD_FOLDERS.map((f) => ({ indent: 2, label: f, icon: '📁' })) : []),
    { indent: 1, label: 'Sessions', icon: '📁' },
    { indent: 1, label: '.ck', icon: '📁' },
  ];
  return html`<div style=${{ background: 'var(--paper-deep)', border: '1px solid var(--rule-soft)', borderRadius: 6, padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
    ${tree.map((row, i) => html`<div key=${i} style=${{ paddingLeft: row.indent * 18 }}>
      ${row.icon} ${row.label}
    </div>`)}
  </div>`;
}

function Card({ title, children }) {
  return html`<div style=${{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
    <div style=${{ padding: '14px 20px 12px', borderBottom: '1px solid var(--rule-soft)' }}>
      <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>${title}</h3>
    </div>
    <div style=${{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>${children}</div>
  </div>`;
}

function Radio({ checked, onChange, label, description }) {
  return html`<label style=${{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
    <input type="radio" checked=${checked} onChange=${onChange}
      style=${{ marginTop: 3, cursor: 'pointer', accentColor: 'var(--burgundy)' }} />
    <div>
      <div style=${{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>${label}</div>
      ${description && html`<div style=${{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>${description}</div>`}
    </div>
  </label>`;
}

export function NewWorldScreen() {
  const [f, setF] = useState({
    name: '', system: '', setting: '', gm: '', gm_pronouns: '',
    default_language: '', extra_info: '', start: 1,
    players: [{ player_name: '', character_name: '', pronouns: '' }],
    mode: 'fresh',
    world_path: '',
    scaffold: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function chooseFolder() {
    const picked = await pickVaultFolder();
    if (picked) {
      set('world_path', picked);
    } else {
      const typed = window.prompt('Enter world folder path:');
      if (typed?.trim()) set('world_path', typed.trim());
    }
  }

  async function submit() {
    if (!f.name.trim()) { setErr('World name is required'); return; }
    if (f.mode === 'existing' && !f.world_path.trim()) { setErr('Choose an existing folder first'); return; }
    setBusy(true); setErr(null);
    const players = f.players.filter((p) => p.player_name.trim() || p.character_name.trim());
    try {
      await createCampaign({
        ...f,
        name: f.name.trim(),
        players,
        vault_path: f.world_path.trim() || null,
        scaffold: f.mode === 'fresh' && f.scaffold,
      });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return html`<${Shell}
    sidebar=${html`<${Sidebar} variant="library" active="worlds" />`}
    topbar=${html`<${Topbar} crumbs=${[{ label: 'Worlds', onClick: () => navigate('library') }, 'New world']} />`}
  >
    <div style=${{ maxWidth: 680, margin: '0 auto' }}>
      <div style=${{ marginBottom: 20 }}>
        <h1 style=${{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)' }}>New world</h1>
        <div style=${{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 4, fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>Name the world, the system, the setting, the company that will tell it.</div>
      </div>

      ${err && html`<div style=${{ color: 'var(--burgundy-700)', fontSize: 13, padding: '10px 14px', background: '#FBEDE9', borderRadius: 6, marginBottom: 12 }}>${err}</div>`}

      <${Card} title="Identity">
        <${Field} label="World name"><${Input} value=${f.name} onInput=${(v) => set('name', v)} placeholder="The Iron Crown" /></${Field}>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <${Field} label="System"><${Input} value=${f.system} onInput=${(v) => set('system', v)} placeholder="D&D 5e" /></${Field}>
          <${Field} label="Setting"><${Input} value=${f.setting} onInput=${(v) => set('setting', v)} placeholder="Forgotten Realms" /></${Field}>
          <${Field} label="GM / DM"><div style=${{ display: 'flex', gap: 6 }}>
            <${Input} value=${f.gm} onInput=${(v) => set('gm', v)} />
            <${PronounSelect} value=${f.gm_pronouns} onChange=${(v) => set('gm_pronouns', v)} />
          </div></${Field}>
          <${Field} label="Default language"><${Input} value=${f.default_language} onInput=${(v) => set('default_language', v)} placeholder="en" mono /></${Field}>
        </div>
        <${Field} label="Start session #" hint="First session number for this world.">
          <${Input} type="number" value=${f.start} onInput=${(v) => set('start', v)} style=${{ width: 120 }} />
        </${Field}>
        <${Field} label="Players"><${PlayerRows} players=${f.players} onChange=${(p) => set('players', p)} /></${Field}>
        <${Field} label="Additional information" hint="World frame, house rules, or special notes.">
          <${Textarea} value=${f.extra_info} onInput=${(v) => set('extra_info', v)} rows=${2} />
        </${Field}>
      </${Card}>

      <${Card} title="Where it lives">
        <div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <${Radio}
            checked=${f.mode === 'fresh'}
            onChange=${() => set('mode', 'fresh')}
            label="Create a fresh vault"
            description="Set up a new world folder with an empty Codex." />
          <${Radio}
            checked=${f.mode === 'existing'}
            onChange=${() => set('mode', 'existing')}
            label="Open an existing vault"
            description="Adopt a folder that already holds your notes — nothing is overwritten." />
        </div>

        <${Field} label="Folder" hint=${f.mode === 'fresh' ? 'Where to create the world folder. Leave empty to use the default location.' : 'Required — pick the existing world folder.'}>
          <div style=${{ display: 'flex', gap: 8 }}>
            <${Input} value=${f.world_path} onInput=${(v) => set('world_path', v)}
              placeholder=${f.mode === 'fresh' ? 'Default location (leave empty)' : 'Pick a folder…'}
              style=${{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }} mono />
            <${Btn} kind="secondary" size="sm" onClick=${chooseFolder}>Choose…</${Btn}>
          </div>
        </${Field}>

        ${f.mode === 'fresh' && html`
          <${Field} label="Starter structure">
            <div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <${Radio}
                checked=${!f.scaffold}
                onChange=${() => set('scaffold', false)}
                label="Empty"
                description="Blank Codex — add folders and pages as you go." />
              <${Radio}
                checked=${f.scaffold}
                onChange=${() => set('scaffold', true)}
                label="Starter folders"
                description="Creates NPCs, Places, Factions, Items, and Lore folders in Codex." />
            </div>
          </${Field}>
        `}
      </${Card}>

      <${Card} title="What gets created">
        <${VaultPreview} name=${f.name} scaffold=${f.mode === 'fresh' && f.scaffold} worldPath=${f.world_path} />
      </${Card}>

      <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingBottom: 24 }}>
        <${Btn} kind="ghost" disabled=${busy} onClick=${() => navigate('library')}>Cancel</${Btn}>
        <${Btn} kind="primary" disabled=${busy} onClick=${submit}>${busy ? 'Creating…' : 'Create world'}</${Btn}>
      </div>
    </div>
  </${Shell}>`;
}
