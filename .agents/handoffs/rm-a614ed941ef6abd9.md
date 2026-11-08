Task: rm-a614ed941ef6abd9 - Bind the workspace-scoped file commands to the active workspace root
Owner/token: released (finished)
Scope: src-tauri/src/commands.rs, src-tauri/src/workspace_mutations.rs, master-spec.md, CHANGELOG.md, GLOSSARY.md; resources workspace-lifecycle, workspace-root-grant
Acceptance: the ten *_workspace_* commands and trash_path refuse a workspace_root that is not the canonical ActiveWorkspaceRoot, and refuse any root while no workspace is open; equivalent spellings pass
Spec: spec/completed/bind-the-workspace-scoped-file-commands-to-the-active-workspace-root.md (rulings, Glossary, Reflection recorded)
Landed: 1ceee9ca528c43072a1d0d3b4f104fcdcb0ff220 (PR 102)
Hosted runs of 1ceee9c: CI 42434238232, Secret scan 42434238272, Agent policy 42434238293, CodeQL 42434238363, Release 42434238398, Rules 42434238310, Semgrep 42434238297 (pending when finished; PR required checks all passed)
Tests: cargo test 143 passed (14 new, 12 failed with the guard stubbed), clippy -D warnings clean, tsc clean, lint 0 errors, vitest 3291 passed, e2e 16 passed
Review: self-review of both axes; security Tier 1 by checklist, audit skill not run
Missing evidence: real desktop run (root canonicalization on every OS); hosted runs on main pending
Next action: none
