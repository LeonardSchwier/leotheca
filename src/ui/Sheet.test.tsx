/** @vitest-environment jsdom */
import { createRef } from "preact";
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

const { Sheet } = await import("./Sheet");
const { Dialog } = await import("./Dialog");
const { resetOverlayStackForTests } = await import("./overlayStack");

beforeEach(() => {
  addListener.mockReset();
  addListener.mockReturnValue(Promise.resolve({ remove: vi.fn() }));
  exitApp.mockReset();
});

afterEach(() => {
  cleanup();
  resetOverlayStackForTests();
  document.body.style.overflow = "";
});

describe("Sheet", () => {
  it("labels the surface from its title and optional description", () => {
    const { getByRole } = render(
      <Sheet
        title="Quick capture"
        description="Capture a note without leaving your place."
        onDismiss={vi.fn()}
      >
        <p>Body</p>
      </Sheet>,
    );
    const sheet = getByRole("dialog", { name: "Quick capture" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("aria-describedby")).toBeTruthy();
    expect(sheet.textContent).toContain(
      "Capture a note without leaving your place.",
    );
  });

  it("focuses the deliberately selected initial control", () => {
    const safeRef = createRef<HTMLTextAreaElement>();
    const { container } = render(
      <Sheet title="Capture" initialFocusRef={safeRef} onDismiss={vi.fn()}>
        <textarea ref={safeRef} />
      </Sheet>,
    );
    expect(document.activeElement).toBe(container.querySelector("textarea"));
  });

  it("falls back to the first focusable control", () => {
    const { getByText } = render(
      <Sheet title="First" showCloseButton={false} onDismiss={vi.fn()}>
        <button type="button">Only action</button>
      </Sheet>,
    );
    expect(document.activeElement).toBe(getByText("Only action"));
  });

  it("wraps Tab from the last control to the first", () => {
    const { getByText } = render(
      <Sheet
        title="Actions"
        showCloseButton={false}
        onDismiss={vi.fn()}
        actions={
          <>
            <button type="button">First</button>
            <button type="button">Last</button>
          </>
        }
      />,
    );
    const first = getByText("First");
    const last = getByText("Last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("dismisses on Escape by default", () => {
    const onDismiss = vi.fn();
    render(<Sheet title="Dismiss me" onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledWith("escape");
  });

  it("contains Escape without dismissing when interruption is unsafe", () => {
    const onDismiss = vi.fn();
    render(
      <Sheet title="Working" closeOnEscape={false} onDismiss={onDismiss} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses only a direct backdrop press", () => {
    const onDismiss = vi.fn();
    const { getByRole, container } = render(
      <Sheet title="Dismiss me" onDismiss={onDismiss}>
        <span>Content</span>
      </Sheet>,
    );
    fireEvent.mouseDown(getByRole("dialog"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector(".sheet-backdrop")!);
    expect(onDismiss).toHaveBeenCalledWith("backdrop");
  });

  it("renders a close button by default and dismisses through it", () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <Sheet title="Dismiss me" onDismiss={onDismiss} />,
    );
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledWith("close-button");
  });

  it("can omit the close button", () => {
    const { queryByRole } = render(
      <Sheet title="No close" showCloseButton={false} onDismiss={vi.fn()} />,
    );
    expect(queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("locks body scrolling while mounted and restores the prior value", () => {
    document.body.style.overflow = "clip";
    const { unmount } = render(<Sheet title="Open" onDismiss={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("restores focus to the opener on unmount", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<Sheet title="Open" onDismiss={vi.fn()} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("renders scrollable content and an actions footer", () => {
    const { container, getByText } = render(
      <Sheet
        title="Structured"
        onDismiss={vi.fn()}
        actions={<button type="button">Done</button>}
      >
        <p>Long content</p>
      </Sheet>,
    );
    expect(container.querySelector(".sheet-content")?.textContent).toContain(
      "Long content",
    );
    expect(
      container.querySelector(".sheet-actions")?.contains(getByText("Done")),
    ).toBe(true);
  });

  describe("stacking with Dialog", () => {
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
});
