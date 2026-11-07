#!/usr/bin/env bash
# Reads one pinned value (source commit, version name, or version code) out of
# the F-Droid build recipe's Builds[] entry. Used by
# .github/workflows/fdroid-submission-verify.yml so its release-source
# checkout ref and APK version assertions are derived from the recipe itself
# instead of a separately hardcoded copy that can silently drift out of sync
# with it (see ROADMAP.md's "F-Droid submission-verify workflow: stale
# pre-F015 version/commit pins" entry).
set -euo pipefail

usage() {
  echo "Usage: $0 <commit|version-name|version-code> <path-to-recipe.yml>" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
field="$1"
recipe="$2"
[ -f "$recipe" ] || {
  echo "read-fdroid-recipe-pin.sh: no such file: $recipe" >&2
  exit 2
}

case "$field" in
  commit)
    value=$(grep -m1 -oE 'commit:[[:space:]]*[^[:space:]]+' "$recipe" | sed -E 's/commit:[[:space:]]*//')
    ;;
  version-name)
    value=$(grep -m1 -oE 'versionName:[[:space:]]*"[^"]*"' "$recipe" | sed -E 's/versionName:[[:space:]]*"([^"]*)"/\1/')
    ;;
  version-code)
    value=$(grep -m1 -oE 'versionCode:[[:space:]]*[0-9]+' "$recipe" | sed -E 's/versionCode:[[:space:]]*//')
    ;;
  *)
    usage
    ;;
esac

if [ -z "$value" ]; then
  echo "read-fdroid-recipe-pin.sh: no Builds[].$field field found in $recipe" >&2
  exit 1
fi

printf '%s\n' "$value"
