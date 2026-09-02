# Skill: verifying a change is actually done

Exact commands, in this codebase, for "verify before declaring done"
(`CONSTITUTION.md`). Run all of the applicable ones before every commit
that lands on `main`, not a subset chosen because it's faster.

## Frontend (always applicable)

From the repository root:

```
npx tsc --noEmit
npx vitest run
npx eslint .
npm run build
npm run check-version
```

- `vitest run` must show every test file passing. Note the exact test count before and after your change and put it in the roadmap/commit writeup; a silent count drop can mean a suite that stopped running, not a suite that stayed green.
- `eslint` must show 0 errors. This codebase currently carries exactly 4 pre-existing warnings, all in `src/app/App.tsx` (`react-hooks/exhaustive-deps`). If your change doesn't touch that file, that count should be unchanged; if it does, don't add new ones without a reason.
- If multiple agent worktrees exist under `.claude/worktrees/` (or any other nested worktree) inside this same checkout, `vitest run` and `eslint .`'s default globs will pick up files from them too and wildly inflate the numbers you see. Scope around that rather than trusting a suddenly-much-larger count: `npx vitest run --exclude '**/.claude/**' --exclude '**/node_modules/**'` and `npx eslint . --ignore-pattern '.claude/**'`.

## Rust (when `src-tauri/` is touched, or as a full-suite confidence check)

```
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo check
```

If `cargo`/`rustc` is absent in your environment, install the current stable toolchain in user- or workspace-local storage rather than skipping this (see "Cloud sandbox without Rust" below). A missing toolchain is a setup task, not a reason to call the change verified without it.

## Android

There is no local JVM/Gradle test runner available in most sandboxes. CI's Android job (`ci.yml`) is the actual verification gate for anything touching `android/`. Push to a branch and confirm that job green before treating an Android-side change as verified; never claim on-device confirmation that didn't happen.

## Null-byte check (do this before every commit)

A real incident in this repo involved a stray null byte silently corrupting a committed file. Before every commit:

```
for f in $(git diff --name-only); do grep -cP '\x00' "$f"; done
```

Every line should print `0`. Note: `grep -c $'\x00'` (a literal shell-substituted null byte) is unreliable, since a shell string is truncated at the first null byte before `grep` ever sees the rest of the pattern, producing false positives on every line. Use `grep -cP '\x00'` (the two-character escape sequence, interpreted by PCRE, not a real null byte in the argv) instead.

## Bug fixes specifically: revert-confirm-restore

A claimed fix without a test that actually failed beforehand isn't a verified fix. For any bug fix:

1. Write the regression test first, or write the fix and then temporarily revert only the fix (not the test) to confirm the test fails for the reason you think it does.
2. Restore the fix and confirm the same test now passes.
3. State in the commit/roadmap entry that you did this, not just "added a test."

## Performance shortcuts specifically

Any code that skips work as an optimization (a cache, memoization, a lazy or short-circuit evaluation, an "is this actually worth computing" heuristic) needs a test proving what happens when the shortcut's *own decision* is wrong, not just a test of the shortcut taken correctly. Write the test at the level where the shortcut actually decides whether to skip something (the caller deciding whether to read/compute), not only at the level of a pure function it delegates to with inputs already resolved. See `CONSTITUTION.md`'s guardrails section for the real shipped bug (the `-exclude` search filter) this rule exists because of.

## Cloud sandbox without Rust

1. Prefer the official stable Rust toolchain installer.
2. If the sandbox can't execute that installer, download the official stable standalone archive for the runner's architecture, verify its SHA-256 against the official channel manifest, and install it under the workspace.
3. Install the Linux build libraries `.github/workflows/ci.yml` lists (WebKitGTK/GTK3 and friends) the same way CI does.
4. If, after a genuine bootstrap attempt, the sandbox still can't compile or run a required check, don't mark the change locally verified. Push the accurately-labeled work to its claimed branch and let CI's own Linux/Android jobs provide the verification instead; inspect their results before treating anything as done.
