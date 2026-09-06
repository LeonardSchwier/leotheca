<!--
PROJECT VARIABLES
IDENTITY_CONFIG = ../CONSTITUTION.md (project_name, app_id, workspace_settings_dir)
MISSION = Free, open-source, offline Markdown viewer/editor using user-owned plain files
LICENSE_FILE = ../LICENSE (MIT)
PHILOSOPHY_FILE = ../PHILOSOPHY.md
PLATFORMS = Linux first; Android API 29+; macOS; Windows
FRONTEND = TypeScript, Preact, @preact/signals, CodeMirror 6
DESKTOP = Tauri, Rust
ANDROID = Capacitor, Java, Storage Access Framework
ANDROID_CHANNELS = F-Droid, Obtainium via repository releases
LINUX_CHANNELS = AppImage, Flatpak via Flathub
MACOS_CHANNEL = Homebrew
WINDOWS_CHANNEL = Direct repository release downloads
COMPETITOR_1_LABEL = Market Solution #1
COMPETITOR_2_LABEL = Market Solution #2
DEFERRED_CAPABILITIES = Encryption/key management; execution of third-party plugin code
-->

# Product and engineering rules

Use the profile variables above and the identity variables in the constitution. They hold project-specific choices so a copied repository can replace its profile without rewriting its agent workflow. These rules preserve the existing product decisions; the constitution governs the delivery process.

## Product boundaries

- Follow MISSION and PHILOSOPHY_FILE. Notes stay plain Markdown in user-owned folders. No paid tier, proprietary storage, lock-in, required accounts, telemetry, analytics, crash reporting, hosted sync, or app-initiated network calls.
- Preserve offline enforcement: bundled assets only, strict CSP, no Android INTERNET permission. Never add an HTTP client, remote fonts/scripts, update checker, feature-flag fetch, or background calls. A deliberate external link opens the user's browser. Embedded remote images must not auto-load, including tracking pixels.
- External developer tooling may fetch source, dependencies, documentation, or CI logs. The app's offline rule does not prohibit agents using development tools.
- The owner has not authorized DEFERRED_CAPABILITIES as autonomous product additions. Do not implement or repeatedly request approval for them; record an out-of-scope/blocked item and continue eligible work. Do not invent a design authorization from an old backlog entry.
- Preserve target platforms and channels from the profile. Dependencies must be real, license-compatible, free-software compatible for source-built distribution, and free of undeclared proprietary blobs/SDKs. Source builds and generated offline dependency manifests must be reproducible.
- Use the fixed COMPETITOR labels in prose. Do not insert competitor product/company names in code, comments, commits, issues, or documentation. Literal technical URLs and dependency/tool identifiers needed for build instructions remain literal.
- New features queued through the optional competitor scan need a setting to turn them off. Do not reprioritize existing work just because another product shipped something.

## Engineering conventions

- Keep the shared frontend and thin native bridges. Read the configured architecture file before changing contracts, module boundaries, storage, platform dispatch, or build paths; update it in the same change.
- Match existing language conventions: camelCase variables/functions in the frontend, PascalCase types/components, SCREAMING_SNAKE_CASE true constants; snake_case Rust functions/variables. Component and file names match.
- Keep changes scoped and simple. Reuse the authoritative mapping, parser, store, or coordinator instead of adding a competing one. Inspect actual installed types/APIs before using them.
- Non-trivial logic gets behavior tests. Verify error handling and empty/boundary inputs deliberately. Fix the cause of failures; do not hide them with weaker assertions or broader mocks.
- Treat Markdown, persisted data, file paths, and IPC input as untrusted. Preserve HTML sanitization, workspace containment, atomic writes, native permission boundaries, and runtime decoding. Never suppress a security check to make a feature work.
- Corrupt or future-version user data must remain recoverable; do not silently overwrite it. Persistence changes must test real startup/save/transition behavior as well as codecs, following the persistence skill.
- Async work must handle supersession, cancellation, cleanup, stale workspace/note state, and failed writes. Test the integration boundary that chooses whether to read or skip work, not only the pure helper it calls.
- Startup, folder open, and navigation must stay fast for large folders. Do not add file-content caching that can go stale when an external sync tool edits notes. Measure performance changes against a representative baseline.
- UI must be deliberate and consistent: both light and dark themes, keyboard navigation, accessibility, compact/Android behavior, and loading/error/empty states. No gratuitous gradients, generic sparkle/robot decoration, or arbitrary component patterns.
- Write comments, docs, and commits in clear English. Comments explain why. No em dashes, marketing hype, or claims of device testing that did not happen.

## Documentation, versions, and history

Update user-facing release notes for behavior changes and technical docs when their claims change. Version metadata must agree with the configured version check. Preserve versioned release/tag behavior and the separate rolling prerelease channel; process changes do not authorize publishing new stable releases or fabricating signing keys.

The configured decisions file preserves history. Record new architectural decisions with reasons; never use an archived workflow rule to restore a human gate. Commit messages identify the task, why it changed, and actual verification. Attribute the real agent/tool when its identity is known; never attribute another provider or fabricate a person's authorship.
