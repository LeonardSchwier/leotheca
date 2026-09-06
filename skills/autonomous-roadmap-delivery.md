<!-- Variables: read CONSTITUTION.md; handoff_dir, setup_minutes, ci_wait_minutes, blocked_recheck_minutes. -->

# Autonomous session loop

Use for a session expected to complete multiple repository tasks. The claim-to-push mechanics live only in `roadmap-workflow.md`; verification decisions live only in `verification-suite.md`. Do not reconstruct a different protocol from historical instructions.

## Startup

Read `AGENTS.md`, the constitution and product rules. Check current main, current claims, pending verification, and the session's capabilities once:
can you fetch/push; execute project checks; read hosted workflow runs/jobs/logs; run native checks? A missing command is not proof that all CI is unavailable. Try an existing connector/CLI/API, within actual permissions. Never print credentials.

A runner's startup prompt should say:

> Read AGENTS.md and CONSTITUTION.md from current main. Run the autonomous session loop for the available budget. Claim one item at a time with an expiring lease; implement, test, review, push directly to main, inspect/fix available CI, then continue. If features are unavailable, use the maintenance review skill. Before ending, publish a checkpoint/handoff and release unfinished work.

This is a prompt for existing runners, not a newly installed scheduler. Different providers must use independent sessions/checkouts and the same remote ledger.

## Repeat while budget remains

1. Refresh main and eligible work. Recover verification you can complete or claim a main regression repair before a new feature.
2. Pick and publish one non-overlapping claim. Break a large spec into useful, testable phases if needed, preserving the rest in the roadmap.
3. Record acceptance criteria and tests. Read the relevant code before editing.
4. Implement; checkpoint valuable progress; renew leases at the configured interval.
5. Test and review; fix ordinary engineering failures yourself. Do not release work just because the first test or merge failed.
6. Integrate current main, retest, and push. Record the landed SHA and inspect its checks.
7. Finish only with evidence, or block with a precise deferred-verification record.
8. Immediately refresh and repeat. One completed item is one iteration, not a reason to end.

During CI waits, use short polls separated by review, log reading, or next-task preparation. Do not claim another implementation item. After `ci_wait_minutes` without a usable result, apply the verification decision table instead of waiting indefinitely. A changed run/error/capability can justify another attempt; the same unchanged blockage does not.

## Resolve blockers without a human queue

| Situation | Action |
| --- | --- |
| Missing declared dependency/tool | Use lockfile/pinned version and the existing setup instructions. Spend up to setup_minutes on a real permitted bootstrap, then choose another verification route. |
| Type/lint/test/build failure | Read the first real error, reproduce, inspect callers and baseline, fix root cause, retest. Never weaken assertions to match bad output. |
| Main moved or conflicts | Fetch, check ownership, integrate deliberately, retest. |
| Another task owns a prerequisite | Use another eligible item, or document a dependency and release. Never steal a live claim. |
| Newly discovered prerequisite you can fix | Split and record it, release current item, claim prerequisite, then return. |
| Missing credentials/permissions, unavailable platform, infrastructure outage | Record evidence, checkpoint, release as blocked with a retry condition, and continue runnable work. Do not fabricate credentials or change access controls. |
| Product-scope conflict | Record it as blocked/out of scope with the relevant rule, and continue. Do not repeatedly ask for the same decision. |
| No eligible roadmap work | Follow maintenance-review.md, including historic commands and bugs. |

A failed local install proves a setup limitation, not that the code passes. A red check is a code failure until its logs support another classification.

## Per-task durable record

Write `<handoff_dir>/<task-id>.md`. Keep it concise and update in place. A control transaction may publish it alongside the roadmap after the helper has run.

```text
Task: stable ID and exact title
Owner/token: session ID and current token, or released
Scope: touch paths, semantic resources, dependencies
Acceptance: observable completion criteria
Checkpoint: remote branch and SHA, or none
Landed: exact main implementation SHA, or not landed
Checks: command/job, tested SHA/tree, result, relevant counts/output
Review: success/failure paths traced; findings and resolutions
CI: exact run/job URLs and attempt; pass/fail/pending/unavailable/no workflow
Missing evidence: precise checks, why unavailable, risk and containment
Next action: one concrete command or inspection to resume
Retry: UTC time and condition, or available now
```

Do not append vague claims like "everything good" or fill this with a transcript. If nothing has landed, say so. If main already contains the implementation, make the next action verification or a named remaining defect, not a second implementation.

## Budget and shutdown

Keep enough budget for a small checkpoint and control transaction. Commit partial code on the work branch and push it; use the resulting SHA in the handoff. Release incomplete work as available, or blocked with a retry condition. Do not mark it done, push partial code to main, or promise that an unpushed stash is recoverable. If push access disappears, report that fact; remote lease expiry is the recovery mechanism.

When no runnable maintenance remains, finish with a truthful handoff. Do not create churn or an endless idle loop. The next externally started worker rechecks conditions.
