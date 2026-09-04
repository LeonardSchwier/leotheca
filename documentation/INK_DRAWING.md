# Ink drawing foundation

This document records the first implementation slice of the roadmap's freehand drawing and handwriting feature. It is intentionally a foundation rather than a partially wired drawing UI.

## Phase 1 decisions

- **Standalone drawing files first.** Ink starts as its own local vector document rather than a Canvas card. A later phase may embed or reference the same document from Canvas without inventing a second stroke format.
- **Infinite canvas.** The persisted viewport stores translation and zoom; there is no page-size field or artificial paper boundary in the v1 document contract.
- **No shape recognition or line snapping in the first version.** Those features can be layered on later without changing the raw-stroke ownership model.
- **Pointer Events are the input contract.** A point stores position, pressure, tilt, and event time. Missing pressure/tilt values get neutral fallbacks, while supplied values are clamped to the Pointer Events ranges.
- **Vector source of truth.** Strokes remain editable point data. Rendering may rasterize transiently for speed, but saving must serialize the vector document rather than a bitmap.

## File format

`src/ink/inkDocument.ts` defines a versioned JSON document containing strokes and the last viewport. Each stroke owns an id, tool, color, continuously variable base width, opacity, and sampled points. The decoder follows the same lossless-forward-compatibility rule as the Canvas document contract: unknown top-level fields and object-shaped future strokes survive a decode/save cycle. Invalid JSON or a structurally unusable `strokes` field fails closed rather than risking a destructive rewrite.

The initial tool enum contains `pen` and `highlighter`; erasing is an editing operation over persisted strokes rather than a permanently painted background-colored stroke.

## Stroke processing

`src/ink/strokeProcessing.ts` contains DOM-independent math shared by desktop and Android WebViews. Raw samples normalize into stable persisted values. Paths are smoothed with Catmull-Rom interpolation over position rather than drawing the raw samples as jagged line segments. Pressure, tilt, and time interpolate linearly between measured samples so spline overshoot cannot invent impossible physical values. Brush width varies continuously with pressure, with a bounded secondary tilt contribution.

## Edit history

`src/ink/inkEditing.ts` is pure, DOM-independent history and eraser logic, fully unit-tested but not wired to any UI: `createInkHistory`/`commitInkEdit`/`undoInkEdit`/`redoInkEdit` manage a past/present/future stack of stroke-list snapshots, and `eraseStrokeParts`/`eraseInkAtPoint` remove only the sampled points within a given radius of an eraser point, splitting a stroke into its surviving runs rather than only supporting whole-stroke deletion.

## Deferred to later phases

Phase 1 does **not** add a new workspace `TabKind`, toolbar command, file creation flow, canvas renderer, color picker, a pointer-capture drawing surface to actually invoke this module's logic, pinch-zoom/pan gesture handling, coalesced-event collection, or palm-rejection policy. Those require UI/input integration and real pen-device testing, and are tracked as the roadmap's "Freehand Phase 2" item. In particular, no Android physical-device stylus or palm-rejection verification is claimed by this foundation. (The undo/redo stack and eraser interaction themselves are already implemented, see "Edit history" above; what's deferred is only wiring them to a real drawing surface.)
