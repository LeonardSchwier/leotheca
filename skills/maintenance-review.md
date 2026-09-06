<!--
Variables: read CONSTITUTION.md (roadmap_file, handoff_dir, main_branch).
HISTORIC_BATCH_COMMITS = 10
REVIEW_AREAS = workspace persistence; filesystem/IPC commands; async lifecycle;
search/parsing; editor/preview; platform parity; packaging; documentation
-->

# Productive work when feature work is unavailable

Use when Open items are all implemented, live-claimed, or externally blocked. Continue improving reliability through a bounded, claimed review. Do not invent product scope or create cosmetic churn to consume tokens.

## Pick an unreviewed scope

1. Refresh main and the ledger. Read past review handoffs so workers do not repeatedly inspect the same commits/area. Prefer a recently changed high-risk area, then move backward through history.
2. Choose at most HISTORIC_BATCH_COMMITS commits in one area, or one named command/API and its callers. Record the exact SHA range and current-main SHA. Historic commands includes filesystem/IPC handlers, application command dispatch, and checked-in development/release command recipes; never blindly execute old shell commands.
3. Search current roadmap, handoffs, tests, and codebase audit findings for duplicates and previously fixed issues. A historical bug may already be fixed.
4. Add a small `⬜` review item under Open Bugs/maintenance in a fresh control commit, with acceptance criteria and exact review scope. Claim it before any edits using the normal token, touch-path, and resource protocol. If another worker wins that review scope, choose a different area/range.
5. A read-only review may overlap code being implemented, but any repair needs a non-overlapping write claim. Prefer separate ranges/resources so useful reviews also run concurrently.

## Review for observable defects

Trace public entrypoint through validation, state/storage/native calls, and observable output. Look for:

- Wrong boundaries, traversal/symlink escapes, unvalidated IPC, unsafe rendering.
- Corrupt/future data overwritten, partial writes, failed saves, schema migration loss.
- Stale async results, workspace switches, cancellation, timers/listeners never cleaned up.
- Search negation, cache/skip decisions, Unicode/UTF-16 ranges, empty and large inputs.
- Native/frontend contract differences and unhandled platform errors.
- Tests that mock away the behavior, assert only call counts, or never execute the real path.
- Stale docs, invalid command options/working directories, removed files, and misleading release claims.

Reproduce suspected defects on current main. Keep proof small: one failing regression test or a concrete source/docs contradiction. Do not turn a hunch into an asserted bug.

## Deliver and advance

Fix a small proven defect within the claimed scope and test it. A distinct larger finding becomes one deduplicated Open Bug with reproduction, impact, affected paths, and acceptance criteria; claim it normally. Do not bundle unrelated findings in one implementation commit.

For test improvements, prove a real uncovered behavior or boundary. For docs, verify the actual command/path/API and state what changed. A historical review's output is evidence and useful fixes, not an obligatory rewrite.

Record reviewed SHAs/command, current-main baseline, paths examined, findings/fixes, test evidence, and next unreviewed range in its handoff. Finish the review item after its stated scope is complete, even if no defect was found; say "no defect found in this scope", not "the codebase is bug-free". A concise review record prevents duplicate future work. Do not make repeated no-op reports for the same unchanged scope.

Refresh feature eligibility after every batch. If a prerequisite or CI capability becomes available, return to that work. If all meaningful review scopes are exhausted or unavailable, checkpoint and stop honestly; a runner may start the next session when conditions change.
