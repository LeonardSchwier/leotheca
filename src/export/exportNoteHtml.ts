/**
 * Exporting a note to a standalone HTML file reuses `printNote.ts`'s own
 * document/stylesheet builder (Phase 1 of this ROADMAP item) rather than
 * a second Markdown-to-HTML pipeline: this module's only real job is
 * making the already-rendered Preview pane's local images portable.
 *
 * The Preview pane's own images already resolved to the app's internal
 * `asset://`-style URL (`workspace/tauriBridge.ts`'s `fileSrc`), loadable
 * only from inside this running app. A standalone `.html` file opened
 * later, on another machine, with no Leotheca running, needs the actual
 * image bytes embedded as `data:` URIs instead.
 */

import { buildPrintDocument } from "./printNote";

async function responseToDataUrl(response: Response): Promise<string> {
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image data"));
    reader.readAsDataURL(blob);
  });
}

export interface InlineLocalImagesDeps {
  /** Overridable for tests; defaults to the global `fetch`. A real
   * caller never needs to override this: `fetch()` against the Preview
   * pane's own already-resolved image URLs works from inside the running
   * app the same way loading them as `<img src>` already does (that's
   * the same protocol handler, just invoked through a different API). */
  fetchImpl?: typeof fetch;
  /** Overridable for tests; defaults to a real `DOMParser`. */
  parser?: DOMParser;
}

/**
 * Replaces every `<img>` in `html` whose `src` is not already a `data:`
 * URI with one, fetching the real bytes first. An image that fails to
 * fetch (a broken attachment, an already-unresolved placeholder) is left
 * with its original `src` rather than failing the whole export: it just
 * won't display when the exported file is opened standalone, the same
 * way a broken image behaves anywhere else.
 */
export async function inlineLocalImages(html: string, deps: InlineLocalImagesDeps = {}): Promise<string> {
  const { fetchImpl = fetch, parser = new DOMParser() } = deps;
  const parsed = parser.parseFromString(html, "text/html");
  const images = Array.from(parsed.querySelectorAll("img"));

  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const response = await fetchImpl(src);
        if (!response.ok) return;
        img.setAttribute("src", await responseToDataUrl(response));
      } catch {
        // Leave the original src: one unreachable attachment shouldn't
        // fail the whole export.
      }
    }),
  );

  return parsed.body.innerHTML;
}

/** Builds the final standalone document for `bodyHtml` (Preview output
 * whose local images `inlineLocalImages` has already inlined). Delegates
 * to `printNote.ts`'s `buildPrintDocument`: the same document this app
 * builds to print a note is also a perfectly good standalone export --
 * opening the exported file and using the browser's own print function
 * still works, not just viewing it. */
export function buildExportDocument(title: string, bodyHtml: string): string {
  return buildPrintDocument(title, bodyHtml);
}
