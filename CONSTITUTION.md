<!-- agent-config:start -->
```json
{
  "project_name": "Leotheca",
  "repository": "LeonardSchwier/leotheca",
  "app_id": "com.leonardschwier.leotheca",
  "workspace_settings_dir": ".leotheca",
  "remote": "origin",
  "main_branch": "main",
  "roadmap_file": "ROADMAP.md",
  "changelog_file": "CHANGELOG.md",
  "product_rules_file": "documentation/PROJECT_RULES.md",
  "architecture_file": "documentation/ARCHITECTURE.md",
  "decisions_file": "documentation/DECISIONS.md",
  "skills_dir": "skills",
  "handoff_dir": ".agents/handoffs",
  "lease_minutes": 90,
  "heartbeat_minutes": 15,
  "clock_skew_minutes": 5,
  "legacy_grace_minutes": 120,
  "blocked_recheck_minutes": 60,
  "ci_poll_seconds": 60,
  "ci_wait_minutes": 15,
  "setup_minutes": 10,
  "contention_retries": 5
}
```
<!-- agent-config:end -->

# Constitution

Read this entire file at session start. This is the current policy for every agent, regardless of provider, model, IDE, or cloud. The JSON above is the authoritative configuration, read by `scripts/agent_ledger.py`. Other runbooks use these keys as variables. Read the configured product rules, then only the skills and architecture sections needed for the current work.

## Mission and standing authorization

Run this loop for the available session budget: synchronize, claim one eligible roadmap item, implement it, test and review it, push directly to the configured main branch, inspect and repair available CI, then take the next item. Multiple agents execute this loop concurrently in separate checkouts. Keep useful work moving without a human review, PR, merge, or routine permission gate.

The owner authorizes agents to commit and push claims, completed changes, tests, documentation, maintenance, CI fixes, and recovery records directly to main. Incomplete code may be checkpointed on its own work branch. Do not ask whether to commit, push, resolve an ordinary conflict, fix a failing test, or take the next item. Automated review or rigorous self-review is sufficient; human review is not a completion criterion.

This authorization covers repository work within the product rules. It does not create credentials, expand platform permissions, authorize deleting user data, or override hosting access controls. If a capability is unavailable, try a permitted alternative, preserve a precise handoff, release the claim, and work on another item. Do not leave the entire pipeline waiting for a person.

Instructions cannot launch cloud workers, replenish tokens, grant access, or guarantee bug-free code. Each runner must start sessions and read `AGENTS.md`. Leases recover lost workers when any subsequent worker runs, without a separate supervisor process.

## One current policy

Repository precedence: this file, the configured product rules, `AGENTS.md`, relevant skills, then task specifications. A current explicit owner instruction takes precedence over older repository instructions. Historical decisions explain past work; they are not an alternative workflow. If a skill disagrees, follow this file and correct that skill under a claim.

The 2026-09-06 owner instruction supersedes all earlier rules requiring a human reviewer, explicit commit permission, PR merging, universally available CI, commit-author-based liveness, 4-hour or 24-hour abandonment, and private logs for coordination. Historical decisions have moved to the configured decisions file.

## Coordination invariants

