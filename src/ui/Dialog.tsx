/** UX-01 spec sections 15.4, 20, and 24.5: shared modal dialog behavior.
 * The primitive owns modal semantics, focus containment/restoration,
 * dismissal policy, viewport fitting, and scroll locking. Callers supply
 * trusted Preact children only; no raw/untrusted HTML path exists here.
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import "./primitives.css";

export type DialogRole = "dialog" | "alertdialog";
export type DialogSize = "sm" | "md" | "lg";
export type DialogDismissReason = "escape" | "backdrop";

export interface DialogProps {
  title: string;
  description?: ComponentChildren;
  children?: ComponentChildren;
  actions?: ComponentChildren;
  role?: DialogRole;
  size?: DialogSize;
  className?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: { current: HTMLElement | null };
  onDismiss: (reason: DialogDismissReason) => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let dialogIdCounter = 0;
let openDialogCount = 0;
let originalBodyOverflow = "";
const dialogStack: string[] = [];

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function Dialog({
  title,
  description,
  children,
  actions,
  role = "dialog",
  size = "md",
  className,
  closeOnEscape = true,
  closeOnBackdrop = true,
  restoreFocus = true,
  initialFocusRef,
  onDismiss,
}: DialogProps): JSX.Element {
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
    dialogIdCounter += 1;
    idRef.current = `dialog-${dialogIdCounter}`;
  }
  const titleId = `${idRef.current}-title`;
  const descriptionId = description
    ? `${idRef.current}-description`
    : undefined;

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const instanceId = idRef.current!;
    dialogStack.push(instanceId);
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const initial =
      initialFocusTargetRef.current?.current ??
      focusableElements(surface)[0] ??
      surface;
    initial.focus();

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (dialogStack[dialogStack.length - 1] !== instanceId) return;
      if (event.key === "Escape") {
        // A non-dismissible dialog must also keep Escape from reaching a
        // lower overlay or navigation layer behind it.
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
      const stackIndex = dialogStack.lastIndexOf(instanceId);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      if (
        restoreFocusRef.current &&
        previouslyFocusedRef.current?.isConnected
      ) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (openDialogCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogCount += 1;
    return () => {
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0)
        document.body.style.overflow = originalBodyOverflow;
    };
  }, []);

  return (
    <div
      class="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (closeOnBackdrop) dismissRef.current("backdrop");
      }}
    >
      <section
        ref={surfaceRef}
        class={["modal", "dialog-surface", `dialog-${size}`, className]
          .filter(Boolean)
          .join(" ")}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header class="dialog-header">
          <h2 id={titleId}>{title}</h2>
        </header>
        <div class="dialog-content">
          {description && (
            <div id={descriptionId} class="dialog-description">
              {description}
            </div>
          )}
          {children}
        </div>
        {actions && <footer class="dialog-actions">{actions}</footer>}
      </section>
    </div>
  );
}
