# Leotheca packaging status

Current as of 2026-11-07 (`VERSION` is 1.0.0). No package has been submitted to an external store or registry. Everything below is repository-side preparation.

## Overview

| Package  | Repository-side state                                                                   | Directory             | External submission |
| -------- | --------------------------------------------------------------------------------------- | --------------------- | ------------------- |
| Flatpak  | Manifest, desktop entry, metainfo and generated Cargo/Node source lists                 | `flatpak/`            | Not submitted       |
| Homebrew | Draft Cask with `TODO` placeholders; not valid to submit yet                            | `packaging/homebrew/` | Not submitted       |
| Snap     | Draft `snapcraft.yaml` (version 1.0.0, matches `VERSION`)                               | `snap/`               | Not submitted       |
| F-Droid  | Metadata for 1.0.0 (version code 10000) plus a verification workflow                    | `packaging/f-droid/`  | Not submitted       |
| macOS    | App and Quick Look `Info.plist` and source; the Quick Look generator is not built by CI | `packaging/macos/`    | Not applicable      |

The CI workflows that check the packaging inputs are `flathub-submission-verify.yml`, `fdroid-submission-verify.yml` and `release.yml` in `.github/workflows/`.

## Release channel today

There is no versioned release tag. The only tag is the rolling `dev-build`, which every push to `main` replaces. It is published as a normal release marked Latest and carries an Android APK (properly signed when the release signing secrets exist, otherwise a TEST build, see below), AppImage, Flatpak bundle, macOS universal DMG and Windows MSI. The `v1.0.0` tag and release were deleted on 2026-11-07.

## Android release signing

Published Android builds are never signed with the debug key. `android/app/build.gradle` signs the `release` type from environment variables only; `release.yml` fills them from repository secrets, verifies the result with `apksigner verify --print-certs` and `scripts/verifyApkNotDebugSigned.mjs`, and the publish job re-checks every APK. When the secrets are absent the job generates a throw-away keystore with `keytool` (random password from `openssl rand`, masked, never printed, never stored beyond the job; a new key on every run), signs the release APK with it through the same `LEOTHECA_KEYSTORE_*` path, and the publish job attaches it as `leotheca-<tag>-android-TEST-ephemeral-key.apk`. The release notes and the job log say it is a test build. A properly signed build keeps the name `leotheca-<tag>-android.apk`. Because the key differs on every build, Android treats each build as a different app: uninstall before installing the next one, there are no in-place updates, and Obtainium and F-Droid cannot track it. It exists so the owner can try the app; the real release key comes from the four secrets. The refusal to publish debug-key-signed APKs is unchanged and applies to both builds. Today none of the secrets exist, so `dev-build` carries the TEST file. F-Droid is unaffected: it builds the unsigned `release` type itself.

Owner checklist (an agent cannot do these):

1. Generate a key, once, and keep a backup outside GitHub: `keytool -genkeypair -v -keystore leotheca-release.jks -alias leotheca -keyalg RSA -keysize 4096 -validity 10000`. Never commit it. Losing it means installed users must uninstall to update.
2. In GitHub, Settings, Secrets and variables, Actions, add four repository secrets: `ANDROID_KEYSTORE_BASE64` (output of `base64 -w0 leotheca-release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (here `leotheca`) and `ANDROID_KEY_PASSWORD`.
3. Push to main (or re-run the Release workflow on a push event) and confirm the log line `android-release-signing: all four secrets present` and an APK named `leotheca-dev-build-android.apk` (no `TEST` in the name) on the release. Check it with `apksigner verify --print-certs`.
4. Anyone who installed an earlier debug-signed or TEST dev-build APK must uninstall it once, because the signature changes.

Not verified in the repository: the Gradle signing block, the throw-away key step and the workflow steps have not run against a real key or a hosted runner. The comparison logic is unit-tested (`scripts/verifyApkNotDebugSigned.test.js`).

## What is missing before an external request

1. A real release tag. The F-Droid metadata still names commit `v1.0.0`, which no longer exists, so its build cannot be reproduced until a fresh tag is cut and the metadata is updated to it.
2. SHA-256 checksums of the released artifacts for the Homebrew Cask.
3. A decision on macOS code signing and notarization (unsigned builds trigger a Gatekeeper warning).
4. Snap: a pre-built binary from CI instead of a Snapcraft source build.
5. Homebrew: replace the placeholder checksum and confirm the macOS asset name once a macOS build exists.

## Next steps, once a release tag exists

1. Update the F-Droid `Builds:` entry and `CurrentVersion` to the new tag, then submit to `fdroid/fdroiddata`.
2. Fill in the Cask checksums and publish a tap `leonardschwier/homebrew-leotheca`.
3. Submit the Flatpak to Flathub.
4. Register and push the Snap.

## Rules

- External requests (pull requests, store registration, uploads) need the maintainer's explicit go-ahead.
- Validate every manifest locally or through the existing CI workflows before pushing.
