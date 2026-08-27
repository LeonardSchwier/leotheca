# Project Constitution

This file is the single source of truth for any coding agent, AI or human, working in this repository. It exists so that decisions and conventions stay consistent across different tools (Claude Code, Codex, or any other assistant) and across different sessions of the same tool, none of which share memory with each other by default.

If you are an AI coding agent starting work in this repository, read this file in full before making changes. If something you are about to do conflicts with a rule here, follow this file, not your own default behavior. If a rule here seems to block a reasonable change, ask the maintainer rather than silently overriding it.

Project name: **Leotheca**

## What this project is

A free and open source markdown viewer and editor, aimed at the same job as the well known proprietary note-taking applications built around local markdown files and a live-preview editor, but fully open source, with no telemetry, no required account, and no proprietary sync service. See the "Naming and trademark discipline" section below for how to talk about that comparison without creating a trademark problem.

Target platforms, in order of priority: Linux desktop, then Android, then macOS and Windows. "Linux desktop" means all major distributions (Arch, Debian/Ubuntu, Fedora, and others), not one distro specifically, which is exactly why the packaging targets are AppImage and Flatpak rather than a distro-specific package. macOS and Windows support is confirmed intended, not just "maybe later", see Distribution channels below for how each will ship.

Minimum Android target: API 29 (Android 10), the OS version a Google Pixel 4 originally shipped with.

License: MIT (see `LICENSE`).

The three-principle mission statement behind all of this lives in `PHILOSOPHY.md`. Read it once; it rarely changes and explains the "why" behind the rules in this file.

## Distribution channels

These are hard constraints on implementation choices, not just release logistics.

- **Android: F-Droid.** F-Droid's build server compiles the app from source itself; it does not accept bundled proprietary binary blobs, non-free SDKs (no Google Play services, no Firebase, no proprietary crash/analytics SDKs), or network calls to fetch anything undeclared during the build. Any dependency added to the Android build must be checked against this before it is added.
- **Android: Obtainium.** Obtainium installs APKs directly from a source it polls for new releases, typically GitHub Releases. This has no effect on tech stack choice, but it does mean release tags and attached APK assets must follow a consistent, predictable versioning scheme every release, with no manual naming drift.
- **Linux: both AppImage and Flatpak**, built from the same source. Flathub is the intended home for the Flatpak build once the project is ready to submit there, not just a self-hosted `.flatpak` file.
- **macOS: Homebrew** (a formula or cask), once a macOS build target exists. No Mac App Store.
- **Windows: direct download from GitHub Releases only.** No Microsoft Store, no winget, no Chocolatey, unless that changes later.
- Play Store distribution is out of scope for now. This is not a decision against it forever, just not a target for the initial waves.

## Offline by design

Leotheca makes zero network calls, on any platform, under any circumstance. This is a hard, permanent constraint on implementation choices, not a preference, and not something a future feature can be judged into an exception for. See also "High-risk feature categories" below, which treats sync and telemetry/network calls on this same permanent footing.

