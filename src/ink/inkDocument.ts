export const INK_DOCUMENT_VERSION = 1;

export type InkTool = "pen" | "highlighter";

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  time: number;
}

export interface InkStroke {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  opacity: number;
  points: InkPoint[];
}

export interface InkViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface InkDocument {
  version: number;
  strokes: InkStroke[];
  viewport: InkViewport;
}

export interface DecodedInkDocument {
  document: InkDocument;
  extraFields: Record<string, unknown>;
  unknownStrokes: Record<string, unknown>[];
}

const DEFAULT_VIEWPORT: InkViewport = { x: 0, y: 0, zoom: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPoint(value: unknown): value is InkPoint {
  if (!isRecord(value)) return false;
  return (
    finiteNumber(value.x) &&
    finiteNumber(value.y) &&
    finiteNumber(value.pressure) &&
    value.pressure >= 0 &&
    value.pressure <= 1 &&
    finiteNumber(value.tiltX) &&
    value.tiltX >= -90 &&
    value.tiltX <= 90 &&
    finiteNumber(value.tiltY) &&
    value.tiltY >= -90 &&
    value.tiltY <= 90 &&
    finiteNumber(value.time)
  );
}

function validStroke(value: unknown): value is InkStroke {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.tool === "pen" || value.tool === "highlighter") &&
    typeof value.color === "string" &&
    value.color.length > 0 &&
    finiteNumber(value.width) &&
    value.width > 0 &&
    finiteNumber(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    Array.isArray(value.points) &&
    value.points.length > 0 &&
    value.points.every(validPoint)
  );
}

function decodeViewport(value: unknown): InkViewport {
  if (!isRecord(value)) return { ...DEFAULT_VIEWPORT };
  if (!finiteNumber(value.x) || !finiteNumber(value.y) || !finiteNumber(value.zoom) || value.zoom <= 0) {
    return { ...DEFAULT_VIEWPORT };
  }
  return { x: value.x, y: value.y, zoom: value.zoom };
}

/**
 * Decodes a standalone ink file without throwing away records from a newer
 * writer. Invalid JSON and structurally unusable stroke arrays fail closed;
 * object-shaped strokes that this build does not understand are retained and
 * emitted again by serializeInkDocument.
 */
export function decodeInkDocument(source: string): DecodedInkDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.strokes !== undefined && !Array.isArray(parsed.strokes)) return null;

  const strokes: InkStroke[] = [];
  const unknownStrokes: Record<string, unknown>[] = [];
  for (const candidate of (parsed.strokes ?? []) as unknown[]) {
    if (validStroke(candidate)) strokes.push(candidate);
    else if (isRecord(candidate)) unknownStrokes.push(candidate);
  }

  const version = finiteNumber(parsed.version) ? parsed.version : INK_DOCUMENT_VERSION;
  return {
    document: {
      version,
      strokes,
      viewport: decodeViewport(parsed.viewport),
    },
    extraFields: parsed,
    unknownStrokes,
  };
}

export function createEmptyInkDocument(): DecodedInkDocument {
  return {
    document: {
      version: INK_DOCUMENT_VERSION,
      strokes: [],
      viewport: { ...DEFAULT_VIEWPORT },
    },
    extraFields: {},
    unknownStrokes: [],
  };
}

export function serializeInkDocument(decoded: DecodedInkDocument): string {
  return JSON.stringify(
    {
      ...decoded.extraFields,
      version: decoded.document.version,
      strokes: [...decoded.document.strokes, ...decoded.unknownStrokes],
      viewport: decoded.document.viewport,
    },
    null,
    2,
  );
}
