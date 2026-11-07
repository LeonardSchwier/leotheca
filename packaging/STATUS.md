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

There is no versioned release tag. The only tag is the rolling `dev-build`, which every push to `main` replaces. It is published as a normal release marked Latest and carries the Android APK (debug, unsigned), AppImage, Flatpak bundle, macOS universal DMG and Windows MSI. The `v1.0.0` tag and release were deleted on 2026-11-07.

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
