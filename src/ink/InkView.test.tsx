/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { InkView } from "./InkView";

afterEach(cleanup);

const EMPTY_SOURCE = JSON.stringify({ version: 1, strokes: [], viewport: { x: 0, y: 0, zoom: 1 } });

function mockBounds(surface: SVGSVGElement) {
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
  surface.setPointerCapture = vi.fn();
  surface.hasPointerCapture = vi.fn(() => true);
  surface.releasePointerCapture = vi.fn();
}

function drawOneStroke(getByLabelText: (label: string) => HTMLElement) {
  const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
  mockBounds(surface);
  fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });
  fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 30, clientY: 30 });
}

function strokesFromChange(onChange: ReturnType<typeof vi.fn>, callIndex: number): unknown[] {
  const source = onChange.mock.calls[callIndex][0] as string;
  return (JSON.parse(source) as { strokes: unknown[] }).strokes;
}

describe("InkView undo/redo persistence (maintenance review: rm-a28bbd97a6233ac4)", () => {
  it("persists the reverted document through onChange when Undo is clicked", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<InkView path="note.ink" source={EMPTY_SOURCE} onChange={onChange} />);

    drawOneStroke(getByLabelText);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(strokesFromChange(onChange, 0)).toHaveLength(1);

    fireEvent.click(getByLabelText("Undo"));

    // Before the fix, handleUndo updated only local state and never called
    // onChange again, so the reverted (empty) document was never persisted.
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(strokesFromChange(onChange, 1)).toHaveLength(0);

    const surface = getByLabelText("Ink drawing surface");
    expect(surface.querySelectorAll("line, polyline")).toHaveLength(0);
    expect((getByLabelText("Undo") as HTMLButtonElement).disabled).toBe(true);
  });

  it("persists the reapplied document through onChange when Redo is clicked", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<InkView path="note.ink" source={EMPTY_SOURCE} onChange={onChange} />);

    drawOneStroke(getByLabelText);
    fireEvent.click(getByLabelText("Undo"));
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.click(getByLabelText("Redo"));

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(strokesFromChange(onChange, 2)).toHaveLength(1);
    expect((getByLabelText("Redo") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not call onChange when Undo/Redo are clicked with nothing to undo/redo", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<InkView path="note.ink" source={EMPTY_SOURCE} onChange={onChange} />);

    // Buttons are disabled, but exercise the handlers directly against the
    // no-op case regardless of the disabled attribute.
    fireEvent.click(getByLabelText("Undo"));
    fireEvent.click(getByLabelText("Redo"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
