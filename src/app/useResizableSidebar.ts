import { signal } from "@preact/signals";
import { useCallback } from "preact/hooks";

/**
 * App integration: import `./resizable-sidebar.css`, set `.sidebar`'s inline
 * width from `sidebarWidth.value`, and render the resize handle between the
 * sidebar and editor area with `onPointerDown={onDragStart}`.
 */
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 260;

export const sidebarWidth = signal(DEFAULT_SIDEBAR_WIDTH);

function clampWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function useResizableSidebar() {
  const onDragStart = useCallback((event: PointerEvent) => {
    event.preventDefault();

    const startingX = event.clientX;
    const startingWidth = sidebarWidth.value;

    const onPointerMove = (moveEvent: PointerEvent) => {
      sidebarWidth.value = clampWidth(
        startingWidth + moveEvent.clientX - startingX,
      );
    };

    const onPointerEnd = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  }, []);

  return { width: sidebarWidth, onDragStart };
}
