# Chronicle Keeper — Roadmap

> Last updated: 2026-05-27  
> Branch: `main` (the native-Rust rewrite is merged; `native-rust-core` retired)
>
> **Status in one line:** standalone app works offline end-to-end; multi-device sync is
> functionally complete and verified client↔server. Repo cleaned + licensed (app MIT, server
> AGPL-3.0). What's left is the **paid tier** (Stripe + VPS), **release engineering** (CI,
> Windows, signing), and **Sprint 3** (drop the internal HTTP server for Tauri `invoke()`).

---

## What this app is

A **pipeline, not a workspace.**

```
Craig Bot ZIP
  → extract audio tracks (kept on device for re-transcription)
  → transcribe on-device (Parakeet via sherpa-onnx, no cloud)
  → summarize on-device (Ollama) or via BYO cloud key
  → store everything in SQLite
  → export on demand → Obsidian / Notion / markdown / any format
```

Users live in Obsidian or Notion. Chronicle Keeper generates the content and gets out of the way. No in-app editing, no file management, no cloud lock-in.

---

## Core principles

1. **Everything in SQLite.** Transcripts, summaries, metadata — all stored as TEXT in the DB. No loose files, no file-path references, no session folders. Single file to backup. Sync becomes a DB-record diff.
2. **Pipeline, not workspace.** Create → process → store → export. The app is a factory; the user's note-taking tool is the destination.
3. **Local and private by default.** Transcription runs on the user's device. LLM keys never leave the device. No telemetry.
4. **Maximum simplicity.** Solo developer. Every feature must earn its maintenance cost.
5. **Audio is kept on device.** Craig tracks are extracted and retained locally so the user can re-transcribe with a different engine as more models land (e.g. Whisper Turbo). Audio stays device-local — never synced (too large), never uploaded. Only transcript/summary text goes to SQLite and sync.

---

## Licensing & business model

| Component | License | Notes |
|---|---|---|
| App (`chronicle-keeper`) | **MIT** | Open source, free forever. Commercial use by professional DMs allowed. |
| Sync server (`chronicle-keeper-sync-server`) | **AGPL v3** | Open source. Self-hosting OK. Commercial resale of the hosted service blocked. |
| Official hosted sync | **Proprietary service** | $2–3/mo Stripe subscription. Finances ops + development. |

**Monetization:** sync only. The app is free with no ads, no DRM, no tracking. The subscription covers a €5–10/mo VPS. Profitable at ~5 paying users.

**Self-hosters:** explicitly supported. The sync protocol is documented at `docs/SYNC_PROTOCOL.md`. Anyone can build a compatible server. Self-hosters were never paying customers — they help adoption.

---

## Architecture

### Current (Sprint 1, shipped)

```
Tauri shell
  └── axum HTTP server (127.0.0.1:<ephemeral>, in-process tokio task)
        ├── campaigns / sessions / artifacts (SQLite via rusqlite)
        ├── transcription (sherpa-onnx, Parakeet TDT v3 int8)
        ├── LLM (Ollama + OpenAI-compat + Anthropic native)
        └── export (Obsidian/markdown)
  └── webview → vanilla JS frontend → fetch() to axum
```

The internal HTTP server is **technical debt.** It was justified by "shared contract with the sync server" — that reason is now gone (sync is `POST /sync`, a completely separate contract). The local HTTP server exposes a port on the machine, requires token injection into the webview, and adds unnecessary complexity.

### Target (Sprint 3)

```
Tauri shell
  └── Tauri commands (invoke() IPC, no port, no token, sandboxed)
        ├── campaigns / sessions / artifacts (SQLite)
        ├── transcription (sherpa-onnx)
        ├── LLM clients
        └── export
  └── webview → JS frontend → invoke() calls
```

Remove axum entirely from the Tauri app. Keep `ck-serve` as a dev/debug binary (axum stays in `ck-core` as a library, used only by `ck-serve`). The frontend migrates from `fetch()` to `invoke()` — significant but well-defined refactor.

### Sync (Sprint 2)

```
App (local SQLite, per-record `dirty` flag set on every write)
  │
  │  POST /sync  on startup + every 5 min  (unsynced writes persist as dirty,
  ▼               so anything missed flushes on next launch)
chronicle-keeper-sync-server (VPS, AGPL v3)
  └── SQLite (WAL mode), monotonic server_seq, server-authoritative merge
```

One endpoint. Offline-first. Conflict cursor is the server's `server_seq` (clock-skew
immune). See `docs/SYNC_PROTOCOL.md` for the full spec.

---

## Sprint status

### ✅ Sprint 0 — Transcription spike
Proved sherpa-onnx + Parakeet TDT v3 int8 builds and runs on Linux and macOS. ~16× realtime CPU. Chunking required (int8 encoder ~50s max sequence). **Open:** Windows unverified.

### ✅ Sprint 1 — Standalone desktop
Full offline flow: upload Craig ZIP → label speakers → transcribe → summarize → export. SQLite storage. Tauri shell + in-process axum. Silero VAD chunking. Model download once to app-data. macOS DMGs produced (arm64 + x64). **Open:** Windows installer (needs Windows host/CI); code signing/notarization.

### ✅ Sprint 1.5 — Frontend sync-up
Fixed settings screen 400 on save. Removed dead ONNX/MLX/WhisperX UI. README + CLAUDE.md updated for native Rust core.

### ✅ Sprint 2 — Multi-device sync (core complete)

**Goal (met):** a second device sees synced data; the server rejects unauthenticated requests.
Verified end-to-end — the Rust client and the live Python server round-trip campaigns,
sessions, artifacts, and deletions over HTTP.