- No telemetry, analytics, crash reporting, or usage tracking of any kind, ever. Already a hard no per `PHILOSOPHY.md` and the Decisions Log, restated here as the anchor for the broader rule below.
- No network call the app itself initiates, for any reason: no update checker, no font or script loaded from a CDN, no fetch/XHR/WebSocket to any first- or third-party service, no "phone home" of any kind, even anonymized, even opt-in, even for something that sounds harmless on its own (a version check, a feature-flag fetch, an error report). If a feature needs a network call to work at all, it does not belong in this app. This is not a "needs the maintainer's sign-off" category the way encryption or accounts are below, it is simply out of scope, permanently.
- A note's own markdown content referencing a remote URL (a link, an image) is the user's own content, not the app calling out on its own. Clicking a link is a deliberate user action that opens it in the user's own default browser, not something the running app does in the background. Remote images embedded in a note are deliberately never auto-loaded (enforced by the Content-Security-Policy below): a remote image can work as a tracking pixel, so silently loading one on the user's behalf would violate the rule above even though the app is "just rendering what the note says." A future opt-in "load remote images in preview" toggle isn't ruled out in principle, but is itself a new decision needing the maintainer's own explicit sign-off, the same as any other privacy-relevant toggle would.
- Enforced technically, not only by convention: `index.html`'s Content-Security-Policy meta tag restricts every fetchable resource type to `'self'` (the app's own bundled files) plus the local asset/data schemes screenshots and embedded local images actually need (`asset:`, `https://asset.localhost`, `data:`, `blob:`), and blocks any other `http(s)://` request outright. It is shared by both platform shells (Tauri desktop and Capacitor Android both load the same built `index.html`), so it doesn't need separate enforcement per platform. The Android build requests no `INTERNET` permission at all (removed 2026-08-27; it was an unused default from the Capacitor project template, not something the app used).
- A dependency review before adding anything new to `package.json` or `src-tauri/Cargo.toml` (see "Reproducibility and supply chain hygiene" below) must treat "does this reach the network" as a hard blocker on its own, not just a fact to note: no HTTP client (`tauri-plugin-http`, `reqwest`, a Capacitor HTTP or Push Notifications plugin), no analytics/crash-reporting SDK, no font or asset pulled from a CDN at runtime, ever gets added, regardless of how useful the rest of the package is.

## Naming and trademark discipline

This is a hard rule, not a style preference.

- Never write the name of any other note-taking application, proprietary or otherwise, anywhere that ships: source code, code comments, commit messages, pull request titles or descriptions, issue text, README or other documentation, in-app strings, store listings, or marketing copy.
- Use neutral, generic terms instead: "workspace" or "vault folder" for a user's local notes folder, "community plugin" for third-party extensions, "compatibility layer" for any code that reads another ecosystem's plugin or file conventions.
- It is fine to say the project supports common conventions from that space (plugin manifest formats, wikilink syntax, frontmatter conventions) without naming the product those conventions originated from.
- If you are unsure whether a specific phrase is safe, prefer the more generic phrasing, or ask.

## Writing style for anything checked into this repository

- No em dashes ( — ) anywhere: not in code comments, commit messages, documentation, or UI copy. Use a comma, a period, or a parenthetical instead.
- Prefer clear, direct sentences over marketing language. Avoid hype words ("revolutionary," "seamless," "supercharged") and empty AI-generated-sounding filler.
- Documentation should say what is true now, not what is aspirational, unless it is explicitly a roadmap document.

## Design bar

The look and feel target is premium and deliberate, not a default component-library template. Concretely:

- No gratuitous gradients, no generic sparkle/robot iconography, no stock dashboard layouts copied wholesale.
- Typography, spacing, color, and motion should look like they were chosen on purpose for this product.
- When implementing UI, favor a small number of well-considered, consistent patterns over many inconsistent ad hoc ones.
- Both a light and a dark theme are first-class, not one built and the other auto-inverted without review.

## Technology stack

- **Shared editor and UI layer**: TypeScript, built around CodeMirror 6 as the text-editing engine. CodeMirror 6 is, at the time of this decision, the only editor toolkit mature enough to deliver true inline live-preview markdown editing (formatting rendered inline while typing, not a separate raw/rendered toggle) at a premium quality bar. This is the hardest single technical component of the whole project, so the choice of editor toolkit drove the rest of the stack rather than the other way around.
- **Linux desktop shell**: Tauri (Rust). Tauri renders the shared UI layer through the operating system's own webview instead of bundling a full Chromium runtime, which keeps the binary small, startup fast, and memory use low compared to an Electron-style shell. Native, performance- or filesystem-sensitive logic (workspace indexing, search, file watching) lives in Rust.
- **Android shell**: Capacitor. Capacitor wraps the same shared UI layer in a standard Gradle Android project with native plugins for filesystem access (Storage Access Framework) and other device integration. A standard Gradle build is exactly what F-Droid's build server already knows how to compile reproducibly from source, and Capacitor ships no proprietary SDKs.
- **Why one frontend for both shells**: sharing the actual UI and editor code, not just abstract business logic behind two separate native UIs, is what keeps maintenance cost low across Linux and Android, which was an explicit requirement. The two shells differ only in their thin native integration layer.
- **Known risk to watch**: webview-shell Android apps sometimes draw extra scrutiny in F-Droid review as "just a wrapped website." This project mitigates that by being local-first with real native plugins (filesystem access, folder picker) and by loading no remote content at all, which is a real, substantive difference from a wrapped website and should be stated plainly if it ever comes up during F-Droid inclusion review.
- The exact frontend framework used inside the shared UI layer (or no framework, i.e. vanilla TypeScript plus CodeMirror) is an implementation detail to be settled when work on it starts, not a foundational decision, and does not need a maintainer sign-off the way the choices above did.

