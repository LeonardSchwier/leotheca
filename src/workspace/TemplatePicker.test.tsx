/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { TemplatePicker } from "./TemplatePicker";
import type { NoteTemplate } from "./fileTreeStore";

afterEach(() => {
  cleanup();
});

const templates: NoteTemplate[] = [
  { name: "Meeting Notes.md", path: "/workspace/Templates/Meeting Notes.md" },
  { name: "Weekly Review.md", path: "/workspace/Templates/Weekly Review.md" },
];

describe("TemplatePicker", () => {
  it("lists every template by name", () => {
    const { getByText } = render(
      <TemplatePicker templates={templates} templatesFolder="Templates" onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByText("Meeting Notes.md")).toBeTruthy();
    expect(getByText("Weekly Review.md")).toBeTruthy();
  });

  it("calls onSelect with the clicked template", () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <TemplatePicker templates={templates} templatesFolder="Templates" onSelect={onSelect} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByText("Weekly Review.md"));
    expect(onSelect).toHaveBeenCalledWith(templates[1]);
  });

  it("shows an empty-state hint naming the configured folder when there are no templates", () => {
    const { getByText, queryByRole } = render(
      <TemplatePicker templates={[]} templatesFolder="Custom Templates" onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByText(/No templates found/)).toBeTruthy();
    expect(getByText(/Custom Templates/)).toBeTruthy();
    expect(queryByRole("list")).toBeNull();
  });

  it("cancels when clicking the backdrop or the Cancel button, but not the dialog itself", () => {
    const onCancel = vi.fn();
    const { container, getByText } = render(
      <TemplatePicker templates={templates} templatesFolder="Templates" onSelect={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector(".modal")!);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
