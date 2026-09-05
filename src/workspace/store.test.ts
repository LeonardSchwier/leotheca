import { afterEach, describe, expect, it } from "vitest";
import {
  activeTab,
  activeTabPath,
  closeAllTabs,
  closeAllUnpinnedTabs,
  closeOtherTabs,
  closeTab,
  closeTabsUnder,
  editorLayout,
  focusTab,
  markTabSaved,
  openDocuments,
  openOrFocusTab,
  openTabs,
  pinTab,
  renameOpenTab,
  unpinAndCloseTab,
  updateTabContent,
} from "./store";

afterEach(() => {
  closeAllTabs();
});

describe("openOrFocusTab", () => {
  it("opens a new tab and makes it active", () => {
    openOrFocusTab("/a.md", "a.md", "content", "text");
    expect(openTabs.value).toEqual([
      { path: "/a.md", name: "a.md", content: "content", kind: "text", dirty: false, saveError: null },
    ]);
    expect(activeTabPath.value).toBe("/a.md");
  });

  it("focuses an already-open tab instead of duplicating it", () => {
    openOrFocusTab("/a.md", "a.md", "content", "text");
    openOrFocusTab("/b.md", "b.md", "other", "text");
    openOrFocusTab("/a.md", "a.md", "ignored, tab already exists", "text");

    expect(openTabs.value).toHaveLength(2);
    expect(openTabs.value[0].content).toBe("content"); // untouched by the re-open
    expect(activeTabPath.value).toBe("/a.md");
  });

  it("keeps one canonical document record and primary-group path for a reopened note", () => {
    openOrFocusTab("/a.md", "a.md", "content", "text");
    openOrFocusTab("/a.md", "a.md", "replacement must not win", "text");

    expect(openDocuments.value).toEqual(openTabs.value);
    expect(editorLayout.value.groups.primary.tabPaths).toEqual(["/a.md"]);
    expect(editorLayout.value.groups.primary.activePath).toBe("/a.md");
    expect(editorLayout.value.activeGroupId).toBe("primary");
  });
});

describe("activeTab", () => {
  it("returns the tab matching activeTabPath", () => {
    openOrFocusTab("/a.md", "a.md", "content", "text");
    expect(activeTab()?.path).toBe("/a.md");
  });

  it("returns undefined when nothing is active", () => {
    expect(activeTab()).toBeUndefined();
  });
});

describe("updateTabContent / markTabSaved", () => {
  it("updates content and marks the tab dirty, leaving other tabs untouched", () => {
    openOrFocusTab("/a.md", "a.md", "old", "text");
    openOrFocusTab("/b.md", "b.md", "b content", "text");

    updateTabContent("/a.md", "new");

    const a = openTabs.value.find((t) => t.path === "/a.md");
    const b = openTabs.value.find((t) => t.path === "/b.md");
    expect(a).toMatchObject({ content: "new", dirty: true });
    expect(b).toMatchObject({ content: "b content", dirty: false });
  });

  it("marks a tab saved (dirty: false) without touching its content", () => {
    openOrFocusTab("/a.md", "a.md", "old", "text");
    updateTabContent("/a.md", "new");

    markTabSaved("/a.md");

    expect(openTabs.value[0]).toMatchObject({ content: "new", dirty: false });
  });
});

describe("closeTab", () => {
  it("removes the tab and falls back activeTabPath to the last remaining tab when the active one closes", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");
    focusTab("/c.md");

    closeTab("/c.md");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
    expect(activeTabPath.value).toBe("/b.md");
  });

  it("falls back to null when the last remaining tab is closed", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    closeTab("/a.md");
    expect(openTabs.value).toEqual([]);
    expect(activeTabPath.value).toBeNull();
  });

  it("leaves activeTabPath untouched when closing a tab that isn't the active one", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    focusTab("/b.md");

    closeTab("/a.md");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(activeTabPath.value).toBe("/b.md");
  });

  it("repairs the primary group to the remaining canonical document", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");

    closeTab("/b.md");

    expect(editorLayout.value.groups.primary.tabPaths).toEqual(["/a.md"]);
    expect(editorLayout.value.groups.primary.activePath).toBe("/a.md");
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the given tab and makes it active", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");

    closeOtherTabs("/b.md");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(activeTabPath.value).toBe("/b.md");
  });

  it("keeps pinned tabs alongside the requested tab", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");
    pinTab("/a.md");

    closeOtherTabs("/b.md");

    expect(openTabs.value.map((tab) => tab.path)).toEqual(["/a.md", "/b.md"]);
  });
});

