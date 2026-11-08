# Retire the legacy tests/ui script

## Item

rm-e2d9d55abee75dd7, "Retire the legacy tests/ui script". `tests/ui` held 27 Python Playwright tests (T01 to T28, no T22) against a Tauri mock, outside CI. Map each to a `tests/e2e` journey, add the worthwhile missing ones, drop the rest with a reason, then delete `tests/ui`, its ESLint entry and its documentation.

## Acceptance

1. Every legacy test is mapped (table below) or dropped with a reason.
2. The missing worthwhile coverage exists as an e2e journey that passes.
3. `tests/ui`, its `.gitignore` lines, its ESLint entry and the TESTING.md section are gone; nothing references them.
4. `master-spec.md` no longer lists the legacy suite and has a change-log entry.

## Context

Read `tests/ui/leotheca_e2e_test.py`, `record_demo.py`, `tauriMock.js`, the five `tests/e2e/tests/*.e2e.ts` files, `support/fixtures.ts` (fails any test on console errors, unhandled rejections, off-origin requests and unmocked commands), `tests/e2e/screenshots.mjs` (README screenshots; it uses `support/bridgeMock.ts`, not `record_demo.py`), `eslint.config.js`, `documentation/TESTING.md`.

## Mapping

| Legacy test                                                               | Where it is covered                                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 container loaded, T03 content rendered, T04 sidebar visible           | `boot.e2e.ts` "boots into the saved workspace and lists its notes"                                                                                 |
| T02 no Tauri errors, T28 no console errors                                | the `app` fixture fails every journey on console errors, rejections and unmocked native commands                                                   |
| T05 not on onboarding                                                     | boot journey (the saved workspace opens straight to its notes)                                                                                     |
| T06 file tree shows all files                                             | boot journey                                                                                                                                       |
| T07 open a file from the tree                                             | `notes.e2e.ts` "opening a note shows it in a tab with its text"                                                                                    |
| T08 switch to Preview                                                     | `rendering.e2e.ts` "view modes switch between source, split and preview"                                                                           |
| T09 to T15 full-text, `tag:`, `path:`, negation, `OR`, empty state, clear | `search.e2e.ts` "full-text search with operators, empty state and clear"                                                                           |
| T16 headings H1/H2/H3, T18 inline code, T19 block quote                   | new: `rendering.e2e.ts` "preview renders nested headings, inline code and block quotes"                                                            |
| T17 bold and italic, T20 task boxes, T21 table, T23 KaTeX, T24 link       | `rendering.e2e.ts` "preview renders the markdown features a note uses"                                                                             |
| T25 theme toggle                                                          | `settings.e2e.ts` "the saved theme applies at boot and a change is persisted" (the legacy test fell back to `localStorage` when no toggle existed) |
| T26 font size setting exists                                              | dropped: it only logged and asserted nothing                                                                                                       |
| T27 workspace stats                                                       | `settings.e2e.ts` "settings opens on the workspace root and asks the native side for statistics" (the legacy test also asserted nothing)           |
| speech or dictation                                                       | none of the 27 tests touched it                                                                                                                    |
| `record_demo.py`                                                          | dropped: a demo recorder with its own mock, not used by the screenshot script, no video in the repository                                          |

## Plan

1. New journey in `tests/e2e/tests/rendering.e2e.ts`. 2. Delete `tests/ui`; remove its `.gitignore` lines and ESLint entry; add the Playwright report and results directories to the ESLint ignores. 3. Rewrite the TESTING.md section. 4. `master-spec.md` table row and change log, `CHANGELOG.md`.

## Out of scope

The PDLC gap-table row (`documentation/AGENTIC_PDLC.md`) is claimed by "Bring the PDLC gap table up to date with what landed on 2026-11-08"; the handoff tells that item what to write. Restoring a multi-key typing test (see the freeze spec).

## Rulings

- Port all 27 one-to-one? -> no | most are the same user journey asserted many times; one journey each for boot, search, rendering is what the suite already does | coverage lost is only the tests that asserted nothing.
- Add what? -> headings below H1, inline code, block quote | they are real renderer paths not asserted anywhere else | none.
- Add `playwright-report` and `test-results` to the ESLint ignores in the same change? -> yes | found while running the checks: a failed local e2e run left an HTML report that made `eslint .` report about 4000 errors and would fail the pre-push gate | none.
- Is `record_demo.py` used for screenshots? -> no, `screenshots.mjs` has its own bridge mock | checked by reading both and by grep.

## Design system

No UI surface.

## Evidence

| Claim                                | Evidence                                                         | Result                                                                |
| ------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| new journey passes                   | `npx playwright test rendering -g "text structure"`              | 1 passed                                                              |
| suite                                | `npm run test:e2e`                                               | see the pull request                                                  |
| nothing references the removed files | `git grep -n "tests/ui"` outside specs, the roadmap and handoffs | only the change-log entries and the PDLC row left for the other claim |
| checks                               | `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`  | see the pull request                                                  |

Reflection: a failed local e2e run leaves a report that breaks the next lint and the pre-push gate -> applied: the report and result directories are now ignored by ESLint.

Glossary: none, the item adds no domain or process term
