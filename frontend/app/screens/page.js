// The Page — Obsidian-style reading view + single live-preview editor.
// Live preview is block-granular: every markdown block renders in place; the block
// you click into reveals its raw markdown in an auto-growing textarea, and re-renders
// on blur. Frontmatter shows as a Properties strip (click to edit raw YAML). Typing
// `[[` opens a wikilink autocomplete at the caret. Auto-saves to the vault (800ms).
import { html, useState, useEffect, useRef, useMemo } from '../../vendor/htm-preact-standalone.mjs';
import { navigate, useStore } from '../core.js';
import { Shell, Sidebar, Topbar } from '../shell.js';
import { Btn, Empty, Icon, PageBody, renderBlockHtml, splitDoc, joinDoc, parseProps } from '../ui.js';
import { readVaultPage, saveVaultPage, openCampaign, loadVaultTree, createVaultPage } from '../actions.js';
import { FileTree, buildTree, makeVaultActions, iconForKind, KINDS } from './codex.js';

function kindLabel(k) {
  return (KINDS.find((x) => x.value === k) || {}).label || k || 'Page';
}

let _blkId = 0;
const newId = () => 'blk' + (_blkId++);
function splitBody(body) {
  return (body || '')
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+$/, ''))
    .filter((s) => s.trim() !== '')
    .map((text) => ({ id: newId(), text }));
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// Pixel position of the textarea caret (mirror-div trick) for the [[ autocomplete.
function caretCoords(ta) {
  try {
    const s = getComputedStyle(ta);
    const div = document.createElement('div');
    ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'paddingTop', 'paddingRight',
      'paddingBottom', 'paddingLeft', 'borderWidth', 'boxSizing'].forEach((p) => { div.style[p] = s[p]; });
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.lineHeight = s.lineHeight;
    div.style.width = ta.clientWidth + 'px';
    document.body.appendChild(div);
    div.textContent = ta.value.slice(0, ta.selectionStart);
    const span = document.createElement('span');
    span.textContent = '​';
    div.appendChild(span);
    const top = span.offsetTop;
    const left = span.offsetLeft;
    const lh = parseFloat(s.lineHeight) || 18;
    document.body.removeChild(div);
    const rect = ta.getBoundingClientRect();
    return {
      top: rect.top + top - ta.scrollTop,
      left: Math.min(rect.left + left - ta.scrollLeft, window.innerWidth - 280),
      lineHeight: lh,
    };
  } catch (_) {
    const r = ta.getBoundingClientRect();
    return { top: r.top, left: r.left, lineHeight: 18 };
  }
}

function PropsStrip({ fmText, onEdit }) {
  const props = parseProps(fmText).filter((p) => p.key !== 'summary');
  return html`<div class="ck-props" onClick=${onEdit} title="Click to edit properties">
    ${props.length
      ? props.map((p) => html`<div class="ck-prop-row" key=${p.key}>
          <span class="ck-prop-key">${p.key}</span>
          <span class="ck-prop-vals">
            ${p.values.filter((v) => v !== '').map((v, i) => html`<span class="ck-prop-tag ${p.key === 'tags' ? 'mono' : ''}" key=${i}>${p.key === 'tags' ? '#' + String(v).replace(/^#/, '') : v}</span>`)}
          </span>
        </div>`)
      : html`<div class="ck-prop-empty"><${Icon} name="plus" size=${11} /> Add properties</div>`}
  </div>`;
}

