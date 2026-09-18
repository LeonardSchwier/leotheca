/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverlayDismissReason } from "./overlayStack";

const addListener = vi.fn();
const exitApp = vi.fn();

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (...args: unknown[]) => addListener(...args),
    exitApp: (...args: unknown[]) => exitApp(...args),
  },
}));

const {
  acquireScrollLock,
  isTopmostOverlay,
  nextOverlayId,
  pushOverlay,
  resetOverlayStackForTests,
  focusableElements,
} = await import("./overlayStack");

function pushEntry(
  id: string,
  overrides: Partial<{
    isDismissible: () => boolean;
    dismiss: (reason: OverlayDismissReason) => void;
  }> = {},
) {
  const dismiss = overrides.dismiss ?? vi.fn();
  const isDismissible = overrides.isDismissible ?? (() => true);
  const pop = pushOverlay({ id, isDismissible, dismiss });
  return { pop, dismiss };
}

describe("overlayStack", () => {
  beforeEach(() => {
    addListener.mockReset();
    addListener.mockReturnValue(Promise.resolve({ remove: vi.fn() }));
    exitApp.mockReset();
  });

  afterEach(() => {
    resetOverlayStackForTests();
  });

  it("assigns stable, unique, prefixed ids", () => {
    const first = nextOverlayId("dialog");
    const second = nextOverlayId("dialog");
    const third = nextOverlayId("sheet");
    expect(first).not.toBe(second);
    expect(first.startsWith("dialog-")).toBe(true);
    expect(third.startsWith("sheet-")).toBe(true);
  });

  it("tracks the topmost overlay as entries push and pop", () => {
    const a = pushEntry("a");
    expect(isTopmostOverlay("a")).toBe(true);

    const b = pushEntry("b");
    expect(isTopmostOverlay("a")).toBe(false);
    expect(isTopmostOverlay("b")).toBe(true);

    b.pop();
    expect(isTopmostOverlay("a")).toBe(true);

    a.pop();
    expect(isTopmostOverlay("a")).toBe(false);
  });

  it("pop is idempotent against a double call", () => {
    const a = pushEntry("a");
    pushEntry("b");
    a.pop();
    a.pop(); // must not remove "b" or throw
    expect(isTopmostOverlay("b")).toBe(true);
  });

  it("ref-counts the body scroll lock across overlapping overlays", () => {
    document.body.style.overflow = "clip";
    const releaseFirst = acquireScrollLock();
    expect(document.body.style.overflow).toBe("hidden");

    const releaseSecond = acquireScrollLock();
    releaseSecond();
    expect(document.body.style.overflow).toBe("hidden");

    releaseFirst();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("release is idempotent against a double call", () => {
    document.body.style.overflow = "clip";
    const release = acquireScrollLock();
    release();
    release();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("registers exactly one back-button listener no matter how many overlays open", () => {
    pushEntry("a");
    pushEntry("b");
    pushEntry("c");
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener.mock.calls[0][0]).toBe("backButton");
  });

  it("dispatches a back-button press to the topmost dismissible overlay only", () => {
    const lower = pushEntry("lower");
    const upper = pushEntry("upper");
    const handler = addListener.mock.calls[0][1] as (event: {
      canGoBack: boolean;
    }) => void;

    handler({ canGoBack: true });

    expect(upper.dismiss).toHaveBeenCalledWith("backbutton");
    expect(lower.dismiss).not.toHaveBeenCalled();
  });

  it("swallows the back press for a non-dismissible topmost overlay without falling through", () => {
    pushEntry("busy", { isDismissible: () => false });
    const handler = addListener.mock.calls[0][1] as (event: {
      canGoBack: boolean;
    }) => void;

    handler({ canGoBack: true });

    expect(exitApp).not.toHaveBeenCalled();
  });

  it("falls back to history.back() when no overlay is open and history exists", () => {
    pushEntry("only").pop();
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const handler = addListener.mock.calls[0][1] as (event: {
      canGoBack: boolean;
    }) => void;

    handler({ canGoBack: true });

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
    historyBack.mockRestore();
  });

  it("exits the app when no overlay is open and there is no history to go back to", () => {
    pushEntry("only").pop();
    const handler = addListener.mock.calls[0][1] as (event: {
      canGoBack: boolean;
    }) => void;

    handler({ canGoBack: false });

    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it("finds focusable elements in DOM order and skips aria-hidden ones", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <button>First</button>
      <button aria-hidden="true">Hidden</button>
      <input disabled />
      <a href="#">Link</a>
    `;
    document.body.append(container);
    const found = focusableElements(container).map((el) => el.textContent || el.tagName);
    expect(found).toEqual(["First", "Link"]);
    container.remove();
  });
});
