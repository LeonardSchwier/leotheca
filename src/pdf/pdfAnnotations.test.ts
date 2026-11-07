import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import {
  applyAnnotationsToPdf,
  applyInkAnnotationsToPdf,
  applyShapeAnnotationsToPdf,
  applyStickyNotesToPdf,
  countMarkupAnnotations,
  DEFAULT_MARKUP_COLOR,
  quadPointsToViewportRects,
  readInkAnnotations,
  readMarkupAnnotations,
  readShapeAnnotations,
  readStickyNotes,
  rectToQuadPoints,
} from "./pdfAnnotations";
import type { PdfPointConverter } from "./pdfAnnotations";

async function makeBlankPdf(pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792]);
  return doc.save();
}

/** A simple, internally-consistent stand-in for pdf.js's real `PageViewport`:
 * a uniform scale plus a Y-flip against the page height, with
 * `convertToViewportPoint`/`convertToPdfPoint` exact inverses of each other
 * (as the real implementation's affine transform and its inverse are). Good
 * enough to test this module's coordinate math without pdf.js itself. */
function makeFakeViewport(pageHeight: number, scale: number): PdfPointConverter {
  return {
    convertToPdfPoint: (x, y) => [x / scale, pageHeight - y / scale],
    convertToViewportPoint: (x, y) => [x * scale, (pageHeight - y) * scale],
  };
}

describe("rectToQuadPoints", () => {
  it("converts a viewport rect's four corners via the converter, in top-left/top-right/bottom-left/bottom-right order", () => {
    const calls: [number, number][] = [];
    const converter: PdfPointConverter = {
      convertToPdfPoint: (x, y) => {
        calls.push([x, y]);
        // A trivial identity-ish mapping good enough to verify call order/values.
        return [x, 792 - y];
      },
      convertToViewportPoint: (x, y) => [x, 792 - y],
    };

    const quad = rectToQuadPoints({ left: 10, top: 20, right: 110, bottom: 40 }, converter);

    expect(calls).toEqual([
      [10, 20], // top-left
      [110, 20], // top-right
      [10, 40], // bottom-left
      [110, 40], // bottom-right
    ]);
    expect(quad).toEqual([10, 772, 110, 772, 10, 752, 110, 752]);
  });
});

describe("quadPointsToViewportRects", () => {
  it("is the exact inverse of rectToQuadPoints for a single-line selection", () => {
    const viewport = makeFakeViewport(792, 1.5);
    const original = { left: 12, top: 30, right: 212, bottom: 48 };

    const quad = rectToQuadPoints(original, viewport);
    const [restored] = quadPointsToViewportRects(quad, viewport);

    expect(restored.left).toBeCloseTo(original.left);
    expect(restored.right).toBeCloseTo(original.right);
    expect(restored.top).toBeCloseTo(original.top);
    expect(restored.bottom).toBeCloseTo(original.bottom);
  });

  it("splits a multi-line selection's flattened quads back into one rect per line", () => {
    const viewport = makeFakeViewport(792, 1);
    const line1 = { left: 10, top: 10, right: 100, bottom: 20 };
    const line2 = { left: 10, top: 22, right: 60, bottom: 32 };
    const quadPoints = [...rectToQuadPoints(line1, viewport), ...rectToQuadPoints(line2, viewport)];

    const rects = quadPointsToViewportRects(quadPoints, viewport);

    expect(rects).toHaveLength(2);
    expect(rects[0].right).toBeCloseTo(line1.right);
    expect(rects[1].right).toBeCloseTo(line2.right);
  });
});

