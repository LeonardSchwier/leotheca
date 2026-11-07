# Bind the active workspace root to a native folder grant

## Item

`rm-c3bdf7e55130df3a`. `set_active_workspace_root(path)` accepted any webview string and widened the unscoped-path allow-list and asset scope to it.

## Acceptance

1. A native registry (`workspace_grants.rs`, `<app_data_dir>/workspace-grants.json`) holds canonical granted roots.
2. `pick_workspace_folder` shows the dialog natively, registers the folder, returns the canonical path; `null` on cancel.
3. `set_active_workspace_root(Some(p))` errors unless `p` canonicalizes to a granted root; the previous root and asset scope stay unchanged. `None` always clears.
4. When the registry file is missing it is seeded once from `config.json` (`workspaceProfiles[].path`, `lastWorkspacePath`; absolute existing directories only). Later config edits are ignored. A corrupt registry loads empty.
5. The frontend `pickWorkspaceFolder` uses the native command.

## Design check

No UI change. A failed activation of an ungranted root reuses the existing `workspaceSelectionError` path.

## Rulings

- Seed from the config once, only when the file is absent. Why: the config dir is writable by the webview through the unscoped gate, so a continuing sync would let it add roots. Cost if wrong: a user whose registry file is lost re-picks folders.
- Corrupt registry fails closed (empty), not reseeded. Why: reseeding on corruption would let anyone who can corrupt the file re-run the seed. Cost: re-pick.
- No revocation on profile removal. Why: out of scope; a stale grant needs an existing directory and only matters for the user's own picked folders. Cost: a removed folder stays eligible until the registry is cleared.
- Dialog command is async so the blocking dialog does not run on the main thread.

## Evidence

`cargo test` (131 pass incl. 8 registry tests and the refusal test), clippy `-D warnings`, `cargo fmt --check`, `tsc`, eslint, vitest 3282 pass.
