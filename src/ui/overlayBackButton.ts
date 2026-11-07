/** Android hardware back button for the overlay stack.
 *
 * Leoforma's overlay stack is platform free: it tracks which Dialog or Sheet
 * is topmost and offers `onOverlayPush` and `dismissTopOverlay` so a host can
 * wire its own back gesture. This module is that wiring for Capacitor. One
 * process-wide listener is registered lazily on the first overlay push. While
 * an overlay is open it owns the press (a non-dismissible one swallows it);
 * with none open the press falls through to history or exits the app, which
 * is Capacitor's documented pattern, since registering any listener otherwise
 * suppresses the platform default.
 *
 * Importing this module installs the hook, so every file that mounts a Dialog
 * or Sheet imports it for its side effect.
 */
import { App as CapacitorApp } from "@capacitor/app";
import { dismissTopOverlay, onOverlayPush } from "@leonardschwier/leoforma";

let backButtonListener: Promise<{ remove: () => void }> | null = null;

function handleBackButton(canGoBack: boolean): void {
  if (dismissTopOverlay("backbutton")) return;
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

/** Idempotent; runs on import. */
export function installOverlayBackButton(): void {
  onOverlayPush(ensureBackButtonListener);
}

/** Test-only: drop the registered listener so a test file starts clean. */
export function resetOverlayBackButtonForTests(): void {
  const pending = backButtonListener;
  backButtonListener = null;
  if (pending) void pending.then((handle) => handle.remove());
  // Leoforma's own test reset clears its push hook, so put ours back.
  installOverlayBackButton();
}

installOverlayBackButton();
