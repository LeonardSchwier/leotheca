# Agent skills

Plain, tool-agnostic runbooks for recurring tasks in this repository.
They work the same way for Claude Code, Codex, opencode, or any other
coding agent: there is no tool-specific format or loader here, just
markdown files meant to be read directly. `CONSTITUTION.md` remains the
single source of truth for project *policy* (what is and isn't allowed);
these files are the mechanical *how* for carrying that policy out, kept
separate so the policy document stays readable and these procedures can
be updated without touching it.

Read `AGENTS.md` and `CONSTITUTION.md` first, always. Come here when
you're about to do one of the following:

- **`roadmap-workflow.md`** — claiming, implementing, verifying, and landing one `ROADMAP.md` item, start to finish, including the direct-to-`main` landing steps.
- **`verification-suite.md`** — the exact commands this project's "verify before declaring done" rule means in practice, including a real pitfall (nested agent worktrees inflating test/lint counts) and the cloud-sandbox Rust bootstrap steps.
- **`merge-conflict-resolution.md`** — resolving a `ROADMAP.md`/`CHANGELOG.md` (or source file) conflict against a `main` that moved while you were working.
- **`phase-splitting-large-specs.md`** — narrowing a large `spec/*.md` feature into an honestly-scoped, single-session-sized first phase, and what to do when a phase already on the roadmap turns out too big.
- **`writing-scanner-modules.md`** — the established shape for a new Markdown structure scanner (the heading outline and table parser are the existing examples), and how to wire it into a hook and a panel/component without duplicating navigation or debouncing logic.
- **`ci-failure-triage.md`** — diagnosing why a CI run (yours or someone else's) actually failed: getting the real failing step, classifying the failure (your diff, a drifted generated artifact, external/upstream, or a flake) with evidence rather than a guess, and what to record before moving on.
- **`packaging-submission-pipelines.md`** — hard-won, non-obvious gotchas specific to the F-Droid and Flathub submission pipelines (`packaging/f-droid/`, `flatpak/`): pinned-commit mismatches, offline dependency source lists generated from the wrong commit, `npm ci --offline` still needing `--legacy-peer-deps`, and the official F-Droid buildserver image's own floating-tag regressions.

If you add a new skill file, list it here too, and keep each file
self-contained: a future session (in any tool) should be able to open one
skill file and follow it without having to also have this index or
`CONSTITUTION.md` open side by side, beyond the initial pointers already
in `AGENTS.md`.