function LiveEditor({ content, pages, onSave, onState }) {
  const init = useMemo(() => splitDoc(content), []);
  const [fmText, setFmText] = useState(init.fm);
  const [blocks, setBlocks] = useState(() => splitBody(init.body));
  const [activeId, setActiveId] = useState(null);
  const [ac, setAc] = useState(null);

  const taRef = useRef(null);
  const draft = useRef('');
  const saveTimer = useRef(null);
  const pending = useRef({ dirty: false, doc: content });
  const cache = useRef(new Map());

  useEffect(() => { cache.current.clear(); }, [pages]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pending.current.dirty) { try { onSave(pending.current.doc); } catch (_) { /* unmount */ } }
  }, []);

  // Set the active textarea's content + focus once, when a block is activated.
  useEffect(() => {
    if (activeId != null && taRef.current) {
      const ta = taRef.current;
      ta.value = draft.current;
      autoGrow(ta);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [activeId]);

  function htmlFor(text) {
    const c = cache.current;
    if (c.has(text)) return c.get(text);
    const h = renderBlockHtml(text, pages);
    c.set(text, h);
    return h;
  }

  function scheduleSave(doc) {
    pending.current = { dirty: true, doc };
    if (onState) onState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (onState) onState('saving');
      Promise.resolve(onSave(pending.current.doc))
        .then(() => { pending.current.dirty = false; if (onState) onState('saved'); })
        .catch(() => { if (onState) onState('dirty'); });
    }, 800);
  }
  function scheduleSaveLive() {
    const fm = activeId === '__fm__' ? draft.current : fmText;
    const body = blocks.map((b) => (b.id === activeId ? draft.current : b.text)).join('\n\n');
    scheduleSave(joinDoc(fm, body));
  }

  function enterEdit(b) { draft.current = b.text; setAc(null); setActiveId(b.id); }
  function enterFm() { draft.current = fmText; setAc(null); setActiveId('__fm__'); }

  function commitActive() {
    const id = activeId;
    if (id == null) return;
    if (id === '__fm__') {
      setFmText(draft.current);
    } else {
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === id);
        if (i < 0) return bs;
        const parts = draft.current.split(/\n{2,}/).map((s) => s.replace(/\s+$/, '')).filter((s) => s.trim() !== '');
        const repl = parts.map((t) => ({ id: newId(), text: t }));
        return [...bs.slice(0, i), ...repl, ...bs.slice(i + 1)];
      });
    }
    setActiveId(null);
    setAc(null);
  }

  function addBlockEnd() {
    const id = newId();
    setBlocks((bs) => [...bs, { id, text: '' }]);
    draft.current = '';
    setActiveId(id);
  }

  function updateAutocomplete(ta) {
    try {
      const caret = ta.selectionStart;
      const before = ta.value.slice(0, caret);
      const open = before.lastIndexOf('[[');
      if (open < 0) { setAc(null); return; }
      const between = before.slice(open + 2);
      if (between.includes(']]') || between.includes('\n')) { setAc(null); return; }
      const ql = between.toLowerCase();
      const items = (pages || []).filter((p) => p.title && p.title.toLowerCase().includes(ql)).slice(0, 6);
      const co = caretCoords(ta);
      setAc({ open, query: between, items, index: 0, top: co.top + co.lineHeight, left: co.left });
    } catch (_) { setAc(null); }
  }

  function acceptAc(choice) {
    const cur = ac;
    const ta = taRef.current;
    if (!cur || !ta) return;
    const title = (choice === 'create' ? cur.query : choice.title).trim();
    if (!title) { setAc(null); return; }
    const val = ta.value;
    const newVal = val.slice(0, cur.open) + `[[${title}]]` + val.slice(ta.selectionStart);
    ta.value = newVal;
    const pos = cur.open + title.length + 4;
    ta.setSelectionRange(pos, pos);
    draft.current = newVal;
    autoGrow(ta);
    ta.focus();
    setAc(null);
    scheduleSaveLive();
    if (choice === 'create') createVaultPage(title, 'lore', '').catch(() => {});
  }

  function onKeyDown(e) {
    if (ac) {
      const total = ac.items.length + 1;
      if (e.key === 'ArrowDown') { e.preventDefault(); setAc({ ...ac, index: (ac.index + 1) % total }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAc({ ...ac, index: (ac.index - 1 + total) % total }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptAc(ac.index < ac.items.length ? ac.items[ac.index] : 'create');
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setAc(null); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
  }

  const taProps = {
    ref: taRef,
    class: 'ck-block-edit',
    spellcheck: 'false',
    onInput: (e) => { draft.current = e.target.value; autoGrow(e.target); scheduleSaveLive(); updateAutocomplete(e.target); },
    onBlur: commitActive,
    onKeyDown,
  };

  return html`<div class="ck-live">
    ${activeId === '__fm__'
      ? html`<textarea ...${taProps} key="__fm__" style=${{ fontFamily: 'var(--font-mono)' }} />`
      : html`<${PropsStrip} fmText=${fmText} onEdit=${enterFm} />`}

    <div class="ck-live-body">
      ${blocks.map((b) => (b.id === activeId
        ? html`<textarea ...${taProps} key=${b.id} />`
        : html`<div class="ck-prose ck-block" key=${b.id} onClick=${() => enterEdit(b)}
            dangerouslySetInnerHTML=${{ __html: htmlFor(b.text) }} />`))}
      ${blocks.length === 0 && activeId == null
        ? html`<div class="ck-block-empty" onClick=${addBlockEnd}>This page is empty. Click to start writing…</div>`
        : html`<div class="ck-add-zone" onClick=${addBlockEnd} title="Add a paragraph" />`}
    </div>

    ${ac && html`<div class="ck-ac" style=${{ top: ac.top, left: ac.left }}>
      <div class="ck-ac-head">Link a page</div>
      ${ac.items.map((it, i) => html`<div class="ck-ac-item ${i === ac.index ? 'on' : ''}" key=${it.path}
          onMouseDown=${(e) => { e.preventDefault(); acceptAc(it); }}>
        <span class="ck-ac-glyph"><${Icon} name=${iconForKind(it.kind)} size=${13} /></span>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div class="ck-ac-name">${it.title}</div>
          <div class="ck-ac-sub">${kindLabel(it.kind)}</div>
        </div>
        ${i === ac.index && html`<span class="ck-ac-kbd">↵</span>`}
      </div>`)}
      <div class="ck-ac-item ck-ac-create ${ac.index === ac.items.length ? 'on' : ''}"
          onMouseDown=${(e) => { e.preventDefault(); acceptAc('create'); }}>
        <${Icon} name="plus" size=${11} /> <span>Create ${ac.query ? `“${ac.query}”` : 'a new page'}</span>
      </div>
    </div>`}
  </div>`;
}

function KebabMenu({ items }) {
  const [open, setOpen] = useState(false);
  return html`<div style=${{ position: 'relative' }}>
    <button onClick=${() => setOpen((o) => !o)} style=${{ padding: '6px 8px', color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
      <${Icon} name="dots" size=${15} />
    </button>
    ${open && html`<div>
      <div onClick=${() => setOpen(false)} style=${{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style=${{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 41, minWidth: 150,
        background: 'var(--surface-raised)', border: '1px solid var(--rule-strong)', borderRadius: 8, boxShadow: 'var(--shadow-raised)', overflow: 'hidden', padding: 4 }}>
        ${items.map((it, i) => html`<div key=${i} onClick=${() => { setOpen(false); it.onClick(); }}
          style=${{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 13, color: it.danger ? 'var(--burgundy-700)' : 'var(--ink)' }}
          onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--paper-deep)'; }}
          onMouseLeave=${(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <${Icon} name=${it.icon} size=${13} /> ${it.label}
        </div>`)}
      </div>
    </div>`}
  </div>`;
}

function ModeToggle({ mode, onChange }) {
  const seg = (m, icon, label) => html`<span onClick=${() => onChange(m)}
    style=${{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
      background: mode === m ? 'var(--paper-deep)' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: mode === m ? 500 : 400 }}>
    <${Icon} name=${icon} size=${12} /> ${label}</span>`;
  return html`<div style=${{ display: 'flex', gap: 2, padding: 2, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6 }}>
    ${seg('read', 'eye', 'Read')}${seg('edit', 'edit', 'Edit')}
  </div>`;
}

function Provenance({ path }) {
  const segs = path.split('/');
  return html`<div class="ck-provenance">
    <${Icon} name="doc" size=${11} />
    <span>world${segs.map((s, i) => html`<span key=${i}><span class="ck-sep">/</span><span class=${i === segs.length - 1 ? 'ck-file' : ''}>${s}</span></span>`)}</span>
  </div>`;
}

function ReadView({ page, path, pages, onBroken }) {
  const { fm, body } = splitDoc(page.content);
  const props = parseProps(fm);
  const role = (props.find((p) => p.key === 'role') || {}).values?.[0];
  const eyebrow = [kindLabel(page.kind), role].filter(Boolean).join(' · ');
  const prose = body.replace(/^\s*#\s+.*\n+/, ''); // title rendered above; drop the leading H1

  return html`<div style=${{ flex: 1, overflow: 'auto', background: 'var(--paper)', padding: '34px 0 64px', minWidth: 0 }}>
    <div style=${{ maxWidth: 680, margin: '0 auto', padding: '0 52px' }}>
      <${Provenance} path=${path} />
      <div style=${{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--burgundy)', marginTop: 16 }}>${eyebrow}</div>
      <h1 style=${{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.08, color: 'var(--ink)', marginTop: 6 }}>${page.title}</h1>

      ${page.summary && page.summary.trim() && html`<div style=${{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--rule-soft)', borderRadius: 8 }}>
        <${Icon} name="feather" size=${13} className="ck-burgundy" style=${{ marginTop: 3, flex: '0 0 auto' }} />
        <div style=${{ flex: 1 }}>
          <div style=${{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink)', lineHeight: 1.5 }}>${page.summary}</div>
          <div style=${{ fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 6, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Summary · the AI's memory</div>
        </div>
      </div>`}

      <div style=${{ height: 1, background: 'var(--rule)', margin: '26px 0' }} />
      <${PageBody} text=${prose} pages=${pages} onBroken=${onBroken} />
    </div>
  </div>`;
}

// Plain-markdown editor (default): one textarea over the whole .md file, auto-saved.
// Simpler + more robust than the block live-preview; the latter is opt-in (kebab menu).
function SourceEditor({ content, onSave, onState }) {
  const [text, setText] = useState(content);
  const taRef = useRef(null);
  const timer = useRef(null);
  const pending = useRef({ dirty: false, doc: content });

  useEffect(() => { if (taRef.current) autoGrow(taRef.current); }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current.dirty) { try { onSave(pending.current.doc); } catch (_) { /* unmount */ } }
  }, []);

  function onInput(e) {
    const v = e.target.value;
    setText(v); autoGrow(e.target);
    pending.current = { dirty: true, doc: v };
    if (onState) onState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (onState) onState('saving');
      Promise.resolve(onSave(v))
        .then(() => { pending.current.dirty = false; if (onState) onState('saved'); })
        .catch(() => { if (onState) onState('dirty'); });
    }, 800);
  }

  return html`<textarea ref=${taRef} class="ck-source-edit" spellcheck="false" value=${text} onInput=${onInput} />`;
}

const EDIT_STYLE_KEY = 'ck_edit_style';
function loadEditStyle() {
  try { return localStorage.getItem(EDIT_STYLE_KEY) === 'live' ? 'live' : 'source'; } catch (_) { return 'source'; }
}

export function PageScreen() {
  const store = useStore();
  const c = store.campaign;
  const path = store.route.params.path;

  const [page, setPage] = useState(null);
  const [missing, setMissing] = useState(false);
  const [mode, setMode] = useState('read');
  const [editStyle, setEditStyle] = useState(loadEditStyle);
  const [saveState, setSaveState] = useState('saved');

  function toggleEditStyle() {
    setEditStyle((s) => {
      const n = s === 'live' ? 'source' : 'live';
      try { localStorage.setItem(EDIT_STYLE_KEY, n); } catch (_) { /* private mode */ }
      return n;
    });
    setMode('edit');
  }

  useEffect(() => { if (c) loadVaultTree(c.campaign_id); }, [c?.campaign_id]);

  useEffect(() => {
    let cancelled = false;
    setPage(null); setMissing(false); setMode('read');
    readVaultPage(path)
      .then((p) => { if (!cancelled) { setPage(p); setSaveState('saved'); } })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [path, c?.campaign_id]);

  if (!c) { navigate('library'); return null; }

  const pages = store.vaultPages || [];
  const folders = store.vaultFolders || [];
  const tree = buildTree(folders, pages);
  const act = makeVaultActions(c, folders, { afterDelete: () => navigate('codex', { id: c.campaign_id }) });

  const openBroken = (name) => createVaultPage(name, 'lore', '').then((p) => navigate('page', { path: p.path })).catch(() => {});

  const sidebar = html`<${Sidebar} variant="campaign" active="codex" campaign=${c} />`;
  const crumbs = [
    { label: 'Worlds', onClick: () => navigate('library') },
    { label: c.name, onClick: () => openCampaign(c.campaign_id) },
    { label: 'Codex', onClick: () => navigate('codex', { id: c.campaign_id }) },
    (page && page.title) || path,
  ];

  if (missing) {
    return html`<${Shell} sidebar=${sidebar} topbar=${html`<${Topbar} crumbs=${crumbs} />`}>
      <${Empty} icon="scroll" title="Page not found">
        <a onClick=${() => navigate('codex', { id: c.campaign_id })} style=${{ color: 'var(--burgundy)', cursor: 'pointer' }}>Back to the codex</a>.
      </${Empty}>
    </${Shell}>`;
  }

  const savedChip = mode === 'edit' && html`<span style=${{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontFamily: 'var(--font-mono)',
    color: saveState === 'saved' ? 'var(--moss)' : 'var(--ink-faint)' }}>
    <${Icon} name=${saveState === 'saved' ? 'check' : 'feather'} size=${12} />
    ${saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved' : 'Saved to vault'}
  </span>`;

  const pageLeaf = page ? { path, title: page.title, kind: page.kind } : null;
  const topbar = html`<${Topbar} crumbs=${crumbs}
    right=${html`<div style=${{ display: 'flex', gap: 8, alignItems: 'center' }}>
      ${savedChip}
      <${ModeToggle} mode=${mode} onChange=${setMode} />
      ${pageLeaf && html`<${KebabMenu} items=${[
        { icon: editStyle === 'live' ? 'check' : 'feather', label: editStyle === 'live' ? 'Live preview ✓' : 'Live preview', onClick: toggleEditStyle },
        { icon: 'edit', label: 'Rename', onClick: () => act.renamePage(pageLeaf) },
        { icon: 'folder', label: 'Move…', onClick: () => act.movePage(pageLeaf) },
        { icon: 'trash', label: 'Delete', danger: true, onClick: () => act.deletePage(pageLeaf) },
      ]} />`}
    </div>`} />`;

  const doSave = async (content) => { const updated = await saveVaultPage(path, content); setPage(updated); return updated; };

  return html`<${Shell} sidebar=${sidebar} topbar=${topbar} bodyStyle=${{ padding: 0 }}>
    <div style=${{ display: 'flex', height: '100%', minHeight: 0 }}>
      <${FileTree} campaign=${c} tree=${tree} active=${(page && page.title) || null} onOpen=${(p) => navigate('page', { path: p.path })} act=${act} />
      ${page === null
        ? html`<div style=${{ flex: 1, padding: 40, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Loading…</div>`
        : mode === 'read'
          ? html`<${ReadView} page=${page} path=${path} pages=${pages} onBroken=${openBroken} />`
          : html`<div style=${{ flex: 1, overflow: 'auto', background: 'var(--paper)', padding: '34px 0 64px', minWidth: 0 }}>
              <div style=${{ maxWidth: 720, margin: '0 auto', padding: '0 52px' }}>
                <${Provenance} path=${path} />
                ${editStyle === 'live'
                  ? html`<${LiveEditor} key=${'live:' + path} content=${page.content} pages=${pages} onSave=${doSave} onState=${setSaveState} />`
                  : html`<${SourceEditor} key=${'src:' + path} content=${page.content} onSave=${doSave} onState=${setSaveState} />`}
              </div>
            </div>`}
    </div>
  </${Shell}>`;
}
