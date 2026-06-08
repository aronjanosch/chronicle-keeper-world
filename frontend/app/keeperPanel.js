// The Keeper docked panel + shared chat surface. The panel is a floating pill
// on every in-world screen; the Keeper screen (screens/keeper.js) reuses the
// exported Transcript/Composer/actions over the same store.keeper state.
// 6.4: structural/shell permission cards, attachments (picker + drag-drop),
// [[ autocomplete in the composer.
import { html, useState, useEffect, useRef } from '../vendor/htm-preact-standalone.mjs';
import { apiFetch, apiJson, apiStream, setOp, setState, store } from './core.js';
import { Icon, Spinner, renderBlockHtml, wikilinkClick } from './ui.js';
import { caretCoords } from './screens/page.js';

// store.keeper = { open, chatId, campaignId, events[], attachments[],
//                  live: {text, tools[], ask}|null, error, mode }

export const MODES = [
  { id: 'read_only', label: 'Read-only' },
  { id: 'ask', label: 'Ask' },
  { id: 'accept_edits', label: 'Accept edits' },
];

const MAX_FILE_BYTES = 256 * 1024;

export function keeperState() {
  const k = store.keeper || { open: false, chatId: null, events: [], live: null, error: null };
  const base = k.attachments ? k : { ...k, attachments: [] };
  return base.mode ? base : { ...base, mode: localStorage.getItem('ck_keeper_mode') || 'ask' };
}

export function patchKeeper(patch) {
  setState({ keeper: { ...keeperState(), ...patch } });
}

async function fetchChatInto(chatId) {
  const cid = store.campaign?.campaign_id;
  if (!cid || !chatId) return;
  const [{ events }, att] = await Promise.all([
    apiFetch(`/campaigns/${cid}/agent/chats/${chatId}`),
    apiFetch(`/campaigns/${cid}/agent/chats/${chatId}/attachments`).catch(() => ({ attachments: [] })),
  ]);
  patchKeeper({ chatId, events, attachments: att.attachments || [], live: null, error: null });
}

export async function openChat(chatId) {
  try { await fetchChatInto(chatId); } catch (e) { patchKeeper({ error: String(e.message || e) }); }
}

async function openPanel() {
  const cid = store.campaign?.campaign_id;
  if (!cid) return;
  // Chats are per-world — a stale chat id from another world must not leak.
  if (keeperState().campaignId !== cid) {
    patchKeeper({ campaignId: cid, chatId: null, events: [], attachments: [], live: null });
  }
  patchKeeper({ open: true, error: null });
  const k = keeperState();
  if (k.chatId) return;
  try {
    const { chats } = await apiFetch(`/campaigns/${cid}/agent/chats`);
    const chat = chats[0] || (await apiJson(`/campaigns/${cid}/agent/chats`, 'POST', {}));
    await fetchChatInto(chat.id);
  } catch (e) {
    patchKeeper({ error: String(e.message || e) });
  }
}

export async function newChat() {
  const cid = store.campaign?.campaign_id;
  if (!cid) return;
  try {
    const chat = await apiJson(`/campaigns/${cid}/agent/chats`, 'POST', {});
    patchKeeper({ chatId: chat.id, events: [], attachments: [], live: null, error: null });
    return chat.id;
  } catch (e) {
    patchKeeper({ error: String(e.message || e) });
  }
}

export async function sendMessage(text) {
  const cid = store.campaign?.campaign_id;
  const k = keeperState();
  if (!cid || !k.chatId || k.live) return;
  const events = [...k.events, { type: 'user', text }];
  patchKeeper({ events, live: { text: '', tools: [] }, error: null });
  try {
    await apiStream(`/campaigns/${cid}/agent/chats/${k.chatId}/messages`, { text, mode: k.mode }, (ev) => {
      const cur = keeperState();
      const live = cur.live || { text: '', tools: [] };
      if (ev.type === 'text_delta') {
        patchKeeper({ live: { ...live, text: live.text + ev.text } });
      } else if (ev.type === 'permission_request') {
        patchKeeper({ live: { ...live, ask: { requestId: ev.request_id, name: ev.name, diff: ev.diff } } });
      } else if (ev.type === 'tool_start') {
        patchKeeper({ live: { ...live, ask: null, tools: [...live.tools, { name: ev.name, args: ev.args_summary, diff: ev.diff, running: true }] } });
      } else if (ev.type === 'tool_result') {
        const tools = live.tools.slice();
        const i = tools.findLastIndex((t) => t.running && t.name === ev.name);
        if (i >= 0) tools[i] = { ...tools[i], running: false, summary: ev.summary, isError: ev.is_error };
        // A tool round means the streamed text so far belongs to a finished
        // assistant turn — fold it into the row list and reset the buffer.
        patchKeeper({ live: { ...live, text: '', tools, ask: null } });
        if (live.text.trim()) {
          patchKeeper({ events: [...keeperState().events, { type: 'assistant', text: live.text }] });
        }
      } else if (ev.type === 'error') {
        patchKeeper({ error: ev.message });
      }
    });
  } catch (e) {
    patchKeeper({ error: String(e.message || e) });
  }
  // Authoritative reload: persisted jsonl is the truth for the transcript.
  try {
    const { events: fresh } = await apiFetch(`/campaigns/${cid}/agent/chats/${keeperState().chatId}`);
    patchKeeper({ events: fresh, live: null });
  } catch (_) {
    patchKeeper({ live: null });
  }
}