## Engineering practices

This project is held to normal professional engineering standards, not "good enough for a hobby project" standards, regardless of whether a change is written by a human or an AI agent.

- **Testing**: non-trivial logic (markdown parsing edge cases, link resolution, search indexing, file I/O, the compatibility layer once it exists) gets automated tests alongside the code that introduces it, not added later as an afterthought. UI-heavy code that cannot be reasonably unit tested should still get the manual verification steps recorded in the pull request.
- **Coding standards, so the codebase reads like it came from one author**: identifier casing follows each language's own idiom, applied consistently rather than mixed within a file. TypeScript/Preact: camelCase for variables and functions, PascalCase for components, types, and interfaces, SCREAMING_SNAKE_CASE for true module-level constants (lookup tables, regexes, fixed config values). Rust: snake_case for functions and variables, PascalCase for types and structs. A component's exported name matches its file name (`FileTree.tsx` exports `FileTree`). Doc comments: an exported function or type that needs explaining gets a `/** ... */` block in TypeScript or a `///` block in Rust, directly above it; a module-level constant or signal that needs explaining gets a plain `//` comment above it instead, reserving the doc-comment block for the things callers actually look up when using the API. Comments explain *why* (a non-obvious constraint, a workaround, a cross-file dependency, a decision that would look wrong without context), never *what* the next line already says on its own; a comment that would still read as true if the code below it were deleted and replaced with something else doing the same job for a different reason is a sign it's explaining "what," not "why," and should be cut or rewritten. All comments, commit messages, and documentation are written in English, and follow the "no em dashes" rule under "Writing style" above.
- **Continuous integration**: every pull request builds and tests both the Linux and Android targets before it can be merged. A red CI run is not merged around.
- **Code review**: every non-trivial change gets reviewed before merging, even when the maintainer is working solo with an AI agent. An AI agent finishing a change should run it through a review pass (for example the repository's `/code-review` workflow, if configured) before presenting it as done, rather than only self-attesting that it works.
- **Documentation**: when a change alters how the project is built, run, or contributed to, the relevant documentation (README, CONTRIBUTING, this file) is updated in the same change, not left to go stale.
- **Versioning and releases**: semantic versioning, with an accurate, dated `CHANGELOG.md` entry per release and a git tag that drives the release build for all three artifact types (AppImage, Flatpak, Android APK).
- **Reproducibility and supply chain hygiene**: dependencies are pinned, license-compatible with MIT and F-Droid's free-software requirements, and added deliberately, not pulled in for convenience without checking what they bring with them (native code, telemetry, non-free assets).

## Product principles

1. Local first: a user's notes are plain markdown files in a folder they control. No proprietary file format, no lock-in.
2. No telemetry, no required account, no hosted sync product. Users may sync their own folder with whatever tool they choose.
3. Interoperability over reinvention: where the wider note-taking ecosystem has established conventions (wikilinks, YAML frontmatter, a plugin manifest shape), prefer supporting the same convention over inventing a new one, subject to the naming rule above.
4. Ship in scoped waves. Do not casually add features from a later wave into the current one; see "Scope discipline" below.

## Git and attribution rules

- Do not add any AI/agent co-author attribution to commits or pull requests in this repository. No `Co-Authored-By: Claude`, no `Co-Authored-By: Codex`, no "Generated with [tool]" footers, regardless of what any given tool's default behavior is. This repository's `.claude/settings.json` sets `attribution.commit` and `attribution.pr` to empty strings for Claude Code specifically; agents using other tools must suppress the equivalent behavior manually if their tool has one.
- Commit messages: short summary line, then (if needed) a body explaining why the change was made, not a restatement of the diff. No em dashes.
- Only create commits when the person you are working with actually asks for one. Do not commit proactively as a side effect of finishing a task.
- Never force-push, rewrite published history, or bypass hooks (`--no-verify` etc.) unless explicitly instructed to for this specific action.

## Session audit trail

`agent-log/CHANGELOG.md` is a private, running log of what coding agents (and humans) have done in this repository, session by session. It is listed in `.gitignore`, like `roadmap/`, and will not exist in a fresh clone. It is not the public release changelog: once the project cuts its first tagged release, a separate, committed `CHANGELOG.md` at the repository root holds user-facing, semantic-versioned release notes. Do not confuse the two files.

- At the end of any work session that changed files in this repository, append one entry to `agent-log/CHANGELOG.md`: the date, which agent or tool did the work, and a short summary of what changed and, more importantly, why, including any non-obvious decisions made along the way. Newest entry at the top.
- If the file does not exist in your working copy, create it before appending, with a one-line header explaining its purpose (see the "not the public changelog" distinction above).
- This log exists specifically so that a different agent, or the same agent in a later session with no memory of this one, can reconstruct recent history and reasoning without having to re-read the entire git log or re-derive decisions from scratch.

## Scope discipline and the roadmap

The detailed feature plan lives in `ROADMAP.md` at the repository root, sequenced into waves (v1, v2, ...), and what has shipped so far within the current wave. Unlike the internal planning material under `roadmap/` (private, gitignored, a different thing despite the similar name), `ROADMAP.md` is public and committed, always present in any clone.

- Read `ROADMAP.md` to understand which wave is current and what is explicitly in or out of scope for it.
- Do not implement features from a future wave "while you're in there." If a change naturally requires touching something out of scope, flag it rather than expanding the task silently.
- The `roadmap/` directory (lower case, gitignored) holds private, tactical, agent-facing planning material (currently `roadmap/agent-coordination.md`), not the feature plan itself. Do not confuse the two.

### Daily competitor feature scan

Once per day, an agent (autonomous loop or scheduled) should check Joplin's and Obsidian's public changelogs for genuinely new features shipped since the last check — not bug fixes, not performance work, only new functionality:

- Joplin desktop changelog: https://joplinapp.org/help/about/changelog/desktop/
- Obsidian changelog: https://obsidian.md/changelog/

For each new feature found, judge it against `PHILOSOPHY.md`'s three principles (free and open source without compromise; stand on the shoulders of giants rather than invent a competing convention where a good one already exists; the user's notes belong to them, plain files, nothing proprietary) before deciding it's worth pursuing. A feature that fits is appended to the bottom of `ROADMAP.md` (queued for a future implementation pass, not jumped to the front of any wave, and not implemented on the spot as part of this scan) with a one- or two-line note on what it is and why it fits. When a queued item like this is later actually implemented, it must ship with its own settings toggle to turn it off — net-new functionality here is opt-out by default, not something imposed on every user unconditionally.

