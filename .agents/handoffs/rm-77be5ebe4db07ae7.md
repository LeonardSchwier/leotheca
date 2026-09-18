Task: rm-77be5ebe4db07ae7 — Note Graph: a git-log-style, time-ordered graph view
Owner/token: codex-20260918T195355Z-80f32665 / cf6e5f02410353e7be98c84cec81c2bb
Scope: Model-only foundation in `src/graph/noteTimeline.ts` and its tests; resources `note-timeline-model` and `link-index-mtime`.
Acceptance: The model orders indexed notes newest-first by real filesystem mtime, keeps invalid/missing mtimes in a stable undated section, assigns deterministic folder lanes, keeps isolated notes, and emits directed edges only for indexed endpoints. Existing GraphView UI remains unchanged.
Checkpoint: not yet committed.
Landed: not landed.
Checks: `npx vitest run src/graph/noteTimeline.test.ts --reporter=dot` passed (1 file, 4 tests); `npx tsc -p tsconfig.json --noEmit` and focused ESLint passed; `git diff --check` passed.
Review: The model reads only existing link-index maps and never reads content, calls Date.now, or invents a missing date. Sorts and lane keys use explicit path ordering, so map insertion order cannot affect output. External/deleted edge sources are rejected before emitting an edge.
CI: not yet inspected.
Missing evidence: full frontend suite, production build, and a rendered accessible Note Graph UI remain required before delivery.
Next action: review/commit the model checkpoint, then complete full frontend verification before integrating a later rendering slice.
Retry: available now.