describe("applyAnnotationsToPdf / countMarkupAnnotations", () => {
  it("adds a real standard Highlight annotation to the target page's /Annots array", async () => {
    const bytes = await makeBlankPdf(1);
    expect(await countMarkupAnnotations(bytes)).toBe(0);

    const annotated = await applyAnnotationsToPdf(bytes, [
      {
        pageIndex: 0,
        subtype: "Highlight",
        quadPoints: [10, 700, 100, 700, 10, 680, 100, 680],
      },
    ]);

    expect(await countMarkupAnnotations(annotated)).toBe(1);

    // Round-trip through a fresh pdf-lib load, confirming the annotation is
    // a real /Type /Annot /Subtype /Highlight dictionary on the page's own
    // /Annots array, not something only this module's own reader understands.
    const reloaded = await PDFDocument.load(annotated);
    const page = reloaded.getPage(0);
    const annots = page.node.Annots();
    expect(annots?.size()).toBe(1);
    const dict = annots!.lookup(0, PDFDict);
    expect(dict.lookup(PDFName.of("Type"), PDFName).asString()).toBe("/Annot");
    expect(dict.lookup(PDFName.of("Subtype"), PDFName).asString()).toBe("/Highlight");
    expect(dict.lookup(PDFName.of("QuadPoints"))!.toString()).toContain("10");
    expect(dict.lookup(PDFName.of("CA"), PDFNumber).asNumber()).toBeCloseTo(0.4);
  });

  it("adds Underline and StrikeOut annotations distinguishable by subtype", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Underline", quadPoints: [0, 0, 10, 0, 0, 5, 10, 5] },
      { pageIndex: 0, subtype: "StrikeOut", quadPoints: [0, 10, 10, 10, 0, 15, 10, 15] },
    ]);

    expect(await countMarkupAnnotations(annotated)).toBe(2);
  });

  it("supports multiple pages, targeting each annotation at its own pageIndex", async () => {
    const bytes = await makeBlankPdf(3);
    const annotated = await applyAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Highlight", quadPoints: [0, 0, 10, 0, 0, 5, 10, 5] },
      { pageIndex: 2, subtype: "Highlight", quadPoints: [0, 0, 10, 0, 0, 5, 10, 5] },
    ]);

    const reloaded = await PDFDocument.load(annotated);
    expect(reloaded.getPage(0).node.Annots()?.size()).toBe(1);
    expect(reloaded.getPage(1).node.Annots()).toBeUndefined();
    expect(reloaded.getPage(2).node.Annots()?.size()).toBe(1);
  });

  it("preserves an existing annotation already on the page instead of replacing it", async () => {
    const bytes = await makeBlankPdf(1);
    const firstPass = await applyAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Highlight", quadPoints: [0, 0, 10, 0, 0, 5, 10, 5] },
    ]);
    const secondPass = await applyAnnotationsToPdf(firstPass, [
      { pageIndex: 0, subtype: "Underline", quadPoints: [0, 10, 10, 10, 0, 15, 10, 15] },
    ]);

    expect(await countMarkupAnnotations(secondPass)).toBe(2);
  });

  it("rejects a pageIndex beyond the document's real page count", async () => {
    const bytes = await makeBlankPdf(1);
    await expect(
      applyAnnotationsToPdf(bytes, [{ pageIndex: 5, subtype: "Highlight", quadPoints: [0, 0, 10, 0, 0, 5, 10, 5] }]),
    ).rejects.toThrow(/only has 1 page/);
  });

});

describe("readMarkupAnnotations", () => {
  it("round-trips subtype, quadPoints, color, and opacity exactly for an explicit override", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyAnnotationsToPdf(bytes, [
      {
        pageIndex: 0,
        subtype: "Underline",
        quadPoints: [0, 0, 10, 0, 0, 5, 10, 5],
        color: { r: 0, g: 1, b: 0.5 },
        opacity: 0.7,
        contents: "note to self",
      },
    ]);

    const [saved] = await readMarkupAnnotations(annotated);

    expect(saved.pageIndex).toBe(0);
    expect(saved.subtype).toBe("Underline");
    expect(saved.quadPoints).toEqual([0, 0, 10, 0, 0, 5, 10, 5]);
    expect(saved.color).toEqual({ r: 0, g: 1, b: 0.5 });
    expect(saved.opacity).toBeCloseTo(0.7);
  });

  it("falls back to the subtype's default color/opacity when a hand-authored annotation omits C/CA", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const dict = doc.context.obj({
      Type: "Annot",
      Subtype: "Highlight",
      Rect: [0, 0, 10, 5],
      QuadPoints: [0, 0, 10, 0, 0, 5, 10, 5],
    });
    page.node.addAnnot(doc.context.register(dict));
    const bytes = await doc.save();

    const [saved] = await readMarkupAnnotations(bytes);

    expect(saved.color).toEqual(DEFAULT_MARKUP_COLOR.Highlight);
    expect(saved.opacity).toBeCloseTo(0.4);
  });

  it("ignores a non-markup annotation (e.g. a Link) instead of misreading it as a markup one", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const linkDict = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 5] });
    page.node.addAnnot(doc.context.register(linkDict));
    const bytes = await doc.save();

    expect(await readMarkupAnnotations(bytes)).toEqual([]);
  });
});

