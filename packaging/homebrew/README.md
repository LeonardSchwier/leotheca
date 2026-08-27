# Homebrew packaging

Status: **blocked earlier in the pipeline than the Flatpak/F-Droid packaging in this repository.** Those two have a real, working Linux/Android build to package — macOS doesn't have a build target at all yet (see `CONSTITUTION.md`'s Decisions Log, 2026-08-26: "macOS ... once a macOS build target exists. No build target exists for either \[macOS or Windows\] yet."). This directory is groundwork prepared ahead of that, per the maintainer's request (session 56), not something that can be submitted or even meaningfully tested yet.

## Formula or Cask?

`CONSTITUTION.md` leaves this open ("a formula or cask"). Resolved here: **Cask**. Homebrew Formulae are for command-line tools and libraries, typically built from source on the user's machine; Casks are for installing pre-built GUI macOS applications (`.app` bundles, usually from a `.dmg` or `.zip`/`.tar.gz`), which is what Leotheca is. This isn't a hard requirement to revisit, but every comparable desktop GUI app on Homebrew (and Tauri's own official docs for Homebrew distribution) uses a Cask, not a Formula.

## What's here

- `leotheca.rb`, a draft Cask definition with `TODO`-marked placeholders everywhere it depends on something that doesn't exist yet: the actual release artifact's filename/extension, its checksum, and a confirmed minimum macOS version. It is not valid to submit as-is.

## What has to happen before this is real

In order, each step blocking the next:

1. **A macOS build target.** Tauri supports macOS as a bundle target (`tauri.conf.json`'s `bundle.targets`, typically producing a `.dmg` and/or a `.app.tar.gz`), but this project has never built for it. This needs a `macos-latest` job added to `.github/workflows/release.yml` (parallel to the existing `linux` and `android` jobs) that runs `npx tauri build` on an actual macOS runner — cross-compiling from Linux is not realistically viable for a Tauri app given its native dependencies. No signing/notarization is required just to produce an artifact, but see the caveat below about what that means for end users.
2. **A real tagged release with that artifact attached**, the same prerequisite the Flathub and F-Droid submissions share (see `flatpak/README.md` and the F-Droid `README.md` in the sibling directory) — Homebrew needs a stable, versioned download URL and a checksum of the exact file at that URL, not a moving target.
3. **Decide the unsigned-build user experience.** Same Gatekeeper friction discussed when this was first raised with the maintainer: an unsigned/unnotarized `.app` downloaded via Homebrew still gets quarantined by macOS and needs a manual `xattr -cr` or right-click-Open the first time. Homebrew Casks can run a `postflight` block to remove the quarantine attribute automatically (`xattr -dr com.apple.quarantine`) — worth adding to `leotheca.rb` once real, so Homebrew installs are smoother than a raw manual download would be, but this doesn't eliminate signing/notarization as the actual long-term fix, only papers over it for Homebrew's specific install path.
4. **Fill in `leotheca.rb`'s placeholders** from the real release: `version`, `url`, `sha256` (`shasum -a 256 <file>` against the actual downloaded artifact), and confirm the minimum macOS version by actually testing on the oldest realistic target, not guessing.

## Submitting, once the above is real

Two paths, and which one first is a real decision, not just a formality:

- **Homebrew's official `homebrew-cask` repository** (`Homebrew/homebrew-cask`): wider discoverability (`brew install --cask leotheca` works immediately for anyone, no extra tap needed), but has [real acceptance criteria](https://docs.brew.sh/Acceptance-Criteria) — notably some notion of the project being notable/maintained (a specific GitHub star count isn't an official hard rule, but reviewers do look for signs of real usage) — that a brand-new project may not clear on a first attempt.
- **A dedicated tap** (`leonardschwier/homebrew-leotheca`, a separate GitHub repo the maintainer owns, containing just this Cask): available immediately, no review/acceptance bar, works via `brew tap leonardschwier/leotheca && brew install --cask leotheca`. Many small or new projects start here and graduate to the official repository later once they have real usage history to point to. **Recommended starting point** for that reason.

### If starting with an own tap (recommended)

1. Create a new GitHub repository named exactly `homebrew-leotheca` under the maintainer's account (Homebrew's tap-naming convention requires the `homebrew-` prefix; users then refer to it as `leonardschwier/leotheca`, prefix implied).
2. Add `Casks/leotheca.rb` (Homebrew taps expect casks under a `Casks/` subdirectory) with the filled-in content from this directory's draft.
3. Update this repository's README's macOS install section from "Not yet available" to the actual `brew tap`/`brew install --cask` commands.
4. Update `leotheca.rb` on every subsequent release: bump `version`, update `url`, recompute `sha256`. The `livecheck` block already in the draft (using `strategy :github_latest`) lets `brew livecheck` and Homebrew's own automation detect new GitHub releases automatically, which can drive an auto-bump PR/commit later instead of doing this by hand indefinitely, if it's worth wiring up.

### If submitting to the official `homebrew-cask` repository instead (or later, after the tap has real usage)

1. Fork [`Homebrew/homebrew-cask`](https://github.com/Homebrew/homebrew-cask) on GitHub.
2. Add `Casks/l/leotheca.rb` (the official repo shards casks into subdirectories by first letter of the cask name) with the filled-in content.
3. Run `brew audit --cask --online leotheca` and `brew style --fix Casks/l/leotheca.rb` locally before opening the PR — their CI runs the same checks and will fail the PR on style/audit issues otherwise.
4. Open a pull request. Suggested title: `Add leotheca`. Suggested description:

   ```markdown
   ## Leotheca

   A free and open source markdown viewer and editor for a local folder
   of plain text notes. No account, no telemetry, no proprietary sync.

   - Source: https://github.com/LeonardSchwier/leotheca
   - License: MIT
   - Existing distribution: Linux (AppImage, Flatpak/Flathub), Android (F-Droid, Obtainium, direct APK)
   ```
5. Address whatever their automated audit and human reviewers raise.

This whole step — creating the tap repository or filing the official PR — needs the maintainer's own GitHub account, not something an agent should do unprompted. Everything in this directory is preparation only.
