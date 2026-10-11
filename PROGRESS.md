# PROGRESS
task: Recent-notes widget performance — fix resolver-array bug + bump cap 5→10
updated: 2026-10-11 11:30Z

## Done
- Read CONSTITUTION.md, ROADMAP.md, skills, all relevant source
- Identified target: "Recent-notes widget performance" (unclaimed ⬜)
- Bug 1: pendingRecentNotesSync holds single `resolve` ref; burst callers 1..N-1 never resolve
- Bug 2: RECENT_NOTES_WIDGET_MAX=5 disagrees with native widget display capacity (10)
- 3 skipped tests in fileTreeStore.test.ts cover exactly this bug

## Next (in order)
1. Fix resolver-array bug in syncRecentNotesWidget (fileTreeStore.ts ~line 915-983)
2. Un-skip the 3 skipped tests in fileTreeStore.test.ts
3. Bump RECENT_NOTES_WIDGET_MAX from 5 to 10 in TS (fileTreeStore.ts line 877)
4. Bump RECENT_NOTES_WIDGET_MAX from 5 to 10 in Java (FolderAccessPlugin.java line 826)
5. Run npx tsc --noEmit
6. Run npx vitest run
7. Run node --max-old-space-size=1024 node_modules/vite/bin/vite.js build
8. Commit + push to main
9. Update ROADMAP.md: mark item ✅ with details
10. Push

## Context
- Repo: /var/lib/leohub/chat/projects/leotheca (branch: main, up to date)
- Fix: change `resolve: () => void` to `resolvers: Array<() => void>`, push each new resolve, call all in finally
- Tests to un-skip: "coalesces a burst of mutations", "does not throw when bridge fails", "two calls both resolve"
