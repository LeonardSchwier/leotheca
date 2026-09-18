/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { ConfirmDialogHost } from "./ConfirmDialogHost";
import { confirmRequest, type ConfirmRequest } from "./confirmDialog";

afterEach(() => {
  confirmRequest.value = null;
  cleanup();
});

function openRequest(overrides: Partial<ConfirmRequest> = {}) {
  const resolve = vi.fn();
  confirmRequest.value = {
    title: "Delete note?",
    message: "This cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Keep note",
    danger: true,
    resolve,
    ...overrides,
  };
  return resolve;
}

describe("ConfirmDialogHost", () => {
  it("renders the request as an alertdialog and safely focuses Cancel", () => {
    openRequest();
    const { getByRole, getByText } = render(<ConfirmDialogHost />);
    expect(getByRole("alertdialog", { name: "Delete note?" })).toBeTruthy();
    expect(getByText("This cannot be undone.")).toBeTruthy();
    expect(document.activeElement).toBe(getByText("Keep note"));
  });

  it("resolves true and clears the request when confirmed", () => {
    const resolve = openRequest();
    const { getByText, queryByRole } = render(<ConfirmDialogHost />);
    fireEvent.click(getByText("Delete"));
    expect(resolve).toHaveBeenCalledWith(true);
    expect(confirmRequest.value).toBeNull();
    expect(queryByRole("alertdialog")).toBeNull();
  });

  it("resolves false for the Cancel button", () => {
    const resolve = openRequest();
    const { getByText } = render(<ConfirmDialogHost />);
    fireEvent.click(getByText("Keep note"));
    expect(resolve).toHaveBeenCalledWith(false);
    expect(confirmRequest.value).toBeNull();
  });

  it("resolves false for Escape and a backdrop press", () => {
    const escapeResolve = openRequest();
    const { container, rerender } = render(<ConfirmDialogHost />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(escapeResolve).toHaveBeenCalledWith(false);

    const backdropResolve = openRequest();
    rerender(<ConfirmDialogHost />);
    fireEvent.mouseDown(container.querySelector(".dialog-backdrop")!);
    expect(backdropResolve).toHaveBeenCalledWith(false);
  });

  it("uses danger and primary action variants without making color the label", () => {
    openRequest();
    const { getByText, rerender } = render(<ConfirmDialogHost />);
    const danger = getByText("Delete");
    expect(danger.className).toContain("btn-danger");
    expect(danger.textContent).toBe("Delete");

    openRequest({ danger: false, confirmLabel: "Continue" });
    rerender(<ConfirmDialogHost />);
    expect(getByText("Continue").className).toContain("btn-primary");
  });

  it("restores focus to the opener after settlement", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    openRequest();
    const { getByText } = render(<ConfirmDialogHost />);
    fireEvent.click(getByText("Keep note"));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