1. The configured roadmap on **remote main** is the only ownership ledger. A local edit, branch, chat message, running CI job, or agent name alone does not reserve work.
2. Every worker has a unique session ID and at most one active implementation claim. Same-provider sessions use different IDs. Every acquired or reclaimed item has a new unpredictable token and a unique branch. Never reuse a dead worker's token.
3. Claim before editing implementation. Publish a claim-only commit based on latest main with a normal fast-forward push. Fetch again and confirm your token. Only the successful remote claim winner may implement. Small coordination-only additions of an unclaimed task, or splits of an unowned task, may be published before claiming; use the same fresh-base transaction, preserve all scope, and never rewrite a live owner's task. These seed edits reserve no work.
4. Claim file/directory touch paths and shared semantic resources, such as `workspace-lifecycle` or `editor-state`. Different files can change the same contract. Conflicting live claims exclude each other. Small edits to your own roadmap block, handoff file, and release-note bullet are merged per item and do not lock the whole ledger.
5. Renew the remote lease every `heartbeat_minutes` while making progress, including during tests and CI diagnosis. Renew synchronously at tool boundaries. A detached heartbeat that keeps renewing after its agent dies is forbidden.
6. After `lease_until + clock_skew_minutes`, another worker may reclaim. The old worker must stop on wake-up, refresh main, and acquire a new claim before making more changes. Branch existence, unrelated commits, author identity, and queued CI do not extend a lease.
7. Before every implementation publication, fetch main, merge it into your candidate, confirm the token still belongs to you and has enough time left, inspect the merged diff, and retest affected behavior. A stale token is a lost claim, even if the code is excellent.
8. Never force-push, rewrite published history, bypass hooks/protection, delete another agent's work, or use whole-file `ours`/`theirs` to discard changes. Remote rejection means refresh and decide again, not force.

The helper validates local ledger transitions. The runbook's fresh-base commit and normal push make those transitions exclusive on the remote. This is a cooperative protocol, not a server-side security boundary: all participating runners must follow it.

