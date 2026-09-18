/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { ActivityRail } from "./ActivityRail";

afterEach(cleanup);

const BASE_PROPS = {
  activeDestination: null as "files" | "bookmarks" | "tags" | null,
  graphActive: false,
  tagsEnabled: true,
  onSelectFiles: vi.fn(),
  onSelectBookmarks: vi.fn(),
  onSelectTags: vi.fn(),
  onOpenGraph: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe("ActivityRail", () => {
  it("renders Files, Bookmarks, Tags, Graph, and Settings when tags are enabled", () => {
    const { getByLabelText } = render(<ActivityRail {...BASE_PROPS} />);
    expect(getByLabelText("Files")).toBeTruthy();
    expect(getByLabelText("Bookmarks")).toBeTruthy();
    expect(getByLabelText("Tags")).toBeTruthy();
    expect(getByLabelText("Graph view")).toBeTruthy();
    expect(getByLabelText("Settings")).toBeTruthy();
  });

  it("omits Tags when the workspace has tags disabled", () => {
    const { queryByLabelText } = render(
      <ActivityRail {...BASE_PROPS} tagsEnabled={false} />,
    );
    expect(queryByLabelText("Tags")).toBeNull();
  });

  it("marks exactly the active destination with aria-current and the active class", () => {
    const { getByLabelText } = render(
      <ActivityRail {...BASE_PROPS} activeDestination="bookmarks" />,
    );
    const bookmarks = getByLabelText("Bookmarks");
    const files = getByLabelText("Files");
    const tags = getByLabelText("Tags");
    expect(bookmarks.getAttribute("aria-current")).toBe("true");
    expect(bookmarks.className).toContain("active");
    expect(files.getAttribute("aria-current")).toBeNull();
    expect(files.className).not.toContain("active");
    expect(tags.getAttribute("aria-current")).toBeNull();
  });

  it("marks Graph active independently of activeDestination (it isn't one of the three panel destinations)", () => {
    const { getByLabelText } = render(
      <ActivityRail
        {...BASE_PROPS}
        activeDestination={null}
        graphActive={true}
      />,
    );
    const graph = getByLabelText("Graph view");
    expect(graph.getAttribute("aria-current")).toBe("true");
    expect(graph.className).toContain("active");
  });

  it("shows no destination selected while Task Hub or Collections occupy the panel (activeDestination null)", () => {
    const { getByLabelText } = render(
      <ActivityRail {...BASE_PROPS} activeDestination={null} />,
    );
    expect(getByLabelText("Files").className).not.toContain("active");
    expect(getByLabelText("Bookmarks").className).not.toContain("active");
    expect(getByLabelText("Tags").className).not.toContain("active");
  });

  it("invokes the matching callback for each button and nothing else", () => {
    const onSelectFiles = vi.fn();
    const onSelectBookmarks = vi.fn();
    const onSelectTags = vi.fn();
    const onOpenGraph = vi.fn();
    const onOpenSettings = vi.fn();
    const { getByLabelText } = render(
      <ActivityRail
        {...BASE_PROPS}
        onSelectFiles={onSelectFiles}
        onSelectBookmarks={onSelectBookmarks}
        onSelectTags={onSelectTags}
        onOpenGraph={onOpenGraph}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(getByLabelText("Tags"));
    expect(onSelectTags).toHaveBeenCalledTimes(1);
    expect(onSelectFiles).not.toHaveBeenCalled();
    expect(onSelectBookmarks).not.toHaveBeenCalled();
    expect(onOpenGraph).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();

    fireEvent.click(getByLabelText("Settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("gives the rail a labeled navigation landmark", () => {
    const { getByRole } = render(<ActivityRail {...BASE_PROPS} />);
    expect(
      getByRole("navigation", { name: "Primary navigation" }),
    ).toBeTruthy();
  });
});
