# cuDNN Loading Fix - Permanent Solution

## Overview

This project includes a permanent runtime solution for cuDNN library loading issues on Linux systems (especially Arch Linux). The solution automatically configures the system to use system-wide cuDNN libraries instead of bundled ones from the `nvidia-cudnn-cu12` package.

## How It Works

1. **Automatic Initialization**: The `src/cudnn_init.py` module automatically initializes cuDNN library paths when imported, which happens before any `ctranslate2` or `whisperx` imports.

2. **System Library Detection**: The module finds system cuDNN libraries in standard locations (`/usr/lib`, `/usr/lib64`, etc.).

3. **Library Path Configuration**: 
   - Removes bundled cuDNN libraries from the virtual environment
   - Removes venv cuDNN paths from `LD_LIBRARY_PATH`
   - Adds system cuDNN paths to `LD_LIBRARY_PATH` if needed
   - Preloads system cuDNN libraries to ensure availability

4. **Early Initialization**: The initialization happens in two places:
   - `run.py` - Before any application code runs
   - `src/audio/transcription.py` - Before importing whisperx

## Requirements

- System cuDNN libraries installed (e.g., `cudnn` package on Arch Linux)
- Python 3.12+ (though the code handles multiple versions)

## Manual Cleanup (Optional)

If you want to manually clean up bundled cuDNN libraries, you can run:

```bash
./fix_cudnn.sh
```

This script removes bundled `.so` files from the virtual environment. However, this is **optional** since the runtime solution handles everything automatically.

## Troubleshooting

### Issue: Still getting cuDNN loading errors

1. **Check system cuDNN installation**:
   ```bash
   ldconfig -p | grep cudnn
   ```

2. **Verify system libraries exist**:
   ```bash
   ls -la /usr/lib/libcudnn*.so*
   ```

3. **Check Python initialization**:
   ```bash
   uv run python -c "import sys; sys.path.insert(0, 'src'); import cudnn_init; print('OK')"
   ```

### Issue: Library version mismatch

The system cuDNN version (e.g., 9.16.0) may be newer than what ctranslate2 expects (9.1.0). This is usually fine as newer versions are backward compatible. If you encounter issues:

1. Ensure system cuDNN is properly installed and configured
2. Check that `LD_LIBRARY_PATH` includes `/usr/lib` or `/usr/lib64`
3. Verify that the bundled libraries are removed (check `.venv/lib/python*/site-packages/nvidia/cudnn/`)

## Technical Details

- **Why bundled cuDNN causes issues**: The bundled `nvidia-cudnn-cu12` package includes version 9.1.0 libraries that may conflict with system-installed versions or have compatibility issues.

- **Why we can't exclude nvidia-cudnn-cu12**: PyTorch requires `nvidia-cudnn-cu12` as a dependency, so we can't exclude it entirely. Instead, we remove the bundled `.so` files and use system libraries.

- **Library loading order**: The solution ensures system libraries are found first by:
  1. Removing bundled libraries
  2. Configuring `LD_LIBRARY_PATH` to prioritize system paths
  3. Preloading system libraries with `ctypes.CDLL`

## References

- [WhisperX Issue #902](https://github.com/m-bain/whisperX/issues/902)
- [WhisperX Issue #1100](https://github.com/m-bain/whisperX/issues/1100)
- [WhisperX Issue #1103](https://github.com/m-bain/whisperX/issues/1103)
