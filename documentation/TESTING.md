# Testing

Leotheca uses a layered testing strategy: unit tests for logic, E2E tests for the full UI, and CI smoke tests for packaging. This page documents what exists, how to run it, and what to expect.

## Test Pyramid

```
        ┌──────────────────┐
        │   CI Smoke       │  ← AppImage launch, Android emulator
        ├──────────────────┤
        │   E2E (Playwright)│  ← Full app: file tree, search, rendering
        ├──────────────────┤
        │  Unit (Vitest)    │  ← 2933 tests across 152 files
        └──────────────────┘
```

## Unit Tests (Vitest)

**~2,933 tests in 152 files.** Test files mirror their component files (`Button.tsx` → `Button.test.tsx`).

```bash
cd leotheca
npx vitest run          # full suite (~15s)
npx vitest run src/markdown/  # specific module
```

**Covers:** markdown parsing, wikilink resolution, table/block manipulation, heading hierarchy, task lists, frontmatter, backlinks, rename planning, diagnostics, UI components, workspace profiles, and more.

**Config:** `vitest.config.ts` (jsdom environment, `@testing-library/preact`).

## E2E Tests (Playwright)

**27 tests covering the full app in a headless Chromium.** Runs the actual Vite dev server with a Tauri mock injected.

```bash
# Prerequisites
npm ci
# Dev server must be running:
node --max-old-space-size=1024 node_modules/vite/bin/vite.js --port 5173 --host 127.0.0.1

# Run tests
python3 tests/ui/leotheca_e2e_test.py --url http://127.0.0.1:5173
```

### What it covers

| Area | Tests |
|------|-------|
| App boot | Container loads, no Tauri errors, content rendered, sidebar visible, not on onboarding |
| File tree | All 5 mock files visible, click opens file |
| Search | Full-text, `tag:`, `path:`, negation (`-term`), `OR`, empty state, clear |
| Markdown rendering | H1/H2/H3, bold, italic, inline code, blockquote, task checkboxes, table, KaTeX math, links |
| Settings | Theme toggle, font size, workspace stats |
| Console | No unhandled errors |

### How it works

1. **Tauri Mock** (`tests/ui/tauriMock.js`) intercepts `window.__TAURI__` and serves a fixed workspace of 5 markdown files with realistic content (headings, code blocks, KaTeX, tables, tasks, wikilinks).
2. **Playwright** launches headless Chromium (resolved via `which chromium` or `LEOTHECA_E2E_CHROMIUM`), injects the mock before page load, then drives the real app.
3. **Screenshots** are captured for each pass/fail test into `tests/ui/screenshots/` (git-ignored). A JSON report (`e2e_report.json`) summarizes results.

### Artifacts

```
tests/ui/screenshots/
├── 01_initial_load.png       # App after load
├── 02_final_state.png        # After all tests
├── FAIL_*.png                # Auto-captured on test failure
├── e2e_report.json           # Structured results (timestamp, pass rate, errors)
└── console_log.txt           # Browser console output
```

### Known limitations

- KaTeX rendering is verified by class presence, not visual output.
- Theme toggle test falls back to `localStorage` when no toggle button is found.
- Search operators that depend on the Rust backend (e.g. fuzzy matching) are not tested — the mock provides exact-match search.

## CI (GitHub Actions)

Five jobs, all must pass:

| Job | What it checks |
|-----|---------------|
| **frontend** | TypeScript, ESLint, version consistency, Vitest, Vite build |
| **backend** | Rust fmt, Clippy, cargo test, cargo check |
| **android** | Gradle unit tests, debug APK build, emulator smoke test (API 35) |
| **appimage-smoke** | Full AppImage build, extract, launch under `xvfb` (15s timeout) |
| **validation** | Requires all four jobs above to succeed |

Badge: [![CI](https://github.com/LeonardSchwier/leotheca/actions/workflows/ci.yml/badge.svg)](https://github.com/LeonardSchwier/leotheca/actions/workflows/ci.yml)

## UI Verification (Manual / Agent)

Beyond automated tests, visual verification is a standing practice:

- **Screenshots:** Every UI change is verified with a Chromium screenshot (Playwright, headless). Dark and light modes are both captured. Screenshots are compared against the previous state before and after a change.
- **Video capture:** For animation or interaction sequences that a still image can't convey, Playwright records the browser session to `.webm`, converted to `.mp4` (H.264, 720p) via `ffmpeg`. This is used for PR evidence and user demos.
- **Dev server workflow:** The Vite dev server is restarted before every screenshot session to avoid stale HMR state. The port (5173) is verified free before starting.

### Demo video

A recorded demo of the key interactions (file tree, preview, search, theme toggle) lives in [`../assets/screenshots/demo.mp4`](../assets/screenshots/demo.mp4) and is embedded in the [README](../README.md#-demo). Regenerate it any time with:

```bash
python3 tests/ui/record_demo.py
# → .webm in /tmp/leotheca_demo_video/, convert with:
ffmpeg -i /tmp/leotheca_demo_video/*.webm -c:v libx264 -crf 23 -preset fast \
  -pix_fmt yuv420p -vf "scale=1280:720" -an assets/screenshots/demo.mp4
```

## Adding Tests

### New unit test

Create `<ComponentName>.test.tsx` next to the component. Use `@testing-library/preact` for rendering, `vitest` for assertions. Follow the existing test structure.

### New E2E test

Add a test block in `tests/ui/leotheca_e2e_test.py`. The `T(name, fn)` helper handles pass/fail logging and screenshot capture automatically. Use the mock's file set for fixtures — don't add files to the mock unless the test specifically needs them.

### New CI job

Add to `.github/workflows/ci.yml`. Keep jobs independent so they can run in parallel. The `validation` job aggregates all results — add new jobs to its `needs` list.
