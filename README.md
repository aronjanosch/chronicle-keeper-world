# Chronicle Keeper

A local-first, cross-platform desktop app that generates structured D&D session notes
from Discord audio files (Craig Bot recordings). Everything runs on your machine and
works offline — you bring your own LLM (local Ollama or any cloud key).

## Features

- **Craig Bot ZIP Processing**: Extract and process multi-track audio (one track per speaker)
- **Speaker Mapping**: Assign player/character names to audio tracks
- **On-device Transcription**: Native Parakeet TDT v3 (int8) via sherpa-onnx — 25 European
  languages including German, several× realtime on CPU. No cloud, no model-cache weirdness;
  the model downloads once into app-data.
- **Bring-your-own LLM**: Local Ollama or any OpenAI-compatible cloud provider (keys stay client-side)
- **Customizable Prompts**: User-defined system prompts for session summarization
- **Export**: Save notes as Markdown with Obsidian frontmatter

## Architecture

One Rust core, embedded in a Tauri shell — **no Python, no sidecar process**.

- **Tauri shell** (`src-tauri`): native window + webview. Serves the static frontend and
  hosts the core as an in-process tokio task (axum HTTP on `127.0.0.1:<ephemeral>`).
  Injects the base URL + a per-launch bearer token into the webview; the frontend sends
  `X-CK-Token` on every request.
- **Rust core** (`crates/ck-core`): the whole backend — SQLite storage, Craig ZIP extraction,
  transcription (sherpa-onnx + Parakeet v3), LLM summarization over HTTP, markdown/Obsidian export.
  Exposes ~25 HTTP endpoints. Also builds a standalone dev binary, `ck-serve`.
- **Frontend** (`frontend`): vanilla HTML/CSS/JS, no build step. Talks to the core over HTTP at
  the injected base URL (falls back to `http://127.0.0.1:8000` for standalone dev).

The same core binary will later run in server mode on a VPS for the optional paid multi-device
sync tier (transcription always stays client-side). See `docs/REWRITE_PLAN.md`.

> The Python app under `backend/` is retained only as the **port specification** for the Rust
> core's behavior — it is not built or shipped.

## Prerequisites

1. **Rust** and **Cargo** (stable)
2. **Tauri** system deps for your OS — see <https://tauri.app/start/prerequisites/>
3. **Ollama** for local LLM (optional) — <https://ollama.ai>, or a cloud LLM API key

No Python, Node, or GPU required.

## Development

### Run the full desktop app

```bash
# From the repo root
cargo tauri dev
```

This builds the Rust core + shell and opens the app with the static `frontend/` served
directly (no Vite/npm step).

### Run the core standalone (HTTP only, no window)

Useful for hitting the API directly or developing the frontend in a browser.

```bash
# Starts the axum server on 127.0.0.1:8000 (override with CK_PORT)
cargo run -p ck-core --bin ck-serve

# Then open frontend/index.html (or serve the folder) — it defaults to
# http://127.0.0.1:8000 and uses localStorage `ck_api_base` to override.
```

Set `RUST_LOG=debug` for verbose logs.

### Build installers

```bash
cargo tauri build
```

Produces per-OS installers. First build downloads the sherpa-onnx prebuilt library for
your platform. (Linux verified; macOS/Windows packaging in progress — see the rewrite plan.)

### LLM setup (optional, local)

```bash
ollama serve
ollama pull llama3.2
```

Cloud providers: add your API key in the app's Settings panel (stored locally, never sent
to any Chronicle Keeper server).

## Workflow

1. **Upload**: Import a Craig Bot ZIP (multi-track audio)
2. **Label Speakers**: Assign player/character names per track
3. **Transcribe**: On-device Parakeet transcription
4. **Summarize**: Pick your LLM (local Ollama / cloud) and generate notes
5. **Export**: Save as Markdown with Obsidian frontmatter

## Project structure

```
chronicle-keeper/
├── crates/ck-core/         # Rust core: HTTP API, transcription, storage, LLM, export
│   └── src/bin/ck_serve.rs # standalone dev server binary
├── src-tauri/              # Tauri shell (hosts the core in-process)
├── frontend/               # vanilla HTML/CSS/JS UI (no build step)
├── backend/                # legacy Python app — port spec only, not shipped
├── spike/transcribe-spike/ # Sprint 0 transcription proof-of-concept
├── docs/REWRITE_PLAN.md    # the native-Rust rewrite plan + status
└── Cargo.toml              # workspace
```

## Configuration

Settings + sessions live in a platform-appropriate app-data directory (SQLite). The
transcription model downloads once into app-data and is reused on every launch.

## Troubleshooting

- **Linux blank/garbled webview**: a WebKitGTK reliability fix (`GDK_BACKEND=x11` + DMABUF
  disable) is applied automatically on Linux when those env vars are unset.
- **Ollama connection**: verify `ollama serve` is running and the model is pulled.
- **Cloud LLM**: check API key validity and quota in Settings.
- **Logs**: run with `RUST_LOG=debug` for detailed output.

## License

Built for Chronicle Keeper — D&D Session Note Generator.
