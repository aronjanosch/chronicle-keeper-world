# API Usage Examples

This document provides practical examples for using the Chronicle Keeper API.

## Model Selection

### Get Current Settings

```bash
curl http://127.0.0.1:8000/settings
```

Response includes:
```json
{
  "whisper_model": "large-v2",
  "ollama_model": "llama3.2",
  "available_whisper_models": {
    "tiny": "Tiny (~39 MB, fastest, lowest quality)",
    "base": "Base (~74 MB, fast, good quality)",
    "small": "Small (~244 MB, slower, better quality)",
    "medium": "Medium (~769 MB, slow, high quality)",
    "large-v2": "Large-v2 (~1550 MB, slowest, best quality - recommended for non-English)"
  },
  "available_ollama_models": {
    "llama3.2": "Llama 3.2 (~2 GB, recommended, good balance)",
    "mistral": "Mistral (~4.1 GB, good alternative)",
    ...
  }
}
```

### Change Whisper Model

```bash
curl -X POST http://127.0.0.1:8000/settings \
  -H "Content-Type: application/json" \
  -d '{
    "whisper_model": "base",
    "ollama_model": "llama3.2",
    "llm_preference": "local",
    "language": "en",
    "transcription_language": "auto",
    "system_prompt": "..."
  }'
```

### Change Ollama Model

```bash
curl -X POST http://127.0.0.1:8000/settings \
  -H "Content-Type: application/json" \
  -d '{
    "whisper_model": "large-v2",
    "ollama_model": "mistral",
    "llm_preference": "local",
    "language": "en",
    "transcription_language": "auto",
    "system_prompt": "..."
  }'
```

### Check Installed Ollama Models

```bash
curl http://127.0.0.1:8000/ollama-models
```

Response:
```json
{
  "models": ["llama3.2:latest", "mistral:latest"],
  "server_running": true
}
```

### Pull a New Ollama Model

Pull the mistral model:
```bash
curl -X POST http://127.0.0.1:8000/ollama-models/pull \
  -H "Content-Type: application/json" \
  -d '{"model_name": "mistral"}'
```

Response (if model needs to be downloaded):
```json
{
  "status": "success",
  "message": "Model 'mistral' pulled successfully",
  "already_exists": false
}
```

Response (if model already exists):
```json
{
  "status": "success",
  "message": "Model 'mistral' is already available",
  "already_exists": true
}
```

## Complete Workflow Example

### 1. Upload Craig ZIP File

```bash
curl -X POST http://127.0.0.1:8000/upload \
  -F "file=@/path/to/craig-recording.zip"
```

Response:
```json
{
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "tracks": [
    {
      "id": "0",
      "filename": "track0.flac",
      "file_path": "/tmp/...",
      "duration": 3600.5
    }
  ]
}
```

### 2. Label Speakers

```bash
curl -X POST http://127.0.0.1:8000/label-speakers \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "123e4567-e89b-12d3-a456-426614174000",
    "mappings": {
      "0": {
        "playerName": "Alice",
        "characterName": "Gandalf",
        "pronouns": "he/him"
      },
      "1": {
        "playerName": "Bob",
        "characterName": "Frodo",
        "pronouns": "he/him"
      }
    }
  }'
```

### 3. Generate Notes

```bash
curl -X POST http://127.0.0.1:8000/generate-notes \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "123e4567-e89b-12d3-a456-426614174000",
    "llm_engine": "local"
  }'
```

Response:
```json
{
  "summary": "# Session Summary\n...",
  "transcript": "# D&D Session Transcript\n...",
  "metadata_suggestions": {
    "suggested_tags": ["combat", "exploration"],
    "mentioned_characters": ["Gandalf", "Frodo"],
    "mentioned_locations": ["Shire", "Mordor"],
    ...
  }
}
```

### 4. Export Notes

```bash
curl -X POST http://127.0.0.1:8000/export \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Session Summary\n...",
    "file_path": "/path/to/output/session_notes.md"
  }'
```

## Model Selection Strategy

### For Fast Testing
- Whisper: `tiny` or `base`
- Ollama: `llama3.2:1b`

### For Balanced Performance (Recommended)
- Whisper: `small` or `base`
- Ollama: `llama3.2`

### For High Quality
- Whisper: `large-v2`
- Ollama: `llama3.1` or `mistral`

### For Non-English Languages
- Whisper: `large-v2` (best multilingual support)
- Ollama: `qwen2.5` (excellent multilingual support)

### For Low-Resource Systems
- Whisper: `tiny` or `base`
- Ollama: `llama3.2:1b`

## Troubleshooting

### Ollama Server Not Running

If you get `server_running: false`:
```bash
# Start Ollama manually
ollama serve
```

The API will also attempt to auto-start Ollama if it's installed.

### Model Download Fails

If model pulling fails:
```bash
# Pull manually using Ollama CLI
ollama pull mistral

# Or specify a specific version
ollama pull llama3.2:latest
```

### Whisper Model Not Downloading

Whisper models are downloaded automatically by faster-whisper/WhisperX on first use. If download fails:
- Check internet connection
- Ensure sufficient disk space (models range from 39 MB to 1.5 GB)
- Models are cached in: `~/.cache/huggingface/hub/`

### Out of Memory Errors

If you get OOM errors:
1. Use smaller Whisper model (`tiny` or `base`)
2. Use smaller Ollama model (`llama3.2:1b`)
3. Close other applications
4. Process shorter audio files
5. Disable GPU acceleration (set device to CPU in config)
