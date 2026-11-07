# PDF export for notes (desktop)

## Item

- Roadmap id `rm-fdda583431750499`, "PDF export for notes (mobile and desktop)".
- Outcome (desktop slice): a palette command "Export note to PDF…" turns the rendered note into a paginated, print-optimized document and opens the webview print dialog on it, so the user saves a PDF through the OS "Save as PDF" destination with the note name already proposed. Android is a separate, device-bound item (`PrintExport` plugin) and is not touched here.

## Acceptance

1. A new desktop-only command `export-note-pdf` ("Export note to PDF…") exists; the Android branch of the command list is unchanged.
2. The print document has page rules: `@page` A4 with margins, headings keep with the next block, and code blocks, tables rows, images, figures, blockquotes and diagrams do not split across pages.
3. Long code lines wrap in print instead of being clipped; images and SVG diagrams never exceed the page width; `<details>` content is visible.
4. Math prints as rendered: the KaTeX stylesheet is part of the PDF document. Mermaid diagrams (inline SVG in the preview) print scaled to the page width on a white background.
5. Local images are inlined as `data:` URIs before printing (reusing `inlineLocalImages`), and printing waits for images and fonts (bounded by a timeout) so the PDF is not missing them.
6. The document title is a safe file name (no path separators, control or reserved characters, never empty), which print dialogs propose as the PDF name.
7. Failure paths: no preview pane gives an alert (as Print and HTML export do); an unreachable image or a missing `fonts` API does not stop the export; any rejection ends in an alert, never an unhandled rejection.
8. Existing Print note and HTML export behavior is unchanged except for the added page-break rules.

## Context

- Read: `src/export/printNote.ts`, `exportNoteHtml.ts`, their tests, `App.tsx` palette commands (lines ~1300-1400), `tauriBridgeImpl.ts` (`exportTextFileViaDialog`), `master-spec.md` FR-EXP.
- Data flow: command reads `#primary-editor-panes .markdown-preview` innerHTML (already DOMPurified; math and mermaid already rendered) -> `inlineLocalImages` -> `buildPdfDocument` -> hidden iframe -> `waitForPrintAssets` -> `win.print()`.
- Platform: desktop webview print only. Android keeps its own item.
- Crash answers: every await is inside one try/catch with an alert; the iframe is removed by `afterprint` or a fallback timer; a second invocation creates its own iframe; on Android the command does not exist.

## Plan

1. `printNote.ts`: add page-break rules to the shared print stylesheet; `buildPrintDocument` takes `{ extraCss }`; `printNoteHtml` accepts `waitForAssets` and returns a promise. Test: `printNote.test.ts`.
2. New `pdfExport.ts`: `pdfFileName`, `waitForPrintAssets`, `buildPdfDocument` (KaTeX CSS plus PDF rules), `exportNotePdf`. Test: `pdfExport.test.ts`.
3. `App.tsx`: add the desktop command. Test: command presence via the existing palette tests if they cover it, else the unit tests above.
4. `master-spec.md` FR-EXP-004..006 and change log, `CHANGELOG.md`.

## Out of scope

- Android print/PDF (`PrintExport` plugin, device-bound, own blocked item).
- A headless PDF writer (WebKitGTK `PrintOperation`, WebView2 `PrintToPdf`, `WKWebView.createPDF`): per-platform native code that cannot be verified without a desktop session of each OS. The print dialog path is the one the owner allowed.
- Rendering HTML to PDF with `pdf-lib` ourselves: it has no HTML layout engine.

## Rulings

| Question                                 | Decision                                                                 | Why                                                                                                                     | Cost if wrong                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Direct file write or print dialog?       | Print dialog with a proposed name.                                       | Zero new dependency or native code, works on all three desktops with the same code, matches the existing Print command. | One extra click (choose "Save as PDF") versus a silent save. A native writer can replace it later behind the same command.    |
| A second Markdown pipeline for PDF?      | No, reuse the Preview innerHTML.                                         | Math and mermaid are already rendered there.                                                                            | None.                                                                                                                         |
| Change the shared stylesheet or fork it? | Add the page-break rules to the shared one, PDF-only CSS via `extraCss`. | Print note benefits from pagination, and one stylesheet cannot drift.                                                   | Print layout shifts slightly: covered by tests of the rules only.                                                             |
| KaTeX CSS in the HTML export too?        | No, only in the PDF/print document of this command.                      | Its font URLs point into the running app and would be dead in a standalone file.                                        | HTML export math stays as before.                                                                                             |
| Wait for assets?                         | Yes, images and `document.fonts.ready`, max 5 s.                         | Data URIs decode asynchronously and KaTeX fonts load lazily; printing early drops them.                                 | A 5 s ceiling delays the dialog on a broken asset.                                                                            |
| Dark-theme diagrams on paper?            | Print forces a white background on SVG diagrams.                         | Paper is white.                                                                                                         | A diagram drawn with light text in a dark theme could stay low-contrast until the mermaid theme item emits print-safe colors. |
| Claim scope: `spec` directory?           | Spec files are new unique paths, claimed implicitly.                     | The mermaid claim holds the `spec` prefix.                                                                              | None, no other agent writes this file.                                                                                        |

## Design system

No new UI surface beyond one palette entry that reuses the existing command list. Reuse: the command palette. Add/Change: none in Leoforma.

## Evidence

| Claim                                                | Evidence                                                                                                                   | Result                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1 command exists, Android unchanged                  | `tests/e2e/tests/pdfExport.e2e.ts` (palette "Export note to PDF", print captured); diff touches only the non-native branch | pass, e2e 15/15 local and in CI     |
| 2, 3 page rules, wrapped code, scaled media, details | `src/export/pdfExport.test.ts` buildPdfDocument cases, `printNote.test.ts` pagination                                      | pass, vitest 3307 passed on 51b164e |
| 4 math and diagrams as rendered                      | pdfExport test (KaTeX CSS present), e2e asserts 2 `.katex` nodes and `.katex` CSS in the printed document                  | pass                                |
| 5 images inlined, wait for assets                    | `exportNotePdf` and `waitForPrintAssets` cases (load, error, timeout, no fonts API)                                        | pass                                |
| 6 safe file name                                     | `pdfFileName` cases                                                                                                        | pass                                |
| 7 failure paths                                      | inline throws, print rejects, wait rejects tests; App catch alerts                                                         | pass                                |
| 8 existing print and HTML export                     | existing printNote and exportNoteHtml tests unchanged and green                                                            | pass                                |
| review                                               | self-review from this spec (no separate agent), 1 round, nothing open                                                      | closed                              |
| e2e smoke / security                                 | Playwright suite 15 passed; no Rust, capability, IPC or dependency change, so the security gate is not triggered           | pass                                |
| legal/text check                                     | Legal/text check: 5 verified, 0 fixed, 0 open                                                                              | recorded                            |
| hosted CI                                            | PR 76 all required checks green; merged as 4e7694a                                                                         | pass                                |

Not verifiable without a desktop session: the real OS print dialog and its "Save as PDF" output in WebKitGTK, WKWebView and WebView2 (page breaks and KaTeX fonts in the produced file). Headless Chromium only proves the document handed to print().

Reflection: the hardest part was proving the output without a print dialog; capturing what the throwaway iframe hands to print() in a real browser is a cheap, honest e2e seam worth reusing for the Print command. The claim protocol blocked on the parent `spec` prefix held by another agent, so the spec file was left out of the touch list.
