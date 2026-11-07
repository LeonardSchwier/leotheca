# Handoff: UX-01 DocumentHeader breadcrumb — completed 2026-09-20

**Landed SHA**: c5274a2 (feature commit) → main via merge commit 6ccbfa3
**Ledger**: rm-cf44f583b5e7227c → state `done`, completed_by hermes-local-20260920T110135Z-f5e4a113

## What changed
- `src/app/layout/DocumentHeader.tsx`: added optional `workspaceRelativePath?: string` prop; when provided and differs from `notePath`, shows a breadcrumb separator + relative path in a span; title attribute always carries the full native path
- `src/app/layout/DocumentHeader.test.tsx`: +4 new tests (relative path rendering, title preservation, single-segment no separator, fallback when prop absent)
- `src/app/App.css`: +2 new CSS rules (`.document-header-breadcrumb`, `.document-header-breadcrumb::before`)
- `src/app/App.tsx`: +1 line passing `workspaceRelativePath={rootPath ? relativePath(rootPath, current.path) : current.name}`
- `ROADMAP.md`: claim → done state transition

## Verification
- **Branch CI** (run 35506969467): android ✓, frontend ✓, appimage-smoke ✓, backend ✓, validation ✓
- **Main CI** (run 35507728089, after merge 6ccbfa3): all 5 jobs ✓
- **Local**: DocumentHeader.test 27/27, App.test 98/100 (2 pre-existing F05), PdfViewer 14/18 (4 pre-existing), full vitest 2685/2691 (6 pre-existing, all F05/PDF), tsc clean, lint clean, check-version clean, build success
- **Release workflow** (35507728268): in_progress at time of writing; not a gate

## Recovery note
Previous session's commit 67bfe1a was on a dead branch `agent/rm-cf44f583b5e7227c/44549d46b28f` that was never merged. This session restored the identical 4-file change against current main, ran full verification, and merged.

## UX-01 status
UX-01 remains in progress (Phase 1a + 1a follow-ups done; this is Phase 1b DocumentHeader breadcrumb partial). The spec has 6 phases; more work remains.
