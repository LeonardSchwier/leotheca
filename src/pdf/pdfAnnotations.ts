import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";

/**
 * Standard PDF text-markup annotation subtypes (ISO 32000-1 section
 * 12.5.6.10). All three share the same QuadPoints-based geometry; only the
 * rendered mark differs.
 */
export type MarkupSubtype = "Highlight" | "Underline" | "StrikeOut";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const DEFAULT_MARKUP_COLOR: Record<MarkupSubtype, RgbColor> = {
  Highlight: { r: 1, g: 0.92, b: 0.23 },
  Underline: { r: 0.2, g: 0.47, b: 0.96 },
  StrikeOut: { r: 0.9, g: 0.2, b: 0.2 },
};

const DEFAULT_OPACITY: Record<MarkupSubtype, number> = {
  Highlight: 0.4,
  Underline: 1,
  StrikeOut: 1,
};

/**
 * One markup annotation to add to a specific page. `quadPoints` is a flat
 * array of `x, y` pairs in PDF user-space, one quad (4 points, 8 numbers)
 * per selected line -- the same shape a viewer's own text selection
 * naturally produces when a selection spans more than one line.
 */
export interface PendingAnnotation {
  pageIndex: number;
  subtype: MarkupSubtype;
  quadPoints: number[];
  color?: RgbColor;
  opacity?: number;
  contents?: string;
}

/** A minimal, DOM-free stand-in for pdf.js's own `PageViewport`, so this
 * module's coordinate math is unit-testable without a real PDF.js viewport
 * instance. Both methods mirror `PageViewport`'s real signatures exactly. */
export interface PdfPointConverter {
  // pdf.js's real `PageViewport` methods are typed as returning `any[]`
  // (its own .d.ts is JSDoc-derived and doesn't narrow the tuple shape),
  // so this stays `number[]` rather than a `[number, number]` tuple to
  // accept the real class without a cast at every call site.
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}

/** A plain rectangle in the same coordinate space `PdfPointConverter`
 * expects -- pdf.js's own viewport-relative CSS pixels, i.e. what
 * `Range.getClientRects()` produces once translated into the text layer's
 * own local coordinate space (see `PdfViewer.tsx`). */
export interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Converts one selection-line rectangle into an 8-number PDF QuadPoints
 * quad. PDF's QuadPoints order per the spec is top-left, top-right,
 * bottom-left, bottom-right -- NOT reading-order-around-the-rectangle --
 * and PDF user-space Y grows upward while DOM/viewport Y grows downward,
 * which `convertToPdfPoint` (pdf.js's own inverse-of-render-transform
 * helper) already accounts for, so this function only has to pick the
 * right four corners and call it.
 */
export function rectToQuadPoints(rect: ViewportRect, viewport: PdfPointConverter): number[] {
  const [x1, y1] = viewport.convertToPdfPoint(rect.left, rect.top);
  const [x2, y2] = viewport.convertToPdfPoint(rect.right, rect.top);
  const [x3, y3] = viewport.convertToPdfPoint(rect.left, rect.bottom);
  const [x4, y4] = viewport.convertToPdfPoint(rect.right, rect.bottom);
  return [x1, y1, x2, y2, x3, y3, x4, y4];
}

/** The inverse of `rectToQuadPoints`: reconstructs the DOM/viewport-space
 * rectangles a stored `quadPoints` array (multiples of 8 numbers, one quad
 * per selection line) describes, so a not-yet-saved annotation from this
 * session can be redrawn as an overlay when the user navigates back to its
 * page, without re-reading the file. */
export function quadPointsToViewportRects(quadPoints: number[], viewport: PdfPointConverter): ViewportRect[] {
  const rects: ViewportRect[] = [];
  for (let i = 0; i + 7 < quadPoints.length; i += 8) {
    rects.push(quadToViewportRect(quadPoints.slice(i, i + 8), viewport));
  }
  return rects;
}

function quadToViewportRect(quad: number[], viewport: PdfPointConverter): ViewportRect {
  // rectToQuadPoints wrote these as [topLeft, topRight, bottomLeft,
  // bottomRight] PDF points; convertToViewportPoint maps them back.
  const [x1, y1] = viewport.convertToViewportPoint(quad[0], quad[1]);
  const [x2] = viewport.convertToViewportPoint(quad[2], quad[3]);
  const [, y3] = viewport.convertToViewportPoint(quad[4], quad[5]);
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y3),
    bottom: Math.max(y1, y3),
  };
}

