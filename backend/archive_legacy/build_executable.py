#!/usr/bin/env python3
"""
PyInstaller build script for Chronicle Keeper FastAPI backend.
Creates a standalone executable that can be used as a Tauri sidecar.
"""

import os
import sys
import subprocess
from pathlib import Path

# Build configuration
SCRIPT_DIR = Path(__file__).parent
SRC_DIR = SCRIPT_DIR / "src"
MAIN_SCRIPT = SRC_DIR / "main.py"
SPEC_FILE = SCRIPT_DIR / "chronicle-keeper.spec"
DIST_DIR = SCRIPT_DIR / "dist"

def create_spec_file():
    """Create PyInstaller spec file for the FastAPI application."""
    spec_content = f'''# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['{MAIN_SCRIPT}'],
    pathex=['{SRC_DIR}'],
    binaries=[],
    datas=[
        # Include any data files needed by the application
        # ('path/to/data', 'destination/in/bundle'),
    ],
    hiddenimports=[
        # FastAPI and dependencies
        'fastapi',
        'uvicorn',
        'uvicorn.workers.uvicorn_worker',
        'uvicorn.logging',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'pydantic',
        'starlette',
        
        # Audio processing
        'whisperx',
        'torch',
        'torchaudio',
        'librosa',
        'soundfile',
        
        # LLM integrations
        'google.generativeai',
        'requests',
        
        # File processing
        'zipfile',
        'tempfile',
        'json',
        'pathlib',
        
        # Storage
        'platformdirs',
    ],
    hookspath=[],
    hooksconfig={{}},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary packages to reduce size
        'matplotlib',
        'PIL',
        'tkinter',
        'test',
        'unittest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='chronicle-keeper-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
'''
    
    with open(SPEC_FILE, 'w') as f:
        f.write(spec_content)
    
    print(f"Created PyInstaller spec file: {SPEC_FILE}")

def build_executable():
    """Build the standalone executable using PyInstaller."""
    if not SPEC_FILE.exists():
        create_spec_file()
    
    # Run PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        str(SPEC_FILE)
    ]
    
    print(f"Building executable with command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, cwd=SCRIPT_DIR, check=True, capture_output=True, text=True)
        print("Build successful!")
        print(result.stdout)
        
        # Find the built executable
        exe_path = DIST_DIR / "chronicle-keeper-backend"
        if sys.platform == "win32":
            exe_path = exe_path.with_suffix(".exe")
        
        if exe_path.exists():
            print(f"Executable created at: {exe_path}")
            print(f"Size: {exe_path.stat().st_size / 1024 / 1024:.1f} MB")
        else:
            print("Warning: Executable not found in expected location")
            
    except subprocess.CalledProcessError as e:
        print(f"Build failed: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        sys.exit(1)

if __name__ == "__main__":
    build_executable()