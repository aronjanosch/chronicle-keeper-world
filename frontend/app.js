const state = {
  apiBase: "http://127.0.0.1:8000",
  campaigns: [],
  campaignId: null,
  campaignDetail: null,
  campaignSessions: [],
  sessionId: null,
  tracks: [],
  speakers: [],
  speakersSaved: false,
  transcriptionPath: null,
  summaryReady: false,
  transcripts: [],
  selectedTranscriptPath: null,
  wizardStep: "start",
  activeScreen: "start",
};

const qs = (id) => document.getElementById(id);

const wizardFlow = [
  "start",
  "campaign",
  "upload",
  "speakers",
  "transcribe",
  "summarize",
  "export",
];

function showScreen(screenName) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });
  const next = qs(`${screenName}-screen`);
  if (next) {
    next.classList.add("active");
  }
  state.activeScreen = screenName;
  if (wizardFlow.includes(screenName)) {
    state.wizardStep = screenName;
  }
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });
  updateWizardUI();
}

function initNavigation() {
  document.querySelectorAll(".nav-btn[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      const screen = button.dataset.screen;
      if (screen) showScreen(screen);
    });
  });
}

function setWizardStep(step) {
  const target = wizardFlow.includes(step) ? step : "start";
  showScreen(target);
  if (target === "campaign") {
    refreshCampaigns().catch(() => {});
  }
  if (target === "summarize") {
    refreshTranscripts().catch(() => {});
  }
}

function canProceedFromStep(step) {
  switch (step) {
    case "campaign":
      return Boolean(state.sessionId);
    case "upload":
      return Boolean(state.sessionId && state.tracks.length);
    case "speakers":
      return Boolean(state.speakersSaved);
    case "transcribe":
      return Boolean(state.transcriptionPath);
    case "summarize":
      return Boolean(state.summaryReady);
    default:
      return true;
  }
}

function updateWizardUI() {
  const wizardNav = qs("wizard-nav");
  const wizardSteps = qs("wizard-steps");
  const sessionLabel = qs("wizard-session-label");

  if (wizardSteps) {
    wizardSteps.innerHTML = "";
    wizardFlow
      .filter((step) => step !== "start")
      .forEach((step) => {
        const span = document.createElement("span");
        span.className = `wizard-step${state.wizardStep === step ? " active" : ""}`;
        span.textContent = step.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
        wizardSteps.appendChild(span);
      });
  }

  if (sessionLabel) {
    if (state.sessionId) {
      sessionLabel.textContent = `Session: ${state.sessionId}`;
    } else if (state.campaignId) {
      sessionLabel.textContent = `Campaign: ${state.campaignId}`;
    } else {
      sessionLabel.textContent = "No campaign loaded";
    }
  }

  if (!wizardNav) return;
  const isWizardStep =
    wizardFlow.includes(state.activeScreen) && state.activeScreen !== "start";
  wizardNav.classList.toggle("hidden", !isWizardStep);
  if (!isWizardStep) return;

  const backBtn = qs("wizard-back");
  const nextBtn = qs("wizard-next");
  const currentIndex = wizardFlow.indexOf(state.wizardStep);
  backBtn.disabled = currentIndex <= 1;
  nextBtn.disabled = !canProceedFromStep(state.wizardStep);
  nextBtn.textContent = state.wizardStep === "export" ? "Finish" : "Next";
}

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || "";
  el.className = `status${isError ? " error" : ""}`;
}

function apiUrl(path) {
  return `${state.apiBase}${path}`;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(apiUrl(path), options);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail || JSON.stringify(data);
    } catch (_) {
      // ignore
    }
    throw new Error(detail);
  }
  return response.json();
}

function loadApiBase() {
  const saved = localStorage.getItem("ck_api_base");
  if (saved) {
    state.apiBase = saved;
  }
  qs("api-base").value = state.apiBase;
}

function saveApiBase() {
  const value = qs("api-base").value.trim();
  state.apiBase = value || "http://127.0.0.1:8000";
  localStorage.setItem("ck_api_base", state.apiBase);
}

