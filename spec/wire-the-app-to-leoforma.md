# Wire the app to Leoforma

## Item

rm-2f5b2690e4717485, "Wire the app to Leoforma". Leotheca consumes the public package `@leonardschwier/leoforma` (github.com/LeonardSchwier/leoforma, tag v0.1.0) as the single source of design tokens, bundled fonts and shared primitives, and the in-repo copies are removed.

## Acceptance

- `package.json` pins the dependency to tag v0.1.0 over https; `package-lock.json` pins the commit; `npm ci --offline` from the npm cache and `npm run build` succeed from an empty `node_modules`.
- `src/styles/theme.css` imports Leoforma tokens and fonts; the app's token names resolve to `--ds-*` values; app-only tokens stay local.
- Button, IconButton, Spinner, SegmentedControl, Tooltip, Menu and Dialog come from Leoforma; their copies in `src/ui` and the matching rules in `src/ui/primitives.css` are gone. Behavior is unchanged: unit tests for every caller and the e2e suite pass.
- `packages/design-system` is deleted and nothing references it (vitest, eslint, CI, docs, master spec).
- Light and dark screenshots show no broken layout and no contrast loss.

## Context

Leoforma `src` is byte-identical to `packages/design-system/src`. The app's `src/ui` has 7 primitives that Leoforma also has, plus Sheet, EmptyState, StatusIndicator and icons that it does not. About 15 call sites import `src/ui`. npm 12 refuses git dependencies unless `allow-git` is set, so a project `.npmrc` sets `allow-git=root` (only dependencies named in this `package.json`).

## Plan

1. Dependency pin, offline reproducibility (this slice).
2. Tokens: `theme.css` imports Leoforma and aliases; then primitives, one family at a time, with tests.
3. Delete `packages/design-system`, repair vitest/eslint/CI/docs.
4. This spec, master spec, AGENTIC_PDLC gaps row.

## Out of scope

Moving Sheet, EmptyState, StatusIndicator and icons into Leoforma (not yet shared by a second app); the Nordic palette; Leoposta.

## Rulings

- Folio palette values differ from the old Quiet Library values -> adopt Leoforma's values, no local overrides | the owner made Leoforma the single source; a local override would keep a second source alive | Cost if wrong: one theme override block.
- Dependency spelling -> `git+https` with tag, lockfile holds the commit | `github:` resolves to `git+ssh`, which fails in CI without keys | Cost: none.
- `allow-git=root` in `.npmrc` -> accepted | npm 12 default blocks all git sources; `root` still blocks transitive git dependencies | Cost: remove if Leoforma is ever published to a registry.
- Missing token or component -> add in Leoforma, tag v0.1.1, bump the pin; never patch locally.

## Design system

Change: Leoforma replaces `theme.css` tokens and the shared primitives. Callers affected are listed in the slice commits.

## Evidence

See the table filled at archive time.
