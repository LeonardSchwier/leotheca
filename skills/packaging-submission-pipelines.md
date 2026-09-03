# Skill: F-Droid and Flathub submission pipeline gotchas

Both `packaging/f-droid/` and `flatpak/` build the app from a **pinned
git commit**, not the branch tip, inside a network-isolated sandbox, and
verify that build with a dedicated GitHub Actions workflow
(`fdroid-submission-verify.yml`, `flathub-submission-verify.yml`). Both
pipelines have already produced real, non-obvious, multi-session-spanning
bugs. Read this before touching either, and before assuming a failure in
either pipeline needs a code change to the app itself — most failures
here are in the packaging metadata, not the app.

## The shared gotcha: exactly which commit is pinned, and by what

Each pipeline pins an exact commit SHA in its own manifest
(`packaging/f-droid/com.leonardschwier.leotheca.yml`'s `commit:` field;
`flatpak/com.leonardschwier.leotheca.yml`'s `sources: - type: git ...
commit:` field) — **not necessarily the same commit as each other**, and
not necessarily `main`'s tip. Before touching either pipeline's generated
files, confirm which exact commit is currently pinned by reading the
manifest directly; don't assume it matches a value from an older
conversation, another pipeline's pin, or a tag name that "should" still
point there. `git rev-parse <the-tag-name>` failing (a tag that doesn't
exist, or a literal string like `v0.1.0` where a real 40-character SHA
belongs) is a real, previously-shipped bug class here: a bad
merge-conflict resolution once replaced a real pinned SHA with a
non-existent tag name, breaking both the manifest's own "confirm pinned"
grep check and the real buildserver checkout.

## Flathub-specific: offline dependency source lists must match the pinned commit exactly

`flatpak/node-sources.json` and `flatpak/cargo-sources.json` are
generated, offline dependency caches (via `flatpak-builder-tools`'s node
and cargo generators) consumed by a sandboxed build that has **no network
access at all**. They must be regenerated from the *exact* `package-lock.json`
/ `src-tauri/Cargo.lock` content **at the manifest's currently-pinned
commit**, not from the branch tip or from a different commit than the one
currently pinned. A previously-shipped bug here: the sources were
regenerated correctly, but against the *wrong* commit (one differing
substantially — over a thousand lines — from the actually-pinned one),
producing a subtly incomplete offline cache that still failed with the
same-looking `ENOTCACHED` error. Symptom and root cause did not obviously
match; verify by diffing the pinned commit's own lockfile against the
lockfile actually used to generate the checked-in sources file, not just
by re-running the generator against whatever's currently checked out.

Regenerate with the GitHub source checkout of the generators, not any
published package release — `flatpak/README.md` documents the exact
commands and states the published npm-generator package produces an
incomplete list for this project's lockfile. Follow that procedure
exactly rather than reaching for whatever generator is easiest to
install.

## Flathub-specific: `npm ci --offline` can still hit the network

Switching `npm install --offline` to `npm ci --offline` is a real,
necessary fix for one failure mode (a lockfile re-resolution needing
registry metadata the generator never caches), but it is **not**
sufficient on its own if the project has real peer-dependency conflicts
(this project's `eslint`-ecosystem devDependencies do). npm's arborist
logs `ERESOLVE overriding peer dependency` and then fetches bare package
metadata (no version pinned) to make that override decision, during
`npm ci` too, not only `npm install` — a request the generator's cache
has no entry for, so it fails under `--offline` regardless of which
install subcommand triggers it. The fix is `--legacy-peer-deps` on the
`npm ci --offline` invocation, which restores npm's pre-v7 behavior of
never validating/resolving peerDependencies conflicts at all, skipping
that code path entirely. It does not change which package versions get
installed (those still come from the lockfile either way), so it's safe
to add unconditionally rather than only when this exact symptom appears.
If you fix the wrong-commit lockfile issue above and the build *still*
fails with the same `ENOTCACHED` error for the same package, this is
almost always why — don't assume the first fix was incomplete for some
other reason before checking this.

## F-Droid-specific: the official buildserver image is a floating tag

`packaging/f-droid/`'s CI job runs the real
`registry.gitlab.com/fdroid/fdroidserver:buildserver` Docker image via
`docker run --rm` (a fresh container every run) inside `fdroid build`. A
failure whose error is a Gradle *internal services startup* error (not a
compile error, not a dependency error — e.g. a Gradle service
constructor throwing while parsing an empty string it expected numeric
data in) that reproduces identically across a same-commit re-run, and
which the exact same job/recipe/commit did **not** produce days earlier,
is very likely a regression in that floating image tag itself, not in
this repository's files. Confirm by diffing this branch's own files
between the last known-green run and the failing one for anything
plausibly touching Gradle startup; if nothing relevant changed, document
this as an external, reproducible blocker (see `skills/ci-failure-triage.md`)
rather than guessing at a repository-side fix with more CI cycles. This
sandbox typically has no Docker daemon to inspect the image directly —
say so rather than asserting a deeper root cause you couldn't verify.

## Before claiming either pipeline "fixed"

A pushed fix is not a confirmed fix. Trigger (or wait for) the real CI
run the push causes, and read its actual conclusion before writing
"fixed" anywhere. Both pipelines have a history of a plausible-sounding
fix turning out incomplete on the very next real run — see the two
Flathub findings above, which happened in that exact order in real
project history.
