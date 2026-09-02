import type { InkPoint } from "./inkDocument";

export interface RawInkSample {
  x: number;
  y: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  time: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Normalizes Pointer Events data into the stable values persisted in ink files. */
export function normalizeInkSample(sample: RawInkSample): InkPoint {
  return {
    x: finiteOr(sample.x, 0),
    y: finiteOr(sample.y, 0),
    pressure: clamp(finiteOr(sample.pressure, 0.5), 0, 1),
    tiltX: clamp(finiteOr(sample.tiltX, 0), -90, 90),
    tiltY: clamp(finiteOr(sample.tiltY, 0), -90, 90),
    time: finiteOr(sample.time, 0),
  };
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Converts raw sampled points into a Catmull-Rom spline approximation while
 * preserving the first/last samples exactly. Position follows the spline;
 * pressure, tilt and time interpolate linearly so those physical values never
 * overshoot their measured ranges merely because the path is smoothed.
 */
export function smoothInkPoints(points: readonly InkPoint[], subdivisions = 4): InkPoint[] {
  if (points.length <= 2 || subdivisions <= 1) return points.map((point) => ({ ...point }));

  const result: InkPoint[] = [{ ...points[0] }];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];

    for (let step = 1; step <= subdivisions; step += 1) {
      const t = step / subdivisions;
      const isFinal = index === points.length - 2 && step === subdivisions;
      if (isFinal) {
        result.push({ ...points[points.length - 1] });
        continue;
      }
      result.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        pressure: clamp(lerp(p1.pressure, p2.pressure, t), 0, 1),
        tiltX: clamp(lerp(p1.tiltX, p2.tiltX, t), -90, 90),
        tiltY: clamp(lerp(p1.tiltY, p2.tiltY, t), -90, 90),
        time: lerp(p1.time, p2.time, t),
      });
    }
  }
  return result;
}

/**
 * Continuous brush width derived from pressure and stylus tilt. Pressure owns
 * most of the variation; a flatter pen can broaden the mark by at most 20%.
 */
export function inkWidthAtPoint(baseWidth: number, point: Pick<InkPoint, "pressure" | "tiltX" | "tiltY">): number {
  const safeBase = Math.max(0.1, finiteOr(baseWidth, 1));
  const pressure = clamp(finiteOr(point.pressure, 0.5), 0, 1);
  const tiltMagnitude = clamp(Math.hypot(finiteOr(point.tiltX, 0), finiteOr(point.tiltY, 0)) / 90, 0, 1);
  return safeBase * (0.3 + pressure * 0.7) * (1 + tiltMagnitude * 0.2);
}
