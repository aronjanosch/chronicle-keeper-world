import requests
import json
import subprocess
import time
import logging
import re
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)

class OllamaClient:
    def __init__(self, base_url: str = "http://127.0.0.1:11434", model: str = "llama3.2"):
        """
        Initialize Ollama client
        
        Args:
            base_url: Ollama server URL
            model: Model name to use (default: llama3.2)
        """
        self.base_url = base_url
        self.model = model
        self.api_url = f"{base_url}/api"
        
    def is_server_running(self) -> bool:
        """Check if Ollama server is running"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False
    
    def ensure_server_running(self) -> bool:
        """Ensure Ollama server is running, try to start if not"""
        if self.is_server_running():
            return True
            
        logger.info("Ollama server not running, attempting to start...")
        try:
            # Try to start Ollama (assuming it's in PATH)
            subprocess.Popen(
                ["ollama", "serve"], 
                stdout=subprocess.DEVNULL, 
                stderr=subprocess.DEVNULL
            )
            
            # Wait for server to start
            for _ in range(10):  # Wait up to 10 seconds
                time.sleep(1)
                if self.is_server_running():
                    logger.info("Ollama server started successfully")
                    return True
            
            logger.error("Failed to start Ollama server within timeout")
            return False
            
        except FileNotFoundError:
            logger.error("Ollama not found in PATH. Please install Ollama.")
            return False
        except Exception as e:
            logger.error(f"Error starting Ollama: {e}")
            return False
    
    def is_model_available(self) -> bool:
        """Check if the specified model is available"""
        try:
            response = requests.get(f"{self.api_url}/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                return any(model["name"].startswith(self.model) for model in models)
            return False
        except requests.RequestException:
            return False
    
    def pull_model(self) -> bool:
        """Pull the model if not available"""
        logger.info(f"Pulling model {self.model}...")
        try:
            response = requests.post(
                f"{self.api_url}/pull",
                json={"name": self.model},
                stream=True,
                timeout=300  # 5 minute timeout for model download
            )
            
            if response.status_code == 200:
                # Stream the download progress
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        if "status" in data:
                            logger.info(f"Model pull: {data['status']}")
                        if data.get("status") == "success":
                            return True
            
            return False
            
        except requests.RequestException as e:
            logger.error(f"Error pulling model: {e}")
            return False
    
    def ensure_model_ready(self) -> bool:
        """Ensure model is available, pull if necessary"""
        if not self.ensure_server_running():
            return False
            
        if self.is_model_available():
            return True
            
        return self.pull_model()
    
    def generate_summary(self, transcript: str, system_prompt: str) -> str:
        """
        Generate session summary using Ollama
        
        Args:
            transcript: The session transcript
            system_prompt: System prompt for summarization
            
        Returns:
            Generated summary
        """
        if not self.ensure_model_ready():
            raise Exception("Ollama model not available")
        
        # Prepare the prompt
        full_prompt = f"{system_prompt}\n\nTranscript:\n{transcript}"
        
        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "max_tokens": 2048
                    }
                },
                timeout=120  # 2 minute timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip()
            else:
                raise Exception(f"Ollama API error: {response.status_code}")
                
        except requests.RequestException as e:
            logger.error(f"Error calling Ollama API: {e}")
            raise Exception(f"Failed to generate summary: {str(e)}")

    def generate_summary_with_metadata(self, transcript: str, system_prompt: str) -> Dict[str, Any]:
        """
        Generate session summary and metadata suggestions in single optimized call
        
        Args:
            transcript: The session transcript
            system_prompt: System prompt for summarization
            
        Returns:
            Dictionary containing summary and metadata suggestions
        """
        if not self.ensure_model_ready():
            raise Exception("Ollama model not available")
        
        # Create a highly structured prompt that enforces the exact format
        enhanced_prompt = f"""{system_prompt}

CRITICAL: Follow this EXACT format structure:

**Summary of Events:**
- [Major plot development or revelation]
- [Key combat outcome or story change]
- [Important discovery or event]

**Key Decisions & Next Steps:**
- [A choice the party made]
- [A goal or action item for the next session]
- [Unresolved situation requiring future action]

