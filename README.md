# Chronicle Keeper

Turn your D&D session recordings into clean, structured notes — on your own machine,
offline, with whatever LLM you like.

Drop in a [Craig Bot](https://craig.chat) recording, label who's who, and Chronicle Keeper
transcribes every track on-device and writes up the session. The notes land as Markdown with
Obsidian frontmatter, ready to paste into your vault. Nothing leaves your computer unless you
choose to.

## Why

- **Local-first and private.** Transcription runs on your device. Your recordings and notes
  stay with you. No per-minute cloud bills, no account required.
- **Bring your own LLM.** Local [Ollama](https://ollama.com), Anthropic, or any
  OpenAI-compatible provider. Your API keys never leave the machine.
- **A pipeline, not a workspace.** Record → transcribe → summarize → export. You live in
  Obsidian or Notion; this just generates the content and gets out of the way.

## Quick start

You'll need [Rust](https://rustup.rs) and the
[Tauri system prerequisites](https://tauri.app/start/prerequisites/) for your OS. That's it —
no Python, Node, or GPU.

```bash
cargo tauri dev
```

That builds the app and opens it. The transcription model (Parakeet TDT v3) downloads once on
first use and is reused after that.

For an LLM, either run Ollama locally:

```bash
ollama serve && ollama pull llama3.2
```

…or paste a cloud API key into Settings.

## How it works

```
Upload Craig ZIP → label speakers → transcribe on-device → summarize (your LLM) → export
```

It's a single Rust core embedded in a [Tauri](https://tauri.app) window — no Python, no
sidecar. Transcription uses [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) with NVIDIA's
Parakeet TDT v3 model (25 European languages, several× realtime on CPU). Everything persists in
one SQLite database in your app-data folder.

Optional **multi-device sync** keeps your notes in step across machines via a small self-hostable
server ([chronicle-keeper-sync-server](https://github.com/aronjanosch/chronicle-keeper-sync-server)).
Transcription always stays on your device; only the text syncs. Sync is off until you add a
server URL in Settings.

## Development

```bash
# Run just the core API (no window) — handy for the frontend or hitting the API directly
cargo run -p ck-core --bin ck-serve     # serves http://127.0.0.1:8000 (override with CK_PORT)

# Build installers for your OS
cargo tauri build

# Verbose logs
RUST_LOG=debug cargo run -p ck-core --bin ck-serve
```

The frontend (`frontend/`) is plain HTML/CSS/JS with no build step. Architecture and roadmap
live in [`docs/ROADMAP.md`](docs/ROADMAP.md); the sync protocol in
[`docs/SYNC_PROTOCOL.md`](docs/SYNC_PROTOCOL.md).

## License

[MIT](LICENSE). Free to use, including commercially.
