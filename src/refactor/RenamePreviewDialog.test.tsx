/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { RenamePreviewDialog } from "./RenamePreviewDialog";
import type { RenamePlan } from "./renamePlan";

afterEach(cleanup);

function plan(overrides: Partial<RenamePlan> = {}): RenamePlan {
  return { oldPath: "/vault/target.md", newPath: "/vault/renamed.md", edits: [], blocked: [], ...overrides };
}

describe("RenamePreviewDialog", () => {
  it("shows the old and new path", () => {
    const { getByText } = render(
      <RenamePreviewDialog oldPath="/vault/target.md" newPath="/vault/renamed.md" plan={plan()} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByText("/vault/target.md")).toBeTruthy();
    expect(getByText("/vault/renamed.md")).toBeTruthy();
  });

  it("lists each link that will update, old and new text", () => {
    const { getByText } = render(
      <RenamePreviewDialog
        oldPath="/vault/target.md"
        newPath="/vault/renamed.md"
        plan={plan({
          edits: [{ path: "/vault/referrer.md", from: 0, to: 10, oldText: "[[target]]", newText: "[[renamed]]" }],
        })}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByText("1 link elsewhere will still need updating")).toBeTruthy();
    expect(getByText("/vault/referrer.md")).toBeTruthy();
    expect(getByText("[[target]]")).toBeTruthy();
    expect(getByText("[[renamed]]")).toBeTruthy();
  });

  it("lists each blocked link with its reason", () => {
    const { getByText } = render(
      <RenamePreviewDialog
        oldPath="/vault/target.md"
        newPath="/vault/renamed.md"
        plan={plan({
          blocked: [{ path: "/vault/other.md", from: 0, to: 10, oldText: "[[target]]", reason: "would become ambiguous" }],
        })}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByText("1 link cannot be safely updated automatically")).toBeTruthy();
    expect(getByText("would become ambiguous")).toBeTruthy();
  });

  it("uses plural wording for more than one edit or blocked link", () => {
    const { getByText } = render(
      <RenamePreviewDialog
        oldPath="/vault/target.md"
        newPath="/vault/renamed.md"
        plan={plan({
          edits: [
            { path: "/vault/a.md", from: 0, to: 10, oldText: "[[target]]", newText: "[[renamed]]" },
            { path: "/vault/b.md", from: 0, to: 10, oldText: "[[target]]", newText: "[[renamed]]" },
          ],
          blocked: [
            { path: "/vault/c.md", from: 0, to: 10, oldText: "[[target]]", reason: "reason one" },
            { path: "/vault/d.md", from: 0, to: 10, oldText: "[[target]]", reason: "reason two" },
          ],
        })}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByText("2 links elsewhere will still need updating")).toBeTruthy();
    expect(getByText("2 links cannot be safely updated automatically")).toBeTruthy();
  });

  it("shows neither section when the plan has nothing to review", () => {
    const { queryByText } = render(
      <RenamePreviewDialog oldPath="/vault/target.md" newPath="/vault/renamed.md" plan={plan()} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(queryByText(/will still need updating/)).toBeNull();
    expect(queryByText(/cannot be safely updated/)).toBeNull();
  });

  it("calls onContinue and onCancel from their respective buttons", () => {
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    const { getByText } = render(
      <RenamePreviewDialog oldPath="/vault/target.md" newPath="/vault/renamed.md" plan={plan()} onContinue={onContinue} onCancel={onCancel} />,
    );
    fireEvent.click(getByText("Continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels when the overlay backdrop is clicked, but not when the dialog body is clicked", () => {
    const onCancel = vi.fn();
    const { container, getByText } = render(
      <RenamePreviewDialog oldPath="/vault/target.md" newPath="/vault/renamed.md" plan={plan()} onContinue={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(getByText("Review rename"));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
