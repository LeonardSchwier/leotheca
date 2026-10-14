/**
 * Global jsdom polyfills for the test environment.
 *
 * jsdom does not implement several DOM APIs that are present in every real
 * browser and that libraries we depend on (CodeMirror/ProseMirror, canvas-
 * based PDF annotation, testing-library timers) call during normal operation.
 * Without these stubs, a single unhandled `TypeError` (e.g.
 * `Range.getClientRects is not a function` from CodeMirror's measure pass)
 * fails the entire vitest run even when every assertion passes — which is
 * exactly the "app is crash-free, CI is not" gap the crash-freedom checklist
 * in CONSTITUTION.md is meant to close.
 *
 * These are minimal, deterministic stand-ins for layout/geometry APIs that
 * have no meaningful value under jsdom (no real layout engine). They let the
 * surrounding test exercise the real code path instead of crashing in the
 * DOM stub. Do NOT use these in production code — they are test-only.
 *
 * Wire-up: referenced from vitest.config.ts `setupFiles`. Add new stubs here,
 * not in individual test files, so every suite benefits and the gap is
 * visible in one place.
 */

import { afterEach, beforeAll } from "vitest";

// ---------------------------------------------------------------------------
// Range.getClientRects / getBoundingClientRect
//
// CodeMirror (and ProseMirror) call these during its measure pass. jsdom has
// no layout engine, so returning an empty list is the correct semantic answer
// for "there are no measurable client rects" and lets the measure pass
// complete instead of throwing.
// ---------------------------------------------------------------------------
const emptyClientRectList = (): { length: number; item: (i: number) => never; [Symbol.iterator]: () => Iterator<never> } => ({
  length: 0,
  item: () => { throw new Error("empty list"); },
  [Symbol.iterator]: function* () {},
});

beforeAll(() => {
  const proto = (globalThis as any).Range?.prototype;
  if (proto && typeof proto.getClientRects !== "function") {
    proto.getClientRects = emptyClientRectList;
  }
  if (proto && typeof proto.getBoundingClientRect !== "function") {
    proto.getBoundingClientRect = () => ({
      left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
      toJSON: () => ({}),
    });
  }

  // Element/HTMLElement/Text.getClientRects — some CodeMirror paths and
  // testing-library assertions reach these on nodes directly.
  for (const ctorName of ["Element", "HTMLElement", "Text"]) {
    const C = (globalThis as any)[ctorName];
    if (C && C.prototype && typeof C.prototype.getClientRects !== "function") {
      C.prototype.getClientRects = emptyClientRectList;
    }
    if (C && C.prototype && typeof C.prototype.getBoundingClientRect !== "function") {
      C.prototype.getBoundingClientRect = () => ({
        left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
        toJSON: () => ({}),
      });
    }
  }
});

// Defensive per-test teardown: if a test replaces any of these with a mock,
// restore the polyfill so a later test in the same worker doesn't see the
// missing stub. (Most tests don't touch these; this is belt-and-braces.)
afterEach(() => {
  const proto = (globalThis as any).Range?.prototype;
  if (proto && typeof proto.getClientRects !== "function") {
    proto.getClientRects = emptyClientRectList;
  }
});
