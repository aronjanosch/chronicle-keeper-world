#!/bin/bash
# Fix cuDNN loading issue for WhisperX
# Based on solution from https://github.com/m-bain/whisperX/issues/1100

set -e

echo "Fixing cuDNN loading issue..."

# Get the venv path
if [ -z "$VIRTUAL_ENV" ]; then
    VENV_PATH=".venv"
else
    VENV_PATH="$VIRTUAL_ENV"
fi

PYTHON_VERSION=$(python3 --version | grep -oP '\d+\.\d+' | head -1)
CUDNN_DIR="$VENV_PATH/lib/python$PYTHON_VERSION/site-packages/nvidia/cudnn"

echo "Python version: $PYTHON_VERSION"
echo "Venv path: $VENV_PATH"
echo "cuDNN directory: $CUDNN_DIR"

# Uninstall nvidia-cudnn-cu12 if present
echo "Uninstalling nvidia-cudnn-cu12..."
uv pip uninstall nvidia-cudnn-cu12 2>/dev/null && echo "✓ Uninstalled nvidia-cudnn-cu12" || echo "nvidia-cudnn-cu12 not installed"

# Remove bundled cuDNN directory (check both 3.12 and 3.13 paths)
for pyver in "3.12" "3.13"; do
    CUDNN_DIR_CHECK="$VENV_PATH/lib/python$pyver/site-packages/nvidia/cudnn"
    if [ -d "$CUDNN_DIR_CHECK" ]; then
        echo "Removing bundled cuDNN directory: $CUDNN_DIR_CHECK"
        rm -rf "$CUDNN_DIR_CHECK"
        echo "✓ Removed cuDNN directory for Python $pyver"
    fi
done

# Upgrade ctranslate2 to >=4.6.0
echo "Upgrading ctranslate2 to >=4.6.0..."
uv pip install --no-cache-dir --force-reinstall "ctranslate2>=4.6.0"

# Ensure numpy 2.0.2
echo "Ensuring numpy==2.0.2..."
uv pip install --no-cache-dir --force-reinstall "numpy==2.0.2"

echo ""
echo "✓ Fix complete!"
echo ""
echo "Note: Make sure LD_LIBRARY_PATH is not set to point to venv cuDNN libraries."
echo "The system will use system-wide cuDNN or PyTorch's internal handling."

