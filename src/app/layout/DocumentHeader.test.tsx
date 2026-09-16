/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { DocumentHeader } from "./DocumentHeader";

afterEach(cleanup);

const BASE_PROPS = {
  noteName: "Meeting notes.md",
  viewMode: "source" as const,
  onSetViewMode: vi.fn(),
  bookmarked: false,
  onToggleBookmark: vi.fn(),
};

describe("DocumentHeader", () => {
  it("shows the note name", () => {
    const { getByText } = render(<DocumentHeader {...BASE_PROPS} />);
    expect(getByText("Meeting notes.md")).toBeTruthy();
  });

  it("marks exactly the current view mode active", () => {
    const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} viewMode="split" />);
    expect(getByLabelText("Split").className).toContain("active");
    expect(getByLabelText("Source").className).not.toContain("active");
    expect(getByLabelText("Preview").className).not.toContain("active");
  });

  it("invokes onSetViewMode with the clicked mode", () => {
    const onSetViewMode = vi.fn();
    const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} onSetViewMode={onSetViewMode} />);
    fireEvent.click(getByLabelText("Preview"));
    expect(onSetViewMode).toHaveBeenCalledWith("preview");
  });

  it("shows the outline bookmark icon and 'Bookmark this note' label when not bookmarked", () => {
    const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} bookmarked={false} />);
    const button = getByLabelText("Bookmark this note");
    expect(button.className).not.toContain("active");
  });

  it("shows 'Remove bookmark' and the active state when bookmarked", () => {
    const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} bookmarked={true} />);
    const button = getByLabelText("Remove bookmark");
    expect(button.className).toContain("active");
  });

  it("invokes onToggleBookmark when the bookmark button is clicked", () => {
    const onToggleBookmark = vi.fn();
    const { getByLabelText } = render(
      <DocumentHeader {...BASE_PROPS} onToggleBookmark={onToggleBookmark} />,
    );
    fireEvent.click(getByLabelText("Bookmark this note"));
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);
  });
});
