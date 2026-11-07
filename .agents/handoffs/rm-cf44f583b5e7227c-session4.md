# UX-01 (rm-cf44f583b5e7227c) — Session 4: DocumentHeader Retry → Button primitive

Agent: hermes-local-20260921T133758Z-88fa9a01
Token: 5701c6ccf2e515d2b481d6c72cd09150
Date: 2026-09-21
Status: landed; epic kept `🚧` (in progress, NOT finished)

## Scope (this session only)

Migrated the save-error "Retry" action in `DocumentHeader` from a raw
`<button>` to the section 20 `Button` primitive (variant ghost, size sm),
completing the last raw-control migration in that component and bringing it
fully in line with the shared-control contract (token colors, hover, focus
ring, disabled state, motion tokens from primitives.css).

- src/app/layout/DocumentHeader.tsx — Retry now `<Button variant="ghost" size="sm"
  className="document-header-savestate-retry">` (same handler, same `type="button"`
  default, same text/aria — no behavior or accessibility change).
- src/app/App.css — `.document-header-savestate-retry` reduced to the inline
  link affordance (underline + `--space-2` left margin) plus a documented
  `height:auto; padding:0` override so the 28px `.btn-sm` fits the 12px
  StatusIndicator label; the properties it previously set (background/border/
  cursor/color/font) are all now supplied by primitives.css.
- src/app/layout/DocumentHeader.test.tsx — regression test asserting the rendered
  Retry button carries `btn`/`btn-ghost`/`btn-sm` in addition to the existing
  interaction test (retry still calls `onRetrySave` exactly once).

## Acceptance

1. Save-error state renders identically in behavior: "Save failed" + Retry,
   Retry re-invokes `onRetrySave` — verified by existing test (passes).
2. Retry carries the Button primitive classes and inherits the primitive
   contract — verified by new test (passes).
3. No visual regression: every removed App.css declaration is re-supplied by
   `.btn`/`.btn-ghost`/`.btn-sm`; inline fit preserved by documented override.
4. Full frontend gate green on the exact candidate tree (below).

## Verification (this session, on candidate 721baa8)

- npx vitest run src/app/layout/DocumentHeader.test.tsx — 5 files / 136 tests passing
  (includes the new "renders the Retry control as the section 20 Button
  primitive (ghost, sm)" test, 14ms, ✓)
- npx tsc -p tsconfig.json --noEmit — clean
- npm run lint (eslint .) — 0 errors
- npm run check-version — pass
- npx vitest run src — 719 files / 13,566 tests passing (covers sibling worktrees
  picked up by the `include` glob; no failures)
- npx vite build — success (4.88s; pre-existing chunk-size warning only)
- Integrated candidate: merged origin/main (75e6e25 + renew d236857), re-ran
  DocumentHeader + src/ui suites (65 files / 781 tests passing) and tsc (clean)
  before pushing.

## Review

Self-review (documented separately, not passed off as independent): diff limited
to the three files above; no props/aria/keyboard changes; class-string assertion
pins exactly the contract it claims; no other `.document-header-savestate-retry`
references in the codebase. Findings: (a) `.btn-sm` 28px height vs 12px label —
resolved with explicit documented override; (b) all removed CSS properties
confirmed re-supplied by primitives.css. No independent agent review performed
this session (local review endpoint not reachable); self-review + full gate are
the evidence.

## CI

Candidate 721baa8db435bfdf51c118acfff1abd7babc342f on origin/main:
- CI run 35608145257 — in_progress at handoff time (2026-09-21T13:51Z)
- Release run 35608145599 — in_progress at handoff time
Ledger claim/renew/push policy runs for 8f5ba16/320fc03/e50aa2e/d236857 — all
completed success. Next worker: `gh api repos/LeonardSchwier/leotheca/actions/runs?head_sha=721baa8db435bfdf51c118acfff1abd7babc342f`

## Landed

Implementation commit: 75e6e25 (feat(ux-01): migrate DocumentHeader save-error
Retry to the Button primitive); landed merge SHA on origin/main: 721baa8.
Task remains 🚧 open for the remaining UX-01 phases (App.css hex cleanup,
overlay/motion unification, settings persistence).
