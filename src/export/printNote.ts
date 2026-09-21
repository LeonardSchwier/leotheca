/**
 * Printing a note reuses the already-rendered Preview pane's HTML (see
 * `editor/MarkdownPreview.tsx`): the caller passes in the live preview
 * container's own `innerHTML` for the current note, and this module only
 * wraps it in a standalone print-friendly document and drives the
 * browser's native print dialog, rather than running a second
 * Markdown-to-HTML pipeline. Desktop only for now (see ROADMAP.md's
 * "Print/export a note on Android" item for the mobile phase).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PRINT_STYLESHEET = `
  :root { color-scheme: light; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    max-width: 46em;
    margin: 2em auto;
    padding: 0 1.5em;
    line-height: 1.6;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin-top: 1.4em; }
  pre, code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }
  pre {
    background: #f4f4f4;
    padding: 0.75em 1em;
    overflow-x: auto;
    border-radius: 4px;
  }
  code { background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; }
  pre code { background: none; padding: 0; }
  blockquote {
    border-left: 3px solid #ccc;
    margin: 1em 0;
    padding: 0 1em;
    color: #555;
  }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; text-align: left; }
  a { color: inherit; }
  /* Preview-only affordance (see MarkdownPreview.tsx's F04 Phase 5e2
     block-link-copy button): meaningless once printed, and would
     otherwise print as a stray floating control. */
  .block-link-copy { display: none; }
  @media print {
    @page { margin: 2cm; }
    body { margin: 0; padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
  }
`;

/** Pure: builds the full standalone HTML document a note is printed
 * from. Exported mainly so it can be unit tested directly, without the
 * browser-only iframe/print orchestration below. */
export function buildPrintDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLESHEET}</style>
</head>
<body>
<article>${bodyHtml}</article>
</body>
</html>`;
}

export interface PrintNoteDeps {
  /** Overridable for tests; defaults to the real `document`. */
  doc?: Document;
  /** Overridable for tests, since jsdom has no real print implementation.
   * Defaults to calling `win.print()` on the throwaway iframe's own
   * window. */
  triggerPrint?: (win: Window) => void;
  /** How long to keep the iframe alive after triggering print, so a
   * webview that reads the document asynchronously (rather than
   * synchronously inside `print()`) still has it available. Overridable
   * so tests don't need a real timer. */
  cleanupDelayMs?: number;
}

/**
 * Prints `bodyHtml` (the current note's already-rendered Preview
 * `innerHTML`) as a standalone document, via a throwaway hidden iframe
 * rather than printing the whole app window: printing only this iframe's
 * content means the sidebar, tab bar, and any other open note are never
 * part of what the OS print dialog sees, without having to hide every
 * other element in the live app with `@media print` visibility rules.
 */
export function printNoteHtml(
  title: string,
  bodyHtml: string,
  deps: PrintNoteDeps = {},
): void {
  const { doc = document, triggerPrint, cleanupDelayMs = 1000 } = deps;

  const iframe = doc.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  doc.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const iframeDoc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!iframeDoc || !win) {
    cleanup();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(buildPrintDocument(title, bodyHtml));
  iframeDoc.close();

  // Cleans up as soon as the OS print dialog actually closes, on a
  // webview that fires this for an iframe's own window; `cleanupDelayMs`
  // below is only a fallback for one that doesn't.
  win.addEventListener("afterprint", cleanup);

  if (triggerPrint) triggerPrint(win);
  else win.print();

  setTimeout(cleanup, cleanupDelayMs);
}
