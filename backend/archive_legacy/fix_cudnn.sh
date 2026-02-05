#!/bin/bash
# One-time fix script for cuDNN loading issue
# 
# NOTE: This script is now optional. The runtime solution in cudnn_init.py
# automatically handles cuDNN library paths. You only need to run this script
# if you want to manually clean up bundled cuDNN libraries.
#
# Based on solution from https://github.com/m-bain/whisperX/issues/1100

set -e

echo "One-time cuDNN cleanup script..."
echo "Note: Runtime solution in cudnn_init.py handles this automatically."
echo ""

# Get the venv path
if [ -z "$VIRTUAL_ENV" ]; then
    VENV_PATH=".venv"
else
    VENV_PATH="$VIRTUAL_ENV"
fi

echo "Venv path: $VENV_PATH"

# Remove bundled cuDNN .so files (keep directory structure for PyTorch)
# Check common Python versions
for pyver in "3.12" "3.13" "3.11" "3.10"; do
    CUDNN_DIR="$VENV_PATH/lib/python$pyver/site-packages/nvidia/cudnn"
    if [ -d "$CUDNN_DIR" ]; then
        echo "Removing bundled cuDNN libraries from: $CUDNN_DIR"
        find "$CUDNN_DIR" -name "*.so*" -type f -delete 2>/dev/null || true
        echo "✓ Cleaned cuDNN libraries for Python $pyver"
    fi
done

echo ""
echo "✓ Cleanup complete!"
echo ""
echo "The runtime solution (cudnn_init.py) will automatically:"
echo "  - Use system cuDNN libraries from /usr/lib"
echo "  - Remove venv cuDNN paths from LD_LIBRARY_PATH"
echo "  - Configure proper library loading at startup"

