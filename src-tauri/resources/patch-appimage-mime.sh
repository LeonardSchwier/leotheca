#!/usr/bin/env bash
# Patch the AppImage to register the leotheca:// URL scheme MIME type.
#
# Tauri v2 supports custom desktop file templates for deb and rpm bundles,
# but has no such option for AppImage. This script attempts to patch the
# generated AppImage's embedded .desktop file after the build completes.
#
# Tauri v2 builds AppImages with Zstd compression. 7z on Ubuntu runners may
# not support this, so we gracefully allow the patch to fail. Users can still
# open leotheca:// links; the MIME type is only needed for first-launch auto-
# registration of the URL scheme.

set -euo pipefail

APPIMAGE="$1"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

echo "Extracting AppImage: ${APPIMAGE}"
if ! 7z x "${APPIMAGE}" -o"${WORK}" -y > /dev/null 2>&1; then
  echo "WARNING: 7z could not extract AppImage (Zstd compression unsupported)"
  echo "  URL scheme auto-registration may not work on first launch"
  exit 0
fi

echo "Locating .desktop file"
DESKTOP_FILE=$(find "${WORK}" -name '*.desktop' -not -name '*.desktop.template' | head -1)
if [ -z "${DESKTOP_FILE}" ]; then
  echo "WARNING: No .desktop file found in AppImage"
  exit 0
fi

echo "Patching: ${DESKTOP_FILE}"
grep -qv '^MimeType=' "${DESKTOP_FILE}" && \
  echo 'MimeType=x-scheme-handler/leotheca;' >> "${DESKTOP_FILE}"
sed -i 's/^Exec=leotheca$/Exec=leotheca %u/' "${DESKTOP_FILE}"
echo "  MimeType: $(grep '^MimeType=' "${DESKTOP_FILE}")"
echo "  Exec:     $(grep '^Exec=' "${DESKTOP_FILE}")"

echo "Done: AppImage patched successfully"
