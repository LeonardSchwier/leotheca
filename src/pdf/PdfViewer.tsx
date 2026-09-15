import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, PDFJS_CMAP_URL, PDFJS_ICC_URL, PDFJS_STANDARD_FONT_DATA_URL, PDFJS_WASM_URL } from "./pdfWorker";
import "./pdfViewer.css";
import {
  applyAnnotationsToPdf,
  DEFAULT_MARKUP_COLOR,
  quadPointsToViewportRects,
  readMarkupAnnotations,
  rectToQuadPoints,
} from "./pdfAnnotations";
import type { MarkupSubtype, PendingAnnotation, SavedAnnotation, ViewportRect } from "./pdfAnnotations";
import { readBinaryFile, writeActiveWorkspaceBinaryFile } from "../workspace/tauriBridge";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;
const DEFAULT_SCALE = 1.25;

interface PdfViewerProps {
  path: string;
}

type Status = "loading" | "ready" | "error";

interface OverlayRect extends ViewportRect {
  subtype: MarkupSubtype;
  color: { r: number; g: number; b: number };
  opacity: number;
  saved: boolean;
}

/** A minimal local stand-in for pdf.js's own (not publicly re-exported)
 * `TextItem` type -- only the field this component actually reads. */
interface PdfTextItem {
  str: string;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * PDF Phase 1 (spec: `spec/f-pdf-view-annotate.md` -- see ROADMAP.md's "PDF
 * Phase 1" entry): real page rendering/zoom/navigation via pdf.js, a real
 * selectable text layer for full-document search and for anchoring
 * highlight/underline/strikethrough to actual text, written back as
 * standard PDF annotation objects via `pdfAnnotations.ts` (pdf-lib), never
 * a sidecar file. Deliberately architected as two independent halves:
 * pdf.js owns rendering/reading, pdf-lib owns writing, meeting only at
 * plain data (bytes in, bytes out) -- pdf.js's own annotation-authoring
 * path needs its full "web viewer" UI-manager infrastructure this
 * component doesn't pull in.
 *
 * PDF content is binary, not the string `OpenDocument.content` the
 * generic autosave/dirty/SaveCoordinator pipeline is built around (see
 * `workspace/types.ts`), so this component manages its own read/save
 * lifecycle end to end rather than integrating with that pipeline, the
 * same independence `ImageViewer.tsx` already has for a read-only binary
 * kind; unlike ImageViewer this one does mutate, through its own explicit
 * "Save annotations" action. A consequence, disclosed rather than hidden:
 * unsaved annotations are lost if the tab is closed without saving, with
 * no dirty-tab warning wired in for this kind yet.
 */
export function PdfViewer({ path }: PdfViewerProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [activeTool, setActiveTool] = useState<MarkupSubtype | null>(null);
  const [pendingAnnotations, setPendingAnnotations] = useState<PendingAnnotation[]>([]);
  const [savedAnnotations, setSavedAnnotations] = useState<SavedAnnotation[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "done">("idle");
  const [matchingPages, setMatchingPages] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([]);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const textLayerTaskRef = useRef<{ cancel(): void } | null>(null);
  const renderGenerationRef = useRef(0);

  // Load the document fresh whenever the open path changes.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    setPendingAnnotations([]);
    setSavedAnnotations([]);
    setSearchQuery("");
    setMatchingPages([]);
    setPageNum(1);
    setPageInput("1");
    setScale(DEFAULT_SCALE);
    docRef.current = null;
    bytesRef.current = null;

    (async () => {
      const bytes = await readBinaryFile(path);
      if (cancelled) return;
      const doc = await pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: PDFJS_CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
        iccUrl: PDFJS_ICC_URL,
        wasmUrl: PDFJS_WASM_URL,
      }).promise;
      if (cancelled) {
        void doc.loadingTask.destroy();
        return;
      }
      bytesRef.current = bytes;
      docRef.current = doc;
      setNumPages(doc.numPages);
      const existing = await readMarkupAnnotations(bytes);
      if (cancelled) return;
      setSavedAnnotations(existing);
      setStatus("ready");
    })().catch((error: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      void docRef.current?.loadingTask.destroy();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Render the current page: canvas + a real selectable text layer, then
  // draw this page's saved/pending annotation overlays and any active
  // search highlight. Guarded against out-of-order async completion by a
  // generation counter, since scale/page/annotation changes can fire in
  // quick succession (e.g. two zoom clicks before the first render lands).
  useEffect(() => {
    if (status !== "ready" || !docRef.current) return;
    const generation = ++renderGenerationRef.current;
    let renderTask: { promise: Promise<unknown>; cancel(): void } | null = null;

    (async () => {
      const doc = docRef.current;
      if (!doc) return;
      const page: PDFPageProxy = await doc.getPage(pageNum);
      if (renderGenerationRef.current !== generation) return;

      const viewport = page.getViewport({ scale });
      viewportRef.current = viewport;

      const canvas = canvasRef.current;
      const container = pageContainerRef.current;
      const textLayerEl = textLayerRef.current;
      if (!canvas || !container || !textLayerEl) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      container.style.width = `${Math.floor(viewport.width)}px`;
      container.style.height = `${Math.floor(viewport.height)}px`;
      // Feeds this component's own trimmed copy of pdf.js's real
      // `.textLayer` CSS contract (see pdfViewer.css): the per-span
      // font-size formula there reads --scale-factor to match glyph
      // sizing to this exact render.
      container.style.setProperty("--scale-factor", String(scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      renderTask = page.render({ canvas, canvasContext: ctx, viewport, transform });
      await renderTask.promise;
      if (renderGenerationRef.current !== generation) return;

      textLayerTaskRef.current?.cancel();
      textLayerEl.replaceChildren();
      textLayerEl.style.width = `${viewport.width}px`;
      textLayerEl.style.height = `${viewport.height}px`;
      const textLayerTask = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerEl,
        viewport,
      });
      textLayerTaskRef.current = textLayerTask;
      await textLayerTask.render();
      if (renderGenerationRef.current !== generation) return;
      // pdf.js's own TextLayer sizes the container via a CSS `round()`
      // expression tied to its full web-viewer scaffold (--total-scale-
      // factor, --scale-round-x/y) this component doesn't pull in;
      // re-asserting explicit pixel dimensions here keeps text-layer
      // sizing correct without depending on that scaffold or on
      // `round()` CSS math-function support across every target WebView.
      textLayerEl.style.width = `${viewport.width}px`;
      textLayerEl.style.height = `${viewport.height}px`;

      if (searchQuery) {
        const needle = searchQuery.toLowerCase();
        for (const span of textLayerEl.querySelectorAll("span")) {
          if (span.textContent?.toLowerCase().includes(needle)) {
            span.classList.add("pdf-search-match");
          }
        }
      }

      const pageIndex = pageNum - 1;
      const rects: OverlayRect[] = [];
      for (const saved of savedAnnotations) {
        if (saved.pageIndex !== pageIndex) continue;
        for (const rect of quadPointsToViewportRects(saved.quadPoints, viewport)) {
          rects.push({ ...rect, subtype: saved.subtype, color: saved.color, opacity: saved.opacity, saved: true });
        }
      }
      for (const pending of pendingAnnotations) {
        if (pending.pageIndex !== pageIndex) continue;
        const color = pending.color ?? DEFAULT_MARKUP_COLOR[pending.subtype];
        const opacity = pending.opacity ?? (pending.subtype === "Highlight" ? 0.4 : 1);
        for (const rect of quadPointsToViewportRects(pending.quadPoints, viewport)) {
          rects.push({ ...rect, subtype: pending.subtype, color, opacity, saved: false });
        }
      }
      setOverlayRects(rects);
    })().catch((error: unknown) => {
      if (renderGenerationRef.current !== generation) return;
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      renderTask?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pageNum, scale, savedAnnotations, pendingAnnotations, searchQuery]);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, next), Math.max(1, numPages));
      setPageNum(clamped);
      setPageInput(String(clamped));
    },
    [numPages],
  );

  const handleMouseUp = useCallback(() => {
    if (!activeTool) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const container = textLayerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const containerRect = container.getBoundingClientRect();
    const lineRects: ViewportRect[] = [];
    for (const clientRect of range.getClientRects()) {
      if (clientRect.width <= 0 || clientRect.height <= 0) continue;
      lineRects.push({
        left: clientRect.left - containerRect.left,
        top: clientRect.top - containerRect.top,
        right: clientRect.right - containerRect.left,
        bottom: clientRect.bottom - containerRect.top,
      });
    }
    if (lineRects.length === 0) return;

    const quadPoints = lineRects.flatMap((rect) => rectToQuadPoints(rect, viewport));
    setPendingAnnotations((prev) => [...prev, { pageIndex: pageNum - 1, subtype: activeTool, quadPoints }]);
    selection.removeAllRanges();
  }, [activeTool, pageNum]);

  const handleSave = useCallback(async () => {
    if (pendingAnnotations.length === 0 || !bytesRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextBytes = await applyAnnotationsToPdf(bytesRef.current, pendingAnnotations);
      await writeActiveWorkspaceBinaryFile(path, nextBytes);
      bytesRef.current = nextBytes;
      setSavedAnnotations(await readMarkupAnnotations(nextBytes));
      setPendingAnnotations([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [path, pendingAnnotations]);

  const runSearch = useCallback(
    async (query: string) => {
      const doc = docRef.current;
      if (!doc || !query) {
        setMatchingPages([]);
        setSearchStatus("idle");
        return;
      }
      setSearchStatus("searching");
      const needle = query.toLowerCase();
      const pages: number[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const text = (content.items as PdfTextItem[]).map((item) => item.str ?? "").join(" ");
        if (text.toLowerCase().includes(needle)) pages.push(p);
      }
      if (docRef.current !== doc) return; // path changed mid-search
      setMatchingPages(pages);
      setMatchIndex(0);
      setSearchStatus("done");
      if (pages.length > 0 && !pages.includes(pageNum)) goToPage(pages[0]);
    },
    [pageNum, goToPage],
  );

  const jumpToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchingPages.length === 0) return;
      const nextIndex = (matchIndex + direction + matchingPages.length) % matchingPages.length;
      setMatchIndex(nextIndex);
      goToPage(matchingPages[nextIndex]);
    },
    [matchingPages, matchIndex, goToPage],
  );

  if (status === "error") {
    return (
      <div class="pdf-viewer pdf-viewer-error" role="alert">
        <p>Couldn't open this PDF: {errorMessage}</p>
      </div>
    );
  }

  return (
    <div class="pdf-viewer">
      <div class="pdf-toolbar">
        <button type="button" onClick={() => goToPage(pageNum - 1)} disabled={pageNum <= 1} aria-label="Previous page">
          ‹
        </button>
        <input
          class="pdf-page-input"
          value={pageInput}
          aria-label="Page number"
          onInput={(e) => setPageInput((e.target as HTMLInputElement).value)}
          onChange={(e) => {
            const n = parseInt((e.target as HTMLInputElement).value, 10);
            if (!Number.isNaN(n)) goToPage(n);
            else setPageInput(String(pageNum));
          }}
        />
        <span class="pdf-page-count">/ {numPages || "…"}</span>
        <button type="button" onClick={() => goToPage(pageNum + 1)} disabled={pageNum >= numPages} aria-label="Next page">
          ›
        </button>

        <span class="pdf-toolbar-divider" />

        <button type="button" onClick={() => setScale((s) => clampScale(s / ZOOM_STEP))} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setScale(DEFAULT_SCALE)} aria-label="Reset zoom">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" onClick={() => setScale((s) => clampScale(s * ZOOM_STEP))} aria-label="Zoom in">
          +
        </button>

        <span class="pdf-toolbar-divider" />

        <input
          class="pdf-search-input"
          type="search"
          placeholder="Search text…"
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch(searchQuery);
          }}
        />
        <button type="button" onClick={() => void runSearch(searchQuery)} aria-label="Search">
          Search
        </button>
        {searchStatus === "done" && (
          <span class="pdf-search-status">
            {matchingPages.length === 0
              ? "No matches"
              : `Page ${matchIndex + 1} of ${matchingPages.length} with a match`}
          </span>
        )}
        {matchingPages.length > 1 && (
          <>
            <button type="button" onClick={() => jumpToMatch(-1)} aria-label="Previous match">
              ↑
            </button>
            <button type="button" onClick={() => jumpToMatch(1)} aria-label="Next match">
              ↓
            </button>
          </>
        )}

