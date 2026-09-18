/** UX-01 spec section 20 "UI primitives" (Phase 1: "Button, IconButton,
 * SegmentedControl, Tooltip, Menu, Dialog, and status primitives needed
 * by the current shell"). Button/IconButton/SegmentedControl already
 * landed (see their own header comments); this is the next slice of that
 * same list. Menu, Dialog, and the status primitives remain open
 * follow-up work, see ROADMAP.md's UX-01 entry.
 *
 * A non-intrusive wrapper, not a new interactive element: `Tooltip` clones
 * its single child (spec 19.7's icon-only button, or any other trigger)
 * and merges in the event handlers and `aria-describedby` it needs,
 * rather than rendering its own `<button>` or requiring the caller to
 * change how their trigger is built. That keeps a migration like
 * ActivityRail.tsx's (dropping a hand-written `title="..."` attribute in
 * favor of this component) a pure wrap with no markup restructuring at
 * the trigger itself.
 *
 * Spec 19.7 / 22.3: "every icon-only control has an accessible label and
 * tooltip on pointer layouts" / "icon-only buttons have explicit names".
 * The trigger's own `aria-label` (unchanged by this component) remains
 * its accessible *name*; this component adds the tooltip bubble and an
 * `aria-describedby` link to it, the ARIA "description" relationship,
 * which is additive to (not a replacement for) that name -- matching how
 * a sighted pointer user and a screen reader user both learn the same
 * thing about the control, just through different channels.
 *
 * Spec 22.2 ("all Desktop functionality must be operable by keyboard")
 * and this app's own tooltip requirement: the tooltip must appear on
 * keyboard focus, not only pointer hover, and must be dismissible via
 * Escape without moving focus off the trigger (the W3C ARIA Authoring
 * Practices "tooltip" pattern: "Escape: Dismisses the tooltip" -- it does
 * not also blur or otherwise change what has focus). Hover uses a short
 * open delay (spec 20: "Each primitive must define: ... pointer and touch
 * behavior") so tooltips do not flash in on every incidental mouse
 * pass-over; focus shows immediately, since a keyboard user has already
 * made a deliberate choice to land on that control and gains nothing from
 * an artificial wait.
 *
 * Disclosed scope: this is a simple anchored tooltip (plain CSS
 * positioning relative to the trigger, four placements), not a
 * viewport-aware floating-positioning system -- this app has no
 * floating-ui/popper-style dependency, and none of Phase 1's actual call
 * sites need collision detection. A future call site that does would need
 * that as separate, justified scope (spec 20: "The project should not
 * create an abstract primitive when only one feature uses it").
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { cloneElement, isValidElement } from "preact";
import type { JSX, VNode } from "preact";
import "./primitives.css";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

type TriggerProps = JSX.HTMLAttributes<HTMLElement> & {
  "aria-describedby"?: string;
};

export interface TooltipProps {
  /** Tooltip text; also becomes the trigger's accessible description via
   * `aria-describedby` while the tooltip is showing. */
  content: string;
  /** Where the bubble appears relative to the trigger. Default "top". */
  placement?: TooltipPlacement;
  /** Milliseconds to wait before showing on hover (spec 20: "pointer and
   * touch behavior"). Focus always shows immediately regardless of this
   * value. Default 400. */
  delay?: number;
  /** Disables the tooltip entirely: no bubble, no aria-describedby, no
   * listeners beyond the trigger's own. The trigger still renders
   * normally. */
  disabled?: boolean;
  /** Single trigger element. Its own event handlers and ref, if any, are
   * preserved and called/attached alongside this component's. */
  children: VNode<TriggerProps>;
}

let tooltipIdCounter = 0;

export function Tooltip({
  content,
  placement = "top",
  delay = 400,
  disabled = false,
  children,
}: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    tooltipIdCounter += 1;
    idRef.current = `tooltip-${tooltipIdCounter}`;
  }
  const id = idRef.current;

  const active = !disabled && content !== "";
  // Read inside the document-level listener below without needing to
  // re-subscribe that listener on every open/close transition (see its
  // own comment for why re-subscribing per-transition is the wrong fix).
  const openRef = useRef(open);
  openRef.current = open;

  function clearShowTimer() {
    if (showTimerRef.current !== undefined) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = undefined;
    }
  }

  // Unmount safety: an in-flight hover-open timer must never fire after
  // this Tooltip (and its trigger) has left the tree.
  useEffect(() => clearShowTimer, []);

  // Escape dismissal (ARIA APG "tooltip" pattern) at the document level,
  // not only on the trigger's own onKeyDown: a hover-shown tooltip's
  // trigger may never have received focus at all, so a listener scoped to
  // the trigger element would miss that case entirely. Subscribed once on
  // mount (not re-subscribed per open/close transition, which would race
  // an in-flight hover-open timer's own render flush) and reads current
  // openness from a ref instead.
  useEffect(() => {
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && openRef.current) {
        clearShowTimer();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, []);

  function showAfterDelay() {
    if (!active) return;
    clearShowTimer();
    showTimerRef.current = setTimeout(() => setOpen(true), delay);
  }

  function showNow() {
    if (!active) return;
    clearShowTimer();
    setOpen(true);
  }

  function hide() {
    clearShowTimer();
    setOpen(false);
  }

  if (!isValidElement(children)) {
    return children as unknown as JSX.Element;
  }

  const childProps = children.props;
  const trigger = cloneElement(children, {
    "aria-describedby":
      open && active
        ? [childProps["aria-describedby"], id].filter(Boolean).join(" ")
        : childProps["aria-describedby"],
    onMouseEnter: (event: JSX.TargetedMouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(event);
      showAfterDelay();
    },
    onMouseLeave: (event: JSX.TargetedMouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event: JSX.TargetedFocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event);
      showNow();
    },
    onBlur: (event: JSX.TargetedFocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event);
      hide();
    },
  } as Partial<TriggerProps>);

  return (
    <span class={`tooltip-anchor tooltip-anchor-${placement}`}>
      {trigger}
      {open && active && (
        <span
          role="tooltip"
          id={id}
          class={`tooltip-bubble tooltip-bubble-${placement}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
