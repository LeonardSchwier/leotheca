# Branch model: protected main, merge queue, ledger branch

Decision of 2026-11-07. It replaces "every agent pushes straight to main".

## Why

Direct pushes to one shared branch made parallel work fragile. One agent's stale candidate, a polluted clone or a mistaken push could damage main for everyone, and the only guard was a local hook. A rule that a server enforces does not depend on every clone being healthy.

## The model

| Piece                  | Rule                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main`                 | Protected. Only the merge queue changes it. No direct push, no force push, no deletion.                                                                      |
| Work branch            | One per claimed item: `agent/<item-id>/<token prefix>`. The agent pushes it freely.                                                                          |
| Pull request           | Opened by the agent when the item is verified locally. Auto-merge is switched on in the same step.                                                           |
| Required checks        | `validation` (CI), `commits-and-lines`, `format`, `supply-chain` (Rules), `ledger`, `master-spec` (Agent policy). They run on the PR and again in the queue. |
| Merge queue            | Merges the PR on top of the current main, re-runs the required checks on that exact result and only then fast-forwards main. Squash merge.                   |
| Integrator             | A scheduled agent. It looks at PRs that are red or conflicting, resolves them on the PR branch and re-queues. It never merges by hand and never bypasses.    |
| Ledger branch `ledger` | Holds the ownership ledger (`ROADMAP.md` and `.agents/handoffs/`). Claims, heartbeats and finishes are plain fast-forward pushes there. Not protected.       |

An item is finished when its PR is merged, not when the branch is pushed.

## Who is responsible for merging

1. The agent that owns the item opens the PR and enables auto-merge. It keeps its claim until the PR is merged or closed.
2. GitHub's merge queue performs the merge. No agent merges.
3. If a PR cannot merge (conflict, red check), the owner repairs it. If the owner is gone, the lease expires and the integrator repairs the PR under a fresh claim of the same item.

## Phases

| Phase | Content                                                                                                                          | Who                        | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------ |
| 1     | Workflows also run on `merge_group`. Required checks are never skipped by path filters. This document and the owner checklist.   | agent                      | done   |
| 2     | Ledger branch: `agent_ledger.py` and the skills work against `origin/ledger`; `ROADMAP.md` on main becomes a generated snapshot. | agent                      | open   |
| 3     | Owner enables the ruleset below. Only after phase 2: claims and heartbeats must not need a push to main.                         | owner                      | open   |
| 4     | Constitution, `AGENTS.md`, roadmap and pre-push skills describe PR plus queue as the only way into main.                         | agent, after phase 2 and 3 | open   |
| 5     | Scheduled integrator agent.                                                                                                      | agent                      | open   |

The rules in the constitution change only in phase 4, once the server enforces them. Until then direct pushes to main keep working under the existing protocol.

## Owner checklist (GitHub settings; agents never change these)

Settings, General, Pull Requests: allow auto-merge; allow squash merging; automatically delete head branches.

Settings, Rules, Rulesets, new branch ruleset for `main`:

- Restrict deletions and block force pushes.
- Require a pull request before merging (0 approvals; the checks are the gate).
- Require status checks to pass: `validation`, `commits-and-lines`, `format`, `supply-chain`, `ledger`, `master-spec`. Require branches to be up to date.
- Require merge queue: squash, build concurrency 1, status check timeout 60 minutes.
- Bypass list: empty.

Do not protect the `ledger` branch.
