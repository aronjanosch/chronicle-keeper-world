"""
Test script to verify refactoring was successful.
Tests that all modules can be imported and basic functionality works.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

print("Testing Chronicle Keeper Refactoring")
print("=" * 50)
print()

# Test 1: Import new modules
print("1. Testing new module imports...")
try:
    from prompts import (
        get_base_prompt,
        get_available_languages,
        build_enhanced_prompt,
        get_empty_metadata,
        METADATA_GUIDELINES
    )
    print("   ✓ prompts module imported successfully")
except Exception as e:
    print(f"   ✗ Failed to import prompts module: {e}")
    sys.exit(1)

try:
    from storage.config_manager import ConfigManager
    print("   ✓ ConfigManager imported successfully")
except Exception as e:
    print(f"   ✗ Failed to import ConfigManager: {e}")
    sys.exit(1)

try:
    from storage.session_manager import SessionManager
    print("   ✓ SessionManager imported successfully")
except Exception as e:
    print(f"   ✗ Failed to import SessionManager: {e}")
    sys.exit(1)

try:
    from llm.base import BaseLLMClient
    print("   ✓ BaseLLMClient imported successfully")
except Exception as e:
    print(f"   ✗ Failed to import BaseLLMClient: {e}")
    sys.exit(1)

try:
    from llm.ollama import OllamaClient
    print("   ✓ OllamaClient imported successfully")
except Exception as e:
    print(f"   ✗ Failed to import OllamaClient: {e}")
    sys.exit(1)

try:
    from llm.gemini import GeminiClient
    print("   ✓ GeminiClient imported successfully")
except Exception as e:
    print(f"   ✗ Failed to import GeminiClient: {e}")
    sys.exit(1)

print()

# Test 2: Test prompt functions
print("2. Testing prompt functions...")
try:
    en_prompt = get_base_prompt("en")
    de_prompt = get_base_prompt("de")
    assert len(en_prompt) > 0, "English prompt is empty"
    assert len(de_prompt) > 0, "German prompt is empty"
    assert en_prompt != de_prompt, "Prompts should be different"
    print("   ✓ get_base_prompt works correctly")
except Exception as e:
    print(f"   ✗ get_base_prompt failed: {e}")
    sys.exit(1)

try:
    langs = get_available_languages()
    assert "en" in langs, "English not available"
    assert "de" in langs, "German not available"
    print("   ✓ get_available_languages works correctly")
except Exception as e:
    print(f"   ✗ get_available_languages failed: {e}")
    sys.exit(1)

try:
    enhanced = build_enhanced_prompt("Test prompt", "Test transcript")
    assert "Test prompt" in enhanced
    assert "Test transcript" in enhanced
    assert "---METADATA---" in enhanced
    print("   ✓ build_enhanced_prompt works correctly")
except Exception as e:
    print(f"   ✗ build_enhanced_prompt failed: {e}")
    sys.exit(1)

try:
    metadata = get_empty_metadata()
    assert "suggested_tags" in metadata
    assert "mentioned_characters" in metadata
    assert isinstance(metadata["suggested_tags"], list)
    print("   ✓ get_empty_metadata works correctly")
except Exception as e:
    print(f"   ✗ get_empty_metadata failed: {e}")
    sys.exit(1)

print()

# Test 3: Test ConfigManager
print("3. Testing ConfigManager...")
try:
    config = ConfigManager()
    settings = config.get_settings()
    assert isinstance(settings, dict)
    print("   ✓ ConfigManager initialized successfully")

    current_lang = config.get_current_language()
    assert current_lang in ["en", "de"]
    print(f"   ✓ Current language: {current_lang}")

    prompt = config.get_current_prompt()
    assert len(prompt) > 0
    print("   ✓ get_current_prompt works")

    localized = config.get_localized_prompts()
    assert "en" in localized
    assert "de" in localized
    print("   ✓ get_localized_prompts works")
except Exception as e:
    print(f"   ✗ ConfigManager test failed: {e}")
    sys.exit(1)

print()

# Test 4: Test SessionManager
print("4. Testing SessionManager...")
try:
    session_mgr = SessionManager()
    test_tracks = [
        {"id": "track1", "filename": "test1.flac", "file_path": "/tmp/test1.flac", "duration": 100.0},
        {"id": "track2", "filename": "test2.flac", "file_path": "/tmp/test2.flac", "duration": 150.0}
    ]
    session_mgr.create_session("test-session-123", test_tracks)
    print("   ✓ SessionManager created session")

    session = session_mgr.get_session("test-session-123")
    assert session is not None
    assert session["id"] == "test-session-123"
    assert len(session["tracks"]) == 2
    print("   ✓ SessionManager retrieved session")

    # Cleanup test session
    session_mgr.cleanup_session("test-session-123")
    print("   ✓ SessionManager cleaned up session")
except Exception as e:
    print(f"   ✗ SessionManager test failed: {e}")
    sys.exit(1)

print()

# Test 5: Test LLM clients inherit from BaseLLMClient
print("5. Testing LLM client inheritance...")
try:
    ollama = OllamaClient()
    assert isinstance(ollama, BaseLLMClient), "OllamaClient should inherit from BaseLLMClient"
    assert hasattr(ollama, 'generate_summary_with_metadata'), "Should have generate_summary_with_metadata"
    assert hasattr(ollama, 'analyze_metadata'), "Should have analyze_metadata"
    assert hasattr(ollama, '_parse_with_separator'), "Should have _parse_with_separator"
    print("   ✓ OllamaClient correctly inherits from BaseLLMClient")
except Exception as e:
    print(f"   ✗ OllamaClient inheritance test failed: {e}")
    sys.exit(1)

try:
    # Note: We can't actually test without an API key, just verify it requires one
    try:
        gemini = GeminiClient("")
        print("   ✗ GeminiClient should require API key")
        sys.exit(1)
    except ValueError:
        print("   ✓ GeminiClient correctly requires API key")
except Exception as e:
    print(f"   ✗ GeminiClient test failed: {e}")
    sys.exit(1)

print()
print("=" * 50)
print("✅ All refactoring tests passed!")
print()
print("Summary:")
print("  • Centralized prompts module working")
print("  • ConfigManager and SessionManager split successfully")
print("  • BaseLLMClient abstract class functioning")
print("  • Both LLM clients inherit correctly")
print("  • All imports and dependencies resolved")
