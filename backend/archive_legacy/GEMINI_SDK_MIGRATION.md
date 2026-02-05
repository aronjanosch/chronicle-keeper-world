# Gemini SDK Migration - Fix for Empty Metadata Tags

## The Problem

The Gemini API was returning empty arrays for all metadata fields (`suggested_tags`, `session_tone`, `key_events`) even though the prompt explicitly requested these fields to be filled.

## Root Cause

You were using the **old Google Gemini SDK** (`google-generativeai`) which has **incomplete support for structured outputs**. The old SDK:
- Used `response_schema` parameter
- Did **not properly enforce** `minItems`/`maxItems` constraints in JSON schemas
- Had compatibility issues with Pydantic schema generation

## The Solution

Migrated to the **new Google Gemini SDK** (`google-genai`) which:
- Uses `response_json_schema` parameter (correct naming)
- **Properly enforces** all JSON Schema constraints including `minItems`/`maxItems`
- Has full Pydantic integration as shown in official documentation

## Changes Made

### 1. Package Migration
```bash
# Removed old SDK
uv remove google-generativeai

# Added new SDK
uv add google-genai
```

### 2. Updated `backend/src/llm/gemini.py`

**Old SDK Code:**
```python
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# Initialize
genai.configure(api_key=api_key)
self.model = genai.GenerativeModel(...)

# Generate with structured output
response = self.model.generate_content(
    prompt,
    generation_config=genai.types.GenerationConfig(
        response_mime_type="application/json",
        response_schema=schema,  # ❌ Old parameter name
    )
)
```

**New SDK Code:**
```python
from google import genai

# Initialize
self.client = genai.Client(api_key=api_key)

# Generate with structured output
response = self.client.models.generate_content(
    model=self.model_name,
    contents=prompt,
    config={
        "response_mime_type": "application/json",
        "response_json_schema": schema,  # ✅ Correct parameter name
    }
)
```

### 3. Updated `backend/src/models.py`

Added proper Pydantic constraints that translate to JSON Schema `minItems`/`maxItems`:

```python
class SessionMetadata(BaseModel):
    suggested_tags: List[str] = Field(
        description="Array of 3-5 tags...",
        min_length=3,  # → minItems: 3 in JSON schema
        max_length=5   # → maxItems: 5 in JSON schema
    )
    
    session_tone: List[str] = Field(
        description="Array of 1-3 adjectives...",
        min_length=1,  # → minItems: 1
        max_length=3   # → maxItems: 3
    )
    
    key_events: List[str] = Field(
        description="Array of 3-5 brief descriptions...",
        min_length=3,  # → minItems: 3
        max_length=5   # → maxItems: 5
    )
```

## How to Verify

1. **Check the generated JSON schema:**
```bash
cd backend
uv run python -c "import sys; sys.path.insert(0, 'src'); from models import SummaryResponse; import json; print(json.dumps(SummaryResponse.model_json_schema(), indent=2))"
```

You should see `minItems` and `maxItems` in the schema output.

2. **Test with actual transcript:**
Run your app and generate notes. The metadata fields should now be properly populated with:
- 3-5 tags
- 1-3 tone descriptors  
- 3-5 key events

## References

- [Official Gemini Structured Output Documentation](https://ai.google.dev/gemini-api/docs/structured-output?example=recipe)
- [New SDK GitHub](https://github.com/googleapis/python-genai)
- [Pydantic Field Constraints](https://docs.pydantic.dev/latest/concepts/fields/)

## Breaking Changes

None for the application API. This is an internal SDK migration that doesn't affect the Chronicle Keeper REST API or frontend.

## Testing Checklist

- [x] Backend starts successfully
- [x] Health endpoint responds
- [ ] Upload Craig ZIP
- [ ] Label speakers
- [ ] Generate notes with metadata
- [ ] Verify metadata contains populated arrays (not empty)
