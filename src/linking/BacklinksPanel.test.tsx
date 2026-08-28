/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { BacklinksPanel } from "./BacklinksPanel";
import { linkIndex } from "./store";

afterEach(() => {
  cleanup();
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
  };
});

describe("BacklinksPanel", () => {
  it("shows a placeholder when nothing links to this note", () => {
    const { getByText } = render(<BacklinksPanel path="/vault/note.md" onOpenFile={vi.fn()} />);
    expect(getByText("No notes link here.")).toBeTruthy();
  });

  it("lists each backlink by its filename", () => {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/note.md", ["/vault/a.md", "/vault/sub/b.md"]],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    const { getByText } = render(<BacklinksPanel path="/vault/note.md" onOpenFile={vi.fn()} />);
    expect(getByText("a.md")).toBeTruthy();
    expect(getByText("b.md")).toBeTruthy();
  });

  it("only shows backlinks for the given path, not other notes' backlinks", () => {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/note.md", ["/vault/a.md"]],
        ["/vault/other.md", ["/vault/z.md"]],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    const { getByText, queryByText } = render(
      <BacklinksPanel path="/vault/note.md" onOpenFile={vi.fn()} />,
    );
    expect(getByText("a.md")).toBeTruthy();
    expect(queryByText("z.md")).toBeNull();
  });

  it("clicking a backlink opens it with its full path and filename", () => {
    linkIndex.value = {
      backlinksByPath: new Map([["/vault/note.md", ["/vault/sub/a.md"]]]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    const onOpenFile = vi.fn();
    const { getByText } = render(<BacklinksPanel path="/vault/note.md" onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("a.md"));
    expect(onOpenFile).toHaveBeenCalledWith("/vault/sub/a.md", "a.md");
  });
});
