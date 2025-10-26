# Desktop App Bundling with Tauri

## Research Summary

Based on research conducted on 2025-10-26, **Tauri** is the optimal choice for bundling Chronicle Keeper into a cross-platform desktop application, offering significant advantages over Electron:

### Tauri Advantages
- **Bundle Size**: ~2.5MB vs ~85MB for Electron
- **Performance**: Lower RAM usage, no Chromium bundling
- **Security**: Enhanced security by default
- **Architecture**: Uses native OS webview (Edge WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux)
- **TypeScript Support**: Full support with Vite integration

## Recommended Architecture: Tauri with Python Sidecar

### Component Structure
1. **Frontend**: Existing TypeScript/Vite frontend (minimal changes needed)
2. **Backend**: FastAPI backend bundled as standalone executable via PyInstaller
3. **Communication**: HTTP communication between Tauri frontend and Python FastAPI sidecar
4. **Distribution**: Single executable containing both components

## Implementation Phases

### Phase 1: Tauri Environment Setup
- [ ] Install Rust toolchain
- [ ] Install Tauri CLI (`cargo install tauri-cli`)
- [ ] Initialize Tauri project structure in repository root
- [ ] Configure Tauri to integrate with existing frontend code
- [ ] Test basic Tauri app startup

### Phase 2: Python Backend Bundling
- [ ] Install PyInstaller in backend environment (`uv add pyinstaller`)
- [ ] Create PyInstaller specification file for FastAPI application
- [ ] Modify backend configuration for bundled deployment (relative paths, embedded config)
- [ ] Test standalone Python executable creation and functionality
- [ ] Verify WhisperX and LLM dependencies work in bundled format

### Phase 3: Sidecar Integration
- [ ] Configure `tauri.conf.json` with Python backend as external binary
- [ ] Implement sidecar lifecycle management (startup/shutdown/health checks)
- [ ] Update frontend API calls to target local sidecar instead of development server
- [ ] Handle cross-platform binary naming conventions (`-$TARGET_TRIPLE` suffixes)
- [ ] Test frontend-backend communication in bundled environment

### Phase 4: Build & Distribution
- [ ] Configure build scripts for multiple platforms (Windows, macOS, Linux)
- [ ] Set up cross-compilation for target platforms
- [ ] Test complete application packages on each platform
- [ ] Document installation and distribution process
- [ ] Optional: Set up CI/CD for automated builds

## Key Files to Create/Modify

### New Files
- `src-tauri/tauri.conf.json` - Main Tauri configuration with sidecar setup
- `src-tauri/src/main.rs` - Rust backend with sidecar management logic
- `backend/build_executable.py` - PyInstaller build automation script
- `scripts/build-desktop.sh` - Cross-platform build automation

### Modified Files
- `backend/src/main.py` - Configuration adjustments for bundled deployment
- `frontend/src/main.ts` - API endpoint configuration for sidecar communication
- `backend/src/storage/manager.py` - Path handling for bundled environment

## Reference Resources

### Example Repositories
- [example-tauri-v2-python-server-sidecar](https://github.com/dieharders/example-tauri-v2-python-server-sidecar) - Tauri v2 + FastAPI integration
- [example-tauri-python-server-sidecar](https://github.com/dieharders/example-tauri-python-server-sidecar) - Tauri v1 + FastAPI integration

### Documentation
- [Tauri Sidecar Documentation](https://v2.tauri.app/develop/sidecar/)
- [Embedding External Binaries](https://v1.tauri.app/v1/guides/building/sidecar/)
- [Writing a pandas Sidecar for Tauri](https://mclare.blog/posts/writing-a-pandas-sidecar-for-tauri/)

## Technical Considerations

### Cross-Platform Binary Management
- Windows: `my-sidecar-x86_64-pc-windows-msvc.exe`
- macOS Intel: `my-sidecar-x86_64-apple-darwin`
- macOS Apple Silicon: `my-sidecar-aarch64-apple-darwin`
- Linux: `my-sidecar-x86_64-unknown-linux-gnu`

### Dependencies to Verify in Bundled Environment
- WhisperX (GPU acceleration libraries)
- Ollama client (local LLM communication)
- Gemini API client (cloud LLM communication)
- Audio processing libraries (for Craig ZIP extraction)
- Configuration file access (platform-specific paths)

### Potential Challenges
- WhisperX GPU dependency bundling
- Ollama server communication in desktop environment
- Platform-specific webview rendering differences
- File system permissions for temporary audio processing
- PyInstaller compatibility with all Python dependencies

## Success Criteria
- [ ] Single executable file for each target platform
- [ ] All existing functionality preserved (upload, transcription, LLM processing, export)
- [ ] No external dependencies required for end users
- [ ] Application startup time under 10 seconds
- [ ] Bundle size under 100MB per platform
- [ ] Automated build process for releases

---

**Created**: 2025-10-26  
**Status**: Planning Phase  
**Priority**: Medium  
**Estimated Effort**: 2-3 weeks