export async function abortRun() {
  const cid = store.campaign?.campaign_id;
  const k = keeperState();
  if (!cid || !k.chatId) return;
  try { await apiJson(`/campaigns/${cid}/agent/chats/${k.chatId}/abort`, 'POST', {}); } catch (_) {}
}

export function setMode(mode) {
  localStorage.setItem('ck_keeper_mode', mode);
  patchKeeper({ mode });
}

async function decide(requestId, decision) {
  const cid = store.campaign?.campaign_id;
  const k = keeperState();
  if (!cid || !k.chatId) return;
  if (k.live) patchKeeper({ live: { ...k.live, ask: null } });
  try {
    await apiJson(`/campaigns/${cid}/agent/chats/${k.chatId}/approve`, 'POST', { request_id: requestId, decision });
  } catch (e) {
    patchKeeper({ error: String(e.message || e) });
  }
}

export async function undoLast() {
  const cid = store.campaign?.campaign_id;
  const k = keeperState();
  if (!cid || !k.chatId || k.live) return;
  try {
    const { restored } = await apiJson(`/campaigns/${cid}/agent/chats/${k.chatId}/undo`, 'POST', { scope: 'last' });
    setOp(restored.length ? `Restored ${restored.join(', ')}` : 'Nothing to undo', restored.length ? 'done' : '');
  } catch (e) {
    patchKeeper({ error: String(e.message || e) });
  }
}

// ── attachments ──────────────────────────────────────────────────

async function addRefAttachment(body) {
  const cid = store.campaign?.campaign_id;
  const k = keeperState();
  if (!cid || !k.chatId) return;
  try {
    await apiJson(`/campaigns/${cid}/agent/chats/${k.chatId}/attachments`, 'POST', body);
    const { attachments } = await apiFetch(`/campaigns/${cid}/agent/chats/${k.chatId}/attachments`);
    patchKeeper({ attachments });
  } catch (e) {
    setOp(String(e.message || e), 'error');
  }
}

async function addFileAttachment(file) {
  if (file.size > MAX_FILE_BYTES) { setOp(`${file.name} is too large (max 256 KB).`, 'error'); return; }
  let text;
  try { text = await file.text(); } catch (_) { setOp('Could not read that file.', 'error'); return; }
  if (text.includes('\0')) { setOp('Text files only for now.', 'error'); return; }
  await addRefAttachment({ name: file.name, content: text });
}

async function removeAttachment(id) {
  const cid = store.campaign?.campaign_id;
  const k = keeperState();
  if (!cid || !k.chatId) return;
  try {
    await apiJson(`/campaigns/${cid}/agent/chats/${k.chatId}/attachments/${id}`, 'DELETE', {});
    patchKeeper({ attachments: keeperState().attachments.filter((a) => a.id !== id) });
  } catch (e) {
    setOp(String(e.message || e), 'error');
  }
}

function useDropAttachments() {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    bind: {
      onDragOver: (e) => { e.preventDefault(); if (!dragging) setDragging(true); },
      onDragLeave: (e) => { if (e.target === e.currentTarget) setDragging(false); },
      onDrop: (e) => {
        e.preventDefault();
        setDragging(false);
        [...(e.dataTransfer?.files || [])].forEach(addFileAttachment);
      },
    },
  };
}

const ATT_GLYPH = { page: 'book', session: 'mic', transcript: 'mic', file: 'scroll' };

