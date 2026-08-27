# Flatpak packaging

Status: manifest complete, including generated dependency source lists. A local `flatpak-builder` test build was attempted (session 55) and hit an environment-specific blocker rather than a manifest problem — see "Before actually submitting" below. The real verification path is now the `flatpak` job in `.github/workflows/release.yml`, which runs on a GitHub Actions runner (full root, unfiltered Flathub) and doesn't hit that blocker; it's unverified until the first tag push actually runs it.

## What's here

- `com.leonardschwier.leotheca.yml`, the Flatpak manifest.
- `com.leonardschwier.leotheca.desktop`, the desktop entry installed into the sandbox (a separate file from any desktop entry used for a local dev install, that one needs an absolute path to a locally built binary instead of the sandboxed `leotheca` command).
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
3. Only once that succeeds is this ready to actually submit to Flathub (a separate step: a pull request to the Flathub repository, which needs the maintainer's own GitHub account and review process, not something an agent should do unprompted).
