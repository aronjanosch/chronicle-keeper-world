"""
cuDNN Library Path Initialization

This module ensures that system cuDNN libraries are used instead of bundled ones.
It must be imported BEFORE any ctranslate2 or whisperx imports.

Based on solutions from:
- https://github.com/m-bain/whisperX/issues/902
- https://github.com/m-bain/whisperX/issues/1100
- https://github.com/m-bain/whisperX/issues/1103
"""

import os
import sys
import ctypes
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def _find_system_cudnn():
    """Find system cuDNN libraries"""
    # Common system library paths
    system_paths = [
        "/usr/lib",
        "/usr/lib64",
        "/usr/local/lib",
        "/usr/local/lib64",
        "/lib",
        "/lib64",
    ]
    
    # Check for libcudnn_cnn.so variants
    cudnn_variants = [
        "libcudnn_cnn.so.9",
        "libcudnn_cnn.so.9.1",
        "libcudnn_cnn.so.9.1.0",
        "libcudnn_cnn.so",
    ]
    
    for lib_path in system_paths:
        for variant in cudnn_variants:
            full_path = Path(lib_path) / variant
            if full_path.exists():
                logger.debug(f"Found system cuDNN library: {full_path}")
                return str(lib_path)
    
    return None

def _remove_venv_cudnn_from_ld_path():
    """Remove venv cuDNN paths from LD_LIBRARY_PATH to avoid conflicts"""
    if "LD_LIBRARY_PATH" not in os.environ:
        return
    
    ld_paths = os.environ["LD_LIBRARY_PATH"].split(":")
    filtered_paths = [
        p for p in ld_paths 
        if p and "nvidia/cudnn" not in p and ".venv" not in p
    ]
    
    if len(filtered_paths) != len(ld_paths):
        os.environ["LD_LIBRARY_PATH"] = ":".join(filtered_paths) if filtered_paths else ""
        logger.debug("Removed venv cuDNN paths from LD_LIBRARY_PATH")

def _remove_bundled_cudnn():
    """Remove bundled cuDNN libraries from venv to force system library usage"""
    import site
    
    # Get all site-packages directories
    site_packages = site.getsitepackages()
    if hasattr(site, 'getsitepackages'):
        # Also check user site-packages
        try:
            user_site = site.getusersitepackages()
            if user_site:
                site_packages.append(user_site)
        except AttributeError:
            pass
    
    # Also check virtualenv if we're in one
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        # We're in a virtualenv
        venv_path = sys.prefix
        # Try common Python versions
        for pyver in ["3.12", "3.13", "3.11", "3.10"]:
            cudnn_dir = Path(venv_path) / "lib" / f"python{pyver}" / "site-packages" / "nvidia" / "cudnn"
            if cudnn_dir.exists():
                try:
                    # Remove only the .so files, keep the directory structure
                    # This prevents the bundled libraries from being loaded
                    for so_file in cudnn_dir.rglob("*.so*"):
                        so_file.unlink()
                        logger.debug(f"Removed bundled cuDNN library: {so_file}")
                except Exception as e:
                    logger.debug(f"Could not remove bundled cuDNN from {cudnn_dir}: {e}")
    
    # Check standard site-packages
    for site_pkg in site_packages:
        cudnn_dir = Path(site_pkg) / "nvidia" / "cudnn"
        if cudnn_dir.exists():
            try:
                for so_file in cudnn_dir.rglob("*.so*"):
                    so_file.unlink()
                    logger.debug(f"Removed bundled cuDNN library: {so_file}")
            except Exception as e:
                logger.debug(f"Could not remove bundled cuDNN from {cudnn_dir}: {e}")

def _setup_library_paths():
    """Configure library paths to use system cuDNN"""
    # Remove bundled cuDNN libraries first (they're broken/incompatible)
    _remove_bundled_cudnn()
    
    # Remove venv cuDNN from LD_LIBRARY_PATH
    _remove_venv_cudnn_from_ld_path()
    
    # Find system cuDNN
    system_cudnn_path = _find_system_cudnn()
    
    if system_cudnn_path:
        # Add system cuDNN path to LD_LIBRARY_PATH if not already present
        current_ld_path = os.environ.get("LD_LIBRARY_PATH", "")
        if system_cudnn_path not in current_ld_path:
            if current_ld_path:
                os.environ["LD_LIBRARY_PATH"] = f"{system_cudnn_path}:{current_ld_path}"
            else:
                os.environ["LD_LIBRARY_PATH"] = system_cudnn_path
            logger.info(f"Configured LD_LIBRARY_PATH to use system cuDNN from {system_cudnn_path}")
    else:
        logger.warning("System cuDNN not found, PyTorch will use its internal handling")

def _preload_system_cudnn():
    """Preload system cuDNN libraries to ensure they're available"""
    system_cudnn_path = _find_system_cudnn()
    if not system_cudnn_path:
        return
    
    # Try to preload libcudnn_cnn.so to ensure it's available
    cudnn_libs = [
        "libcudnn_cnn.so.9",
        "libcudnn_cnn.so.9.1",
        "libcudnn_cnn.so.9.1.0",
        "libcudnn_cnn.so",
    ]
    
    for lib_name in cudnn_libs:
        lib_path = Path(system_cudnn_path) / lib_name
        if lib_path.exists():
            try:
                ctypes.CDLL(str(lib_path), mode=ctypes.RTLD_GLOBAL)
                logger.debug(f"Preloaded cuDNN library: {lib_path}")
                break
            except OSError as e:
                logger.debug(f"Could not preload {lib_path}: {e}")
                continue

def initialize_cudnn():
    """
    Initialize cuDNN library paths.
    
    This function must be called before importing ctranslate2 or whisperx.
    It configures the system to use system-wide cuDNN libraries instead of
    bundled ones from nvidia-cudnn-cu12 package.
    """
    _setup_library_paths()
    _preload_system_cudnn()

# Auto-initialize when module is imported
initialize_cudnn()
