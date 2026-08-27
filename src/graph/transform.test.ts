import { describe, expect, it } from "vitest";
import { computeZoomTransform, findNodeAtWorld, screenToWorld } from "./transform";

describe("screenToWorld", () => {
  it("returns the same point unchanged for the identity transform", () => {
    expect(screenToWorld(50, 80, { offsetX: 0, offsetY: 0, scale: 1 })).toEqual({ x: 50, y: 80 });
  });

  it("undoes the pan offset", () => {
    expect(screenToWorld(50, 80, { offsetX: 10, offsetY: 20, scale: 1 })).toEqual({ x: 40, y: 60 });
  });

  it("undoes the zoom scale", () => {
    expect(screenToWorld(100, 100, { offsetX: 0, offsetY: 0, scale: 2 })).toEqual({ x: 50, y: 50 });
  });
});

describe("findNodeAtWorld", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 100, y: 100 }],
  ]);

  it("finds the node under the point", () => {
    expect(findNodeAtWorld(2, 2, positions, 1, 10)).toBe("a");
  });

  it("returns null when nothing is close enough", () => {
    expect(findNodeAtWorld(500, 500, positions, 1, 10)).toBeNull();
  });

  it("misses a node just outside the hit radius", () => {
    expect(findNodeAtWorld(11, 0, positions, 1, 10)).toBeNull();
  });

  it("hits the same screen-distance node once zoomed in, since the world-space hit radius shrinks with scale", () => {
    // At scale 1 the world-space radius is 10/1 = 10, so an 11-unit-away
    // point misses (previous test). At scale 0.5 it's 10/0.5 = 20, so the
    // same 11-unit-away point now hits: this is what makes the hit target
    // feel like a constant number of *screen* pixels regardless of zoom.
    expect(findNodeAtWorld(11, 0, positions, 0.5, 10)).toBe("a");
  });
});

describe("computeZoomTransform", () => {
  it("is a no-op when the scale doesn't change", () => {
    const base = { offsetX: 5, offsetY: 5, scale: 1 };
    expect(computeZoomTransform(50, 50, 1, base, 0.1, 4)).toEqual(base);
  });

  it("keeps the world point under the cursor fixed after zooming in", () => {
    const base = { offsetX: 0, offsetY: 0, scale: 1 };
    const result = computeZoomTransform(100, 100, 2, base, 0.1, 4);
    expect(result).toEqual({ scale: 2, offsetX: -100, offsetY: -100 });

    // The actual invariant this is for: converting (100, 100) back to
    // world space through the *new* transform should land on the same
    // world point it was at before the zoom.
    const worldBefore = screenToWorld(100, 100, base);
    const worldAfter = screenToWorld(100, 100, result);
    expect(worldAfter).toEqual(worldBefore);
  });

  it("clamps below the minimum scale", () => {
    const base = { offsetX: 0, offsetY: 0, scale: 1 };
    const result = computeZoomTransform(0, 0, 0.01, base, 0.15, 4);
    expect(result.scale).toBe(0.15);
  });

  it("clamps above the maximum scale", () => {
    const base = { offsetX: 0, offsetY: 0, scale: 1 };
    const result = computeZoomTransform(0, 0, 999, base, 0.15, 4);
    expect(result.scale).toBe(4);
  });
});