        <span class="pdf-toolbar-spacer" />

        {(["Highlight", "Underline", "StrikeOut"] as const).map((subtype) => (
          <button
            key={subtype}
            type="button"
            class={activeTool === subtype ? "active" : ""}
            aria-pressed={activeTool === subtype}
            onClick={() => setActiveTool((t) => (t === subtype ? null : subtype))}
            title={subtype === "StrikeOut" ? "Strikethrough" : subtype}
          >
            {subtype === "StrikeOut" ? "Strikethrough" : subtype}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={pendingAnnotations.length === 0 || saving}
        >
          {saving ? "Saving…" : `Save annotations${pendingAnnotations.length ? ` (${pendingAnnotations.length})` : ""}`}
        </button>
      </div>

      {saveError && (
        <div class="save-error-bar" role="alert">
          <span>Couldn't save annotations: {saveError}</span>
          <button type="button" onClick={() => void handleSave()}>
            Retry
          </button>
        </div>
      )}

      <div class="pdf-page-scroll">
        <div
          class="pdf-page-container"
          ref={pageContainerRef}
          onMouseUp={handleMouseUp}
        >
          <canvas ref={canvasRef} class="pdf-page-canvas" />
          <div ref={textLayerRef} class={`pdf-text-layer${activeTool ? " pdf-text-layer-marking" : ""}`} />
          <div class="pdf-annotation-overlay">
            {overlayRects.map((rect, i) => (
              <div
                key={i}
                class={`pdf-annotation-rect pdf-annotation-${rect.subtype.toLowerCase()}${rect.saved ? "" : " pdf-annotation-pending"}`}
                style={{
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${rect.right - rect.left}px`,
                  height: `${rect.bottom - rect.top}px`,
                  backgroundColor:
                    rect.subtype === "Highlight"
                      ? `rgba(${rect.color.r * 255}, ${rect.color.g * 255}, ${rect.color.b * 255}, ${rect.opacity})`
                      : undefined,
                  borderBottom:
                    rect.subtype === "Underline"
                      ? `2px solid rgba(${rect.color.r * 255}, ${rect.color.g * 255}, ${rect.color.b * 255}, ${rect.opacity})`
                      : undefined,
                }}
              >
                {rect.subtype === "StrikeOut" && (
                  <span
                    class="pdf-annotation-strike-line"
                    style={{
                      backgroundColor: `rgba(${rect.color.r * 255}, ${rect.color.g * 255}, ${rect.color.b * 255}, ${rect.opacity})`,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
