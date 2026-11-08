# Give each e2e run its own server port

## Item

rm-914c68299db1713f, "Give each e2e run its own server port". `tests/e2e/playwright.config.ts` used port 4173 and reused any server found there, so concurrent pre-push gates collided or tested another checkout's build.

## Acceptance

1. Without `E2E_PORT`, a run serves the bundle on a port derived from its process id (4200..6199) and never reuses an existing server.
2. With `E2E_PORT` set, that port is used and an existing server there is reused (outside CI).
3. Worker processes see the same port as the main process.

## Context

Playwright evaluates the config in the main process and again in each worker. The main process exports `E2E_PORT` before workers fork, so the workers inherit the value and take the explicit branch. Only the config reads the port; `screenshots.mjs` serves its own build.

## Plan

1. `tests/e2e/playwright.config.ts`: derive and export the port, restrict `reuseExistingServer`.
2. `master-spec.md` test table and change log, `CHANGELOG.md`.

## Out of scope

Probing for a free port (a collision with `--strictPort` fails loudly instead). The TESTING.md note, which the item "Retire the legacy tests/ui script" writes because another claim holds that file.

## Rulings

- Pid-derived port or an OS-assigned port? -> pid-derived | simple, synchronous, no helper; `--strictPort` makes a collision a loud failure | a rare spurious failure that a rerun clears.
- Where does the explicit/default decision live for workers? -> in the exported env var | workers inherit it | none.
- Is a test of the config worth adding? -> no; the behavior is the evidence below | a unit test of a config file would re-state it | low.

## Design system

No UI surface.

## Evidence

| Claim                               | Evidence                                                                                    | Result                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1: ignores a foreign server on 4173 | `python3 -m http.server 4173` running, then `npx playwright test notes -g "opening a note"` | preview on port 5091, 1 passed                                             |
| 2: explicit port reuses             | same, with `E2E_PORT=4173`                                                                  | reused the foreign server, the test failed as expected (it is not the app) |
| 3: workers agree                    | the passing run above used worker processes for the page URL                                | 1 passed                                                                   |
| full suite                          | `npm run test:e2e`                                                                          | see handoff                                                                |

Reflection: two agents' gates sharing a fixed port showed that every shared local resource a check binds needs a per-run default, not only the ledger -> none: no process rule needed beyond this fix.
