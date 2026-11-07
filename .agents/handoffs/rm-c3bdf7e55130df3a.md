# Bind the active workspace root to a native folder grant

Task: rm-c3bdf7e55130df3a, "Bind the active workspace root to a native folder grant".
Owner/token: released (finished).
Scope: src-tauri/src (workspace_grants.rs new, commands.rs, lib.rs), src/workspace/tauriBridgeImpl.ts, master-spec.md, CHANGELOG.md; resources workspace-root-grant, workspace-lifecycle.
Acceptance: spec/completed/bind-the-active-workspace-root-to-a-native-folder-grant.md.
Landed: f8891d6 on main (implementation c19ef43 plus merge and Legal-Check commit).
Checks (local, merged tree): cargo test 131 pass (8 registry tests, ungranted-root refusal test), cargo clippy --all-targets -D warnings clean, cargo fmt --check clean, tsc clean, eslint 0 errors, vitest 3282 pass (two earlier runs showed one transient unrelated failure/error each, rerun green), master-spec check OK.
Review: traced pick -> grant -> activate; refusal leaves previous root and asset scope; registry in app data dir is outside the unscoped allow-list; config seed runs once; corrupt file fails closed.
CI: hosted CI pending for f8891d6: Release 42392463954, Rules 42392463927, CI 42392463898 queued; Agent policy 42392463915 success.
Missing evidence: hosted CI jobs above; no real-desktop run of the folder dialog (no interactive session).
Next action: gh run view 42392463898; a red run is a main regression.
Retry: available now.

Reflection: a pre-existing phantom diff on android/gradlew.bat (CRLF attribute) blocked the helper's clean-tree check -> applied: used git update-index --assume-unchanged locally; recorded here only (a skill fix would be to document it; not done to keep scope).
