/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { MarkdownHelpDialog } from "./MarkdownHelpDialog";

afterEach(() => {
  cleanup();
});

describe("MarkdownHelpDialog", () => {
  it("renders the full reference table", () => {
    const { getByText } = render(<MarkdownHelpDialog onClose={vi.fn()} />);
    expect(getByText("**bold**")).toBeTruthy();
    expect(getByText("Bold text")).toBeTruthy();
    expect(getByText("[[Note Name]]")).toBeTruthy();
    expect(getByText("Link to another note")).toBeTruthy();
  });

  it("also lists the keyboard shortcuts, below the markdown reference", () => {
    const { getByText } = render(<MarkdownHelpDialog onClose={vi.fn()} />);
    expect(getByText("Keyboard shortcuts")).toBeTruthy();
    expect(getByText("Ctrl+K")).toBeTruthy();
    expect(getByText("Command palette")).toBeTruthy();
  });

  it("closes when the x button is clicked", () => {
    const onClose = vi.fn();
    const { getByText } = render(<MarkdownHelpDialog onClose={onClose} />);
    fireEvent.click(getByText("x"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<MarkdownHelpDialog onClose={onClose} />);
    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog itself", () => {
    const onClose = vi.fn();
    const { container } = render(<MarkdownHelpDialog onClose={onClose} />);
    fireEvent.click(container.querySelector(".markdown-help")!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
