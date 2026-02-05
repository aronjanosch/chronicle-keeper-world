#!/usr/bin/env python3
"""
Chronicle Keeper Backend Server
Entry point for running the FastAPI application
"""

import uvicorn
import sys
import os

# Ensure backend directory is on the path for app imports
sys.path.insert(0, os.path.dirname(__file__))

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1", 
        port=8000,
        reload=True,
        log_level="info"
    )