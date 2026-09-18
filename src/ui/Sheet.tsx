/** UX-01 spec sections 20 and 24.5: shared adaptive Sheet primitive.
 * A Sheet is a dismissible, modal, edge-anchored panel -- the touch-first
 * counterpart to Dialog, used where a surface needs to feel reachable from
 * the bottom of a compact screen rather than centered like a desktop
 * dialog (spec section 20's initial primitive set explicitly lists both).
 *
 * It shares Dialog's modal contract (focus containment/restoration,
 * Escape/backdrop/Android-back dismissal, scroll locking, viewport
 * fitting) via `overlayStack.ts` rather than reimplementing it, so a
 * Sheet opened above a Dialog -- or a Dialog above a Sheet -- dismisses
 * only the topmost overlay. Unlike Dialog, a Sheet always renders a
 * visible close affordance in its header: spec 22.4 requires that "hover
 * is never required to discover or use an action on Android", and a
 * Sheet's caller-supplied `actions` are not guaranteed to include an
 * equivalent dismiss control. Callers supply trusted Preact children
 * only; no raw/untrusted HTML path exists here.
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import "./primitives.css";
import { IconButton } from "./IconButton";
import {
  acquireScrollLock,
  focusableElements,
  isTopmostOverlay,
  nextOverlayId,
  pushOverlay,
  type OverlayDismissReason,
} from "./overlayStack";

export type SheetDismissReason = OverlayDismissReason;

export interface SheetProps {
  title: string;
  description?: ComponentChildren;
  children?: ComponentChildren;
  actions?: ComponentChildren;
  className?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: { current: HTMLElement | null };
  /** Default true: see this file's header comment on why Sheet, unlike
   * Dialog, ships its own always-present dismiss control. */
  showCloseButton?: boolean;
  onDismiss: (reason: SheetDismissReason) => void;
}

export function Sheet({
  title,
  description,
  children,
  actions,
  className,
  closeOnEscape = true,
  closeOnBackdrop = true,
  restoreFocus = true,
  initialFocusRef,
  showCloseButton = true,
  onDismiss,
}: SheetProps): JSX.Element {
  const surfaceRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const restoreFocusRef = useRef(restoreFocus);
  restoreFocusRef.current = restoreFocus;
  const initialFocusTargetRef = useRef(initialFocusRef);
  initialFocusTargetRef.current = initialFocusRef;
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    idRef.current = nextOverlayId("sheet");
  }
  const titleId = `${idRef.current}-title`;
  const descriptionId = description
    ? `${idRef.current}-description`
    : undefined;

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const instanceId = idRef.current!;
    const popOverlay = pushOverlay({
      id: instanceId,
      isDismissible: () => closeOnEscapeRef.current,
      dismiss: (reason) => dismissRef.current(reason),
    });
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const initial =
      initialFocusTargetRef.current?.current ??
      focusableElements(surface)[0] ??
      surface;
    initial.focus();

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (!isTopmostOverlay(instanceId)) return;
      if (event.key === "Escape") {
        // A non-dismissible sheet must also keep Escape from reaching a
        // lower overlay or navigation layer behind it (matches Dialog).
        event.preventDefault();
        event.stopPropagation();
        if (closeOnEscapeRef.current) dismissRef.current("escape");
        return;
      }
      if (event.key !== "Tab" || !surfaceRef.current) return;

      const available = focusableElements(surfaceRef.current);
      if (available.length === 0) {
        event.preventDefault();
        surfaceRef.current.focus();
        return;
      }

      const first = available[0];
      const last = available[available.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (
        event.shiftKey &&
        (active === first || !surfaceRef.current.contains(active))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !surfaceRef.current.contains(active))
      ) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      popOverlay();
      if (
        restoreFocusRef.current &&
        previouslyFocusedRef.current?.isConnected
      ) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, []);

  useEffect(() => acquireScrollLock(), []);

  return (
    <div
      class="sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (closeOnBackdrop) dismissRef.current("backdrop");
      }}
    >
      <section
        ref={surfaceRef}
        class={["sheet-surface", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header class="sheet-header">
          <h2 id={titleId}>{title}</h2>
          {showCloseButton && (
            <IconButton
              icon="close"
              label="Close"
              size="md"
              onClick={() => dismissRef.current("close-button")}
            />
          )}
        </header>
        <div class="sheet-content">
          {description && (
            <div id={descriptionId} class="sheet-description">
              {description}
            </div>
          )}
          {children}
        </div>
        {actions && <footer class="sheet-actions">{actions}</footer>}
      </section>
    </div>
  );
}
