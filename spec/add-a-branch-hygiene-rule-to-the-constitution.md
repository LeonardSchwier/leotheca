# Add a branch-hygiene rule to the constitution

## Item

rm-dc00fcf174bc25d4, "Add a branch-hygiene rule to the constitution". The constitution says when a work branch is no longer needed, who closes it, and which branches nobody deletes, so finished branches do not pile up on the remote and in local clones.

## Acceptance

- `CONSTITUTION.md` has a short "Branch hygiene" section that defines a finished branch (merged into main, all patches in main, or an item that is done or abandoned with no live claim and no open pull request), makes the item owner delete it on the remote and locally and prune its worktree, and lists the branches nobody deletes (main, the ledger branch, a branch with an open pull request, a branch named by a live claim).
- The section says to record the branch name and tip SHA in the item's handoff before deleting a branch with commits that are not in main.
- Invariant 8 points to the section, so "another agent's work" no longer covers a finished branch.
- `skills/roadmap-workflow.md` and `skills/pull-request-delivery.md` do not contradict the section.
- `scripts/guard-command.mjs` still blocks `git push --delete`, `git push origin :x`, `git branch -D` and `git stash drop`, and its two messages name the Branch hygiene rule; `git branch -d` stays allowed. A test in `scripts/guard-command.test.js` proves both.
- `CONSTITUTION.md` stays under the 200-line shape limit (`node scripts/check-rules.mjs`).

## Context

Read: `CONSTITUTION.md` (invariant 8, "Durable handoff and shutdown", "Self-improvement", "Master specification rule"), `skills/roadmap-workflow.md` sections 6 and 7, `skills/pull-request-delivery.md` step 8, `documentation/BRANCH_MODEL.md` (repository setting "automatically delete head branches"), `scripts/guard-command.mjs` and its test, `scripts/check_master_spec.py` (APP_PATTERNS: no file of this change is listed, so no master-spec entry), `scripts/check-rules.mjs` (Review trailer for the constitution, shape limits).

Crash-freedom checklist: not applicable (process text and the message strings of an opt-in guard; no application code).

## Plan

1. `scripts/guard-command.test.js`: add a case that the remote-delete and force-delete messages name "Branch hygiene" and that `git branch -d agent/x` is allowed; watch it fail.
2. `scripts/guard-command.mjs`: change the two messages; watch the test pass.
3. `CONSTITUTION.md`: add the section after "Durable handoff and shutdown" and the pointer in invariant 8.
4. `skills/roadmap-workflow.md` section 6 and 7, `skills/pull-request-delivery.md` step 8: point to the section.

## Out of scope

Deleting any branch (the owner's session does the cleanup), a script that finds finished branches, changing repository settings, and relaxing the guard so it allows deletion.

## Rulings

- Does the guard keep blocking branch deletion? -> yes, only the messages change | the guard cannot see a claim or a pull request, so it cannot tell a finished branch from live work; a seatbelt that blocks and names the rule is safer | Cost if wrong: an owner deletes by hand or relies on the automatic delete after merge.
- Is a branch of an expired or released item without a live claim "finished"? -> yes, when no open pull request names it, and only after its name and tip SHA are in the handoff | the SHA record makes the deletion reversible, so an abandoned checkpoint is not lost | Cost if wrong: a successor restores the branch from the recorded SHA (`git push origin <sha>:refs/heads/<name>`), which only works while GitHub keeps the commit; the handoff makes that window visible.
- Recovery in `roadmap-workflow.md` section 7 says "never delete the predecessor's branch" -> keep it while the item is being recovered | the branch is checkpoint input until the item is finished; after that the new rule applies | Cost if wrong: one more stale branch.
- Does the change need a `master-spec.md` or `CHANGELOG.md` entry? -> no | `scripts/check_master_spec.py` lists no touched path, and the constitution exempts docs; process changes such as rm-573e5969c54c86fe added none | Cost if wrong: the `master-spec` job fails and names the file.
- Anything against the product rules? -> no | process text and an opt-in agent guard only.

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

Filled at stage 6.
