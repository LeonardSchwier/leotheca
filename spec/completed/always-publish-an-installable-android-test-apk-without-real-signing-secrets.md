# Always publish an installable Android test APK without real signing secrets

## Item

rm-e6d0cfb114e580b9. The owner has not added the four Android signing secrets and asked for an APK anyway. An unsigned APK cannot be installed, so the release job signs a test build with a throw-away key.

## Acceptance

- Secrets absent: the `android` job creates a PKCS12 keystore with `keytool` (random `openssl rand` password, masked, kept in a file in `RUNNER_TEMP`, never printed or uploaded, new key every run), builds `assembleRelease` through the `LEOTHECA_KEYSTORE_*` variables, verifies and uploads it.
- Publish attaches it as `leotheca-<tag>-android-TEST-ephemeral-key.apk`; a build signed with the secrets keeps `leotheca-<tag>-android.apk`. The release body says when the file is a test build.
- The debug-certificate gate is unchanged and still refuses any APK signed with the public debug key; a test shows the throw-away certificate passes it.
- README, `packaging/STATUS.md`, `SECURITY.md`, `master-spec.md` and `CHANGELOG.md` state that each test build has a different key (uninstall first, no in-place updates, no Obtainium or F-Droid tracking), that it is only for trying the app, and that the release key comes from the four secrets.

## Context

Read: `.github/workflows/release.yml` (android and publish jobs), `android/app/build.gradle` (env-driven signing, unchanged), `scripts/verifyApkNotDebugSigned.mjs`, the earlier item `stop-signing-published-android-builds-with-the-public-debug-keystore.md`, which ruled "no Android asset" and is replaced here by the owner's current instruction.

## Plan

1. Test: throw-away certificate passes the debug gate.
2. Workflow: key step, build step, rename, release body.
3. Docs.

## Out of scope

Creating the real key or secrets (owner task). Changing `build.gradle`.

## Rulings

Publish an unsigned APK? -> no | Android refuses to install it | Cost: none.
Reuse one stored test key so updates work? -> no | a stored key is a secret to protect and would look like a release key | Cost: users uninstall between builds.
Publish a partial secret set silently as a test build? -> no, the job fails | a typo in one secret would otherwise quietly downgrade a release | Cost: a red run until fixed.

Glossary: none

## Evidence

| Claim                                                                       | Evidence                                                                                                | Result           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| throw-away certificate passes the debug gate, differs from the debug digest | `npx vitest run scripts/verifyApkNotDebugSigned.test.js` (keytool generated key)                        | 12 passed        |
| keytool command of the workflow works                                       | ran the same `keytool -genkeypair ... -storepass:file` locally                                          | keystore created |
| workflow YAML and shell                                                     | `python3 yaml.safe_load`, `node scripts/check-rules.mjs workflows`, `bash -n` on each changed run block | ok               |
| Gradle build and hosted steps                                               | not run: no Android SDK here; the first Release run on main is the real test                            | deferred         |

Reflection: the entry-format and lease helpers worked; the spec gate needs a Reflection line and the commit needs Legal-Check and Review trailers, which I only learned from the pre-push hook -> none: the hook states exactly what is missing.
