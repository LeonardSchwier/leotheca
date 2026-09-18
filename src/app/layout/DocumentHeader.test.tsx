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
  inspectorOpen: false,
  onToggleInspector: vi.fn(),
  onRename: vi.fn(),
  onCopyRelativePath: vi.fn(),
  onDelete: vi.fn(),
  onShowHelp: vi.fn(),
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

  describe("Inspector trigger (spec 13.5)", () => {
    it("is not marked active when the Inspector is closed", () => {
      const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} inspectorOpen={false} />);
      const button = getByLabelText("Inspector");
      expect(button.className).not.toContain("active");
      expect(button.getAttribute("aria-pressed")).toBe("false");
    });

    it("is marked active when the Inspector is open", () => {
      const { getByLabelText } = render(<DocumentHeader {...BASE_PROPS} inspectorOpen={true} />);
      const button = getByLabelText("Inspector");
      expect(button.className).toContain("active");
      expect(button.getAttribute("aria-pressed")).toBe("true");
    });

    it("invokes onToggleInspector when clicked", () => {
      const onToggleInspector = vi.fn();
      const { getByLabelText } = render(
        <DocumentHeader {...BASE_PROPS} onToggleInspector={onToggleInspector} />,
      );
      fireEvent.click(getByLabelText("Inspector"));
      expect(onToggleInspector).toHaveBeenCalledTimes(1);
    });
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
      const savingStatus = getByText("Saving").closest('[role="status"]');
      expect(savingStatus?.getAttribute("aria-busy")).toBe("true");
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
        expect(getByText("Saved").closest('[role="status"]')).toBeTruthy();

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

  describe("overflow menu (spec 13.5)", () => {
    it("is closed by default", () => {
      const { queryByRole } = render(<DocumentHeader {...BASE_PROPS} />);
      expect(queryByRole("menu")).toBeNull();
    });

    it("opens on click and reflects the state via aria-expanded", () => {
      const { getByLabelText, getByRole } = render(<DocumentHeader {...BASE_PROPS} />);
      const trigger = getByLabelText("More note actions");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");

      fireEvent.click(trigger);

      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(getByRole("menu")).toBeTruthy();
    });

    it("toggles closed when the trigger is clicked again", () => {
      const { getByLabelText, queryByRole } = render(<DocumentHeader {...BASE_PROPS} />);
      const trigger = getByLabelText("More note actions");
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      expect(queryByRole("menu")).toBeNull();
    });

    it("closes on an outside pointer interaction without requiring an action", () => {
      const { getByLabelText, queryByRole } = render(<DocumentHeader {...BASE_PROPS} />);
      fireEvent.click(getByLabelText("More note actions"));
      expect(queryByRole("menu")).toBeTruthy();

      fireEvent.pointerDown(document.body);

      expect(queryByRole("menu")).toBeNull();
    });

    it("closes on Escape", () => {
      const { getByLabelText, queryByRole } = render(<DocumentHeader {...BASE_PROPS} />);
      fireEvent.click(getByLabelText("More note actions"));
      expect(queryByRole("menu")).toBeTruthy();

      fireEvent.keyDown(queryByRole("menu")!, { key: "Escape" });

      expect(queryByRole("menu")).toBeNull();
    });

    it("invokes onRename and closes the menu", () => {
      const onRename = vi.fn();
      const { getByLabelText, getByText, queryByRole } = render(
        <DocumentHeader {...BASE_PROPS} onRename={onRename} />,
      );
      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Rename"));

      expect(onRename).toHaveBeenCalledTimes(1);
      expect(queryByRole("menu")).toBeNull();
    });

    it("invokes onCopyRelativePath and closes the menu", () => {
      const onCopyRelativePath = vi.fn();
      const { getByLabelText, getByText, queryByRole } = render(
        <DocumentHeader {...BASE_PROPS} onCopyRelativePath={onCopyRelativePath} />,
      );
      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Copy Relative Path"));

      expect(onCopyRelativePath).toHaveBeenCalledTimes(1);
      expect(queryByRole("menu")).toBeNull();
    });

    it("invokes onDelete and closes the menu, marking Delete with danger styling", () => {
      const onDelete = vi.fn();
      const { getByLabelText, getByText, queryByRole } = render(
        <DocumentHeader {...BASE_PROPS} onDelete={onDelete} />,
      );
      fireEvent.click(getByLabelText("More note actions"));
      const deleteItem = getByText("Delete");
      expect(deleteItem.closest("button")?.className).toContain(
        "menu-item-danger",
      );

      fireEvent.click(deleteItem);

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(queryByRole("menu")).toBeNull();
    });

    it("invokes onShowHelp and closes the menu", () => {
      const onShowHelp = vi.fn();
      const { getByLabelText, getByText, queryByRole } = render(
        <DocumentHeader {...BASE_PROPS} onShowHelp={onShowHelp} />,
      );
      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Markdown Help"));

      expect(onShowHelp).toHaveBeenCalledTimes(1);
      expect(queryByRole("menu")).toBeNull();
    });
  });
});
