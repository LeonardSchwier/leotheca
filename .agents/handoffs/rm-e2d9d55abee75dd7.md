# Retire the legacy tests/ui script

Merged as PR 107, merge commit e7b4269cb013e0e5762553142cd64c9c5b6417ff. All 27 legacy tests are mapped in spec/completed/retire-the-legacy-tests-ui-script.md (one new journey for nested headings, inline code and block quotes; T26 dropped as it asserted nothing; record_demo.py dropped, not used by screenshots.mjs). tests/ui, its eslint entry, its .gitignore lines and the TESTING.md section are removed; ESLint now ignores tests/e2e/playwright-report and test-results.

Post-merge runs on main: CodeQL 42435619537, Release 42435619554, Rules 42435619624, CI 42435619578, Agent policy 42435619647, Secret scan 42435619559.

For the claim "Bring the PDLC gap table up to date with what landed on 2026-11-08" (it holds documentation/AGENTIC_PDLC.md): the row "End-to-end smoke suite" should say tests/ui is retired, the suite has 17 journeys, each run uses its own port (E2E_PORT), and the typing freeze is characterised as a Chromium style and layout loop (spec/completed/find-the-cause-of-the-editor-typing-freeze-in-headless-chromium.md), not an app bug; the two roadmap follow-ups in that row are done.

Reflection: see the archived spec (a failed local e2e run broke eslint and the pre-push gate; fixed by ignoring the report directories).
