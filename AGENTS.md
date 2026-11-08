<!-- Variables: CONFIG_FILE = CONSTITUTION.md; SKILL_INDEX = skills/README.md -->

# Start here, every agent

Read `CONSTITUTION.md` in full. Load its top variables, then its configured product rules. Read `GLOSSARY.md` and use its terms. These instructions apply to every provider/model and local/cloud run. `CLAUDE.md` points here; runners that do not automatically load repository instructions must explicitly read this file in their startup prompt.

You have standing authorization to finish repository work. Code reaches main only through a pull request that you open and that the merge queue merges after the required checks pass (`skills/pull-request-delivery.md`). Never push to main. Do not wait for human review. Stay within product rules and actual tool permissions.

1. Commit as the agent, not as a person: `source scripts/agent-git-env.sh` sets author and committer to `Claude Code (agent) <noreply@anthropic.com>`; the `Co-Authored-By` trailer still names the exact model. Work in your own clone. Run `npm run hooks:install` once (after `npm ci`); never bypass a hook (see `hooks/README.md`). Create a unique session ID. Use a separate clean control worktree for claims so unfinished code cannot enter a claim commit.
2. Fetch main. Read Open entries and pending verification handoffs. Choose the first runnable, non-overlapping item. Read `skills/autonomous-roadmap-delivery.md` for the loop and `skills/roadmap-workflow.md` for exact claim/push steps.
3. Run the lease helper in the control worktree, commit only its roadmap change, push normally, then fetch and confirm your token. Start implementation only after that succeeds. If you lose the race, rebuild from fresh main and choose again.
4. Read relevant source, callers, tests, and spec. Write acceptance criteria and claim touch paths plus shared resources. Build the complete change and regression tests.
5. Renew the remote lease every heartbeat interval. If you lose or outlive your lease, stop, refresh main, and reclaim before doing more work. Never reuse a dead session's token.
6. Run `skills/verification-suite.md`, self-review the final diff, fix failures, and update docs. Missing tools or CI use that skill's bounded fallback. Never invent a green result.
7. Merge fresh main, check your live token again, retest, and push the work branch, open the pull request and switch on auto-merge (`skills/pull-request-delivery.md`). Inspect the PR's checks and fix real errors on the branch.
8. Finish the roadmap item only when its pull request is merged and its evidence meets the completion rule. If verification is externally blocked, commit a handoff and release it as blocked. Repeat immediately.
9. If no feature is eligible, use `skills/maintenance-review.md` to review historic commits and commands, repair real bugs, and correct documentation. Implementation writes require a claim. Small unclaimed task seed/split ledger edits use the constitution's coordination-only exception and reserve no work.
10. Before ending, push a checkpoint and handoff and release unfinished work. Do not rely on a stash. If the session crashes, the next worker recovers it after lease expiry.

You own this process, not only the code: when an item shows that a rule, skill, hook or check is wrong or in the way, fix it or seed an item, and end every item with the reflection line of `skills/pdlc-playbook.md` stage 8 (`CONSTITUTION.md`, "Self-improvement").

Read actual errors. Keep checks and security controls effective. Completion requires evidence, not confidence or a large test count.
