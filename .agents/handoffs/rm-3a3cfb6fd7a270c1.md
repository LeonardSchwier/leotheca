# Find the cause of the editor typing freeze in headless Chromium

Merged as PR 104, merge commit da143f95b12c3b1e5a7495cef1826f12846fe6ba. Verdict (details and measurements in spec/completed/find-the-cause-of-the-editor-typing-freeze-in-headless-chromium.md): the renderer main thread spins in a Blink style and layout loop with no script running; it also occurs in Chromium 158 (Playwright 1.65.0) and in a headed browser, not on a plain contenteditable page, and it needs the sidebar file tree. Not attributable to app scripts, so no app change; a multi-key typing test would be flaky (about half of the runs) and was not restored.

Post-merge runs on main: Rules 42434080537, Release 42434080568, CodeQL 42434080414, Agent policy 42434080480, Secret scan 42434080534, CI 42434080536.

Open hazard found on the way, fixed under the next item: a failed local e2e run leaves tests/e2e/playwright-report, which eslint then walks (4000 errors), so the pre-push gate fails after any failed e2e run.

Reflection: see the archived spec.
