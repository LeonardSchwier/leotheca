#!/usr/bin/env bash
# Patch the AppImage to register the leotheca:// URL scheme MIME type.
#
# Tauri v2 supports custom desktop file templates for deb and rpm bundles,
# but has no such option for AppImage. This script patches the generated
# AppImage's embedded .desktop file after the build completes.
#
# Usage: patch-appimage-mime.sh <path-to.AppImage>
#
# The AppImage format (Type 2, self-extracting) consists of:
#   [8-byte stub size][stub data][squashes data]
#
# This script extracts the stub, extracts the squashes contents with 7z,
# patches the .desktop file, rebuilds the squa shfs with mksquashfs, and
# reassembles the final AppImage.

set -euo pipefail

APPIMAGE="$1"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

echo "Extracting AppImage: ${APPIMAGE}"
7z x "${APPIMAGE}" -o"${WORK}" -y > /dev/null

echo "Locating .desktop file"
DESKTOP_FILE=$(find "${WORK}" -name '*.desktop' | head -1)
if [ -z "${DESKTOP_FILE}" ]; then
  echo "ERROR: No .desktop file found in AppImage contents" >&2
  exit 1
fi

echo "Patching: ${DESKTOP_FILE}"
# Add MimeType line if not already present
grep -qv '^MimeType=' "${DESKTOP_FILE}" && \
  echo 'MimeType=x-scheme-handler/leotheca;' >> "${DESKTOP_FILE}"
# Add %u URI argument to Exec line if not present
sed -i 's/^Exec=leotheca$/Exec=leotheca %u/' "${DESKTOP_FILE}"
echo "  MimeType: $(grep '^MimeType=' "${DESKTOP_FILE}")"
echo "  Exec:     $(grep '^Exec=' "${DESKTOP_FILE}")"

echo "Extracting stub and squa shfs data"
# Read stub size from first 8 bytes (little-endian u64)
STUB_SIZE=$(dd if="${APPIMAGE}" bs=1 count=8 2>/dev/null | \
  od -An -tu8 --endian=little | tr -d ' ')
echo "  Stub size: ${STUB_SIZE} bytes"

# Extract stub and squashes separately
dd if="${APPIMAGE}" bs=1 count="${STUB_SIZE}" of="${WORK}/stub" 2>/dev/null
dd if="${APPIMAGE}" bs=1 skip="${STUB_SIZE}" of="${WORK}/squashes" 2>/dev/null

echo "Building clean content directory for squa shfs"
APP_DIR="${WORK}/app_root"
mkdir "${APP_DIR}"
# Copy only the AppImage's actual contents (not stub, squashes, or other temp files)
for item in "${WORK}"/*; do
  base="$(basename "${item}")"
  case "${base}" in
    stub|squashes|squashes_new) continue ;;
    *) cp -a "${item}" "${APP_DIR}/" ;;
  esac
done

echo "Rebuilding squa shfs: ${APP_DIR}"
mksquashfs "${APP_DIR}" "${WORK}/squashes_new" \
  -noappend -no-xattrs -no-fragments -no-progress > /dev/null 2>&1

echo "Reassembling AppImage: ${APPIMAGE}"
rm "${APPIMAGE}"
cat "${WORK}/stub" "${WORK}/squashes_new" > "${APPIMAGE}"
chmod +x "${APPIMAGE}"

echo "Done"
