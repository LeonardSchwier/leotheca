/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { DocumentHeader } from "./DocumentHeader";

afterEach(cleanup);

const BASE_PROPS = {
  noteName: "Meeting notes.md",
  notePath: "/workspace/notes/Meeting notes.md",
  viewMode: "source" as const,
  onSetViewMode: vi.fn(),
  bookmarked: false,
  onToggleBookmark: vi.fn(),
  dirty: false,
  saving: false,
  saveError: null as string | null,
  onRetrySave: vi.fn(),
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

  it("shows the full path as a tooltip on the title", () => {
    const { getByTitle } = render(<DocumentHeader {...BASE_PROPS} />);
    expect(getByTitle("/workspace/notes/Meeting notes.md")).toBeTruthy();
  });

  describe("save-state (spec 13.6)", () => {
    it("stays quiet when clean (not dirty, not saving, no error)", () => {
      const { queryByText } = render(<DocumentHeader {...BASE_PROPS} />);
      expect(queryByText("Unsaved")).toBeNull();
      expect(queryByText("Saving")).toBeNull();
      expect(queryByText("Saved")).toBeNull();
      expect(queryByText("Save failed")).toBeNull();
    });

    it("shows a dirty indicator with an accessible 'Unsaved changes' label when dirty", () => {
      const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} dirty={true} />);
      expect(getByLabelText("Unsaved changes")).toBeTruthy();
    });

    it("shows Saving while a write is in flight, not the dirty indicator", () => {
      const { getByText, queryByText } = render(
        <DocumentHeader {...BASE_PROPS} dirty={true} saving={true} />,
      );
      expect(getByText("Saving")).toBeTruthy();
      expect(queryByText("Unsaved")).toBeNull();
    });

    it("shows Save failed with a working Retry button when saveError is set, even while dirty", () => {
      const onRetrySave = vi.fn();
      const { getByText, getByRole } = render(
        <DocumentHeader {...BASE_PROPS} dirty={true} saveError="disk full" onRetrySave={onRetrySave} />,
      );
      expect(getByText("Save failed")).toBeTruthy();
      expect(getByRole("alert")).toBeTruthy();
      fireEvent.click(getByRole("button", { name: "Retry" }));
      expect(onRetrySave).toHaveBeenCalledTimes(1);
    });

    it("shows a transient Saved message after saving finishes successfully, then goes quiet", async () => {
      vi.useFakeTimers();
      try {
        const { rerender, getByText, queryByText } = render(
          <DocumentHeader {...BASE_PROPS} saving={true} />,
        );
        rerender(<DocumentHeader {...BASE_PROPS} saving={false} />);
        expect(getByText("Saved")).toBeTruthy();

        vi.advanceTimersByTime(1500);
        await Promise.resolve();
        expect(queryByText("Saved")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not show a Saved pulse when a save failed instead of completing", () => {
      const { rerender, queryByText } = render(<DocumentHeader {...BASE_PROPS} saving={true} />);
      rerender(<DocumentHeader {...BASE_PROPS} saving={false} saveError="disk full" />);
      expect(queryByText("Saved")).toBeNull();
    });
  });
});