function renderPlayerOptions(players = []) {
  const list = qs("player-options");
  if (!list) return;
  list.innerHTML = "";
  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player;
    list.appendChild(option);
  });
}

function renderTracks() {
  const list = qs("track-list");
  const body = qs("speakers-body");
  list.innerHTML = "";
  body.innerHTML = "";

  const speakerMap = new Map(
    (state.speakers || []).map((speaker) => [speaker.track_id, speaker])
  );

  state.tracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.textContent = `${track.filename} (${track.id})`;
    list.appendChild(li);

    const existing = speakerMap.get(track.id) || {};
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${track.id}</td>
      <td><input data-field="player_name" data-index="${index}" list="player-options" value="${
        existing.player_name || ""
      }" /></td>
      <td><input data-field="character_name" data-index="${index}" value="${
        existing.character_name || ""
      }" /></td>
      <td><input data-field="pronouns" data-index="${index}" list="pronoun-options" value="${
        existing.pronouns || ""
      }" /></td>
    `;
    body.appendChild(row);
  });
}

function collectSpeakers() {
  const speakers = state.tracks.map((track) => ({
    track_id: track.id,
    player_name: "",
    character_name: "",
    pronouns: "",
  }));
  qs("speakers-body")
    .querySelectorAll("input")
    .forEach((input) => {
      const index = Number(input.dataset.index);
      const field = input.dataset.field;
      speakers[index][field] = input.value.trim();
    });
  state.speakers = speakers;
  return speakers;
}

function renderCampaignOptions() {
  const list = qs("campaign-options");
  if (!list) return;
  list.innerHTML = "";
  state.campaigns.forEach((campaign) => {
    const option = document.createElement("option");
    option.value = campaign.campaign_id;
    option.textContent = campaign.name;
    list.appendChild(option);
  });
}

function renderCampaignSessions() {
  const ul = qs("campaign-sessions");
  if (!ul) return;
  ul.innerHTML = "";
  state.campaignSessions.forEach((session) => {
    const li = document.createElement("li");
    const info = document.createElement("span");
    const title = session.title ? ` - ${session.title}` : "";
    const date = session.date ? ` (${session.date})` : "";
    const flags = `${session.has_transcription ? "T" : "-"} / ${
      session.has_summary ? "S" : "-"
    }`;
    info.textContent = `#${session.session_number || "?"}${title}${date} [${flags}]`;

    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => loadSession(session.session_id, session));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteSession(session.session_id));

    li.appendChild(info);
    li.appendChild(openBtn);
    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

async function refreshCampaigns() {
  const data = await apiFetch("/campaigns");
  state.campaigns = data.campaigns || [];
  renderCampaignOptions();
  return data;
}

async function loadCampaignDetail(campaignId) {
  const campaign = await apiFetch(`/campaigns/${campaignId}`);
  state.campaignId = campaign.campaign_id;
  state.campaignDetail = campaign;
  qs("campaign-system").value = campaign.system || "";
  qs("campaign-gm").value = campaign.gm || "";
  qs("campaign-setting").value = campaign.setting || "";
  qs("campaign-language").value = campaign.default_language || "";
  qs("campaign-players").value = (campaign.players || []).join(", ");
  renderPlayerOptions(campaign.players || []);
  await setNextSessionNumber();
}

async function setNextSessionNumber() {
  if (!state.campaignId) return;
  const data = await apiFetch(`/next-session-number?campaign_id=${state.campaignId}`);
  const nextNumber = data.next_session_number || "";
  if (!qs("new-session-number").value) {
    qs("new-session-number").value = nextNumber;
  }
}

async function refreshCampaignSessions() {
  if (!state.campaignId) return;
  const sessions = await apiFetch(`/campaigns/${state.campaignId}/sessions`);
  state.campaignSessions = sessions || [];
  renderCampaignSessions();
}

async function openCampaign() {
  const campaignId = qs("campaign-select-input").value.trim();
  if (!campaignId) {
    setStatus(qs("campaign-select-result"), "Select a campaign", true);
    return;
  }
  try {
    await loadCampaignDetail(campaignId);
    await refreshCampaignSessions();
    setWizardStep("campaign");
    setStatus(qs("campaign-select-result"), "Campaign loaded");
  } catch (error) {
    setStatus(qs("campaign-select-result"), error.message, true);
  }
}

