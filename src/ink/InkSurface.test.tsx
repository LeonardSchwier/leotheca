/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { InkSurface } from "./InkSurface";
import type { InkStroke } from "./inkDocument";

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
});
