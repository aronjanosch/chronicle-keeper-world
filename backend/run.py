#!/usr/bin/env python3
"""
Chronicle Keeper Backend Server
Entry point for running the FastAPI application
"""

import uvicorn
import sys
import os

# Add src to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Initialize cuDNN library paths early, before any imports that might use it
# This must happen before importing any modules that use ctranslate2/whisperx
try:
    import cudnn_init  # noqa: F401
except ImportError:
    # If cudnn_init doesn't exist, continue (for backwards compatibility)
    pass

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="127.0.0.1", 
        port=8000,
        reload=True,
        log_level="info"
    )