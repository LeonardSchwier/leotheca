import * as pdfjsLib from "pdfjs-dist";
// `?url` makes Vite emit the worker as its own bundled, hashed asset and
// hand back its final URL as a plain string, instead of inlining pdf.js's
// worker source into the main bundle -- the documented Vite integration
// pattern for pdfjs-dist. No CDN, no network fetch: the worker script
// ships inside this app's own build output on both Tauri and Capacitor,
// per CONSTITUTION.md's "Offline by design".
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Locally vendored copies of pdf.js's own optional runtime data (see
 * `public/pdfjs/`, copied from this pinned `pdfjs-dist` version at
 * dependency-install time): predefined CMaps for CJK text in PDFs that
 * don't embed their own font program, the 14 standard PDF fonts'
 * metrics/glyph data for the same non-embedded-font case, ICC color
 * profiles, and the OpenJPEG/JBIG2 wasm decoders scanned/image-only PDFs
 * can need. All served from this app's own origin, never a CDN -- without
 * these, pdf.js falls back to built-in metrics for those specific cases
 * rather than making any network request, but rendering such a PDF
 * correctly needs the real data.
 */
export const PDFJS_CMAP_URL = "/pdfjs/cmaps/";
export const PDFJS_STANDARD_FONT_DATA_URL = "/pdfjs/standard_fonts/";
export const PDFJS_ICC_URL = "/pdfjs/iccs/";
export const PDFJS_WASM_URL = "/pdfjs/wasm/";

export { pdfjsLib };
