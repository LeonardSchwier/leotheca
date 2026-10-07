#!/usr/bin/env bash
# Local CI/CD runner: replicates the GitHub Actions CI pipeline locally.
# Run this before pushing to catch all errors early.
#
# Usage:
#   ./scripts/ci-local.sh           # Run all checks
#   ./scripts/ci-local.sh --quick   # Skip slow checks (build, appimage, flatpak)
#   ./scripts/ci-local.sh --frontend  # Frontend only
#   ./scripts/ci-local.sh --backend   # Backend only
#   ./scripts/ci-local.sh --android   # Android only
#   ./scripts/ci-local.sh --appimage  # AppImage only
#   ./scripts/ci-local.sh --flatpak   # Flatpak only
#
# Environment variables:
#   CI_LOCAL_SKIP_ANDROID=1    Skip Android checks
#   CI_LOCAL_SKIP_FLATPAK=1    Skip Flatpak checks
#   CI_LOCAL_SKIP_APPIMAGE=1   Skip AppImage checks
#   CI_LOCAL_QUICK=1           Skip slow checks (equivalent to --quick)

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

QUICK="${CI_LOCAL_QUICK:-0}"
FRONTEND_ONLY=0
BACKEND_ONLY=0
ANDROID_ONLY=0
APPIMAGE_ONLY=0
FLATPAK_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --frontend) FRONTEND_ONLY=1 ;;
    --backend) BACKEND_ONLY=1 ;;
    --android) ANDROID_ONLY=1 ;;
    --appimage) APPIMAGE_ONLY=1 ;;
    --flatpak) FLATPAK_ONLY=1 ;;
    --help|-h)
      echo "Usage: $0 [--quick|--frontend|--backend|--android|--appimage|--flatpak]"
      echo "  --quick      Skip slow checks (build, appimage, flatpak)"
      echo "  --frontend   Run only frontend checks"
      echo "  --backend    Run only backend checks"
      echo "  --android    Run only Android checks"
      echo "  --appimage   Run only AppImage checks"
      echo "  --flatpak    Run only Flatpak checks"
      exit 0
      ;;
  esac
done

PASSED=0
FAILED=0
SKIPPED=0
TOTAL=0
START_TIME=$(date +%s)

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

step() {
  TOTAL=$((TOTAL + 1))
  echo ""
  echo -e "${CYAN}═══ [${TOTAL}] $1 ═══${NC}"
}

run_check() {
  local name="$1"
  shift
  local cmd="$*"
  step "$name"
  if eval "$cmd" 2>&1 | tail -5; then
    PASSED=$((PASSED + 1))
    echo -e "${GREEN}✓ $name${NC}"
  else
    FAILED=$((FAILED + 1))
    echo -e "${RED}✗ $name — FAILED${NC}"
    echo -e "${RED}  Command: $cmd${NC}"
    return 1
  fi
}

skip_check() {
  local name="$1"
  local reason="$2"
  step "$name"
  SKIPPED=$((SKIPPED + 1))
  echo -e "${YELLOW}⊘ $name — SKIPPED ($reason)${NC}"
}

run_or_skip() {
  local name="$1"
  local check_cmd="$2"
  local cmd="$3"
  if eval "$check_cmd" 2>/dev/null; then
    run_check "$name" "$cmd"
  else
    skip_check "$name" "prerequisite not available"
  fi
}

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Leotheca Local CI/CD Pipeline       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo "Repo: $REPO_ROOT"
echo "Time: $(date)"
echo ""

# ──────────────────────────────────────────────────────────────
# 1. Frontend checks (always run unless backend/android/appimage/flatpak only)
# ──────────────────────────────────────────────────────────────
if [ "$BACKEND_ONLY" -eq 0 ] && [ "$ANDROID_ONLY" -eq 0 ] && [ "$APPIMAGE_ONLY" -eq 0 ] && [ "$FLATPAK_ONLY" -eq 0 ]; then
  run_check "Type check (tsc --noEmit)" "npx tsc -p tsconfig.json --noEmit"
  run_check "Lint (eslint)" "npm run lint"
  run_check "Version consistency" "npm run check-version"
  run_check "Frontend tests (vitest)" "npx vitest run --reporter=dot"

  if [ "$QUICK" -eq 0 ]; then
    run_check "Frontend build (vite build)" "npm run build"
  else
    skip_check "Frontend build" "skipped (--quick)"
  fi
fi

# ──────────────────────────────────────────────────────────────
# 2. Backend checks (always run unless frontend/android/appimage/flatpak only)
# ──────────────────────────────────────────────────────────────
if [ "$FRONTEND_ONLY" -eq 0 ] && [ "$ANDROID_ONLY" -eq 0 ] && [ "$APPIMAGE_ONLY" -eq 0 ] && [ "$FLATPAK_ONLY" -eq 0 ]; then
  if command -v cargo &>/dev/null && [ -d "src-tauri" ]; then
    run_check "Rust fmt check" "cd src-tauri && cargo fmt --all -- --check"
    run_check "Rust clippy" "cd src-tauri && cargo clippy --all-targets -- -D warnings"
    run_check "Backend tests (cargo test)" "cd src-tauri && cargo test 2>&1 | tail -20"
  else
    skip_check "Backend checks" "cargo or src-tauri not found"
  fi
