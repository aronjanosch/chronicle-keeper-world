import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class DebugManager:
    def __init__(self, debug_dir: str = None):
        """
        Initialize debug manager
        
        Args:
            debug_dir: Directory to store debug files (defaults to project debug-exports)
        """
        if debug_dir is None:
            # Go up from backend/src/storage to project root, then to debug-exports
            current_dir = Path(__file__).parent
            project_root = current_dir.parent.parent.parent
            debug_dir = project_root / "debug-exports"
        
        self.debug_dir = Path(debug_dir)
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        self.sessions_dir = self.debug_dir / "sessions"
        self.transcripts_dir = self.debug_dir / "transcripts"  
        self.llm_outputs_dir = self.debug_dir / "llm-outputs"
        self.prompts_dir = self.debug_dir / "prompts"
        self.metadata_dir = self.debug_dir / "metadata"
        
        for dir_path in [self.sessions_dir, self.transcripts_dir, self.llm_outputs_dir, 
                        self.prompts_dir, self.metadata_dir]:
            dir_path.mkdir(exist_ok=True)
    
    def get_debug_filename(self, session_id: str, prefix: str, extension: str = ".json") -> str:
        """Generate debug filename with timestamp"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{prefix}_{session_id[:8]}_{timestamp}{extension}"
    
    def export_session_data(self, session_id: str, session_data: Dict[str, Any]):
        """Export complete session data for debugging"""
        try:
            filename = self.get_debug_filename(session_id, "session_data")
            filepath = self.sessions_dir / filename
            
            # Add debug metadata
            debug_data = {
                "debug_info": {
                    "exported_at": datetime.now().isoformat(),
                    "session_id": session_id,
                    "export_type": "session_data"
                },
                "session_data": session_data
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Exported session data to {filepath}")
            return str(filepath)
        except Exception as e:
            logger.error(f"Failed to export session data: {e}")
            return None
    
    def export_transcript(self, session_id: str, transcript: str, processing_info: Dict[str, Any] = None):
        """Export raw transcript and processing information"""
        try:
            filename = self.get_debug_filename(session_id, "transcript")
            filepath = self.transcripts_dir / filename
            
            debug_data = {
                "debug_info": {
                    "exported_at": datetime.now().isoformat(),
                    "session_id": session_id,
                    "export_type": "transcript"
                },
                "transcript": transcript,
                "processing_info": processing_info or {}
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            
            # Also export as plain text for easier reading
            txt_filename = self.get_debug_filename(session_id, "transcript", ".txt")
            txt_filepath = self.transcripts_dir / txt_filename
            with open(txt_filepath, 'w', encoding='utf-8') as f:
                f.write(f"=== TRANSCRIPT DEBUG EXPORT ===\n")
                f.write(f"Session ID: {session_id}\n")
                f.write(f"Exported at: {datetime.now().isoformat()}\n")
                f.write(f"Processing info: {json.dumps(processing_info or {}, indent=2)}\n")
                f.write(f"\n=== RAW TRANSCRIPT ===\n\n")
                f.write(transcript)
            
            logger.info(f"Exported transcript to {filepath} and {txt_filepath}")
            return str(filepath)
        except Exception as e:
            logger.error(f"Failed to export transcript: {e}")
            return None
    
    def export_llm_interaction(self, session_id: str, engine: str, prompt: str, response: str, 
                              settings: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """Export full LLM prompt and response for debugging"""
        try:
            filename = self.get_debug_filename(session_id, f"llm_{engine}")
            filepath = self.llm_outputs_dir / filename
            
            debug_data = {
                "debug_info": {
                    "exported_at": datetime.now().isoformat(),
                    "session_id": session_id,
                    "export_type": "llm_interaction",
                    "engine": engine
                },
                "settings": settings or {},
                "prompt": prompt,
                "response": response,
                "metadata": metadata or {}
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            
            # Also export as text for easier reading
            txt_filename = self.get_debug_filename(session_id, f"llm_{engine}", ".txt")
            txt_filepath = self.llm_outputs_dir / txt_filename
            with open(txt_filepath, 'w', encoding='utf-8') as f:
                f.write(f"=== LLM INTERACTION DEBUG EXPORT ===\n")
                f.write(f"Session ID: {session_id}\n")
                f.write(f"Engine: {engine}\n")
                f.write(f"Exported at: {datetime.now().isoformat()}\n")
                f.write(f"Settings: {json.dumps(settings or {}, indent=2)}\n")
                f.write(f"Metadata: {json.dumps(metadata or {}, indent=2)}\n")
                f.write(f"\n=== PROMPT SENT TO LLM ===\n\n")
                f.write(prompt)
                f.write(f"\n\n=== RESPONSE FROM LLM ===\n\n")
                f.write(response)
            
            logger.info(f"Exported LLM interaction to {filepath} and {txt_filepath}")
            return str(filepath)
        except Exception as e:
            logger.error(f"Failed to export LLM interaction: {e}")
            return None
    
    def export_prompt_used(self, session_id: str, prompt_type: str, prompt: str, 
                          language: str, is_custom: bool = False):
        """Export the exact prompt used for generation"""
        try:
            filename = self.get_debug_filename(session_id, f"prompt_{prompt_type}")
            filepath = self.prompts_dir / filename
            
            debug_data = {
                "debug_info": {
                    "exported_at": datetime.now().isoformat(),
                    "session_id": session_id,
                    "export_type": "prompt",
                    "prompt_type": prompt_type,
                    "language": language,
                    "is_custom": is_custom
                },
                "prompt": prompt
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Exported prompt to {filepath}")
            return str(filepath)
        except Exception as e:
            logger.error(f"Failed to export prompt: {e}")
            return None
    
    def export_metadata_analysis(self, session_id: str, analysis_type: str, 
                                analysis_result: Dict[str, Any], transcript: str = None):
        """Export metadata analysis results"""
        try:
            filename = self.get_debug_filename(session_id, f"metadata_{analysis_type}")
            filepath = self.metadata_dir / filename
            
            debug_data = {
                "debug_info": {
                    "exported_at": datetime.now().isoformat(),
                    "session_id": session_id,
                    "export_type": "metadata_analysis",
                    "analysis_type": analysis_type
                },
                "analysis_result": analysis_result,
                "transcript_length": len(transcript) if transcript else 0,
                "transcript": transcript if transcript else None
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Exported metadata analysis to {filepath}")
            return str(filepath)
        except Exception as e:
            logger.error(f"Failed to export metadata analysis: {e}")
            return None
    
    def list_debug_files(self, session_id: str = None) -> Dict[str, list]:
        """List all debug files, optionally filtered by session ID"""
        try:
            debug_files = {
                "sessions": [],
                "transcripts": [],
                "llm_outputs": [],
                "prompts": [],
                "metadata": []
            }
            
            for category, directory in [
                ("sessions", self.sessions_dir),
                ("transcripts", self.transcripts_dir),
                ("llm_outputs", self.llm_outputs_dir),
                ("prompts", self.prompts_dir),
                ("metadata", self.metadata_dir)
            ]:
                if directory.exists():
                    for file_path in directory.glob("*.json"):
                        if session_id is None or session_id[:8] in file_path.name:
                            debug_files[category].append({
                                "filename": file_path.name,
                                "path": str(file_path),
                                "size": file_path.stat().st_size,
                                "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                            })
            
            return debug_files
        except Exception as e:
            logger.error(f"Failed to list debug files: {e}")
            return {}
    
    def cleanup_old_files(self, days_old: int = 7):
        """Clean up debug files older than specified days"""
        try:
            cutoff_time = datetime.now().timestamp() - (days_old * 24 * 3600)
            deleted_count = 0
            
            for directory in [self.sessions_dir, self.transcripts_dir, self.llm_outputs_dir, 
                            self.prompts_dir, self.metadata_dir]:
                if directory.exists():
                    for file_path in directory.iterdir():
                        if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
                            file_path.unlink()
                            deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} old debug files")
            return deleted_count
        except Exception as e:
            logger.error(f"Failed to cleanup old files: {e}")
            return 0