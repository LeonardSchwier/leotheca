# Stop signing published Android builds with the public debug keystore

## Item

rm-85105ec27e17422a, "Stop signing published Android builds with the public debug keystore" (Tier 2 audit 2026-11-08, finding F3, confirmed, medium). The release workflow must never publish an APK signed with the Android debug certificate as if it were a release: a release APK is signed with a maintainer-held key from CI secrets, or no Android asset is published at all.

## Acceptance

- `android/app/build.gradle` signs the `release` build type only from `LEOTHECA_KEYSTORE_FILE`, `LEOTHECA_KEYSTORE_PASSWORD`, `LEOTHECA_KEY_ALIAS` and `LEOTHECA_KEY_PASSWORD`. With any of them unset the release APK stays unsigned (what F-Droid's `assembleRelease` expects). The `release` type never uses the debug signing config.
- In `release.yml` the `android` job builds `assembleRelease`. With the four secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) present it signs, verifies with `apksigner verify --print-certs` and uploads `android-release-apk`. Without them it prints the reason in the job log, uploads no APK and still succeeds, so the other platforms publish.
- The `publish` job re-verifies every APK it is about to publish and fails if any signer is the Android debug certificate (SHA-256 of `android/debug.keystore`, or the stock `CN=Android Debug` name). It publishes no `DEBUG-UNSIGNED` asset any more and says in the release body whether an Android APK is included and why not.
- `scripts/verifyApkNotDebugSigned.mjs` holds the comparison logic; its test fails for the debug digest in any spelling, the stock DN, a second signer, empty output and a missing reference digest, and passes for a release certificate.
- `packaging/STATUS.md`, `SECURITY.md` and `master-spec.md` state the new behaviour and list the owner checklist. `README.md` is held by another claim (see Out of scope).

## Context

Read: `android/app/build.gradle` (debug config with the public password `android`, used only by the debug type), `android/debug.keystore` (CN=Android Debug, SHA-256 E2:F9:2D:81:...:AE:9B), `.github/workflows/release.yml` (android job builds `assembleDebug`; publish renames it `...-android-DEBUG-UNSIGNED.apk` and uploads it to the Latest `dev-build` release), `packaging/f-droid/` (builds its own unsigned release, so an unsigned `release` type stays correct). Impact: anyone can sign a higher `versionCode` APK with the same public key and Android accepts it as an update of an installed dev build. The macOS job already uses the secret-present pattern (`signing_verified` output); this follows it. No secrets are created or added here. The Tauri/desktop code and capabilities are untouched.

## Plan

1. `scripts/verifyApkNotDebugSigned.mjs` and its test, test first.
2. `build.gradle`: env-driven release signing config.
3. `release.yml`: android job (decide, decode, build, verify, upload), publish job (checkout for the debug digest, verify, release body, drop the rename).
4. Docs: `packaging/STATUS.md`, `SECURITY.md`, `master-spec.md` change log, `CHANGELOG.md`.

## Out of scope

Creating the keystore or the secrets (owner task). A debug-test artifact: not published at all, the simplest way to keep it out of Latest and out of Obtainium/F-Droid update detection. Rotating the key of already installed dev builds: they must be uninstalled once. `README.md` install notes: another live claim holds it, so a follow-up item is seeded for the two lines that name the DEBUG-UNSIGNED asset.

## Rulings

Publish a labelled debug artifact when secrets are absent? -> no, publish no Android asset | any debug-signed APK on the Latest release is exactly what the audit flagged, and a separate pre-release still sits next to the Latest tag in the release list | Cost if wrong: testers build their own debug APK or download the CI workflow artifact.
Fail the whole release when the secrets are missing? -> no | Linux, Flatpak, macOS and Windows would stop publishing for an owner-side gap; the android job succeeds and the log and release body say why | Cost: someone can miss that Android is absent, hence the body note and a `::warning`.
Where does the verification live? -> in both the android job and the publish job | the publish job is the last gate and also catches a stray artifact from another source | Cost: one extra checkout and a few seconds.
Reference digest hard-coded or derived? -> derived with `keytool` from the committed `android/debug.keystore`, plus the stock DN check | a hard-coded copy can drift from the file; DN covers the SDK's own debug key | Cost: needs `keytool`, present on every runner with Java.
Does an unsigned release type break local builds? -> no | `assembleDebug` is unchanged and `assembleRelease` produces `app-release-unsigned.apk`, as F-Droid expects | Cost: none.

Glossary: none

## Evidence

| Claim                                                                                                                                             | Evidence                                                                                                                           | Result                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| comparison logic rejects the debug digest (any spelling), the stock DN, a second signer, empty output, no reference digest; passes a release cert | `npx vitest run scripts/verifyApkNotDebugSigned.test.js`; with the digest check disabled 3 of 10 failed, restored 10 of 10 pass    | 10 passed                               |
| committed debug keystore digest equals the constant in the test                                                                                   | same file, "matches the digest keytool reports" (keytool present)                                                                  | passed                                  |
| workflow is valid YAML and actions stay pinned                                                                                                    | `python3 -c "yaml.safe_load(...)"`, `node scripts/check-rules.mjs workflows`                                                       | ok, exit 0                              |
| script suite and types                                                                                                                            | `npx vitest run scripts` (14 files), `npx tsc --noEmit`, `check_master_spec.py`                                                    | 182 passed, clean, OK                   |
| Gradle signing block and hosted steps                                                                                                             | not run: no Android SDK or Gradle on this runner, no secrets exist                                                                 | deferred, stated in packaging/STATUS.md |
| review: standards                                                                                                                                 | self-review of the diff against the repository rules: no secret in the diff, secrets only via env, `exit 0` path prints the reason | closed                                  |
| review: spec                                                                                                                                      | each acceptance bullet maps to build.gradle, release.yml android and publish jobs, the script and its test, and the docs           | met; README held by another claim       |
| e2e smoke / security                                                                                                                              | no UI or app code changed; security: Tier 1 checklist for `android/**` (no manifest or exported component change)                  | not applicable / checklist              |

Legal/text check: 6 verified, 0 fixed, 0 open (new prose and own code only)

Reflection: a ledger claim on a wide prefix such as `android/app` or a shared doc blocked this security fix for about 25 minutes although the files differed, and a `GLOSSARY.md` touch path made two unrelated claims collide -> none: the narrow-claim rule worked once the exact spec and doc paths were named; a rule change would only hide real overlap.
