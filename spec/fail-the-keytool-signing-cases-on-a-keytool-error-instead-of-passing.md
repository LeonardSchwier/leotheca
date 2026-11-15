# Fail the keytool signing cases on a keytool error instead of passing

## Item

rm-5021528c532ab214, "Fail the keytool signing cases on a keytool error instead of passing". The two cases in `scripts/verifyApkNotDebugSigned.test.js` that start `keytool` ("passes a key freshly generated the way the workflow does it" and "matches the digest keytool reports for the committed debug keystore") are skipped only when `keytool` is not installed. Any other keytool failure (a non-zero exit, a kill, an unreadable keystore, bad arguments, a JDK that fails while running) fails the case instead of ending it silently as a pass.

## Acceptance

- Both cases reach `keytool` through one helper, `keytool(args, options)`, defined in the test file. It returns `null` when the executable cannot be found (`error.code === "ENOENT"`, which Node also raises for a link that points nowhere and for a launcher whose interpreter is missing) and otherwise `{ stdout }`; every other error propagates out of the case unchanged.
- A case whose helper call returned `null` is reported as skipped (`context.skip()`), not as passed. A runner without `keytool` therefore shows two skipped cases instead of two cases that asserted nothing.
- Every assertion in both cases is unchanged, the first case still removes its temporary directory in `finally`, and its own 60 000 ms timeout stays the last argument of `it`.
- New tests prove the helper contract with stand-ins that do not depend on the machine having a JDK: an empty `PATH` gives `null`; a stand-in `keytool` that succeeds returns `{ stdout }` with the arguments passed through (and `{ stdout: null }` under `stdio: "ignore"`, never `null`); one that exits 3, one that kills itself with `SIGKILL`, and one that cannot be executed (`EACCES`) each make the helper throw, with the exit status, signal or code on the error.
- On the unchanged test file a failing stand-in `keytool` on `PATH` leaves both cases passing (the defect); with the change both fail. The real `keytool` still passes both cases.
- `git diff origin/main` shows only the test file, `CHANGELOG.md` and this spec. No production code and no workflow file changes.

## Context

Read: `scripts/verifyApkNotDebugSigned.test.js` (two `try { ... } catch { return; }` blocks, at the old lines 112 and 175, around `execFileSync("keytool", ...)`), `scripts/verifyApkNotDebugSigned.mjs` (the production check, unchanged), `scripts/retry.test.js` (precedent for a POSIX stand-in written to a temporary directory with `chmodSync(file, 0o755)`), `.github/workflows/ci.yml` (the `android` job installs Temurin 21; the `frontend` job relies on the JDK of the hosted image).

Facts checked: `execFileSync` throws on a non-zero exit (`error.status`), on a kill (`error.signal`) and when the executable is missing (`error.code === "ENOENT"`), so the bare `catch` turns all of them into an early `return` before the first assertion. With `stdio: "ignore"` (the `-genkeypair` call) `execFileSync` returns `null`, not a buffer, so `null` cannot also mean "not installed" at the helper's boundary: the helper wraps a successful result in `{ stdout }`. Node looks the command up in `options.env.PATH` when `env` is given, so a test can point the helper at a directory that holds only a stand-in, or at an empty directory, without touching the real `PATH` of the test run. Both calls are synchronous, so a hung `keytool` cannot be interrupted by the test timeout; that stays out of scope, as the roadmap item says.

Crash-freedom checklist: not applicable (test only, no application code).

## Plan

1. Reproduce the defect first: a stand-in `keytool` that exits 3 in a temporary directory, first on `PATH`; run `npx vitest run scripts/verifyApkNotDebugSigned.test.js` on the unchanged file and watch both cases pass.
2. Test first: add the helper contract tests (`describe("keytool helper", ...)`) that call `keytool(...)` and watch them fail because the helper does not exist yet.
3. Add the helper, route both cases through it, narrow the two `catch` blocks to the missing-executable case, and use `context.skip()` for it. Keep every assertion.
4. Run the file with the real `keytool`, run the reproduction of step 1 again (both cases now fail with the stand-in's status), and run the whole suite. Mutation check: put the bare `return` back into the helper and watch the contract tests fail.
5. `CHANGELOG.md`: one Maintenance line. Spec evidence, archive, handoff, pull request.

## Out of scope

A hung `keytool` (a synchronous call cannot be cut short by the test timeout, and adding an `execFileSync` timeout is a separate decision), making a missing `keytool` a failure on hosted runners (see the rulings), and any change to `verifyApkNotDebugSigned.mjs` or the workflows.

## Rulings

- Where does the helper live? -> in the test file, not exported | an exported test file would register its tests in any file that imports it, a separate module needs a new path outside the claim for a ten-line function that one file uses, and the production script must not carry test plumbing | Cost if wrong: move the function to a module in a follow-up; the tests move with it.
- What does the helper return when the executable is missing? -> `null`, and `{ stdout }` on success | `execFileSync` returns `null` itself when `stdio` is `"ignore"`, so returning its value directly would be ambiguous | Cost if wrong: a caller checks the wrong value and a missing keytool looks like success; the contract tests cover both shapes.
- Plain `return` or `context.skip()` for a missing `keytool`? -> `context.skip()` | the item's point is that a case which asserted nothing must not report a pass; `skip` states the truth and costs one parameter on two cases, while `return` keeps the false pass for the one situation the item still allows | Cost if wrong: revert to `return`; nothing else depends on it (no hook or workflow counts skipped cases).
- Fail the cases when `keytool` is missing on a hosted runner (for example when `CI` is set)? -> no | the roadmap item allows a skip for a missing executable and asks for nothing more; the `frontend` job's JDK comes from the runner image, not from a step this repository controls, so a hard requirement could turn an image change into a red required check unrelated to any change | Cost if wrong: a runner image without a JDK skips both cases unnoticed until the report is read; the skipped status in the test report is the visible trace.
- Test the stand-in through the helper or through a nested vitest run of the two cases? -> through the helper | the cases only call the helper, a nested run would add several seconds of vitest start-up to every run of the suite and the pre-push hook and would need a guard against running itself, while the helper tests exercise the exact code both cases use; the reproduction against the real cases is recorded in the evidence | Cost if wrong: a later edit could give one case its own bare `catch` again without a test failing; review of the diff is the guard, and the reproduction shows how to re-check it.
- POSIX-only stand-ins? -> yes, the block of five stand-in cases is skipped on Windows with `describe.skipIf` | the repository's CI is Linux and `scripts/retry.test.js` already needs `bash`; a Windows stand-in would need a `.cmd` file that `execFileSync` does not resolve without a shell | Cost if wrong: the five stand-in cases do not run on a Windows developer machine; the empty-`PATH` case still runs there.
- Is a dangling `keytool` link or a launcher with a missing interpreter a failure? -> no, it skips | Node reports both as `ENOENT`, the same code as a missing file, and the roadmap item names `ENOENT` as the one skip; telling them apart would need a second lookup of the executable and a guess about the cause | Cost if wrong: a half-removed JDK shows two skipped cases (visible in the report) instead of two failures.
- Anything against the product rules? -> no | test-only, no network, telemetry, AI, camera or microphone, no competitor names.

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

Filled at archive time.
