import { cloneElement, isValidElement } from "preact";
import type { JSX, VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

type TriggerProps = JSX.HTMLAttributes<HTMLElement> & {
  "aria-describedby"?: string;
};

export interface TooltipProps {
  content: string;
  placement?: TooltipPlacement;
  /** Hover delay in ms. Keyboard focus shows it at once, since a keyboard user
   * has no pointer path that could trigger it by accident. */
  delay?: number;
  disabled?: boolean;
  /** A single focusable element. */
  children: VNode<TriggerProps>;
}

let tooltipCounter = 0;

/** Supplementary description only: it connects through `aria-describedby`
 * while visible, and Escape dismisses it (WCAG 1.4.13). */
export function Tooltip({
  content,
  placement = "top",
  delay = 400,
  disabled = false,
  children,
}: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    tooltipCounter += 1;
    idRef.current = `ds-tooltip-${tooltipCounter}`;
  }
  const id = idRef.current;
  const active = !disabled && content !== "";
  const openRef = useRef(open);
  openRef.current = open;

  function clearTimer() {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }

  useEffect(() => clearTimer, []);

  useEffect(() => {
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && openRef.current) {
        clearTimer();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, []);

  if (!isValidElement(children)) {
    return children as unknown as JSX.Element;
  }

  const showing = open && active;
  const childProps = children.props;
  const trigger = cloneElement(children, {
    "aria-describedby": showing
      ? [childProps["aria-describedby"], id].filter(Boolean).join(" ")
      : childProps["aria-describedby"],
    onMouseEnter: (event: JSX.TargetedMouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(event);
      if (!active) return;
      clearTimer();
      timerRef.current = setTimeout(() => setOpen(true), delay);
    },
    onMouseLeave: (event: JSX.TargetedMouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(event);
      clearTimer();
      setOpen(false);
    },
    onFocus: (event: JSX.TargetedFocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event);
      if (!active) return;
      clearTimer();
      setOpen(true);
    },
    onBlur: (event: JSX.TargetedFocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event);
      clearTimer();
      setOpen(false);
    },
  } as Partial<TriggerProps>);

  return (
    <span class="ds-tooltip-anchor">
      {trigger}
      {showing && (
        <span role="tooltip" id={id} class={`ds-tooltip ds-tooltip-${placement}`}>
          {content}
        </span>
      )}
    </span>
  );
}
