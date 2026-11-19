/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

const { readTextFile, writeTextFile, writeWorkspaceTextFile } = vi.hoisted(
  () => ({
    readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
      throw new Error("No such file or directory (os error 2)");
    }),
    writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(
      async () => {},
    ),
    writeWorkspaceTextFile: vi.fn<
      (root: string, relativePath: string, contents: string) => Promise<void>
    >(async () => {}),
  }),
);

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeTextFile,
  writeWorkspaceTextFile,
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
  updateFavoritesWidget: vi.fn(async () => {}),
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
const { bookmarks, bookmarksCorrupted, loadBookmarks } =
  await import("./store");
const { workspacePath } = await import("../settings/store");

afterEach(() => {
  cleanup();
  bookmarks.value = [];
  bookmarksCorrupted.value = false;
  workspacePath.value = null;
  writeTextFile.mockClear();
  writeWorkspaceTextFile.mockClear();
});

describe("BookmarksPanel", () => {
  it("shows a placeholder when there are no bookmarks", () => {
    const { getByText, getByRole } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(getByText("No bookmarks yet.")).toBeTruthy();
    expect(getByRole("region", { name: "No bookmarks yet." })).toBeTruthy();
    expect(
      getByText("Bookmark a note or saved search to find it here."),
    ).toBeTruthy();
  });

  it("lists file and search bookmarks with their kind badge", () => {
    bookmarks.value = [
      {
        id: "1",
        kind: "file",
        label: "My Note",
        path: "/vault/notes/my-note.md",
      },
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
      {
        id: "1",
        kind: "file",
        label: "My Note",
        path: "/vault/notes/my-note.md",
      },
    ];
    const onOpenFile = vi.fn();
    const onRunSearch = vi.fn();
    const { getByText } = render(
      <BookmarksPanel onOpenFile={onOpenFile} onRunSearch={onRunSearch} />,
    );
    fireEvent.click(getByText("My Note"));
    expect(onOpenFile).toHaveBeenCalledWith(
      "/vault/notes/my-note.md",
      "my-note.md",
    );
    expect(onRunSearch).not.toHaveBeenCalled();
  });

  it("opening a search bookmark calls onRunSearch with its query, not onOpenFile", () => {
    bookmarks.value = [
      { id: "2", kind: "search", label: "TODOs", query: "TODO" },
    ];
    const onOpenFile = vi.fn();
    const onRunSearch = vi.fn();
    const { getByText } = render(
      <BookmarksPanel onOpenFile={onOpenFile} onRunSearch={onRunSearch} />,
    );
    fireEvent.click(getByText("TODOs"));
    expect(onRunSearch).toHaveBeenCalledWith("TODO");
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("shows an inline error instead of failing silently when a bookmark's target can't be opened", async () => {
    bookmarks.value = [
      {
        id: "1",
        kind: "file",
        label: "Deleted Note",
        path: "/vault/deleted-note.md",
      },
    ];
    const onOpenFile = vi.fn(async () => {
      throw new Error("not found");
    });
    const { getByText, findByRole } = render(
      <BookmarksPanel onOpenFile={onOpenFile} onRunSearch={vi.fn()} />,
    );
    fireEvent.click(getByText("Deleted Note"));
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("Deleted Note");
  });

  it("clears a bookmark's error once it opens successfully", async () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "My Note", path: "/vault/my-note.md" },
    ];
    let shouldFail = true;
    const onOpenFile = vi.fn(async () => {
      if (shouldFail) throw new Error("not found");
    });
    const { getByText, findByRole, queryByRole } = render(
      <BookmarksPanel onOpenFile={onOpenFile} onRunSearch={vi.fn()} />,
    );
    fireEvent.click(getByText("My Note"));
    await findByRole("alert");
    shouldFail = false;
    fireEvent.click(getByText("My Note"));
    await vi.waitFor(() => expect(queryByRole("alert")).toBeNull());
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

  it("renders an 'Open in sidebar' button for file bookmarks when onRevealInSidebar is provided", async () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "Deep Note", path: "/vault/a/b/deep.md" },
      { id: "2", kind: "search", label: "TODOs", query: "TODO" },
    ];
    const onRevealInSidebar = vi.fn();
    const { getByLabelText, queryByLabelText } = render(
      <BookmarksPanel
        onOpenFile={vi.fn()}
        onRunSearch={vi.fn()}
        onRevealInSidebar={onRevealInSidebar}
      />,
    );

    expect(getByLabelText('Show "Deep Note" in the sidebar tree')).toBeTruthy();
    // Search bookmarks get no reveal button — it has no folder to show.
    expect(queryByLabelText('Show "TODOs" in the sidebar tree')).toBeNull();
  });

  it("does not render an 'Open in sidebar' button when onRevealInSidebar is omitted", async () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "Deep Note", path: "/vault/a/b/deep.md" },
    ];
    const { queryByLabelText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(queryByLabelText('Show "Deep Note" in the sidebar tree')).toBeNull();
  });

  it("calls onRevealInSidebar with the file's absolute path when its button is clicked", async () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "Deep Note", path: "/vault/a/b/deep.md" },
    ];
    const onRevealInSidebar = vi.fn();
    const { getByLabelText } = render(
      <BookmarksPanel
        onOpenFile={vi.fn()}
        onRunSearch={vi.fn()}
        onRevealInSidebar={onRevealInSidebar}
      />,
    );
    await fireEvent.click(
      getByLabelText('Show "Deep Note" in the sidebar tree'),
    );
    expect(onRevealInSidebar).toHaveBeenCalledTimes(1);
    expect(onRevealInSidebar).toHaveBeenCalledWith("/vault/a/b/deep.md");
  });
});

