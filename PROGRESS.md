# Leotheca weekly review — 2026-10-18

## Done
- Reviewed 7-day window (3dc26d8..a53d947): tauri.conf.json CSP/asset scope,
  capabilities, external_open.rs, commands.rs gating, automation, DOMPurify,
  kanban DND, Quick Look converter, android diff. S-1/S-4/S-5 resolved; S-2 open; S-3 superseded.
- vitest: 3052/3052 passed (162 files). tsc --noEmit: clean. vite build: OK (57s).
- Wrote "## Security and privacy review (2026-10-18)" into ROADMAP.md before "## Implemented"
  (W-2026-10-18-1 medium carry-over, -2 low, -3 very low; verified-clean list).
- Fixed 2 pre-existing over-budget competitor-scan entries (details/summary blocks);
  check_roadmap_format.py --base origin/main now OK.
- Pushed: main at 4027aed (commits a597f67, 8ed7129, 4027aed); pre-push CI green;
  local HEAD == origin/main. AppImage working-tree artifact restored.
## Blocked
- None.
## Next
- Report summary. (Review-only; no ledger claims made.)

---
# (previous session log) S-1 asset-protocol scope regression lock

Date: 2026-10-17 · Profile: default (hermes)

## Chosen item
Security audit S-1 (tauri.conf.json): asset protocol scope must stay
deny-by-default. Chosen because S-1/S-2/S-3 are the unclaimed audit findings.

Why S-1 is the right target:
- Current config (empty `scope: []`) is CORRECT: it denies everything, and
  `set_active_workspace_root` (commands.rs:877) dynamically grants/reveals the
  active workspace via `app.asset_protocol_scope().allow_directory/forbid_directory`.
  Proven by the regression test at commands.rs:1433
  (`set_active_workspace_root_scopes_asset_protocol_to_the_active_workspace_only`).
- BUT the "deny-by-default" invariant is NOT locked in the TS test suite
  (src/offline.test.ts checks CSP, not the asset scope). A future edit to
  `tauri.conf.json` that reverts scope to `["**"]` (the 2026-09-23 bug) or
  `null` would silently reintroduce the arbitrary-file-read vuln with no CI
  alarm.
- S-2 (unsafe-eval) is high-risk: mermaid 12 does `new Function`/`eval` at
  runtime, removing it could break diagram rendering. Not chosen.
- S-3 (external_open containment) is functionally wrong: the whole point of
  that code is to read files OUTSIDE the workspace. Adding a containment
  check would break the feature. Not chosen.

## Plan (TDD)
1. RED: add TS test asserting assetProtocol.scope is deny-by-default and
   specifically NOT the match-all `["**"]` (regression guard for 2026-09-23 fix)
   and not `null`.
2. GREEN: test passes against current (correct) config.
3. Verify: npx tsc --noEmit, npx vitest run, npx vite build.
4. Commit + push to main (git push origin HEAD:main).
5. Update ROADMAP.md: add S-1 ledger item as ✅ with completion evidence.
   Push.

## Status
- [x] Read CONSTITUTION.md, ROADMAP.md, relevant source
- [x] Ruled out S-1 fix-as-written (false positive), S-2 (risk), S-3 (breaks)
- [x] Write the regression test (RED proven: injecting `["**"]` fails the test)
- [x] Confirm green: tsc clean, vitest 3048/3048 (162 files), vite build OK (heap 4096MB)
- [x] Commit d0f22a3 (test) + 03bf568 (ROADMAP) pushed to main
- [x] Pre-push CI: 13/14 checks, 1 skipped, both pushes passed
- [x] Working tree clean (AppImage artifact restored)
- [x] Reported

## Outcome
**Item:** Security audit S-1 (2026-10-16, medium) — asset protocol scope.
**Key finding:** The audit's S-1 claim was **false** — `scope: []` is
deny-by-default (secure), not a vuln. The real bug was `["**"]` (fixed 2026-09-23).
**Gap fixed:** The invariant was untested in the TS suite. Added
`src/assetProtocolScope.test.ts` (4 tests) to lock it in CI.
**Commits:** `d0f22a3` (test), `03bf568` (ROADMAP update with correction).
**Verification:** RED proven (inject `["**"]` → fail), GREEN (current `[]` → pass).
tsc clean, vitest 3048/3048, vite build OK. Pre-push CI green both times.

## Context
- Repo: /var/lib/leohub/chat/projects/leotheca
- I am on another agent's branch (agent/rm-9a637eae859ce76e, hermes-20261017T093000Z).
  I will NOT work on that item. I create my own branch from fresh main.
- vitest ~159 files; build needs --max-old-space-size=1024 (per prior session note)
- Pre-push hook may run full suite. Push in background with notify if slow.
