# Move the ownership ledger to a ledger branch

Landed 94c5abf (rename) after 966847c on main. The branch is `agent-ledger`: the name `ledger` is blocked by the existing remote branch `ledger/block-rm-eb46d96ce737393f`, which is not ours to delete.

Changed: `ledger_branch` in CONSTITUTION.md, ownership-ledger rule 1, `skills/roadmap-workflow.md` (control transactions use LEDGER_BRANCH, upkeep merge of main before a finish push), weekly `ledger-audit` checkout ref, BRANCH_MODEL.md phase 2 done, DECISIONS row, master-spec entry. 118 policy tests pass locally.

Hosted CI pending for 94c5abf: Agent policy 42387942183, CI 42387942191, Rules 42387942027, Release 42387942071 (see the 966847c runs 42387854162, 42387854058, 42387854078, 42387854194 for the first half).

Known gaps, seeded into later phases: AGENTS.md and autonomous-roadmap-delivery.md still say "ledger on main" (phase 4 rewrite); ROADMAP.md on main lags until the integrator syncs it (phase 5).

Reflection: choosing a branch name without listing remote refs cost a failed push -> applied: check `git ls-remote --heads origin '<name>*'` before creating a branch; recorded in this handoff only (too narrow for a skill).