**Auto-reject, never queue, no exceptions: anything that is or requires hosted sync.** This isn't a case-by-case philosophy judgment call — "no hosted sync product, ever" is already a permanent standing decision (see the Decisions Log), not something deferred for later consideration. If Joplin or Obsidian ships a sync-related feature (their own sync service, a new sync protocol, sync-adjacent conveniences like conflict resolution UI for a sync feature this project doesn't have), skip it entirely — don't add it to `ROADMAP.md` even as a rejected/considered note, since it isn't actually a live decision to revisit.

See "High-risk feature categories" below: telemetry and any network call are auto-rejected the same permanent way sync is (see "Offline by design" above), and encryption, accounts, and running third-party code never get queued or implemented without the maintainer's own explicit, specific sign-off. This scan should recognize and skip all of these, not just sync.

This scan is additive only: it never removes or reprioritizes existing roadmap items, and a day with nothing worth adding is a normal, silent outcome, not something that needs its own roadmap entry.

This runs as a scheduled cloud routine against the GitHub-hosted repo, so it needs that repo to actually have real content pushed to it first (not yet true as of 2026-08-27 — only the bare initial commit is on GitHub so far). Once the maintainer gives the go-ahead to push, set the routine up to commit and push its `ROADMAP.md` addition directly — the maintainer has explicitly said they don't have time to review a daily PR for this, so no PR/review gate here, unlike most other changes to this repository.