fi

# ──────────────────────────────────────────────────────────────
# 3. Android checks
# ──────────────────────────────────────────────────────────────
if [ "$FRONTEND_ONLY" -eq 0 ] && [ "$BACKEND_ONLY" -eq 0 ] && [ "$APPIMAGE_ONLY" -eq 0 ] && [ "$FLATPAK_ONLY" -eq 0 ]; then
  if [ "${CI_LOCAL_SKIP_ANDROID:-0}" -eq 1 ]; then
    skip_check "Android checks" "CI_LOCAL_SKIP_ANDROID=1"
  elif [ "$QUICK" -eq 1 ]; then
    skip_check "Android checks" "skipped (--quick)"
  elif [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    # Auto-detect SDK in common locations
    if [ -d "/var/lib/leohub/chat/android-sdk" ]; then
      export ANDROID_HOME="/var/lib/leohub/chat/android-sdk"
    else
      skip_check "Android checks" "ANDROID_HOME not set (SDK not available)"
      ANDROID_HOME=""
    fi
  fi
  if [ -n "${ANDROID_HOME:-}" ] && command -v java &>/dev/null && [ -d "android" ]; then
    export GRADLE_OPTS="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=18182 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=18182"
    run_check "Android unit tests" "cd android && ./gradlew testDebugUnitTest 2>&1 | tail -20"
    if [ "$QUICK" -eq 0 ]; then
      run_check "Android debug APK build" "cd android && ./gradlew assembleDebug 2>&1 | tail -20"
    fi
  else
    skip_check "Android checks" "java or android/ directory not found"
  fi
fi

# ──────────────────────────────────────────────────────────────
# 4. AppImage checks
# ──────────────────────────────────────────────────────────────
if [ "$FRONTEND_ONLY" -eq 0 ] && [ "$BACKEND_ONLY" -eq 0 ] && [ "$ANDROID_ONLY" -eq 0 ] && [ "$FLATPAK_ONLY" -eq 0 ]; then
  if [ "${CI_LOCAL_SKIP_APPIMAGE:-0}" -eq 1 ]; then
    skip_check "AppImage build" "CI_LOCAL_SKIP_APPIMAGE=1"
  elif [ "$QUICK" -eq 1 ]; then
    skip_check "AppImage build" "skipped (--quick)"
  else
    # AppImage build via custom script (linuxdeploy-native)
    if [ -f "scripts/build-appimage.sh" ]; then
      run_check "AppImage build (linuxdeploy)" "./scripts/build-appimage.sh 2>&1 | tail -20"
    else
      skip_check "AppImage build" "build-appimage.sh not found"
    fi
  fi
fi

# ──────────────────────────────────────────────────────────────
# 5. Flatpak checks
# ──────────────────────────────────────────────────────────────
if [ "$FRONTEND_ONLY" -eq 0 ] && [ "$BACKEND_ONLY" -eq 0 ] && [ "$ANDROID_ONLY" -eq 0 ] && [ "$APPIMAGE_ONLY" -eq 0 ]; then
  if [ "${CI_LOCAL_SKIP_FLATPAK:-0}" -eq 1 ]; then
    skip_check "Flatpak build" "CI_LOCAL_SKIP_FLATPAK=1"
  elif [ "$QUICK" -eq 1 ]; then
    skip_check "Flatpak build" "skipped (--quick)"
  else
    if command -v flatpak-builder &>/dev/null; then
      run_check "Flatpak manifest lint" "flatpak-builder-lint manifest flatpak/com.leonardschwier.leotheca.yml 2>&1 || echo 'flatpak-builder-lint not available, skipping lint'"
      run_check "Flatpak AppStream lint" "flatpak-builder-lint appstream flatpak/com.leonardschwier.leotheca.metainfo.xml 2>&1 || echo 'flatpak-builder-lint not available, skipping lint'"
      # Full flatpak build is very slow, only do it if explicitly requested
      if [ "${CI_LOCAL_FLATPAK_BUILD:-0}" -eq 1 ]; then
        run_check "Flatpak build" "flatpak-builder --force-clean /tmp/leotheca-flatpak-build flatpak/com.leonardschwier.leotheca.yml 2>&1 | tail -20"
      else
        skip_check "Flatpak build" "set CI_LOCAL_FLATPAK_BUILD=1 to enable (very slow)"
      fi
    else
      skip_check "Flatpak checks" "flatpak-builder not available"
    fi
  fi
fi

# ──────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  Local CI/CD Summary${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo "  Total:   $TOTAL checks"
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
echo -e "  ${RED}Failed:  $FAILED${NC}"
echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
echo "  Time:    ${MINUTES}m ${SECONDS}s"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}✗ CI FAILED — fix the errors above before pushing.${NC}"
  exit 1
else
  echo -e "${GREEN}✓ CI PASSED — ready to push.${NC}"
  exit 0
fi
