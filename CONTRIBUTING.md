# Contributing to Leotheca

Read [CONSTITUTION.md](CONSTITUTION.md) before opening an issue or pull request. It records the project rules, product principles, and coding conventions. See [ARCHITECTURE.md](ARCHITECTURE.md) for how the codebase is structured before making a non-trivial change.

## Development setup

Install a current Node.js LTS release, Rust through [rustup](https://rustup.rs/), and the Linux packages required by the desktop shell.

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

Install JavaScript dependencies and start the desktop app:

```sh
npm install
npm run tauri dev
```

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

From the repository root, run:

```sh
npm test
npm run lint
npm run build
```

Run Rust tests from the desktop-shell directory:

```sh
cd src-tauri
cargo test
```

## Pull requests

Keep each pull request focused. Describe what changed and why, include the commands used to test it, and update relevant documentation when a change affects building, running, or contributing. Do not add telemetry, account requirements, or dependencies that conflict with the project's distribution constraints.
