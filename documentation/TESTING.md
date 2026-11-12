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

**A smoke suite of user journeys in headless Chromium** (`tests/e2e`, TypeScript Playwright Test). It drives the production bundle (`vite build` then `vite preview`) with the native side replaced by an in-page bridge mock (`tests/e2e/support/bridgeMock.ts`), so it exercises what ships, including the strict CSP. It is the required `e2e` job in CI and runs in the pre-push gate through `npm run test:e2e` when a Playwright browser is installed.

```bash
# Once
npm ci && npm --prefix tests/e2e ci && npm --prefix tests/e2e run install:browsers

# Every run
npm run test:e2e
```

### What it covers

| Area               | Journeys                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| App boot           | Boots into the saved workspace and lists its notes; primary navigation switches sidebar views             |
| Notes              | Open into a tab, create, autosave to the native file, rename, move to the workspace trash                 |
| Search             | Full-text, `tag:`, `path:`, negation (`-term`), `OR`, empty state, clear; a result opens its note         |
| Markdown rendering | Headings, bold, italic, highlight, inline code, block quotes, task boxes, tables, KaTeX, links, wikilinks |
| View modes         | Source, split and preview; Mermaid diagrams follow the theme and zoom                                     |
| Export             | Export note to PDF opens the print dialog on a paginated document                                         |
| Settings           | Saved theme applies at boot and a change is persisted; the workspace root and its statistics              |
| Console            | The fixture fails any test that logs a console error, an unhandled rejection or an off-origin request     |

### How it works

1. **Bridge mock** (`tests/e2e/support/bridgeMock.ts`) replaces `window.__TAURI_INTERNALS__.invoke` with a Map-backed file system and records every native call, so a test can assert what the native side received. Fixtures are in `tests/e2e/support/workspace.ts`; a test can add notes with `test.use({ bridge: { files } })`.
2. **Playwright** starts one preview server per run. The port comes from `E2E_PORT`; without it a port is derived from the process id, so several checkouts can run the suite at the same time. Only an explicit `E2E_PORT` reuses an already running server.
3. **Artifacts** (`tests/e2e/playwright-report`, `tests/e2e/test-results`) are git-ignored and skipped by ESLint. CI uploads the trace of a failure.

### Known limitations

- KaTeX rendering is verified by class presence, not visual output.
- Search runs against the bridge mock's index, so the Rust ranking is not tested here.
- After an edit, further key presses in the editor can hang headless Chromium; see `spec/completed/find-the-cause-of-the-editor-typing-freeze-in-headless-chromium.md`. The autosave test inserts text in one input event.

## CI (GitHub Actions)

Five jobs, all must pass:

| Job                | What it checks                                                   |
| ------------------ | ---------------------------------------------------------------- |
| **frontend**       | TypeScript, ESLint, version consistency, Vitest, Vite build      |
| **backend**        | Rust fmt, Clippy, cargo test, cargo check                        |
| **android**        | Gradle unit tests, debug APK build, emulator smoke test (API 35) |
| **appimage-smoke** | Full AppImage build, extract, launch under `xvfb` (15s timeout)  |
| **validation**     | Requires all four jobs above to succeed                          |

### Tooling downloads: cache and retry

The Tauri bundler downloads its tools (AppRun, linuxdeploy, the WiX tools) and the Gradle wrapper downloads the Gradle distribution on first use. Both come from release CDNs that answer 502, 503 or 504 now and then, which used to fail a run for a reason outside the code. The workflows therefore:

- cache `~/.cache/tauri` (Windows: `~/AppData/Local/tauri`) with `actions/cache`, keyed on `package-lock.json` (the Tauri CLI version), in `appimage-smoke` and the `linux` and `windows` jobs of the release workflow;
- cache `~/.gradle/wrapper/dists`, keyed on `gradle-wrapper.properties`, and warm the wrapper up with `./gradlew --version` before the real Gradle call, in the `android` jobs;
- run the Tauri bundling, the warm-up and the pinned release-binary downloads of the secret scan and cargo-audit through `scripts/retry.sh` (three attempts, 20 s and 60 s apart).

A 5xx while downloading is retried. A real compile or test failure fails the step, with the same exit code, after the two retries; the retry never turns a failure into a pass. A SHA-256 mismatch of a pinned binary is checked after the download, outside the retry, and fails at once. A missing cache only makes the run slower.

Badge: [![CI](https://github.com/LeonardSchwier/leotheca/actions/workflows/ci.yml/badge.svg)](https://github.com/LeonardSchwier/leotheca/actions/workflows/ci.yml)

## UI Verification (Manual / Agent)

Beyond automated tests, visual verification is a standing practice:

- **Screenshots:** UI changes are meant to be checked with a Chromium screenshot (Playwright, headless). Dark and light modes are both captured. Screenshots are compared against the previous state before and after a change.
- **Video capture:** For animation or interaction sequences that a still image can't convey, Playwright can record the browser session to `.webm`, convertible to `.mp4` with `ffmpeg`. There is no demo video in the repository.
- **Dev server workflow:** The Vite dev server is restarted before every screenshot session to avoid stale HMR state. The port (5173) is verified free before starting.

### Line endings of tracked files

`.gitattributes` asks for LF in the repository and CRLF in the working tree for Windows batch files (`*.bat text eol=crlf`). A text file whose stored copy has CRLF never matches what git computes from the working file, so every fresh clone lists it as modified, and `scripts/agent_ledger.py` refuses to claim, renew or finish in a dirty checkout. `scripts/lineEndings.test.js` reads `git ls-files --eol` and fails with the file name when one is stored that way; the repair is `git add --renormalize <path>` and a commit, and the file keeps its working-tree ending.

### README screenshots

The screenshots in the [README](../README.md#-screenshots) come from `tests/e2e/screenshots.mjs`. It builds the frontend, serves it with `vite preview`, loads a small workspace of original sample notes through the same in-page bridge mock the E2E suite uses, and writes the split view, command palette, graph view and settings in light (`documentation/screenshots/<name>.png`) and dark (`<name>-dark.png`). It fails if any request leaves the origin or the console logs an error, and runs `optipng` when installed. Regenerate them after a visible UI change:

```bash
cd tests/e2e
npm ci && npm run install:browsers   # once
node screenshots.mjs
```

## Adding Tests

### New unit test

Create `<ComponentName>.test.tsx` next to the component. Use `@testing-library/preact` for rendering, `vitest` for assertions. Follow the existing test structure.

### New E2E test

Add a test to the matching file in `tests/e2e/tests/` (`*.e2e.ts`). Import `test` and `expect` from `../support/fixtures.js`, which provide the `app` handle (page plus bridge mock) and fail the test on console errors. Use the shared fixture notes; add a note for one test with `test.use({ bridge: { files: { ...NOTE_FILES, "name.md": "..." } } })`.

### New CI job

Add to `.github/workflows/ci.yml`. Keep jobs independent so they can run in parallel. The `validation` job aggregates all results — add new jobs to its `needs` list.
