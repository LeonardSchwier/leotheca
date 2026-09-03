# Skill: autonomous roadmap delivery

Tool-agnostic runbook for repeatedly integrating, implementing, verifying, and landing roadmap work during an autonomous or scheduled session. Read `CONSTITUTION.md` first. This file is procedure, not policy, and `CONSTITUTION.md` wins if anything here ever disagrees with it.

This runbook builds on `skills/roadmap-workflow.md`, which remains the detailed checklist for taking one item from claim to landing. Use this file when the goal is to keep delivering multiple eligible items in one session without turning CI latency, bookkeeping, or ordinary implementation failures into artificial stopping points.

This procedure exists because a real delivery session reached a green implementation commit, then changed `ROADMAP.md` and documentation afterward, which changed the final commit identity and required another full validation cycle before landing. The process below avoids that avoidable second cycle by assembling the complete candidate tree before the final verification run whenever possible.

## 1. Start from current repository truth

1. Read current remote `main` and `CONSTITUTION.md` in full before making repository changes.
2. Then read `AGENTS.md`, `PHILOSOPHY.md`, `ROADMAP.md`, and the recent changelog or agent log entries that are actually available.
3. Treat repository files as authoritative over stale instructions copied into a scheduled task or previous session notes.
4. Perform the integration pass required by `CONSTITUTION.md`: inspect every active ROADMAP claim, every open `agent/*` branch, and any legacy pull request that still exists.
5. Land any already-ready, green, in-scope work before claiming new work.

## 2. Carry one adopted item all the way through

Once this session adopts or claims an item, ordinary engineering problems are work to finish, not reasons to abandon it. This includes:

- test failures;
- type or lint failures;
- stale mocks;
- incomplete callers;
- merge conflicts;
- missing edge cases;
- CI failures caused by the change;
- final documentation drift;
- ROADMAP bookkeeping that still needs to be reconciled.

Diagnose and fix the underlying problem, then rerun verification. Do not weaken assertions, skip required checks, or move incomplete work to `main` just to make progress appear faster.

Stop work on that item only for a genuine external blocker that the current environment cannot resolve, such as unavailable maintainer credentials, required physical-device confirmation, a maintainer-only design decision, or a platform capability the repository explicitly says cannot be simulated. Record the blocker accurately and continue to the next eligible non-overlapping item.

## 3. Build the final candidate before final CI

The preferred delivery pipeline for each item is:

`implementation + tests + final ROADMAP state + changelog/docs -> self-review -> exact-head CI -> main -> verify -> next item`

Before starting the final required CI run, assemble everything that must be present when the item lands:

1. Complete the implementation and its tests.
2. Update architecture or other technical documentation required by the change.
3. Add the user-facing changelog entry when applicable.
4. Move the ROADMAP item to its truthful final state. A completed item belongs under `## Implemented` with `✅`, never left checked off under an Open section.
5. Fix stale neighboring ROADMAP or documentation references that still describe this exact scope as open.
6. Self-review the whole candidate diff for scope, security boundaries, offline behavior, naming/style rules, and test quality.
7. Confirm no temporary helper, one-off workflow, generated patch script, or debugging artifact is part of the final candidate tree unless it is itself intentional repository functionality.

Only then start the final required CI run whenever the environment permits this ordering.

If a later fix changes code, tests, ROADMAP, changelog, architecture documentation, or any other file that will be on `main`, that produces a new candidate and therefore requires verification of the new exact head again. Do not rely on a green run from an ancestor commit.

## 4. Make CI latency productive

Never treat a running CI job as a reason to end the autonomous session.

While the current exact head is being verified, perform read-only preparation that cannot conflict with the active claim:

1. Refresh the integration audit for other active claims and branches.
2. Read the next eligible item's specification and neighboring implementation files.
3. Identify its expected touch set and compare it with active claims.
4. Read existing tests and determine the most likely new test cases.
5. Work out the smallest honest implementation slice if the next item is too large for one session, following `skills/phase-splitting-large-specs.md`.
6. Prepare implementation notes or exact transformations outside repository-visible claimed state if useful.

