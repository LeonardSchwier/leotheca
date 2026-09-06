<!--
PROJECT COMMAND VARIABLES (commands run at repository root unless a cwd is given)
CONFIG = CONSTITUTION.md
FRONTEND_SETUP = npm ci
FRONTEND_CHECKS = npx tsc -p tsconfig.json --noEmit; npm run lint; npm run check-version; npm test; npm run build
RUST_CWD = src-tauri
RUST_CHECKS = cargo fmt --all -- --check; cargo clippy --all-targets -- -D warnings; cargo test; cargo check
ANDROID_PREPARE = npx vite build; npx cap sync android
ANDROID_CWD = android
ANDROID_CHECKS = ./gradlew testDebugUnitTest; ./gradlew assembleDebug
POLICY_TEST = python3 -m unittest discover -s scripts -p 'test_agent_ledger.py' -v
CI_WORKFLOW = .github/workflows/ci.yml
POLICY_WORKFLOW = .github/workflows/agent-policy.yml
CI_EXPECTED_JOBS = frontend, backend, android, appimage-smoke, validation
RUNTIMES = use versions in CI_WORKFLOW (currently Node 22, stable Rust, JDK 21)
-->

# Verification with limited local or hosted CI

Use the command variables above, checking the workflow and package scripts if they have changed. Classify the changed surface first. Record each command's exit code; do not join checks in a way that hides an earlier failure. Do not assume every provider has a full desktop/Android environment.

## Applicable checks

| Changed surface | Required evidence |
| --- | --- |
| Claim, heartbeat, finish, handoff only | Helper validates state; inspect changed item and diff; no application rebuild for unchanged code. |
| Markdown instructions/docs only | Check referenced paths/commands and consistency; inspect full diff and git diff --check. Policy changes also run POLICY_TEST. |
| Lease helper or policy workflow | POLICY_TEST, syntax/CLI smoke checks, actual local competing-push test, and policy workflow when accessible. |
| Frontend, frontend tests, dependencies, shared configuration | FRONTEND_SETUP and every FRONTEND_CHECK; targeted behavior/regression tests. |
| Rust source, bridge contract, native dependencies | Applicable frontend checks plus RUST_CHECKS from RUST_CWD. |
| Android/native bridge or Android build configuration | Applicable frontend checks, ANDROID_PREPARE, ANDROID_CHECKS from ANDROID_CWD. |
| Packaging/release/workflow changes | Exact affected workflow/jobs or equivalent local build. Use packaging skill for source-pin checks. |

A shared API/data-format change affects both platforms even if only one file changed. Include its callers and platform contract tests. Inspect the candidate diff for generated changes after build/sync. Stage only intended files.

A physical device is not a universal gate. Automated tests/emulator evidence can verify their stated behavior. If an acceptance criterion specifically requires real-device proof and no equivalent exists, leave that criterion pending, split independently complete scope where honest, and continue other work. Never claim device evidence you do not have.

## Baseline, behavior tests, and review

Run relevant baseline checks where useful before editing. For a bug fix, keep the regression test while temporarily removing only your fix in an isolated checkout, observe the intended failure, then restore the fix and pass. Never revert unrelated current-main changes. A justified correction to a broken test needs a documented contract and independent evidence; it is not permission to rewrite assertions to match a defect.

Test the actual decision/caller, including error and boundary paths. For persistence, filesystem, IPC, cancellation, or performance shortcuts, use the corresponding domain skill. A high passing test count does not replace these tests. Investigate unexplained count drops, but do not preserve obsolete tests solely to maintain a number.

Review the final diff separately from implementation. Check scope, complete wiring, data-loss/privacy risks, async lifecycle, platform parity, and test quality. Record findings and resolutions. A bounded independent agent review is useful when available; self-review is the fallback without waiting for a person.

## Local setup, with a bound

Use the versions and native libraries in CI_WORKFLOW. Prefer existing tools and lockfile installs. Missing Rust/Java/SDK libraries may be installed in permitted workspace/user storage; do not repeatedly try an installation forbidden by the environment. Spend at most setup_minutes without concrete progress, then try hosted verification or choose work supported here.

Do not change a lockfile just to accommodate the sandbox, install guessed dependencies, run remote installer text without verifying its source, or bypass permissions. Prefer sibling worktrees outside the source tree so frontend discovery does not duplicate tests.

