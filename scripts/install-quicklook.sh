#!/bin/bash
# Install the Leotheca Markdown Quick Look generator into the Leotheca.app bundle.
#
# Usage:
#   scripts/install-quicklook.sh [path/to/Leotheca.app]
#
# If no path is given, it looks for the Tauri dev build or the dist/ output.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUNDLE_SRC="$PROJECT_ROOT/dist/LeothecaMarkdown.qlgenerator"

# Find the Leotheca.app bundle
if [[ -n "${1:-}" ]]; then
    APP_BUNDLE="$1"
elif [[ -d "$PROJECT_ROOT/src-tauri/target/release/bundle/macos/Leotheca.app" ]]; then
    APP_BUNDLE="$PROJECT_ROOT/src-tauri/target/release/bundle/macos/Leotheca.app"
elif [[ -d "$PROJECT_ROOT/src-tauri/target/debug/bundle/macos/Leotheca.app" ]]; then
    APP_BUNDLE="$PROJECT_ROOT/src-tauri/target/debug/bundle/macos/Leotheca.app"
else
    echo "error: could not find Leotheca.app. Build it first:" >&2
    echo "  npm run tauri build" >&2
    echo "  or: npm run tauri dev" >&2
    exit 1
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
    echo "error: $APP_BUNDLE not found" >&2
    exit 1
fi

if [[ ! -d "$BUNDLE_SRC" ]]; then
    echo "error: $BUNDLE_SRC not found. Build it first:" >&2
    echo "  scripts/build-quicklook.sh" >&2
    exit 1
fi

# Install into the .app bundle's PlugIns directory
PLUGINS_DIR="$APP_BUNDLE/Contents/PlugIns"
mkdir -p "$PLUGINS_DIR"
cp -R "$BUNDLE_SRC" "$PLUGINS_DIR/"

echo "Installed Quick Look generator into: $PLUGINS_DIR/LeothecaMarkdown.qlgenerator"
echo ""
echo "To test: in Finder, ⌥-click a .md file."
echo "To reset: rm -rf \"$PLUGINS_DIR/LeothecaMarkdown.qlgenerator\""