describe("applyInkAnnotationsToPdf / readInkAnnotations (PDF Phase 2)", () => {
  it("round-trips a single-stroke ink annotation's points, default color, and default width", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyInkAnnotationsToPdf(bytes, [
      { pageIndex: 0, inkList: [[10, 10, 20, 20, 30, 10]] },
    ]);

    const [saved] = await readInkAnnotations(annotated);

    expect(saved.pageIndex).toBe(0);
    expect(saved.inkList).toEqual([[10, 10, 20, 20, 30, 10]]);
    expect(saved.width).toBeGreaterThan(0);
  });

  it("round-trips a multi-stroke annotation and an explicit color/width override", async () => {
    const bytes = await makeBlankPdf(1);
    const inkList = [
      [0, 0, 5, 5],
      [10, 10, 15, 5, 20, 10],
    ];
    const annotated = await applyInkAnnotationsToPdf(bytes, [
      { pageIndex: 0, inkList, color: { r: 0, g: 1, b: 0 }, width: 5 },
    ]);

    const [saved] = await readInkAnnotations(annotated);

    expect(saved.inkList).toEqual(inkList);
    expect(saved.color).toEqual({ r: 0, g: 1, b: 0 });
    expect(saved.width).toBeCloseTo(5);
  });

  it("rejects a pageIndex beyond the document's real page count", async () => {
    const bytes = await makeBlankPdf(1);
    await expect(
      applyInkAnnotationsToPdf(bytes, [{ pageIndex: 3, inkList: [[0, 0, 1, 1]] }]),
    ).rejects.toThrow(/only has 1 page/);
  });

  it("ignores a non-Ink annotation", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Highlight", quadPoints: [0, 0, 10, 0, 0, 5, 10, 5] },
    ]);
    expect(await readInkAnnotations(annotated)).toEqual([]);
  });
});

describe("applyStickyNotesToPdf / readStickyNotes (PDF Phase 2)", () => {
  it("round-trips a sticky note's anchor point, contents, and default color", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyStickyNotesToPdf(bytes, [
      { pageIndex: 0, x: 100, y: 700, contents: "remember this" },
    ]);

    const [saved] = await readStickyNotes(annotated);

    expect(saved.pageIndex).toBe(0);
    expect(saved.x).toBeCloseTo(100);
    expect(saved.y).toBeCloseTo(700);
    expect(saved.contents).toBe("remember this");
  });

  it("round-trips an explicit color override and an empty contents string", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyStickyNotesToPdf(bytes, [
      { pageIndex: 0, x: 50, y: 50, contents: "", color: { r: 0, g: 0, b: 1 } },
    ]);

    const [saved] = await readStickyNotes(annotated);

    expect(saved.contents).toBe("");
    expect(saved.color).toEqual({ r: 0, g: 0, b: 1 });
  });

  it("supports more than one sticky note on the same page", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyStickyNotesToPdf(bytes, [
      { pageIndex: 0, x: 10, y: 10, contents: "first" },
      { pageIndex: 0, x: 200, y: 300, contents: "second" },
    ]);

    const saved = await readStickyNotes(annotated);
    expect(saved.map((n) => n.contents).sort()).toEqual(["first", "second"]);
  });
});

describe("applyShapeAnnotationsToPdf / readShapeAnnotations (PDF Phase 2)", () => {
  it("round-trips a Square/Circle annotation's Rect-derived corner points", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyShapeAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Square", points: [10, 10, 100, 80] },
    ]);

    const [saved] = await readShapeAnnotations(annotated);

    expect(saved.subtype).toBe("Square");
    expect(saved.points).toEqual([10, 10, 100, 80]);
  });

  it("round-trips a Line annotation's real /L endpoints, distinct from /Rect", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyShapeAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Line", points: [20, 30, 120, 130] },
    ]);

    const [saved] = await readShapeAnnotations(annotated);

    expect(saved.subtype).toBe("Line");
    expect(saved.points).toEqual([20, 30, 120, 130]);
  });

  it("round-trips a Polygon annotation's real /Vertices, three or more points", async () => {
    const bytes = await makeBlankPdf(1);
    const vertices = [0, 0, 50, 0, 25, 50];
    const annotated = await applyShapeAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Polygon", points: vertices },
    ]);

    const [saved] = await readShapeAnnotations(annotated);

    expect(saved.subtype).toBe("Polygon");
    expect(saved.points).toEqual(vertices);
  });

  it("round-trips an explicit color/width override for a shape", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyShapeAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Circle", points: [0, 0, 40, 40], color: { r: 1, g: 0, b: 1 }, width: 6 },
    ]);

    const [saved] = await readShapeAnnotations(annotated);

    expect(saved.color).toEqual({ r: 1, g: 0, b: 1 });
    expect(saved.width).toBeCloseTo(6);
  });

  it("supports multiple shape subtypes together on one page", async () => {
    const bytes = await makeBlankPdf(1);
    const annotated = await applyShapeAnnotationsToPdf(bytes, [
      { pageIndex: 0, subtype: "Square", points: [0, 0, 10, 10] },
      { pageIndex: 0, subtype: "Line", points: [0, 20, 10, 30] },
      { pageIndex: 0, subtype: "Polygon", points: [0, 40, 10, 50, 5, 60] },
    ]);

    const saved = await readShapeAnnotations(annotated);
    expect(saved.map((s) => s.subtype).sort()).toEqual(["Line", "Polygon", "Square"]);
  });
});