### High-risk feature categories

Some feature categories never get auto-queued (by the competitor scan above) or auto-implemented (by the daily feature-implementation routine below), regardless of how well they'd otherwise score against `PHILOSOPHY.md` — they need the maintainer's own explicit, specific sign-off first, given directly to a session working on that specific feature, not inferred from this file being silent about it:

- **Sync, in any form.** Already a hard, permanent no per the Decisions Log ("no hosted sync product will be built, ever"), not a judgment call — see the competitor scan section above.
- **Telemetry, analytics, or any network call whatsoever.** Already a hard, permanent no, same footing as sync, not a judgment call and not a "needs sign-off" item like the two entries below it. See "Offline by design" above: there is no sign-off that makes this acceptable, if a feature needs a network call to work at all, it does not belong in this app.
- **Encryption / cryptography** (note encryption at rest, end-to-end encryption for any future sync-adjacent feature, password-protected notes, anything handling keys or secrets). Getting this subtly wrong doesn't fail loudly, it silently produces notes a user can no longer read or can be brute-forced open — too high a blast radius for a fully unsupervised routine to own the design decisions here.
- **Accounts or authentication of any kind.** Already a hard no per the Decisions Log.
- **Running third-party or plugin code** (the eventual v3 compatibility layer). Even once v3 is actually in scope, the security model for executing someone else's code needs the maintainer's own design sign-off before an autonomous routine implements it — this is a standing exception to "just follow the work order."

None of this means "never build these" forever for every entry here. Encryption in particular is a reasonable thing a future version of this app could want. Sync and telemetry/network calls are the exception to that: both are permanent, not "not yet decided." Concretely: if the competitor scan sees sync or a telemetry/network-call feature, skip queueing it entirely, don't add it to `ROADMAP.md` even as a rejected/considered note; if it sees encryption, accounts, or third-party code execution, queue it but flag prominently in the `ROADMAP.md` entry that it needs the maintainer's explicit sign-off before implementation, not the routine's own judgment. If the feature-implementation routine's work order ever contains a sync or telemetry/network-call item, skip it permanently the same way (there is no sign-off to wait for); for encryption, accounts, or third-party code execution, it stops and records that it's blocked on maintainer sign-off rather than implementing its own best guess at the design.

### Daily automated feature implementation

Four times a day (roughly every 6 hours, session 57), a scheduled cloud routine implements real work from `ROADMAP.md`, so the project keeps moving even when nobody is actively driving it. Every run:

1. Reads this file in full, then `AGENTS.md`, then `PHILOSOPHY.md`, then `ROADMAP.md` — fresh each time, not from anything baked into the routine's own prompt, since all four can change between runs.
2. Follows the standing work order from this file's Decisions Log (currently: v2, then v4, then the Joplin/Obsidian backlog, then "Moved from v1", falling through to v3, then v5, then v6+, then the "very late" backlog items only once that primary order is genuinely fully shipped — check the log for the current, possibly-revised order rather than trusting this summary). Picks the next not-yet-shipped item in that order. Does not jump ahead to a later wave or section while anything earlier in the order still has open items, even opportunistically.
3. Implements it following this file's engineering practices and `AGENTS.md`, held to a genuinely high bar since **no human reviews this before it lands on `main`** and this routine has no physical device to catch what automated checks can't: real tests for every non-trivial branch of logic, not just the happy path (edge cases, error paths, empty/boundary inputs); the full project verification suite (`tsc --noEmit`, `vitest run`, `cargo test`, `vite build`, and `cargo check`/`clippy` where applicable) green before anything is presented as done, not just "it compiles"; a genuine self-review of the diff against this file's rules, the way a careful senior engineer reviews a colleague's PR, not a rubber stamp. **The bar is production-ready code, full stop** — not a prototype, not "good enough for a first pass," not something that needs a follow-up cleanup session before it's trustworthy. If a change can't be brought to that bar within one run (the testing is inherently incomplete, a dependency genuinely can't be verified, anything else that would make "production-ready" dishonest to claim), it does not get committed as finished — either keep working within the same run, or record it plainly as incomplete/blocked in `ROADMAP.md` and the changelog and move on, never paper over a real gap to make a day's run look more complete than it is. For a bug fix specifically, the revert-confirm-restore discipline described elsewhere in this file applies — a claimed fix without a test that actually failed beforehand isn't a verified fix. For anything touching Android specifically: this routine has no phone to test against, so lean harder on Rust/TypeScript unit tests, code review against the platform's documented behavior, and being explicit in `ROADMAP.md` about what's implemented-but-device-unverified — never claim on-device confirmation that didn't happen.
4. Updates `ROADMAP.md`'s shipped/open lists and appends a dated entry to `agent-log/CHANGELOG.md`, same as any other session's work.
5. **Commits and pushes directly to `main` after each individual item finishes** (not batched until the end of the run) — the maintainer's explicit call, made specifically so a run that ends early for any reason (out of turns, an error, anything else) never loses already-finished, already-verified work. If only partial progress on an item is possible in one run, that's fine; leave it for the next day's run to continue, noting the state clearly in `ROADMAP.md`/the changelog rather than committing something half-working.
6. **Does not stop after one item.** Finishing and pushing one item is not the end of the run, it's the end of one iteration: immediately re-read `ROADMAP.md` (it just changed) and pick the next not-yet-shipped, unblocked item in the work order, same as step 2, and keep going, committing and pushing after each one lands. Only stop when genuinely out of session budget, or genuinely out of unblocked items to work on (see point 7 below), not because one item "felt like enough" or because stopping to report progress seemed natural. Nobody is watching this run happen; a summary nobody reads is worth nothing next to another shipped, verified item.
7. If genuinely blocked on something only the maintainer can unblock (a decision, a credential, physical device access), record that plainly (in `ROADMAP.md` and the changelog) and move to the next available item rather than stalling the whole run on it.
8. **A bug noticed while working, but out of scope for the item actually being implemented**: if it's small enough to fix in passing without meaningfully expanding the change (a one-line off-by-one, a clearly-wrong error message), fix it as part of the same commit and say so in the commit message and changelog. If it's genuinely large in scope, e.g. a design-level issue, something spanning multiple files or subsystems, anything that would turn "implement this one roadmap item" into "also redesign this other thing", do not attempt to fix it in this run. Instead, add a short, clearly-flagged entry to `ROADMAP.md`'s **"Flagged bugs" section, at the very top of the file** (not the bottom, unlike the competitor-scan queue below), describing the bug and where it was noticed, so it gets picked up with priority on a future run or by the maintainer, then continue with the actual item this run is working on.

Standing constraints that apply here same as everywhere else in this file: no `git commit`/push of anything that doesn't pass the full verification suite, no force-push or history rewriting, no fabricated credentials, no breaking dependency upgrades without prior explicit maintainer go-ahead, no `flatpak-builder`/GNOME-runtime triggers, no destructive git operations, and **no implementing anything from the "High-risk feature categories" list above (sync, encryption, telemetry/new network calls, accounts, third-party code execution) without the maintainer's own explicit sign-off already recorded in this file** — if the work order's next item falls into one of those categories, stop and record that it's blocked on maintainer sign-off, don't implement your own best guess at the design. This routine has no access to the maintainer's physical Android device — anything that genuinely needs on-device verification gets implemented and tested as far as automated means allow, then flagged as needing the maintainer's own hands-on confirmation, not skipped silently and not guessed at.

## Decisions Log

This section is the append-only record of decisions that future agent sessions must not re-litigate or contradict. When a genuinely new architectural or scope decision is made with the maintainer, add an entry here, dated, with a one-line reason. Do not remove old entries; if a decision is later reversed, add a new entry that supersedes it and say so explicitly.

- 2026-08-26: Project uses the MIT license.
- 2026-08-26: Target platforms for the initial wave are Linux desktop (all major distributions) and Android only.
- 2026-08-26: No hosted sync product will be built; users bring their own sync mechanism.
- 2026-08-26: AI/agent co-author attribution is disabled for this repository (see "Git and attribution rules" above).
- 2026-08-26: Project name is final: Leotheca.
- 2026-08-26: Android distribution targets are F-Droid and Obtainium (via GitHub Releases); Google Play is out of scope for now. Minimum Android target is API 29 (Android 10).
- 2026-08-26: Linux packaging targets are both AppImage and Flatpak.
- 2026-08-26: Technology stack decided: Tauri (Rust) for the Linux desktop shell, Capacitor for the Android shell, both hosting one shared TypeScript frontend built around CodeMirror 6. Full rationale in "Technology stack" above.
- 2026-08-26: Frontend framework inside the shared UI layer is Preact plus `@preact/signals`, chosen for small bundle size and low overhead. Unlike the choices above, this one can be revisited without a maintainer sign-off if it turns out to be wrong.
- 2026-08-26: App identifier (Tauri `identifier`, and future Android `applicationId`) is `com.leonardschwier.leotheca`.
- 2026-08-26: Scope directive: implement the full backlog, then complete waves v1, v2, and v4 in full. Wave v3 (community plugin compatibility layer) is explicitly deferred. This is a standing exception to the normal "don't pull in future-wave features" scope discipline rule, scoped only to items actually tracked in `ROADMAP.md`. (`ROADMAP.md` did not exist yet when this decision was first made, the backlog it referred to lived in the now-deleted private `roadmap/backlog.md` and `roadmap/featureset.md`, merged into `ROADMAP.md` later the same day.)
- 2026-08-26: Confirmed future platform scope: macOS (distributed via Homebrew) and Windows (distributed via direct GitHub Releases download only, no package manager or store) are intended platforms, not hypothetical. No build target exists for either yet.
- 2026-08-27: A daily automated scan of Joplin's and Obsidian's changelogs for new (not bug-fix) features is a standing process, see "Daily competitor feature scan" above. Worthwhile finds get queued at the bottom of `ROADMAP.md`, not implemented immediately by the scan itself; anything later built from that queue ships with its own settings toggle.
- 2026-08-27: Refines (does not reverse) the 2026-08-26 scope-order decision above, now that `ROADMAP.md` has sections that didn't exist yet at that entry's time. Standing work order for anything past v1, most-priority first: **v2, then v4, then the "Backlog: from the Joplin/Obsidian comparison" section, then the "Moved from v1" items under "Beyond v1"**. Applies to any agent or session picking up work from `ROADMAP.md`, including the daily feature-implementation routine (see "Daily automated feature implementation" below) — re-read this entry rather than assume a stale copy of the order, in case a future maintainer decision changes it again.
- 2026-08-27: Supersedes this same day's entry above on one point: once every item in that primary order (v2, v4, the Joplin/Obsidian backlog, "Moved from v1") is actually shipped — not just mostly done, genuinely nothing left in any of those four — work continues into **v3, then v5, then v6+, then finally the two "very late in this backlog" items (web clipper, Obsidian-style scroll-to-zoom)**, in that order, rather than the routine sitting idle with nothing to do. This still isn't a license to jump ahead opportunistically while the primary order has anything left in it — the fallthrough only applies once it's truly exhausted.
- 2026-08-27: A daily automated routine implements items from `ROADMAP.md` (following the work order above and the engineering practices in this file and `AGENTS.md`), one item — or as much of one item as fits in a session — at a time, committing and pushing directly to `main` after each completed item (no PR gate, the maintainer's explicit call, same as the changelog scan), specifically so a session that ends early for any reason never loses already-finished work. See "Daily automated feature implementation" below for the full policy.
- 2026-08-27: The feature-implementation routine fires four times a day (roughly every 6 hours: 05:00, 11:00, 17:00, 23:00 UTC), not once, to make better use of daily usage budget — the maintainer's explicit call. The competitor-changelog-scan routine moved to 04:00 UTC, an hour ahead of the feature-implementation routine's first daily run, so anything it queues that day is already in `ROADMAP.md` before that run starts.
- 2026-08-27: Sync (any form) is auto-rejected by the competitor changelog scan, never queued — this isn't a new decision, it makes explicit that the existing "no hosted sync, ever" decision applies there too, since a maintainer question revealed this wasn't obviously guaranteed by the scan's general "judge against `PHILOSOPHY.md`" instruction alone. Also established: encryption, telemetry/new network calls, accounts, and third-party code execution are "High-risk feature categories" (see that section above) that never get auto-implemented by the feature-implementation routine without the maintainer's own explicit sign-off, even if queued.
- 2026-08-27: The maintainer, live, made "no network calls of any kind, ever, the app runs 100% offline" an explicit, permanent, non-negotiable rule, superseding the softer "new network calls need sign-off" framing the previous entry above and the old "High-risk feature categories" wording used. See "Offline by design" (new top-level section, placed after "Distribution channels") for the full rule, and the updated "High-risk feature categories" section, which now treats telemetry/network calls the same permanent-no way it already treated sync, not as a sign-off category. Enforced technically as of this date via a Content-Security-Policy meta tag in `index.html` (shared by both platform shells) and removal of the Android build's unused `INTERNET` permission and its unused, inert Google Services/Firebase Gradle boilerplate (`android/build.gradle`, `android/app/build.gradle`); an audit of the rest of the codebase (dependencies, Rust file I/O, CI/release workflows, `marked` usage) found no other network-call surface.
- 2026-08-27: The maintainer, live, asked for consistent naming and comment conventions across the codebase, "so it feels like out of one hand." Codified as a new "Coding standards" bullet under "Engineering practices" above, describing the conventions the codebase already mostly followed (confirmed by an audit the same day: no non-English comments, no naming-convention outliers, component names matching file names) rather than inventing new ones; the audit's few small exceptions (two functions using a plain `//` comment where the rest of the codebase would use a `/** */` doc block) were fixed to match.
- 2026-08-27: The maintainer, live, clarified that the daily feature-implementation routine should keep working through multiple `ROADMAP.md` items in a single run rather than stopping after the first one lands, so a run's actual usage budget gets used, not just its first item; "Daily automated feature implementation" above now says this explicitly (step 6) rather than leaving it as a "continue if there's budget left" aside easy to read as optional. Also established the same day: if the routine notices a bug outside the scope of the item it's actually implementing, a small one gets fixed in passing, but a genuinely large one (spanning multiple files/subsystems, effectively a redesign) gets logged at the **top** of `ROADMAP.md`, not fixed on the spot and not silently ignored (step 8).

Nothing else should be treated as decided. In particular, exact F-Droid and Flatpak manifest metadata, the final visual design system, and the compatibility layer's precise scope are all still open.

## How to work in this repository (for any coding agent)

This section is written to be followed mechanically by any capable coding agent, not just one specific tool.

1. Read this file in full, then `PHILOSOPHY.md`.
2. Read `ROADMAP.md` at the repository root to find the current wave and what is in or out of scope.
3. Check whether `agent-log/CHANGELOG.md` exists and skim its most recent entries for context on very recent work that might not yet be reflected in git history you have reviewed.
4. Make the change, following the naming, writing style, design bar, and engineering practices rules above.
5. Before presenting a change as finished: run the project's build and test commands (see the root `package.json` scripts and, once it exists, `src-tauri/`'s `cargo test`) and self-review the diff for the rules in this file, the same way a careful senior engineer would review a colleague's pull request before approving it.
6. Append an entry to `agent-log/CHANGELOG.md` per the "Session audit trail" section above.
7. Only commit if explicitly asked to.
