# Phase 2: Context Window Intelligence - Implementation Summary

## Overview

Successfully implemented intelligent context window detection and auto-switching recommendations for Chronicle Keeper. The system now automatically analyzes transcript size and recommends the optimal LLM (local vs cloud) based on token usage.

## What Was Implemented

### 1. ContextWindowManager (`src/context_window.py`)

A comprehensive manager that:
- Tracks context window limits for all supported models
- Estimates token usage from text
- Analyzes context window usage and provides recommendations
- Implements 5-level recommendation system

**Model Limits:**
- Gemini 2.0 Flash: 1,000,000 tokens
- Llama 3.2/3.3: 128,000 tokens
- Qwen2.5: 128,000 tokens (7-14B) / 1,000,000 tokens (72B)
- Mistral: 128,000 tokens

**Thresholds:**
- 70% usage: Warn about high usage
- 85% usage: Recommend switching to cloud
- 95% usage: Require cloud (block local generation)

### 2. Token Estimation Methods

**GeminiClient (`src/llm/gemini.py`):**
- `estimate_tokens()`: Uses native Gemini API for accurate counting
- `estimate_prompt_tokens()`: Estimates complete prompt tokens

**OllamaClient (`src/llm/ollama.py`):**
- `estimate_tokens()`: Character-based estimation (~4 chars/token + 10% buffer)
- `estimate_prompt_tokens()`: Estimates complete prompt tokens

### 3. New API Endpoint: `/analyze-context`

**Purpose:** Pre-generation context analysis

**Request:**
```json
{
  "session_id": "uuid",
  "llm_engine": "local",  // or "cloud"
  "custom_prompt": "optional",
  "ollama_model": "llama3.2"  // optional
}
```

**Response:**
```json
{
  "fits": true,
  "estimated_tokens": 49507,
  "max_tokens": 128000,
  "available_tokens": 124000,
  "usage_percent": 39.9,
  "recommended_action": "use_as_is",
  "message": "Context usage: 39.9%. Good to proceed.",
  "model": "llama3.2",
  "is_cloud": false,
  "session_id": "uuid",
  "transcript_length": 120000,
  "breakdown": {
    "transcript_tokens": 48000,
    "prompt_tokens": 1507,
    "total_input": 49507
  }
}
```

**Recommendation Actions:**
- `use_as_is`: Context usage is fine, proceed
- `warn_high_usage`: High usage (70-85%), consider cloud
- `switch_to_cloud`: Very high usage (85-95%), strongly recommend cloud
- `require_cloud`: Exceeds local capacity (95-100%), cloud required
- `chunking_required`: Exceeds even cloud capacity (>100%)

### 4. Enhanced `/generate-notes` Endpoint

Now includes automatic context analysis:
- Analyzes context window before generation
- Blocks generation if content exceeds limits (HTTP 400)
- Logs warnings for high usage scenarios
- Returns context analysis in response

**Enhanced Response:**
```json
{
  "summary": "...",
  "transcript": "...",
  "metadata_suggestions": {...},
  "context_analysis": {
    "estimated_tokens": 49507,
    "usage_percent": 39.9,
    "fits_in_context": true,
    "recommended_action": "use_as_is",
    "message": "Context usage: 39.9%. Good to proceed."
  }
}
```

## Session Length Reference

Based on ~150 words per minute (typical D&D session pacing):

| Duration | Words | Estimated Tokens | Local (128K) Usage | Recommendation |
|----------|-------|------------------|-------------------|----------------|
| 30 min | 4,500 | 6,200 | 5% | ✅ Use local |
| 1 hour | 9,000 | 12,400 | 10% | ✅ Use local |
| 1.5 hours | 13,500 | 18,600 | 15% | ✅ Use local |
| 2 hours | 18,000 | 24,800 | 20% | ✅ Use local |
| 3 hours | 27,000 | 37,000 | 30% | ✅ Use local |
| 3.5 hours | 31,500 | 43,300 | 35% | ✅ Use local |
| 4 hours | 36,000 | 49,500 | 40% | ✅ Use local |
| 4.5 hours | 40,500 | 55,700 | 45% | ✅ Use local |
| 5 hours | 45,000 | 61,900 | 50% | ✅ Use local |
| 5.5 hours | 49,500 | 68,100 | 55% | ✅ Use local |
| 6 hours | 54,000 | 74,300 | 60% | ✅ Use local |
| 6.5 hours | 58,500 | 80,500 | 65% | ✅ Use local |
| 7 hours | 63,000 | 86,600 | 70% | ⚠️ Warn - consider cloud |
| 8 hours | 72,000 | 99,000 | 80% | ⚠️ High usage - consider cloud |
| 9 hours | 81,000 | 111,400 | 90% | 🔄 Switch to cloud recommended |
| 10+ hours | 90,000+ | 123,800+ | 100%+ | ❌ Cloud required |

