# Flatpak packaging

Status: manifest complete, including generated dependency source lists. A local `flatpak-builder` test build was attempted (session 55) and hit an environment-specific blocker rather than a manifest problem — see "Before actually submitting" below. The real verification path is now the `flatpak` job in `.github/workflows/release.yml`, which runs on a GitHub Actions runner (full root, unfiltered Flathub) and doesn't hit that blocker; it's unverified until the first tag push actually runs it.

## What's here

- `com.leonardschwier.leotheca.yml`, the Flatpak manifest.
- `com.leonardschwier.leotheca.desktop`, the desktop entry installed into the sandbox (a separate file from any desktop entry used for a local dev install, that one needs an absolute path to a locally built binary instead of the sandboxed `leotheca` command).
- `com.leonardschwier.leotheca.metainfo.xml`, the AppStream MetaInfo file Flathub requires for every submission (summary, description, screenshots, release notes — this is what populates the app's listing on flathub.org and in software centers). Its `<release>` entry's `version`/`date` need updating to match whatever the actual first tagged release turns out to be before submitting; `1.0.0` there now is a placeholder. Screenshot URLs point at `assets/screenshots/*.png` on `main` via `raw.githubusercontent.com`, so they only resolve once this repository is actually pushed (already true) and public.
- `node-sources.json`, the npm dependency source list, generated from `package-lock.json` via [`flatpak-node-generator`](https://github.com/flatpak/flatpak-builder-tools/tree/master/node) (`pip install --user flatpak-node-generator`).
- `cargo-sources.json`, the Cargo dependency source list, generated from `src-tauri/Cargo.lock` via [`flatpak-cargo-generator.py`](https://github.com/flatpak/flatpak-builder-tools/tree/master/cargo) (fetched directly, it isn't published as an installable package).
- `cargo-config.toml`, copied to `$CARGO_HOME/config.toml` during the build (see the manifest's `build-commands`) so `cargo` reads the vendored crates `cargo-sources.json` lays out instead of trying to reach crates.io, which the sandboxed build has no network access to. Flatpak builds run fully offline, the same constraint F-Droid puts on the Android build, see `CONSTITUTION.md`.

## Regenerating the source lists after a dependency change

Both files are generated, not hand-maintained. Regenerate them (from the repository root) whenever `package-lock.json` or `src-tauri/Cargo.lock` changes:

```sh
pip install --user flatpak-node-generator
flatpak-node-generator npm -o flatpak/node-sources.json package-lock.json

curl -sL -o /tmp/flatpak-cargo-generator.py \
  https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/cargo/flatpak-cargo-generator.py
pip install --user aiohttp tomlkit
python3 /tmp/flatpak-cargo-generator.py src-tauri/Cargo.lock -o flatpak/cargo-sources.json
```

No `flatpak-builder` or GNOME runtime install is needed for this step, it only talks to the npm registry and crates.io to resolve download URLs and checksums.

## Before actually submitting

1. A real test build, either:
   - **In CI** (recommended, and the only path actually exercised so far): the `flatpak` job in `.github/workflows/release.yml` runs on every version tag push, using the `flatpak/flatpak-github-actions/flatpak-builder` action against a container image that already has `flatpak-builder` and the `org.gnome.Sdk`/`org.gnome.Platform` (version 46) runtime present as root. Its result (a `.flatpak` bundle attached to the draft GitHub Release) is the real verification signal.
   - **Locally**, if you have (or can get) root: install `flatpak-builder` and the runtime/SDK the normal, system-wide way (needs `sudo`), then:
     ```sh
     flatpak-builder --user --install build-dir flatpak/com.leonardschwier.leotheca.yml
     ```
     A session 55 attempt to do this *without* root — running `flatpak-builder` as the `org.flatpak.Builder` Flatpak itself, the only install path available without `sudo` — hit a real blocker: that sandboxed build could not see a `--user`-installed `org.gnome.Sdk`/`org.gnome.Platform` via its own host-command mechanism, even though the runtime was genuinely installed and visible to a plain `flatpak info` call run directly. This looks specific to `flatpak-builder`-running-as-a-Flatpak against user-scope (not system-scope) runtime installs, not a problem with this manifest or its dependency source lists. If you hit the same thing, either get `sudo` for a real system-wide install, or rely on the CI job above instead.
2. Fix whatever that first real build turns up. Generated source lists resolving correctly is a good sign but not a guarantee the whole offline build sequence (`npm ci --offline`, `cargo --offline fetch`, `npm run build`, `cargo build --release --offline`) works end to end untested.
3. **Domain verification**: the app ID `com.leonardschwier.leotheca` (see `CONSTITUTION.md`'s Decisions Log, 2026-08-26) is a reverse-DNS identifier under `leonardschwier.com`. Flathub requires proving control of that domain before it will accept the submission — confirmed with the maintainer (session 55) that they own it. The exact current mechanism (a `.well-known` verification file, most likely at a path like `https://leonardschwier.com/.well-known/org.flathub.VerifiedApps.txt` listing this app ID — confirm the exact filename against [Flathub's own verification docs](https://docs.flathub.org/docs/for-app-authors/verification) at submission time, since this has changed before) needs to be in place before or during the PR below, or Flathub's review will flag it.
4. Once the CI build is green and the domain is verified, submit:

   1. Fork [`flathub/flathub`](https://github.com/flathub/flathub) on GitHub.
   2. Create a new branch named exactly `com.leonardschwier.leotheca` (Flathub's submission bot keys off the branch name matching the app ID).
   3. Add this manifest to that branch — either just this `flatpak/` directory's contents at the repo root (Flathub prefers a manifest that can build standalone; check their current [App Requirements](https://docs.flathub.org/docs/for-app-authors/requirements) doc for whether they still want `x-checker-data` / other metadata added, since that guidance has evolved), or point Flathub's manifest at this GitHub repo as its source instead of vendoring a copy — either approach is used by real Flathub apps today, worth deciding against their current docs rather than assuming.
   4. Open a pull request against `flathub/flathub`'s default branch. Flathub's bot (`flathubbot`) runs a real build and comments with the result automatically — no manual trigger needed.
   5. Suggested PR title: `Add com.leonardschwier.leotheca`
   6. Suggested PR description:

      ```markdown
      ## App: Leotheca

      A free and open source markdown viewer and editor for a local folder
      of plain text notes. No account, no telemetry, no proprietary sync.

      - Source: https://github.com/LeonardSchwier/leotheca
      - License: MIT
      - App ID: com.leonardschwier.leotheca (domain verification: leonardschwier.com)

      This is the project's first Flathub submission.
      ```
   7. Address whatever the bot's build/lint pass turns up (missing metadata fields, icon size issues, `finish-args` the reviewers want tightened, etc. are all normal on a first submission).
   8. Once a human reviewer approves and merges, Flathub creates a dedicated `flathub/com.leonardschwier.leotheca` repository and invites the maintainer as a collaborator there — that's where future manifest updates (new releases, dependency bumps) get pushed from then on, not this repository's `flatpak/` directory directly (though keeping this copy in sync as the source of truth is a reasonable practice, several Flathub apps do this).

This whole step — the actual PR — needs the maintainer's own GitHub account and ongoing back-and-forth with Flathub reviewers, not something an agent should do unprompted.
