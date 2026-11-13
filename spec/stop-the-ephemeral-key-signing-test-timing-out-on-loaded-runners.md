# Stop the ephemeral-key signing test timing out on loaded runners

## Item

rm-23995b77e2a11856, "Stop the ephemeral-key signing test timing out on loaded runners". The case "passes a key freshly generated the way the workflow does it" in `scripts/verifyApkNotDebugSigned.test.js` no longer fails a hosted `frontend` job when `keytool` is slow, and none of its assertions change.

## Acceptance

- The case "passes a key freshly generated the way the workflow does it" declares its own timeout of 60 000 ms as the last argument of `it`. No other case, and not the global `testTimeout` in `vitest.config.ts`, changes.
- The case's body is byte-for-byte unchanged: the two `keytool` calls, the `catch { return; }` for a runner without `keytool`, and every assertion stay as they are.
- With a stand-in `keytool` first on `PATH` that sleeps 11 s before it runs the real one (so each of the two calls is slower than the old 10 s limit), the case fails on `main`'s file with `Test timed out in 10000ms` and passes with the change.
- The whole suite still passes (`npx vitest run`), and `git diff origin/main` shows only the one-line timeout change in the test file plus this spec.

## Context

Read: `scripts/verifyApkNotDebugSigned.test.js` (the case calls `execFileSync("keytool", ["-genkeypair", ...])` and then `execFileSync("keytool", ["-list", ...])`), `vitest.config.ts` (`testTimeout: 10000` for every test), and the failing log of hosted run 43152937278, job 130966161993 (the `frontend` job on a documentation-only commit): `FAIL scripts/verifyApkNotDebugSigned.test.js > findDebugSigningProblems > passes a key freshly generated the way the workflow does it`, `Error: Test timed out in 10000ms.` at `scripts/verifyApkNotDebugSigned.test.js:65:5`, in a run that executed 185 test files in parallel (93 s) and in which the sibling case that lists the committed debug keystore took 804 ms. The previous and the next head of the same pull request passed, so the cause is runner load, not the change.

Facts checked: here `keytool -genkeypair` for a 2048-bit RSA key takes 0.7 s warm. Both calls are synchronous (`execFileSync`), so vitest cannot interrupt them; its timer fires once the case finally returns, which makes any ceiling above the slowest plausible cold start sufficient to remove the false failure. The case only runs `keytool`: it reads no workspace, writes only a temporary directory that the `finally` block removes, and touches no application code.

Crash-freedom checklist: not applicable (test only, no application code).

## Plan

1. Reproduce first: a stand-in `keytool` script in a temporary directory that sleeps 11 s and then runs the real `keytool` with the same arguments; run `npx vitest run scripts/verifyApkNotDebugSigned.test.js -t "freshly generated"` with that directory first on `PATH` and watch it fail with `Test timed out in 10000ms`.
2. `scripts/verifyApkNotDebugSigned.test.js`: add the timeout argument to that one case, with a comment that says why (a cold JVM on a loaded runner, the global limit stays at 10 s).
3. Run the same reproduction again and watch it pass; run the whole file and the whole suite without the stand-in.

## Out of scope

Changing the global `testTimeout`, bounding a hung `keytool` with an `execFileSync` timeout, and changing the `catch { return; }` that treats every `keytool` error as "keytool is not installed" (see the rulings).

## Rulings

- Raise the global `testTimeout` or only this case? -> only this case | no other test starts a JVM, and a global raise would hide a real hang in every other test | Cost if wrong: another slow case needs its own timeout, which is the same one-line change.
- Which value? -> 60 000 ms | a warm run takes 0.7 s and the failure needed more than 10 s, so six times the failing limit leaves room for a very loaded runner, and it is still far below the job's own timeout | Cost if wrong: raise the number again.
- Add `timeout` to `execFileSync` so a hung `keytool` is killed? -> no | the `catch { return; }` below it treats any error, including the kill, as "keytool is not installed" and returns, so the case would pass silently on a hang, which weakens it; narrowing that `catch` to a missing executable is a separate decision about what the case guarantees | Cost if wrong: a hung `keytool` holds the job until its own timeout, exactly as today.
- Commit a regression test for the timeout? -> no, record the reproduction in the evidence instead | a committed test would have to start a nested vitest run against a stand-in `keytool` that sleeps past the limit, adding more than 20 s to every run of the suite and the pre-push hook (or a shorter stand-in with a lowered `--testTimeout`, which needs a POSIX shell and is fragile on Windows), while the change itself is one argument whose effect the reproduction shows directly | Cost if wrong: a later edit could drop the argument unnoticed; the hosted failure would then return and the reproduction in this spec shows how to re-check it.
- Anything against the product rules? -> no | test-only, no network, telemetry, AI, camera or microphone, no competitor names.

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

Filled in by the finish step.
