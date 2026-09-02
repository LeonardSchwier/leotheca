/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { InkSurface } from "./InkSurface";
import type { InkStroke } from "./inkDocument";

afterEach(cleanup);

const initialStroke: InkStroke = {
  id: "initial",
  tool: "pen",
  color: "#000000",
  width: 4,
  opacity: 1,
  points: [
    { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: 0 },
    { x: 10, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: 1 },
    { x: 20, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: 2 },
  ],
};

function pointer(target: Element, type: "down" | "move" | "up", options: Record<string, unknown>) {
  const fn = type === "down" ? fireEvent.pointerDown : type === "move" ? fireEvent.pointerMove : fireEvent.pointerUp;
  fn(target, options);
}

describe("InkSurface", () => {
  it("exposes pen, highlighter, eraser, color, width, undo and redo controls", () => {
    const { getByText, getByLabelText } = render(<InkSurface />);
    expect(getByText("Pen")).not.toBeNull();
    expect(getByText("Highlighter")).not.toBeNull();
    expect(getByText("Eraser")).not.toBeNull();
    expect(getByLabelText("Ink color")).not.toBeNull();
    expect(getByLabelText("Ink width")).not.toBeNull();
    expect((getByText("Undo") as HTMLButtonElement).disabled).toBe(true);
    expect((getByText("Redo") as HTMLButtonElement).disabled).toBe(true);
  });

  it("records a pressure-aware pen stroke and publishes it on pointer up", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<InkSurface onChange={onChange} />);
    const surface = getByLabelText("Ink drawing surface");
    pointer(surface, "down", { pointerId: 1, pointerType: "pen", clientX: 1, clientY: 2, pressure: 0.2, tiltX: 5, tiltY: -5 });
    pointer(surface, "move", { pointerId: 1, pointerType: "pen", clientX: 10, clientY: 8, pressure: 0.8, tiltX: 20, tiltY: 10 });
    pointer(surface, "up", { pointerId: 1, pointerType: "pen", clientX: 10, clientY: 8, pressure: 0.8 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const strokes = onChange.mock.calls[0][0] as InkStroke[];
    expect(strokes).toHaveLength(1);
    expect(strokes[0].tool).toBe("pen");
    expect(strokes[0].points[0]).toMatchObject({ x: 1, y: 2, tiltX: 5, tiltY: -5 });
    expect(strokes[0].points[0].pressure).toBeCloseTo(0.2);
    expect(strokes[0].points.at(-1)?.pressure).toBeCloseTo(0.8);
    expect(strokes[0].points.length).toBeGreaterThan(2);
  });

  it("uses translucent strokes in highlighter mode", () => {
    const onChange = vi.fn();
    const { getByText, getByLabelText } = render(<InkSurface onChange={onChange} />);
    fireEvent.click(getByText("Highlighter"));
    const surface = getByLabelText("Ink drawing surface");
    pointer(surface, "down", { pointerId: 2, pointerType: "mouse", clientX: 2, clientY: 2, pressure: 0.5 });
    pointer(surface, "up", { pointerId: 2, pointerType: "mouse", clientX: 2, clientY: 2, pressure: 0.5 });
    const strokes = onChange.mock.calls.at(-1)?.[0] as InkStroke[];
    expect(strokes[0]).toMatchObject({ tool: "highlighter", opacity: 0.35 });
  });

  it("partially erases an existing stroke rather than deleting it wholesale", () => {
    const onChange = vi.fn();
    const { getByText, getByLabelText } = render(<InkSurface initialStrokes={[initialStroke]} onChange={onChange} />);
    fireEvent.input(getByLabelText("Ink width"), { target: { value: "1" } });
    fireEvent.click(getByText("Eraser"));
    const surface = getByLabelText("Ink drawing surface");
    pointer(surface, "down", { pointerId: 3, pointerType: "mouse", clientX: 10, clientY: 0, pressure: 0.5 });
    pointer(surface, "up", { pointerId: 3, pointerType: "mouse", clientX: 10, clientY: 0, pressure: 0.5 });
    const strokes = onChange.mock.calls.at(-1)?.[0] as InkStroke[];
    expect(strokes).toHaveLength(2);
    expect(strokes.map((stroke) => stroke.points.map((point) => point.x))).toEqual([[0], [20]]);
  });

  it("undoes and redoes a completed drawing gesture", () => {
    const onChange = vi.fn();
    const { getByText, getByLabelText } = render(<InkSurface onChange={onChange} />);
    const surface = getByLabelText("Ink drawing surface");
    pointer(surface, "down", { pointerId: 4, pointerType: "mouse", clientX: 1, clientY: 1, pressure: 0.5 });
    pointer(surface, "up", { pointerId: 4, pointerType: "mouse", clientX: 1, clientY: 1, pressure: 0.5 });
    fireEvent.click(getByText("Undo"));
    expect((onChange.mock.calls.at(-1)?.[0] as InkStroke[])).toEqual([]);
    fireEvent.click(getByText("Redo"));
    expect((onChange.mock.calls.at(-1)?.[0] as InkStroke[])).toHaveLength(1);
  });

  it("ignores touch input while an active pen owns the surface", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<InkSurface onChange={onChange} />);
    const surface = getByLabelText("Ink drawing surface");
    pointer(surface, "down", { pointerId: 5, pointerType: "pen", clientX: 1, clientY: 1, pressure: 0.4 });
    pointer(surface, "down", { pointerId: 6, pointerType: "touch", clientX: 100, clientY: 100, pressure: 0.5 });
    pointer(surface, "move", { pointerId: 5, pointerType: "pen", clientX: 4, clientY: 4, pressure: 0.6 });
    pointer(surface, "up", { pointerId: 5, pointerType: "pen", clientX: 4, clientY: 4, pressure: 0.6 });
    const strokes = onChange.mock.calls.at(-1)?.[0] as InkStroke[];
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points.every((point) => point.x < 100)).toBe(true);
  });
});
