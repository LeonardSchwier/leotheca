/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { TagsPanel } from "./TagsPanel";
import { linkIndex } from "../linking/store";

function setPathsByTag(pathsByTag: Map<string, string[]>) {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag,
    tagsByPath: new Map(),
  };
}

afterEach(() => {
  cleanup();
  setPathsByTag(new Map());
});

describe("TagsPanel", () => {
  it("shows a placeholder when there are no tags", () => {
    const { getByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    expect(getByText("No tags yet.")).toBeTruthy();
  });

  it("lists a top-level tag with its note count", () => {
    setPathsByTag(new Map([["work", ["/vault/a.md", "/vault/b.md"]]]));
    const { getByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    expect(getByText("work")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("does not show a tag's notes until its row is clicked", () => {
    setPathsByTag(new Map([["work", ["/vault/a.md"]]]));
    const { queryByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    expect(queryByText("a.md")).toBeNull();
  });

  it("clicking a tag's row reveals its notes", () => {
    setPathsByTag(new Map([["work", ["/vault/a.md"]]]));
    const { getByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("work"));
    expect(getByText("a.md")).toBeTruthy();
  });

  it("clicking a tag's row again hides its notes", () => {
    setPathsByTag(new Map([["work", ["/vault/a.md"]]]));
    const { getByText, queryByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("work"));
    fireEvent.click(getByText("work"));
    expect(queryByText("a.md")).toBeNull();
  });

  it("clicking a note opens it with its full path and filename", () => {
    setPathsByTag(new Map([["work", ["/vault/sub/a.md"]]]));
    const onOpenFile = vi.fn();
    const { getByText } = render(<TagsPanel onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("work"));
    fireEvent.click(getByText("a.md"));
    expect(onOpenFile).toHaveBeenCalledWith("/vault/sub/a.md", "a.md");
  });

  it("nests a '/'-separated tag under a collapsed parent by default", () => {
    setPathsByTag(new Map([["work/project", ["/vault/a.md"]]]));
    const { getByText, queryByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    expect(getByText("work")).toBeTruthy();
    expect(queryByText("project")).toBeNull();
  });

  it("expanding a parent tag reveals its child tag", () => {
    setPathsByTag(new Map([["work/project", ["/vault/a.md"]]]));
    const { getByLabelText, getByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByLabelText("Expand work"));
    expect(getByText("project")).toBeTruthy();
  });

  it("a pure grouping node (no notes of its own) shows the aggregate count from its children", () => {
    setPathsByTag(new Map([["work/project", ["/vault/a.md", "/vault/b.md"]]]));
    const { getByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    // "work" itself was never used as a tag directly, only "work/project",
    // so its own count is the aggregate of its one child.
    expect(getByText("work").closest("li")!.textContent).toContain("2");
  });

  it("clicking a pure grouping node's label expands it instead of doing nothing", () => {
    setPathsByTag(new Map([["work/project", ["/vault/a.md"]]]));
    const { getByText, queryByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    expect(queryByText("project")).toBeNull();
    fireEvent.click(getByText("work"));
    expect(getByText("project")).toBeTruthy();
  });

  it("a note tagged with both a parent and its child tag is not shown twice under the parent", () => {
    setPathsByTag(
      new Map([
        ["work", ["/vault/a.md"]],
        ["work/project", ["/vault/a.md"]],
      ]),
    );
    const { getAllByText } = render(<TagsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getAllByText("work")[0]);
    expect(getAllByText("a.md")).toHaveLength(1);
  });
});
