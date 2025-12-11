"""
Context Window Manager for Chronicle Keeper.

Handles token counting, context window validation, and intelligent
recommendations for switching between local and cloud LLMs based
on transcript size.
"""

import logging
from typing import Dict, Any, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class RecommendedAction(str, Enum):
    """Recommended actions based on context window analysis."""
    USE_AS_IS = "use_as_is"
    WARN_HIGH_USAGE = "warn_high_usage"
    SWITCH_TO_CLOUD = "switch_to_cloud"
    REQUIRE_CLOUD = "require_cloud"
    CHUNKING_REQUIRED = "chunking_required"


class ContextWindowManager:
    """
    Manages context window limits and provides intelligent switching recommendations.

    Context window limits (approximate):
    - Gemini 2.0 Flash: 1,000,000 tokens
    - Llama 3.2/3.3: 128,000 tokens
    - Qwen2.5 (7B-32B): 128,000 tokens
    - Qwen2.5 (72B+): 1,000,000 tokens
    - Mistral: 128,000 tokens
    """

    # Context window limits in tokens
    LIMITS = {
        # Cloud models
        "gemini-2.0-flash-exp": 1_000_000,
        "gemini-2.0-flash": 1_000_000,
        "gemini-1.5-pro": 2_000_000,
        "gemini-1.5-flash": 1_000_000,

        # Ollama models (128K standard)
        "llama3.2": 128_000,
        "llama3.3": 128_000,
        "llama3.1": 128_000,
        "qwen2.5": 128_000,
        "mistral": 128_000,
        "gemma2": 128_000,

        # Large Qwen models with extended context
        "qwen2.5:72b": 1_000_000,
        "qwen2.5:32b": 128_000,
        "qwen2.5:14b": 128_000,
        "qwen2.5:7b": 128_000,
    }

    # Safe usage thresholds
    THRESHOLD_WARN = 0.70      # Warn at 70% usage
    THRESHOLD_HIGH = 0.85      # High usage at 85%
    THRESHOLD_CRITICAL = 0.95  # Critical at 95%

    # Output buffer (reserve tokens for LLM response)
    OUTPUT_BUFFER = 4_000  # Reserve 4K tokens for output

    def __init__(self):
        """Initialize the context window manager."""
        pass

    def get_model_limit(self, model: str, is_cloud: bool = False) -> int:
        """
        Get the context window limit for a specific model.

        Args:
            model: Model name (e.g., "llama3.2", "gemini-2.0-flash-exp")
            is_cloud: Whether this is a cloud model

        Returns:
            Context window limit in tokens
        """
        # Try exact match first
        if model in self.LIMITS:
            return self.LIMITS[model]

        # Try partial match (e.g., "llama3.2:latest" -> "llama3.2")
        for key in self.LIMITS.keys():
            if model.startswith(key):
                return self.LIMITS[key]

        # Default limits
        if is_cloud:
            logger.warning(f"Unknown cloud model '{model}', assuming 1M token limit")
            return 1_000_000
        else:
            logger.warning(f"Unknown local model '{model}', assuming 128K token limit")
            return 128_000

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for text.

        Uses a simple character-based estimation:
        - English: ~4 characters per token
        - With some buffer for formatting

        Args:
            text: Text to estimate

        Returns:
            Estimated token count
        """
        if not text:
            return 0

        # Simple estimation: ~4 characters per token
        # This is conservative (overestimates slightly)
        estimated = len(text) // 4

        # Add 10% buffer for markdown formatting, special characters
        estimated = int(estimated * 1.1)

        return estimated

    def analyze_context(
        self,
        transcript: str,
        system_prompt: str,
        model: str,
        is_cloud: bool = False
    ) -> Dict[str, Any]:
        """
        Analyze whether the content fits within the model's context window.

        Args:
            transcript: The session transcript
            system_prompt: System prompt for summarization
            model: Model name
            is_cloud: Whether this is a cloud model

        Returns:
            Dictionary with analysis results and recommendations
        """
        # Get model's context window limit
        max_tokens = self.get_model_limit(model, is_cloud)

        # Estimate token usage
        transcript_tokens = self.estimate_tokens(transcript)
        prompt_tokens = self.estimate_tokens(system_prompt)
        total_input_tokens = transcript_tokens + prompt_tokens

        # Calculate available tokens (accounting for output buffer)
        available_tokens = max_tokens - self.OUTPUT_BUFFER

        # Calculate usage percentage
        usage_percent = (total_input_tokens / available_tokens) * 100

        # Determine if content fits
        fits = total_input_tokens < available_tokens

        # Determine recommended action
        action = self._determine_action(
            usage_percent=usage_percent,
            fits=fits,
            is_cloud=is_cloud,
            total_input_tokens=total_input_tokens
        )

        # Generate user-friendly message
        message = self._generate_message(action, usage_percent, is_cloud)

        return {
            "fits": fits,
            "estimated_tokens": total_input_tokens,
            "max_tokens": max_tokens,
            "available_tokens": available_tokens,
            "output_buffer": self.OUTPUT_BUFFER,
            "usage_percent": round(usage_percent, 2),
            "recommended_action": action,
            "message": message,
            "model": model,
            "is_cloud": is_cloud,
            "breakdown": {
                "transcript_tokens": transcript_tokens,
                "prompt_tokens": prompt_tokens,
                "total_input": total_input_tokens
            }
        }

    def _determine_action(
        self,
        usage_percent: float,
        fits: bool,
        is_cloud: bool,
        total_input_tokens: int
    ) -> RecommendedAction:
        """
        Determine the recommended action based on context analysis.

        Args:
            usage_percent: Percentage of context window used
            fits: Whether content fits in context window
            is_cloud: Whether using cloud model
            total_input_tokens: Total input token count

        Returns:
            Recommended action
        """
        usage_ratio = usage_percent / 100.0

        # Content doesn't fit
        if not fits:
            if is_cloud:
                # Even cloud can't handle it - need chunking
                return RecommendedAction.CHUNKING_REQUIRED
            else:
                # Local model too small - suggest cloud
                return RecommendedAction.REQUIRE_CLOUD

        # Content fits, but check usage levels
        if usage_ratio >= self.THRESHOLD_HIGH:
            # High usage (85%+)
            if not is_cloud:
                # Suggest switching to cloud for better results
                return RecommendedAction.SWITCH_TO_CLOUD
            else:
                # Already on cloud, just warn about high usage
                return RecommendedAction.WARN_HIGH_USAGE

        elif usage_ratio >= self.THRESHOLD_WARN:
            # Moderate-high usage (70-85%)
            if not is_cloud:
                # Suggest considering cloud
                return RecommendedAction.WARN_HIGH_USAGE
            else:
                # Cloud can handle it fine
                return RecommendedAction.USE_AS_IS

        else:
            # Low usage (<70%) - all good
            return RecommendedAction.USE_AS_IS

    def _generate_message(
        self,
        action: RecommendedAction,
        usage_percent: float,
        is_cloud: bool
    ) -> str:
        """
        Generate a user-friendly message based on the recommended action.

        Args:
            action: Recommended action
            usage_percent: Context window usage percentage
            is_cloud: Whether using cloud model

        Returns:
            User-friendly message
        """
        messages = {
            RecommendedAction.USE_AS_IS: (
                f"Context usage: {usage_percent:.1f}%. Good to proceed."
            ),

            RecommendedAction.WARN_HIGH_USAGE: (
                f"Context usage: {usage_percent:.1f}%. This is a long session. "
                + ("Consider switching to Gemini for better results." if not is_cloud else "Proceeding with caution.")
            ),

            RecommendedAction.SWITCH_TO_CLOUD: (
                f"Context usage: {usage_percent:.1f}%. This session is very long. "
                "Switching to Gemini (cloud) is strongly recommended for optimal results."
            ),

            RecommendedAction.REQUIRE_CLOUD: (
                f"Context usage: {usage_percent:.1f}%. This session exceeds local model capacity. "
                "Cloud model (Gemini) is required to process this transcript."
            ),

            RecommendedAction.CHUNKING_REQUIRED: (
                f"Context usage: {usage_percent:.1f}%. This session is extremely long and exceeds "
                "even cloud model capacity. Transcript chunking will be required."
            ),
        }

        return messages.get(action, "Unknown recommendation")

    def should_block_generation(self, analysis: Dict[str, Any]) -> bool:
        """
        Determine if generation should be blocked based on context analysis.

        Args:
            analysis: Context analysis result from analyze_context()

        Returns:
            True if generation should be blocked, False otherwise
        """
        action = analysis.get("recommended_action")

        # Block if chunking is required (not yet implemented)
        if action == RecommendedAction.CHUNKING_REQUIRED:
            return True

        # Block if cloud is required but using local
        if action == RecommendedAction.REQUIRE_CLOUD and not analysis.get("is_cloud"):
            return True

        return False

    def get_recommendation_for_user(self, analysis: Dict[str, Any]) -> Optional[str]:
        """
        Get a user-facing recommendation string.

        Args:
            analysis: Context analysis result

        Returns:
            Recommendation string or None
        """
        action = analysis.get("recommended_action")

        if action in [RecommendedAction.SWITCH_TO_CLOUD, RecommendedAction.REQUIRE_CLOUD]:
            return "switch_to_cloud"
        elif action == RecommendedAction.CHUNKING_REQUIRED:
            return "chunking_required"
        elif action == RecommendedAction.WARN_HIGH_USAGE:
            return "warn_high_usage"

        return None
