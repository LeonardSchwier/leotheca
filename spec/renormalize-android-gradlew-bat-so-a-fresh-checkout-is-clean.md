# Renormalize android/gradlew.bat so a fresh checkout is clean

## Item

rm-5f667522fc52b46b, "Renormalize android/gradlew.bat so a fresh checkout is clean". A fresh clone reports no modified file, and a test fails when a tracked text file is stored with CRLF line endings.

## Acceptance

- In a fresh clone of the work branch, `git status --porcelain` prints nothing, and `android/gradlew.bat` still has CRLF line endings in the working tree (`git ls-files --eol android/gradlew.bat` prints `i/lf w/crlf attr/text eol=crlf`).
- `phantomLineEndingFiles(output)` in `scripts/lineEndings.js` takes the text of `git ls-files --eol` and returns the paths whose index copy has CRLF or mixed line endings while the attributes ask git to store LF (`text`, `text=auto` or `eol=`, but not `-text`). Entries with an LF index copy, with `-text` (binary), and entries without a text attribute are not returned. A path containing spaces is returned whole.
- The test `scripts/lineEndings.test.js` runs `git ls-files --eol` in this repository and requires an empty result. It fails on the current tree and names `android/gradlew.bat`.
- A second test builds a temporary repository whose `.gitattributes` has `*.bat text eol=crlf` and whose index holds a CRLF `.bat` blob. In a fresh clone of it, once the file's modification time has changed (git re-reads a file whose timestamp changed; right after a clone it may trust the stat data it just recorded), `git status` reports the file as modified and `phantomLineEndingFiles` names it; after `git add --renormalize` and a commit, a fresh clone is clean, the file is CRLF in the working tree and the function returns nothing. This ties the detector to the symptom it stands for.

## Context

Read: `.gitattributes` (`* text=auto eol=lf`, `*.bat text eol=crlf`), `scripts/testGit.js` and `scripts/testHygiene.test.js` (a test runs git only through `testGit.js`, except a literal read-only subcommand such as `ls-files`), `scripts/verify-fast.sh` and `vitest.config.ts` (the pre-push gate and the CI `frontend` job run every `*.test.js`), `skills/roadmap-workflow.md` (the ledger helper refuses a dirty control checkout).

Facts checked: `git ls-files --eol` over the whole tree lists every text file with an LF index copy, the binaries as `-text`, and exactly one file with CRLF in the index: `android/gradlew.bat` (`i/crlf w/crlf attr/text eol=crlf`). With an explicit `text` attribute git converts the working file to LF before it compares, so a CRLF blob never matches. Git only notices when it re-reads the file: it trusts the stat data recorded at checkout unless the timestamp changed or equals the index's (the usual case right after a clone on a fast disk, which is how the ledger helper met it), so the symptom is timing dependent, not constant. (`text=auto` keeps an existing CRLF blob without a diff, but the repository rule is LF in the index, so the check flags it too.) Only `android/gradlew.bat` is a Windows batch file in the repository.

Platform boundary: the blob is read on Windows only by the Gradle wrapper start script, and a Windows or Linux checkout writes CRLF because of `eol=crlf`. The Unix wrapper `android/gradlew` is a separate file and is not touched.

Crash-freedom checklist: not applicable (no application code).

## Plan

1. `scripts/lineEndings.test.js` first: the parser cases, the real-repository case (watch it fail on `android/gradlew.bat`) and the temporary-repository case. Then `scripts/lineEndings.js`.
2. `git add --renormalize android/gradlew.bat`, then watch the real-repository test pass and compare the file's content with the old blob after converting line endings (only CR bytes may differ).
3. Fresh clone of the work branch: `git status --porcelain` is empty, the file is CRLF in the working tree.
4. `CHANGELOG.md` bullet, `master-spec.md` change-log line, `documentation/TESTING.md` sentence naming the check.

## Out of scope

Dropping `eol=crlf` from `.gitattributes` (Windows batch files need CRLF in the working tree), changing the Unix `gradlew`, a git hook that renormalizes on commit, and the `git update-index --assume-unchanged` workaround named in the roadmap item (it stays harmless for clones made before this lands).

## Rulings

- Renormalize the blob, or change `.gitattributes`? -> renormalize the blob | the attribute is correct: the batch file must be CRLF on disk, and only the stored copy disagrees with it | Cost if wrong: one more commit that reverts the blob.
- What should the check inspect, a fresh clone's status or the index? -> the index, through `git ls-files --eol`, plus one temporary-repository test that proves a CRLF index blob is what makes git report the file as modified, with the file's modification time set explicitly so the result does not depend on timestamps | a clone of the real repository is slow and a local edit would make it flaky, while the index shows the cause directly and quickly | Cost if wrong: a future git version that stops showing the symptom fails the temporary-repository test and tells us the detector needs a new definition.
- Flag only `text eol=crlf` files, or every text file with CRLF in the index? -> every file git normalizes (`attr/text...`, not `-text`) | the repository rule is LF in the index, and `git add --renormalize` would rewrite any such file anyway; there is none today besides this one | Cost if wrong: a false failure for a file that deliberately keeps CRLF; it would need `-text` or a rewritten rule, which is the honest fix.
- Does a changed blob affect release or source builds? -> no | the working tree is CRLF on every checkout, and the file is unused on Linux and Android builds | Cost if wrong: a Windows wrapper start script with LF endings; the temporary-repository test and the fresh-clone check in the evidence cover the working tree bytes.
- Anything against the product rules? -> no | no network, telemetry, AI, camera or microphone, no competitor names.

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

Filled at archive time.
