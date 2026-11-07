# Stop master-spec.md from being an exclusive claim

## Item

rm-ced6b586f1b2f0fc. Two claims that both name `master-spec.md` or `CHANGELOG.md` no longer conflict in the ledger helper.

## Acceptance

- `agent_ledger.py claim` accepts a second claim whose touch list names `master-spec.md` (or `CHANGELOG.md`) while another live claim holds it; `check` stays valid for both owners.
- A claim on `.`, on `ROADMAP.md` or on any other path held by a live claim still fails with a touch-path overlap.
- The constitution, `skills/roadmap-workflow.md` and the decisions file say so.

## Context

`scripts/agent_ledger.py` rejected any equal or nested touch paths. CI (`scripts/check_master_spec.py`) requires every implementation push to extend `master-spec.md`, so every code claim named it and agents blocked each other for an hour. Edits to it are appended change log lines and merge line by line, like the changelog.

## Plan

1. Add `paths_conflict` and `SHARED_APPEND_PATHS` in `scripts/agent_ledger.py`, used by claim and check. Tests in `scripts/test_agent_ledger.py`: `test_shared_append_only_documents_do_not_conflict`, `test_roadmap_file_itself_stays_exclusive`.
2. Constitution invariant 4, `skills/roadmap-workflow.md` steps 2 and 3, a decisions bullet.

## Out of scope

Dropping the CI requirement to update `master-spec.md`. Making `ROADMAP.md` shareable.

## Rulings

- Exempt only the two exact file names, not parents -> a claim on `.` still excludes everything | it must keep meaning "the whole repository" | Cost if wrong: one more name in the set.
- Keep `ROADMAP.md` exclusive -> structural rewrites of the ledger really do conflict | per-item edits already do not need the path | Cost: none.
- Merge conflicts in `master-spec.md` between two agents -> accepted | the change log is append-only and `check_master_spec.py` plus the merge step before push (roadmap-workflow step 5) catch a bad merge | Cost: an occasional textual conflict to resolve.
- Spec lands in `spec/` while another live claim holds `spec/completed` as a directory -> claim lists only the `spec/<slug>.md` path | the moved file has a distinct name | Cost: none.

## Design system

No UI surface.

## Evidence

Filled at finish.
