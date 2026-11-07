Task: rm-a72cc3eae6d7384f Maintenance review: Markdown table-command cursor boundaries
Owner/token: released as blocked; former token dd2685aed91b713de9b2abcb2bb65311
Scope: src/markdown/tableCommands.ts and src/markdown/tableCommands.test.ts; resource markdown-table-commands
Acceptance: Column commands do not silently select an unrelated last column when the cursor lies outside an editable table cell.
Checkpoint: agent/rm-a72cc3eae6d7384f/dd2685aed91b at f2656f6
Landed: not landed
Checks: `npx vitest run src/markdown/tableCommands.test.ts src/markdown/tables.test.ts` passed 35 tests; TypeScript passed; lint had 0 errors and 8 existing warnings.
Review: The delimiter row has no editable cell offsets. The prior fallback edited the final column; the checkpoint returns null for column commands at unsupported positions.
CI: full frontend suite previously blocked by four F05 pending-capture failures.
Missing evidence: F05's active legacy scope now has a fresh source commit 561eba9. CI repair inspection found an unreachable aggregate-size test, stale filename expectations, extension-loss on truncation, and a whitespace-trim regex defect, but this task may not edit src/capture while F05 is leased.
Next action: F05 owner should repair src/capture/pendingCaptures.ts and its test first; then resume this checkpoint on fresh main and run full frontend checks.
Retry: 2026-09-07T11:49:49Z or after F05 test repairs land.
