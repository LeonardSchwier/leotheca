import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { cx } from "./cx";
import {
  acquireScrollLock,
  focusableElements,
  isTopmostOverlay,
  nextOverlayId,
  pushOverlay,
  type OverlayDismissReason,
} from "./overlayStack";

export type DialogRole = "dialog" | "alertdialog";
export type DialogSize = "sm" | "md" | "lg";
export type DialogDismissReason = OverlayDismissReason;

export interface DialogProps {
  title: string;
  description?: ComponentChildren;
  children?: ComponentChildren;
  actions?: ComponentChildren;
  role?: DialogRole;
  size?: DialogSize;
  className?: string;
  /** Extra class on the backdrop, for host-specific placement. */
  backdropClassName?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: { current: HTMLElement | null };
  onDismiss: (reason: DialogDismissReason) => void;
}

/** A modal dialog with a focus trap, Escape handling that respects stacking,
 * focus restoration, and a body scroll lock. Mount to open, unmount to close. */
export function Dialog({
  title,
  description,
  children,
  actions,
  role = "dialog",
  size = "md",
  className,
  backdropClassName,
  closeOnEscape = true,
  closeOnBackdrop = true,
  restoreFocus = true,
  initialFocusRef,
  onDismiss,
}: DialogProps): JSX.Element {
  const surfaceRef = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const restoreFocusRef = useRef(restoreFocus);
  restoreFocusRef.current = restoreFocus;
  const initialFocusTargetRef = useRef(initialFocusRef);
  initialFocusTargetRef.current = initialFocusRef;
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) idRef.current = nextOverlayId("ds-dialog");
  const titleId = `${idRef.current}-title`;
  const descriptionId = description ? `${idRef.current}-description` : undefined;

  // Layout effect so focus moves before paint: a screen reader never lands on
  // the page behind the dialog.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const instanceId = idRef.current!;
    const popOverlay = pushOverlay({
      id: instanceId,
      isDismissible: () => closeOnEscapeRef.current,
      dismiss: (reason) => dismissRef.current(reason),
    });
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initial =
      initialFocusTargetRef.current?.current ??
      focusableElements(surface)[0] ??
      surface;
    initial.focus();

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (!isTopmostOverlay(instanceId)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (closeOnEscapeRef.current) dismissRef.current("escape");
        return;
      }
      const current = surfaceRef.current;
      if (event.key !== "Tab" || !current) return;

      const available = focusableElements(current);
      if (available.length === 0) {
        event.preventDefault();
        current.focus();
        return;
      }
      const first = available[0]!;
      const last = available[available.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      popOverlay();
      if (restoreFocusRef.current && previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => acquireScrollLock(), []);

  return (
    <div
      class={cx("ds-dialog-backdrop", backdropClassName)}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (closeOnBackdrop) dismissRef.current("backdrop");
      }}
    >
      <section
        ref={surfaceRef}
        class={cx("ds-dialog", `ds-dialog-${size}`, className)}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header class="ds-dialog-header">
          <h2 id={titleId}>{title}</h2>
        </header>
        <div class="ds-dialog-content">
          {description && (
            <div id={descriptionId} class="ds-dialog-description">
              {description}
            </div>
          )}
          {children}
        </div>
        {actions && <footer class="ds-dialog-actions">{actions}</footer>}
      </section>
    </div>
  );
}
