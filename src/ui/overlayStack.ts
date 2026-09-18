/** UX-01 spec section 24.5 "Overlay system": Dialog, Sheet, Menu, Tooltip,
 * and Toast should share a portal root, focus restoration, Escape
 * handling, scroll-lock policy, and Android back integration rather than
 * each reimplementing them. This module is the shared, framework-free
 * singleton state those primitives register with; it owns no rendering
 * and no application data, only overlay stacking order, body scroll
 * locking, and the one process-wide Android hardware back-button
 * listener the spec calls for ("one match-media subscription per
 * application, not one per control" applies equally to this listener).
 *
 * A modal overlay (Dialog, Sheet) pushes itself here on mount and pops on
 * unmount. The topmost entry always owns Escape and the Android back
 * button: even a non-dismissible overlay (e.g. "please wait, cannot be
 * interrupted") must still swallow both rather than letting them reach a
 * lower overlay or the app shell underneath, matching Dialog's existing
 * `closeOnEscape={false}` contract, now generalized to `isDismissible`.
 */
import { App as CapacitorApp } from "@capacitor/app";

export type OverlayDismissReason =
  "escape" | "backdrop" | "backbutton" | "close-button";

export interface OverlayStackEntry {
  /** Stable per-instance id, used only for topmost identity checks. */
  id: string;
  /** Live read of whether Escape/back-button should actually dismiss, as
   * opposed to merely being swallowed (see module doc above). */
  isDismissible: () => boolean;
  dismiss: (reason: OverlayDismissReason) => void;
}

const stack: OverlayStackEntry[] = [];

let scrollLockCount = 0;
let originalBodyOverflow = "";

let backButtonListener: Promise<{ remove: () => void }> | null = null;

function handleBackButton(canGoBack: boolean): void {
  const topmost = stack[stack.length - 1];
  if (topmost) {
    // An overlay is open: it owns the back press outright. A
    // non-dismissible overlay swallows it silently, exactly like Escape.
    if (topmost.isDismissible()) topmost.dismiss("backbutton");
    return;
  }
  // No overlay open: fall through to the platform's own default handling,
  // which registering any 'backButton' listener at all otherwise
  // suppresses. This is Capacitor's own documented pattern.
  if (canGoBack) {
    window.history.back();
  } else {
    void CapacitorApp.exitApp();
  }
}

function ensureBackButtonListener(): void {
  if (backButtonListener) return;
  backButtonListener = CapacitorApp.addListener("backButton", (event) => {
    handleBackButton(event.canGoBack);
  });
}

/** Register an open overlay instance. Returns its cleanup function; call it
 * exactly once, on unmount. Idempotent against double-invocation. */
export function pushOverlay(entry: OverlayStackEntry): () => void {
  stack.push(entry);
  ensureBackButtonListener();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = stack.lastIndexOf(entry);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Whether `id` is the topmost open overlay, i.e. the one Escape/back
 * button presses should currently reach. */
export function isTopmostOverlay(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

/** Ref-counted body scroll lock shared by every modal overlay so nested or
 * sibling overlays don't fight over `document.body.style.overflow`.
 * Returns a release function; call it exactly once, on unmount. */
export function acquireScrollLock(): () => void {
  if (scrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.overflow = originalBodyOverflow;
    }
  };
}

export const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Focusable descendants of `container`, in DOM order, excluding anything
 * hidden from assistive technology. Shared by every primitive that traps
 * focus (Dialog, Sheet). */
export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

let overlayIdCounter = 0;

/** A stable, unique id for one overlay instance, e.g. `dialog-3`. */
export function nextOverlayId(prefix: string): string {
  overlayIdCounter += 1;
  return `${prefix}-${overlayIdCounter}`;
}

/** Test-only: drop all singleton state, including the back-button
 * listener, so test files that assert on stack/listener behavior start
 * from a clean process-wide slate. Never call from application code. */
export function resetOverlayStackForTests(): void {
  stack.length = 0;
  scrollLockCount = 0;
  originalBodyOverflow = "";
  document.body.style.overflow = "";
  const pending = backButtonListener;
  backButtonListener = null;
  if (pending) void pending.then((handle) => handle.remove());
}
