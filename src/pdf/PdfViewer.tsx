import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, PDFJS_CMAP_URL, PDFJS_ICC_URL, PDFJS_STANDARD_FONT_DATA_URL, PDFJS_WASM_URL } from "./pdfWorker";
import "./pdfViewer.css";
import {
  applyAnnotationsToPdf,
  applyInkAnnotationsToPdf,
  applyShapeAnnotationsToPdf,
  applyStickyNotesToPdf,
  DEFAULT_INK_COLOR,
  DEFAULT_INK_WIDTH,
  DEFAULT_MARKUP_COLOR,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_STICKY_NOTE_COLOR,
  quadPointsToViewportRects,
  readInkAnnotations,
  readMarkupAnnotations,
  readShapeAnnotations,
  readStickyNotes,
  rectToQuadPoints,
} from "./pdfAnnotations";
import type {
  MarkupSubtype,
  PendingAnnotation,
  PendingInkAnnotation,
  PendingShapeAnnotation,
  PendingStickyNote,
  RgbColor,
  SavedAnnotation,
  SavedInkAnnotation,
  SavedShapeAnnotation,
  SavedStickyNote,
  ShapeSubtype,
  ViewportRect,
} from "./pdfAnnotations";
import { readBinaryFile, writeActiveWorkspaceBinaryFile } from "../workspace/tauriBridge";
import { InkSurface } from "../ink/InkSurface";
import type { InkPoint, InkStroke } from "../ink/inkDocument";

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

/** PDF Phase 2's page-position tools, alongside Phase 1's three text-span
 * markup tools above. */
type DrawingTool = MarkupSubtype | "Ink" | "StickyNote" | ShapeSubtype;

const MARKUP_TOOLS: ReadonlySet<DrawingTool> = new Set(["Highlight", "Underline", "StrikeOut"]);
const SHAPE_TOOLS: ReadonlySet<DrawingTool> = new Set<DrawingTool>(["Square", "Circle", "Line", "Polygon"]);

function isMarkupTool(tool: DrawingTool | null): tool is MarkupSubtype {
  return tool !== null && MARKUP_TOOLS.has(tool);
}
function isShapeTool(tool: DrawingTool | null): tool is ShapeSubtype {
  return tool !== null && SHAPE_TOOLS.has(tool);
}

/** A viewport-pixel point, the coordinate space every pointer/mouse event
 * on the page container is captured in before conversion to PDF space. */
interface ViewportPoint {
  x: number;
  y: number;
}

interface InkOverlayStroke {
  points: ViewportPoint[];
  color: RgbColor;
  width: number;
}

interface ShapeOverlay {
  subtype: ShapeSubtype;
  points: ViewportPoint[];
  color: RgbColor;
  width: number;
}

interface StickyNoteOverlay {
  x: number;
  y: number;
  contents: string;
  color: RgbColor;
}

/** A minimal local stand-in for pdf.js's own (not publicly re-exported)
 * `TextItem` type -- only the field this component actually reads. */