/** The `/Rect` PDF requires alongside `/QuadPoints`: the annotation's own
 * axis-aligned bounding box, in the same PDF user-space coordinates. */
function boundingRect(quadPoints: number[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < quadPoints.length; i += 2) {
    const x = quadPoints[i];
    const y = quadPoints[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** PDF's own date-string format (ISO 32000-1 section 7.9.4): D:YYYYMMDDHHmmSSOHH'mm'. */
function toPdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Loads a PDF's bytes, adds each pending annotation as a real, standard
 * `/Type /Annot` object on its target page's `/Annots` array (not a
 * sidecar file, not pdf.js's own AnnotationStorage overlay), and returns
 * the re-saved bytes. Building the annotation dictionary by hand rather
 * than through a subtype-specific pdf-lib helper is deliberate: pdf-lib
 * has no first-class Highlight/Underline/StrikeOut API, but its low-level
 * `context.obj`/`context.register` plus `PDFPageLeaf.addAnnot` are exactly
 * the primitives the PDF spec itself describes for a text-markup
 * annotation, so this stays a thin, literal translation of the spec
 * rather than a workaround.
 */
export async function applyAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: PendingAnnotation[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();
  const now = new Date();

  for (const annotation of annotations) {
    const page = pages[annotation.pageIndex];
    if (!page) {
      throw new Error(`Cannot annotate page ${annotation.pageIndex}: the PDF only has ${pages.length} page(s).`);
    }
    const color = annotation.color ?? DEFAULT_MARKUP_COLOR[annotation.subtype];
    const opacity = annotation.opacity ?? DEFAULT_OPACITY[annotation.subtype];
    const dict = pdfDoc.context.obj({
      Type: "Annot",
      Subtype: annotation.subtype,
      Rect: boundingRect(annotation.quadPoints),
      QuadPoints: annotation.quadPoints,
      C: [color.r, color.g, color.b],
      CA: opacity,
      Contents: PDFString.of(annotation.contents ?? ""),
      T: PDFString.of("Leotheca"),
      M: PDFString.of(toPdfDate(now)),
      // Print flag (bit 3, value 4): the annotation is part of the page's
      // normal appearance rather than a screen-only marker, matching how
      // every mainstream reader treats a highlight/underline/strikeout.
      F: 4,
    });
    const ref = pdfDoc.context.register(dict);
    page.node.addAnnot(ref);
  }

  return pdfDoc.save();
}

/** An already-saved markup annotation, as read back off disk. Same shape
 * as `PendingAnnotation` minus `contents` (round-tripped but not currently
 * surfaced in the viewer's own overlay) plus a resolved (never-undefined)
 * color/opacity, since a saved annotation's dictionary always has one. */
export interface SavedAnnotation {
  pageIndex: number;
  subtype: MarkupSubtype;
  quadPoints: number[];
  color: RgbColor;
  opacity: number;
}

function subtypeOf(dict: PDFDict): MarkupSubtype | null {
  // PDFName#asString() includes the leading slash (e.g. "/Highlight").
  switch (dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString()) {
    case "/Highlight":
      return "Highlight";
    case "/Underline":
      return "Underline";
    case "/StrikeOut":
      return "StrikeOut";
    default:
      return null;
  }
}

function shapeSubtypeOf(dict: PDFDict): ShapeSubtype | null {
  switch (dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString()) {
    case "/Square":
      return "Square";
    case "/Circle":
      return "Circle";
    case "/Line":
      return "Line";
    case "/Polygon":
      return "Polygon";
    default:
      return null;
  }
}

/** A dictionary's string-valued field can round-trip through pdf-lib's
 * own save as either literal `(...)` or hex `<...>` syntax; readers must
 * accept either. */
function stringOf(dict: PDFDict, key: string): string | undefined {
  return (
    dict.lookupMaybe(PDFName.of(key), PDFString)?.decodeText() ??
    dict.lookupMaybe(PDFName.of(key), PDFHexString)?.decodeText()
  );
}

function numbersOf(dict: PDFDict, key: string): number[] {
  const array = dict.lookupMaybe(PDFName.of(key), PDFArray);
  if (!array) return [];
  const numbers: number[] = [];
  for (let i = 0; i < array.size(); i++) {
    const n = array.lookupMaybe(i, PDFNumber);
    if (n) numbers.push(n.asNumber());
  }
  return numbers;
}

/**
 * Reads every standard text-markup annotation (Highlight/Underline/
 * StrikeOut) already present in a PDF's bytes, in the same structured
 * shape `applyAnnotationsToPdf` writes them in. Used by the viewer to
 * render already-saved annotations as overlays on open, and to prove
 * (both here and in this module's own tests) that a save genuinely
 * round-trips as a standard object rather than something only this app's
 * own writer can read back.
 */
export async function readMarkupAnnotations(bytes: Uint8Array): Promise<SavedAnnotation[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const results: SavedAnnotation[] = [];
  const pages = pdfDoc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const annots = pages[pageIndex].node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      let dict: PDFDict;
      try {
        dict = annots.lookup(i, PDFDict);
      } catch {
        continue;
      }
      const subtype = subtypeOf(dict);
      if (!subtype) continue;
      const quadPoints = numbersOf(dict, "QuadPoints");
      if (quadPoints.length < 8) continue;
      const c = numbersOf(dict, "C");
      const color: RgbColor =
        c.length === 3 ? { r: c[0], g: c[1], b: c[2] } : DEFAULT_MARKUP_COLOR[subtype];
      const opacity = dict.lookupMaybe(PDFName.of("CA"), PDFNumber)?.asNumber() ?? DEFAULT_OPACITY[subtype];
      results.push({ pageIndex, subtype, quadPoints, color, opacity });
    }
  }
  return results;
}

/** Whether a page has at least one standard text-markup annotation, used
 * by round-trip tests. */
export async function countMarkupAnnotations(bytes: Uint8Array): Promise<number> {
  return (await readMarkupAnnotations(bytes)).length;
}

// ---------------------------------------------------------------------
// PDF Phase 2: freehand ink, sticky notes, and simple shapes for scanned/
// image-only PDFs (ROADMAP.md's "PDF Phase 2" entry). Unlike the markup
// annotations above, these attach to a page position rather than a text
// span -- a scanned PDF has no text layer to anchor QuadPoints to -- so
// each has its own geometry (ISO 32000-1 section 12.5.6.13 "Ink
// Annotations", 12.5.6.4 "Text Annotations", 12.5.6.9 "Line, Square,
// Circle, Polygon, and PolyLine Annotations"), still built by hand via
// the same low-level pdf-lib primitives for the same reason: pdf-lib has
// no first-class helper for any of these subtypes either.
// ---------------------------------------------------------------------

export const DEFAULT_INK_COLOR: RgbColor = { r: 0.1, g: 0.1, b: 0.6 };
export const DEFAULT_INK_WIDTH = 2;
export const DEFAULT_SHAPE_COLOR: RgbColor = { r: 0.85, g: 0.15, b: 0.15 };
export const DEFAULT_SHAPE_WIDTH = 2;
export const DEFAULT_STICKY_NOTE_COLOR: RgbColor = { r: 1, g: 0.86, b: 0.4 };
/** PDF points (1/72 inch); most readers draw a sticky-note icon around
 * this size regardless of the page's own scale. */
const STICKY_NOTE_ICON_SIZE = 18;

/** One freehand ink annotation. `inkList` is one sub-array per stroke
 * (a page can carry more than one stroke as a single annotation, same as
 * a real PDF reader's own "Ink" tool groups a single pen-down-to-pen-up
 * gesture as one stroke, but this app writes one annotation per
 * `InkSurface` `onCommitStroke` call, so in practice each has exactly
 * one), each a flat `[x1, y1, x2, y2, ...]` list in PDF user-space. */
export interface PendingInkAnnotation {
  pageIndex: number;
  inkList: number[][];
  color?: RgbColor;
  width?: number;
}

export interface SavedInkAnnotation {
  pageIndex: number;
  inkList: number[][];
  color: RgbColor;
  width: number;
}

/** One sticky note, anchored at a single PDF user-space point (its
 * icon's top-left corner; PDF Y grows upward, so the icon occupies
 * `[x, y - size, x + size, y]`). */
export interface PendingStickyNote {
  pageIndex: number;
  x: number;
  y: number;
  contents: string;
  color?: RgbColor;
}

export interface SavedStickyNote {
  pageIndex: number;
  x: number;
  y: number;
  contents: string;
  color: RgbColor;
}

export type ShapeSubtype = "Square" | "Circle" | "Line" | "Polygon";

/** One simple shape. `points` is a flat `[x, y, ...]` list in PDF
 * user-space: exactly two points (the rectangle's opposite corners) for
 * Square/Circle -- both are drawn inscribed in `/Rect` per the spec, no
 * separate geometry field -- exactly two points (the endpoints) for
 * Line, and three or more vertices for Polygon. */
export interface PendingShapeAnnotation {
  pageIndex: number;
  subtype: ShapeSubtype;
  points: number[];
  color?: RgbColor;
  width?: number;
}

export interface SavedShapeAnnotation {
  pageIndex: number;
  subtype: ShapeSubtype;
  points: number[];
  color: RgbColor;
  width: number;
}

function annotBase(subtype: string, rect: number[], color: RgbColor, now: Date) {
  return {
    Type: "Annot",
    Subtype: subtype,
    Rect: rect,
    C: [color.r, color.g, color.b],
    T: PDFString.of("Leotheca"),
    M: PDFString.of(toPdfDate(now)),
    F: 4,
  };
}

/** Adds each pending ink stroke as a real `/Subtype /Ink` annotation. */
export async function applyInkAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: PendingInkAnnotation[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();
  const now = new Date();

  for (const annotation of annotations) {
    const page = pages[annotation.pageIndex];
    if (!page) {
      throw new Error(`Cannot annotate page ${annotation.pageIndex}: the PDF only has ${pages.length} page(s).`);
    }
    const color = annotation.color ?? DEFAULT_INK_COLOR;
    const width = annotation.width ?? DEFAULT_INK_WIDTH;
    const dict = pdfDoc.context.obj({
      ...annotBase("Ink", boundingRect(annotation.inkList.flat()), color, now),
      InkList: annotation.inkList,
      BS: { W: width },
    });
    page.node.addAnnot(pdfDoc.context.register(dict));
  }

  return pdfDoc.save();
}

/** Adds each pending sticky note as a real `/Subtype /Text` annotation. */
export async function applyStickyNotesToPdf(
  bytes: Uint8Array,
  notes: PendingStickyNote[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();
  const now = new Date();

  for (const note of notes) {
    const page = pages[note.pageIndex];
    if (!page) {
      throw new Error(`Cannot annotate page ${note.pageIndex}: the PDF only has ${pages.length} page(s).`);
    }
    const color = note.color ?? DEFAULT_STICKY_NOTE_COLOR;
    const rect = [note.x, note.y - STICKY_NOTE_ICON_SIZE, note.x + STICKY_NOTE_ICON_SIZE, note.y];
    const dict = pdfDoc.context.obj({
      ...annotBase("Text", rect, color, now),
      Contents: PDFString.of(note.contents),
      Name: "Comment",
      Open: false,
    });
    page.node.addAnnot(pdfDoc.context.register(dict));
  }

  return pdfDoc.save();
}

/** Adds each pending shape as a real `/Subtype /Square|/Circle|/Line|
 * /Polygon` annotation. */
export async function applyShapeAnnotationsToPdf(
  bytes: Uint8Array,
  shapes: PendingShapeAnnotation[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();
  const now = new Date();

  for (const shape of shapes) {
    const page = pages[shape.pageIndex];
    if (!page) {
      throw new Error(`Cannot annotate page ${shape.pageIndex}: the PDF only has ${pages.length} page(s).`);
    }
    const color = shape.color ?? DEFAULT_SHAPE_COLOR;
    const width = shape.width ?? DEFAULT_SHAPE_WIDTH;
    const dict = pdfDoc.context.obj({
      ...annotBase(shape.subtype, boundingRect(shape.points), color, now),
      BS: { W: width },
      ...(shape.subtype === "Line" ? { L: shape.points } : {}),
      ...(shape.subtype === "Polygon" ? { Vertices: shape.points } : {}),
    });
    page.node.addAnnot(pdfDoc.context.register(dict));
  }

  return pdfDoc.save();
}

/** Reads every `/Subtype /Ink` annotation back, inverse of
 * `applyInkAnnotationsToPdf`. */
export async function readInkAnnotations(bytes: Uint8Array): Promise<SavedInkAnnotation[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const results: SavedInkAnnotation[] = [];
  const pages = pdfDoc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const annots = pages[pageIndex].node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      let dict: PDFDict;
      try {
        dict = annots.lookup(i, PDFDict);
      } catch {
        continue;
      }
      if (dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Ink") continue;
      const inkListArray = dict.lookupMaybe(PDFName.of("InkList"), PDFArray);
      if (!inkListArray) continue;
      const inkList: number[][] = [];
      for (let s = 0; s < inkListArray.size(); s++) {
        const stroke = inkListArray.lookupMaybe(s, PDFArray);
        if (!stroke) continue;
        const points: number[] = [];
        for (let p = 0; p < stroke.size(); p++) {
          const n = stroke.lookupMaybe(p, PDFNumber);
          if (n) points.push(n.asNumber());
        }
        if (points.length >= 2) inkList.push(points);
      }
      if (inkList.length === 0) continue;
      const c = numbersOf(dict, "C");
      const color: RgbColor = c.length === 3 ? { r: c[0], g: c[1], b: c[2] } : DEFAULT_INK_COLOR;
      const bs = dict.lookupMaybe(PDFName.of("BS"), PDFDict);
      const width = bs?.lookupMaybe(PDFName.of("W"), PDFNumber)?.asNumber() ?? DEFAULT_INK_WIDTH;
      results.push({ pageIndex, inkList, color, width });
    }
  }
  return results;
}

/** Reads every `/Subtype /Text` sticky-note annotation back, inverse of
 * `applyStickyNotesToPdf`. */
export async function readStickyNotes(bytes: Uint8Array): Promise<SavedStickyNote[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const results: SavedStickyNote[] = [];
  const pages = pdfDoc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const annots = pages[pageIndex].node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      let dict: PDFDict;
      try {
        dict = annots.lookup(i, PDFDict);
      } catch {
        continue;
      }
      if (dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Text") continue;
      const rect = numbersOf(dict, "Rect");
      if (rect.length !== 4) continue;
      const contents = stringOf(dict, "Contents") ?? "";
      const c = numbersOf(dict, "C");
      const color: RgbColor = c.length === 3 ? { r: c[0], g: c[1], b: c[2] } : DEFAULT_STICKY_NOTE_COLOR;
      // Inverse of applyStickyNotesToPdf's Rect construction: [x, y-size, x+size, y].
      results.push({ pageIndex, x: rect[0], y: rect[3], contents, color });
    }
  }
  return results;
}

/** Reads every Square/Circle/Line/Polygon shape annotation back, inverse
 * of `applyShapeAnnotationsToPdf`. */
export async function readShapeAnnotations(bytes: Uint8Array): Promise<SavedShapeAnnotation[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const results: SavedShapeAnnotation[] = [];
  const pages = pdfDoc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const annots = pages[pageIndex].node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      let dict: PDFDict;
      try {
        dict = annots.lookup(i, PDFDict);
      } catch {
        continue;
      }
      const subtype = shapeSubtypeOf(dict);
      if (!subtype) continue;
      const points =
        subtype === "Line"
          ? numbersOf(dict, "L")
          : subtype === "Polygon"
            ? numbersOf(dict, "Vertices")
            : numbersOf(dict, "Rect");
      if (points.length < 4) continue;
      const c = numbersOf(dict, "C");
      const color: RgbColor = c.length === 3 ? { r: c[0], g: c[1], b: c[2] } : DEFAULT_SHAPE_COLOR;
      const bs = dict.lookupMaybe(PDFName.of("BS"), PDFDict);
      const width = bs?.lookupMaybe(PDFName.of("W"), PDFNumber)?.asNumber() ?? DEFAULT_SHAPE_WIDTH;
      results.push({ pageIndex, subtype, points, color, width });
    }
  }
  return results;
}
