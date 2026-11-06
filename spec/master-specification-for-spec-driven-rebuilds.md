# Master specification for spec-driven rebuilds

## Item
rm-e0a353c57cfd59e2. Write `master-spec.md`, an accurate description of current behavior, and enforce that implementation pushes update it.

## Acceptance
- `master-spec.md` exists with requirement ids, bridge contract, data formats and a dated change log; every linked test file exists (`check_master_spec.py` structure check).
- A push that changes an application path without changing the spec, or without a new change log line, fails (`scripts/test_check_master_spec.py`, 21 tests on temporary git repos).
- CI job `master-spec` in `agent-policy.yml` runs the checker on every push touching those paths.
- Constitution rule "Master specification rule" exists and points to `skills/master-spec-maintenance.md`. Pending: `CONSTITUTION.md` is under a live claim by the git-hooks item (see Rulings).

## Context
Predecessor work (unlanded) supplied the draft spec, checker and tests. Reviewed here by sampling against code: link cache version 8, window size, Cargo release profile, WebKit env vars, settings ranges and defaults, and the full Tauri command list (36 handlers) against section 7.2. No mismatch found. Not every clause was verified; section 15 lists coverage gaps.

## Plan
1. Land spec, checker, tests, skill, workflow job (done in this slice).
2. Add the constitution rule once `CONSTITUTION.md` is free.

## Out of scope
Rewriting the spec to track behavior that changed after the draft was written; later pushes carry that via the new CI rule.

## Rulings
- Constitution edit vs live claim of the git-hooks item on `CONSTITUTION.md` and `skills/pdlc-playbook.md` -> land everything else now, release the remainder | Conflicting live claims exclude each other (coordination invariant 4) | Cost if wrong: rule lands a session later. Interim, the CI job already enforces the rule.
- Workflow `paths` filter -> add application paths to the policy workflow triggers | The check must run on pushes that only change code | Cost: policy tests also run on code pushes.

## Design system
no UI surface

## Evidence
See the handoff `.agents/handoffs/rm-e0a353c57cfd59e2.md`.