function AttachChips({ attachments }) {
  if (!attachments.length) return null;
  return html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 6px' }}>
    ${attachments.map((a) => html`<div key=${a.id} title=${a.label} style=${{
      display: 'flex', alignItems: 'center', gap: 5, maxWidth: 200,
      padding: '3px 6px 3px 8px', fontSize: 11.5, borderRadius: 999,
      background: 'var(--surface)', border: '1px solid var(--rule-soft)', color: 'var(--ink-muted)',
    }}>
      <${Icon} name=${ATT_GLYPH[a.kind] || 'scroll'} size=${11} />
      <span style=${{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${a.label}</span>
      <span onClick=${() => removeAttachment(a.id)} title="Remove" style=${{ cursor: 'pointer', display: 'flex', color: 'var(--ink-faint)' }}><${Icon} name="x" size=${10} /></span>
    </div>`)}
  </div>`;
}

function AttachPicker({ onClose }) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const pages = (store.vaultPages || [])
    .filter((p) => p.title && (!ql || p.title.toLowerCase().includes(ql)))
    .slice(0, 8);
  const sessions = (store.campaignSessions || [])
    .filter((s) => !ql || String(s.session_number || '').includes(ql) || (s.title || '').toLowerCase().includes(ql))
    .slice(0, 6);
  const pick = async (body) => { onClose(); await addRefAttachment(body); };
  return html`<div style=${{
    position: 'absolute', bottom: 'calc(100% + 6px)', left: 10, right: 10, zIndex: 5,
    background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8,
    boxShadow: 'var(--shadow-raised)', maxHeight: 280, overflow: 'auto', padding: 6,
  }}>
    <input autofocus value=${q} placeholder="Attach a page or session…" onInput=${(e) => setQ(e.target.value)}
      style=${{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '6px 8px', marginBottom: 4, borderRadius: 5, border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)' }} />
    ${pages.map((p) => html`<div key=${p.path} onClick=${() => pick({ kind: 'page', path: p.path })} class="ck-ac-item" style=${pickRow}>
      <${Icon} name="book" size=${12} /> ${p.title}
    </div>`)}
    ${sessions.map((s) => html`<div key=${s.session_id} onClick=${() => pick({ kind: 'session', session: s.session_number })} class="ck-ac-item" style=${pickRow}>
      <${Icon} name="mic" size=${12} /> Session ${String(s.session_number || 0).padStart(2, '0')}${s.title ? ` — ${s.title}` : ''}
    </div>`)}
    ${!pages.length && !sessions.length && html`<div style=${{ padding: 8, fontSize: 12, color: 'var(--ink-faint)' }}>Nothing matches. Drop a text file to attach it.</div>`}
  </div>`;
}
const pickRow = { display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', fontSize: 12.5, cursor: 'pointer', borderRadius: 5, color: 'var(--ink)' };

// {path, old, new} → red/green diff lines (Phase 5 DiffLine styling).
function DiffView({ diff }) {
  const lines = (s) => (s == null ? [] : String(s).split('\n'));
  const row = (mode, text, i) => {
    const tone = mode === 'add'
      ? { bg: 'var(--moss-50)', col: 'var(--ink)', mark: '+', markCol: 'var(--moss)' }
      : { bg: 'rgba(122,46,31,.07)', col: 'var(--ink-muted)', mark: '−', markCol: 'var(--burgundy-700)' };
    return html`<div key=${`${mode}${i}`} style=${{ display: 'flex', gap: 8, padding: '2px 10px', background: tone.bg, fontSize: 12, lineHeight: 1.5 }}>
      <span style=${{ fontFamily: 'var(--font-mono)', color: tone.markCol, flex: '0 0 auto', width: 9 }}>${tone.mark}</span>
      <span style=${{ color: tone.col, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textDecoration: mode === 'remove' ? 'line-through' : 'none', textDecorationColor: 'rgba(122,46,31,.4)' }}>${text}</span>
    </div>`;
  };
  return html`<div style=${{ border: '1px solid var(--rule)', borderRadius: 6, overflow: 'auto', background: 'var(--surface)', padding: '4px 0', maxHeight: 260 }}>
    ${lines(diff.old).map((l, i) => row('remove', l, i))}
    ${lines(diff.new).map((l, i) => row('add', l, i))}
  </div>`;
}

const WRITE_VERB = {
  create_page: 'create', edit_page: 'edit', write_page: 'overwrite',
  multi_edit_page: 'edit', append_to_page: 'append to', insert_under_heading: 'add to',
};

function PermissionCard({ ask }) {
  const d = ask.diff || {};
  const isShell = d.command != null;
  const isStructural = !isShell && d.summary != null && d.new == null;
  const title = isShell
    ? html`The Keeper wants to run a command`
    : isStructural
      ? html`The Keeper wants to ${d.summary}`
      : html`The Keeper wants to ${WRITE_VERB[ask.name] || ask.name} ${' '}<span style=${{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>${d.path || ''}</span>`;
  return html`<div style=${{ margin: '10px 0', border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper-deep)', overflow: 'hidden' }}>
    <div style=${{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
      <${Icon} name="feather" size=${13} /> ${title}
    </div>
    <div style=${{ padding: '0 10px 8px' }}>
      ${isShell && html`<div style=${{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--ink)', color: '#F2ECE0', padding: '8px 10px', borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>$ ${d.command}</div>
        <div style=${{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>in ${d.cwd || 'the world folder'}</div>`}
      ${!isShell && !isStructural && html`<${DiffView} diff=${d} />`}
    </div>
    <div style=${{ display: 'flex', gap: 8, padding: '0 10px 10px' }}>
      <button class="ck-btn ck-btn--primary" onClick=${() => decide(ask.requestId, 'allow_once')}>Allow once</button>
      ${!isShell && html`<button class="ck-btn" onClick=${() => decide(ask.requestId, 'allow_chat')}>Allow for this chat</button>`}
      <button class="ck-btn" style=${{ marginLeft: 'auto', color: 'var(--burgundy-700)' }} onClick=${() => decide(ask.requestId, 'deny')}>Deny</button>
    </div>
  </div>`;
}

const ROW_VERB = {
  rename_page: 'rename', move_page: 'move', delete_page: 'delete', create_folder: 'folder', run_command: 'shell',
  vault_diagnostics: 'diagnostics', list_tags: 'tags', find_by_tag: 'tag', page_kinds: 'kinds', read_recap: 'recap',
  multi_edit_page: 'edit', append_to_page: 'append', insert_under_heading: 'insert', search_summaries: 'summaries',
};

function ToolRow({ name, summary, isError, running, args, diff }) {
  const [openRow, setOpenRow] = useState(false);
  const tint = isError ? 'var(--burgundy-700)' : 'var(--ink-muted)';
  const expandable = !!summary || !!diff;
  const label = diff?.command ? `$ ${diff.command}` : (diff?.summary || diff?.path || (running ? (args || '') : (summary || '')));
  return html`<div style=${{ margin: '6px 0' }}>
    <div onClick=${() => setOpenRow(!openRow)} style=${{
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: tint,
      padding: '4px 8px', background: 'var(--paper-deep)', borderRadius: 5,
      border: '1px solid var(--rule-soft)', cursor: expandable ? 'pointer' : 'default',
    }}>
      ${running ? html`<${Spinner} size=${12} />` : html`<${Icon} name=${isError ? 'x' : 'check'} size=${12} />`}
      <span style=${{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>${ROW_VERB[name] || name}</span>
      <span style=${{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink-faint)' }}>${label}</span>
    </div>
    ${openRow && diff && diff.new != null && html`<div style=${{ margin: '4px 0 0 20px' }}><${DiffView} diff=${diff} /></div>`}
    ${openRow && (!diff || diff.new == null) && summary && html`<div style=${{ fontSize: 12, color: 'var(--ink-muted)', padding: '6px 10px', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>${summary}</div>`}
  </div>`;
}

function EventRow({ ev }) {
  if (ev.type === 'user') {
    return html`<div style=${{ margin: '10px 0', display: 'flex', justifyContent: 'flex-end' }}>
      <div style=${{ maxWidth: '85%', background: 'var(--burgundy-50)', border: '1px solid var(--rule-soft)', borderRadius: '10px 10px 2px 10px', padding: '8px 12px', fontSize: 13, whiteSpace: 'pre-wrap' }}>${ev.text}</div>
    </div>`;
  }
  if (ev.type === 'assistant' && (ev.text || '').trim()) {
    return html`<div class="ck-prose" style=${{ fontSize: 13, margin: '10px 0' }}
      onClick=${wikilinkClick()}
      dangerouslySetInnerHTML=${{ __html: renderBlockHtml(ev.text, store.vaultPages) }} />`;
  }
  if (ev.type === 'tool_result') {
    const first = (ev.content || '').split('\n').find((l) => l.trim() && !l.startsWith('Tool output') && l.trim() !== '```') || '';
    return html`<${ToolRow} name=${ev.name} summary=${first.trim()} isError=${ev.is_error} diff=${ev.diff} />`;
  }
  if (ev.type === 'permission' && ev.decision === 'deny') {
    return html`<div style=${{ margin: '8px 0', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>${ev.diff?.summary ? `${ev.diff.summary}` : `Edit to ${ev.diff?.path || 'a page'}`} denied.</div>`;
  }
  if (ev.type === 'error') {
    return html`<div style=${{ margin: '8px 0', fontSize: 12, color: 'var(--burgundy-700)' }}>⚠ ${ev.message}</div>`;
  }
  if (ev.type === 'aborted') {
    return html`<div style=${{ margin: '8px 0', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Stopped.</div>`;
  }
  return null;
}

export function Composer({ busy }) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [ac, setAc] = useState(null);
  const taRef = useRef(null);
  const k = keeperState();

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText(''); setAc(null);
    sendMessage(t);
  };

  function updateAc(ta) {
    try {
      const before = ta.value.slice(0, ta.selectionStart);
      const open = before.lastIndexOf('[[');
      if (open < 0) { setAc(null); return; }
      const between = before.slice(open + 2);
      if (between.includes(']]') || between.includes('\n')) { setAc(null); return; }
      const ql = between.toLowerCase();
      const items = (store.vaultPages || [])
        .filter((p) => p.title && (p.title.toLowerCase().includes(ql) || (p.aliases || []).some((a) => a.includes(ql))))
        .slice(0, 6);
      const co = caretCoords(ta);
      setAc({ open, items, index: 0, top: co.top + co.lineHeight, left: co.left });
    } catch (_) { setAc(null); }
  }

  function accept(choice) {
    const ta = taRef.current;
    if (!ac || !ta) return;
    const title = (choice.title || '').trim();
    if (!title) { setAc(null); return; }
    const v = ta.value;
    const next = v.slice(0, ac.open) + `[[${title}]]` + v.slice(ta.selectionStart);
    setText(next); setAc(null);
    requestAnimationFrame(() => { if (taRef.current) { taRef.current.focus(); const p = ac.open + title.length + 4; taRef.current.setSelectionRange(p, p); } });
  }

  function onKeyDown(e) {
    if (ac && ac.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAc({ ...ac, index: (ac.index + 1) % ac.items.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAc({ ...ac, index: (ac.index - 1 + ac.items.length) % ac.items.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(ac.items[ac.index]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAc(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return html`<div style=${{ borderTop: '1px solid var(--rule)', position: 'relative' }}>
    <${AttachChips} attachments=${k.attachments} />
    ${picker && html`<${AttachPicker} onClose=${() => setPicker(false)} />`}
    ${ac && html`<div class="ck-ac" style=${{ top: ac.top, left: ac.left }}>
      <div class="ck-ac-head">Link a page</div>
      ${ac.items.map((it, i) => html`<div key=${it.path} class=${`ck-ac-item${i === ac.index ? ' on' : ''}`}
        onMouseDown=${(e) => { e.preventDefault(); accept(it); }}><span class="ck-ac-name">${it.title}</span></div>`)}
      ${!ac.items.length && html`<div class="ck-ac-item" style=${{ color: 'var(--ink-faint)' }}>No match</div>`}
    </div>`}
    <div style=${{ padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <button class="ck-btn" title="Attach a page, session or file" onClick=${() => setPicker(!picker)}
        style=${{ padding: '7px 9px' }}><${Icon} name="plus" size=${14} /></button>
      <textarea ref=${taRef} value=${text} placeholder="Ask the Keeper… ([[ to link, drop files to attach)" rows=${2}
        onInput=${(e) => { setText(e.target.value); updateAc(e.target); }}
        onKeyDown=${onKeyDown}
        style=${{ flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }} />
      ${busy
        ? html`<button class="ck-btn" onClick=${abortRun} title="Stop the Keeper">Stop</button>`
        : html`<button class="ck-btn ck-btn--primary" onClick=${send} disabled=${!text.trim()}>Send</button>`}
    </div>
  </div>`;
}

export function Transcript({ k, empty }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [k.events.length, k.live?.text, k.live?.tools?.length, k.live?.ask]);
  const isEmpty = !k.events.length && !k.live;
  return html`<div ref=${ref} style=${{ flex: 1, overflow: 'auto', padding: '6px 14px' }}>
    ${isEmpty && (empty || html`<div style=${{ color: 'var(--ink-faint)', fontSize: 13, padding: '24px 8px', textAlign: 'center', lineHeight: 1.6 }}>
      The Keeper knows this world's Codex and sessions.<br />Ask about people, places, or what happened.
    </div>`)}
    ${k.events.map((ev, i) => html`<${EventRow} key=${i} ev=${ev} />`)}
    ${k.live && html`
      ${k.live.tools.map((t, i) => html`<${ToolRow} key=${`t${i}`} ...${t} />`)}
      ${k.live.text && html`<div class="ck-prose" style=${{ fontSize: 13, margin: '10px 0' }}
        dangerouslySetInnerHTML=${{ __html: renderBlockHtml(k.live.text, store.vaultPages) }} />`}
      ${k.live.ask && html`<${PermissionCard} ask=${k.live.ask} />`}
      ${!k.live.text && !k.live.ask && !k.live.tools.some((t) => t.running) && html`<div style=${{ padding: '8px 0' }}><${Spinner} size=${14} /></div>`}
    `}
    ${k.error && html`<div style=${{ margin: '8px 0', fontSize: 12, color: 'var(--burgundy-700)' }}>⚠ ${k.error}</div>`}
  </div>`;
}

/// Shared conversation column: transcript + composer + drop-to-attach overlay.
export function Conversation({ k, empty }) {
  const { dragging, bind } = useDropAttachments();
  return html`<div style=${{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }} ...${bind}>
    <${Transcript} k=${k} empty=${empty} />
    <${Composer} busy=${!!k.live} />
    ${dragging && html`<div style=${{
      position: 'absolute', inset: 0, zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(122,46,31,.08)', border: '2px dashed var(--burgundy)', borderRadius: 8,
      color: 'var(--burgundy-700)', fontSize: 14, fontWeight: 600, pointerEvents: 'none',
    }}>Drop text files to attach</div>`}
  </div>`;
}

export function ModeSelect({ mode }) {
  return html`<select value=${mode} onChange=${(e) => setMode(e.target.value)}
    title="What the Keeper may do without asking"
    style=${{ fontSize: 11.5, padding: '3px 4px', borderRadius: 5, border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink-muted)' }}>
    ${MODES.map((m) => html`<option key=${m.id} value=${m.id}>${m.label}</option>`)}
  </select>`;
}

export function KeeperDock() {
  const inWorld = !!store.campaign?.campaign_id
    && !['library', 'settings', 'newWorld', 'keeper'].includes(store.route.name);
  const k = keeperState();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        keeperState().open ? patchKeeper({ open: false }) : openPanel();
      } else if (e.key === 'Escape' && keeperState().open) {
        patchKeeper({ open: false });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!inWorld) return null;
  if (!k.open) {
    return html`<button onClick=${openPanel} title="Ask the Keeper (⌘J)" style=${{
      position: 'fixed', right: 22, bottom: 22, zIndex: 60,
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
      background: 'var(--burgundy)', color: '#FBF7EF', border: 'none', borderRadius: 999,
      fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-raised)',
    }}>
      <${Icon} name="feather" size=${15} /> Ask the Keeper
    </button>`;
  }

  return html`<div style=${{
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 60,
    background: 'var(--paper)', borderLeft: '1px solid var(--rule)',
    boxShadow: '-8px 0 24px rgba(60,40,20,.12)', display: 'flex', flexDirection: 'column',
  }}>
    <div style=${{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
      <${Icon} name="feather" size=${15} />
      <div style=${{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, flex: 1 }}>The Keeper</div>
      <${ModeSelect} mode=${k.mode} />
      <button class="ck-btn" title="Open full view" onClick=${() => { patchKeeper({ open: false }); navigateKeeper(); }}>↗</button>
      <button class="ck-btn" title="Undo the Keeper's last edit in this chat" onClick=${undoLast} disabled=${!!k.live}>Undo</button>
      <button class="ck-btn" title="New chat" onClick=${newChat}>New</button>
      <button onClick=${() => patchKeeper({ open: false })} title="Close (Esc)"
        style=${{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', display: 'flex' }}>
        <${Icon} name="x" size=${15} />
      </button>
    </div>
    <${Conversation} k=${k} />
  </div>`;
}

function navigateKeeper() {
  const cid = store.campaign?.campaign_id;
  if (cid) setState({ route: { name: 'keeper', params: { id: cid } } });
}