## Decide whether to land and finish

| Evidence available | Landing and completion rule |
| --- | --- |
| All applicable local checks and review pass; no known code failure | Push directly to main. A duplicate branch CI run is optional. Inspect main CI if accessible. |
| Some applicable local checks unavailable; hosted branch checks accessible | Push checkpoint/candidate to its unique work branch; obtain missing evidence for that exact candidate before landing. Keep renewing. |
| Hosted CI unavailable/absent; all applicable checks pass locally | Land and finish as **locally verified; hosted CI unavailable/absent**, with evidence and reason. Never label it hosted green. |
| Hosted CI queued or running beyond ci_wait_minutes | Preserve SHA/run IDs; if fully verified locally, landing is allowed. Leave hosted verification pending, block/release, and continue other work. A later worker checks that run. |
| An unaffected platform/packaging check is unavailable, but all changed behavior passes executable tests | A small, reversible change may land with a **verification-deferred** handoff. Keep the task blocked, not done, until missing evidence is resolved. |
| Core changed behavior cannot be tested locally or remotely | Keep code on its checkpoint branch. Block/release and choose a task that can be tested here. Documentation/inspection alone is not proof of new application behavior. |
| A known code/test failure, security/data-loss risk without adequate tests, incompatible migration, or unreviewed conflict exists | Do not land it. Fix it, or checkpoint/block and continue another runnable scope. |
| Proven hosted infrastructure failure; all applicable checks pass locally | Local evidence may permit landing/finishing with an explicit infrastructure limitation. Record a separate deduplicated CI repair item. An application failure is never relabeled infrastructure to qualify. |

Deferred landing is limited to independently useful, reversible changes with executable evidence for the changed behavior and no known defect. It never covers missing tests for persistence migrations, filesystem mutation, security boundaries, or a new native contract. State exactly which check is missing and why it cannot plausibly conceal an untested change at that boundary.

If no local runner and no observable CI exist, an agent can still complete appropriately verified documentation, policy, and read-only review work. It cannot truthfully ship untested application logic. This keeps the pipeline useful without inventing a green result.

## Hosted verification for the actual commit

Read workflow triggers first. Main CI and release builds exclude pushes changing only ROADMAP.md and the configured handoff directory; those commits contain no new application code. The policy workflow validates roadmap transitions. Tag/reusable workflow validation and pushes containing code still run. A legitimately path-filtered metadata commit needs no application CI result. If porting to renamed ledger/handoff paths, update these workflow filters too.

Use the host's workflow-run API or an authenticated connector/CLI that includes **push** runs. A PR-only checks tool returning zero runs does not prove CI is absent.

With a CLI, an example query is:

```sh
gh api --paginate "repos/$REPOSITORY/actions/runs?head_sha=$CANDIDATE_SHA&per_page=100"
```

Set REPOSITORY from the constitution. Also inspect commit check-runs/status contexts where available. Filter by exact SHA and relevant workflow/event, follow pagination, and inspect the latest attempt for that run. Read jobs and failing step logs. CI_EXPECTED_JOBS must actually succeed for the main CI workflow to be called green; an aggregate pending result, zero jobs, cancelled run, skipped required job, or an ancestor's green run is not success. Policy-only validation is not full application validation.

Poll no more frequently than ci_poll_seconds and stop synchronous waiting after ci_wait_minutes. Review or prepare while waiting. Use the triage skill for failures. If CI is inaccessible, record the actual error and local evidence; don't issue unlimited retries.

After landing, check the implementation SHA and any meaningful integrated successor. A newer unrelated main tip does not invalidate a successful run for your own commit. New integration/code changes do require their own evidence. Bookkeeping-only successor commits do not create an infinite revalidation loop.

## Final integrity checks

Run `git diff --check` and inspect staged paths/diff. Read each changed text file for conflict markers and accidental binary/NUL content; use a byte-aware script over explicit text paths if needed. Do not use the old whitespace-splitting grep loop: it misses staged/untracked files and mishandles filenames. Intentional binary assets must not be rejected just because they contain NUL bytes.

Record command/job, checked SHA/tree, outcome, relevant counts, skipped/unavailable checks, and review conclusions in the task handoff. The `finish` command is bookkeeping after this decision, not a test runner.
