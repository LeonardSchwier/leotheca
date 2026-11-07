import { describe, expect, it } from "vitest";
import { inkWidthAtPoint, normalizeInkSample, smoothInkPoints } from "./strokeProcessing";
import type { InkPoint } from "./inkDocument";

const points: InkPoint[] = [
  { x: 0, y: 0, pressure: 0.2, tiltX: 0, tiltY: 0, time: 0 },
  { x: 10, y: 10, pressure: 0.5, tiltX: 10, tiltY: -10, time: 10 },
  { x: 20, y: 0, pressure: 0.9, tiltX: 30, tiltY: 15, time: 20 },
  { x: 30, y: 5, pressure: 0.6, tiltX: 0, tiltY: 0, time: 30 },
];

describe("normalizeInkSample", () => {
  it("uses neutral pressure and tilt when hardware does not supply them", () => {
    expect(normalizeInkSample({ x: 2, y: 3, time: 5 })).toEqual({
      x: 2,
      y: 3,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      time: 5,
    });
  });

  it("clamps hardware values to Pointer Events ranges", () => {
    expect(normalizeInkSample({ x: 1, y: 2, pressure: 4, tiltX: -120, tiltY: 130, time: 8 })).toEqual({
      x: 1,
      y: 2,
      pressure: 1,
      tiltX: -90,
      tiltY: 90,
      time: 8,
    });
  });

  it("replaces non-finite samples with stable fallbacks", () => {
    expect(normalizeInkSample({ x: Number.NaN, y: Infinity, pressure: Number.NaN, time: Infinity })).toEqual({
      x: 0,
      y: 0,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      time: 0,
    });
  });
});

describe("smoothInkPoints", () => {
  it("preserves the measured endpoints exactly", () => {
    const smoothed = smoothInkPoints(points, 4);
    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed.at(-1)).toEqual(points.at(-1));
  });

  it("adds spline samples between raw points rather than returning a jagged polyline", () => {
    const smoothed = smoothInkPoints(points, 4);
    expect(smoothed.length).toBeGreaterThan(points.length);
    expect(smoothed.some((point) => point.x > 0 && point.x < 10 && point.y !== point.x)).toBe(true);
  });

  it("keeps pressure and tilt inside physical ranges", () => {
    for (const point of smoothInkPoints(points, 8)) {
      expect(point.pressure).toBeGreaterThanOrEqual(0);
      expect(point.pressure).toBeLessThanOrEqual(1);
      expect(point.tiltX).toBeGreaterThanOrEqual(-90);
      expect(point.tiltX).toBeLessThanOrEqual(90);
      expect(point.tiltY).toBeGreaterThanOrEqual(-90);
      expect(point.tiltY).toBeLessThanOrEqual(90);
    }
  });

  it("keeps interpolated timestamps monotonic", () => {
    const smoothed = smoothInkPoints(points, 5);
    for (let index = 1; index < smoothed.length; index += 1) {
      expect(smoothed[index].time).toBeGreaterThanOrEqual(smoothed[index - 1].time);
    }
  });

  it("copies short strokes without inventing geometry", () => {
    expect(smoothInkPoints(points.slice(0, 2), 4)).toEqual(points.slice(0, 2));
  });
});

describe("inkWidthAtPoint", () => {
  it("varies continuously with pressure", () => {
    const light = inkWidthAtPoint(10, { pressure: 0.1, tiltX: 0, tiltY: 0 });
    const medium = inkWidthAtPoint(10, { pressure: 0.5, tiltX: 0, tiltY: 0 });
    const heavy = inkWidthAtPoint(10, { pressure: 0.9, tiltX: 0, tiltY: 0 });
    expect(light).toBeLessThan(medium);
    expect(medium).toBeLessThan(heavy);
  });

  it("broadens a tilted stylus without exceeding the bounded tilt multiplier", () => {
    const upright = inkWidthAtPoint(10, { pressure: 0.5, tiltX: 0, tiltY: 0 });
    const tilted = inkWidthAtPoint(10, { pressure: 0.5, tiltX: 90, tiltY: 90 });
    expect(tilted).toBeGreaterThan(upright);
    expect(tilted).toBeLessThanOrEqual(upright * 1.2);
  });

  it("never produces a zero-width mark from an invalid base width", () => {
    expect(inkWidthAtPoint(0, { pressure: 0, tiltX: 0, tiltY: 0 })).toBeGreaterThan(0);
  });
});
