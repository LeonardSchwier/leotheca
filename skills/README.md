<!-- Variables: POLICY = ../CONSTITUTION.md; ENTRYPOINT = ../AGENTS.md -->

# Agent runbooks

Read the entrypoint and current policy first. These are plain Markdown procedures usable by any agent, including a runner without native skill discovery. Load only the applicable files. Project identity and timing settings live at the top of the constitution; domain paths and command profiles live at the top of the relevant runbook.

Each runbook carries standard SKILL.md YAML frontmatter (name, description, version, author, license, platforms, hermes metadata) as its first bytes for portability across skill-aware runners. Runners without native discovery simply read the file body as before; the frontmatter does not change any procedure, path, or variable.

| When                                                                                        | Read                                                                   |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Start/continue an autonomous session; blockers; shutdown                                    | [autonomous-roadmap-delivery.md](autonomous-roadmap-delivery.md)       |
| Implement a claimed item: spec, grill, design-system check, review, e2e smoke, archive      | [pdlc-playbook.md](pdlc-playbook.md)                                   |
| Claim, renew, publish, finish, or recover work                                              | [roadmap-workflow.md](roadmap-workflow.md)                             |
| Write or edit a roadmap entry's prose                                                       | [roadmap-entry-format.md](roadmap-entry-format.md)                     |
| Your change alters application behavior, a format, a bridge command, a setting or the build | [master-spec-maintenance.md](master-spec-maintenance.md)               |
| Before every push, no exceptions                                                            | [pre-push-verification.md](pre-push-verification.md)                   |
| Repair or merge pull requests whose owner is gone                                           | [integrator.md](integrator.md)                                         |
| Deliver a verified item to main                                                             | [pull-request-delivery.md](pull-request-delivery.md)                   |
| Decide what to test; local/hosted/deferred CI                                               | [verification-suite.md](verification-suite.md)                         |
| A real job/test/build fails                                                                 | [ci-failure-triage.md](ci-failure-triage.md)                           |
| Keep the app crash-free, hunt proactively or react; fix the class, ship the regression test | [crash-freedom.md](crash-freedom.md)                                   |
| Main moves or a merge conflicts                                                             | [merge-conflict-resolution.md](merge-conflict-resolution.md)           |
| No feature work is currently runnable                                                       | [maintenance-review.md](maintenance-review.md)                         |
| One specification is too large for a session                                                | [phase-splitting-large-specs.md](phase-splitting-large-specs.md)       |
| Change a native/IPC/persistence bridge or sensitive-data path                               | [change-quality-gates.md](change-quality-gates.md)                     |
| Any change touches shipped text, assets, docs or dependencies (every change, in stage 6)    | [text-rights-and-legal-check.md](text-rights-and-legal-check.md)       |
| A table, key, index or database migration is created or changed                             | [database-best-practices.md](database-best-practices.md)               |
| Security review of a change, or static-analysis and audit gates                             | [security-and-static-analysis.md](security-and-static-analysis.md)     |
| Persisted settings/data or migrations change                                                | [persistence-implementation.md](persistence-implementation.md)         |
| Add/change a Markdown structure scanner                                                     | [writing-scanner-modules.md](writing-scanner-modules.md)               |
| Work on source-built package submissions                                                    | [packaging-submission-pipelines.md](packaging-submission-pipelines.md) |
| An existing runner invokes the optional competitor scan                                     | [competitor-changelog-scan.md](competitor-changelog-scan.md)           |

The old `multi-agent-autonomous-coordination.md` path redirects to the current workflow. There is no second coordination protocol. `scripts/agent_ledger.py` replaces the old abandoned-claim shell script; its behavior tests cover expiry, ownership and competing pushes.

Maintain these runbooks under a normal scoped claim. Preserve verified domain knowledge and concrete failure lessons. Do not restore obsolete human gates, private coordination logs, or unconditional hosted-CI requirements.

## Shape of a skill

A skill is read by a model that may have 27 billion parameters, so it stays short: YAML frontmatter with `name` and `description` at the top, at most 200 lines, the steps first and the reasons after. `AGENTS.md` stays under 40 lines and `CONSTITUTION.md` under 200; detail moves into a skill that they link. `node scripts/check-rules.mjs shape` enforces this in the pre-push hook and in the Rules workflow.