---METADATA---
{{
    "suggested_tags": [],
    "mentioned_characters": [],
    "mentioned_locations": [],
    "session_tone": [],
    "key_events": []
}}

INSTRUCTIONS:
1. First write the summary using the EXACT format above with "**Summary of Events:**" and "**Key Decisions & Next Steps:**"
2. Then add "---METADATA---" as a separator
3. Then add the JSON metadata block
4. Do NOT deviate from this structure

Metadata guidelines:
- suggested_tags: Activity types (combat, social, exploration, investigation, puzzle, travel) and tone (dramatic, comedic, tense, mystery, political)
- mentioned_characters: Names of NPCs, characters, or entities mentioned multiple times
- mentioned_locations: Place names mentioned in the session
- session_tone: Overall mood/tone descriptors
- key_events: Major story beats or important occurrences

Transcript:
{transcript}"""
        
        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": enhanced_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Lower temperature for consistent formatting
                        "top_p": 0.9,
                        "max_tokens": 2048
                    }
                },
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()
                full_response = result.get("response", "").strip()
                
                # Parse using the explicit separator
                metadata, summary = self._parse_with_separator(full_response)
                
                return {
                    "summary": summary,
                    "metadata": metadata
                }
            else:
                raise Exception(f"Ollama API error: {response.status_code}")
                
        except requests.RequestException as e:
            logger.error(f"Error calling Ollama API: {e}")
            raise Exception(f"Failed to generate summary with metadata: {str(e)}")

    def _parse_with_separator(self, full_response: str) -> tuple[Dict[str, List[str]], str]:
        """Parse response using the explicit ---METADATA--- separator"""
        
        # First try the explicit separator
        if "---METADATA---" in full_response:
            parts = full_response.split("---METADATA---")
            summary = parts[0].strip()
            metadata_text = parts[1].strip()
            
            metadata = self._extract_json_from_text(metadata_text)
            if metadata:
                return metadata, summary
        
        # Fall back to the existing parsing strategies
        return self._parse_summary_and_metadata(full_response)

    def _generate_formatted_summary(self, transcript: str, system_prompt: str) -> str:
        """Generate summary with strict adherence to the format template"""
        
        # Create a very explicit prompt focused ONLY on the summary format
        summary_prompt = f"""{system_prompt}

CRITICAL FORMATTING REQUIREMENTS:
- You MUST use exactly this structure
- Start with "**Summary of Events:**" 
- Use bullet points starting with "- "
- Then "**Key Decisions & Next Steps:**"
- Use bullet points starting with "- "
- Do NOT add any other text, explanations, or JSON
- Do NOT use numbered lists
- Do NOT add introduction or conclusion text

Example of EXACT format required:

**Summary of Events:**
- The party encountered hostile forces at the village outskirts
- Combat engagement resulted in enemy casualties and tactical advantage

**Key Decisions & Next Steps:**
- Party chose to pursue retreating enemies rather than fortify position  
- Next session will focus on investigating the enemy camp for intelligence

Now analyze this transcript:

{transcript}"""

        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": summary_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Lower temperature for more consistent formatting
                        "top_p": 0.9,
                        "max_tokens": 1024  # Shorter for focused summary
                    }
                },
                timeout=90
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip()
            else:
                raise Exception(f"Ollama API error: {response.status_code}")
                
        except requests.RequestException as e:
            logger.error(f"Error generating summary: {e}")
            raise Exception(f"Failed to generate summary: {str(e)}")

    def _analyze_metadata_separately(self, transcript: str) -> Dict[str, List[str]]:
        """Analyze transcript separately for metadata extraction"""
        
        metadata_prompt = f"""Analyze this TTRPG transcript and extract metadata. Return ONLY valid JSON with this exact structure:

{{
    "suggested_tags": [],
    "mentioned_characters": [],
    "mentioned_locations": [],
    "session_tone": [],
    "key_events": []
}}

Guidelines:
- suggested_tags: Activity types (combat, social, exploration, investigation, puzzle, travel) and tone (dramatic, comedic, tense, mystery, political)
- mentioned_characters: Names of NPCs, characters, or entities mentioned multiple times
- mentioned_locations: Place names mentioned in the session
- session_tone: Overall mood/tone descriptors
- key_events: Major story beats or important occurrences

