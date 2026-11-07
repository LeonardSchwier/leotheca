/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addListener = vi.fn();
const exitApp = vi.fn();

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (...args: unknown[]) => addListener(...args),
    exitApp: (...args: unknown[]) => exitApp(...args),
  },
}));

const { pushOverlay, nextOverlayId, resetOverlayStackForTests } =
  await import("@leonardschwier/leoforma");
const { resetOverlayBackButtonForTests } = await import("./overlayBackButton");

type BackHandler = (event: { canGoBack: boolean }) => void;

function open(isDismissible: boolean) {
  const dismiss = vi.fn();
  const pop = pushOverlay({
    id: nextOverlayId("test"),
    isDismissible: () => isDismissible,
    dismiss,
  });
  return { dismiss, pop };
}

function handler(): BackHandler {
  return addListener.mock.calls[0]![1] as BackHandler;
}

describe("overlayBackButton", () => {
  beforeEach(() => {
    addListener.mockReset();
    addListener.mockReturnValue(Promise.resolve({ remove: vi.fn() }));
    exitApp.mockReset();
  });

  afterEach(() => {
    resetOverlayStackForTests();
    resetOverlayBackButtonForTests();
  });

  it("registers exactly one back-button listener however many overlays open", () => {
    open(true);
    open(true);
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener.mock.calls[0]![0]).toBe("backButton");
  });

  it("sends a back press to the topmost dismissible overlay only", () => {
    const lower = open(true);
    const upper = open(true);
    handler()({ canGoBack: true });
    expect(upper.dismiss).toHaveBeenCalledWith("backbutton");
    expect(lower.dismiss).not.toHaveBeenCalled();
  });

  it("swallows the press for a non-dismissible topmost overlay without falling through", () => {
    const lower = open(true);
    const upper = open(false);
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    handler()({ canGoBack: true });
    expect(upper.dismiss).not.toHaveBeenCalled();
    expect(lower.dismiss).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
    historyBack.mockRestore();
  });

  it("goes back in history when no overlay is open and history exists", () => {
    open(true).pop();
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    handler()({ canGoBack: true });
    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
    historyBack.mockRestore();
  });

  it("exits the app when no overlay is open and there is no history", () => {
    open(true).pop();
    handler()({ canGoBack: false });
    expect(exitApp).toHaveBeenCalledTimes(1);
  });
});
