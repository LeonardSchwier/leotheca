/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/preact";
import { sidebarWidth, useResizableSidebar } from "./useResizableSidebar";

const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

function pointerEvent(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { clientX });
}

afterEach(() => {
  sidebarWidth.value = DEFAULT_WIDTH;
});

describe("useResizableSidebar", () => {
  it("starts at the default width", () => {
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH);
  });

  it("dragging right widens the sidebar by the pointer delta", () => {
    const { result } = renderHook(() => useResizableSidebar());
    const startEvent = pointerEvent("pointerdown", 100);
    const preventDefault = vi.spyOn(startEvent, "preventDefault");
    result.current.onDragStart(startEvent);
    expect(preventDefault).toHaveBeenCalled();

    window.dispatchEvent(pointerEvent("pointermove", 140));
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH + 40);
  });

  it("dragging left narrows the sidebar by the pointer delta", () => {
    const { result } = renderHook(() => useResizableSidebar());
    result.current.onDragStart(pointerEvent("pointerdown", 100));

    window.dispatchEvent(pointerEvent("pointermove", 70));
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH - 30);
  });

  it("clamps to the minimum width when dragged too far left", () => {
    const { result } = renderHook(() => useResizableSidebar());
    result.current.onDragStart(pointerEvent("pointerdown", 100));

    window.dispatchEvent(pointerEvent("pointermove", -1000));
    expect(sidebarWidth.value).toBe(MIN_WIDTH);
  });

  it("clamps to the maximum width when dragged too far right", () => {
    const { result } = renderHook(() => useResizableSidebar());
    result.current.onDragStart(pointerEvent("pointerdown", 100));

    window.dispatchEvent(pointerEvent("pointermove", 5000));
    expect(sidebarWidth.value).toBe(MAX_WIDTH);
  });

  it("stops resizing after pointerup, ignoring further pointermove events", () => {
    const { result } = renderHook(() => useResizableSidebar());
    result.current.onDragStart(pointerEvent("pointerdown", 100));
    window.dispatchEvent(pointerEvent("pointermove", 140));
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH + 40);

    window.dispatchEvent(pointerEvent("pointerup", 140));
    window.dispatchEvent(pointerEvent("pointermove", 300));
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH + 40);
  });

  it("stops resizing after pointercancel, ignoring further pointermove events", () => {
    const { result } = renderHook(() => useResizableSidebar());
    result.current.onDragStart(pointerEvent("pointerdown", 100));
    window.dispatchEvent(pointerEvent("pointermove", 140));
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH + 40);

    window.dispatchEvent(pointerEvent("pointercancel", 140));
    window.dispatchEvent(pointerEvent("pointermove", 300));
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH + 40);
  });

  it("a fresh drag starts again from the current width, not the original default", () => {
    const { result } = renderHook(() => useResizableSidebar());
    result.current.onDragStart(pointerEvent("pointerdown", 100));
    window.dispatchEvent(pointerEvent("pointermove", 140)); // now DEFAULT + 40
    window.dispatchEvent(pointerEvent("pointerup", 140));

    result.current.onDragStart(pointerEvent("pointerdown", 200));
    window.dispatchEvent(pointerEvent("pointermove", 210)); // +10 from this drag's start
    expect(sidebarWidth.value).toBe(DEFAULT_WIDTH + 40 + 10);
  });
});