**Key Insight:** Your typical 3-4 hour sessions (27K-36K words) use only 30-40% of local model capacity - perfect for running locally!

## Frontend Integration Examples

### 1. Pre-Generation Check (Recommended)

```typescript
async function checkContextBeforeGeneration(sessionId: string, engine: string) {
  const analysis = await fetch('/analyze-context', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      llm_engine: engine,
    })
  }).then(r => r.json());

  // Show warning if recommended
  if (analysis.recommended_action === 'switch_to_cloud') {
    const shouldSwitch = await showConfirmDialog(
      'Long Session Detected',
      `This session is very long (${analysis.usage_percent.toFixed(1)}% context usage). ` +
      `Switching to Gemini is recommended for better results. Switch now?`
    );

    if (shouldSwitch) {
      engine = 'cloud';
    }
  } else if (analysis.recommended_action === 'require_cloud') {
    await showErrorDialog(
      'Session Too Long',
      `This session exceeds local model capacity. Please use Gemini (cloud) instead.`
    );
    engine = 'cloud';
  }

  return { analysis, engine };
}
```

### 2. Show Context Usage in UI

```typescript
function displayContextAnalysis(analysis: ContextAnalysis) {
  const usageColor =
    analysis.usage_percent < 70 ? 'green' :
    analysis.usage_percent < 85 ? 'yellow' :
    'red';

  return (
    <div className="context-info">
      <span className={`usage-badge ${usageColor}`}>
        Context: {analysis.usage_percent.toFixed(1)}%
      </span>
      {analysis.message && (
        <span className="usage-message">{analysis.message}</span>
      )}
    </div>
  );
}
```

### 3. Post-Generation Display

```typescript
const result = await generateNotes(sessionId, engine);

// Show context analysis from result
if (result.context_analysis) {
  console.log(`Token usage: ${result.context_analysis.estimated_tokens:,}`);
  console.log(`Context usage: ${result.context_analysis.usage_percent}%`);

  // Show recommendation if present
  if (result.context_analysis.recommended_action !== 'use_as_is') {
    showInfoBanner(result.context_analysis.message);
  }
}
```

## Testing

All tests pass:
```bash
uv run python test_context_window.py
```

**Test Coverage:**
- ✅ Context window analysis (8 test cases)
- ✅ Model limit detection (6 models)
- ✅ Token estimation accuracy (3 scenarios)

**Test Results:** 3/3 test suites passed

## Benefits

### For Users:
1. **No manual calculation** - System automatically detects session length
2. **Smart recommendations** - Only suggests cloud when truly beneficial
3. **Cost optimization** - Keeps you on free local models when possible
4. **Prevents failures** - Blocks generation before truncation occurs

### For 3-4 Hour Sessions:
- ✅ **30-40% context usage** on local models
- ✅ **Plenty of headroom** for quality results
- ✅ **No need to worry** about limits
- ✅ **Free unlimited processing** with local models

### For Longer Sessions:
- ⚠️ **Automatic warnings** at 70% usage (7+ hour sessions)
- 🔄 **Smart recommendations** at 85% usage (9+ hour sessions)
- ❌ **Required switching** at 95% usage (10+ hour sessions)

## Future Enhancements (Phase 3 - Not Implemented Yet)

If you regularly have 10+ hour mega-sessions, Phase 3 would add:

1. **Automatic Transcript Chunking**
   - Split long transcripts at speaker boundaries
   - Generate summaries for each chunk
   - Merge chunk summaries intelligently

2. **Chunk Strategy Options**
   - Time-based chunking (every 2 hours)
   - Token-based chunking (every 100K tokens)
   - Scene-based chunking (detect scene changes)

3. **Progressive Summarization**
   - Hierarchical summaries (chunk → section → session)
   - Maintain narrative continuity across chunks

**Current Status:** Phase 3 not needed for typical 3-4 hour sessions. Can be added later if demand exists.

## Files Modified/Created

### Created:
- `src/context_window.py` - ContextWindowManager class
- `test_context_window.py` - Comprehensive test suite
- `PHASE2_SUMMARY.md` - This document

### Modified:
- `src/main.py` - Added `/analyze-context` endpoint, enhanced `/generate-notes`
- `src/llm/gemini.py` - Added token estimation methods
- `src/llm/ollama.py` - Added token estimation methods

## Production Ready

✅ All tests passing
✅ Server starts successfully
✅ API endpoints functional
✅ Error handling implemented
✅ Logging configured
✅ Documentation complete

The system is ready for production use!
