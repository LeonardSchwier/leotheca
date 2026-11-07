# Git hooks and enforced rules

Versioned hooks, enabled with `core.hooksPath=hooks` in this repository's local git config only (never global). Setup is `npm ci` (the `prepare` script) or `npm run hooks:install`. It is idempotent, skips CI and Flatpak builds, and leaves a different existing `core.hooksPath` alone. Undo with `git config --local --unset core.hooksPath`. `hooks/setup.sh` does the same without npm.

Because git config is shared by every worktree of a clone, the hooks apply to all of them. They therefore stay fast and skip application checks for pushes that only touch `ROADMAP.md` or `.agents/handoffs/`.

## Hooks

| Hook         | Runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Budget         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `pre-commit` | on staged files only: `git diff --check`, conflict markers, files over 1 MiB, em dashes and competitor names, secret-shaped tokens, prettier, eslint, `cargo fmt --check` for staged Rust, Python syntax; `gitleaks` on staged changes when installed                                                                                                                                                                                                                                            | about 10 s     |
| `commit-msg` | `type(scope): summary` prefix, `Co-Authored-By` trailer naming the real agent, no em dash or competitor names                                                                                                                                                                                                                                                                                                                                                                                    | instant        |
| `pre-push`   | rule checks over the pushed range (commit messages, added lines, format, dependency intake, a `Reflection:` line on newly archived specs), refuses a force push, deleting main and any direct push to main (main changes only through a merged pull request), then `scripts/verify-fast.sh`: `tsc`, `eslint`, full vitest, version check, ledger and roadmap-format validation, and the Playwright e2e smoke only when `tests/e2e` and an npm `test:e2e` script exist and a browser is installed | about a minute |

`PREPUSH_FULL=1 git push` or `npm run ci` runs the slow full pipeline (Rust, Android, AppImage, Flatpak). `npm run verify` runs the fast gate by hand.

Nothing is skipped silently. When a tool is missing the hook prints a `SKIPPED` or `skipping` line naming it. Today that includes gitleaks (not installed on every machine; its CI job `gitleaks` in `.github/workflows/gitleaks.yml` is the backstop). The e2e suite is on main (`tests/e2e`, required CI job `e2e`); the pre-push hook runs it through the root `npm run test:e2e` script when a Playwright browser is installed (`npx playwright install chromium`), and prints `SKIPPED` otherwise.

## Rule to enforcement map

| Written rule                                                                                                                                                                                                                                                                                                                                                  | Local                                           | CI backstop (`.github/workflows/rules.yml`)                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit prefix, attribution, no em dash or competitor names                                                                                                                                                                                                                                                                                                    | `commit-msg`, `pre-push`                        | `commits-and-lines` job                                                                                                                         |
| No em dash or competitor names in added text                                                                                                                                                                                                                                                                                                                  | `pre-commit`, `pre-push`                        | `commits-and-lines` job                                                                                                                         |
| No secrets in commits                                                                                                                                                                                                                                                                                                                                         | `pre-commit` built-in scan, gitleaks if present | same scan over pushed lines, plus the `gitleaks` workflow (tree, pull request and push commits, weekly history; allowlists in `.gitleaks.toml`) |
| The checks must not change the repository: `HEAD` and the local `user.name` are compared before and after the gate, a test must use `scripts/testGit.js` for git                                                                                                                                                                                              | `pre-push`, `scripts/testHygiene.test.js`       | not applicable (needs a local hook)                                                                                                             |
| Never force-push, do not delete main                                                                                                                                                                                                                                                                                                                          | `pre-push`                                      | `commits-and-lines`: push to main must be a fast-forward                                                                                        |
| Dependency intake (`Dependency-intake:` line in a commit message)                                                                                                                                                                                                                                                                                             | `pre-push`                                      | `commits-and-lines` job                                                                                                                         |
| Evidence trailers on added, copied, modified or renamed paths (never deletions): `Legal-Check:` for text, asset and doc files (not dependency manifests, which `Dependency-intake:` covers); a failure lists the paths and prints the line to paste, `Database-Review:` for schema files, `Review:` for trust-boundary, workflow, hook and constitution files | `pre-push`                                      | `commits-and-lines` job                                                                                                                         |
| Format of changed files                                                                                                                                                                                                                                                                                                                                       | `pre-commit`, `pre-push`                        | `format` job                                                                                                                                    |
| Dependency licenses, pinned workflow actions, high or critical `npm audit`                                                                                                                                                                                                                                                                                    | none (needs registry or whole tree)             | `supply-chain` job                                                                                                                              |
| Type check, lint, unit tests                                                                                                                                                                                                                                                                                                                                  | `pre-push`                                      | `ci.yml`                                                                                                                                        |
| Destructive shell commands (`git reset --hard`, `git clean`, `--no-verify`, `rm -r` outside the worktree)                                                                                                                                                                                                                                                     | `scripts/guard-command.mjs`, opt-in below       | cannot be detected afterwards                                                                                                                   |

## Destructive-command guard (opt-in)

A git hook never sees a shell command, so no hook can honestly block `git reset --hard` or `rm -rf`. `scripts/guard-command.mjs` classifies a command string, names the safe alternative, and exits 2 to block. Wire it in an agent runner that supports pre-tool hooks, for Claude Code in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node scripts/guard-command.mjs" }
        ]
      }
    ]
  }
}
```

It reads the tool JSON on stdin. It is a seatbelt against mistakes, not a sandbox.

## Bypass policy

- Agents never bypass: no `--no-verify`, no `core.hooksPath` override, no editing a hook to pass (constitution rule 8). A failing hook names a real problem; fix it.
- A hook that blocks wrongly is a bug in the hook: land a fix under a claim, with a test, and record the false positive in the handoff.
- A human owner may use `git push --no-verify` in an emergency. CI runs every check again on the pushed commits, so a bypass only delays the failure and turns `main` red.
- `rules-allow: <reason>` on a line exempts only the em dash and competitor-name rules, for a literal identifier. It never exempts the secret scan. The one narrow exception is the ledger helper's own claim token: in `ROADMAP.md` `agent-state` comment lines the exact field `"token":"<32 lowercase hex>"` is removed before scanning, so claim, renew and merge commits pass while a real secret on the same line or elsewhere in the file is still caught.

## Tests

`scripts/check-rules.test.js` and `scripts/guard-command.test.js` cover the checks and run in `npm test`.
