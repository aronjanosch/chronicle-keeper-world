"""
Test script for structured output functionality.

Tests both Ollama and Gemini clients with structured output.
"""

import sys
sys.path.insert(0, 'src')

from models import SummaryResponse, SessionMetadata
import json


def test_pydantic_schema():
    """Test that Pydantic schema generation works correctly."""
    print("\n=== Testing Pydantic Schema Generation ===")

    schema = SummaryResponse.model_json_schema()
    print(f"✓ Schema generated successfully")
    print(f"  Schema has {len(schema.get('properties', {}))} top-level properties")
    print(f"  Properties: {list(schema.get('properties', {}).keys())}")

    return schema


def test_pydantic_validation():
    """Test that Pydantic validation works with sample JSON."""
    print("\n=== Testing Pydantic Validation ===")

    sample_json = {
        "summary": "## Summary of Events\n- The party explored a dungeon\n- They fought goblins\n\n## Key Decisions\n- Decided to spare the goblin leader",
        "metadata": {
            "suggested_tags": ["combat", "exploration", "dramatic"],
            "mentioned_characters": ["Goblin King", "Thorin"],
            "mentioned_locations": ["Dark Cave", "Goblin Throne Room"],
            "session_tone": ["tense", "heroic"],
            "key_events": ["First combat", "Spared enemy leader"]
        }
    }

    try:
        result = SummaryResponse.model_validate(sample_json)
        print(f"✓ Validation successful")
        print(f"  Summary length: {len(result.summary)} characters")
        print(f"  Metadata fields: {len(result.metadata.model_dump())}")
        print(f"  Tags: {result.metadata.suggested_tags}")
        return True
    except Exception as e:
        print(f"✗ Validation failed: {e}")
        return False


def test_json_serialization():
    """Test JSON serialization and deserialization."""
    print("\n=== Testing JSON Serialization ===")

    sample_json_str = """{
        "summary": "Test summary",
        "metadata": {
            "suggested_tags": ["test"],
            "mentioned_characters": [],
            "mentioned_locations": [],
            "session_tone": ["casual"],
            "key_events": []
        }
    }"""

    try:
        result = SummaryResponse.model_validate_json(sample_json_str)
        print(f"✓ JSON deserialization successful")

        # Test serialization
        json_out = json.dumps(result.model_dump(), indent=2)
        print(f"✓ JSON serialization successful")
        print(f"  Output length: {len(json_out)} characters")
        return True
    except Exception as e:
        print(f"✗ JSON processing failed: {e}")
        return False


def test_ollama_import():
    """Test that Ollama client imports correctly."""
    print("\n=== Testing Ollama Client Import ===")

    try:
        from llm.ollama import OllamaClient
        print(f"✓ OllamaClient imported successfully")

        # Check that it has the required method
        if hasattr(OllamaClient, 'generate_summary_with_metadata'):
            print(f"✓ generate_summary_with_metadata method exists")
        else:
            print(f"✗ Missing generate_summary_with_metadata method")
            return False

        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False


def test_gemini_import():
    """Test that Gemini client imports correctly."""
    print("\n=== Testing Gemini Client Import ===")

    try:
        from llm.gemini import GeminiClient
        print(f"✓ GeminiClient imported successfully")

        # Check that it has the required method
        if hasattr(GeminiClient, 'generate_summary_with_metadata'):
            print(f"✓ generate_summary_with_metadata method exists")
        else:
            print(f"✗ Missing generate_summary_with_metadata method")
            return False

        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("STRUCTURED OUTPUT IMPLEMENTATION TEST")
    print("=" * 60)

    tests = [
        ("Pydantic Schema Generation", test_pydantic_schema),
        ("Pydantic Validation", test_pydantic_validation),
        ("JSON Serialization", test_json_serialization),
        ("Ollama Client Import", test_ollama_import),
        ("Gemini Client Import", test_gemini_import),
    ]

    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n✗ {name} crashed: {e}")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("TEST RESULTS")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed! Structured output is ready to use.")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        sys.exit(1)
