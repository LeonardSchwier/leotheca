---
name: pull-request-delivery
description: Deliver a verified roadmap item to main through a pull request and the merge queue. The only way code reaches main.
---

# Pull request delivery

Main is changed only by a merged pull request. `documentation/BRANCH_MODEL.md` explains why. Ownership transactions (claim, renew, block, finish, handoff) are not code and go to the ledger branch as before; see `roadmap-workflow.md`.

Variables: read CONSTITUTION.md (remote, main_branch).

## Steps

1. Verify the work branch locally with `verification-suite.md`. The pre-push hook runs on the branch push too.
2. Merge fresh main into the work branch, resolve conflicts with `merge-conflict-resolution.md`, retest what the merge changed, and check your claim is still valid (`agent_ledger.py check --margin-minutes 10` in the control tree on the ledger branch).
3. Push the branch: `git push "$REMOTE" "HEAD:refs/heads/$WORK_BRANCH"`. Never push to main; the hook refuses it, and the server does once the ruleset is on.
4. Open the pull request with a conventional-commit title and a body that ends with the evidence trailers. The squash commit takes its message from the title and body, so the commit rules run on exactly that text:

   ```sh
   gh pr create --base "$MAIN_BRANCH" --head "$WORK_BRANCH" --title "type(scope): summary" --body-file "$BODY_FILE"
   ```

   The body holds the task id, the review summary and test evidence, and the trailers the rules require (`Co-Authored-By:`, and `Legal-Check:`, `Review:`, `Database-Review:` or `Dependency-intake:` when the paths demand them).

5. Switch on merging. Prefer auto-merge, which waits for the required checks and the queue:

   ```sh
   gh pr merge "$PR" --auto --squash --subject "type(scope): summary" --body-file "$BODY_FILE"
   ```

   If auto-merge is unavailable (the repository setting or ruleset is not on yet), wait with `gh pr checks "$PR" --watch` and merge when the required checks are green: `gh pr merge "$PR" --squash --subject ... --body-file ...`. Never merge on red. Never use an admin bypass.

6. Keep renewing the lease while the PR waits. Read the failed log of any red check, quote the real error, fix it on the branch and push again. A conflict after a queue entry is repaired the same way: merge main into the branch, retest, push.
7. When the PR is merged, record the merge commit SHA in the handoff, then finish the item on the ledger branch. Finished means merged. Runs that start on main after the merge (Release, Dependabot) are inspected and their ids appended to the handoff; a red one is a main regression and takes priority.
8. Delete only your own work branch, after the merge. Leave other agents' branches alone.

## If the owner is gone

A PR whose owner lost the lease is repaired by the scheduled integrator or by any agent that claims the same item. Do not take over a live lease.

## Never

No direct push to main, no force push, no `--no-verify`, no merge with a red or missing required check, no change of repository or ruleset settings.
