/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

const { readTextFile, writeWorkspaceTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("not found");
  }),
  writeWorkspaceTextFile: vi.fn<
    (root: string, relativePath: string, contents: string) => Promise<void>
  >(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeWorkspaceTextFile,
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

// collectionStore.ts imports workspacePath from settings/store.ts, which
// reads window.matchMedia/document at module load time; same jsdom +
// dynamic-import setup as bookmarks/store.test.ts and
// bookmarks/BookmarksPanel.test.tsx.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { CollectionsPanel } = await import("./CollectionsPanel");
const { collectionsFile, collectionsFileCorrupt } = await import("./collectionStore");
const { emptyCollectionsFile, emptyQueryGroup } = await import("./collectionTypes");
const { linkIndex } = await import("../linking/store");
const { workspacePath } = await import("../settings/store");

function emptyLinkIndexValue() {
  return {
    backlinksByPath: new Map<string, string[]>(),
    pathsByNoteName: new Map<string, string[]>(),
    pathsByAlias: new Map<string, string[]>(),
    aliasesByPath: new Map<string, string[]>(),
    pathsByTag: new Map<string, string[]>(),
    tagsByPath: new Map<string, string[]>(),
    tasksByPath: new Map(),
    mtimeByPath: new Map<string, number>(),
    hasFrontmatterByPath: new Set<string>(),
    frontmatterPropertiesByPath: new Map(),
  };
}

function setNotes(paths: string[]) {
  const index = emptyLinkIndexValue();
  for (const path of paths) index.backlinksByPath.set(path, []);
  linkIndex.value = index;
}

/** A collection whose query is an empty AND group, matching every indexed
 * note (spec section 6.1) — the simplest way to exercise the panel/results
 * wiring without also exercising the query builder's own clause logic,
 * already covered by collectionQuery.test.ts. */
function matchAllCollection(id: string, name: string) {
  return {
    id,
    name,
    description: "",
    query: emptyQueryGroup(),
    view: { mode: "list" as const },
    sort: [],
    createdAt: "",
    updatedAt: "",
  };
}

afterEach(() => {
  cleanup();
  collectionsFile.value = emptyCollectionsFile();
  collectionsFileCorrupt.value = false;
  linkIndex.value = emptyLinkIndexValue();
  workspacePath.value = null;
  writeWorkspaceTextFile.mockClear();
});

describe("CollectionsPanel", () => {
  it("shows a placeholder when there are no saved collections", () => {
    const { getByText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Create a collection to build a reusable note view.")).toBeTruthy();
  });

  it("lists a saved collection with its live match count", () => {
    setNotes(["Alpha.md", "Beta.md"]);
    collectionsFile.value = {
      version: 1,
      collections: [matchAllCollection("c1", "Everything")],
      order: ["c1"],
    };
    const { getByText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Everything")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("expanding a collection lists its matching notes", () => {
    setNotes(["Projects/Alpha.md"]);
    collectionsFile.value = {
      version: 1,
      collections: [matchAllCollection("c1", "Everything")],
      order: ["c1"],
    };
    const { getByText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("Everything"));
    expect(getByText("Alpha")).toBeTruthy();
  });

  it("shows a no-results hint for a collection with no matching notes", () => {
    setNotes([]);
    collectionsFile.value = {
      version: 1,
      collections: [matchAllCollection("c1", "Empty one")],
      order: ["c1"],
    };
    const { getByText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("Empty one"));
    expect(getByText("No notes match this collection.")).toBeTruthy();
  });

  it("clicking a result opens the note by path and display name", () => {
    setNotes(["Projects/My Note.md"]);
    collectionsFile.value = {
      version: 1,
      collections: [matchAllCollection("c1", "Everything")],
      order: ["c1"],
    };
    const onOpenFile = vi.fn();
    const { getByText } = render(<CollectionsPanel onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("Everything"));
    fireEvent.click(getByText("My Note"));
    expect(onOpenFile).toHaveBeenCalledWith("Projects/My Note.md", "My Note.md");
  });

  it("updates results live when the underlying index changes, with no re-fetch or remount", async () => {
    setNotes(["Alpha.md"]);
    collectionsFile.value = {
      version: 1,
      collections: [matchAllCollection("c1", "Everything")],
      order: ["c1"],
    };
    const { getByText, queryByText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("Everything"));
    expect(getByText("Alpha")).toBeTruthy();

    setNotes(["Alpha.md", "Beta.md"]);
    await waitFor(() => expect(getByText("Beta")).toBeTruthy());

    setNotes(["Beta.md"]);
    await waitFor(() => expect(queryByText("Alpha")).toBeNull());
    expect(getByText("Beta")).toBeTruthy();
  });

  it("shows a warning when the persisted collections file was corrupt", () => {
    collectionsFileCorrupt.value = true;
    const { getByRole } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    expect(getByRole("alert")).toBeTruthy();
  });

  it("creating a collection through the builder saves it and shows it in the list", async () => {
    workspacePath.value = "/workspace";
    setNotes(["Alpha.md"]);
    const { getByText, getByLabelText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("+ New collection"));
    fireEvent.input(getByLabelText("Name") as HTMLInputElement, {
      target: { value: "My collection" },
    });
    fireEvent.click(getByText("Save"));

    await waitFor(() => expect(getByText("My collection")).toBeTruthy());
    expect(writeWorkspaceTextFile).toHaveBeenCalled();
    const written = JSON.parse(writeWorkspaceTextFile.mock.calls.at(-1)![2]);
    expect(written.collections).toHaveLength(1);
    expect(written.collections[0].name).toBe("My collection");
  });

  it("deleting a collection removes it from the list and persists the removal", async () => {
    workspacePath.value = "/workspace";
    collectionsFile.value = {
      version: 1,
      collections: [matchAllCollection("c1", "Everything")],
      order: ["c1"],
    };
    const { getByLabelText, queryByText } = render(<CollectionsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByLabelText("Delete Everything"));
    await waitFor(() => expect(queryByText("Everything")).toBeNull());
    const written = JSON.parse(writeWorkspaceTextFile.mock.calls.at(-1)![2]);
    expect(written.collections).toEqual([]);
  });
});
