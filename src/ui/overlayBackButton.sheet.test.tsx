/** @vitest-environment jsdom */
// Leoforma owns Sheet and Dialog. What the app owns is the wiring of the
// Android back button into Leoforma's shared overlay stack, so these tests
// check that a Sheet takes part in it: Escape and the back press reach only
// the topmost overlay across both types, and the body scroll lock is shared.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

const addListener = vi.fn();
const exitApp = vi.fn();

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (...args: unknown[]) => addListener(...args),
    exitApp: (...args: unknown[]) => exitApp(...args),
  },
}));

const { Dialog, Sheet, resetOverlayStackForTests } =
  await import("@leonardschwier/leoforma");
const { resetOverlayBackButtonForTests } = await import("./overlayBackButton");

beforeEach(() => {
  addListener.mockReset();
  addListener.mockReturnValue(Promise.resolve({ remove: vi.fn() }));
  exitApp.mockReset();
});

afterEach(() => {
  cleanup();
  resetOverlayStackForTests();
  resetOverlayBackButtonForTests();
  document.body.style.overflow = "";
});

describe("a Sheet and the app's back button", () => {
  it("sends Escape only to a Sheet opened above a Dialog", () => {
    const dialogDismiss = vi.fn();
    const sheetDismiss = vi.fn();
    render(
      <>
        <Dialog title="Lower dialog" onDismiss={dialogDismiss} />
        <Sheet title="Upper sheet" onDismiss={sheetDismiss} />
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheetDismiss).toHaveBeenCalledWith("escape");
    expect(dialogDismiss).not.toHaveBeenCalled();
  });

  it("dispatches a simulated Android back press to the topmost overlay across types", () => {
    const dialogDismiss = vi.fn();
    const sheetDismiss = vi.fn();
    render(<Dialog title="Lower dialog" onDismiss={dialogDismiss} />);
    render(<Sheet title="Upper sheet" onDismiss={sheetDismiss} />);

    expect(addListener).toHaveBeenCalledTimes(1);
    const handler = addListener.mock.calls[0][1] as (event: {
      canGoBack: boolean;
    }) => void;
    handler({ canGoBack: true });

    expect(sheetDismiss).toHaveBeenCalledWith("backbutton");
    expect(dialogDismiss).not.toHaveBeenCalled();
  });

  it("shares one body scroll lock across a Dialog and a Sheet open together", () => {
    document.body.style.overflow = "clip";
    const { unmount: unmountDialog } = render(
      <Dialog title="Lower dialog" onDismiss={vi.fn()} />,
    );
    const { unmount: unmountSheet } = render(
      <Sheet title="Upper sheet" onDismiss={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmountSheet();
    expect(document.body.style.overflow).toBe("hidden");
    unmountDialog();
    expect(document.body.style.overflow).toBe("clip");
  });
});
