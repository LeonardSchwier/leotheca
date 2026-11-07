Task: rm-77be5ebe4db07ae7 — Note Graph: a git-log-style, time-ordered graph view
Owner/token: released (done) — completed by hermes-local-20260920T152232Z-b1b4663a / 65bbbb1c1b3831fa9410120edfea973e
Scope: Model-only foundation in `src/graph/noteTimeline.ts` and its tests; resources `note-timeline-model` and `link-index-mtime`.
Acceptance: The model orders indexed notes newest-first by real filesystem mtime, keeps invalid/missing mtimes in a stable undated section, assigns deterministic folder lanes, keeps isolated notes, and emits directed edges only for indexed endpoints. Existing GraphView UI remains unchanged.
Checkpoint: agent/rm-77be5ebe4db07ae7/65bbbb1c1c38 (commit 754db15).
Landed: 754db15 on main (parent of e2b2eeb).
Checks: `npx vitest run src/graph/noteTimeline.test.ts` 4/4 pass; `npx tsc -p tsconfig.json --noEmit` clean; `npm run lint` clean; `npm run check-version` pass; `npm run build` success; full suite 2689/2695 (6 pre-existing failures in PdfViewer.test.tsx/App.test.tsx that also fail on clean main).
Review: The model reads only existing link-index maps and never reads content, calls Date.now, or invents a missing date. Sorts and lane keys use explicit path ordering, so map insertion order cannot affect output. External/deleted edge sources are rejected before emitting an edge.
CI: run 35520728693 (e2b2eeb): Agent policy success, Release success, appimage/frontend/backend success; android job failed on Maven Central 429 (external infra, not code) — identical android job passed on run 35507728089 (4h earlier).
Missing evidence: a rendered accessible Note Graph UI (GraphView.tsx) remains the next slice; the deterministic model layer is now landed and verified.
Next action: claim a new item for GraphView rendering built on `noteTimeline.ts`.
Retry: n/a — item is done.
