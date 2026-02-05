"""Context window analysis helper."""

from __future__ import annotations

from enum import Enum


class RecommendedAction(str, Enum):
    """Recommended actions based on context window analysis."""

    USE_AS_IS = "use_as_is"
    WARN_HIGH_USAGE = "warn_high_usage"
    SWITCH_TO_CLOUD = "switch_to_cloud"
    REQUIRE_CLOUD = "require_cloud"
    CHUNKING_REQUIRED = "chunking_required"


class ContextWindowAnalyzer:
    """Analyze transcripts vs. model context limits."""

    LIMITS = {
        "gemini-2.5-flash": 1_000_000,
        "gemini-2.0-flash": 1_000_000,
        "gemini-1.5-pro": 2_000_000,
        "gemini-1.5-flash": 1_000_000,
        "llama3.2": 128_000,
        "llama3.3": 128_000,
        "llama3.1": 128_000,
        "qwen2.5": 128_000,
        "mistral": 128_000,
        "gemma2": 128_000,
        "qwen2.5:72b": 1_000_000,
        "qwen2.5:32b": 128_000,
        "qwen2.5:14b": 128_000,
        "qwen2.5:7b": 128_000,
    }

    THRESHOLD_WARN = 0.70
    THRESHOLD_HIGH = 0.85
    THRESHOLD_CRITICAL = 0.95
    OUTPUT_BUFFER = 4_000

    def get_model_limit(self, model: str, is_cloud: bool) -> int:
        if model in self.LIMITS:
            return self.LIMITS[model]
        for key, limit in self.LIMITS.items():
            if model.startswith(key):
                return limit
        return 1_000_000 if is_cloud else 128_000

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        estimated = len(text) // 4
        return int(estimated * 1.1)

    def analyze(self, transcript: str, prompt: str, model: str, is_cloud: bool) -> dict:
        max_tokens = self.get_model_limit(model, is_cloud)
        transcript_tokens = self.estimate_tokens(transcript)
        prompt_tokens = self.estimate_tokens(prompt)
        total_input_tokens = transcript_tokens + prompt_tokens
        available_tokens = max_tokens - self.OUTPUT_BUFFER
        usage_percent = (total_input_tokens / available_tokens) * 100
        fits = total_input_tokens < available_tokens

        action = self._determine_action(usage_percent, fits, is_cloud, total_input_tokens)
        message = self._message_for_action(action, usage_percent, is_cloud)

        return {
            "fits": fits,
            "estimated_tokens": total_input_tokens,
            "max_tokens": max_tokens,
            "available_tokens": available_tokens,
            "output_buffer": self.OUTPUT_BUFFER,
            "usage_percent": round(usage_percent, 2),
            "recommended_action": action.value,
            "message": message,
            "model": model,
            "is_cloud": is_cloud,
            "breakdown": {
                "transcript_tokens": transcript_tokens,
                "prompt_tokens": prompt_tokens,
                "total_input": total_input_tokens,
            },
        }

    def _determine_action(
        self, usage_percent: float, fits: bool, is_cloud: bool, total_input_tokens: int
    ) -> RecommendedAction:
        if not fits:
            return RecommendedAction.CHUNKING_REQUIRED
        if usage_percent >= self.THRESHOLD_CRITICAL:
            return RecommendedAction.REQUIRE_CLOUD if not is_cloud else RecommendedAction.WARN_HIGH_USAGE
        if usage_percent >= self.THRESHOLD_HIGH:
            return RecommendedAction.SWITCH_TO_CLOUD if not is_cloud else RecommendedAction.WARN_HIGH_USAGE
        if usage_percent >= self.THRESHOLD_WARN:
            return RecommendedAction.WARN_HIGH_USAGE
        return RecommendedAction.USE_AS_IS

    def _message_for_action(
        self, action: RecommendedAction, usage_percent: float, is_cloud: bool
    ) -> str:
        usage = round(usage_percent, 1)
        if action == RecommendedAction.USE_AS_IS:
            return f"Context usage is {usage}%. Safe to proceed."
        if action == RecommendedAction.WARN_HIGH_USAGE:
            return f"Context usage is {usage}%. Proceed with caution."
        if action == RecommendedAction.SWITCH_TO_CLOUD:
            return f"Context usage is {usage}%. Consider switching to a cloud model."
        if action == RecommendedAction.REQUIRE_CLOUD:
            return f"Context usage is {usage}%. Cloud model required."
        return "Transcript exceeds context window. Chunking required."
