# Scope the Tauri fs plugin permissions and separate the grant store from webview-writable directories

## Item

Roadmap item `rm-202efda43e98b14b`, Tier 2 audit 2026-11-08 finding F2 (master-spec KG-013). Outcome: the webview has no fs-plugin access at all, and the workspace grant registry file cannot be read, written, renamed or deleted through any webview-reachable command, on any OS.

## Acceptance

1. `src-tauri/capabilities/default.json` grants no `fs:` permission; every remaining permission is one the frontend uses (`core:default`, `core:path:default`, `dialog:default`, `deep-link:default`, `clipboard-manager:allow-write-text`). A Rust test reads the file and fails on any `fs:` entry or any permission outside that list.
2. `check_unscoped_path_allowed` refuses a target whose file name starts with `workspace-grants.json` (case-insensitive), wherever it lies, including inside the active workspace and inside the app config dir.
3. `resolve_within_workspace` (both copies, commands.rs and workspace_mutations.rs) refuses the same names.
4. A symlink whose destination is the registry file is refused too.
5. The registry code and its own temp file keep working (native code does not use these gates).
6. `src-tauri/gen/schemas/capabilities.json` matches the capability file. master-spec 7.1, KG-013 and the change log are updated. No Cargo change.

## Context

- Validated finding. In Tauri's path resolver `app_config_dir` and `app_data_dir` are the same folder on Windows (both `%APPDATA%\<id>`) and macOS (both `~/Library/Application Support/<id>`); only Linux separates them (`~/.config` and `~/.local/share`). Checked in `dirs` 6.0.0 `win.rs`/`mac.rs`. The registry lives in `app_data_dir`, so there it sits inside the config dir that `check_unscoped_path_allowed` allows, and the webview could rewrite it with `write_text_file` and widen the grants after a restart.
- Fs plugin: `fs:default` is read access to the app-specific directories (AppConfig, AppData, AppLocalData, AppCache, AppLog) recursively per `gen/schemas/acl-manifests.json`, so the grant file was also readable by the webview. `@tauri-apps/plugin-fs` is imported nowhere in `src/`; all file access goes through custom commands.
- The fs plugin stays registered in `lib.rs` (a Cargo or flatpak source change is avoided); with no permission granted its commands are denied.

## Plan

1. Test first: capability file test (fails on the three `fs:` entries); `check_unscoped_path_allowed` tests for the registry name in the config dir and in the active workspace, case variants, temp-file name, and a symlink. Run, see them fail.
2. `workspace_grants.rs`: `is_grant_store_name(&Path)`. `commands.rs`: call it first in `check_unscoped_path_allowed` and in `resolve_within_workspace`; `workspace_mutations.rs`: same in its copy with the coded error.
3. Remove the three `fs:` permissions from the capability; regenerate `gen/schemas/capabilities.json` (by a cargo build) and keep only that file's change.
4. master-spec (7.1, KG-013, change log), CHANGELOG.

## Out of scope

Removing the `tauri-plugin-fs` crate and npm dependency (needs Cargo and flatpak source regeneration; no permission remains, so it is dead code, noted). Moving the registry to another directory (a path-name rule is stronger than a location, because the workspace itself can be an ancestor of the data dir). Windows webview-data deny scopes (no fs access remains).

## Rulings

| Question                                                   | Decision                                                       | Why                                                                                                                                   | Cost if wrong                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Scope the fs permissions or drop them?                     | Drop all.                                                      | No JS caller exists; a scope is attack surface with no user.                                                                          | A future JS fs call fails with a permission error; add a scoped permission then.                                 |
| Move the registry to a separate directory?                 | No, deny it by file name in every webview-reachable path gate. | On Windows and macOS config and data dirs are one folder; a granted workspace may also be an ancestor of it. A name rule covers both. | A user file called `workspace-grants.json...` in a workspace cannot be touched by the app. Accepted, documented. |
| Match the exact name or a prefix?                          | Prefix, ASCII case-insensitive.                                | Covers `.tmp`, trailing dot and alternate stream spellings on Windows, and case-insensitive volumes.                                  | A few more refused names.                                                                                        |
| Also deny reads?                                           | Yes.                                                           | The file lists every granted folder path; the gate is shared, a split would add a parallel gate.                                      | None.                                                                                                            |
| Remove the plugin from `lib.rs`?                           | No.                                                            | Keeps Cargo.lock, Flatpak sources and npm untouched; with no permission it is inert.                                                  | Dead dependency remains; seeded as a note in the handoff.                                                        |
| Does deleting or renaming the registry's directory matter? | No.                                                            | A missing or corrupt registry loads empty (fail closed).                                                                              | User re-picks the folder.                                                                                        |

## Design system

No UI surface.

## Evidence

| Claim                                | Evidence                                                                                                                                                                                                                                           | Result           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1 no `fs:` permission                | `cargo test grant_store_protection`: `the_capability_file_grants_no_fs_permission` failed on the three `fs:` entries, passes after removal                                                                                                         | met              |
| 2 unscoped gate refuses the registry | `the_unscoped_gate_refuses_the_registry_file_inside_the_config_dir`, `..._even_inside_the_active_workspace`, `..._registry_spellings_and_a_missing_registry`; all failed with the name check absent (7 of 7 new tests failed), 7 of 7 pass with it | met              |
| 3 scoped gates refuse it             | `the_scoped_gate_refuses_the_registry_name_inside_a_workspace` (commands.rs), `the_scoped_gate_refuses_the_registry_name` (workspace_mutations.rs, coded error)                                                                                    | met              |
| 4 symlink to the registry            | `the_unscoped_gate_refuses_a_symlink_to_the_registry`                                                                                                                                                                                              | met              |
| 5 native registry unaffected         | existing `workspace_grants` tests, `cargo test --offline` 150 passed                                                                                                                                                                               | met              |
| 6 schema, docs                       | `gen/schemas/capabilities.json` regenerated by `cargo test` build and formatted, only the three lines differ; master-spec 7.1, KG-013 removed, change log; CHANGELOG; ARCHITECTURE line                                                            | met              |
| existing behavior intact             | `cargo clippy --all-targets -D warnings` clean, `cargo fmt`, tsc, lint, vitest, `npm run test:e2e` (pre-push gate)                                                                                                                                 | pass             |
| review: standards                    | self-review against the constitution path-argument rule; siblings with the same argument shape checked (`list_dir`, workspace scoped commands both copies)                                                                                         | closed           |
| review: spec                         | each criterion mapped to the tests above                                                                                                                                                                                                           | met              |
| security                             | Tier 1 checklist fallback by hand; audit skill not run in this session                                                                                                                                                                             | deferred, stated |
| legal and text                       | no assets; 3 docs lines changed. 3 verified, 0 fixed, 0 open                                                                                                                                                                                       | pass             |

The finding was validated before the fix: `dirs` 6.0.0 returns the same folder for config and data dir on Windows and macOS. Not verifiable without a real desktop run: the behavior on a real Windows or macOS install (name check on a case-insensitive volume, 8.3 aliases), and that the real webview still works with no fs permission (no `plugin-fs` import exists in `src/`, and the generated context compiled in the tests). Follow-up note: the `tauri-plugin-fs` crate and npm package are now dead weight; removing them needs a Cargo and Flatpak sources change.

Glossary: none

Reflection: the audit's guess that the grant file "may share a directory" with writable paths was true on two of three systems, and only reading the path library source showed it; a per-OS fact belongs in a test or comment, so the spec and master-spec now state it -> applied: documented in master-spec 7.1 and enforced by a name gate that does not depend on the directory.
