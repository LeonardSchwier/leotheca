/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { SplitSeparator } from "./SplitSeparator";

afterEach(() => {
  cleanup();
});

function renderSeparator(ratio = 0.5) {
  const containerRef = { current: document.createElement("div") };
  Object.defineProperty(containerRef.current, "getBoundingClientRect", {
    value: () => ({ left: 0, width: 1000, top: 0, height: 0, right: 1000, bottom: 0, x: 0, y: 0, toJSON() {} }),
  });
  const onChange = vi.fn<(r: number) => void>();
  const onReset = vi.fn<() => void>();
  const result = render(<SplitSeparator ratio={ratio} containerRef={containerRef} onChange={onChange} onReset={onReset} />);
  return { ...result, onChange, onReset };
}

describe("SplitSeparator", () => {
  it("exposes separator semantics with the current percentage and 30-70 bounds", () => {
    const { getByRole } = renderSeparator(0.4);
    const separator = getByRole("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator.getAttribute("aria-valuenow")).toBe("40");
    expect(separator.getAttribute("aria-valuemin")).toBe("30");
    expect(separator.getAttribute("aria-valuemax")).toBe("70");
    expect(separator.tabIndex).toBe(0);
  });

  it("ArrowLeft/ArrowRight adjust by 2 percent, Shift+Arrow by 10 percent", () => {
    const { getByRole, onChange } = renderSeparator(0.5);
    const separator = getByRole("separator");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(0.52);

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(0.48);

    fireEvent.keyDown(separator, { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(0.60);
  });

  it("clamps Arrow adjustment to the 30-70 range", () => {
    const { getByRole, onChange } = renderSeparator(0.31);
    fireEvent.keyDown(getByRole("separator"), { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(0.30);
  });

  it("Home/End jump to the minimum/maximum", () => {
    const { getByRole, onChange } = renderSeparator(0.5);
    const separator = getByRole("separator");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0.30);
    fireEvent.keyDown(separator, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(0.70);
  });

  it("Enter, Space, and a double-click all reset the ratio", () => {
    const { getByRole, onReset } = renderSeparator(0.35);
    const separator = getByRole("separator");
    fireEvent.keyDown(separator, { key: "Enter" });
    fireEvent.keyDown(separator, { key: " " });
    fireEvent.dblClick(separator);
    expect(onReset).toHaveBeenCalledTimes(3);
  });

  it("dragging computes ratio from the container's bounding box, clamped to 30-70", () => {
    const { getByRole, onChange } = renderSeparator(0.5);
    const separator = getByRole("separator");
    fireEvent.pointerDown(separator);
    fireEvent.pointerMove(window, { clientX: 800 }); // 800/1000 = 0.8, clamps to 0.70
    expect(onChange).toHaveBeenLastCalledWith(0.70);
    fireEvent.pointerMove(window, { clientX: 100 }); // 100/1000 = 0.10, clamps to 0.30
    expect(onChange).toHaveBeenLastCalledWith(0.30);
    fireEvent.pointerUp(window);
    onChange.mockClear();
    fireEvent.pointerMove(window, { clientX: 500 }); // no longer dragging after pointerup
    expect(onChange).not.toHaveBeenCalled();
  });
});
