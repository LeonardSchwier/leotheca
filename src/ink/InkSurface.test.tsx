/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { InkSurface } from "./InkSurface";
import type { InkStroke } from "./inkDocument";
import { eraseInkAtPoint } from "./inkEditing";

afterEach(cleanup);

function mockBounds(surface: SVGSVGElement) {
  surface.getBoundingClientRect = () => new DOMRect(10, 20, 400, 300);
  surface.setPointerCapture = vi.fn();
  surface.hasPointerCapture = vi.fn(() => true);
  surface.releasePointerCapture = vi.fn();
}

function coalescedPointerMove() {
  const event = new Event("pointermove", { bubbles: true }) as PointerEvent;
  const sample = { clientX: 16, clientY: 27, pressure: 0.6, tiltX: 0, tiltY: 0, timeStamp: 2 } as PointerEvent;
  Object.assign(event, { pointerId: 4, pointerType: "pen", clientX: 20, clientY: 29, pressure: 0.6 });
  Object.defineProperty(event, "getCoalescedEvents", { value: () => [sample] });
  return event;
}

describe("InkSurface", () => {
  it("renders supplied vector strokes with pressure-aware segments", () => {
    const stroke: InkStroke = {
      id: "existing",
      tool: "pen",
      color: "#123456",
      width: 4,
      opacity: 0.8,
      points: [
        { x: 2, y: 3, pressure: 0.2, tiltX: 0, tiltY: 0, time: 1 },
        { x: 9, y: 12, pressure: 0.8, tiltX: 0, tiltY: 0, time: 2 },
      ],
    };
    const { getByLabelText } = render(<InkSurface strokes={[stroke]} onCommitStroke={vi.fn()} />);

    const surface = getByLabelText("Ink drawing surface");
    expect(surface.querySelectorAll("line")).toHaveLength(1);
    expect(surface.querySelector("line")?.getAttribute("stroke")).toBe("#123456");
  });

  it("captures a pen stroke and preserves the final pointer-up sample", () => {
    const onCommitStroke = vi.fn();
    const { getByLabelText } = render(<InkSurface strokes={[]} onCommitStroke={onCommitStroke} />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 4, pointerType: "pen", clientX: 12, clientY: 23, pressure: 0.4 });
    fireEvent(surface, coalescedPointerMove());
    fireEvent.pointerUp(surface, { pointerId: 4, pointerType: "pen", clientX: 28, clientY: 35, pressure: 0.8 });

    expect(onCommitStroke).toHaveBeenCalledTimes(1);
    const committed = onCommitStroke.mock.calls[0][0] as InkStroke;
    expect(committed.points.at(-1)).toMatchObject({ x: 18, y: 15 });
    expect(committed.points.at(-1)?.pressure).toBeCloseTo(0.8);
    expect(committed.points).toContainEqual(expect.objectContaining({ x: 6, y: 7 }));
    expect(surface.setPointerCapture).toHaveBeenCalledWith(4);
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(4);
  });

  it("does not start a touch stroke before touch gesture policy is implemented", () => {
    const onCommitStroke = vi.fn();
    const { getByLabelText } = render(<InkSurface strokes={[]} onCommitStroke={onCommitStroke} />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 9, pointerType: "touch", clientX: 20, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 9, pointerType: "touch", clientX: 30, clientY: 40 });

    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  it("discards a cancelled stroke without committing a partial edit", () => {
    const onCommitStroke = vi.fn();
    const { getByLabelText } = render(<InkSurface strokes={[]} onCommitStroke={onCommitStroke} />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: "mouse", clientX: 20, clientY: 30 });
    fireEvent.pointerCancel(surface, { pointerId: 2, pointerType: "mouse" });

    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  // Maintenance review: non-primary mouse button handling (right-click, middle-click)
  it("does not start a stroke with right mouse button", () => {
    const onCommitStroke = vi.fn();
    const { getByLabelText } = render(<InkSurface strokes={[]} onCommitStroke={onCommitStroke} />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    // Right-click (button 2)
    fireEvent.pointerDown(surface, { pointerId: 3, pointerType: "mouse", button: 2, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 3, pointerType: "mouse", button: 2, clientX: 25, clientY: 35 });

    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  it("does not start a stroke with middle mouse button", () => {
    const onCommitStroke = vi.fn();
    const { getByLabelText } = render(<InkSurface strokes={[]} onCommitStroke={onCommitStroke} />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    // Middle-click (button 1)
    fireEvent.pointerDown(surface, { pointerId: 4, pointerType: "mouse", button: 1, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 4, pointerType: "mouse", button: 1, clientX: 25, clientY: 35 });

    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  // Maintenance review: lost pointer capture handling
  it("discards stroke when pointer capture is lost before pointer up", () => {
    const onCommitStroke = vi.fn();
    const { getByLabelText } = render(<InkSurface strokes={[]} onCommitStroke={onCommitStroke} />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);
    // Mock hasPointerCapture to return false (simulating lost capture)
    surface.hasPointerCapture = vi.fn(() => false);

    // Start a stroke
    fireEvent.pointerDown(surface, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 20, clientY: 30 });
    
    // Try to move - should be ignored due to lost capture
    fireEvent.pointerMove(surface, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 25, clientY: 35 });
    
    // Try to finish - should discard since capture was lost
    fireEvent.pointerUp(surface, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 30, clientY: 40 });

    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  // Eraser input bridge: Freehand Phase 2b-a
  it("reports captured eraser samples without committing an ink stroke", () => {
    const onCommitStroke = vi.fn();
    const onEraseAt = vi.fn();
    const { getByLabelText } = render(
      <InkSurface strokes={[]} tool="eraser" onCommitStroke={onCommitStroke} onEraseAt={onEraseAt} />,
    );
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 6, pointerType: "pen", clientX: 20, clientY: 30 });
    fireEvent.pointerMove(surface, { pointerId: 6, pointerType: "pen", clientX: 25, clientY: 35 });
    fireEvent.pointerUp(surface, { pointerId: 6, pointerType: "pen", clientX: 30, clientY: 40 });

    expect(onEraseAt).toHaveBeenCalledTimes(3);
    expect(onEraseAt.mock.calls.map(([point]) => ({ x: point.x, y: point.y }))).toEqual([
      { x: 10, y: 10 }, { x: 15, y: 15 }, { x: 20, y: 20 },
    ]);
    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  it("lets the host apply eraser points to its own stroke list", () => {
    const initialStrokes: InkStroke[] = [{
      id: "line",
      tool: "pen",
      color: "#000000",
      width: 3,
      opacity: 1,
      points: [0, 10, 20].map((x) => ({ x, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, time: x })),
    }];
    function EraserHost() {
      const [strokes, setStrokes] = useState(initialStrokes);
      return (
        <>
          <output aria-label="Remaining strokes">{strokes.map((stroke) => stroke.id).join(",")}</output>
          <InkSurface
            strokes={strokes}
            tool="eraser"
            onCommitStroke={vi.fn()}
            onEraseAt={(point) => setStrokes((current) => eraseInkAtPoint(current, point, 1))}
          />
        </>
      );
    }

    const { getByLabelText } = render(<EraserHost />);
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 7, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(surface, { pointerId: 7, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });

    expect(getByLabelText("Remaining strokes").textContent).toBe("line:erase:1,line:erase:2");
  });

  // Eraser input bridge: non-primary mouse button handling
  it("does not start a stroke with right mouse button", () => {
    const onCommitStroke = vi.fn();
    const onEraseAt = vi.fn();
    const { getByLabelText } = render(
      <InkSurface strokes={[]} tool="eraser" onCommitStroke={onCommitStroke} onEraseAt={onEraseAt} />,
    );
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 3, pointerType: "mouse", button: 2, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 3, pointerType: "mouse", button: 2, clientX: 25, clientY: 35 });

    expect(onCommitStroke).not.toHaveBeenCalled();
    expect(onEraseAt).not.toHaveBeenCalled();
  });

  it("does not start a stroke with middle mouse button", () => {
    const onCommitStroke = vi.fn();
    const onEraseAt = vi.fn();
    const { getByLabelText } = render(
      <InkSurface strokes={[]} tool="eraser" onCommitStroke={onCommitStroke} onEraseAt={onEraseAt} />,
    );
    const surface = getByLabelText("Ink drawing surface") as unknown as SVGSVGElement;
    mockBounds(surface);

    fireEvent.pointerDown(surface, { pointerId: 4, pointerType: "mouse", button: 1, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 4, pointerType: "mouse", button: 1, clientX: 25, clientY: 35 });

    expect(onCommitStroke).not.toHaveBeenCalled();
    expect(onEraseAt).not.toHaveBeenCalled();
  });
});
