# Wire the app to Leoforma

## Item

rm-2f5b2690e4717485, "Wire the app to Leoforma". Leotheca consumes the public package `@leonardschwier/leoforma` (github.com/LeonardSchwier/leoforma, tag v0.1.1) as the single source of design tokens, bundled fonts and shared primitives, and the in-repo copies are removed.

## Acceptance

- `package.json` pins the dependency to the release tarball of tag v0.1.1 (built `dist/` included, no build step); `package-lock.json` pins its integrity; `npm ci --offline` from the npm cache and `npm run build` succeed from an empty `node_modules`.
- `src/styles/theme.css` imports Leoforma tokens and fonts; the app's token names resolve to `--ds-*` values; app-only tokens stay local.
- Button, IconButton, Spinner, SegmentedControl, Tooltip, Menu and Dialog come from Leoforma; their copies in `src/ui` and the matching rules in `src/ui/primitives.css` are gone. Behavior is unchanged: unit tests for every caller and the e2e suite pass.
- `packages/design-system` is deleted and nothing references it (vitest, eslint, CI, docs, master spec).
- Light and dark screenshots show no broken layout and no contrast loss.

## Context

Leoforma `src` is byte-identical to `packages/design-system/src`. The app's `src/ui` has 7 primitives that Leoforma also has, plus Sheet, EmptyState, StatusIndicator and icons that it does not. About 15 call sites import `src/ui`. npm 12 refuses remote dependencies unless allowed, so a project `.npmrc` sets `allow-remote=root` (only dependencies named in this `package.json`).

## Plan

1. Dependency pin, offline reproducibility (this slice).
2. Tokens: `theme.css` imports Leoforma and aliases; then primitives, one family at a time, with tests.
3. Delete `packages/design-system`, repair vitest/eslint/CI/docs.
4. This spec, master spec, AGENTIC_PDLC gaps row.

## Out of scope

Moving Sheet, EmptyState, StatusIndicator and icons into Leoforma (not yet shared by a second app); the Nordic palette; Leoposta.

## Rulings

- Folio palette values differ from the old Quiet Library values -> adopt Leoforma's values, no local overrides | the owner made Leoforma the single source; a local override would keep a second source alive | Cost if wrong: one theme override block.
- Dependency spelling -> codeload tarball of release tag v0.1.1, whose commit carries the built `dist/` (off main) | a git dependency runs Leoforma's build on every install: it failed on Windows (git dep preparation) and cannot be served to the offline Flatpak build, which needs an https tarball with integrity in `flatpak/node-sources.json`; a GitHub release asset would be sturdier but publishing one was not permitted | Cost: GitHub does not promise byte-stable tag archives; if one changes, `npm ci` fails on integrity and the tag must be re-cut.
- `allow-remote=root` in `.npmrc` -> accepted | npm 12 blocks remote tarballs by default; `root` still blocks transitive ones | Cost: remove if Leoforma is ever published to a registry.
- Missing token or component -> add in Leoforma, tag v0.1.1, bump the pin; never patch locally.

## Design system

Change: Leoforma replaces `theme.css` tokens and the shared primitives. Callers affected are listed in the slice commits.

## Evidence

| Claim                                  | Evidence (command or trace)                                                                                                                                                                                         | Result                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Pinned, offline reproducible           | From an empty `node_modules`: `npm ci --offline`, then `npm run build`; lockfile resolves the v0.1.1 tarball with sha512 integrity (first pinned as a git commit in 0baea09, replaced after the Release run failed) | 603 packages added, build ok                                                         |
| Tokens and primitives from Leoforma    | `npx tsc -p tsconfig.json --noEmit`, `npm run lint`, `npx vitest run`, `npm run build` on a1d22ab                                                                                                                   | tsc rc 0; eslint 0 errors, 3 existing warnings; 175 files, 3277 tests pass; build ok |
| No behavior regression                 | `cd tests/e2e && npm test` on a1d22ab; DocumentHeader, ConfirmDialogHost, Sheet, StatusIndicator and App tests updated for Leoforma class names and roles                                                           | 14 of 14 pass, no console errors or off-site requests                                |
| Android back button kept               | `src/ui/overlayBackButton.test.ts` (5 tests), `src/ui/Sheet.test.tsx` stacking with Dialog                                                                                                                          | pass                                                                                 |
| Accent choices reach shared components | `src/styles/theme.test.ts`; fails on the pre-fix `theme.css` (3 failures), passes after                                                                                                                             | closed                                                                               |
| Visual                                 | Light and dark screenshots of a split-view note (Playwright, 1280x800) inspected                                                                                                                                    | Figtree and Folio palette render, no layout or contrast breakage                     |
| Package removed                        | `git ls-files packages` is empty; tree grep finds no reference                                                                                                                                                      | closed                                                                               |
| Review                                 | Self-review from the brief (no second agent available); one Important finding (accent choices ignored by shared components), fixed in a1d22ab                                                                       | closed                                                                               |
| e2e smoke / security                   | e2e above. Security: no src-tauri, capability, plugin or IPC change; new dependency recorded with a `Dependency-intake` line, no install script of its own beyond its build; Tier 1 audit not applicable            | pass; no audit claimed                                                               |
| legal/text check                       | `Legal/text check: 4 verified, 0 fixed, 0 open` (Leoforma MIT; Figtree, Literata, Source Code Pro under OFL with license files shipped in Leoforma `src/fonts`; no new copy, image or claim)                        | recorded                                                                             |
| Hosted CI                              | CI_RESULT                                                                                                                                                                                                           | CI_RESULT                                                                            |

Visible change on purpose: the palette is Leoforma's Folio theme and the interface font is Figtree, replacing the earlier neutral palette and system font stack (grill ruling 1).
