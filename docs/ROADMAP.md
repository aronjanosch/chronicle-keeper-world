# Chronicle Keeper — Roadmap

> Last updated: 2026-05-27  
> Branch: `native-rust-core`

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
App (local SQLite, dirty tracking via updated_at)
  │
  │  POST /sync  every 5 min + on open + on close
  ▼
chronicle-keeper-sync-server (VPS, AGPL v3)
  └── SQLite (WAL mode)
```

One endpoint. Offline-first. See `docs/SYNC_PROTOCOL.md` for the full spec.

---

## Sprint status

### ✅ Sprint 0 — Transcription spike
Proved sherpa-onnx + Parakeet TDT v3 int8 builds and runs on Linux and macOS. ~16× realtime CPU. Chunking required (int8 encoder ~50s max sequence). **Open:** Windows unverified.

### ✅ Sprint 1 — Standalone desktop
Full offline flow: upload Craig ZIP → label speakers → transcribe → summarize → export. SQLite storage. Tauri shell + in-process axum. Silero VAD chunking. Model download once to app-data. macOS DMGs produced (arm64 + x64). **Open:** Windows installer (needs Windows host/CI); code signing/notarization.

### ✅ Sprint 1.5 — Frontend sync-up
Fixed settings screen 400 on save. Removed dead ONNX/MLX/WhisperX UI. README + CLAUDE.md updated for native Rust core.

### 🔲 Sprint 2 — Multi-device sync

**Goal:** second device sees synced data; server rejects unauthenticated requests.

**Conflict model (decided 2026-05-27):** server-authoritative. The server stamps every
accepted record with a monotonic `server_seq` (its own clock); **last push received wins**.
Client `updated_at` is informational, never used for conflicts — immune to client clock skew.
Auth stays a single shared `CK_SYNC_TOKEN` for v1 (one token = one data scope); per-user
Stripe-scoped tokens are a later upgrade. See `docs/SYNC_PROTOCOL.md`.

**Sync server** (`chronicle-keeper-sync-server`, AGPL v3):
- [ ] Rebuild around `POST /sync` — replace current CRUD endpoints
- [ ] Schema: `server_seq` (monotonic) + `server_updated_at` on campaigns/sessions/artifacts; `artifact_id` (client UUID) on artifacts; `deleted_records` table
- [ ] Merge logic: last push received wins (overwrite + bump `server_seq`); artifacts immutable (ignore duplicate `artifact_id`)
- [ ] Stripe webhook for subscription validation
- [ ] VPS provision + Caddy (TLS) + deploy

**Rust core** (`crates/ck-core`):
- [x] Migrate local artifacts from `file_path` to inline `content` in SQLite (match sync server schema + core principle #1)
- [x] Schema groundwork: `updated_at` + `deleted` + `dirty` on campaigns/sessions; `artifact_id` (UUID, unique) + `content` + `dirty` on artifacts; idempotent migration + backfill (`db.rs`)
- [x] `sync` module (`sync.rs`): `dirty` flag set on every campaign/session/artifact write, `last_sync_at` cursor + `ck_client_id` in config, wire DTOs, `collect_dirty`/`apply_pull`/`clear_dirty`, `SyncClient` + `sync_once` (reqwest `POST /sync`); round-trip unit-tested
- [ ] Push-side deletions: tombstone for hard-deleted artifacts + UI filtering of soft-deleted (`deleted=1`) campaigns/sessions
- [ ] Background `tokio::time::interval` sync task in Tauri shell
- [ ] On startup + shutdown: flush sync

**Frontend:**
- [ ] Sync settings UI (server URL + token field)
- [ ] Sync status indicator (last synced at, error state)

**Infra:**
- [ ] Add MIT `LICENSE` file to app repo
- [ ] Add AGPL v3 `LICENSE` to sync server repo
- [ ] GitHub Actions: build + release on tag (macOS DMG; Windows on hosted runner)

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

- Windows installer (needs Windows CI runner or cross-compile investigation)
- Code signing + notarization (macOS Gatekeeper, Windows SmartScreen)
- Hardware-accelerated transcription opt-in (CoreML on macOS, CUDA/DirectML on Windows) — plumbed but unverified
- Per-user auth on sync server (replace shared token with accounts — Stripe user IDs)
- Postgres on sync server (when SQLite write contention becomes real)
- Cohere LLM provider
- Export targets beyond Obsidian (Notion API, Logseq)

---

## Open risks

| Risk | Status |
|---|---|
| Windows build unverified | ⚠️ Open — needs Windows host or CI |
| CoreML EP for Parakeet int8 unverified | ⚠️ Open — plumbed, not tested |
| Artifacts stored as file_path locally | ✅ Fixed — inline `content` in SQLite (Sprint 2 groundwork) |
| Internal HTTP port exposure | ⚠️ Technical debt — fixed in Sprint 3 |
| Rust learning curve (solo dev) | 🟡 Manageable — keep surface small, lean on examples |
