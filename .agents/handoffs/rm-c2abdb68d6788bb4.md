Task: rm-c2abdb68d6788bb4 -- Search: hidden dotfiles with no other extension are never content-searched
Owner/token: released (finished)
Scope: src/workspace/types.ts (isTextFile), src/workspace/types.test.ts; resource workspace-text-file-classification
Acceptance: isTextFile(".gitignore"/".env"/".npmrc"/".editorconfig", false) returns true (searchable), matching the same-function treatment of a plain no-extension basename (README); a known directory basename (.git) and a hidden file with an unrecognized real extension (.env.local) still return false; existing extension-whitelist/no-extension/binary behavior unchanged.
Checkpoint: agent/rm-c2abdb68d6788bb4/06df88efe0e1 (contains the landed commit)
Landed: e4de45f6dd9fcb6b51e552246b71c9c39eb8aaf6 on main (fast-forward from claim commit fd96caf)
Checks: on this exact tree -- npx tsc -p tsconfig.json --noEmit (clean); npm run lint (clean); npm run check-version (pass); npx vitest run (2928/2928, 153 files, +7 new vs 2921 baseline, 0 regressions); npx vite build (succeeds). No Rust/Android source touched, so RUST_CHECKS/ANDROID_CHECKS not applicable per skills/verification-suite.md's table.
Review: root cause traced to `ext = ""` (leading-dot-only basename) failing `!!ext && TEXT_EXTENSIONS.has(ext)` unconditionally; fix unifies that case with the no-dot-at-all case, which already defaulted to searchable. Regression-confirmed: reverted only the types.ts fix locally, reran the new test, watched it fail (`expected false to be true`), restored the fix, reran, green. Traced both the searchable-hidden-file success path and the still-excluded directory-basename/unknown-extension/binary-extension paths via the new tests.
CI: ci.yml run 35932715120 was `queued` for e4de45f at finish time; check it directly on main if this note doesn't yet record its conclusion.
Missing evidence: none for the changed behavior; hosted CI confirmation for e4de45f was still pending at finish time (all applicable local checks already passed, so this finish follows verification-suite.md's "All applicable local checks and review pass" landing rule, not a CI-wait).
Next action: if ci.yml run 35932715120 (or its successor for e4de45f) is not `success` across all 5 jobs, treat as a new CI-repair item under this same touch path, not a reopen of this fix.
Retry: none needed; available now if a genuine regression is later found.