// A bookmarks.json that exists but could not be read is left on disk. The
// panel must say so, because an empty list here would otherwise read as "no
// bookmarks yet", and whatever is added now is not saved.
describe("BookmarksPanel: a bookmarks file that could not be read", () => {
  async function loadUnreadable() {
    workspacePath.value = "/vault";
    readTextFile.mockRejectedValueOnce(
      new Error("Permission denied (os error 13)"),
    );
    await loadBookmarks("/vault");
    expect(bookmarksCorrupted.value).toBe(true);
  }

  it("says nothing while the file is fine", () => {
    const { queryByRole, queryByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(queryByRole("alert")).toBeNull();
    expect(queryByText("Rewrite bookmarks file")).toBeNull();
  });

  it("explains it, and offers the rewrite, instead of only the empty-list placeholder", async () => {
    await loadUnreadable();
    const { getByRole, getByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(getByRole("alert").textContent).toMatch(/could not be read/);
    expect(getByRole("alert").textContent).toMatch(/not saved/);
    expect(getByText("Rewrite bookmarks file")).toBeTruthy();
    // The placeholder is still there: the list is empty.
    expect(getByText("No bookmarks yet.")).toBeTruthy();
  });

  it("shows the same notice above a list the user has started in this session", async () => {
    await loadUnreadable();
    bookmarks.value = [
      { id: "1", kind: "search", label: "TODOs", query: "TODO" },
    ];
    const { getByRole, getByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(getByRole("alert").textContent).toMatch(/could not be read/);
    expect(getByText("TODOs")).toBeTruthy();
    expect(getByRole("list", { name: "Bookmarks" })).toBeTruthy();
  });

  it("rewrites the file with the list on screen and then removes the notice", async () => {
    await loadUnreadable();
    bookmarks.value = [
      { id: "1", kind: "search", label: "TODOs", query: "TODO" },
    ];
    const { getByText, queryByRole } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    expect(writeWorkspaceTextFile).not.toHaveBeenCalled();

    fireEvent.click(getByText("Rewrite bookmarks file"));
    await vi.waitFor(() => expect(queryByRole("alert")).toBeNull());

    expect(writeWorkspaceTextFile).toHaveBeenCalledTimes(1);
    const [root, relativePath, contents] = writeWorkspaceTextFile.mock.calls[0];
    expect(root).toBe("/vault");
    expect(relativePath).toBe(".leotheca/bookmarks.json");
    expect(JSON.parse(contents)).toEqual(bookmarks.value);
  });

  it("keeps the notice and says so when the rewrite fails", async () => {
    await loadUnreadable();
    writeWorkspaceTextFile.mockRejectedValueOnce(new Error("disk full"));
    const { getByText, findByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );

    fireEvent.click(getByText("Rewrite bookmarks file"));
    expect(await findByText(/could not be rewritten/)).toBeTruthy();
    expect(getByText(/could not be read/)).toBeTruthy();
    expect(getByText("Rewrite bookmarks file")).toBeTruthy();
    expect(bookmarksCorrupted.value).toBe(true);
  });

  it("clears an earlier failure when the rewrite is tried again and works", async () => {
    await loadUnreadable();
    writeWorkspaceTextFile.mockRejectedValueOnce(new Error("disk full"));
    const { getByText, findByText, queryByRole } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    fireEvent.click(getByText("Rewrite bookmarks file"));
    await findByText(/could not be rewritten/);

    fireEvent.click(getByText("Rewrite bookmarks file"));
    await vi.waitFor(() => expect(queryByRole("alert")).toBeNull());
    expect(bookmarksCorrupted.value).toBe(false);
  });
  it("hides the failure while the next attempt runs, and shows it again if that fails too", async () => {
    await loadUnreadable();
    writeWorkspaceTextFile.mockRejectedValueOnce(new Error("disk full"));
    const { getByText, findByText, queryByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    fireEvent.click(getByText("Rewrite bookmarks file"));
    await findByText(/could not be rewritten/);

    let failSecond!: (reason: unknown) => void;
    writeWorkspaceTextFile.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => (failSecond = reject)),
    );
    fireEvent.click(getByText("Rewrite bookmarks file"));
    await vi.waitFor(() =>
      expect(queryByText(/could not be rewritten/)).toBeNull(),
    );

    failSecond(new Error("disk full"));
    expect(await findByText(/could not be rewritten/)).toBeTruthy();
  });

  it("does not show an old failure for the next workspace's unreadable file", async () => {
    await loadUnreadable();
    writeWorkspaceTextFile.mockRejectedValueOnce(new Error("disk full"));
    const { getByText, findByText, queryByText } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    fireEvent.click(getByText("Rewrite bookmarks file"));
    await findByText(/could not be rewritten/);

    // Another workspace is opened: the flag goes away, then comes back for a
    // file there that cannot be read either.
    await loadBookmarks("/vault-b");
    await vi.waitFor(() => expect(queryByText(/could not be read/)).toBeNull());
    readTextFile.mockRejectedValueOnce(
      new Error("Permission denied (os error 13)"),
    );
    await loadBookmarks("/vault-b");
    expect(await findByText(/could not be read/)).toBeTruthy();
    expect(queryByText(/could not be rewritten/)).toBeNull();
  });
  it("is busy while the rewrite runs, so a second click does not start another write", async () => {
    await loadUnreadable();
    let finishWrite!: () => void;
    writeWorkspaceTextFile.mockReturnValueOnce(
      new Promise<void>((resolve) => (finishWrite = resolve)),
    );
    const { getByText, queryByRole } = render(
      <BookmarksPanel onOpenFile={vi.fn()} onRunSearch={vi.fn()} />,
    );
    const button = getByText("Rewrite bookmarks file") as HTMLButtonElement;
    fireEvent.click(button);
    await vi.waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);

    finishWrite();
    await vi.waitFor(() => expect(queryByRole("alert")).toBeNull());
    expect(writeWorkspaceTextFile).toHaveBeenCalledTimes(1);
  });
});
