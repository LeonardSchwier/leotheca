# F-Droid packaging

Status: the metadata is pinned to the v1.0.0 release source and has a reproducible build recipe that is exercised by `.github/workflows/fdroid-submission-verify.yml`. The repository-side verification runs the official metadata tools and build-server image, and independently rebuilds and inspects the unsigned APK. A real submission to the separate metadata repository is still required before this roadmap item can be called complete.

## What's here

`com.leonardschwier.leotheca.yml`, the metadata file intended to be contributed to the separate [`fdroid/fdroiddata`](https://gitlab.com/fdroid/fdroiddata) repository. It remains in this repository as the authoritative working copy so build fixes and future release updates can be reviewed alongside the application source.

## Node.js and npm dependencies

This project's Android build depends on `npm ci` to populate `node_modules` before Capacitor and Gradle can build. F-Droid's inclusion policy permits current Node.js build tooling and dependencies when needed, although Debian-packaged dependencies are preferred when an equivalent exists.

The recipe pins the Node.js archive and verifies its SHA-256 before installation. After the shared frontend is built and synchronized into the Android project, the recipe removes the small set of frontend-only executable, archive, and WebAssembly files that the official source scanner rejects. Those files are not inputs to the native Gradle build at that point. The verification workflow reproduces the same cleanup and then builds the release APK, so the cleanup cannot silently remove a required native-build input.

## Verified repository-side checks

The submission verification workflow checks all of the following against the release recipe:

1. The metadata parses, lints, and passes update checks with the official server tools.
2. The metadata is pinned to the exact v1.0.0 source commit and pinned Node.js archive checksum.
3. The historical release source has its obsolete unused network permission and services build-plugin entries removed before building.
4. The shared frontend builds and synchronizes into the Android project.
5. Frontend-only files rejected by the source scanner are removed before the native build.
6. The unsigned release APK is rebuilt after that cleanup.
7. The APK reports version name `1.0`, version code `1`, and no `android.permission.INTERNET` permission.
8. The official build-server flow must produce `com.leonardschwier.leotheca_1.apk`; a failed or missing build is a hard workflow failure.

A green workflow proves the repository-side recipe is buildable under that independent cloud environment. It is not a substitute for the separate repository's own review and submission CI.

1. ~~Resolve the npm-offline-build question.~~ Done, see above.
2. Confirm the `output` glob path matches what a real `gradle assembleRelease` (unsigned) run actually produces.
3. Decide on `AutoUpdateMode`/`UpdateCheckMode` properly, both are placeholder `None` values right now. Now that a real tagged release exists (or will shortly, see `ROADMAP.md`), switch these to F-Droid's tag-based detection, likely `UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$` (matching this repo's `v*` tag pattern from `release.yml`) paired with `AutoUpdateMode: Version` and a `Builds` commit template using F-Droid's `%v`/`%c` placeholders. Confirm the exact current syntax against F-Droid's [Build Metadata Reference](https://f-droid.org/docs/Build_Metadata_Reference/) before submitting, this area of their format has had revisions.
4. Update `CurrentVersion`/`CurrentVersionCode` and add a matching entry under `Builds:` for the actual first tagged release (this draft's `Builds:` entry already points at the future `v0.1.0` tag rather than `main`, per audit follow-up F-015's requirement that a build recipe reference an immutable ref, but that tag does not exist yet; if the version changes again before it is cut, `versionName`/`versionCode`/`commit` here need to move together, kept honest by `npm run check-version`).

## Submitting

1. Fork [`fdroid/fdroiddata`](https://gitlab.com/fdroid/fdroiddata) on GitLab.
2. Add this repository's `com.leonardschwier.leotheca.yml` as `metadata/com.leonardschwier.leotheca.yml` in that fork.
3. Open a merge request against `fdroiddata`'s default branch. A suitable title is `New app: Leotheca`. The description should state that Leotheca is a free and open source markdown viewer and editor for local plain-text notes, requires no account, includes no telemetry or proprietary sync, is MIT licensed, and belongs in the Writing category.
4. Treat the separate repository's CI as another required verification environment. Address any build, reproducibility, source-scanner, or inclusion-policy findings on the claimed branch before calling the roadmap item complete.
5. Once accepted, subsequent releases are detected through the configured tag-based update mode.

The external merge request requires an authenticated GitLab account. An autonomous agent may perform that submission only when the cloud environment has authorized access to the maintainer's account. It must never fabricate credentials or treat repository-side verification as proof that an external submission occurred.
