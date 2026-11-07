Task: rm-6921cb49f0ead7cd CanvasView: do not render edges to retained unknown nodes
Owner/token: released as blocked; former token c8ffd5f6e76094afdb8cba1592b7a7ed
Scope: src/canvas/CanvasView.tsx and src/canvas/CanvasView.test.tsx; resource canvas-document
Acceptance: A preserved edge to an unrenderable future-format node cannot crash CanvasView and is omitted from rendering without mutating the source.
Checkpoint: agent/rm-6921cb49f0ead7cd/c8ffd5f6e760 at 71889a9
Landed: not landed
Checks: `npx vitest run src/canvas/CanvasView.test.tsx src/canvas/canvasDocument.test.ts` passed 27 tests; TypeScript passed; lint had 0 errors and 8 pre-existing warnings; version check and production build passed.
Review: decodeCanvas intentionally retains object-shaped unknown nodes and accepts edges to their IDs. CanvasView only renders known nodes, so force-unwrapped edge endpoints threw on an unknown target. The checkpoint skips only edges lacking a renderable endpoint and keeps lossless persistence unchanged.
CI: no hosted run for the checkpoint.
Missing evidence: Full `npm test -- --run` has four current-main failures in src/capture/pendingCaptures.test.ts, unrelated to Canvas.
Next action: after those F05 tests pass on main, claim the task again, cherry-pick 71889a9, integrate current main, rerun the full frontend suite, and land.
Retry: 2026-09-07T11:42:15Z or after F05 pending-capture test repairs land.
