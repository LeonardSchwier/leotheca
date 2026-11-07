# Security and privacy review, 2026-10-18

Moved from ROADMAP.md on 2026-11-07 with the text unchanged. Finding ids in the ledger and in handoffs refer to this report.

_Weekly review of code committed 2026-10-11..2026-10-18 (commits `3dc26d8..a53d947`). Scope: the 2026-10-16 audit's open findings, plus new attack surface in the window (kanban view, collapsible collection groups, macOS Quick Look converter, Android recent-notes widget, competitor-scan roadmap items). Verified: `npx vitest run` 3052/3052 (162 files), `npx tsc --noEmit` clean, `npx vite build` OK. No new critical/high findings; 1 medium carry-over still open, 2 low new._

**W-2026-10-18-1 (medium, carry-over) — `script-src 'unsafe-eval'` in CSP** ✅
`src-tauri/tauri.conf.json`. **Resolved 2026-10-21.** The fix landed in commit `95f870a` (2026-10-18, "fix(csp): remove unsafe-eval from script-src, add regression test") but the ledger entry was never closed — this is the ledger correction, not a re-implementation. Current config: `script-src 'self'` (no `unsafe-eval` anywhere in the CSP). Acceptance verified: (1) `unsafe-eval` absent from `script-src`; (2) regression test present (see W-2026-10-18-2); (3) mermaid renders without `eval` — both `renderMermaidToSvg` (src/markdown/mermaid.ts) and the MarkdownPreview effect catch failures and fall back to a code block; d3-dsv is the only `new Function` user in the dependency graph and is not bundled into mermaid's esm build; (4) `npx tsc --noEmit` clean, `npx vitest run` 3109/3109 (165 files), `npx vite build` OK (2026-10-21 re-verification).

**W-2026-10-18-2 (low, new) — no CSP regression test; `unsafe-eval` can silently return** ✅
**Resolved 2026-10-21 (ledger correction).** The test already exists: `src/offline.test.ts` "does not include 'unsafe-eval' in script-src (W-2026-10-18-2)" and "script-src contains only 'self' (no eval, no remote scripts)" (added with the fix in `95f870a`). Both tests pass in the 2026-10-21 run; any future edit re-adding `unsafe-eval` to `tauri.conf.json` will now fail CI. The 2026-10-18 review recorded these as open based on the state of the review-window snapshot; the fix commit `95f870a` (2026-10-18 13:09) post-dates the review's window head `a53d947` (2026-10-18 09:20), which is why the finding appeared unresolved at review time.

**W-2026-10-18-3 (very low, new) — Quick Look converter: unescaped regex `$` patterns in substitution** ✅
`packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m:173-193`: the markdown-to-HTML conversion uses `NSRegularExpression` replacements whose replacement strings are regex patterns, so note content containing `$&`, `$1`, etc. would be substituted as backreferences (e.g. a note titled `a $& b` renders `a <h1> b $& b`). The input is local user-authored note content rendered into a `WKWebView` (`loadHTMLString:baseURL:nil`, all HTML-special characters escaped at 145-147), so there is no XSS and no data-exfiltration path — output fidelity only, in a throwaway preview surface.

*Analysis (2026-10-20):* The audit's concern is a **false positive**. NSRegularExpression's replacement template syntax (`$1`, `$2`) refers to **capture group values**, not to the *content being matched*. The replacement strings in the code are fixed literals like `<h1>$2</h1>` — the `$2` is a backreference to capture group 2 (the matched content), which is correct. The content itself (the capture group value) may contain `$1`/`$&` as literal text; that text is inserted via the backreference, not interpreted as a template. No escaping needed.

*Resolution:* Added 4 regression tests (`TestDollarSignInContent` in `scripts/test_ql_converter.py`) that lock in the correct behavior and prevent a future "fix" that would break it. All 38 QL converter tests pass. Commit `239a1f7`.

## Verified clean (this window)

- **S-3 (2026-10-16 audit) superseded:** `external_open.rs`'s no-containment design for `read_markdown_file` is intentional (the feature exists to open files outside the workspace; the F04 follow-up docs this in `commands.rs`), and the frontend-facing commands that *do* read arbitrary paths (`read_text_file`, `read_binary_file`, `workspace_stats`, `find_all_files`, `list_dir`) all gate through `check_unscoped_path_allowed` / `resolve_within_workspace` (verified in `src-tauri/src/commands.rs`, including the symlink-escape skip `is_symlink_escaping_workspace` applied across every walk, and the `MAX_WALK_DEPTH` cycle guard).
- **S-5 (2026-10-16 audit) resolved 2026-10-18:** `src/export/exportNoteHtml.ts` now restricts `inlineLocalImages` to `asset://` and relative paths only; `file:`, `http(s):`, `javascript:`/`vbscript:` all rejected, with 4 regression tests (commit `a53d947`, under "Implemented" below).
- **Kanban drag-and-drop** (`src/collections/CollectionResults.tsx:422-444`): the dropped value is read from the app's own `dataTransfer` under a custom MIME type and matched against already-loaded in-memory results — no `event.dataTransfer`-sourced untrusted value reaches the DOM or a filesystem path.
- **Collapsible collection groups / `collectionDecode.ts`**: persisted collection JSON is decoded with explicit validation (no `eval`/`Function`, `JSON.parse` only), same discipline as before; no new raw-HTML rendering path.
- **Quick Look WKWebView**: `baseURL:nil`, all dynamic content HTML-escaped before `loadHTMLString`; the only `evaluateJavaScript` calls (92, 104) read `document.readyState` with no string interpolation of external data.
- **Android manifest / recent-notes widget** (commit `d8c7ae7`): the new `leotheca://` deep-link and `SEND`/`SEND_MULTIPLE` intent filters feed the existing `automationCommands.ts` capture path, which already enforces the 32 KiB payload cap (S-4's non-authoritative-path note stands — Rust remains the authoritative gate); no new exported component with a broad intent surface beyond the pre-existing `MainActivity`.
- **No new `innerHTML`/`eval`/`new Function`** in `src/` (grep, window diff); DOMPurify coverage unchanged from the 2026-10-16 verified-clean list.

## Summary

| ID | Severity | Status | Component | Issue |
|----|----------|--------|-----------|-------|
| W-2026-10-18-1 | medium | ✅ resolved 2026-10-21 (fix `95f870a` + ledger correction) | `src-tauri/tauri.conf.json` | `unsafe-eval` in CSP `script-src` |
| W-2026-10-18-2 | low | ✅ resolved 2026-10-21 (tests in `src/offline.test.ts`, added with `95f870a`) | CSP tests | no regression test locking CSP free of `unsafe-eval` |
| W-2026-10-18-3 | very low | ✅ resolved (false positive + regression tests) | `packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m:173-193` | unescaped `$` in regex replacement patterns |

_Review only — no fixes implemented this pass; see the open items above for the suggested fixes._
