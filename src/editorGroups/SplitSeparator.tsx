import { useCallback, useEffect, useRef } from "preact/hooks";

const STEP = 0.02;
const BIG_STEP = 0.10;
const MIN_RATIO = 0.30;
const MAX_RATIO = 0.70;

interface SplitSeparatorProps {
  /** The primary group's share of the split shell's width, 0.30-0.70. */
  ratio: number;
  /** A ref to the split shell container the ratio is measured against, so
   * dragging can read its current bounding box without App.tsx needing to
   * track layout state of its own. */
  containerRef: { current: HTMLElement | null };
  onChange: (ratio: number) => void;
  onReset: () => void;
}

/** The pointer- and keyboard-operable divider between the two editor
 * groups (spec 6.6, 18.3). A plain `separator` role with an explicit
 * accessible value, not a slider or scrollbar: it moves the boundary
 * between two panes, not a single bounded value on its own. */
export function SplitSeparator({ ratio, containerRef, onChange, onReset }: SplitSeparatorProps) {
  const dragging = useRef(false);

  const ratioFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const raw = (clientX - rect.left) / rect.width;
    return Math.max(MIN_RATIO, Math.min(MAX_RATIO, raw));
  }, [containerRef]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (!dragging.current) return;
      const next = ratioFromClientX(event.clientX);
      if (next !== null) onChange(next);
    }
    function onPointerUp() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [ratioFromClientX, onChange]);

  return (
    <div
      class="split-separator"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize editor groups"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(MIN_RATIO * 100)}
      aria-valuemax={Math.round(MAX_RATIO * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        dragging.current = true;
        event.preventDefault();
      }}
      onDblClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          onChange(Math.max(MIN_RATIO, ratio - (event.shiftKey ? BIG_STEP : STEP)));
          event.preventDefault();
        } else if (event.key === "ArrowRight") {
          onChange(Math.min(MAX_RATIO, ratio + (event.shiftKey ? BIG_STEP : STEP)));
          event.preventDefault();
        } else if (event.key === "Home") {
          onChange(MIN_RATIO);
          event.preventDefault();
        } else if (event.key === "End") {
          onChange(MAX_RATIO);
          event.preventDefault();
        } else if (event.key === "Enter" || event.key === " ") {
          onReset();
          event.preventDefault();
        }
      }}
    />
  );
}