describe("closeAllTabs", () => {
  it("empties both openTabs and activeTabPath", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");

    closeAllTabs();

    expect(openTabs.value).toEqual([]);
    expect(activeTabPath.value).toBeNull();
  });

  it("retains pinned tabs for the user-facing broad close operation", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    pinTab("/a.md");

    closeAllUnpinnedTabs();

    expect(openTabs.value.map((tab) => tab.path)).toEqual(["/a.md"]);
    expect(activeTabPath.value).toBe("/a.md");
  });
});

describe("pinned tabs", () => {
  it("cannot close until explicitly unpinned and closed", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    pinTab("/a.md");

    closeTab("/a.md");
    expect(openTabs.value.map((tab) => tab.path)).toEqual(["/a.md"]);

    unpinAndCloseTab("/a.md");
    expect(openTabs.value).toEqual([]);
  });

  it("preserves a pin when an open path is renamed", () => {
    openOrFocusTab("/old.md", "old.md", "", "text");
    pinTab("/old.md");

    renameOpenTab("/old.md", "/new.md", "new.md");

    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual(["/new.md"]);
  });
});

describe("closeTabsUnder", () => {
  it("closes the exact path and anything nested under it, leaving unrelated tabs open", () => {
    openOrFocusTab("/folder/a.md", "a.md", "", "text");
    openOrFocusTab("/folder/sub/b.md", "b.md", "", "text");
    openOrFocusTab("/other.md", "other.md", "", "text");
    focusTab("/folder/sub/b.md");

    closeTabsUnder("/folder");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/other.md"]);
    expect(activeTabPath.value).toBe("/other.md");
  });

  it("does not match a differently-named sibling that merely shares a prefix", () => {
    openOrFocusTab("/folder-extra/a.md", "a.md", "", "text");
    closeTabsUnder("/folder");
    // "/folder-extra/a.md" is not "/folder" and does not start with
    // "/folder/", so it must survive a closeTabsUnder("/folder") call.
    expect(openTabs.value.map((t) => t.path)).toEqual(["/folder-extra/a.md"]);
  });

  it("leaves activeTabPath alone when the active tab isn't affected", () => {
    openOrFocusTab("/folder/a.md", "a.md", "", "text");
    openOrFocusTab("/keep.md", "keep.md", "", "text");
    focusTab("/keep.md");

    closeTabsUnder("/folder");

    expect(activeTabPath.value).toBe("/keep.md");
  });

  it("is a no-op (no signal write) when nothing matches", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    const before = openTabs.value;

    closeTabsUnder("/unrelated");

    // Same array reference: the early-return path never reassigned it.
    expect(openTabs.value).toBe(before);
  });
});

describe("renameOpenTab", () => {
  it("rewrites the exact matching tab's path and name", () => {
    openOrFocusTab("/old.md", "old.md", "content", "text");
    focusTab("/old.md");

    renameOpenTab("/old.md", "/new.md", "new.md");

    expect(openTabs.value).toEqual([
      { path: "/new.md", name: "new.md", content: "content", kind: "text", dirty: false, saveError: null },
    ]);
    expect(activeTabPath.value).toBe("/new.md");
  });

  it("rewrites nested tabs' paths when a folder is renamed, without changing their name", () => {
    openOrFocusTab("/folder/note.md", "note.md", "", "text");

    renameOpenTab("/folder", "/renamed", "renamed");

    expect(openTabs.value[0].path).toBe("/renamed/note.md");
    expect(openTabs.value[0].name).toBe("note.md"); // not "renamed"
  });

  it("leaves unrelated tabs and an unrelated activeTabPath untouched", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    focusTab("/b.md");

    renameOpenTab("/a.md", "/renamed.md", "renamed.md");

    expect(openTabs.value.find((t) => t.path === "/b.md")).toBeTruthy();
    expect(activeTabPath.value).toBe("/b.md");
  });
});
