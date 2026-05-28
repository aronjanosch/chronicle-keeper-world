// All data operations. Thin wrappers over the HTTP client that update the store.
// Ported 1:1 from the legacy app.js so the backend contract is unchanged.
import { store, setState, setOp, navigate, apiFetch, apiJson, apiText, apiUrl, slugify, toneFor, initials } from './core.js';

// ── Campaigns ─────────────────────────────────────────────────────
export async function loadCampaigns() {
  setState({ loading: true, error: null });
  try {
    const data = await apiFetch('/campaigns');
    const list = data.campaigns || [];
    const details = await Promise.all(list.map((c) => apiFetch(`/campaigns/${c.campaign_id}`).catch(() => null)));
    const campaigns = details.filter(Boolean).map(decorateCampaign);
    setState({ campaigns, loading: false });
  } catch (e) { setState({ error: e.message, loading: false }); }
}

function decorateCampaign(c) {
  return { ...c, sigil: initials(c.name).slice(0, 1), tone: toneFor(c.campaign_id || c.name) };
}

export async function openCampaign(id) {
  setState({ loading: true, error: null });
  try {
    const campaign = decorateCampaign(await apiFetch(`/campaigns/${id}`));
    const [sessions, codexEntries] = await Promise.all([
      apiFetch(`/campaigns/${id}/sessions`).catch(() => []),
      apiFetch(`/campaigns/${id}/codex/entries`).catch(() => []),
    ]);
    setState({
      campaign,
      campaignSessions: sessions || [],
      codexEntries: codexEntries || [],
      loading: false,
    });
    navigate('campaign', { id });
  } catch (e) { setState({ error: e.message, loading: false }); }
}

export async function refreshCampaignSessions() {
  const id = store.campaign?.campaign_id;
  if (!id) return;
  const sessions = await apiFetch(`/campaigns/${id}/sessions`).catch(() => []);
  setState({ campaignSessions: sessions || [] });
}