Only include clearly mentioned and significant items. Limit each array to 5-8 items.

Transcript:
{transcript}"""

        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": metadata_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "top_p": 0.9,
                        "max_tokens": 512
                    }
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                response_text = result.get("response", "").strip()
                
                # Parse JSON from response
                metadata = self._extract_json_from_text(response_text)
                if metadata:
                    return metadata
                else:
                    logger.warning("Could not parse metadata from response")
                    return self._empty_metadata()
            else:
                raise Exception(f"Ollama API error: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error analyzing metadata: {e}")
            return self._empty_metadata()

    def _empty_metadata(self) -> Dict[str, List[str]]:
        """Return empty metadata structure"""
        return {
            "suggested_tags": [],
            "mentioned_characters": [],
            "mentioned_locations": [],
            "session_tone": [],
            "key_events": []
        }

    def _generate_with_structured_output(self, transcript: str, system_prompt: str) -> Dict[str, Any]:
        """Generate using Ollama's structured output with JSON schema"""
        
        # Define the JSON schema for the response
        response_schema = {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "The session summary following the provided format"
                },
                "metadata": {
                    "type": "object",
                    "properties": {
                        "suggested_tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Activity types and tone tags"
                        },
                        "mentioned_characters": {
                            "type": "array", 
                            "items": {"type": "string"},
                            "description": "Names of NPCs and characters mentioned"
                        },
                        "mentioned_locations": {
                            "type": "array",
                            "items": {"type": "string"}, 
                            "description": "Place names mentioned in the session"
                        },
                        "session_tone": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Overall mood/tone descriptors"
                        },
                        "key_events": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Major story beats or important occurrences"
                        }
                    },
                    "required": ["suggested_tags", "mentioned_characters", "mentioned_locations", "session_tone", "key_events"]
                }
            },
            "required": ["summary", "metadata"]
        }
        
        prompt = f"""{system_prompt}

Please analyze the following TTRPG session transcript and generate both a summary and metadata.

CRITICAL: The summary MUST follow this exact format:

**Summary of Events:**
- [Major plot development or revelation]
- [Key combat outcome or story change]
- [Important discovery or event]

**Key Decisions & Next Steps:**
- [A choice the party made]
- [A goal or action item for the next session]
- [Unresolved situation requiring future action]

For the metadata, also extract:
- suggested_tags: Activity types (combat, social, exploration, investigation, puzzle, travel) and tone (dramatic, comedic, tense, mystery, political)
- mentioned_characters: Names of NPCs, characters, or entities mentioned multiple times
- mentioned_locations: Place names mentioned in the session
- session_tone: Overall mood/tone descriptors
- key_events: Major story beats or important occurrences

Only include items that are clearly mentioned and significant. Limit each array to 5-8 most relevant items.

Return the result as JSON with both summary and metadata fields.

Transcript:
{transcript}"""

        response = requests.post(
            f"{self.api_url}/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "format": response_schema,
                "options": {
                    "temperature": 0.3,  # Lower temperature for more structured output
                    "top_p": 0.9,
                    "max_tokens": 3072
                }
            },
            timeout=150  # 2.5 minute timeout for longer response
        )
        
        if response.status_code == 200:
            result = response.json()
            response_text = result.get("response", "").strip()
            
            # Parse the structured JSON response
            parsed_result = json.loads(response_text)
            return {
                "summary": parsed_result["summary"],
                "metadata": parsed_result["metadata"]
            }
        else:
            raise Exception(f"Ollama API error: {response.status_code}")

    def _generate_with_text_parsing(self, transcript: str, system_prompt: str) -> Dict[str, Any]:
        """Generate using text parsing approach (fallback)"""
        
        enhanced_prompt = f"""{system_prompt}

Please analyze the following TTRPG session transcript and generate both a summary and metadata.

CRITICAL: The summary MUST follow this exact format:

**Summary of Events:**
- [Major plot development or revelation]
- [Key combat outcome or story change]
- [Important discovery or event]

**Key Decisions & Next Steps:**
- [A choice the party made]
- [A goal or action item for the next session]
- [Unresolved situation requiring future action]

After the summary, add this JSON metadata block:

METADATA_JSON:
{{
    "suggested_tags": [],
    "mentioned_characters": [],
    "mentioned_locations": [],
    "session_tone": [],
    "key_events": []
}}

Guidelines for metadata:
- suggested_tags: Activity types (combat, social, exploration, investigation, puzzle, travel) and tone (dramatic, comedic, tense, mystery, political)
- mentioned_characters: Names of NPCs, characters, or entities mentioned multiple times
- mentioned_locations: Place names mentioned in the session
- session_tone: Overall mood/tone descriptors
- key_events: Major story beats or important occurrences

Only include items that are clearly mentioned and significant. Limit each array to 5-8 most relevant items.

Transcript:
{transcript}"""
        
        response = requests.post(
            f"{self.api_url}/generate",
            json={
                "model": self.model,
                "prompt": enhanced_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_tokens": 3072
                }
            },
            timeout=150  # 2.5 minute timeout for longer response
        )
        
        if response.status_code == 200:
            result = response.json()
            full_response = result.get("response", "").strip()
            
            # Extract metadata from response using multiple parsing strategies
            metadata, summary = self._parse_summary_and_metadata(full_response)
            
            return {
                "summary": summary,
                "metadata": metadata
            }
        else:
            raise Exception(f"Ollama API error: {response.status_code}")

    def _parse_summary_and_metadata(self, full_response: str) -> tuple[Dict[str, List[str]], str]:
        """
        Parse summary and metadata from LLM response using multiple strategies
        
        Args:
            full_response: The full response from the LLM
            
        Returns:
            Tuple of (metadata, summary)
        """
        empty_metadata = {
            "suggested_tags": [],
            "mentioned_characters": [],
            "mentioned_locations": [],
            "session_tone": [],
            "key_events": []
        }
        
        # Strategy 1: Look for METADATA_JSON: delimiter
        if "METADATA_JSON:" in full_response:
            parts = full_response.split("METADATA_JSON:")
            summary = parts[0].strip()
            metadata_text = parts[1].strip()
            
            metadata = self._extract_json_from_text(metadata_text)
            if metadata:
                return metadata, summary
        
        # Strategy 2: Look for ```json code blocks
        json_block_pattern = r'```json\s*\n(.*?)\n```'
        matches = re.findall(json_block_pattern, full_response, re.DOTALL)
        if matches:
            # Take the last JSON block (most likely to be metadata)
            metadata_text = matches[-1].strip()
            metadata = self._extract_json_from_text(metadata_text)
            if metadata:
                # Remove the JSON block from summary
                summary = re.sub(json_block_pattern, '', full_response, flags=re.DOTALL).strip()
                # Clean up any "**Metadata JSON:**" headers
                summary = re.sub(r'\*\*Metadata JSON:\*\*\s*', '', summary).strip()
                return metadata, summary
        
        # Strategy 3: Look for any JSON object in the response
        json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
        json_matches = re.findall(json_pattern, full_response, re.DOTALL)
        for json_text in reversed(json_matches):  # Check from end, more likely to be metadata
            metadata = self._extract_json_from_text(json_text)
            if metadata and any(metadata.values()):  # Check if metadata has actual content
                # Remove the JSON from summary
                summary = full_response.replace(json_text, '').strip()
                # Clean up any headers
                summary = re.sub(r'\*\*Metadata JSON:\*\*\s*', '', summary).strip()
                return metadata, summary
        
        # No metadata found, return empty metadata and full response as summary
        logger.warning("Could not extract metadata from LLM response, using empty metadata")
        return empty_metadata, full_response

    def _extract_json_from_text(self, text: str) -> Optional[Dict[str, List[str]]]:
        """
        Extract and parse JSON from text, handling various formats
        
        Args:
            text: Text that should contain JSON
            
        Returns:
            Parsed metadata dictionary or None if parsing fails
        """
        try:
            # Clean up the text
            text = text.strip()
            
            # Remove markdown formatting
            text = text.replace('```json', '').replace('```', '').strip()
            
            # If text doesn't start with {, try to find JSON object
            if not text.startswith('{'):
                json_start = text.find('{')
                if json_start != -1:
                    text = text[json_start:]
            
            # If text doesn't end with }, try to find end of JSON object
            if not text.endswith('}'):
                json_end = text.rfind('}')
                if json_end != -1:
                    text = text[:json_end + 1]
            
            # Parse JSON
            metadata = json.loads(text)
            
            # Validate that it has the expected structure
            expected_keys = {"suggested_tags", "mentioned_characters", "mentioned_locations", "session_tone", "key_events"}
            if isinstance(metadata, dict) and any(key in metadata for key in expected_keys):
                # Ensure all expected keys exist with empty lists as defaults
                for key in expected_keys:
                    if key not in metadata:
                        metadata[key] = []
                    elif not isinstance(metadata[key], list):
                        metadata[key] = []
                
                return metadata
            
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.debug(f"Failed to parse JSON from text: {e}")
        
        return None
    
    def test_connection(self) -> dict:
        """Test connection and return status info"""
        status = {
            "server_running": self.is_server_running(),
            "model_available": False,
            "error": None
        }
        
        if status["server_running"]:
            status["model_available"] = self.is_model_available()
        else:
            status["error"] = "Ollama server not running"
        
        return status
    
    def analyze_metadata(self, transcript: str) -> Dict[str, List[str]]:
        """
        Analyze transcript and suggest metadata tags, characters, and locations
        
        Args:
            transcript: The session transcript
            
        Returns:
            Dictionary with suggested metadata
        """
        if not self.ensure_model_ready():
            logger.error("Ollama model not available for metadata analysis")
            return {
                "suggested_tags": [],
                "mentioned_characters": [],
                "mentioned_locations": [],
                "session_tone": [],
                "key_events": []
            }
        
        # Prepare the analysis prompt
        analysis_prompt = f"""Analyze the following TTRPG session transcript and extract metadata. Return ONLY a JSON object with the following structure:
{{
    "suggested_tags": [],
    "mentioned_characters": [],
    "mentioned_locations": [],
    "session_tone": [],
    "key_events": []
}}

Guidelines:
- suggested_tags: Activity types (combat, social, exploration, investigation, puzzle, travel) and tone (dramatic, comedic, tense, mystery, political)
- mentioned_characters: Names of NPCs, characters, or entities mentioned multiple times
- mentioned_locations: Place names mentioned in the session
- session_tone: Overall mood/tone descriptors
- key_events: Major story beats or important occurrences

Only include items that are clearly mentioned and significant. Limit each array to 5-8 most relevant items.

Transcript:
{transcript}

JSON Response:"""
        
        try:
            response = requests.post(
                f"{self.api_url}/generate",
                json={
                    "model": self.model,
                    "prompt": analysis_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_p": 0.9,
                        "max_tokens": 1024
                    }
                },
                timeout=60  # 1 minute timeout for metadata analysis
            )
            
            if response.status_code == 200:
                result = response.json()
                result_text = result.get("response", "").strip()
                
                # Try to extract JSON from the response
                if result_text.startswith('{') and result_text.endswith('}'):
                    try:
                        return json.loads(result_text)
                    except json.JSONDecodeError:
                        pass
                
                # Fallback: try to find JSON in the response
                json_start = result_text.find('{')
                json_end = result_text.rfind('}') + 1
                if json_start != -1 and json_end > json_start:
                    try:
                        json_content = result_text[json_start:json_end]
                        return json.loads(json_content)
                    except json.JSONDecodeError:
                        pass
                
                # If JSON parsing fails, return empty structure
                logger.warning("Could not parse JSON from Ollama metadata analysis response")
                return {
                    "suggested_tags": [],
                    "mentioned_characters": [],
                    "mentioned_locations": [],
                    "session_tone": [],
                    "key_events": []
                }
            else:
                raise Exception(f"Ollama API error: {response.status_code}")
                
        except requests.RequestException as e:
            logger.error(f"Error calling Ollama API for metadata analysis: {e}")
            return {
                "suggested_tags": [],
                "mentioned_characters": [],
                "mentioned_locations": [],
                "session_tone": [],
                "key_events": []
            }