async function saveCampaign() {
  if (!state.campaignId) return;
  const payload = {
    system: qs("campaign-system").value.trim(),
    gm: qs("campaign-gm").value.trim(),
    setting: qs("campaign-setting").value.trim(),
    default_language: qs("campaign-language").value.trim(),
    players: qs("campaign-players")
      .value.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
  const campaign = await apiFetch(`/campaigns/${state.campaignId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  state.campaignDetail = campaign;
  renderPlayerOptions(campaign.players || []);
}

async function createCampaignSession() {
  if (!state.campaignId) return;
  const sessionNumber = Number(qs("new-session-number").value) || null;
  const payload = {
    session_number: sessionNumber,
    title: qs("new-session-title").value.trim() || null,
    date: qs("new-session-date").value || null,
  };
  const session = await apiFetch(`/campaigns/${state.campaignId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await refreshCampaignSessions();
  await loadSession(session.session_id, session);
  qs("new-session-number").value = "";
  qs("new-session-title").value = "";
  qs("new-session-date").value = "";
  setStatus(qs("session-create-result"), "Session created");
  setWizardStep("upload");
}

async function loadSession(sessionId, sessionInfo = null) {
  const session = await apiFetch(`/session/${sessionId}`);
  state.sessionId = session.session_id;
  state.tracks = session.tracks || [];
  state.speakers = session.speakers || [];
  state.speakersSaved = Boolean(state.speakers.length);
  state.transcriptionPath = session.transcription?.text_path || null;
  state.summaryReady = Boolean(session.summary?.summary_path);
  state.campaignId = session.campaign?.campaign_id || state.campaignId;

  if (state.campaignId) {
    try {
      await loadCampaignDetail(state.campaignId);
      await refreshCampaignSessions();
    } catch (_) {
      // ignore
    }
  }

  renderTracks();
  if (state.sessionId) {
    await refreshTranscripts();
  }

  if (sessionInfo) {
    const nextStep = resolveSessionStep(sessionInfo, session);
    setWizardStep(nextStep);
  } else {
    setWizardStep("upload");
  }
  setStatus(qs("upload-result"), `Loaded session ${sessionId}`);
}

async function deleteSession(sessionId) {
  await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" });
  if (state.sessionId === sessionId) {
    state.sessionId = null;
    state.tracks = [];
    renderTracks();
  }
  await refreshCampaignSessions();
}

function resolveSessionStep(sessionInfo, sessionData) {
  if (sessionInfo?.has_summary || sessionData?.summary?.summary_path) {
    return "export";
  }
  if (sessionInfo?.has_transcription || sessionData?.transcription?.text_path) {
    return "summarize";
  }
  if (sessionData?.tracks?.length) {
    return "speakers";
  }
  return "upload";
}

function renderTranscripts(list) {
  const select = qs("transcript-select");
  select.innerHTML = "";
  if (!list.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No transcripts found";
    select.appendChild(option);
    select.disabled = true;
    state.selectedTranscriptPath = null;
    return;
  }
  select.disabled = false;
  list.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.transcript_path;
    option.textContent = `${item.provider_model} (${new Date(
      item.modified_time
    ).toLocaleString()})`;
    if (index === 0) option.selected = true;
    select.appendChild(option);
  });
  state.selectedTranscriptPath = select.value;
}

async function refreshTranscripts() {
  if (!state.sessionId) return;
  try {
    setStatus(qs("transcript-result"), "Loading transcripts...");
    const list = await apiFetch(`/sessions/${state.sessionId}/transcripts`);
    state.transcripts = list || [];
    renderTranscripts(state.transcripts);
    setStatus(qs("transcript-result"), "Transcripts ready");
  } catch (error) {
    setStatus(qs("transcript-result"), error.message, true);
  }
}

async function loadConfig() {
  const config = await apiFetch("/config");
  qs("setting-output-root").value = config.output_root || "";
  qs("setting-summary-provider").value = config.summary_provider || "";
  qs("setting-ollama-base-url").value = config.ollama_base_url || "";
  qs("setting-ollama-model").value = config.ollama_model || "";
  qs("setting-ollama-timeout").value = config.ollama_timeout_seconds || "";
  qs("setting-gemini-model").value = config.gemini_model || "";
  qs("setting-default-language").value = config.default_language || "";
  qs("setting-whisperx-model").value = config.whisperx_model || "";
}

async function saveConfig() {
  const payload = {
    output_root: qs("setting-output-root").value.trim(),
    summary_provider: qs("setting-summary-provider").value.trim(),
    ollama_base_url: qs("setting-ollama-base-url").value.trim(),
    ollama_model: qs("setting-ollama-model").value.trim(),
    ollama_timeout_seconds: Number(qs("setting-ollama-timeout").value) || undefined,
    gemini_model: qs("setting-gemini-model").value.trim(),
    default_language: qs("setting-default-language").value.trim(),
    whisperx_model: qs("setting-whisperx-model").value.trim(),
  };

  const geminiKey = qs("setting-gemini-api-key").value.trim();
  const hfToken = qs("setting-hf-token").value.trim();
  if (geminiKey) payload.gemini_api_key = geminiKey;
  if (hfToken) payload.hf_token = hfToken;

  await apiFetch("/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  qs("setting-gemini-api-key").value = "";
  qs("setting-hf-token").value = "";
  setStatus(qs("settings-result"), "Settings saved");
}

async function saveSpeakers() {
  if (!state.sessionId) {
    setStatus(qs("speakers-result"), "No session loaded", true);
    return false;
  }
  const speakers = collectSpeakers();
  try {
    await apiFetch("/label-speakers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: state.sessionId, speakers }),
    });
    state.speakersSaved = true;
    setStatus(qs("speakers-result"), "Speakers saved");
    updateWizardUI();
    return true;
  } catch (error) {
    setStatus(qs("speakers-result"), error.message, true);
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  showScreen("start");
  loadApiBase();
  qs("save-api-base").addEventListener("click", saveApiBase);

  qs("wizard-back").addEventListener("click", () => {
    const currentIndex = wizardFlow.indexOf(state.wizardStep);
    if (currentIndex > 1) {
      setWizardStep(wizardFlow[currentIndex - 1]);
    } else {
      setWizardStep("start");
    }
  });

  qs("wizard-next").addEventListener("click", async () => {
    if (state.wizardStep === "campaign") {
      try {
        await saveCampaign();
        if (!state.sessionId) {
          setStatus(qs("session-create-result"), "Create a session to continue", true);
          return;
        }
      } catch (error) {
        setStatus(qs("campaign-save-result"), error.message, true);
        return;
      }
    }
    if (state.wizardStep === "speakers" && !state.speakersSaved) {
      const saved = await saveSpeakers();
      if (!saved) return;
    }
    if (!canProceedFromStep(state.wizardStep)) return;
    const currentIndex = wizardFlow.indexOf(state.wizardStep);
    if (state.wizardStep === "export") {
      setWizardStep("start");
      return;
    }
    setWizardStep(wizardFlow[currentIndex + 1]);
  });

  qs("open-campaign").addEventListener("click", openCampaign);

  qs("create-campaign").addEventListener("click", async () => {
    const campaignId = qs("new-campaign-id").value.trim();
    const name = qs("new-campaign-name").value.trim();
    const startNumber = Number(qs("new-campaign-start").value) || 1;
    if (!campaignId || !name) {
      setStatus(qs("campaign-result"), "ID and name required", true);
      return;
    }
    try {
      await apiFetch("/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          name,
          start_session_number: startNumber,
        }),
      });
      qs("new-campaign-id").value = "";
      qs("new-campaign-name").value = "";
      setStatus(qs("campaign-result"), "Campaign created");
      await refreshCampaigns();
      qs("campaign-select-input").value = campaignId;
      await openCampaign();
    } catch (error) {
      setStatus(qs("campaign-result"), error.message, true);
    }
  });

  qs("save-campaign").addEventListener("click", async () => {
    if (!state.campaignId) return;
    try {
      await saveCampaign();
      setStatus(qs("campaign-save-result"), "Campaign saved");
    } catch (error) {
      setStatus(qs("campaign-save-result"), error.message, true);
    }
  });

  qs("create-session").addEventListener("click", async () => {
    try {
      await createCampaignSession();
    } catch (error) {
      setStatus(qs("session-create-result"), error.message, true);
    }
  });

  qs("upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.sessionId) {
      setStatus(qs("upload-result"), "Create a session first", true);
      return;
    }
    const fileInput = qs("zip-file");
    if (!fileInput.files.length) return;
    setStatus(qs("upload-result"), "Uploading...");

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("session_id", state.sessionId);
    try {
      const data = await apiFetch("/upload", { method: "POST", body: formData });
      state.tracks = data.tracks || [];
      state.speakers = [];
      state.speakersSaved = false;
      state.transcriptionPath = null;
      state.summaryReady = false;
      renderTracks();
      setStatus(qs("upload-result"), `Upload complete`);
      updateWizardUI();
    } catch (error) {
      setStatus(qs("upload-result"), error.message, true);
    }
  });

  qs("speakers-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSpeakers();
  });

  qs("start-transcribe").addEventListener("click", async () => {
    if (!state.sessionId) {
      setStatus(qs("transcribe-result"), "No session loaded", true);
      return;
    }
    const payload = {
      session_id: state.sessionId,
      language: qs("transcribe-language").value.trim() || null,
      model: qs("transcribe-model").value.trim() || null,
      hf_token: qs("transcribe-hf-token").value.trim() || null,
    };
    setStatus(qs("transcribe-result"), "Transcribing...");
    try {
      const data = await apiFetch("/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      state.transcriptionPath = data.text_path || null;
      await refreshTranscripts();
      setStatus(qs("transcribe-result"), "Transcription complete");
      updateWizardUI();
    } catch (error) {
      setStatus(qs("transcribe-result"), error.message, true);
    }
  });

  qs("start-summary").addEventListener("click", async () => {
    if (!state.sessionId) {
      setStatus(qs("summary-result"), "No session loaded", true);
      return;
    }
    const payload = {
      session_id: state.sessionId,
      transcript_path: state.selectedTranscriptPath || null,
      provider: qs("summary-provider").value,
      model: qs("summary-model").value.trim() || null,
      base_url: qs("summary-base-url").value.trim() || null,
      title: qs("summary-title").value.trim() || null,
      context: qs("summary-context").value.trim() || null,
    };
    setStatus(qs("summary-result"), "Summarizing...");
    try {
      const data = await apiFetch("/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      state.summaryReady = Boolean(data.summary);
      qs("summary-text").textContent = data.summary || "";
      qs("summary-metadata").textContent = JSON.stringify(data.metadata || {}, null, 2);
      setStatus(qs("summary-result"), "Summary ready");
      updateWizardUI();
    } catch (error) {
      setStatus(qs("summary-result"), error.message, true);
    }
  });

  qs("export-notes").addEventListener("click", async () => {
    if (!state.sessionId) {
      setStatus(qs("export-result"), "No session loaded", true);
      return;
    }
    const payload = {
      session_id: state.sessionId,
      use_obsidian_format: qs("use-obsidian").checked,
      custom_filename: qs("export-filename").value.trim() || null,
    };
    setStatus(qs("export-result"), "Exporting...");
    try {
      const data = await apiFetch("/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      qs("export-preview").value = data.content || "";
      const blob = new Blob([data.content || ""], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = qs("download-link");
      link.href = url;
      link.download = data.filename || "session_notes.md";
      setStatus(qs("export-result"), "Export ready");
    } catch (error) {
      setStatus(qs("export-result"), error.message, true);
    }
  });

  qs("refresh-transcripts").addEventListener("click", refreshTranscripts);
  qs("transcript-select").addEventListener("change", () => {
    state.selectedTranscriptPath = qs("transcript-select").value || null;
  });

  qs("save-settings").addEventListener("click", async () => {
    try {
      await saveConfig();
    } catch (error) {
      setStatus(qs("settings-result"), error.message, true);
    }
  });

  refreshCampaigns().catch(() => {});
  loadConfig().catch(() => {});
  updateWizardUI();
});
