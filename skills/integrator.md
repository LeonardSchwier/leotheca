---
name: integrator
description: Scheduled role that repairs or merges pull requests whose owner is gone, and keeps the roadmap snapshot on main current.
---

# Integrator

Pull requests normally merge themselves: the owner of an item repairs and merges its own PR (`pull-request-delivery.md`). The integrator covers what is left: PRs whose owner lost the lease, and the lagging `ROADMAP.md` snapshot on main. It never bypasses a check, never force-pushes and never touches a live lease.

Variables: read CONSTITUTION.md (remote, main_branch, ledger_branch).

## Schedule

Run it hourly from a scheduled session, with this prompt: "Read AGENTS.md and skills/integrator.md and run one integrator pass." It is one pass, then stop. It needs the same setup as any agent (own clone, control worktree on the ledger branch, session id).

## One pass

1. Fetch `main` and the ledger branch. In the control worktree on the ledger branch run:

   ```sh
   python3 scripts/integrator_report.py --root "$CONTROL_DIR"
   ```

   It prints one action per open pull request.

2. Act on each line, one pull request at a time:

   | Action   | What to do                                                                                                                                                                                                                                       |
   | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `ignore` | Nothing. Dependabot and human branches are not yours.                                                                                                                                                                                            |
   | `wait`   | Nothing. Checks are running.                                                                                                                                                                                                                     |
   | `owner`  | Nothing. A live lease owns it, even if it is red.                                                                                                                                                                                                |
   | `repair` | Claim the item with `agent_ledger.py claim` (the lease has expired, so this is allowed), check out the PR branch, merge main, read the failing log and quote the real error, fix, push, then treat it as `merge`.                                |
   | `merge`  | Claim the item, confirm the required checks are green on the PR (`gh pr checks`), squash-merge with the PR's own title and body (`gh pr merge --squash --subject ... --body-file ...`), finish the item on the ledger branch with the merge SHA. |

   A repair that needs more than one session is released with a handoff naming the failing check, so the next pass starts from it.

3. Sync the roadmap snapshot. When `ROADMAP.md` on the ledger branch differs from main, branch from main, copy the ledger branch's `ROADMAP.md` over it, and deliver that single file through `pull-request-delivery.md` with title `chore(agents): sync roadmap snapshot`. Skip it when the files are equal.
4. Weekly: when the newest `architecture-survey` handoff is older than 7 days (or none exists), run one pass of `skills/architecture-survey.md` after the steps above. It seeds cited roadmap items and changes no code.
5. Record the pass in no file. The pull request history and the ledger are the record. If nothing needed doing, stop.

## Limits

One claim at a time, like any agent. Do not merge a PR with a red or pending required check, and do not take a live lease. Foreign branches (`dependabot/*`) are read-only for you.
