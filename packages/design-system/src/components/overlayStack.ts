/**
 * Shared bookkeeping for modal surfaces. Stacked overlays need one owner of
 * "who is on top", so Escape and a host's back gesture close only the topmost.
 * The module stays platform free: a host with a native back button subscribes
 * with `onOverlayPush` and calls `dismissTopOverlay`.
 */

export type OverlayDismissReason =
  | "escape"
  | "backdrop"
  | "backbutton"
  | "close-button";

export interface OverlayStackEntry {
  id: string;
  isDismissible: () => boolean;
  dismiss: (reason: OverlayDismissReason) => void;
}

const stack: OverlayStackEntry[] = [];
let scrollLockCount = 0;
let originalBodyOverflow = "";
let pushListener: (() => void) | null = null;

/** Called on each push, so a host can install its back handler lazily. */
export function onOverlayPush(listener: (() => void) | null): void {
  pushListener = listener;
}

export function pushOverlay(entry: OverlayStackEntry): () => void {
  stack.push(entry);
  pushListener?.();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = stack.lastIndexOf(entry);
    if (index >= 0) stack.splice(index, 1);
  };
}

export function isTopmostOverlay(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1]!.id === id;
}

/** Returns whether an overlay was open, whether or not it agreed to close: a
 * non-dismissible overlay still consumes the gesture. */
export function dismissTopOverlay(reason: OverlayDismissReason): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.isDismissible()) top.dismiss(reason);
  return true;
}

/** Reference counted, so closing one of two stacked dialogs keeps the lock. */
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

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

let overlayIdCounter = 0;

export function nextOverlayId(prefix: string): string {
  overlayIdCounter += 1;
  return `${prefix}-${overlayIdCounter}`;
}

export function resetOverlayStackForTests(): void {
  stack.length = 0;
  scrollLockCount = 0;
  originalBodyOverflow = "";
  document.body.style.overflow = "";
  pushListener = null;
}
