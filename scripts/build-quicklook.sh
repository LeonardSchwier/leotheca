#!/bin/bash
# Build the Leotheca Markdown Quick Look generator for macOS.
#
# This script compiles the Quick Look extension and creates the .qlgenerator
# bundle. Run it on a Mac with Xcode Command Line Tools installed.
#
# Usage:
#   scripts/build-quicklook.sh
#
# Output:
#   dist/LeothecaMarkdown.qlgenerator/
#
# To install into the Leotheca.app bundle:
#   scripts/install-quicklook.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PROJECT_ROOT/packaging/macos/quicklook"
DIST_DIR="$PROJECT_ROOT/dist"
BUNDLE_NAME="LeothecaMarkdown.qlgenerator"
BUNDLE_DIR="$DIST_DIR/$BUNDLE_NAME"

# Check we're on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "error: this script must run on macOS (Quick Look is a macOS-only feature)" >&2
    exit 1
fi

# Check for Xcode CLT
if ! command -v clang &>/dev/null; then
    echo "error: clang not found. Install Xcode Command Line Tools:" >&2
    echo "  xcode-select --install" >&2
    exit 1
fi

echo "Building Leotheca Markdown Quick Look generator..."

# Clean previous build
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/MacOS"

# Compile the Objective-C file
clang \
    -framework Cocoa \
    -framework QuickLook \
    -framework WebKit \
    -fobjc-arc \
    -O2 \
    -o "$BUNDLE_DIR/MacOS/LeothecaMarkdownQL" \
    "$SRC_DIR/LeothecaMarkdownQLPreviewGenerator.m"

# Copy the Info.plist
cp "$SRC_DIR/Info.plist" "$BUNDLE_DIR/Info.plist"

# Code sign (ad-hoc for local development; CI will sign with Developer ID)
codesign --force --sign - --timestamp=none "$BUNDLE_DIR" 2>/dev/null || \
    echo "warning: codesign failed (may not be available in this environment)"

echo "Build complete: $BUNDLE_DIR"
echo ""
echo "To install into Leotheca.app:"
echo "  scripts/install-quicklook.sh"
echo ""
echo "To test:"
echo "  1. Build the Leotheca app: npm run tauri dev (or tauri build)"
echo "  2. Run scripts/install-quicklook.sh"
echo "  3. In Finder, ⌥-click a .md file"
