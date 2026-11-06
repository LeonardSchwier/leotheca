#!/usr/bin/env bash
# The fast pre-push gate, also runnable by hand: npm run verify
# Whole-project checks that finish in about a minute on a warm machine:
# type check, lint, full unit tests, version consistency, ledger validation, and the
# end-to-end suite when it exists and its browser is installed.
# The slow full pipeline (Rust, Android, AppImage, Flatpak) is `npm run ci`.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

failed=0
run() {
  local label="$1"
  shift
  local t0=$SECONDS
  printf '  verify: %s\n' "$label"
  if ! "$@"; then
    printf '  verify: FAILED %s\n' "$label" >&2
    failed=1
  else
    printf '  verify: ok %s (%ss)\n' "$label" "$((SECONDS - t0))"
  fi
}

if [ ! -x node_modules/.bin/tsc ]; then
  echo "verify: node_modules missing; run npm ci first" >&2
  exit 1
fi

run "tsc --noEmit" node_modules/.bin/tsc -p tsconfig.json --noEmit
run "eslint" node_modules/.bin/eslint .
run "vitest (full)" node_modules/.bin/vitest run --reporter=dot
run "version consistency" node scripts/checkVersion.js

if command -v python3 >/dev/null 2>&1; then
  run "ledger validation" python3 scripts/agent_ledger.py --root . list >/dev/null
  if git rev-parse --verify --quiet origin/main >/dev/null; then
    run "roadmap format" python3 scripts/check_roadmap_format.py --root . --base origin/main
  fi
fi

# End-to-end: only when the suite exists, is wired to an npm script, and a
# Playwright browser is already installed. Never downloads anything.
if [ -d tests/e2e ] && grep -q '"test:e2e"' package.json; then
  browsers="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  [ -d "$HOME/Library/Caches/ms-playwright" ] && browsers="$HOME/Library/Caches/ms-playwright"
  if ls -d "$browsers"/chromium* >/dev/null 2>&1; then
    run "e2e (npm run test:e2e)" npm run --silent test:e2e
  else
    echo "  verify: e2e skipped, no Playwright browser under $browsers (npx playwright install chromium)"
  fi
else
  echo "  verify: e2e skipped, tests/e2e or the test:e2e script does not exist yet"
fi

exit "$failed"
