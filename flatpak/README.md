# Flatpak packaging

Status: the manifest is prepared as a standalone stable-release submission and has a dedicated cloud verification gate. The app source is pinned to a fixed commit instead of relying on a local checkout. The submission metadata, generated dependency source lists, and Cargo configuration can therefore be copied to an external submission repository without changing build paths.

The pinned commit is not a tagged release: the repository's version scheme moved to `VERSION`-file-driven `0.1.0` semantics (audit follow-up F-015), and no `v0.1.0` tag has been cut yet, so there is currently no real release tag to pin to. The manifest is instead pinned to a specific, currently-working commit hash, updated to a real `v0.1.0`-style tag once one exists. See the dated comment in `com.leonardschwier.leotheca.yml`'s `sources:` block for the real CI failure (an `npm ci --offline` registry hit caused by the old `v1.0.0` tag's stale, already-fixed-on-`main` `eslint-plugin-preact` dependency) that made re-pinning necessary.

## Files

The submission set is:

- `com.leonardschwier.leotheca.yml`, the application manifest.
- `com.leonardschwier.leotheca.desktop`, the desktop entry.
- `com.leonardschwier.leotheca.metainfo.xml`, the store metadata.
- `node-sources.json`, generated offline npm sources.
- `cargo-sources.json`, generated offline Cargo sources.
- `cargo-config.toml`, the Cargo source replacement configuration used during the sandboxed build.

The manifest fetches the stable upstream source from the literal repository URL and pins commit `eb98b1affd309207d7fb114f1e8d6e9acf45537b`. New stable releases must update the commit (ideally to a real tag once one exists), release metadata, and generated dependency source lists together, and any commit that changes `package-lock.json` or `src-tauri/Cargo.lock` must regenerate the dependency source lists below against that exact commit and update the pin to match, or a future build can silently regress into the same offline-cache mismatch documented in `com.leonardschwier.leotheca.yml`.

## Verification

`.github/workflows/flathub-submission-verify.yml` is the independent submission gate. It runs the official AppStream and manifest linter, builds the exact standalone submission candidate, and lints the resulting repository on both x86_64 and ARM64. No linter exceptions are accepted by this workflow.

The ordinary project CI remains required as well. A green packaging build does not replace frontend tests, Rust checks and tests, or the Android build.

The cloud automation sandbox is not expected to install a desktop runtime locally. The repository's containerized build job is the supported verification path when the sandbox cannot install or execute the required runtime.

## Regenerating dependency sources

Regenerate both generated source lists whenever `package-lock.json` or `src-tauri/Cargo.lock` changes. Run these commands from the repository root:

```sh
git clone --depth 1 https://github.com/flatpak/flatpak-builder-tools.git /tmp/flatpak-builder-tools
pip install --user aiohttp
(cd /tmp/flatpak-builder-tools/node && python3 -m flatpak_node_generator npm \
  -o "$OLDPWD/flatpak/node-sources.json" "$OLDPWD/package-lock.json")

curl -sL -o /tmp/flatpak-cargo-generator.py \
  https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/cargo/flatpak-cargo-generator.py
pip install --user aiohttp tomlkit
python3 /tmp/flatpak-cargo-generator.py src-tauri/Cargo.lock -o flatpak/cargo-sources.json
```

Use the generator from its current source checkout. The separately published `0.1.1` node-generator package was previously shown to produce an incomplete source list for this lockfile, while the current source checkout produced the complete architecture-aware list. The generated list includes the optional Linux build-tool archives needed for both x86_64 and ARM64.

## Current submission process

Current upstream submission documentation requires a pull request against the external repository's `new-pr` branch, not its default branch.

1. Fork `https://github.com/flathub/flathub` with all branches available.
2. Create the submission branch from `new-pr`.
3. Copy the six files listed above to the submission repository root. The manifest filename stays `com.leonardschwier.leotheca.yml`.
4. Commit and push that submission branch.
5. Open the pull request against `new-pr` with the title `Add com.leonardschwier.leotheca`.
6. Address automated lint/build findings and reviewer comments without closing the pull request. A test build is requested through the submission review process once reviewers are ready for it.
7. After acceptance, publication, and collaborator access to the new application repository, open the developer portal and use its Verification page. The portal generates the real verification token for `leonardschwier.com`; publish that exact token using the method it specifies. Do not invent a verification token or pre-create a guessed value.

The domain behind the application ID is reachable over HTTPS. Domain ownership still cannot be marked verified before the application exists in the external service and its developer portal issues the application-specific token.

## Permissions

The manifest deliberately grants no broad filesystem permission. On Linux the locked dialog stack is `tauri-plugin-dialog` 2.7.2 with `rfd` 0.16.0's GTK3 backend, and that backend creates `GtkFileChooserNative` for folder selection. In a sandbox GTK routes this native chooser through the file-chooser portal, which makes the user-selected directory available to the application and keeps portal-managed selections accessible across sessions. Leotheca then performs its normal filesystem operations only through the path the user explicitly selected.

This scoped access is required by the submission linter and is also a better fit for the application's local-first model than a blanket home-directory grant. The repository CI can prove the manifest lints and builds, but it cannot click a real desktop folder chooser. A real packaged-app smoke test should therefore confirm selecting a workspace, reopening it, and creating/editing a note before the submission is called complete.
