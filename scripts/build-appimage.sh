#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Building AppImage ==="

# 1. Build the frontend
echo "Building frontend..."
npm run build

# 2. Build the tauri backend (without bundling)
echo "Building tauri backend..."
cd src-tauri
cargo build --release
cd "$REPO_ROOT"

# 3. Create the AppDir manually
APPDIR="src-tauri/target/release/bundle/appimage/Leotheca.AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/share/icons/hicolor"

# Copy the tauri binary
cp src-tauri/target/release/leotheca "$APPDIR/usr/bin/leotheca"

# Copy icons
cp -r src-tauri/icons/* "$APPDIR/usr/share/icons/hicolor/" 2>/dev/null || true

# Create the desktop file
cat > "$APPDIR/com.leonardschwier.leotheca.desktop" << 'DESKTOP'
[Desktop Entry]
Name=Leotheca
Comment=A Tauri application
Exec=leotheca
Icon=com.leonardschwier.leotheca
Type=Application
Categories=Utility;
Terminal=false
DESKTOP

# Copy the icon to the AppDir root
cp src-tauri/icons/128x128.png "$APPDIR/com.leonardschwier.leotheca.png" 2>/dev/null || \
  cp src-tauri/icons/32x32.png "$APPDIR/com.leonardschwier.leotheca.png" 2>/dev/null || \
  echo "Warning: No icon found"

# Create the AppRun script
cat > "$APPDIR/AppRun" << 'APPRUN'
#!/bin/bash
DIR=$(dirname "$(readlink -f "$0")")
exec "$DIR/usr/bin/leotheca" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

# 4. Run linuxdeploy
echo "Running linuxdeploy..."
/var/lib/leohub/chat/.local/bin/linuxdeploy-native \
  --appdir="$APPDIR" \
  -o appimage

echo "=== AppImage build complete ==="
ls -la "$REPO_ROOT"/Leotheca-x86_64.AppImage 2>/dev/null || echo "AppImage not found in expected location"
