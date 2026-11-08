# Find the cause of the editor typing freeze in headless Chromium

## Item

rm-3a3cfb6fd7a270c1, "Find the cause of the editor typing freeze in headless Chromium". After one edit is pending in the editor, the next `keyboard.press` hangs the page. Decide whether this is a browser issue or an app bug.

## Acceptance

1. The freeze is reproduced and its rate measured with a scripted repro.
2. A newer Chromium and Playwright, a headed browser and a control page are tried.
3. The page state during the freeze is captured.
4. A verdict (browser or app) is recorded; if an app bug, a fix with a regression test; otherwise the finding is documented where the test lives.

## Context

Repro: open `inbox/draft.md`, click the editor, press `Control+End`, press `a`, press `b`. The same bundle and bridge mock as the e2e suite (`tests/e2e/support`). Each measurement below is runs that hung out of runs made, one fresh page per run, serial.

## Plan

1. Reproduce and measure. 2. Capture the renderer state. 3. Bisect by environment and by CSS. 4. Record the verdict and keep the existing single-event test.

## Out of scope

Reporting upstream (no network account here), a netlog capture (the page does not touch the network during the freeze; all requests are same-origin and mocked).

## Rulings

- Netlog or trace? -> a CDP `Performance.getMetrics` sample on the frozen page, plus a Chromium timeline trace | netlog is moot offline; the metrics show what the main thread does | trace is not usable: starting a trace changes the timing and the freeze vanished in 18 of 18 runs.
- App bug or browser issue? -> not attributable to app JavaScript; treat as a browser layout issue triggered by the page structure | see Findings | an app bug may remain in the sidebar tree layout; a fix needs a Blink-level trace, so no speculative app change is made.
- Restore a multi-key typing test? -> no | it hangs about half of the runs, a flaky test is worse than none (no retries in this suite) | typing is covered by the single-event test and the unit tests of the editor.

## Findings

- Rate: 4 of 6, 5 of 10 and 6 of 12 runs hang with the pinned Chromium 1248 headless shell; 2 of 6 with the new headless mode; 6 of 12 with Chromium 158 (Playwright 1.65.0, headless shell 1254); 1 of 10 in a headed browser under Xvfb. In four runs made in parallel with other tests none hung.
- The renderer main thread is busy, not blocked in script: on a frozen page `Runtime.evaluate` never returns and `Debugger.pause` never pauses, while `Performance.getMetrics` (answered by the browser process) reports about 7,700 layouts and 7,700 style recalculations, `TaskDuration` growing by 2 s per 2 s and `ScriptDuration` flat at 1.5 ms.
- A control page (a plain contenteditable div in the same Chromium) took 200 key presses with no hang.
- Not CSS animation or transition (3 of 6 with both disabled) and not the save-state indicator (2 of 6 with it hidden).
- Hiding the whole sidebar or only the file tree removed the freeze (0 of 10 each); hiding the toolbar and search, or making the sidebar not scroll, did not (1 and 2 of 10). The freeze needs the file tree on the page.
- It is not specific to key events: with `Control+End` first and then repeated `insertText`, the third insertion hung in some runs, so each edit raises the chance.
- Tracing hides it: a timeline trace made 18 of 18 runs pass.

Verdict: the main thread spins in Blink's style and layout code with no script running. The trigger needs the app's page (the file tree in the sidebar plus an edit), which a minimal page does not reproduce, and it also occurs in a headed browser and in the newest Chromium available. That points to a Chromium invalidation loop that the app's markup can trigger, not to a defect in the app's scripts. No app change is justified by this evidence; the production webview (WebKitGTK, WKWebView, WebView2, Android WebView) is a different engine and no report of the freeze exists there.

## Design system

No UI surface.

## Evidence

| Claim                                | Evidence                                                                                          | Result                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------- |
| reproduced and measured              | scratch spec run with `--repeat-each` as above                                                    | rates in Findings          |
| newer Chromium, headed, control page | Playwright 1.65.0 with Chromium 158, `xvfb-run --headed`, a contenteditable page                  | 6 of 12, 1 of 10, 0 of 200 |
| page state captured                  | CDP `Performance.getMetrics` on the frozen page                                                   | 7,700 layouts, script flat |
| verdict recorded                     | this file and the comment in `tests/e2e/tests/notes.e2e.ts`                                       | done                       |
| checks                               | `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`, `npm run test:e2e` on the branch | see the pull request       |

Reflection: a nondeterministic test problem was measured with a repeat count per hypothesis instead of single runs, and the e2e port clash only showed once two runs overlapped -> none: the port fix already landed as its own item.

Glossary: none, the item adds no domain or process term
