# Contributing to Leotheca

Read [CONSTITUTION.md](CONSTITUTION.md) and [AGENTS.md](AGENTS.md) before changing the repository. It records the project rules, product principles, and coding conventions. See [documentation/ARCHITECTURE.md](documentation/ARCHITECTURE.md) for how the codebase is structured before making a non-trivial change.

## Development setup

Install Node.js 22 (the version in `.nvmrc` and CI; `nvm use` picks it up), Rust through [rustup](https://rustup.rs/), and the Linux packages required by the desktop shell.

On Debian or Ubuntu:

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev build-essential libssl-dev
```

On Fedora:

```sh
sudo dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel libappindicator-gtk3-devel openssl-devel gcc-c++
```

On Arch Linux:

```sh
sudo pacman -S webkit2gtk-4.1 gtk3 librsvg libayatana-appindicator base-devel openssl
```

Install JavaScript dependencies, install the repository's git hooks, and start the desktop app:

```sh
npm ci
npm run hooks:install
npm run tauri dev
```

The shared UI tokens and components come from the Leoforma design system, an external package pinned in `package.json` and downloaded from its GitHub release on install, so `npm ci` needs network access to github.com. Do not copy its styles into this repository: a missing token or component is added in the Leoforma repository and the pin bumped. See [documentation/ARCHITECTURE.md](documentation/ARCHITECTURE.md) (`ui/` row).

## Android setup

Install the Android SDK (platform-tools plus platform/build-tools matching `android/variables.gradle`'s `compileSdkVersion`) and a JDK 21 install, separate from whatever JDK you use for anything else on your machine: this project's Gradle version cannot run on JDK 25 or newer ("Unsupported class file major version 69"). Point `JAVA_HOME` at that JDK 21 install before running Gradle, rather than relying on a system default:

```sh
export JAVA_HOME=/path/to/your/jdk-21
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

The resulting debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`, installable via `adb install -r`.

## Checks

From the repository root, run the fast gate that the `pre-push` hook also runs (type check, lint, the full unit tests, version and ledger validation):

```sh
npm run verify
```

or the individual checks:

```sh
npm test
npm run lint
npm run build
npm run format:check
```

`npm run ci:quick` runs a local copy of the hosted pipeline without the slow builds (the AppImage and Flatpak), and `npm run ci` runs all of it; the header of `scripts/ci-local.sh` lists the options.

The Playwright end-to-end suite is a separate package. It builds the frontend itself and runs in Chromium against a mock of the native bridge:

```sh
cd tests/e2e
npm ci
npm run install:browsers
npm test
```

After a visible UI change, regenerate the README screenshots with `node screenshots.mjs` from `tests/e2e` (see [documentation/TESTING.md](documentation/TESTING.md)).

Run Rust tests from the desktop-shell directory:

```sh
cd src-tauri
cargo test
```

## The rules every change follows

This repository is run by people and automated agents under one policy, and a human contributor follows the same rules:

- **Constitution.** [CONSTITUTION.md](CONSTITUTION.md) is the single current policy and [AGENTS.md](AGENTS.md) is the entrypoint that points every agent to it. Read both before you change anything. If a skill or older note disagrees with the constitution, the constitution wins. Product rules (offline, plain Markdown files, no telemetry, accounts or app-initiated network calls) are in [documentation/PROJECT_RULES.md](documentation/PROJECT_RULES.md).
- **Ledger.** [ROADMAP.md](ROADMAP.md) is the backlog and the only record of who is working on what. Work is claimed with `python3 scripts/agent_ledger.py` and a lease, so two workers never edit the same files. Never edit the `agent-state` comment lines by hand. List the current state with `python3 scripts/agent_ledger.py --root . list`; the exact steps are in [skills/roadmap-workflow.md](skills/roadmap-workflow.md). As a human, check the roadmap for a claimed item before you start, and open an issue first for anything large.
- **Hooks.** Run `npm run hooks:install` once after `npm ci` (it is also run by the `prepare` script). It sets `core.hooksPath=hooks` in this clone only. The hooks check staged files, commit messages and pushes; `hooks/README.md` lists every check. Do not bypass them with `--no-verify`: the same checks run again in CI on every push.
- **Commit messages.** Use a `type(scope): summary` prefix, for example `docs(repo): add a security policy`, with no em dashes. Agents add a `Co-Authored-By` trailer naming themselves.
- **Evidence trailers.** A push must carry the matching trailer in one of its commit messages, and `node scripts/check-rules.mjs trailers origin/main HEAD` checks it before you push:
  - `Legal-Check: N verified, M fixed, 0 open` when text, documentation, assets or dependency files change ([skills/text-rights-and-legal-check.md](skills/text-rights-and-legal-check.md));
  - `Review: <reviewer>: <result>` (or `Review: self-review: <reason>`) when native code, workflows, hooks or the constitution change;
  - `Database-Review: ...` for schema or migration files;
  - `Dependency-intake: <name>: ...` when a dependency is added or changed (`node scripts/check-rules.mjs deps origin/main HEAD`).
- **Specs and docs.** Application behaviour changes update [master-spec.md](master-spec.md) in the same change, and a non-trivial feature gets a spec in `spec/` first ([skills/pdlc-playbook.md](skills/pdlc-playbook.md)).

[documentation/REPO_SETUP.md](documentation/REPO_SETUP.md) lists every governance file in the repository and what enforces it. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and follow the [code of conduct](CODE_OF_CONDUCT.md) in issues and discussions.

## Autonomous contributions

Agents use the shared claim, lease, verification, and direct-main workflow in [AGENTS.md](AGENTS.md). No pull request or human merge is required. Each worker uses an isolated checkout, owns one roadmap item, reviews/tests its changes, and handles available CI results. Limited CI environments follow [the verification decision table](skills/verification-suite.md).

Keep changes focused and update relevant documentation. Do not add telemetry, account requirements, or dependencies that conflict with the product rules. Instruction changes and historic reviews use the same claims as implementation work.
