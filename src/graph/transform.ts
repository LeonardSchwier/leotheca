/**
 * The pure pan/zoom/hit-testing math behind GraphView's canvas, pulled out
 * of the component so it's testable without a real canvas or pointer
 * events: everything here takes plain numbers (already canvas-relative,
 * i.e. after subtracting the canvas's own getBoundingClientRect() origin)
 * and a Transform, and returns plain numbers or a Transform back.
 */
import type { Point } from "./layout";

export interface Transform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** Converts a canvas-relative screen point to world (pre-pan/zoom)
 * coordinates, the inverse of the translate+scale draw() applies. */
export function screenToWorld(screenX: number, screenY: number, transform: Transform): Point {
  return {
    x: (screenX - transform.offsetX) / transform.scale,
    y: (screenY - transform.offsetY) / transform.scale,
  };
}

/** Finds the first node within `hitRadius` screen pixels of a canvas-
 * relative point, already converted to world coordinates. `hitRadius` is
 * divided by `scale` because node positions are in world space but the hit
 * radius is meant to feel like a constant number of screen pixels
 * regardless of zoom level, the same way the node itself is drawn at a
 * fixed screen-pixel radius in GraphView's draw(). */
export function findNodeAtWorld(
  worldX: number,
  worldY: number,
  positions: Map<string, Point>,
  scale: number,
  hitRadius: number,
): string | null {
  for (const [path, pos] of positions) {
    if (Math.hypot(pos.x - worldX, pos.y - worldY) < hitRadius / scale) return path;
  }
  return null;
}

/** Computes the new Transform for zooming to `newScale`, anchored so the
 * world point currently under (screenX, screenY) stays under that same
 * screen point after the zoom (the standard "zoom toward cursor"
 * behavior), clamped to [minScale, maxScale]. */
export function computeZoomTransform(
  screenX: number,
  screenY: number,
  newScale: number,
  base: Transform,
  minScale: number,
  maxScale: number,
): Transform {
  const world = screenToWorld(screenX, screenY, base);
  const scale = Math.min(maxScale, Math.max(minScale, newScale));
  return {
    scale,
    offsetX: screenX - world.x * scale,
    offsetY: screenY - world.y * scale,
  };
}
