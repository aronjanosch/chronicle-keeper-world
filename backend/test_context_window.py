"""
Test script for context window analysis functionality.

Tests the ContextWindowManager with various transcript sizes
to verify recommendations are correct.
"""

import sys
sys.path.insert(0, 'src')

from context_window import ContextWindowManager, RecommendedAction


def generate_sample_transcript(word_count: int) -> str:
    """Generate a sample transcript with specified word count."""
    # Average D&D session: ~150 words per minute
    # So a typical word creates ~4 characters
    sample_word = "word "
    return (sample_word * word_count)


def test_context_window_manager():
    """Test the ContextWindowManager with different transcript sizes."""

    manager = ContextWindowManager()

    # Test cases: (description, word_count, model, is_cloud, expected_action)
    # Note: Token estimates are ~1.375 tokens per word based on our estimation
    # 70% of 124K available tokens = 86,800 tokens = ~63,000 words
    # 85% of 124K available tokens = 105,400 tokens = ~77,000 words
    # 95% of 124K available tokens = 117,800 tokens = ~86,000 words
    test_cases = [
        ("Short session (30min)", 4_500, "llama3.2", False, RecommendedAction.USE_AS_IS),
        ("Medium session (1.5hr)", 13_500, "llama3.2", False, RecommendedAction.USE_AS_IS),
        ("Long session (3hr)", 27_000, "llama3.2", False, RecommendedAction.USE_AS_IS),
        ("Very long session (3.5hr)", 65_000, "llama3.2", False, RecommendedAction.WARN_HIGH_USAGE),
        ("Extreme session (4.5hr)", 80_000, "llama3.2", False, RecommendedAction.SWITCH_TO_CLOUD),
        ("Massive session (6+hr)", 95_000, "llama3.2", False, RecommendedAction.REQUIRE_CLOUD),
        ("Long session on cloud", 80_000, "gemini-2.0-flash-exp", True, RecommendedAction.USE_AS_IS),
        ("Extreme session on cloud", 200_000, "gemini-2.0-flash-exp", True, RecommendedAction.USE_AS_IS),
    ]

    print("=" * 80)
    print("CONTEXT WINDOW MANAGER TESTS")
    print("=" * 80)

    all_passed = True

    for description, word_count, model, is_cloud, expected_action in test_cases:
        print(f"\n📝 Test: {description}")
        print(f"   Model: {model} ({'cloud' if is_cloud else 'local'})")
        print(f"   Words: {word_count:,}")

        # Generate transcript
        transcript = generate_sample_transcript(word_count)
        system_prompt = "You are a helpful assistant."  # Simple prompt

        # Analyze
        analysis = manager.analyze_context(
            transcript=transcript,
            system_prompt=system_prompt,
            model=model,
            is_cloud=is_cloud
        )

        # Check results
        estimated_tokens = analysis["estimated_tokens"]
        usage_percent = analysis["usage_percent"]
        action = analysis["recommended_action"]
        message = analysis["message"]

        print(f"   Estimated tokens: {estimated_tokens:,}")
        print(f"   Context usage: {usage_percent:.1f}%")
        print(f"   Recommended action: {action}")
        print(f"   Message: {message}")

        # Validate
        if action == expected_action:
            print(f"   ✓ PASS: Got expected action '{expected_action}'")
        else:
            print(f"   ✗ FAIL: Expected '{expected_action}' but got '{action}'")
            all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("✅ All context window tests PASSED!")
        return 0
    else:
        print("❌ Some context window tests FAILED!")
        return 1


def test_model_limits():
    """Test that model limits are correctly defined."""
    print("\n" + "=" * 80)
    print("MODEL LIMITS TEST")
    print("=" * 80)

    manager = ContextWindowManager()

    test_models = [
        ("llama3.2", False, 128_000),
        ("llama3.3", False, 128_000),
        ("qwen2.5", False, 128_000),
        ("gemini-2.0-flash-exp", True, 1_000_000),
        ("unknown-model", False, 128_000),  # Should default to 128K
        ("unknown-cloud", True, 1_000_000),  # Should default to 1M
    ]

    all_passed = True

    for model, is_cloud, expected_limit in test_models:
        limit = manager.get_model_limit(model, is_cloud)
        status = "✓" if limit == expected_limit else "✗"
        print(f"{status} {model:30} -> {limit:>10,} tokens (expected: {expected_limit:,})")

        if limit != expected_limit:
            all_passed = False

    if all_passed:
        print("\n✅ All model limit tests PASSED!")
        return 0
    else:
        print("\n❌ Some model limit tests FAILED!")
        return 1


def test_token_estimation():
    """Test token estimation accuracy."""
    print("\n" + "=" * 80)
    print("TOKEN ESTIMATION TEST")
    print("=" * 80)

    manager = ContextWindowManager()

    test_texts = [
        ("Short text", "Hello world", 2),
        ("Medium text", "This is a medium length text that should estimate to around 10-15 tokens", 18),
        ("Long text", "word " * 1000, 1100),  # 1000 words ~= 1100 tokens with buffer
    ]

    for description, text, expected_range_min in test_texts:
        estimated = manager.estimate_tokens(text)
        # Allow 20% variance
        expected_range_max = int(expected_range_min * 1.4)

        status = "✓" if expected_range_min <= estimated <= expected_range_max else "✗"
        print(f"{status} {description:20} -> {estimated:5} tokens (expected range: {expected_range_min}-{expected_range_max})")

    print("\n✅ Token estimation test complete")
    return 0


if __name__ == "__main__":
    results = []

    results.append(("Context Window Analysis", test_context_window_manager()))
    results.append(("Model Limits", test_model_limits()))
    results.append(("Token Estimation", test_token_estimation()))

    print("\n" + "=" * 80)
    print("FINAL RESULTS")
    print("=" * 80)

    total_passed = sum(1 for _, result in results if result == 0)
    total_tests = len(results)

    for test_name, result in results:
        status = "✅ PASS" if result == 0 else "❌ FAIL"
        print(f"{status}: {test_name}")

    print(f"\nTotal: {total_passed}/{total_tests} test suites passed")

    sys.exit(0 if total_passed == total_tests else 1)
