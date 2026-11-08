# Remove the inert tauri-plugin-fs

## Item

Roadmap id rm-80aaaa54493fb118, "Remove the inert tauri-plugin-fs". The Rust crate, its registration and the JS package are gone, so the WebView has no file-system plugin command surface left to misconfigure.

## Acceptance

1. `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `package.json` and every file under `src-tauri/capabilities` name no `tauri-plugin-fs`, `tauri_plugin_fs`, `@tauri-apps/plugin-fs` or `fs:` permission (test `scripts/noFsPlugin.test.js`).
2. `package-lock.json` holds no `@tauri-apps/plugin-fs` package and the app's own `Cargo.lock` entry no longer depends on `tauri-plugin-fs`; the Flatpak npm source list is regenerated to match. The crate stays in `Cargo.lock` as a library of `tauri-plugin-dialog` (found by `cargo tree -i tauri-plugin-fs`), so `cargo-sources.json` is unchanged.
3. The app still builds and every workspace command works (cargo test, vitest, e2e unchanged).

## Context

PR 108 removed every `fs:` permission and refused the grant store file in the path gates, so the plugin was registered but granted nothing. `grep` finds no JS import of `@tauri-apps/plugin-fs` in `src`, and Rust uses `std::fs` only. All file work goes through the app's own commands in `src-tauri/src/commands.rs` and `workspace_mutations.rs`. The Rust crate and JS package versions were paired like the dialog plugin; both leave together. Tracked generated schemas under `src-tauri/gen` are rewritten by the Tauri build.

## Plan

1. Failing test `scripts/noFsPlugin.test.js` (acceptance 1 and 2).
2. Remove the crate line, the `.plugin(...)` line, the npm dependency; regenerate both lockfiles and the Flatpak lists per `flatpak/README.md`.
3. Update master-spec (process setup sentence, change log), `documentation/ARCHITECTURE.md`, CHANGELOG.

## Out of scope

Any other plugin; the path gates; Android.

## Rulings

- Does anything transitively require `tauri-plugin-fs`? -> Check `cargo tree -i tauri-plugin-fs` after removal; if another plugin pulls it in, the lock test is relaxed to Cargo.toml only | the dialog plugin is built without its `fs` feature path | the removal is incomplete but harmless.
- Is a `fs:` grant at risk of returning through a default permission set? -> The test also scans capabilities for `fs:` | a future grant must come with a plugin, which the test then refuses | none.
- Is the change reversible? -> Yes, a revert restores the dependency; no data format changes | low cost.
- Keep a deliberate guard against re-adding? -> Yes, the test is the guard | removal without a guard drifts back | a test to edit.

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

| Claim                                                      | Evidence                                                                                                                                                                                                                                                | Result |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1 and 2: dependency, registration, lockfiles, capabilities | `npx vitest run scripts/noFsPlugin.test.js`: 3 of 4 failed before the removal, 4 of 4 pass after; reverting only `Cargo.toml` fails the first test again                                                                                                | met    |
| 3: nothing else breaks                                     | `tsc --noEmit` clean; `eslint .` 0 errors (3 old warnings in `CaptureSheet.tsx`); `vitest run` 3326 passed; `cargo test` 154 passed; `cargo clippy --all-targets -D warnings` clean; `cargo fmt --check`; `npm run build`; `npm run test:e2e` 17 passed | met    |
| Flatpak lists                                              | node generator from a fresh `flatpak-builder-tools` checkout, then prettier: only the plugin-fs tarball and cache index entries leave the list                                                                                                          | met    |
| review: standards and spec                                 | self-review of the diff by criterion (no second model available in this session)                                                                                                                                                                        | closed |
| security                                                   | the diff removes an attack surface and adds no path, command or permission                                                                                                                                                                              | pass   |

Not verified: a packaged Linux/Flatpak build and a real folder pick on a desktop; the Android build is untouched.

Reflection: removing a plugin whose crate another plugin still depends on cannot empty the lockfile, so the first-draft "no mention anywhere" test was wrong and the grill ruling about transitive use paid off -> none: the existing grill question on reuse and dependencies already covers it.
