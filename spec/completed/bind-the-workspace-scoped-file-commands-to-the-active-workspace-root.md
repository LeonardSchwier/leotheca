# Bind the workspace-scoped file commands to the active workspace root

## Item

Roadmap item `rm-a614ed941ef6abd9`, "Bind the workspace-scoped file commands to the active workspace root" (Tier 2 audit 2026-11-08, finding F1, master-spec KG-001). Outcome: the eleven desktop commands that take a webview-supplied `workspace_root` refuse any root that is not the native active workspace root, so a compromised webview cannot name another directory.

## Acceptance

1. `write_workspace_text_file`, `write_workspace_binary_file`, `create_workspace_dir`, `rename_workspace_path`, `delete_workspace_path_permanent`, `trash_path`, `create_workspace_text_file_new`, `create_workspace_binary_file_new`, `create_workspace_dir_new` and `rename_workspace_path_no_replace` each return an error and touch nothing when `workspace_root` is not the canonical active root.
2. The same commands return an error when no workspace is active.
3. A root spelled differently but resolving to the active root (trailing separator, symlink, `..`) is accepted, so the frontend contract stays unchanged and all existing tests and e2e journeys keep passing.
4. The two no-replace error families keep their coded prefix (`outside_workspace:`); the commands.rs family keeps plain strings.
5. `master-spec.md` section 7.1, KG-001, the command table and the change log match the code.

## Context

- Callers: `src/workspace/tauriBridgeImpl.ts` lines 195-310 pass `workspaceRoot` on every call; `restoreWorkspaceAccess` sets the native active root (`set_active_workspace_root`, grant-checked) before any mutation.
- Existing gate: `check_list_dir_allowed` and `check_unscoped_path_allowed` compare against `ActiveWorkspaceRoot`; the scoped commands did not.
- `ActiveWorkspaceRoot` is Tauri managed state, read through `active_workspace_root_snapshot`. A command gets it by an extra `tauri::State` parameter, which Tauri injects, so the JS invoke arguments do not change.
- Crash-freedom: a poisoned mutex makes the snapshot `None`, which refuses (fail closed). A root that cannot be canonicalized refuses. No platform no-op path: Android does not use these commands.

## Plan

1. `commands.rs`: add `require_active_workspace_root(workspace_root, active) -> Result<(), String>` (canonicalize both, compare). Test first with a stub that returns `Ok(())`, so every per-command test fails for the right reason.
2. Inject `tauri::State<ActiveWorkspaceRoot>` into the six commands in `commands.rs` and call the guard first.
3. `workspace_mutations.rs`: the same guard, with the `outside_workspace` code, for the four no-replace commands. Make the guard in `commands.rs` `pub(crate)` and map its error.
4. Tests: one per command with a different root, one for no active root, one for an equivalent spelling accepted (`commands.rs` tests, `workspace_mutations.rs` tests).
5. master-spec, CHANGELOG, GLOSSARY.

## Out of scope

The fs plugin capability and the grant store location (separate roadmap item). `markdown_import` destination handling. Android.

## Rulings

| Question                                       | Decision                                                                              | Why                                                                                                               | Cost if wrong                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Compare roots by string or canonical path?     | Canonical path of both.                                                               | The frontend and the registry may spell the same folder differently; the registry already stores canonical paths. | A symlinked root that the OS resolves differently would be refused; the user re-opens the workspace. |
| Change the JS contract (drop `workspaceRoot`)? | No.                                                                                   | Fewer callers and tests change; the argument stays as a cross-check that the frontend and native state agree.     | A stale frontend root now errors visibly instead of writing; that is the wanted behavior.            |
| What if no workspace is active?                | Refuse.                                                                               | Every mutation follows activation; allowing it would reopen the hole.                                             | A flow that mutates before activation breaks; none exists (checked in the bridge).                   |
| Share one guard between both files?            | Yes, one `pub(crate)` function in `commands.rs`.                                      | A parallel copy is what let the gap exist in two places.                                                          | None.                                                                                                |
| Where does the active root come from in tests? | `tauri::test::mock_app` with managed `ActiveWorkspaceRoot`, as the existing tests do. | Tests the real command signature.                                                                                 | None.                                                                                                |

## Design system

No UI surface.

## Evidence

| Claim                                                     | Evidence                                                                                                                                                                                                                                                                   | Result                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1-2 each command refuses a foreign or missing active root | `cargo test binding_tests`: 6 tests in `commands.rs`, 4 in `workspace_mutations.rs`, plus `no_scoped_command_works_while_no_workspace_is_active` over all ten. With the guard stubbed to `Ok(())` 12 of 14 failed (assertion on `is_err`), with the guard 14 of 14 passed. | met                      |
| 3 equivalent spellings pass                               | `an_equivalent_spelling_of_the_active_root_is_accepted` (trailing separator, `sub/..`, `./`, symlink); `the_active_root_still_creates_a_new_file`                                                                                                                          | met                      |
| 4 error shapes                                            | `mutation` tests assert the `outside_workspace:` prefix; existing `already_exists:` tests (calling `_core`) unchanged                                                                                                                                                      | met                      |
| 5 master-spec                                             | section 7.1 "Root binding", ten command rows, KG-001 removed, change log line, `check_master_spec.py --update-traceability`                                                                                                                                                | met                      |
| existing behavior intact                                  | `cargo test --offline` 143 passed; `cargo clippy --all-targets -D warnings` clean; `cargo fmt`; `tsc` clean; `npm run lint` 0 errors; vitest 3291 passed; `npm run test:e2e` 16 passed                                                                                     | pass                     |
| review: standards                                         | self-review of the diff against `CONSTITUTION.md` (path-argument rule, siblings checked: `import_markdown_vault` already uses `ActiveWorkspaceRoot`, `list_dir` already gated)                                                                                             | closed                   |
| review: spec                                              | each criterion mapped to the tests above                                                                                                                                                                                                                                   | met                      |
| security                                                  | Tier 1 checklist fallback (`change-quality-gates.md`) applied by hand; the Cloudflare audit skill was not run in this session                                                                                                                                              | deferred, stated plainly |
| legal and text                                            | no user-visible text or asset; docs only describe behavior. 3 verified, 0 fixed, 0 open                                                                                                                                                                                    | pass                     |

Not verifiable without a real desktop run: that the real webview passes a root that canonicalizes to the same folder as the registry entry on every OS (case-insensitive or network volumes); the mock app proves the logic, the e2e suite uses the in-page bridge mock and does not reach Rust.

Glossary: Active workspace root

Reflection: a Tauri command that gains a `tauri::State` parameter cannot be called from plain unit tests, which is why this gap had no per-command test; a shared `mock_app_with_active_root` helper now makes state-bound commands testable -> applied: helper added in `commands.rs` for later tests.
