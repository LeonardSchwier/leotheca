# Graph layout performance contract

The graph view uses a force-directed layout in `src/graph/layout.ts`. Its work is deliberately bounded because layout runs in the shared frontend and must not make large workspaces scale as `O(nodes² * 300)` without limit.

Small graphs keep the exhaustive pairwise behavior. Once the exhaustive estimate would exceed the layout budget, the algorithm switches to deterministic repulsion sampling, caps attraction-edge sampling, and chooses an iteration count whose estimated force interactions do not exceed 500,000. This is a CPU-work bound, not a promise that every device completes in an identical number of milliseconds.

The regression suite measures representative 100, 500, 2,000, and 5,000-node budgets. It also times a 2,000-note chain fixture with a deliberately generous 2-second shared-CI ceiling; the deterministic 500,000-interaction limit is the primary portability guard, while the wall-clock assertion catches accidental removal of that limit.

`src/graph/layoutCoordinator.ts` owns repeated layout requests. Requests in the same turn are coalesced, every request receives a monotonically increasing generation, and a result must still own that generation after computation before it may publish. Resize, filtering, mode changes, and unmount therefore cannot let queued stale work replace the newest graph. The first visible layout remains synchronous so the canvas is immediately interactive; it uses the same bounded algorithm.