export function generateCampaignId(name) {
  const base = slugify(name) || 'campaign';
  const existing = new Set(store.campaigns.map((c) => c.campaign_id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createCampaign(form) {
  const id = generateCampaignId(form.name);
  await apiJson('/campaigns', 'POST', { campaign_id: id, name: form.name, start_session_number: Number(form.start) || 1 });
  await apiJson(`/campaigns/${id}`, 'PUT', {
    name: form.name, system: form.system, setting: form.setting,
    default_language: form.default_language, gm: form.gm, players: form.players, extra_info: form.extra_info,
  });
  await loadCampaigns();
  await openCampaign(id);
  return id;
}

export async function updateCampaign(patch) {
  const id = store.campaign.campaign_id;
  const updated = decorateCampaign(await apiJson(`/campaigns/${id}`, 'PUT', patch));
  setState({ campaign: updated });
  await loadCampaigns();
}

// ── Codex entries ─────────────────────────────────────────────────
export async function loadCodexEntries(campaignId) {
  const id = campaignId || store.campaign?.campaign_id;
  if (!id) return [];
  const entries = await apiFetch(`/campaigns/${id}/codex/entries`).catch(() => []);
  setState({ codexEntries: entries || [] });
  return entries || [];
}

export async function createCodexEntry({ name, kind, body }) {
  const id = store.campaign.campaign_id;
  await apiJson(`/campaigns/${id}/codex/entries`, 'POST', { name, kind, body: body || '' });
  await loadCodexEntries(id);
}

export async function updateCodexEntry(entryId, patch) {
  const id = store.campaign.campaign_id;
  await apiJson(`/campaigns/${id}/codex/entries/${entryId}`, 'PUT', patch);
  await loadCodexEntries(id);
}

export async function deleteCodexEntry(entryId) {
  const id = store.campaign.campaign_id;
  await apiFetch(`/campaigns/${id}/codex/entries/${entryId}`, { method: 'DELETE' });
  await loadCodexEntries(id);
}

// ── Sessions ──────────────────────────────────────────────────────
export async function loadSession(id) {
  setState({ loading: true, error: null });
  try {
    const session = await apiFetch(`/session/${id}`);
    // ensure parent campaign is loaded for the sidebar
    const campId = session.campaign?.campaign_id;
    let campaign = store.campaign;
    if (campId && campaign?.campaign_id !== campId) {
      campaign = decorateCampaign(await apiFetch(`/campaigns/${campId}`));
    }
    const [transcripts, summaries] = await Promise.all([
      apiFetch(`/sessions/${id}/transcripts`).catch(() => []),
      apiFetch(`/sessions/${id}/summaries`).catch(() => []),
    ]);
    let summaryPreview = null;
    if ((summaries || []).length) {
      const latest = summaries[0];
      try { summaryPreview = { id: latest.id, text: await apiText(`/sessions/${id}/summaries/${latest.id}/content`) }; } catch (_) {}
    }
    setState({ session, campaign, transcripts: transcripts || [], summaries: summaries || [], summaryPreview, loading: false });
    navigate('session', { id });
  } catch (e) { setState({ error: e.message, loading: false }); }
}

export async function createSession() {
  const id = store.campaign.campaign_id;
  const created = await apiJson(`/campaigns/${id}/sessions`, 'POST', {});
  return created; // { session_id, session_number }
}

export async function uploadZip(sessionId, file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('session_id', sessionId);
  const data = await apiFetch('/upload', { method: 'POST', body: fd });
  return data.tracks || [];
}

export function saveSpeakers(sessionId, speakers) {
  return apiJson('/label-speakers', 'POST', { session_id: sessionId, speakers });
}

export function saveSessionMetadata(payload) {
  return apiJson('/session-metadata', 'POST', payload);
}

export async function deleteArtifact(kind, artifactId) {
  const sid = store.session?.session_id;
  if (!sid) return;
  await apiFetch(`/sessions/${sid}/${kind}/${artifactId}`, { method: 'DELETE' });
  await loadSession(sid);
}

export function artifactContent(kind, artifactId) {
  const sid = store.session?.session_id;
  return apiText(`/sessions/${sid}/${kind}/${artifactId}/content`);
}

// ── Transcription ─────────────────────────────────────────────────
const MB = 1024 * 1024;
function bar(frac, w = 14) { const f = Math.max(0, Math.min(w, Math.round(frac * w))); return '█'.repeat(f) + '░'.repeat(w - f); }
function pollModelStatus() {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const p = await apiFetch('/model-status');
      if (stopped) return;
      if (p.phase === 'downloading') {
        if (p.total > 0) {
          const pct = Math.round((p.downloaded / p.total) * 100);
          setOp(`Downloading model ${bar(p.downloaded / p.total)} ${pct}% (${(p.downloaded / MB).toFixed(0)}/${(p.total / MB).toFixed(0)} MB)`);
        } else setOp(`Downloading model… ${(p.downloaded / MB).toFixed(0)} MB`);
      } else if (p.phase === 'extracting') setOp('Extracting model…');
    } catch (_) {}
    if (!stopped) setTimeout(tick, 500);
  };
  tick();
  return () => { stopped = true; };
}

export async function runTranscribe({ provider, model, language }) {
  const sid = store.session?.session_id;
  if (!sid) return;
  setOp('Transcribing…');
  const stop = pollModelStatus();
  try {
    await apiJson('/transcribe', 'POST', { session_id: sid, provider: provider || null, model: model || null, language: language || null });
    await loadSession(sid);
    await refreshCampaignSessions();
    setOp('Transcription complete', 'done');
  } catch (e) { setOp(e.message, 'err'); }
  finally { stop(); }
}

export async function loadTranscriptionProviders() {
  if (!store.providers) {
    try { setState({ providers: await apiFetch('/providers') }); } catch (_) {}
  }
  return store.providers || [];
}

// ── Summarize ─────────────────────────────────────────────────────
export async function loadPromptPresets() {
  if (store.promptPresets) return store.promptPresets;
  let p = {};
  try { p = await apiFetch('/prompts'); } catch (_) {}
  setState({ promptPresets: p });
  return p;
}

export async function runSummarize({ transcriptId, provider, model, title, context, systemPrompt }) {
  const sid = store.session?.session_id;
  if (!sid) return;
  setOp(`Summarizing with ${provider}…`);
  try {
    await apiJson('/summarize', 'POST', {
      session_id: sid, transcript_id: transcriptId || null, provider, model: model || null,
      base_url: null, title: title || null, context: context || null, system_prompt: systemPrompt || null,
    });
    await loadSession(sid);
    await refreshCampaignSessions();
    // Auto-extract may have grown the codex; refresh so a later codex visit
    // shows the new entries without a manual reload.
    await loadCodexEntries(store.campaign?.campaign_id);
    setOp('Summary complete', 'done');
  } catch (e) { setOp(e.message, 'err'); }
}

// ── Export ────────────────────────────────────────────────────────
export async function runExport(summaryId) {
  const sid = store.session?.session_id;
  if (!sid) return;
  try {
    const data = await apiJson('/export', 'POST', { session_id: sid, summary_id: summaryId, use_obsidian_format: true });
    const blob = new Blob([data.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = data.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOp('Exported markdown', 'done');
  } catch (e) { setOp(e.message, 'err'); }
}

// ── Config + LLM providers ────────────────────────────────────────
export async function loadConfig() {
  const config = await apiFetch('/config');
  setState({ config });
  if (!store.llmProviders) {
    try { setState({ llmProviders: await apiFetch('/llm-providers') }); } catch (_) {}
  }
  return config;
}

export async function saveConfig(payload, apiBaseValue) {
  if (apiBaseValue) { store.apiBase = apiBaseValue; localStorage.setItem('ck_api_base', apiBaseValue); }
  const updated = await apiJson('/config', 'PUT', payload);
  setState({ config: updated });
  return updated;
}

export async function loadLlmProviders(force) {
  if (store.llmProviders && !force) return store.llmProviders;
  let list = [];
  try { list = await apiFetch('/llm-providers'); } catch (_) {}
  setState({ llmProviders: list });
  return list;
}

export async function saveLlmProvider(id, body) {
  const result = await apiJson(`/llm-providers/${id}`, 'PUT', body);
  const llmProviders = (store.llmProviders || []).map((x) =>
    x.id === id ? { ...x, has_key: result.has_key, has_custom_base: result.has_custom_base, saved_model: result.saved_model } : x);
  setState({ llmProviders });
  return result;
}

export function testLlmProvider(id, model) {
  return apiJson(`/llm-providers/${id}/test`, 'POST', { model: model || null });
}
