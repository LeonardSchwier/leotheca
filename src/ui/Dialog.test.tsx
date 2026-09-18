/** @vitest-environment jsdom */
import { createRef } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { Dialog } from "./Dialog";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Dialog", () => {
  it("labels the modal from its title and optional description", () => {
    const { getByRole } = render(
      <Dialog
        title="Archive note"
        description="This can be undone."
        onDismiss={vi.fn()}
      >
        <p>Body</p>
      </Dialog>,
    );
    const dialog = getByRole("dialog", { name: "Archive note" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.textContent).toContain("This can be undone.");
  });

  it("supports alertdialog semantics", () => {
    const { getByRole } = render(
      <Dialog role="alertdialog" title="Delete note" onDismiss={vi.fn()} />,
    );
    expect(getByRole("alertdialog", { name: "Delete note" })).toBeTruthy();
  });

  it("focuses the deliberately selected initial control", () => {
    const safeRef = createRef<HTMLButtonElement>();
    const { getByText } = render(
      <Dialog
        title="Delete note"
        initialFocusRef={safeRef}
        onDismiss={vi.fn()}
        actions={
          <>
            <button type="button">Delete</button>
            <button ref={safeRef} type="button">
              Cancel
            </button>
          </>
        }
      />,
    );
    expect(document.activeElement).toBe(getByText("Cancel"));
  });

  it("falls back to the first focusable control", () => {
    const { getByText } = render(
      <Dialog title="First" onDismiss={vi.fn()}>
        <button type="button">Only action</button>
      </Dialog>,
    );
    expect(document.activeElement).toBe(getByText("Only action"));
  });

  it("focuses the dialog surface when it has no controls", () => {
    const { getByRole } = render(
      <Dialog title="No controls" onDismiss={vi.fn()} />,
    );
    expect(document.activeElement).toBe(
      getByRole("dialog", { name: "No controls" }),
    );
  });

  it("wraps Tab from the last control to the first", () => {
    const { getByText } = render(
      <Dialog
        title="Actions"
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

  it("wraps Shift+Tab from the first control to the last", () => {
    const { getByText } = render(
      <Dialog
        title="Actions"
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
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("recaptures focus if Tab starts outside the modal", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { getByText } = render(
      <Dialog title="Actions" onDismiss={vi.fn()}>
        <button type="button">Inside</button>
      </Dialog>,
    );
    outside.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(getByText("Inside"));
    outside.remove();
  });

  it("dismisses on Escape by default", () => {
    const onDismiss = vi.fn();
    render(<Dialog title="Dismiss me" onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledWith("escape");
  });

  it("contains Escape without dismissing when interruption is unsafe", () => {
    const onDismiss = vi.fn();
    render(
      <Dialog title="Working" closeOnEscape={false} onDismiss={onDismiss} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("sends Escape only to the topmost dialog", () => {
    const lowerDismiss = vi.fn();
    const upperDismiss = vi.fn();
    render(
      <>
        <Dialog title="Lower" onDismiss={lowerDismiss} />
        <Dialog title="Upper" onDismiss={upperDismiss} />
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(upperDismiss).toHaveBeenCalledWith("escape");
    expect(lowerDismiss).not.toHaveBeenCalled();
  });

  it("dismisses only a direct backdrop press", () => {
    const onDismiss = vi.fn();
    const { getByRole, container } = render(
      <Dialog title="Dismiss me" onDismiss={onDismiss}>
        <span>Content</span>
      </Dialog>,
    );
    fireEvent.mouseDown(getByRole("dialog"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector(".dialog-backdrop")!);
    expect(onDismiss).toHaveBeenCalledWith("backdrop");
  });

  it("can make backdrop presses non-dismissible", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <Dialog title="Working" closeOnBackdrop={false} onDismiss={onDismiss} />,
    );
    fireEvent.mouseDown(container.querySelector(".dialog-backdrop")!);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("locks body scrolling while mounted and restores the prior value", () => {
    document.body.style.overflow = "clip";
    const { unmount } = render(<Dialog title="Open" onDismiss={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("restores focus to the opener on unmount", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<Dialog title="Open" onDismiss={vi.fn()} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("can deliberately skip focus restoration", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Dialog title="Open" restoreFocus={false} onDismiss={vi.fn()} />,
    );
    unmount();
    expect(document.activeElement).not.toBe(opener);
    opener.remove();
  });

  it("renders stable header, scrollable content, actions, and size classes", () => {
    const { container, getByText } = render(
      <Dialog
        title="Structured"
        size="lg"
        onDismiss={vi.fn()}
        actions={<button type="button">Done</button>}
      >
        <p>Long content</p>
      </Dialog>,
    );
    expect(container.querySelector(".dialog-header")).toBeTruthy();
    expect(container.querySelector(".dialog-content")?.textContent).toContain(
      "Long content",
    );
    expect(
      container.querySelector(".dialog-actions")?.contains(getByText("Done")),
    ).toBe(true);
    expect(container.querySelector(".dialog-surface")?.className).toContain(
      "dialog-lg",
    );
  });
});
