# Security policy

## Supported versions

Leotheca ships as a rolling release: every push to `main` rebuilds all artifacts and republishes them as the [`dev-build` release](https://github.com/LeonardSchwier/leotheca/releases/tag/dev-build). There are no versioned releases at the moment, so only the current `main` and the latest `dev-build` are supported. A fix lands on `main` and reaches users with the next rolling build; older builds are not patched.

## Reporting a vulnerability

Please report privately, not in a public issue or pull request.

1. Open the [Security tab](https://github.com/LeonardSchwier/leotheca/security) of the repository.
2. Choose **Report a vulnerability** and describe the problem: the affected platform and build, the steps to reproduce, and the impact you expect.

GitHub private vulnerability reporting is a repository setting. If the **Report a vulnerability** button is not shown, the setting is still off. In that case open a public issue titled "Security contact request" that contains no technical details, and the maintainer will arrange a private channel.

## What is in scope

Leotheca is built to run locally and without a network. It stores notes as plain Markdown files in a folder the user chooses, has no accounts, no telemetry, no sync service and no update checker, and the Android build does not request the `INTERNET` permission (see `documentation/PROJECT_RULES.md`). Reports about the following are in scope:

- Reading or writing files outside the folders the user opened, including path traversal through the native commands in `src-tauri/` or the Android bridge in `android/`.
- Script execution from note content: Markdown or HTML rendering, embedded diagrams, attachments, or links that bypass the sanitiser or the content security policy in `src-tauri/tauri.conf.json`.
- Any network request the app makes on its own, which would break the design above.
- Exported Android components, intent filters or file providers that expose note data to other apps.
- Secrets or credentials committed to this repository, and weaknesses in the build, release or CI workflows that could alter published artifacts.

Android release signing: published Android APKs are signed only with a maintainer-held release key stored as repository secrets. Earlier `dev-build` APKs were signed with the public debug key committed in `android/debug.keystore`; treat any such APK as untrusted and uninstall it. The release workflow now publishes no Android asset when the key is absent and fails if an APK carries the debug certificate. See `packaging/STATUS.md` for the key set-up.

Out of scope: vulnerabilities that need a device the attacker already controls (for example, root access to the user's files), issues in third-party dependencies with no demonstrated effect on Leotheca (report those upstream), and the unsigned macOS and Windows installers, which are a documented limitation in the README.

## What to expect

Leotheca has one maintainer and a set of automated agents, and no security team or paid service. The maintainer aims to acknowledge a report within a week, but this is a goal and not a guarantee. Fixes are prioritised by impact and land on `main` directly; the roadmap in `ROADMAP.md` tracks the work. After a fix is released the report can be disclosed, and reporters who want to be credited will be named in the changelog. There is no bug bounty.
