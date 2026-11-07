# Handoff — S-2: remove `unsafe-eval` from CSP (security audit 2026-10-16)

Task: S-2 (audit finding, medium) — `script-src 'self' 'unsafe-eval'` in
`src-tauri/tauri.conf.json`. No existing ledger item covers it (S-2 is prose
inside the audit report; this handoff claims it under a new ledger entry).

## Acceptance criteria

1. `unsafe-eval` is removed from `script-src` in `src-tauri/tauri.conf.json`;
   all other CSP directives unchanged.
2. A regression test asserts the CSP in `tauri.conf.json` does not contain
   `unsafe-eval` (RED with the current config, GREEN after the fix).
3. Mermaid rendering still works without `eval`: verified by tracing every
   call path (all failures fall back to a code block — `renderMermaidToSvg`
   catches and MarkdownPreview.tsx:1719 catches too), plus the existing
   mermaid tests passing. d3-dsv is the only `new Function` user in the
   dependency graph and is NOT bundled into mermaid's esm build (verified by
   grep of `node_modules/mermaid/dist/mermaid.esm.mjs` and the chunks).
4. `npx tsc --noEmit`, `npx vitest run`, `npx vite build` all green.

## Crash-freedom trace (this change)

- Unhandled rejection: CSP removal can only make mermaid's internal eval-based
  code paths throw; both `renderMermaidToSvg` and the MarkdownPreview effect
  wrap in try/catch with a code-block fallback. No new unhandled path.
- Lifecycle: no new listeners/timers.
- Boundary inputs: empty source already returns undefined from tokenizer;
  decode failure already handled (MarkdownPreview.tsx:1710).
- Platform no-op: CSP applies to Tauri webview only; Android/web unaffected
  (Android uses WebView with its own policy).

## Status

- [x] Handoff written
- [ ] Claim on remote main
- [ ] RED test
- [ ] Fix (remove unsafe-eval)
- [ ] GREEN + full suite
- [ ] Push to main, CI check, finish
