import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Button } from "./Button";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastItem {
  id: string;
  message: ComponentChildren;
  tone?: ToastTone;
  /** Auto dismiss delay in ms. Omit for a toast that stays until closed, which
   * is the right choice for anything the user must not miss. */
  duration?: number;
}

export interface ToastRegionProps {
  toasts: readonly ToastItem[];
  onDismiss: (id: string) => void;
  /** Accessible name of the landmark. */
  label?: string;
  dismissLabel?: string;
}

function Toast({
  toast,
  onDismiss,
  dismissLabel,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  dismissLabel: string;
}): JSX.Element {
  const tone = toast.tone ?? "neutral";
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const [paused, setPaused] = useState(false);

  // Hover and focus pause the timer, so a slow reader or a keyboard user on
  // the close button does not lose the message (WCAG 2.2.1).
  useEffect(() => {
    if (toast.duration === undefined || paused) return;
    const timer = setTimeout(() => dismissRef.current(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, paused]);

  return (
    <div
      class={`ds-toast ds-toast-${tone}`}
      // Errors interrupt; everything else waits for a pause in speech.
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusIn={() => setPaused(true)}
      onFocusOut={() => setPaused(false)}
    >
      <div class="ds-toast-message">{toast.message}</div>
      <Button variant="ghost" size="sm" onClick={() => onDismiss(toast.id)}>
        {dismissLabel}
      </Button>
    </div>
  );
}

/** Controlled: the host owns the list. Keep this mounted while empty, because
 * a live region must exist before its content changes to be announced. */
export function ToastRegion({
  toasts,
  onDismiss,
  label = "Notifications",
  dismissLabel = "Dismiss",
}: ToastRegionProps): JSX.Element {
  return (
    <div class="ds-toast-region" role="region" aria-label={label}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          dismissLabel={dismissLabel}
        />
      ))}
    </div>
  );
}
