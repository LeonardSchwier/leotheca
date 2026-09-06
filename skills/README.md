<!-- Variables: POLICY = ../CONSTITUTION.md; ENTRYPOINT = ../AGENTS.md -->

# Agent runbooks

Read the entrypoint and current policy first. These are plain Markdown procedures usable by any agent, including a runner without native skill discovery. Load only the applicable files. Project identity and timing settings live at the top of the constitution; domain paths and command profiles live at the top of the relevant runbook.

| When | Read |
| --- | --- |
| Start/continue an autonomous session; blockers; shutdown | [autonomous-roadmap-delivery.md](autonomous-roadmap-delivery.md) |
| Claim, renew, publish, finish, or recover work | [roadmap-workflow.md](roadmap-workflow.md) |
| Decide what to test; local/hosted/deferred CI | [verification-suite.md](verification-suite.md) |
| A real job/test/build fails | [ci-failure-triage.md](ci-failure-triage.md) |
| Main moves or a merge conflicts | [merge-conflict-resolution.md](merge-conflict-resolution.md) |
| No feature work is currently runnable | [maintenance-review.md](maintenance-review.md) |
| One specification is too large for a session | [phase-splitting-large-specs.md](phase-splitting-large-specs.md) |
| Persisted settings/data or migrations change | [persistence-implementation.md](persistence-implementation.md) |
| Add/change a Markdown structure scanner | [writing-scanner-modules.md](writing-scanner-modules.md) |
| Work on source-built package submissions | [packaging-submission-pipelines.md](packaging-submission-pipelines.md) |
| An existing runner invokes the optional competitor scan | [competitor-changelog-scan.md](competitor-changelog-scan.md) |

The old `multi-agent-autonomous-coordination.md` path redirects to the current workflow. There is no second coordination protocol. `scripts/agent_ledger.py` replaces the old abandoned-claim shell script; its behavior tests cover expiry, ownership and competing pushes.

Maintain these runbooks under a normal scoped claim. Preserve verified domain knowledge and concrete failure lessons. Do not restore obsolete human gates, private coordination logs, or unconditional hosted-CI requirements.
