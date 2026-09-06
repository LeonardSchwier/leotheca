<!-- Variables: read CONSTITUTION.md; CI_WORKFLOW and job map = verification-suite.md. -->

# Diagnose and repair CI

Use whenever a relevant hosted check fails or local checks expose a main regression. Own the affected task/repair lease before changing code. A healthy worker does not modify another worker's live branch.

1. Identify the exact commit, workflow, run attempt, job, and failing step. Read actual logs, preferably the first meaningful error and surrounding context. A red job name alone does not identify a cause.
2. Compare the candidate with its base and the latest success of the same job/workflow. Reproduce with the same command and pinned environment where possible.
3. Classify from evidence:

| Classification | Evidence and response |
| --- | --- |
| Candidate/integration bug | Failing behavior relates to changed code, caller, generated output, or conflict resolution. Fix under the current lease, rerun affected checks, and inspect the new SHA. |
| Existing main bug | Reproduces on the base or predates this candidate. Claim one deduplicated main repair item. If another live worker owns it, avoid that scope. |
| Dependency/pin/generated-file mismatch | Compare exact source pins, lockfiles, tool versions, and generated inputs. Use packaging-submission-pipelines.md where relevant. Fix the inputs or generator use. |
| Possible transient infrastructure failure | One diagnostic rerun of the failed job is allowed after reading the error. A later pass is evidence of recovery, not proof the system can never flake. |
| Reproducible external failure or missing runner access | Record actual errors and attempted alternatives. Use the bounded verification fallback, preserve a retry condition, and continue another task. |
| Still unknown | Keep investigating within the setup/wait budget. Do not label a failure external merely because it is inconvenient. |

A matching rerun failure does not mathematically exclude flakiness; it does mean blind reruns are no longer useful. Read the source, environment, and logs. Do not repeatedly rerun full workflows to avoid debugging.

If your pushed change broke main, retain/reacquire its lease and fix forward first. When a quick safe repair is unavailable, a scoped revert of your own defective change may restore main; inspect dependent commits and preserve their work, add the regression test, and track the unfinished feature. Never reset main or revert a whole range of other agents' work.

Each fix is tested and pushed normally, then its exact new result inspected. Continue until relevant checks pass or a real external limit requires a handoff. Never disable checks, add `continue-on-error`, delete assertions, relax a permission boundary, or create fake status evidence to make CI green.

Record in the per-task handoff: failure excerpt, SHA/run/job URLs, classification evidence, attempted remedy, result, next check, and retry condition. Keep infrastructure diagnosis out of user-facing release notes unless it changes user-visible behavior.

If a dead worker left a landed implementation with a failed/pending run, acquire its expired task lease, inspect the recorded SHA on current main, and finish the repair or verification. Do not repeat the entire feature implementation.