interface PdfTextItem {
  str: string;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Converts a pointer/mouse event's client coordinates into coordinates
 * relative to the page container's own top-left corner -- the same
 * viewport-pixel space `rectToQuadPoints`/`viewport.convertToPdfPoint`
 * already work in. */
function pointFromEvent(event: { clientX: number; clientY: number }, container: HTMLElement): ViewportPoint {
  const rect = container.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function rgbCss(color: RgbColor): string {
  return `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
}

/** CSS pixels; matches `pdfAnnotations.ts`'s `STICKY_NOTE_ICON_SIZE`'s
 * intent (a fixed-size icon regardless of zoom) closely enough for the
 * viewer's own display -- the two are independent constants since one is
 * a PDF-point size baked into the saved annotation's `/Rect` and the
 * other is a CSS pixel size for this component's own icon glyph. */
const STICKY_NOTE_OVERLAY_SIZE = 20;

/** Renders one shape overlay (a saved/pending annotation, or the live
 * in-progress drag/click preview reusing the same shape) as plain SVG,
 * mirroring each subtype's real PDF geometry: Square/Circle draw
 * inscribed in the two corner points' bounding box, Line connects its
 * two endpoints, Polygon connects three or more vertices. */
function renderShapeSvg(shape: ShapeOverlay, key: string) {
  const stroke = rgbCss(shape.color);
  const common = { stroke, "stroke-width": shape.width, fill: "none" };
  if (shape.subtype === "Line") {
    const [a, b] = shape.points;
    if (!a || !b) return null;
    return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />;
  }
  if (shape.subtype === "Polygon") {
    if (shape.points.length < 2) return null;
    // A real <polygon> (spec: Polygon annotations are closed shapes,
    // unlike PolyLine) auto-closes back to the first vertex, including
    // for the still-in-progress draft preview.
    return <polygon key={key} points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")} {...common} />;
  }
  const [a, b] = shape.points;
  if (!a || !b) return null;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  if (shape.subtype === "Circle") {
    return (
      <ellipse key={key} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...common} />
    );
  }
  return <rect key={key} x={x} y={y} width={width} height={height} {...common} />;
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
 *
 * PDF Phase 2 (ROADMAP.md's "PDF Phase 2" entry) adds freehand ink,
 * sticky notes, and simple shapes for scanned/image-only PDFs with no
 * text layer to anchor Phase 1's markup tools to: each attaches to a
 * page position instead. Ink reuses `ink/InkSurface.tsx` unmodified (the
 * same controlled pointer-capture drawing surface the standalone ink
 * note kind uses) rather than a second freehand-drawing implementation,
 * mounted only while the Ink tool is active so it doesn't intercept
 * pointer events other tools need; its own committed-stroke points are
 * converted to PDF user-space the same way Phase 1 converts a text
 * selection's rects, through the real `PageViewport`. Shapes use plain
 * pointer-drag (Square/Circle/Line) or click-to-add-vertex/double-click-
 * to-finish (Polygon) directly on the page container. Sticky notes are
 * click-to-place with an inline textarea. All three write back through
 * new sibling functions in `pdfAnnotations.ts` in the same single
 * "Save annotations" action as Phase 1's markup annotations.
 */
export function PdfViewer({ path }: PdfViewerProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [pendingAnnotations, setPendingAnnotations] = useState<PendingAnnotation[]>([]);
  const [savedAnnotations, setSavedAnnotations] = useState<SavedAnnotation[]>([]);
  const [pendingInk, setPendingInk] = useState<PendingInkAnnotation[]>([]);
  const [savedInk, setSavedInk] = useState<SavedInkAnnotation[]>([]);
  const [pendingStickyNotes, setPendingStickyNotes] = useState<PendingStickyNote[]>([]);
  const [savedStickyNotes, setSavedStickyNotes] = useState<SavedStickyNote[]>([]);
  const [pendingShapes, setPendingShapes] = useState<PendingShapeAnnotation[]>([]);
  const [savedShapes, setSavedShapes] = useState<SavedShapeAnnotation[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "done">("idle");
  const [matchingPages, setMatchingPages] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([]);
  const [inkOverlayStrokes, setInkOverlayStrokes] = useState<InkOverlayStroke[]>([]);
  const [shapeOverlays, setShapeOverlays] = useState<ShapeOverlay[]>([]);
  const [stickyOverlays, setStickyOverlays] = useState<StickyNoteOverlay[]>([]);
  const [shapeDraft, setShapeDraft] = useState<{ subtype: ShapeSubtype; points: ViewportPoint[] } | null>(null);
  const [stickyDraft, setStickyDraft] = useState<{ domX: number; domY: number; text: string } | null>(null);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const textLayerTaskRef = useRef<{ cancel(): void } | null>(null);
  const renderGenerationRef = useRef(0);
  const shapeDragRef = useRef<{ subtype: ShapeSubtype; start: ViewportPoint } | null>(null);

  // Load the document fresh whenever the open path changes.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    setPendingAnnotations([]);
    setSavedAnnotations([]);
    setPendingInk([]);
    setSavedInk([]);
    setPendingStickyNotes([]);
    setSavedStickyNotes([]);
    setPendingShapes([]);
    setSavedShapes([]);
    setShapeDraft(null);
    setStickyDraft(null);
    setActiveTool(null);
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
      // pdf.js's `getDocument({ data })` transfers the given Uint8Array's
      // underlying ArrayBuffer to its worker (confirmed against the real,
      // installed pdfjs-dist build in a real browser, not assumed):
      // `bytes` itself would read back zero-length immediately afterward.
      // `bytesRef`/`readMarkupAnnotations` below need the real, untouched
      // bytes for annotation saving, so pdf.js gets its own copy.
      const doc = await pdfjsLib.getDocument({
        data: bytes.slice(),
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
      const [existingMarkup, existingInk, existingSticky, existingShapes] = await Promise.all([
        readMarkupAnnotations(bytes),
        readInkAnnotations(bytes),
        readStickyNotes(bytes),
        readShapeAnnotations(bytes),
      ]);
      if (cancelled) return;
      setSavedAnnotations(existingMarkup);
      setSavedInk(existingInk);
      setSavedStickyNotes(existingSticky);
      setSavedShapes(existingShapes);
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

      const inkStrokes: InkOverlayStroke[] = [];
      for (const ink of [...savedInk, ...pendingInk]) {
        if (ink.pageIndex !== pageIndex) continue;
        const color = ink.color ?? DEFAULT_INK_COLOR;
        const width = ink.width ?? DEFAULT_INK_WIDTH;
        for (const stroke of ink.inkList) {
          const points: ViewportPoint[] = [];
          for (let i = 0; i + 1 < stroke.length; i += 2) {
            const [x, y] = viewport.convertToViewportPoint(stroke[i], stroke[i + 1]);
            points.push({ x, y });
          }
          if (points.length > 0) inkStrokes.push({ points, color, width });
        }
      }
      setInkOverlayStrokes(inkStrokes);

      const shapes: ShapeOverlay[] = [];
      for (const shape of [...savedShapes, ...pendingShapes]) {
        if (shape.pageIndex !== pageIndex) continue;
        const color = shape.color ?? DEFAULT_SHAPE_COLOR;
        const width = shape.width ?? DEFAULT_SHAPE_WIDTH;
        const points: ViewportPoint[] = [];
        for (let i = 0; i + 1 < shape.points.length; i += 2) {
          const [x, y] = viewport.convertToViewportPoint(shape.points[i], shape.points[i + 1]);
          points.push({ x, y });
        }
        shapes.push({ subtype: shape.subtype, points, color, width });
      }
      setShapeOverlays(shapes);

      const stickies: StickyNoteOverlay[] = [];
      for (const note of [...savedStickyNotes, ...pendingStickyNotes]) {
        if (note.pageIndex !== pageIndex) continue;
        const [x, y] = viewport.convertToViewportPoint(note.x, note.y);
        const color = note.color ?? DEFAULT_STICKY_NOTE_COLOR;
        stickies.push({ x, y, contents: note.contents, color });
      }
      setStickyOverlays(stickies);
    })().catch((error: unknown) => {
      if (renderGenerationRef.current !== generation) return;
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      renderTask?.cancel();
    };
  }, [
    status,
    pageNum,
    scale,
    savedAnnotations,
    pendingAnnotations,
    savedInk,
    pendingInk,
    savedShapes,
    pendingShapes,
    savedStickyNotes,
    pendingStickyNotes,
    searchQuery,
  ]);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, next), Math.max(1, numPages));
      setPageNum(clamped);
      setPageInput(String(clamped));
    },
    [numPages],
  );

  const handleMarkupMouseUp = useCallback(() => {
    if (!isMarkupTool(activeTool)) return;
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

  const pendingCount =
    pendingAnnotations.length + pendingInk.length + pendingStickyNotes.length + pendingShapes.length;

  const handleSave = useCallback(async () => {
    if (pendingCount === 0 || !bytesRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Each apply*ToPdf call is its own pdf-lib load/save pass; chaining
      // them (rather than one combined function) keeps Phase 1's writer
      // untouched and lets each annotation kind stay independently
      // testable, at the cost of parsing/serializing the document up to
      // four times per save instead of once -- fine at the annotation
      // counts a real editing session produces.
      let nextBytes = bytesRef.current;
      if (pendingAnnotations.length > 0) nextBytes = await applyAnnotationsToPdf(nextBytes, pendingAnnotations);
      if (pendingInk.length > 0) nextBytes = await applyInkAnnotationsToPdf(nextBytes, pendingInk);
      if (pendingStickyNotes.length > 0) nextBytes = await applyStickyNotesToPdf(nextBytes, pendingStickyNotes);
      if (pendingShapes.length > 0) nextBytes = await applyShapeAnnotationsToPdf(nextBytes, pendingShapes);

      await writeActiveWorkspaceBinaryFile(path, nextBytes);
      bytesRef.current = nextBytes;
      const [markup, ink, sticky, shapes] = await Promise.all([
        readMarkupAnnotations(nextBytes),
        readInkAnnotations(nextBytes),
        readStickyNotes(nextBytes),
        readShapeAnnotations(nextBytes),
      ]);
      setSavedAnnotations(markup);
      setSavedInk(ink);
      setSavedStickyNotes(sticky);
      setSavedShapes(shapes);
      setPendingAnnotations([]);
      setPendingInk([]);
      setPendingStickyNotes([]);
      setPendingShapes([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [path, pendingCount, pendingAnnotations, pendingInk, pendingStickyNotes, pendingShapes]);

  const handleCommitInkStroke = useCallback(
    (stroke: InkStroke) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const flat = stroke.points.flatMap((point: InkPoint) => viewport.convertToPdfPoint(point.x, point.y));
      setPendingInk((prev) => [...prev, { pageIndex: pageNum - 1, inkList: [flat] }]);
    },
    [pageNum],
  );

  const handleShapeDragStart = useCallback(
    (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      if (!isShapeTool(activeTool) || activeTool === "Polygon") return;
      const container = pageContainerRef.current;
      if (!container) return;
      const point = pointFromEvent(event, container);
      shapeDragRef.current = { subtype: activeTool, start: point };
      setShapeDraft({ subtype: activeTool, points: [point, point] });
    },
    [activeTool],
  );

  const handleShapeDragMove = useCallback((event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!shapeDragRef.current) return;
    const container = pageContainerRef.current;
    if (!container) return;
    const point = pointFromEvent(event, container);
    setShapeDraft({ subtype: shapeDragRef.current.subtype, points: [shapeDragRef.current.start, point] });
  }, []);

  const handleShapeDragEnd = useCallback(
    (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      const drag = shapeDragRef.current;
      if (!drag) return;
      shapeDragRef.current = null;
      setShapeDraft(null);
      const container = pageContainerRef.current;
      const viewport = viewportRef.current;
      if (!container || !viewport) return;
      const end = pointFromEvent(event, container);
      // A drag shorter than this is almost certainly a stray click, not
      // an intended (degenerate, invisible) shape.
      if (Math.abs(end.x - drag.start.x) < 3 && Math.abs(end.y - drag.start.y) < 3) return;
      const points = [
        ...viewport.convertToPdfPoint(drag.start.x, drag.start.y),
        ...viewport.convertToPdfPoint(end.x, end.y),
      ];
      setPendingShapes((prev) => [...prev, { pageIndex: pageNum - 1, subtype: drag.subtype, points }]);
    },
    [pageNum],
  );

  const handleContainerClick = useCallback(
    (event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
      const container = pageContainerRef.current;
      if (!container) return;
      const point = pointFromEvent(event, container);

      if (activeTool === "Polygon") {
        setShapeDraft((prev) => ({
          subtype: "Polygon",
          points: prev && prev.subtype === "Polygon" ? [...prev.points, point] : [point],
        }));
        return;
      }

      if (activeTool === "StickyNote") {
        setStickyDraft({ domX: point.x, domY: point.y, text: "" });
      }
    },
    [activeTool],
  );

  const handleFinishPolygon = useCallback(() => {
    const viewport = viewportRef.current;
    if (!shapeDraft || shapeDraft.subtype !== "Polygon" || !viewport) return;
    if (shapeDraft.points.length < 3) {
      setShapeDraft(null);
      return;
    }
    const points = shapeDraft.points.flatMap((point) => viewport.convertToPdfPoint(point.x, point.y));
    setPendingShapes((prev) => [...prev, { pageIndex: pageNum - 1, subtype: "Polygon", points }]);
    setShapeDraft(null);
  }, [shapeDraft, pageNum]);

  const commitStickyDraft = useCallback(() => {
    const viewport = viewportRef.current;
    if (!stickyDraft || !viewport || stickyDraft.text.trim().length === 0) {
      setStickyDraft(null);
      return;
    }
    const [x, y] = viewport.convertToPdfPoint(stickyDraft.domX, stickyDraft.domY);
    setPendingStickyNotes((prev) => [...prev, { pageIndex: pageNum - 1, x, y, contents: stickyDraft.text }]);
    setStickyDraft(null);
  }, [stickyDraft, pageNum]);

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
            onClick={() => {
              setShapeDraft(null);
              setActiveTool((t) => (t === subtype ? null : subtype));
            }}
            title={subtype === "StrikeOut" ? "Strikethrough" : subtype}
          >
            {subtype === "StrikeOut" ? "Strikethrough" : subtype}
          </button>
        ))}

        <span class="pdf-toolbar-divider" />

        <button
          type="button"
          class={activeTool === "Ink" ? "active" : ""}
          aria-pressed={activeTool === "Ink"}
          title="Draw"
          onClick={() => {
            setShapeDraft(null);
            setActiveTool((t) => (t === "Ink" ? null : "Ink"));
          }}
        >
          Draw
        </button>
        <button
          type="button"
          class={activeTool === "StickyNote" ? "active" : ""}
          aria-pressed={activeTool === "StickyNote"}
          title="Sticky note"
          onClick={() => {
            setShapeDraft(null);
            setActiveTool((t) => (t === "StickyNote" ? null : "StickyNote"));
          }}
        >
          Note
        </button>
        {(["Square", "Circle", "Line", "Polygon"] as const).map((subtype) => (
          <button
            key={subtype}
            type="button"
            class={activeTool === subtype ? "active" : ""}
            aria-pressed={activeTool === subtype}
            title={subtype}
            onClick={() => {
              setShapeDraft(null);
              setActiveTool((t) => (t === subtype ? null : subtype));
            }}
          >
            {subtype}
          </button>
        ))}
        {activeTool === "Polygon" && shapeDraft?.subtype === "Polygon" && (
          <button type="button" onClick={handleFinishPolygon} disabled={shapeDraft.points.length < 3}>
            Finish shape ({shapeDraft.points.length})
          </button>
        )}

        <button type="button" onClick={() => void handleSave()} disabled={pendingCount === 0 || saving}>
          {saving ? "Saving…" : `Save annotations${pendingCount ? ` (${pendingCount})` : ""}`}
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
          onMouseUp={handleMarkupMouseUp}
          onClick={handleContainerClick}
          onDblClick={handleFinishPolygon}
          onPointerDown={handleShapeDragStart}
          onPointerMove={handleShapeDragMove}
          onPointerUp={handleShapeDragEnd}
        >
          <canvas ref={canvasRef} class="pdf-page-canvas" />
          <div ref={textLayerRef} class={`pdf-text-layer${activeTool ? " pdf-text-layer-marking" : ""}`} />
          {activeTool === "Ink" && (
            <InkSurface strokes={[]} tool="pen" onCommitStroke={handleCommitInkStroke} />
          )}
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

          <svg class="pdf-drawing-overlay">
            {inkOverlayStrokes.map((stroke, i) => (
              <polyline
                key={`ink-${i}`}
                points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={rgbCss(stroke.color)}
                stroke-width={stroke.width}
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            ))}
            {shapeOverlays.map((shape, i) => renderShapeSvg(shape, `shape-${i}`))}
            {shapeDraft && shapeDraft.points.length > 0 && (
              <g class="pdf-shape-draft">
                {shapeDraft.subtype === "Polygon"
                  ? renderShapeSvg(
                      { subtype: "Polygon", points: shapeDraft.points, color: DEFAULT_SHAPE_COLOR, width: DEFAULT_SHAPE_WIDTH },
                      "shape-draft",
                    )
                  : shapeDraft.points.length === 2 &&
                    renderShapeSvg(
                      {
                        subtype: shapeDraft.subtype,
                        points: shapeDraft.points,
                        color: DEFAULT_SHAPE_COLOR,
                        width: DEFAULT_SHAPE_WIDTH,
                      },
                      "shape-draft",
                    )}
              </g>
            )}
          </svg>

          <div class="pdf-annotation-overlay">
            {stickyOverlays.map((note, i) => (
              <div
                key={i}
                class="pdf-sticky-note-icon"
                title={note.contents}
                style={{ left: `${note.x}px`, top: `${note.y - STICKY_NOTE_OVERLAY_SIZE}px`, backgroundColor: rgbCss(note.color) }}
              >
                🗒
              </div>
            ))}
          </div>

          {stickyDraft && (
            <div
              class="pdf-sticky-note-draft"
              style={{ left: `${stickyDraft.domX}px`, top: `${stickyDraft.domY}px` }}
            >
              <textarea
                autoFocus
                value={stickyDraft.text}
                placeholder="Note text…"
                onInput={(e) => setStickyDraft((d) => (d ? { ...d, text: (e.target as HTMLTextAreaElement).value } : d))}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setStickyDraft(null);
                  } else if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitStickyDraft();
                  }
                }}
                onBlur={commitStickyDraft}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
