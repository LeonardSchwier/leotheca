# Git Hooks

This directory contains git hooks that enforce local CI/CD checks before pushing.

## Setup

Run once after cloning:

```bash
./hooks/setup.sh
```

This creates symlinks in `.git/hooks/` pointing to the tracked hook files.
Re-run after pulling updates to hooks.

## Available Hooks

### pre-push

Runs the full local CI/CD pipeline before allowing a push. If any check fails,
the push is blocked.

**Checks included:**

| Check | Tool | Always? |
|-------|------|---------|
| Type check | `tsc --noEmit` | ✅ |
| Lint | `eslint` | ✅ |
| Version consistency | `node scripts/checkVersion.js` | ✅ |
| Frontend tests | `vitest run` | ✅ |
| Frontend build | `vite build` | ✅ (skipped with `--quick`) |
| Rust fmt | `cargo fmt --check` | ✅ (if cargo available) |
| Rust clippy | `cargo clippy -D warnings` | ✅ (if cargo available) |
| Backend tests | `cargo test` | ✅ (if cargo available) |
| Android unit tests | `gradlew testDebugUnitTest` | ✅ (if java + android/ available) |
| Android APK build | `gradlew assembleDebug` | ✅ (if java + android/ available) |
| AppImage build | `tauri build --bundles appimage` | ✅ (if cargo + tauri available) |
| Flatpak lint | `flatpak-builder-lint` | ✅ (if flatpak-builder available) |
| Flatpak build | `flatpak-builder` | Only with `CI_LOCAL_FLATPAK_BUILD=1` |

**Environment variables:**

| Variable | Effect |
|----------|--------|
| `CI_LOCAL_QUICK=1` | Skip slow checks (build, appimage, flatpak) |
| `CI_LOCAL_SKIP_ANDROID=1` | Skip Android checks |
| `CI_LOCAL_SKIP_APPIMAGE=1` | Skip AppImage build |
| `CI_LOCAL_SKIP_FLATPAK=1` | Skip Flatpak checks |
| `CI_LOCAL_FLATPAK_BUILD=1` | Enable full Flatpak build (very slow) |

**Examples:**

```bash
# Normal push (full CI)
git push

# Quick push (skip slow builds)
CI_LOCAL_QUICK=1 git push

# Skip Android + AppImage (e.g., on a machine without those tools)
CI_LOCAL_SKIP_ANDROID=1 CI_LOCAL_SKIP_APPIMAGE=1 git push

# Emergency bypass (not recommended)
git push --no-verify
```

## Running CI Manually

You can also run the CI pipeline directly without pushing:

```bash
# Full CI
npm run ci

# Quick CI (skip slow checks)
npm run ci:quick

# Frontend only
npm run ci:frontend

# Backend only
npm run ci:backend
```

## How It Works

The `pre-push` hook calls `scripts/ci-local.sh`, which runs the same checks
as the GitHub Actions CI workflow. The difference is that platform-specific
checks (Android emulator, Flatpak sandbox) are only run when the required
tools are available locally — otherwise they're skipped with a notice.

The GitHub Actions CI still runs on push as the authoritative check. The
local hook is a fast feedback loop to catch errors before they reach CI.
