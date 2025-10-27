#!/bin/bash
set -e

echo "=== Chronicle Keeper Desktop App Build Script ==="
echo "Building complete desktop application with Tauri + Python sidecar"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "CLAUDE.md" ]; then
    print_error "Please run this script from the chronicle-keeper root directory"
    exit 1
fi

# Check dependencies
print_status "Checking dependencies..."

# Check Python and uv
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is required but not installed"
    exit 1
fi

if ! command -v uv &> /dev/null; then
    print_error "uv is required but not installed"
    exit 1
fi

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    print_error "Node.js is required but not installed"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm is required but not installed"
    exit 1
fi

# Check Rust and Cargo
if ! command -v cargo &> /dev/null; then
    print_error "Rust and Cargo are required but not installed"
    exit 1
fi

# Check Tauri CLI
if ! command -v cargo-tauri &> /dev/null; then
    print_warning "Tauri CLI not found, installing..."
    cargo install tauri-cli --version 2.9.1
fi

print_status "All dependencies found!"

# Step 1: Build Python backend executable
print_status "Building Python backend executable..."
cd backend

# Install Python dependencies if needed
print_status "Installing Python dependencies..."
uv sync

# Build the executable
print_status "Creating PyInstaller executable..."
python build_executable.py

if [ ! -f "dist/chronicle-keeper-backend" ]; then
    print_error "Failed to build Python executable"
    exit 1
fi

print_status "Python backend built successfully: $(du -h dist/chronicle-keeper-backend | cut -f1)"
cd ..

# Step 2: Build frontend
print_status "Building frontend..."
cd frontend

# Install frontend dependencies if needed
print_status "Installing frontend dependencies..."
npm install

# Build frontend
print_status "Building frontend for production..."
npm run build

if [ ! -d "dist" ]; then
    print_error "Failed to build frontend"
    exit 1
fi

print_status "Frontend built successfully"
cd ..

# Step 3: Build Tauri desktop app
print_status "Building Tauri desktop application..."
cd src-tauri

# Install Rust dependencies and build
print_status "Installing Rust dependencies and building desktop app..."
cargo tauri build

if [ $? -eq 0 ]; then
    print_status "Desktop application built successfully!"
    
    # Find and display the built executable
    if [ -d "target/release/bundle" ]; then
        print_status "Built packages:"
        find target/release/bundle -name "chronicle-keeper*" -type f | while read file; do
            echo "  - $file ($(du -h "$file" | cut -f1))"
        done
    fi
else
    print_error "Failed to build desktop application"
    exit 1
fi

cd ..

print_status "Build complete! The desktop application has been packaged with the Python backend as a sidecar."
print_status "You can find the installer/executable in src-tauri/target/release/bundle/"

echo ""
echo "=== Build Summary ==="
echo "✅ Python backend executable created"
echo "✅ Frontend built for production"
echo "✅ Desktop application packaged"
echo "✅ Python sidecar integrated"
echo ""
echo "The desktop app will automatically start the Python backend when launched."