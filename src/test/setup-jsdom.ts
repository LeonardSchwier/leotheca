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
// Helpers for polyfilling layout/geometry APIs on jsdom's prototype chain.
//
// CodeMirror (and ProseMirror) call Range.getClientRects / getBoundingClientRect
// during its measure pass. jsdom has no layout engine, so returning an empty
// list / zero rect is the correct semantic answer for "there are no measurable
// client rects" and lets the measure pass complete instead of throwing.
// ---------------------------------------------------------------------------

/** A DOM-rect-like object with all geometry fields zeroed. */
const zeroRect: {
  left: number; right: number; top: number; bottom: number;
  width: number; height: number; x: number; y: number;
  toJSON: () => Record<string, number>;
} = {
  left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
  toJSON: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
};

/** An empty client-rects list (length 0, non-iterable, item() throws). */
const emptyClientRectList = (): {
  length: number;
  item: (i: number) => never;
  [Symbol.iterator]: () => Iterator<never>;
} => ({
  length: 0,
  item: () => { throw new Error("empty list"); },
  [Symbol.iterator]: function* () {},
});

/**
 * Shape of a constructor whose prototype we may stub.
 * Used to type the (globalThis as Record<string, ...>) lookups without
 * resorting to `any`.
 */
interface Stubbable {
  prototype?: {
    getClientRects?: () => { length: number; item: (i: number) => never; [Symbol.iterator]: () => Iterator<never> };
    getBoundingClientRect?: () => {
      left: number; right: number; top: number; bottom: number;
      width: number; height: number; x: number; y: number;
      toJSON: () => Record<string, number>;
    };
  };
}

/**
 * Look up a constructor on globalThis by name, typed as Stubbable.
 * Returns undefined when the global is not present (e.g. in a worker that
 * hasn't loaded jsdom yet) so callers can safely no-op.
 */
function globalCtor(name: string): Stubbable | undefined {
  const g = globalThis as unknown as Record<string, unknown>;
  const ctor = g[name];
  if (typeof ctor !== "function") return undefined;
  return ctor as unknown as Stubbable;
}

/** Install the zero-rect + empty-list stubs on a prototype if missing. */
function installRectStubs(proto: NonNullable<Stubbable["prototype"]> | undefined): void {
  if (!proto) return;
  if (typeof proto.getClientRects !== "function") {
    proto.getClientRects = emptyClientRectList;
  }
  if (typeof proto.getBoundingClientRect !== "function") {
    proto.getBoundingClientRect = () => zeroRect;
  }
}

beforeAll(() => {
  // Range — the class CodeMirror's measure pass calls.
  installRectStubs(globalCtor("Range")?.prototype);

  // Element / HTMLElement / Text — some CodeMirror paths and testing-library
  // assertions reach these on nodes directly.
  for (const ctorName of ["Element", "HTMLElement", "Text"]) {
    installRectStubs(globalCtor(ctorName)?.prototype);
  }
});

// Defensive per-test teardown: if a test replaces any of these with a mock,
// restore the polyfill so a later test in the same worker doesn't see the
// missing stub. (Most tests don't touch these; this is belt-and-braces.)
afterEach(() => {
  const proto = globalCtor("Range")?.prototype;
  if (proto && typeof proto.getClientRects !== "function") {
    proto.getClientRects = emptyClientRectList;
  }
});
