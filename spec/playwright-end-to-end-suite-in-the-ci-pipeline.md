# Playwright end-to-end suite in the CI pipeline

## Item

- Roadmap id `rm-57a389f7112eb947`, "Playwright end-to-end suite in the CI pipeline".
- Outcome: a Playwright suite of end-to-end smoke tests drives the built (production) frontend with a mocked native bridge, runs as a required CI job, uploads traces on failure, and runs locally with one command.
- Owner clarification: Playwright means smoke tests of core user journeys, not exhaustive UI coverage.

## Acceptance

1. `cd tests/e2e && npm ci && npx playwright install chromium && npm test` builds the frontend, serves `dist`, and runs the journeys headless against it.
2. Journeys (from the old `tests/ui/leotheca_e2e_test.py` T01-T28): app boot to a populated workspace; open a note from the tree; source/split/preview modes; markdown rendering (headings, bold/italic, code, quote, task list, table, math, links); full-text search with `tag:`, `path:`, negation, `OR`, empty state and clear; theme toggle; settings; workspace stats. New over the old script: create note, edit with autosave, rename, delete-to-trash, each asserted on what reached the mocked native side.
3. Every test fails on: console error, uncaught exception, unhandled rejection, any non-same-origin request (the product is offline), or a native command the mock does not implement.
4. CI job `e2e` in `.github/workflows/ci.yml`: installs Chromium, runs the suite, uploads `playwright-report` and `test-results` (traces) as an artifact when it fails, and is a `needs` entry of the `validation` aggregate job, so it is required.
5. No retries, no `test.skip`, no `.only` in CI (`forbidOnly`).
6. The suite does not run under root `npm test` (vitest) or root `npm run lint` unexpectedly, and adds nothing to the root lockfile or flatpak node sources.
7. Mutation check: breaking the app (for example disabling autosave write) makes the matching journey fail.

## Context

- App talks to Rust only through `window.__TAURI_INTERNALS__.invoke` (see `src/lib/tauriBridge.ts`); the existing mock `tests/ui/tauriMock.js` is stateless. The new `tests/e2e/support/bridgeMock.ts` is a stateful Map-backed implementation of the same command set that records calls. It was inherited from the previous session's untracked work (`rm-57a389f7112eb947` lease `bc60d49d...`, no handoff and no remote branch existed), reviewed in full, and kept.
- Playwright lives in its own package, `tests/e2e/package.json`, pinned to exact versions: `@playwright/test` 1.64.1 (published 2026-10-14, 24 days old), `@types/node` 22.10.2, `typescript` 5.7.2. A separate package keeps browser tooling out of the root lockfile, `flatpak/node-sources.json` and the root audit surface. The roadmap item's touch scope also deliberately excludes root `package.json`, which the "Git hooks" item holds.
- Files `*.e2e.ts`, never `*.test.*`/`*.spec.*`, so vitest cannot pick them up.
- Pre-push gate: owned by the "Git hooks and enforced quality gates" item (holds `hooks/`, `scripts/verify-fast.sh`). Not edited here; follow-up recorded in the handoff after reading main.
- Platform boundary: desktop webview frontend only; Android WebView and the real Rust side are covered by their own jobs.

## Plan

1. Config and package: `tests/e2e/{package.json,package-lock.json,playwright.config.ts,tsconfig.json,.gitignore}`. Proof: `npx tsc --noEmit`, `npx playwright test --list`.
2. Fixtures and mock: `tests/e2e/support/*` (inherited). Proof: a boot test.
3. Journeys: `tests/e2e/tests/{boot,notes,search,rendering,settings}.e2e.ts`. Proof: suite output.
4. CI job and aggregate wiring: `.github/workflows/ci.yml`. Proof: YAML parse plus the CI run of the landed SHA.
5. Retire `tests/ui` python journeys into the Playwright suite? Not removed (see Rulings). Add a pointer in its docstring.

## Out of scope

Real Tauri/WebKit driving, Android, visual-regression screenshots, performance budgets, cross-browser projects, the pre-push hook wiring, root `package.json` scripts.

## Rulings

| Q | Decision | Why | Cost if wrong |
| --- | --- | --- | --- |
| Reuse the Python script or port it? | Port its journeys to TypeScript Playwright Test; keep the Python files, add a pointer comment. | CI needs the test runner's traces, parallelism, auto-wait and `forbidOnly`; the Python script uses fixed sleeps. Deleting `tests/ui` also removes `record_demo.py` users, so leave it. | Duplicate maintenance; low. |
| Root dependency or separate package? | Separate `tests/e2e` package. | Keeps flatpak node sources, root audit and root lockfile untouched, and avoids the root `package.json` that the Git-hooks claim holds. | A second `npm ci`; low. |
| Dev server or production bundle? | `vite build` then `vite preview`. | Tests what ships, including the strict CSP. | Build adds about 30 s. |
| Retries to hide flakiness? | None. | Tests must be deterministic; a retry hides a real race. | A flake costs a rerun and a fix. |
| How to avoid unmocked-bridge silent passes? | Fixture fails the test if the app calls a command the mock lacks. | Prevents mock drift from hiding crashes. | New app commands need mock entries. |
| Required job? | Add to `validation.needs` and its result check. | "Required" in this repo means the aggregate. | None. |
| Browser binary in CI | `npx playwright install --with-deps chromium`. | Official path; no random installers. | Slower job. |
| Add to pre-push gate? | No; Git-hooks item owns it and claims `scripts/verify-fast.sh`. | Avoid overlapping edits. | Follow-up item note. |

## Design system

No UI surface. The suite only observes the product.

## Evidence

Filled at finish.
