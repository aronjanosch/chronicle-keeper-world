// Overlay forms: campaign editor, session editor, transcribe, export, provider, viewer.
import { html, useState, useEffect } from '../vendor/htm-preact-standalone.mjs';
import { store, closeModal, setOp } from './core.js';
import { Icon, Btn, Field, Input, Textarea, Spinner } from './ui.js';
import {
  createCampaign, updateCampaign, saveSessionMetadata, loadSession,
  loadTranscriptionProviders, runTranscribe, runExport,
  loadLlmProviders, saveLlmProvider, testLlmProvider,
} from './actions.js';

function ModalShell({ title, children, footer, wide }) {
  return html`<div class="ck-backdrop" onClick=${(e) => { if (e.target === e.currentTarget) closeModal(); }}>
    <div class="ck" style=${{ width: wide ? 720 : 480, maxWidth: '100%', maxHeight: '88vh', background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 12, boxShadow: 'var(--shadow-raised)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style=${{ padding: '16px 20px', borderBottom: '1px solid var(--rule-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style=${{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--ink)', flex: 1 }}>${title}</h3>
        <${Btn} kind="ghost" size="sm" icon="x" onClick=${closeModal} />
      </div>
      <div style=${{ padding: '18px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>${children}</div>
      ${footer && html`<div style=${{ padding: '14px 20px', borderTop: '1px solid var(--rule-soft)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>${footer}</div>`}
    </div>
  </div>`;
}

// ── Campaign create / edit ────────────────────────────────────────
function PlayerRows({ players, onChange }) {
  const upd = (i, k, v) => onChange(players.map((p, j) => j === i ? { ...p, [k]: v } : p));
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    ${players.map((p, i) => html`<div key=${i} style=${{ display: 'flex', gap: 6 }}>
      <${Input} value=${p.player_name} placeholder="Player" onInput=${(v) => upd(i, 'player_name', v)} />
      <${Input} value=${p.character_name} placeholder="Character" onInput=${(v) => upd(i, 'character_name', v)} />
      <${Btn} kind="ghost" size="sm" icon="x" onClick=${() => onChange(players.filter((_, j) => j !== i))} />
    </div>`)}
    <${Btn} kind="ghost" size="sm" icon="plus" onClick=${() => onChange([...players, { player_name: '', character_name: '' }])}>Add player</${Btn}>
  </div>`;
}

function CampaignModal({ edit }) {
  const [f, setF] = useState(() => edit ? {
    name: edit.name || '', system: edit.system || '', setting: edit.setting || '',
    default_language: edit.default_language || '', gm: edit.gm || '',
    players: edit.players?.length ? edit.players : [], extra_info: edit.extra_info || '', codex: edit.codex || '', start: edit.next_session_number || 1,
  } : { name: '', system: '', setting: '', default_language: '', gm: '', players: [{ player_name: '', character_name: '' }], extra_info: '', codex: '', start: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim()) { setErr('Name is required'); return; }
    setBusy(true); setErr(null);
    const players = f.players.filter((p) => p.player_name.trim() || p.character_name.trim());
    try {
      if (edit) await updateCampaign({ name: f.name.trim(), system: f.system.trim(), setting: f.setting.trim(), default_language: f.default_language.trim(), gm: f.gm.trim(), players, extra_info: f.extra_info.trim(), codex: f.codex.trim() });
      else await createCampaign({ ...f, name: f.name.trim(), players });
      closeModal();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return html`<${ModalShell} title=${edit ? 'Edit campaign' : 'New campaign'} footer=${html`
    <${Btn} kind="ghost" onClick=${closeModal}>Cancel</${Btn}>
    <${Btn} kind="primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : (edit ? 'Save changes' : 'Create campaign')}</${Btn}>`}>
    ${err && html`<div style=${{ color: 'var(--burgundy-700)', fontSize: 13 }}>${err}</div>`}
    <${Field} label="Campaign name"><${Input} value=${f.name} onInput=${(v) => set('name', v)} placeholder="The Iron Crown" /></${Field}>
    <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <${Field} label="System"><${Input} value=${f.system} onInput=${(v) => set('system', v)} placeholder="D&D 5e" /></${Field}>
      <${Field} label="Setting"><${Input} value=${f.setting} onInput=${(v) => set('setting', v)} placeholder="Forgotten Realms" /></${Field}>
      <${Field} label="GM / DM"><${Input} value=${f.gm} onInput=${(v) => set('gm', v)} /></${Field}>
      <${Field} label="Default language"><${Input} value=${f.default_language} onInput=${(v) => set('default_language', v)} placeholder="en" mono /></${Field}>
    </div>
    ${!edit && html`<${Field} label="Start session #" hint="First session number for this campaign."><${Input} type="number" value=${f.start} onInput=${(v) => set('start', v)} style=${{ width: 120 }} /></${Field}>`}
    <${Field} label="Players"><${PlayerRows} players=${f.players} onChange=${(p) => set('players', p)} /></${Field}>
    <${Field} label="Additional information" hint="World frame or special campaign notes."><${Textarea} value=${f.extra_info} onInput=${(v) => set('extra_info', v)} rows=${3} /></${Field}>
    <${Field} label="Codex — known names & lore" hint="NPCs, places, factions, items; spell them right. Fed to the summarizer so it recognises and corrects them. Paste however you keep them."><${Textarea} value=${f.codex} onInput=${(v) => set('codex', v)} rows=${6} /></${Field}>
  </${ModalShell}>`;
}

// ── Session metadata edit ─────────────────────────────────────────
function SessionModal({ session }) {
  const cam = session.campaign || {};
  const md = session.metadata || {};
  const [f, setF] = useState({
    title: cam.title || '', date: cam.date || '', number: cam.session_number || '', notes: cam.notes || '',
    characters: (md.characters || []).join(', '), locations: (md.locations || []).join(', '),
    items: (md.items || []).join(', '), tags: (md.tags || []).join(', '),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const split = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true); setErr(null);
    try {
      await saveSessionMetadata({
        session_id: session.session_id, campaign_id: cam.campaign_id || null,
        session_number: Number(f.number) || null, title: f.title.trim() || null, date: f.date || null,
        metadata: { characters: split(f.characters), locations: split(f.locations), events: md.events || [], items: split(f.items), tags: split(f.tags) },
        notes: f.notes.trim() || null,
      });
      await loadSession(session.session_id);
      closeModal();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return html`<${ModalShell} title="Edit session" footer=${html`
    <${Btn} kind="ghost" onClick=${closeModal}>Cancel</${Btn}>
    <${Btn} kind="primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save'}</${Btn}>`}>
    ${err && html`<div style=${{ color: 'var(--burgundy-700)', fontSize: 13 }}>${err}</div>`}
    <${Field} label="Title"><${Input} value=${f.title} onInput=${(v) => set('title', v)} /></${Field}>
    <div style=${{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
      <${Field} label="Date"><${Input} type="date" value=${f.date} onInput=${(v) => set('date', v)} /></${Field}>
      <${Field} label="Session #"><${Input} type="number" value=${f.number} onInput=${(v) => set('number', v)} mono /></${Field}>
    </div>
    <${Field} label="Notes"><${Textarea} value=${f.notes} onInput=${(v) => set('notes', v)} rows=${3} /></${Field}>
    <${Field} label="Characters" hint="Comma-separated."><${Input} value=${f.characters} onInput=${(v) => set('characters', v)} /></${Field}>
    <${Field} label="Locations" hint="Comma-separated."><${Input} value=${f.locations} onInput=${(v) => set('locations', v)} /></${Field}>
    <${Field} label="Items" hint="Comma-separated."><${Input} value=${f.items} onInput=${(v) => set('items', v)} /></${Field}>
    <${Field} label="Tags" hint="Comma-separated."><${Input} value=${f.tags} onInput=${(v) => set('tags', v)} /></${Field}>
  </${ModalShell}>`;
}

// ── Transcribe ────────────────────────────────────────────────────
function TranscribeModal() {
  const [providers, setProviders] = useState(null);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [language, setLanguage] = useState(store.config?.default_language || '');

  useEffect(() => {
    (async () => {
      const list = await loadTranscriptionProviders();
      setProviders(list);
      const cfg = store.config || {};
      const want = cfg.transcription_provider && cfg.transcription_provider !== 'auto' ? cfg.transcription_provider : (list[0]?.name || 'sherpa');
      const p = list.find((x) => x.name === want) || list[0];
      if (p) { setProvider(p.name); setModel(cfg.whisperx_model && p.models.some((m) => m.id === cfg.whisperx_model) ? cfg.whisperx_model : p.default_model); }
    })();
  }, []);

  const current = (providers || []).find((p) => p.name === provider);
  function run() { closeModal(); runTranscribe({ provider, model, language: language.trim() }); }

  return html`<${ModalShell} title="Transcribe session" footer=${html`
    <${Btn} kind="ghost" onClick=${closeModal}>Cancel</${Btn}>
    <${Btn} kind="primary" icon="mic" disabled=${!providers} onClick=${run}>Run</${Btn}>`}>
    ${!providers ? html`<div style=${{ display: 'flex', justifyContent: 'center', padding: 20 }}><${Spinner} /></div>` : html`
      <div style=${{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Transcription runs on-device. The first run downloads the model once.</div>
      <${Field} label="Engine">
        <select value=${provider} onChange=${(e) => { setProvider(e.target.value); const p = providers.find((x) => x.name === e.target.value); if (p) setModel(p.default_model); }} style=${{ width: '100%', padding: '7px 10px', background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
          ${providers.map((p) => html`<option key=${p.name} value=${p.name}>${p.display_name}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Model">
        <select value=${model} onChange=${(e) => setModel(e.target.value)} style=${{ width: '100%', padding: '7px 10px', background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
          ${(current?.models || []).map((m) => html`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Language" hint="Defaults from Settings if left empty."><${Input} value=${language} onInput=${setLanguage} placeholder="en, de, …" /></${Field}>
    `}
  </${ModalShell}>`;
}

// ── Export ────────────────────────────────────────────────────────
function ExportModal() {
  const summaries = store.summaries;
  const [id, setId] = useState(summaries[0]?.id || null);
  function run() { closeModal(); runExport(Number(id)); }
  return html`<${ModalShell} title="Export session" footer=${html`
    <${Btn} kind="ghost" onClick=${closeModal}>Cancel</${Btn}>
    <${Btn} kind="primary" icon="export" disabled=${!summaries.length} onClick=${run}>Export markdown</${Btn}>`}>
    <${Field} label="Summary" hint="Exported as Obsidian-flavoured markdown.">
      <select value=${id} onChange=${(e) => setId(e.target.value)} style=${{ width: '100%', padding: '7px 10px', background: 'var(--surface-raised)', border: '1px solid var(--rule)', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
        ${summaries.map((s) => html`<option key=${s.id} value=${s.id}>${s.provider} / ${s.model}</option>`)}
      </select>
    </${Field}>
  </${ModalShell}>`;
}

// ── LLM provider config ───────────────────────────────────────────
function ProviderModal({ id }) {
  const p = (store.llmProviders || []).find((x) => x.id === id);
  const [model, setModel] = useState(p?.saved_model || p?.default_model || '');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState(null);
  if (!p) { closeModal(); return null; }

  async function save() {
    setStatus({ msg: 'Saving…' });
    try { await saveLlmProvider(id, { api_key: apiKey.trim() || null, api_base: apiBase.trim() || null, default_model: model.trim() || null }); setApiKey(''); setStatus({ msg: 'Saved', ok: true }); }
    catch (e) { setStatus({ msg: e.message, ok: false }); }
  }
  async function test() {
    setStatus({ msg: 'Testing…' });
    try { const r = await testLlmProvider(id, model.trim()); setStatus({ msg: r.ok ? `OK (${r.latency_ms}ms)` : (r.error || 'Failed'), ok: r.ok }); }
    catch (e) { setStatus({ msg: e.message, ok: false }); }
  }

  return html`<${ModalShell} title=${`Configure ${p.name}`} footer=${html`
    <span style=${{ flex: 1, fontSize: 12.5, color: status?.ok === false ? 'var(--burgundy-700)' : 'var(--moss)' }}>${status?.msg || ''}</span>
    <${Btn} kind="ghost" onClick=${test}>Test</${Btn}>
    <${Btn} kind="primary" onClick=${save}>Save</${Btn}>`}>
    <${Field} label="Default model" hint=${p.id === 'ollama' ? 'Must match a model pulled in Ollama.' : 'Pick a suggestion or type any model name.'}>
      <${Input} value=${model} onInput=${setModel} mono list="ck-prov-models" />
      <datalist id="ck-prov-models">${(p.models || []).map((m, i) => html`<option key=${i} value=${m} />`)}</datalist>
    </${Field}>
    <${Field} label=${`API base${p.default_api_base ? '' : ' (optional)'}`}><${Input} value=${apiBase} onInput=${setApiBase} placeholder=${p.default_api_base ? `Default: ${p.default_api_base}` : 'Provider default'} mono /></${Field}>
    ${p.needs_key && html`<${Field} label=${`API key${p.has_key ? ' (saved — enter to replace)' : ''}`}><${Input} type="password" value=${apiKey} onInput=${setApiKey} placeholder=${p.has_key ? '••••••••' : 'Paste API key'} autocomplete="off" /></${Field}>`}
  </${ModalShell}>`;
}

// ── Content viewer ────────────────────────────────────────────────
function ViewerModal({ title, text }) {
  return html`<${ModalShell} wide title=${title} footer=${html`<${Btn} kind="secondary" onClick=${closeModal}>Close</${Btn}>`}>
    <pre class="ck-pre">${text}</pre>
  </${ModalShell}>`;
}

// ── Host ──────────────────────────────────────────────────────────
export function ModalHost({ modal }) {
  if (!modal) return null;
  switch (modal.kind) {
    case 'campaign': return html`<${CampaignModal} ...${modal.props} />`;
    case 'session': return html`<${SessionModal} ...${modal.props} />`;
    case 'transcribe': return html`<${TranscribeModal} />`;
    case 'export': return html`<${ExportModal} />`;
    case 'provider': return html`<${ProviderModal} ...${modal.props} />`;
    case 'viewer': return html`<${ViewerModal} ...${modal.props} />`;
    default: return null;
  }
}
