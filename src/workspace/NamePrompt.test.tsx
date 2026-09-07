/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { NamePrompt } from "./NamePrompt";

afterEach(() => {
  cleanup();
});

describe("NamePrompt", () => {
  it("defaults the submit button to Create", () => {
    const { getByText } = render(
      <NamePrompt title="New note" placeholder="note-name" error={null} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByText("Create")).toBeTruthy();
  });

  it("uses a custom submit label when given one, e.g. for renaming", () => {
    // The real bug this project shipped and this test locks in: the submit
    // button used to always say "Create", even on the rename dialogs. Note
    // the dialog's own title is "Rename" too, so this specifically checks
    // the *button*, not just that "Rename" appears somewhere on the page.
    const { getByRole, queryByText } = render(
      <NamePrompt
        title="Rename"
        submitLabel="Rename"
        placeholder="old-name"
        initialValue="old-name"
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole("button", { name: "Rename" })).toBeTruthy();
    expect(queryByText("Create")).toBeNull();
  });

  it("pre-fills and selects the initial value, for a rename starting from the existing name", () => {
    const { getByDisplayValue } = render(
      <NamePrompt
        title="Rename"
        submitLabel="Rename"
        placeholder="x"
        initialValue="old-name.md"
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByDisplayValue("old-name.md")).toBeTruthy();
  });

  it("submits the trimmed value when Enter is pressed", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <NamePrompt title="New note" placeholder="x" error={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "  My Note  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("My Note");
  });

  it("does not submit an empty or whitespace-only value", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <NamePrompt title="New note" placeholder="x" error={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <NamePrompt title="New note" placeholder="x" error={null} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(container.querySelector("input")!, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels when clicking the backdrop, but not when clicking inside the dialog", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <NamePrompt title="New note" placeholder="x" error={null} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector(".name-prompt")!);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when given one", () => {
    const { getByText } = render(
      <NamePrompt
        title="New note"
        placeholder="x"
        error='"foo.md" already exists in this folder.'
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByText('"foo.md" already exists in this folder.')).toBeTruthy();
  });
});
