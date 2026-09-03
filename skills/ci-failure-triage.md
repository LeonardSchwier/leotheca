# Skill: triaging a real CI failure

Diagnosing *why a check is red* is a different task from
`verification-suite.md` (which is about verifying your own not-yet-pushed
change). Use this whenever a workflow run you didn't just cause failed:
someone else's branch, a scheduled verification workflow (packaging
submission gates, nightly builds), or your own push where the failure
reason isn't obvious from the top of the log. Tool-agnostic: fetching job
logs from GitHub Actions is the same whether you're Claude Code, Codex,
opencode, or a human reading the Actions UI, only the exact API/CLI call
differs.

## 1. Get the real failing step, not just "the job failed"

A run has multiple jobs, each with many steps; only one or two steps
actually failed. Fetch:

- The list of jobs for the run, to find which job(s) failed and which
  step within each failed (most APIs report per-step status, so you don't
  need the full log just to find where to look).
- The failing job's log, tailed from the end (the actual error is almost
  always in the last 50-150 lines; earlier output is normal setup noise).
  Prefer a "failed jobs only" log-fetch option over downloading the whole
  run's log archive if one is available — it's faster and cheaper.

Read the actual error text before forming a theory. A tempting but wrong
shortcut: pattern-matching the job/step *name* ("Build submission
candidate" failed) and assuming you already know why. Read what the tool
actually printed.

## 2. Classify the failure before touching anything

- **This session's own diff broke it**: the log names a file, symbol, or
  behavior your change touched. Fix the code.
- **A dependency/lockfile/generated-artifact drifted from what a pinned
  reference expects**: compare the exact commit/version a config pins
  against what a generated file was actually built from. A generated
  file (a lockfile-derived offline cache, a vendored-sources list) that
  was regenerated against the *wrong* source commit is a real, common bug
  in this codebase — see `skills/packaging-submission-pipelines.md` for
  two concrete examples.
- **External/upstream**: the failure is inside a third-party base image,
  action, or hosted service this repository doesn't control, and nothing
  in the diff plausibly caused it.
- **Flake**: a transient network blip, a runner resource hiccup, or a
  timing race unrelated to the actual code under test.

Don't guess between these — prove it:

1. Find the most recent run of the **same job, same workflow** that
   passed. Diff what changed between that commit and the failing one in
   the files the failing step actually touches (not the whole repo).
   If nothing relevant changed, the failure is very unlikely to be this
   diff's fault.
2. To rule out a flake, re-run **only the failed job** once (not the
   whole run, not repeatedly). If it fails identically a second time,
   it is not a flake — stop re-running and root-cause it for real. If it
   passes, it was a flake; say so explicitly rather than silently move on
   (a flake that recurs often enough to reference is itself worth a
   roadmap/changelog note).
3. If the failure is external (a third-party Docker image, a hosted
   action), try to confirm independently if you have the means (e.g. can
   you run the same base image locally to reproduce). If you can't
   (no Docker daemon, no network to the exact host), say so plainly
   rather than asserting a root cause you couldn't actually verify —
   "reproduced identically across two attempts, unrelated to this
   branch's own files, sandbox couldn't inspect the image directly" is
   an honest, useful finding even without a deeper root cause.

## 3. Write down what you found before moving on

Whichever category it falls into, record in `ROADMAP.md`/`CHANGELOG.md`:
the failing job/step name, the exact error text (or its meaningful
excerpt), which category you classified it as and the evidence for that
classification (the prior-green run you compared against, the re-run
result), and — if you fixed it — the commit that fixed it and the run
that confirms it. Never claim a fix is confirmed without checking the
run it triggered; "pushed a fix" and "confirmed green" are different
facts and both need to be stated as what they are, not conflated. If a
run is still in progress when you have to stop, say so explicitly and
name the run so the next session checks it instead of re-diagnosing from
scratch.

## Do not

- Do not disable, skip, or loosen a check to make CI green. A red check
  is information; suppressing it destroys the information without fixing
  the underlying cause.
- Do not re-run a whole workflow speculatively "to see if it passes this
  time" as a substitute for reading the log. One confirmatory re-run
  after you already suspect a flake is fine; repeated blind re-runs are
  not triage.
- Do not fix the symptom your first theory suggests and declare victory
  without re-running to confirm — a wrong-commit lockfile fix that turns
  out incomplete (see `packaging-submission-pipelines.md`'s Flathub
  example) is exactly the failure mode this step-by-step process exists
  to catch before you claim done.
