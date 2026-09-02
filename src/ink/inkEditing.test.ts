import { describe, expect, it } from "vitest";
import {
  commitInkEdit,
  createInkHistory,
  eraseInkAtPoint,
  eraseStrokeParts,
  redoInkEdit,
  undoInkEdit,
} from "./inkEditing";
import type { InkStroke } from "./inkDocument";

function stroke(id: string, xs: number[]): InkStroke {
  return {
    id,
    tool: "pen",
    color: "#000000",
    width: 4,
    opacity: 1,
    points: xs.map((x, index) => ({ x, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: index })),
  };
}

describe("ink editing history", () => {
  it("undoes and redoes committed stroke sets", () => {
    const initial = createInkHistory([stroke("a", [0, 1])]);
    const edited = commitInkEdit(initial, [stroke("a", [0, 1]), stroke("b", [2, 3])]);
    const undone = undoInkEdit(edited);
    expect(undone.present.map(({ id }) => id)).toEqual(["a"]);
    expect(redoInkEdit(undone).present.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("clears the redo branch after a new edit", () => {
    const first = commitInkEdit(createInkHistory(), [stroke("a", [0])]);
    const second = commitInkEdit(first, [stroke("a", [0]), stroke("b", [1])]);
    const undone = undoInkEdit(second);
    const replacement = commitInkEdit(undone, [stroke("c", [4])]);
    expect(replacement.future).toEqual([]);
    expect(redoInkEdit(replacement)).toBe(replacement);
  });

  it("does nothing when undo or redo has no available state", () => {
    const history = createInkHistory();
    expect(undoInkEdit(history)).toBe(history);
    expect(redoInkEdit(history)).toBe(history);
  });

  it("copies committed stroke data so later caller mutation cannot rewrite history", () => {
    const source = stroke("a", [0, 1]);
    const history = createInkHistory([source]);
    source.points[0].x = 99;
    expect(history.present[0].points[0].x).toBe(0);
  });
});

describe("partial stroke erasing", () => {
  it("splits a stroke when the eraser removes points from its middle", () => {
    const result = eraseStrokeParts(stroke("a", [0, 1, 2, 3, 4]), { x: 2, y: 0 }, 0.1);
    expect(result).toHaveLength(2);
    expect(result.map((part) => part.points.map(({ x }) => x))).toEqual([[0, 1], [3, 4]]);
    expect(result.map(({ id }) => id)).toEqual(["a:erase:1", "a:erase:2"]);
  });

  it("removes a whole stroke only when every sampled point is under the eraser", () => {
    expect(eraseStrokeParts(stroke("a", [1, 2]), { x: 1.5, y: 0 }, 1)).toEqual([]);
  });

  it("keeps an untouched stroke and its original id", () => {
    const original = stroke("a", [0, 1, 2]);
    const result = eraseStrokeParts(original, { x: 20, y: 0 }, 1);
    expect(result).toEqual([original]);
    expect(result[0]).toBe(original);
  });

  it("can trim only the beginning or end of a stroke", () => {
    expect(eraseStrokeParts(stroke("a", [0, 1, 2, 3]), { x: 0, y: 0 }, 0.5)[0].points.map(({ x }) => x)).toEqual([1, 2, 3]);
    expect(eraseStrokeParts(stroke("a", [0, 1, 2, 3]), { x: 3, y: 0 }, 0.5)[0].points.map(({ x }) => x)).toEqual([0, 1, 2]);
  });

  it("applies a partial erase independently across multiple strokes", () => {
    const result = eraseInkAtPoint([stroke("a", [0, 1, 2]), stroke("b", [10, 11])], { x: 1, y: 0 }, 0.1);
    expect(result.map(({ id }) => id)).toEqual(["a:erase:1", "a:erase:2", "b"]);
  });

  it("treats a negative eraser radius as zero", () => {
    const result = eraseStrokeParts(stroke("a", [0, 1]), { x: 0, y: 0 }, -5);
    expect(result).toHaveLength(1);
    expect(result[0].points.map(({ x }) => x)).toEqual([1]);
  });
});
