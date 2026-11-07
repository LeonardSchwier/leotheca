# Mermaid diagrams: theme-aware, responsive, zoomable rendering

## Item

rm-e21b17dd07db2ce3, "Mermaid diagrams: theme-aware, responsive, zoomable rendering (Pele-based)". Diagrams in Preview follow the app theme, scale with the note width, can be zoomed and panned, and fail without crashing, all offline.

## Acceptance

- A diagram is drawn with Mermaid's dark theme when the app is dark (`data-theme="dark"`, or no `data-theme` and the OS prefers dark) and its default theme otherwise; when the theme flips, existing diagrams are redrawn.
- The SVG fills the note width and keeps its aspect ratio at any pane width.
- Each diagram has zoom in, zoom out, reset, Ctrl/Cmd+wheel zoom, drag to pan (when zoomed) and a full-screen view that Escape closes.
- A diagram that fails to parse or render shows a notice with the reason (escaped) above its source as a code block; nothing throws and no scratch element stays in the page.
- Sanitization is unchanged or stronger: `securityLevel: "strict"`, `sanitizeMermaidSvg`, and `sanitizeMermaidSvgForInjection` now applied inside `mountMermaidFigure`, so no caller can skip it.
- No network, no new dependency, no AI.

## Context

`mermaid` is 12.3.0 (the "Pele"-based renderer named in the roadmap entry is Mermaid 12 syntax; no extra library is needed, an unnamed new dependency would only add supply-chain surface). The renderer was initialised once with no theme, so every diagram stayed light in a dark app, and a failure produced a bare code block with no reason.

## Plan

1. `mermaid.ts`: app theme detection and watcher, per-theme initialisation, error display.
2. `mermaidFigure.ts`: zoom/pan/full-screen figure (pure zoom math plus DOM wiring).
3. `MarkdownPreview.tsx`: mount figures, re-render on theme change. `src/styles/mermaid.css`, imported by `main.tsx`.
4. Tests, master spec, changelog.

## Out of scope

Exporting diagrams to PNG/PDF; touch pinch gestures beyond the browser's ctrl+wheel pinch mapping; per-diagram theme overrides in the note.

## Rulings

- Which library is "Pele"? -> use the installed Mermaid 12.3.0 | no package by that name is needed for the behaviour asked for, and a new dependency needs intake and a Flatpak source regeneration | Cost if wrong: add the library later behind the same `renderMermaidToSvg` seam.
- Draw in the right theme or recolour with CSS? -> initialise Mermaid per theme | CSS cannot reach colours Mermaid bakes into its own style block, and the theme variables are Mermaid's contract | Cost: one re-render on a theme flip.
- Zoom by re-rendering or by transform? -> CSS transform on a canvas | no layout thrash, no re-parse, works for every diagram type | Cost: none, the SVG stays vector.
- Plain wheel zoom? -> no, only Ctrl/Cmd+wheel | a plain wheel must keep scrolling the note | Cost: one more modifier.
- Pan when not zoomed? -> no | it would fight text selection and page scroll | Cost: none.
- Where is the SVG sanitized? -> inside `mountMermaidFigure` as well as in `renderMermaidToSvg` | the figure writes `innerHTML` after the main DOMPurify pass | Cost: sanitizing twice, idempotent (existing test).
- Error text could carry markup? -> escaped, first line, 200 characters | Mermaid errors quote the source | Cost: long messages truncated.
- Failed render leaves `#d<id>` in the body? -> remove it and set `suppressErrorRendering` | Mermaid 11+ can append an error SVG to the document | Cost: none.

## Design system

Change: app-only chrome (`.mermaid-*`) built on existing tokens (`--color-border`, `--color-panel`, `--color-raised`, `--color-danger`); no Leoforma component fits an in-content toolbar. No new tokens.

## Evidence

| Claim                   | Evidence (command or trace)                                                                                                                                                                                | Result    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Theme follows the app   | `src/markdown/mermaid.test.ts` (dark initialises `theme: "dark"`, light `"default"`, no re-init when unchanged, watcher fires on `data-theme`); fails on the pre-change module, which exports none of this | pass      |
| Redrawn on theme flip   | e2e `a mermaid diagram renders as a zoomable figure that follows the theme` sets `data-theme=dark` in real Chromium with real Mermaid and waits for the SVG to change                                      | pass      |
| Responsive              | `src/styles/mermaid.test.ts` (svg width/max-width 100%, height auto, tokens only)                                                                                                                          | pass      |
| Zoom, pan, full screen  | `src/markdown/mermaidFigure.test.ts` (clamp, anchor-fixed zoom, buttons, ctrl+wheel only, Escape) and the e2e above                                                                                        | pass      |
| Error display, no crash | `mermaid.test.ts`: reason and escaped source shown, hostile message escaped, scratch element removed, `initialize` throwing is contained                                                                   | pass      |
| Sanitization intact     | `mermaidSanitize.test.ts` and `mermaid.smoke.test.ts` unchanged and passing; `mermaidFigure.test.ts` checks script and `onclick` are stripped at mount                                                     | pass      |
| Gates                   | `npx tsc -p tsconfig.json --noEmit`, `eslint` on changed files, `npx vitest run` (179 files, 3302 tests), `npm run build`, `cd tests/e2e && npx playwright test` (15)                                      | all green |
| Review                  | Self-review from the acceptance list (no second agent available); no Critical or Important finding                                                                                                         | closed    |
| Security                | No src-tauri, capability or IPC change; no dependency change; CSP unchanged; SVG sanitized twice                                                                                                           | pass      |
| legal/text check        | `Legal/text check: 3 verified, 0 fixed, 0 open` (new strings are original UI text; no copied competitor text or assets)                                                                                    | recorded  |

Reflection: the roadmap entry said the renderer was "already present, partial", but only the sanitizer and the placeholder path existed; the theme, zoom and CSS were all missing, so reading the code before trusting the entry changed the plan. A real-browser test caught nothing the unit tests missed here, but it is the only proof the theme flip redraws with real Mermaid.
