import { describe, expect, it } from "vitest";
import {
  createEmptyInkDocument,
  decodeInkDocument,
  INK_DOCUMENT_VERSION,
  serializeInkDocument,
  type InkStroke,
} from "./inkDocument";

const stroke: InkStroke = {
  id: "stroke-1",
  tool: "pen",
  color: "#123456",
  width: 3.5,
  opacity: 1,
  points: [
    { x: 1, y: 2, pressure: 0.4, tiltX: 5, tiltY: -8, time: 10 },
    { x: 4, y: 6, pressure: 0.8, tiltX: 12, tiltY: 3, time: 20 },
  ],
};

describe("ink document", () => {
  it("creates an empty versioned infinite-canvas document", () => {
    const decoded = createEmptyInkDocument();
    expect(decoded.document).toEqual({
      version: INK_DOCUMENT_VERSION,
      strokes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  it("round trips a valid stroke", () => {
    const decoded = decodeInkDocument(JSON.stringify({ version: 1, strokes: [stroke], viewport: { x: 4, y: -2, zoom: 1.5 } }));
    expect(decoded?.document.strokes).toEqual([stroke]);
    expect(JSON.parse(serializeInkDocument(decoded!))).toEqual({
      version: 1,
      strokes: [stroke],
      viewport: { x: 4, y: -2, zoom: 1.5 },
    });
  });

  it.each(["not json", "[]", "null", "42"])("fails closed for unusable top-level input: %s", (source) => {
    expect(decodeInkDocument(source)).toBeNull();
  });

  it("fails closed when strokes exists but is not an array", () => {
    expect(decodeInkDocument(JSON.stringify({ strokes: {} }))).toBeNull();
  });

  it("preserves unknown top-level fields", () => {
    const decoded = decodeInkDocument(JSON.stringify({ version: 1, strokes: [stroke], viewport: { x: 0, y: 0, zoom: 1 }, futureSetting: { grid: true } }));
    const serialized = JSON.parse(serializeInkDocument(decoded!));
    expect(serialized.futureSetting).toEqual({ grid: true });
  });

  it("preserves a newer version marker rather than downgrading it", () => {
    const decoded = decodeInkDocument(JSON.stringify({ version: 7, strokes: [], viewport: { x: 0, y: 0, zoom: 1 } }));
    expect(decoded?.document.version).toBe(7);
    expect(JSON.parse(serializeInkDocument(decoded!)).version).toBe(7);
  });

  it("preserves object-shaped future strokes it cannot edit", () => {
    const futureStroke = { id: "future", tool: "airbrush", spray: 0.8, points: [{ x: 1, y: 2 }] };
    const decoded = decodeInkDocument(JSON.stringify({ version: 2, strokes: [stroke, futureStroke] }));
    expect(decoded?.document.strokes).toEqual([stroke]);
    expect(decoded?.unknownStrokes).toEqual([futureStroke]);
    expect(JSON.parse(serializeInkDocument(decoded!)).strokes).toEqual([stroke, futureStroke]);
  });

  it("drops primitive garbage in the stroke array instead of re-emitting it", () => {
    const decoded = decodeInkDocument(JSON.stringify({ strokes: [stroke, null, 3, "bad"] }));
    expect(JSON.parse(serializeInkDocument(decoded!)).strokes).toEqual([stroke]);
  });

  it.each([
    { ...stroke, width: 0 },
    { ...stroke, opacity: 2 },
    { ...stroke, points: [{ ...stroke.points[0], pressure: 1.2 }] },
    { ...stroke, points: [{ ...stroke.points[0], tiltX: 100 }] },
  ])("retains malformed object strokes losslessly instead of partially decoding them", (malformed) => {
    const decoded = decodeInkDocument(JSON.stringify({ strokes: [malformed] }));
    expect(decoded?.document.strokes).toEqual([]);
    expect(decoded?.unknownStrokes).toEqual([malformed]);
  });

  it("uses a safe viewport default without rewriting unrelated fields", () => {
    const decoded = decodeInkDocument(JSON.stringify({ version: 1, strokes: [], viewport: { x: 1, y: 2, zoom: 0 }, note: "keep" }));
    expect(decoded?.document.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    const serialized = JSON.parse(serializeInkDocument(decoded!));
    expect(serialized.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(serialized.note).toBe("keep");
  });
});
