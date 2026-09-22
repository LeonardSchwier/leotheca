# Handoff: rm-628e21cede0ca61d — foreignObject injection regression test

**Agent**: hermes-local-20260922T074730Z-404844bb
**Date**: 2026-09-22
**Work branch**: `agent/rm-628e21cede0ca61d/c96c415feb01`
**Landed SHA**: `4aa1d7e`
**Status**: ✅ Done — claim finished, entry moved to Implemented in main (SHA `c8a33ed`)

## Acceptance criteria

1. A malicious Mermaid SVG containing `<foreignObject>` with embedded `<script>`, `onerror` handlers, and `javascript:` URLs is fully neutralized after the two-layer sanitizer pipeline.
2. The regex layer (`sanitizeMermaidSvg`) is verified to strip `on*` inline event handlers and rewrite `javascript:` URLs.
3. The DOMPurify layer is verified to remove `foreignObject` and `<script>` entirely.
4. The full `renderMermaidToSvg` pipeline is verified end-to-end.
5. All existing tests continue to pass.

## What was done

Added a `describe("foreignObject injection (security regression)")` block to `mermaid.smoke.test.ts` with 3 tests:

1. **Regex-layer contract** — asserts `sanitizeMermaidSvg` strips `on*` handlers and `javascript:` URLs, while (explicitly) leaving `<script>` tags intact. This documents the responsibility split: the regex layer handles attribute-level sanitization; DOMPurify handles tag-level removal.

2. **DOMPurify layer** — asserts `DOMPurify.sanitize(sanitizeMermaidSvg(maliciousSvg))` removes `foreignObject`, `<script>`, inline event handlers, and `javascript:` URLs entirely. The payload body (`window.pwned`) is also confirmed absent.

3. **Full pipeline** — mocks `mermaid.render` to return hostile SVG, calls `renderMermaidToSvg`, and verifies both layers together produce clean output. Also asserts the fallback code-block path is NOT triggered (the SVG rendered successfully, it was just hostile content).

## Self-review findings

- The test intentionally asserts that `sanitizeMermaidSvg` does NOT remove `<script>` tags (`expect(output).toContain("<script>")`). This is a deliberate pin on the responsibility split: if a future change moves `<script>` removal into the regex layer, or adds `foreignObject` to the DOMPurify allowlist, the test fails loudly. This is the correct behavior for a security regression test.
- The `DOMPurify` import is used only in this test file's new block; it is a devDependency already in `package.json`.
- No production code was modified. This is a pure test addition.

## Verification evidence

| Check | Result |
|---|---|
| `npx vitest run mermaid.smoke.test.ts` | 17/17 pass (3 files) |
| `npx tsc -p tsconfig.json --noEmit` | Clean |
| `npx vitest run` (full suite) | 27803/27803 pass (1475 files) |
| `npm run build` (tsc + vite) | ✓ built in 16.82s |
| `npm run lint` (eslint) | Clean |

## CI state

- Work branch pushed: `agent/rm-628e21cede0ca61d/c96c415feb01`
- Finish commit pushed to main: `c8a33ed`
- CI runs are expected to be green (all local checks passed before push)
