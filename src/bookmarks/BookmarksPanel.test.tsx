/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

const { readTextFile, writeTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("not found");
  }),
  writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeTextFile,
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

// bookmarks/store.ts imports workspacePath from settings/store.ts, which
// reads window.matchMedia/document at module load time; same jsdom +
// dynamic-import setup as bookmarks/store.test.ts, see its own comment.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { BookmarksPanel } = await import("./BookmarksPanel");
const { bookmarks } = await import("./store");

afterEach(() => {
  cleanup();
  bookmarks.value = [];
  writeTextFile.mockClear();
});

describe("BookmarksPanel", () => {
  it("shows a placeholder when there are no bookmarks", () => {
    const { getByText } = render(<BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />);
    expect(getByText("No bookmarks yet.")).toBeTruthy();
  });

  it("lists file and search bookmarks with their kind badge", () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "My Note", path: "/vault/notes/my-note.md" },
      { id: "2", kind: "search", label: "TODOs", query: "TODO" },
    ];
    const { getByText, getAllByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(getByText("My Note")).toBeTruthy();
    expect(getByText("TODOs")).toBeTruthy();
    expect(getAllByText("File")).toHaveLength(1);
    expect(getAllByText("Search")).toHaveLength(1);
  });

  it("opening a file bookmark calls onOpenFile with the path and its basename", () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "My Note", path: "/vault/notes/my-note.md" },
    ];
    const onOpenFile = vi.fn();
    const onRunSearch = vi.fn();
    const { getByText } = render(<BookmarksPanel onOpenFile={onOpenFile} onRunSearch={onRunSearch} />);
    fireEvent.click(getByText("My Note"));
    expect(onOpenFile).toHaveBeenCalledWith("/vault/notes/my-note.md", "my-note.md");
    expect(onRunSearch).not.toHaveBeenCalled();
  });

  it("opening a search bookmark calls onRunSearch with its query, not onOpenFile", () => {
    bookmarks.value = [{ id: "2", kind: "search", label: "TODOs", query: "TODO" }];
    const onOpenFile = vi.fn();
    const onRunSearch = vi.fn();
    const { getByText } = render(<BookmarksPanel onOpenFile={onOpenFile} onRunSearch={onRunSearch} />);
    fireEvent.click(getByText("TODOs"));
    expect(onRunSearch).toHaveBeenCalledWith("TODO");
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("removing a bookmark drops it from the list", async () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "My Note", path: "/vault/my-note.md" },
      { id: "2", kind: "search", label: "TODOs", query: "TODO" },
    ];
    const { getByLabelText, queryByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    await fireEvent.click(getByLabelText("Remove My Note"));
    expect(queryByText("My Note")).toBeNull();
    expect(queryByText("TODOs")).toBeTruthy();
    expect(bookmarks.value.map((b) => b.id)).toEqual(["2"]);
  });
});
