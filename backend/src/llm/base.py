"""
Base LLM client abstract class.

Provides a simple interface that all LLM clients must implement.
Since both Ollama and Gemini now support native structured output,
this base class is kept minimal.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class BaseLLMClient(ABC):
    """
    Abstract base class for LLM clients.

    All LLM clients must implement the abstract methods below.
    Both Ollama and Gemini now use native structured output with
    JSON schema, eliminating the need for shared parsing logic.
    """

    @abstractmethod
    def _call_llm(self, prompt: str, **kwargs) -> str:
        """
        Call the LLM API and return the raw response text.

        This method must be implemented by subclasses to handle
        the specific API call for their LLM service.

        Args:
            prompt: The full prompt to send
            **kwargs: Additional parameters specific to the LLM

        Returns:
            Raw response text from the LLM
        """
        pass

    @abstractmethod
    def generate_summary_with_metadata(self, transcript: str, system_prompt: str, language: str = "en") -> Dict[str, Any]:
        """
        Generate session summary and metadata using structured output.

        Args:
            transcript: The session transcript
            system_prompt: System prompt for summarization
            language: Language code (en, de)

        Returns:
            Dictionary containing:
            - summary: Generated summary text
            - metadata: Dictionary with suggested_tags, mentioned_characters,
                       mentioned_locations, session_tone, key_events
            - raw_response: Raw JSON response from LLM
        """
        pass

    @abstractmethod
    def test_connection(self) -> dict:
        """
        Test connection to the LLM service.

        Returns:
            Dictionary with connection status information
        """
        pass