Never hand-author an `agent-state` HTML comment. Only `scripts/agent_ledger.py` may write one. Every ledger command parses and validates every entry before doing anything else, so a hand-written or malformed one (a wrong `id` format, a `branch` that doesn't match the required `agent/<id>/` prefix) can break `list`/`claim`/`check`/`finish` for every agent, not just misstate one task's history. If the helper errors, treat that as a real defect to fix, never a reason to approximate its output by hand.

## Truthful task states

| Roadmap state | Meaning | Next action |
| --- | --- | --- |
| `⬜` | Available | Claim if dependencies, scope, and capabilities fit. |
| `🚧` with a live lease | Owned, implementing or verifying | Owner continues; others choose another scope. |
| `🚧` with an expired lease | Recoverable | Inspect main and checkpoint, then reclaim with a new token. |
| `⏸` | Blocked or verification deferred, no active owner | Record evidence and a retry time/condition; take other work. |
| `✅` under `## Implemented` | Shipped with completion evidence | Do not reimplement; historic review may identify a new bug. |

Keep `🚧` through post-push verification. Only finish after the verification skill's completion rule is satisfied. Code can be on main while verification is pending; record its SHA and missing checks, never call that green. A successor inspects the recorded SHA and main before writing code, so recovery can finish verification instead of duplicating the feature.

Legacy `🚧` entries without leases must be inspected and given one finite `legacy_grace_minutes` observation window with the helper. Never reset that window repeatedly. Record item-specific branch/main evidence, infer the touch set conservatively, and recover after that grace expires. If code already landed, claim only remaining scope or verification. Do not infer a human hold from commit name/email: cloud agents often use the owner's identity. Honor an explicit current owner hold, record it as blocked, and proceed elsewhere.

## Quality and verification

Before coding, write concrete acceptance criteria and identify the caller, data flow, platform boundaries, failure paths, and tests. Implement one coherent slice. Preserve remaining scope when splitting. Do not ship a facade, inert UI, TODO body, or mock as a completed feature.

Test meaningful outcomes at the boundary where behavior occurs. For bug fixes, demonstrate that the regression test fails without the fix and passes with it. Cover relevant invalid, empty, boundary, asynchronous, lifecycle, and cross-platform cases. Test count alone proves nothing. Never weaken a test, security boundary, or CI workflow to conceal a defect.

For a changed native, IPC, platform, or persistence contract, test the real contract shape at both sides or a faithful typed fake at the boundary. Update every affected bridge mock in the same change, and run the project static/type gate before publishing. A bridge feature is incomplete when tests exercise only a wrapper while the provider contract, payload fields, failure behavior, or platform no-op path remains untested.

When a requirement prohibits logging or persistence of sensitive input, review success and failure paths for raw values, error objects, exception messages, URIs, tokens, paths, and serialized status fields. Add a focused sentinel-value regression where practical. Completion evidence must name the exact commands and observed results; phrases such as “comprehensive tests” or “CI fixed” are not evidence by themselves.

Review the complete candidate as a separate activity after implementation. Trace a real success path and failure path through callers and persistence/platform boundaries. Use an independent agent review when available and useful, with a bounded response time; otherwise record the same review yourself. Fix findings before completion. No reviewer becomes a human or agent bottleneck.

Read `skills/pre-push-verification.md` before every push, without exception, including a change that looks obviously correct: run the exact applicable checks in this session, on this exact tree, and read their real output before pushing. A commit message asserting that existing behavior is already correct, or that a fix works, is not evidence unless you executed that exact case in this session and observed it. Never push a second speculative fix for a CI failure without first reading the actual failing job's log and quoting the real error; two guesses without that is pattern-matching, not diagnosis.

Follow `skills/verification-suite.md` for commands and the CI capability decision table. Run applicable checks locally whenever possible. Full local verification permits direct landing without waiting for duplicate branch CI. When local coverage is incomplete, use hosted branch checks when accessible. Missing CI is not a pass and is not a reason to wait forever. Only the documented limited deferred-verification path permits landing with evidence gaps; known code failures never qualify.

After pushing, inspect checks for the actual landed SHA, not an arbitrary latest run. Fix failures you introduced before taking another feature. Existing main failures take priority as separately claimed repairs. If CI stays queued, inaccessible, or externally broken beyond the configured wait/setup budget, record the exact state and next check in a committed handoff, release the lease, and choose runnable work. An agent capable of the missing verification resumes it first.

## Work selection and productive waiting

At each iteration, refresh main and read active roadmap entries and relevant handoffs. Prioritize a known main regression or deferred verification you can resolve, then eligible Open Bugs, then Open Features, in file order. Inspect only relevant branches and checkpoints; do not make every worker repeatedly audit every branch. Do not take another agent's live work because its branch looks ready.

While a check runs, inspect logs, review the candidate, read the next spec, or perform read-only historic review. Do not claim a second implementation item to fill a wait. If all tasks are done, live-claimed, or blocked, use `skills/maintenance-review.md`: claim a bounded historic commit/command review, find reproducible bugs, test gaps, and stale docs, and deliver fixes through the same loop. Do not invent features, cosmetic churn, or empty commits to look busy.

Diagnose blockers before deferring. Install declared dependencies where permitted, use pinned tool versions, reproduce failures, inspect actual logs, and resolve integrations yourself. Split a blocking prerequisite into a claimed task if needed. For an external limitation, make one handoff with a retry condition; do not create recursive blocker tasks or poll unchanged failures indefinitely.

## Durable handoff and shutdown

Use one committed file per task in `handoff_dir`, with the format in `skills/autonomous-roadmap-delivery.md`. Record task/token, acceptance criteria, checkpoint and landed SHAs, tests/review evidence, failures, next command, and retry condition. Never include secrets or machine-only absolute paths. Private logs, a local stash, and unpushed commits are not handoffs.

Reserve budget for a checkpoint and lease release. Publish incomplete code only to its unique work branch; push the handoff and release on main; stop honestly. Do not rush unverified code onto main as tokens run low. If the worker dies without doing this, lease expiry makes its task eligible for another worker, which may start again from current main.

## Portable maintenance

For a copied repository, edit this top JSON, the top command/profile variables in relevant skills, and the top product-profile variables in the product rules. Operational prose refers to variables rather than embedding an owner, repo name, application ID, or local machine path. Technical source paths are documented in domain skills' top variable blocks. Do not change this project's identity as a side effect of process maintenance.

Keep one authoritative rule and small tool-neutral skills. Instruction, helper, and workflow changes use the same claim protocol as code. Preserve useful domain knowledge; remove contradictory or untested recipes. Add focused helper tests when changing lease transitions or concurrency. `skills/README.md` is the index; `CLAUDE.md` forwards to `AGENTS.md`.
