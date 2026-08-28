# Flatpak packaging

Status: manifest complete, including generated dependency source lists. A local `flatpak-builder` test build was attempted (session 55) and hit an environment-specific blocker rather than a manifest problem — see "Before actually submitting" below. The real verification path, the `flatpak` job in `.github/workflows/release.yml`, actually ran for the first time on the `v1.0.0` tag push (session 57) and **found a real bug**, since fixed — see "Known issue: the PyPI `flatpak-node-generator` package is broken for this lockfile" below before ever regenerating `node-sources.json` with `pip install`.

## What's here

- `com.leonardschwier.leotheca.yml`, the Flatpak manifest.
- `com.leonardschwier.leotheca.desktop`, the desktop entry installed into the sandbox (a separate file from any desktop entry used for a local dev install, that one needs an absolute path to a locally built binary instead of the sandboxed `leotheca` command).
- `com.leonardschwier.leotheca.metainfo.xml`, the AppStream MetaInfo file Flathub requires for every submission (summary, description, screenshots, release notes — this is what populates the app's listing on flathub.org and in software centers). Its `<release>` entry's `version`/`date` need updating to match whatever the actual first tagged release turns out to be before submitting; `1.0.0` there now is a placeholder. Screenshot URLs point at `assets/screenshots/*.png` on `main` via `raw.githubusercontent.com`, so they only resolve once this repository is actually pushed (already true) and public.
- `node-sources.json`, the npm dependency source list, generated from `package-lock.json` via [`flatpak-node-generator`](https://github.com/flatpak/flatpak-builder-tools/tree/master/node) — run from a GitHub checkout of the tool, **not** the PyPI package, see the known-issue note below.
- `cargo-sources.json`, the Cargo dependency source list, generated from `src-tauri/Cargo.lock` via [`flatpak-cargo-generator.py`](https://github.com/flatpak/flatpak-builder-tools/tree/master/cargo) (fetched directly, it isn't published as an installable package).
- `cargo-config.toml`, copied to `$CARGO_HOME/config.toml` during the build (see the manifest's `build-commands`) so `cargo` reads the vendored crates `cargo-sources.json` lays out instead of trying to reach crates.io, which the sandboxed build has no network access to. Flatpak builds run fully offline, the same constraint F-Droid puts on the Android build, see `CONSTITUTION.md`.

## Regenerating the source lists after a dependency change

Both files are generated, not hand-maintained. Regenerate them (from the repository root) whenever `package-lock.json` or `src-tauri/Cargo.lock` changes:

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

No `flatpak-builder` or GNOME runtime install is needed for this step, it only talks to the npm registry and crates.io to resolve download URLs and checksums.

### Known issue: the PyPI `flatpak-node-generator` package is broken for this lockfile

Found the hard way (session 57): `pip install flatpak-node-generator` installs PyPI's `0.1.1` release, which silently drops the vast majority of this project's real dependencies when run against `package-lock.json` (a modern, lockfile-version-3 file with 625 packages) — it wrote only 120 "sources," most of which were actually *every* `@esbuild/*` platform variant (Windows, every obscure Unix, `aix-ppc64`, `openharmony-arm64`, all of them) rather than just the one the sandboxed Linux x64 build needs, while dropping ~560 real, needed packages including plain `eslint` itself. This produced a `node-sources.json` that looked complete (valid JSON, non-trivial size) and was committed as such, and only actually failed once a real `flatpak-builder` run (the CI job's first real execution, on the `v1.0.0` tag push) tried `npm ci --offline` against it and hit `ENOTCACHED` trying to fetch `eslint` from the registry — a build the sandboxed job has no network access to do.

Root cause isolated by running the same lockfile through a fresh `git clone` of the tool's GitHub repository (`flatpak/flatpak-builder-tools`, the `node/` directory, invoked as `python3 -m flatpak_node_generator` rather than the installed `flatpak-node-generator` console script) instead of the pip-installed copy: the GitHub version correctly produced all 560 needed sources (verified programmatically: every `resolved` URL in `package-lock.json`, excluding the platform-mismatched optional variants, is present in the regenerated file). Whatever bug PyPI's `0.1.1` release has isn't present on GitHub's current `master` — the two even report different self-versions (`0.1.1` vs. `0.1.0`), suggesting PyPI's copy predates a real fix rather than postdates it. **Always regenerate from a fresh GitHub checkout, per the command above, never `pip install flatpak-node-generator` directly** — that command is deliberately not in the regeneration steps above anymore for this reason.

### Known issue (fixed): a peer-dependency conflict forced `npm ci --offline` to hit the network anyway

This was a second, separate bug from the one above, not another symptom of it, and it's the one that made the CI `flatpak` job keep failing with `ENOTCACHED registry.npmjs.org/eslint` even after `node-sources.json` was regenerated correctly. See `ROADMAP.md`'s "Still open for v1" section for the full investigation trail (three disproven theories before this one). The actual cause: `eslint-plugin-preact@0.1.0` was a `devDependency` this project never actually used (`eslint.config.js` uses `@eslint/js` and `typescript-eslint` directly, not this package), and it transitively pulled in `eslint-config-developit` → `eslint-plugin-compat@^3.5.1`, whose peer dependency only supports `eslint` up to version 7, wildly out of range of this project's real `eslint@10.9.1`. That conflict forced npm's arborist into "overriding peer dependency" resolution during `npm ci`, which needs a bare, unversioned registry packument lookup that `node-sources.json` never has a cache entry for (it only ever covers tarball fetches). Fixed by removing the unused `eslint-plugin-preact` dependency entirely rather than working around the symptom: with the conflict gone, `npm ci` and `npm ci --offline` both complete with zero registry calls. If a future dependency change reintroduces a real peer conflict, expect the same `ENOTCACHED` failure to come back, since the underlying limitation (this cache format only covers tarballs) hasn't changed, only the specific conflict that was triggering it.

### Known issue (fixed): the GNOME 46 runtime's frozen Rust toolchain couldn't build a current Cargo.lock

Fixing the bug above let `npm ci --offline` finally succeed, which only exposed a second, unrelated failure one build step later: `cargo --offline fetch` failing on Cargo's `edition2024` feature not being stabilized in the runtime's Rust. GNOME 46 had been out of active support for a long time by the time this was investigated, so its `org.freedesktop.Sdk.Extension.rust-stable` was frozen at Rust 1.81.0 (~August 2024), while ordinary `cargo update` over the intervening months had drifted this project's real `Cargo.lock` to depend on 21 separate crates (including foundational ones like `indexmap`, `hashbrown`, and `time`) that now require Rust 1.85+ for `edition2024`. Pinning them down one at a time (as was tried for the first one found, `toml_edit`, see the Decisions Log / `agent-log/CHANGELOG.md`) doesn't scale to 21 of them, several of them widely depended-on, without real risk of new version conflicts. Fixed properly by moving the manifest's `runtime-version` (and the CI container image) to GNOME 50, the current stable release, whose bundled Rust toolchain is current enough that none of this needed touching. If the GNOME 46 pin is ever needed again for some reason, expect this whole class of failure to recur as the runtime ages further out of support.

## Before actually submitting

1. A real test build, either:
   - **In CI** (recommended, and the only path actually exercised so far): the `flatpak` job in `.github/workflows/release.yml` runs on every version tag push, using the `flatpak/flatpak-github-actions/flatpak-builder` action against a container image that already has `flatpak-builder` and the `org.gnome.Sdk`/`org.gnome.Platform` (version 50, matching this manifest's `runtime-version`) runtime present as root. Its result (a `.flatpak` bundle attached to the draft GitHub Release) is the real verification signal.
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
