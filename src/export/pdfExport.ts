/**
 * Desktop "Export note to PDF…": the already-rendered Preview HTML (math and
 * mermaid diagrams included) is wrapped in a paginated, print-optimized
 * document and handed to the webview's own print dialog, whose "Save as PDF"
 * destination writes the file. Reuses `printNote.ts` (iframe, stylesheet) and
 * `exportNoteHtml.ts` (image inlining); there is no second renderer and no
 * new dependency. Android has its own device-bound item and is not touched.
 */

import katexCss from "katex/dist/katex.min.css?inline";
import { inlineLocalImages } from "./exportNoteHtml";
import { buildPrintDocument, printNoteHtml } from "./printNote";

const MAX_FILE_NAME_LENGTH = 120;

/** A note name made safe as the proposed PDF file name: path separators,
 * reserved and control characters become spaces, the result is trimmed and
 * is never empty or only dots. */
export function pdfFileName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return "note";
  return cleaned;
}

const PDF_STYLESHEET = `
  @page { size: A4; margin: 2cm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { max-width: none; margin: 0; padding: 0; background: #fff; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow: visible; }
  img { max-height: 24cm; object-fit: contain; }
  svg { max-width: 100%; height: auto; background: #fff; break-inside: avoid; page-break-inside: avoid; }
  .katex-display { overflow: visible; break-inside: avoid; page-break-inside: avoid; }
  table { table-layout: auto; overflow-wrap: anywhere; }
  details > :not(summary) { display: block; }
  .block-link-copy, .mermaid-placeholder:empty { display: none; }
`;

/** Pure: the full document the PDF is printed from. The title is the safe
 * file name, which print dialogs propose as the PDF name. */
export function buildPdfDocument(title: string, bodyHtml: string): string {
  return buildPrintDocument(pdfFileName(title), bodyHtml, {
    extraCss: `${katexCss}\n${PDF_STYLESHEET}`,
  });
}

/** Resolves once every image in the print frame has loaded or failed and its
 * fonts are ready, or after `timeoutMs`, whichever comes first. Never
 * rejects: a missing `fonts` API or a broken image must not stop the export. */
export function waitForPrintAssets(
  win: Window,
  timeoutMs = 5000,
): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  try {
    const doc = win.document;
    for (const img of Array.from(doc.images ?? [])) {
      if (img.complete) continue;
      tasks.push(
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve());
          img.addEventListener("error", () => resolve());
        }),
      );
    }
    const fontsReady = (
      doc as Document & { fonts?: { ready?: Promise<unknown> } }
    ).fonts?.ready;
    if (fontsReady)
      tasks.push(Promise.resolve(fontsReady).catch(() => undefined));
  } catch {
    return Promise.resolve();
  }
  if (tasks.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void Promise.all(tasks).then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export interface ExportNotePdfDeps {
  /** Overridable for tests. */
  inline?: (html: string) => Promise<string>;
  /** Overridable for tests. */
  print?: typeof printNoteHtml;
}

/** Opens the print dialog on the PDF document for `bodyHtml`. Rejects only
 * when printing itself fails; image inlining problems fall back to the
 * original HTML. */
export async function exportNotePdf(
  title: string,
  bodyHtml: string,
  deps: ExportNotePdfDeps = {},
): Promise<void> {
  const { inline = (html) => inlineLocalImages(html), print = printNoteHtml } =
    deps;
  let html = bodyHtml;
  try {
    html = await inline(bodyHtml);
  } catch {
    // keep the original HTML: images may not display, the text still prints
  }
  await print(pdfFileName(title), html, {
    buildDocument: buildPdfDocument,
    waitForAssets: waitForPrintAssets,
  });
}
