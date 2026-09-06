<!--
Variables: IDENTITY = ../CONSTITUTION.md (app_id, main_branch)
ANDROID_PACKAGE_DIR = packaging/f-droid
ANDROID_MANIFEST = packaging/f-droid/{app_id}.yml
LINUX_PACKAGE_DIR = flatpak
LINUX_MANIFEST = flatpak/{app_id}.yml
NODE_SOURCES = flatpak/node-sources.json
RUST_SOURCES = flatpak/cargo-sources.json
ANDROID_WORKFLOW = .github/workflows/fdroid-submission-verify.yml
LINUX_WORKFLOW = .github/workflows/flathub-submission-verify.yml
-->

# Verify source-built package submissions

Use before changing these packaging pipelines or diagnosing their jobs. Substitute app_id from the constitution in manifest paths. The actual manifests/workflows are authoritative, including which exact source commit they pin.

## Match generated inputs to the source pin

Read both manifests. They may pin different commits, and neither necessarily matches main. Confirm each reference resolves to a real commit. Do not replace a pinned SHA with a guessed release tag.

Generated offline source lists must be derived from the exact lockfiles at the relevant pinned commit. Compare the pinned package lock and Rust lock against the inputs used by each generator. Generating a correct cache from the wrong source revision still yields an incomplete offline build.

Use the generator commands documented in the corresponding package directory. Inspect generated diffs and run the actual offline build when available. Never assert that regenerating files fixed packaging before checking the resulting build.

## Diagnose offline dependency failures

An offline install can still require missing registry metadata when dependency/peer resolution disagrees with the generated cache. Inspect the exact package, lockfile, command, and resolver error.

A prior pipeline used legacy peer resolution to address this behavior. Do not add that flag blindly or assume it is universally safe: confirm the lockfile/install contract and verify the resulting dependency tree and offline build. Fix cache/source mismatches first. Preserve declared dependency versions and license constraints.

## Diagnose changing build environments

A floating container/action/tool version can change while the repository commit stays fixed. Compare exact job versions/image digests and the last successful run. One repeat of the failed job may help distinguish transient infrastructure behavior. Logs that fail during tool startup are different from compiler errors in the app, but still need evidence.

If container/runtime inspection is unavailable, record the limitation and observed errors. Do not invent a repository code fix for an unverified hypothesis.

## Completion

Use verification-suite.md for local/hosted/deferred evidence. A claim that a package build or submission is fixed requires that exact build/submission evidence. Implemented metadata and actual external acceptance are different states.

When a distribution service, signing credential, or platform capability is unavailable, keep the precise remaining step in a blocked handoff and continue repository work elsewhere. Do not fabricate signing material, loosen inclusion/security checks, or imply external acceptance happened.