Do not publish a second overlapping claim merely to stay busy. Read-only preparation is the pipeline stage that fills CI wait time without creating coordination conflicts.

## 5. Treat failed CI as the next task

When exact-head CI fails:

1. Read the real failing job and step, not only the aggregate status.
2. Follow `skills/ci-failure-triage.md` to classify the failure with evidence.
3. If the failure is caused by the item, fix the underlying code or test on the same claimed branch.
4. If the failure exposes a stale test double, incomplete caller, missing migration, or merge mistake, fix that real integration defect rather than weakening the test.
5. Rebuild the complete final candidate, including any documentation or ROADMAP adjustments affected by the fix.
6. Rerun the required validation on the new exact head.

Repeat until green or until a genuine external blocker is proven.

## 6. Land immediately after green

Once every required check is green for the exact final candidate:

1. Confirm current remote `main` has not moved in a way that invalidates the candidate.
2. If it moved, reconcile current `main` into the claimed branch without rewriting published history, resolve conflicts deliberately, and rerun exact-head verification.
3. Push or fast-forward the verified candidate to remote `main` according to current repository policy.
4. Fetch remote `main` again.
5. Confirm both the implementation and the final ROADMAP state are present on remote `main`.
6. Confirm the required `main` validation for the landed commit when repository policy requires it.
7. Clean up the merged branch only after those confirmations.

Do not describe the item as done, complete, implemented, finished, or landed before this point.

## 7. Immediately begin the next iteration

After a successful `main` landing:

1. Refresh current `main` and the ROADMAP ledger.
2. Repeat the full integration pass.
3. Take the earliest eligible non-overlapping item according to ROADMAP order and current claims.
4. Make the required claim-only commit on `main` before implementation.
5. Create or update the named `agent/*` branch when independent CI is needed.
6. Follow the final-candidate pipeline above again.

Landing one item ends one iteration, not the autonomous session. Keep repeating while execution budget and eligible work remain.

## 8. Split only on real product boundaries

If an item cannot honestly fit in one implementation and verification cycle, split it only when the specification or architecture provides a defensible boundary where each phase is independently coherent and testable.

A valid split must:

- preserve all remaining scope in a new unclaimed ROADMAP entry;
- avoid calling a foundation-only phase user-visible if it is inert without its consumer;
- have clear tests and completion criteria of its own;
- avoid overlapping another live claim;
- follow `skills/phase-splitting-large-specs.md`.

Do not create tiny phases merely to increase the apparent count of completed features.

## 9. Cloud and connector operation

Prefer a normal repository checkout when available. When the cloud exposes only an authenticated repository connector, use connector-managed commits and ref updates rather than treating the absence of local repository configuration as a blocker.

For large authoritative files such as `ROADMAP.md`, prefer exact, assertion-backed transformations over reconstructing a truncated file or blindly replacing it from partial content. If a temporary repository-side helper is the only safe way to produce an exact transformation, keep it branch-only, make it fail unless the expected old text matches exactly, remove it before the final candidate commit, and run the normal required CI on the resulting helper-free exact tree.

Never force-update published history, bypass checks, or weaken repository safety controls to work around limitations of the cloud interface.

## 10. Session completion standard

A productive autonomous session should leave the repository in one of these truthful states:

- one or more newly verified items are present on remote `main`, and the next eligible work has been started or prepared;
- an adopted item is still actively being fixed because its current exact head is red, with the failure understood and the next fix underway;
- an adopted item has a genuine recorded external blocker, and the session has moved on to another eligible non-overlapping item;
- no eligible work exists after the required integration audit.

A running CI job, an ordinary implementation failure, bookkeeping still to do, or a stale mock is not by itself a valid stopping condition.