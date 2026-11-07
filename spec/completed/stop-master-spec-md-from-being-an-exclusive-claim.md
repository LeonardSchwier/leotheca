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

| Claim                                                                                                      | Evidence                                                                                                                                                                                                                                                  | Result            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Two claims naming master-spec.md or CHANGELOG.md do not conflict; `.`, ROADMAP.md and other paths still do | `test_shared_append_only_documents_do_not_conflict`, `test_roadmap_file_itself_stays_exclusive` in `scripts/test_agent_ledger.py`; the first errors against the original helper (112 tests, 1 error), passes with the change (112 OK), tested SHA 1125fb4 | observed          |
| Docs say so                                                                                                | constitution invariant 4, `skills/roadmap-workflow.md` step 2, DECISIONS.md bullet 2026-11-07                                                                                                                                                             | in 1125fb4        |
| Gate                                                                                                       | lint, tsc, unittest, `check-rules.mjs trailers` and `deps` green; pre-push gate (vitest, version, roadmap format) green                                                                                                                                   | landed as f5e1f8a |
| Hosted runs of f5e1f8a                                                                                     | CI 42371233768, Rules 42371233798, Release 42371233825, Agent policy 42371233975                                                                                                                                                                          | all success       |
| Review                                                                                                     | self-review, no second model                                                                                                                                                                                                                              | closed            |
| Legal/text check                                                                                           | Legal/text check: 4 verified, 0 fixed, 0 open                                                                                                                                                                                                             | recorded          |