**Conflict model (decided 2026-05-27):** server-authoritative. The server stamps every
accepted record with a monotonic `server_seq`; **last push received wins**. Client `updated_at`
is informational, never used for conflicts — immune to client clock skew. Auth is a single
shared `CK_SYNC_TOKEN` for v1 (one token = one data scope); per-user Stripe-scoped tokens are a
later upgrade. See `docs/SYNC_PROTOCOL.md`.

**Sync server** (`chronicle-keeper-sync-server`, AGPL v3):
- [x] Rebuilt around `POST /sync` — replaced the CRUD endpoints (+ `GET /health`)
- [x] Schema: monotonic `server_seq` on campaigns/sessions/artifacts; `artifact_id` (client UUID) PK on artifacts; `deleted_artifacts` tombstones; `updated_at`/`deleted` columns
- [x] Merge logic: last push received wins (overwrite + bump `server_seq`); artifacts push-once (`INSERT OR IGNORE`); deletions tombstoned; null JSON coerced. 6 tests

**Rust core** (`crates/ck-core`):
- [x] Migrate local artifacts from `file_path` to inline `content` in SQLite (core principle #1)
- [x] Schema groundwork: `updated_at` + `deleted` + `dirty` on campaigns/sessions; `artifact_id` (UUID, unique) + `content` + `dirty` on artifacts; idempotent migration + backfill (`db.rs`)
- [x] `sync` module (`sync.rs`): `dirty` flag on every write, `last_sync_at` cursor + `ck_client_id` in config, wire DTOs, `collect_dirty`/`apply_pull`/`clear_dirty`, `SyncClient` + `sync_once`; round-trip unit-tested
- [x] Push-side deletions: `deleted_artifacts` tombstones for artifacts; sessions soft-deleted (`deleted=1`) + UI list filtering
- [x] Background `tokio::time::interval` sync task in the Tauri shell (startup flush + every 5 min)
- [x] Shutdown durability: dirty flags persist in SQLite → unsynced writes flush next launch

**Frontend:**
- [x] Sync settings UI (server URL + write-only token field) + status indicator (off / token-missing / on)

**Repo hygiene & licensing:**
- [x] MIT `LICENSE` (app) / AGPL-3.0 `LICENSE` (server); README rewritten brief + human
- [x] Removed Python/sidecar/Vite-era junk (`spike/`, `dev.sh`, `scripts/`, `tasks/`, `REWRITE_PLAN.md`); untracked `.claude/`

**Still open (verification, not blocking the design):**
- [ ] Click-test sync in the *running app* (only unit- + wire-tested so far — needs the webview + two app instances)

### 🔲 Sprint 2.5 — Paid tier & release engineering

The hosted sync subscription and getting installable builds into users' hands.

**Paid tier (hosted sync):**
- [ ] Stripe subscription + webhook for subscription validation on the server
- [ ] Per-user auth: replace the shared `CK_SYNC_TOKEN` with per-subscriber tokens scoped to a Stripe customer id (server data partitioned per user)
- [ ] VPS provision + Caddy (TLS) + deploy the Docker image; back up `/data`

**Release engineering:**
- [ ] GitHub Actions: build + release on tag (macOS DMG; Windows on a hosted runner)
- [ ] Windows installer (cross-compile can't do WebView2/MSVC — needs a Windows host/CI)
- [ ] Code signing + notarization (macOS Gatekeeper, Windows SmartScreen)
- [ ] Make the app repo **public** (MIT, free-forever — currently private)

### 🔲 Sprint 3 — Drop internal HTTP server

**Goal:** remove axum from the Tauri app entirely. Replace with Tauri `invoke()` commands.

Why now and not earlier: the original justification (shared HTTP contract with sync server) is gone. Tauri commands are more secure (no local port), faster (no socket), and the correct architecture for a Tauri app.

**Scope:**
- [ ] Define Tauri command surface (mirrors current HTTP routes)
- [ ] Port `http/*.rs` handlers to `#[tauri::command]` functions
- [ ] Frontend: replace all `fetch()` calls with `invoke()` — systematic, file by file
- [ ] Remove axum from `src-tauri` dependencies; keep in `ck-core` for `ck-serve` only
- [ ] Remove `window.__CK_API_BASE__` + `window.__CK_TOKEN__` injection
- [ ] Remove CORS middleware from Tauri build path

`ck-serve` (dev binary) keeps axum — useful for testing the core without a window.

### 🔲 Later

- Verify the hardware-accel path actually engages (CoreML on macOS, CUDA/DirectML on Windows) — plumbed with CPU fallback, but never confirmed to use the accelerator
- More transcription engines (e.g. Whisper Turbo) — audio is kept on device specifically so users can re-transcribe with a different model
- Postgres on sync server (when SQLite write contention becomes real; storage is behind an interface)
- Cohere LLM provider (deferred from the LLM port)
- Export targets beyond Obsidian (Notion API, Logseq)
- Optional shutdown-flush hook in the Tauri shell (today's startup + interval is sufficient; dirty flags persist)

---

## Open risks

| Risk | Status |
|---|---|
| Windows build unverified | ⚠️ Open — needs Windows host or CI (Sprint 2.5) |
| CoreML EP for Parakeet int8 unverified | ⚠️ Open — plumbed with CPU fallback, not tested |
| Sync not click-tested in the running app | ⚠️ Open — unit- + wire-tested only; needs webview + two instances |
| Hosted sync is single-tenant (shared token) | ⚠️ Expected for v1 — per-user auth is Sprint 2.5, before any public paid launch |
| Artifacts stored as file_path locally | ✅ Fixed — inline `content` in SQLite |
| Audio tracks never deleted | ✅ Intentional — kept for re-transcription (principle #5) |
| Internal HTTP port exposure | ⚠️ Technical debt — fixed in Sprint 3 |
| Rust learning curve (solo dev) | 🟡 Manageable — keep surface small, lean on examples |
