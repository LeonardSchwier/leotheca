# Git hooks and enforced quality gates

## Item

`rm-beb6c8d16656ad41`, "Git hooks and enforced quality gates". Rules that exist only as prose are enforced by versioned hooks plus a CI backstop for what a local hook cannot be trusted to run, and the prose points at the enforcement.

## Acceptance

1. `npm run hooks:install` (and `prepare` after `npm ci`) sets `core.hooksPath=hooks` in the local repo config only. Running it twice changes nothing. It never touches global config and never overwrites a different existing `core.hooksPath`.
2. pre-commit works on staged files only: whitespace, conflict markers, large files, em dashes and competitor names, prettier, eslint, cargo fmt for staged Rust. It runs a built-in secret scan on added lines and, when `gitleaks` is installed, `gitleaks` on the staged changes. When gitleaks is missing it prints a line saying the gitleaks scan was skipped, never silently.
3. A staged file containing a secret-shaped token (private key block, AWS access key, GitHub token, generic `secret = "<long>"`) is rejected by pre-commit and by the CI added-lines check.
4. commit-msg enforces the type prefix and attribution trailer.
5. pre-push runs rule checks over the pushed range, then `tsc`, `eslint`, and the full unit tests, and the Playwright e2e smoke only if `tests/e2e` and an npm `test:e2e` script exist on the tree. Metadata-only pushes (ROADMAP.md, handoffs) skip application checks.
6. pre-push blocks a non-fast-forward update (force push) and deleting the main branch. CI has a job that fails when a push to main is not a fast-forward of its previous tip.
7. `scripts/guard-command.mjs` classifies a shell command string and blocks `git reset --hard`, `git clean`, force pushes, `--no-verify`, `core.hooksPath` changes, and recursive deletes outside the current worktree. It can be wired as an agent PreToolUse hook; it is documented as opt-in because a git hook cannot see shell commands.
8. Dependency-intake: a change that adds or changes a dependency in `package.json` or `src-tauri/Cargo.toml` requires a `Dependency-intake:` line in a commit message of the range. Enforced in pre-push and CI.
9. CI workflow `rules.yml` runs the same scripts. Bypass policy is documented: forbidden for agents (constitution rule 8), CI re-runs every check.
10. Each check has a unit test that fails without it (`scripts/check-rules.test.js`, `scripts/guard-command.test.js`).

## Context

- Reused from an unmerged local branch (`agent/gates-work`, c2d8389): `check-rules.mjs`, `commit-msg-check.mjs`, `install-hooks.mjs`, `verify-fast.sh`, hooks, `rules.yml`. Its lockfile commit 25f13d5 is NOT taken (dependency change, not in scope).
- `core.hooksPath` is set in the shared repo config, so it applies to every worktree of one clone. That is intended and is why hooks must be fast and exempt metadata-only pushes.
- gitleaks cannot be installed in this session (binary download was refused by the sandbox), so its run path is untested here. The built-in scan is the tested CI-capable check; a gitleaks CI job stays seeded.
- Playwright e2e does not exist on main (`tests/ui/*.py` is a Python harness, no `test:e2e` script). Another agent owns that item; its files are not touched.

## Plan

1. Take check-rules/hook files from c2d8389, resolve conflicts. Test: existing `check-rules.test.js`.
2. Add `secrets` scan to `check-rules.mjs`, call from pre-commit and `lines` path. Test: sentinel token rejected, ordinary text accepted.
3. gitleaks step in pre-commit with reported skip. Test: run with and without gitleaks on PATH, read output.
4. `deps` check. Test: added dependency without intake line fails, with line passes, version-only unchanged passes.
5. `guard-command.mjs` plus test. Force-push detection in pre-push and CI job.
6. Shorten prose in constitution and skills, update hooks/README.md bypass policy, CONTRIBUTING if it mentions hooks.

## Out of scope

Playwright suite, a hosted gitleaks job, Gradle dependency intake, CodeQL/semgrep, any dependency or lockfile change.

## Rulings

- Grill: slow full pipeline in pre-push? Ruling: no, fast gate by default (full via `PREPUSH_FULL=1`); a slow gate trains people to bypass. Cost if wrong: CI catches the rest.
- Grill: is a PreToolUse guard a repo setting? Ruling: ship the script and docs only; editing `.claude/settings.json` would change every concurrent agent's session mid-flight.
- Grill: does `prepare` risk breaking installs (Flatpak, CI, offline builds)? Ruling: script exits 0 on every failure and skips when `CI`/`FLATPAK_ID` is set.

## Design system

No UI surface.

## Evidence

Filled at finish.
