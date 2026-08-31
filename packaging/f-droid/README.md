# F-Droid packaging

Status: a draft metadata file, structurally correct against F-Droid's current [Build Metadata Reference](https://f-droid.org/docs/Build_Metadata_Reference/). The npm-network question that used to block this (see below) is now resolved by research against F-Droid's own current policy; still not yet submitted or confirmed buildable by F-Droid's own build server, since only a real submission attempt can confirm that.

## What's here

`com.leonardschwier.leotheca.yml`, a draft of the file that would eventually need to be contributed to the separate [`fdroid/fdroiddata`](https://gitlab.com/fdroid/fdroiddata) repository (via a merge request there, F-Droid metadata does not live in the app's own repository for real submissions, this is a working draft only). Kept here so the maintainer or a future contributor has a starting point rather than nothing.

## Resolved: F-Droid's build server allows fetching npm/Node.js dependencies during a build

This project's Android build depends on `npm ci` to populate `node_modules` before Capacitor/Gradle can build (see the `init` step in the draft metadata). Earlier sessions left open whether F-Droid's build server permits that to reach the npm registry, or whether it needs a fully vendored/offline approach instead (the way the Flatpak manifest needs, see `flatpak/README.md`).

Resolved by reading F-Droid's own [Inclusion Policy](https://f-droid.org/en/docs/Inclusion_Policy/) directly (not guessed at). Its "Build Transparency and Reproducibility" section states:

> The use of prebuilt FLOSS binaries from PyPI Wheels, Nix cache, Rust/Rustup, Golang and Node.js (current versions) and compilers or build tools which are not included in Debian can be acceptable.

Node.js/npm is explicitly named alongside PyPI, Rust/Cargo, and Go as an acceptable source for prebuilt dependencies, in the same policy document real F-Droid submissions are reviewed against. Real precedent from apps already in F-Droid confirms this in practice too: React Native-based apps in `fdroiddata` fetch JavaScript engine binaries (JSC/Hermes) from npm at build time, `scanignore`'d rather than requiring an offline/vendored alternative. Nothing in the F-Droid Build Metadata Reference requires a special flag or opt-in for this, network access during the build appears to just be available.

Two caveats this research doesn't remove:
- This confirms the *policy* permits it, not that this specific project's exact dependency tree (611 packages per `package-lock.json`, confirmed when `flatpak-node-generator` read it for the Flathub manifest this session) will sail through F-Droid's automated source/license scanner without any individual package needing a `scanignore` entry. That's only knowable from a real build attempt or a maintainer question to the F-Droid community, same as before.
- "Whenever possible, Debian-packaged dependencies should be chosen above other options" is the policy's stated preference; npm/Node.js is acceptable, not the first choice the policy would nudge toward if a Debian-packaged equivalent existed (it doesn't, for a Node/Capacitor toolchain).

## Before actually submitting

1. ~~Resolve the npm-offline-build question.~~ Done, see above.
2. Confirm the `output` glob path matches what a real `gradle assembleRelease` (unsigned) run actually produces.
3. Decide on `AutoUpdateMode`/`UpdateCheckMode` properly, both are placeholder `None` values right now. Now that a real tagged release exists (or will shortly, see `ROADMAP.md`), switch these to F-Droid's tag-based detection — likely `UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$` (matching this repo's `v*` tag pattern from `release.yml`) paired with `AutoUpdateMode: Version` and a `Builds` commit template using F-Droid's `%v`/`%c` placeholders. Confirm the exact current syntax against F-Droid's [Build Metadata Reference](https://f-droid.org/docs/Build_Metadata_Reference/) before submitting — this area of their format has had revisions.
4. Update `CurrentVersion`/`CurrentVersionCode` and add a matching entry under `Builds:` for the actual first tagged release (this draft's `Builds:` entry already points at the future `v0.1.0` tag rather than `main`, per audit follow-up F-015's requirement that a build recipe reference an immutable ref, but that tag does not exist yet; if the version changes again before it is cut, `versionName`/`versionCode`/`commit` here need to move together, kept honest by `npm run check-version`).

## Submitting

1. Fork [`fdroid/fdroiddata`](https://gitlab.com/fdroid/fdroiddata) on **GitLab** (not GitHub — this is the one part of the process that lives somewhere else).
2. Add this file as `metadata/com.leonardschwier.leotheca.yml` in that fork, updated per the "Before actually submitting" steps above.
3. Open a merge request against `fdroiddata`'s default branch. Suggested MR title: `New app: Leotheca`. Suggested MR description:

   ```markdown
   ## Leotheca

   A free and open source markdown viewer and editor for a local folder
   of plain text notes. No account, no telemetry, no proprietary sync.

   - Source: https://github.com/LeonardSchwier/leotheca
   - License: MIT (full source, no proprietary components)
   - Categories: Writing, Office
   ```
4. F-Droid's CI (`fdroidserver`'s automated checks) runs a real test build against the MR and reports back. Address whatever it finds — a `scanignore` entry for a specific package the source scanner flags, a build command tweak, etc. are all normal on a first submission; see this file's earlier research on why npm/Node.js dependency fetching itself is expected to be acceptable to F-Droid's scanner in principle, even if an individual package still needs flagging.
5. Once a human reviewer merges it, the app enters F-Droid's build queue — their own infrastructure builds and signs it (F-Droid's key, not the maintainer's), which can take anywhere from days to a few weeks for a first-time submission. Subsequent releases build automatically once `AutoUpdateMode`/`UpdateCheckMode` are set correctly (step 3 above), without a new MR each time.

This whole step — the actual MR, and any back-and-forth with F-Droid reviewers — needs the maintainer's own GitLab account, not something an agent should do unprompted.
