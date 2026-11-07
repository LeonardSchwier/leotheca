import type { InkPoint, InkStroke } from "./inkDocument";

export interface InkHistory {
  past: InkStroke[][];
  present: InkStroke[];
  future: InkStroke[][];
}

export interface EraserPoint {
  x: number;
  y: number;
}

function copyStrokeList(strokes: readonly InkStroke[]): InkStroke[] {
  return strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) }));
}

export function createInkHistory(strokes: readonly InkStroke[] = []): InkHistory {
  return { past: [], present: copyStrokeList(strokes), future: [] };
}

export function commitInkEdit(history: InkHistory, strokes: readonly InkStroke[]): InkHistory {
  return {
    past: [...history.past, copyStrokeList(history.present)],
    present: copyStrokeList(strokes),
    future: [],
  };
}

export function undoInkEdit(history: InkHistory): InkHistory {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: copyStrokeList(previous),
    future: [copyStrokeList(history.present), ...history.future],
  };
}

export function redoInkEdit(history: InkHistory): InkHistory {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, copyStrokeList(history.present)],
    present: copyStrokeList(next),
    future: history.future.slice(1),
  };
}

function squaredDistance(a: EraserPoint, b: InkPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Removes only sampled portions of one stroke that fall under the eraser and
 * returns the surviving runs as independent strokes. The suffixes are stable
 * for a given erase operation, so saving the result never needs randomness.
 * Pointer-event/coalesced sampling keeps the persisted path dense; the later
 * UI phase may add segment-boundary interpolation if real-device testing shows
 * a visible gap at unusually sparse samples.
 */
export function eraseStrokeParts(stroke: InkStroke, point: EraserPoint, radius: number): InkStroke[] {
  const safeRadius = Math.max(0, radius);
  const radiusSquared = safeRadius * safeRadius;
  const runs: InkPoint[][] = [];
  let current: InkPoint[] = [];

  for (const sample of stroke.points) {
    if (squaredDistance(point, sample) <= radiusSquared) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    } else {
      current.push(sample);
    }
  }
  if (current.length > 0) runs.push(current);

  if (runs.length === 1 && runs[0].length === stroke.points.length) return [stroke];
  return runs.map((points, index) => ({
    ...stroke,
    id: `${stroke.id}:erase:${index + 1}`,
    points: points.map((sample) => ({ ...sample })),
  }));
}

export function eraseInkAtPoint(strokes: readonly InkStroke[], point: EraserPoint, radius: number): InkStroke[] {
  return strokes.flatMap((stroke) => eraseStrokeParts(stroke, point, radius));
}
