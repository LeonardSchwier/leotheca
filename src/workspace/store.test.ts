import { afterEach, describe, expect, it } from "vitest";
import {
  activeGroupTab,
  activeTab,
  activeTabPath,
  closeAllTabs,
  closeAllUnpinnedTabs,
  closeOtherTabs,
  closeSecondaryGroup,
  closeTab,
  closeTabsUnder,
  editorLayout,
  focusGroup,
  focusOtherGroup,
  focusTab,
  markTabSaved,
  markTabSaveError,
  markTabSaving,
  moveActiveTabToOtherGroup,
  moveTabWithinGroup,
  openDocuments,
  openInOtherGroup,
  openOrFocusTab,
  openTabs,
  pinTab,
  renameOpenTab,
  reorderTabWithinGroup,
  resetSplitRatio,
  secondaryActiveTabPath,
  secondaryOpenTabs,
  setCompactVisibleGroup,
  setGroupViewMode,
  setSplitRatio,
  splitRight,
  unpinAndCloseTab,
  unpinTab,
  updateTabContent,
} from "./store";

afterEach(() => {
  closeAllTabs();
});

describe("openOrFocusTab", () => {
  it("opens a new tab and makes it active", () => {
    openOrFocusTab("/a.md", "a.md", "content", "text");
    expect(openTabs.value).toEqual([
      { path: "/a.md", name: "a.md", content: "content", kind: "text", dirty: false, saving: false, saveError: null },
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

  it("markTabSaved also clears saving, so the Document Header's Saving indicator ends with the write", () => {
    openOrFocusTab("/a.md", "a.md", "old", "text");
    markTabSaving("/a.md");
    expect(openTabs.value[0]).toMatchObject({ saving: true });

    markTabSaved("/a.md");

    expect(openTabs.value[0]).toMatchObject({ dirty: false, saving: false });
  });

  it("markTabSaveError also clears saving, and leaves the tab dirty for the user to retry", () => {
    openOrFocusTab("/a.md", "a.md", "old", "text");
    updateTabContent("/a.md", "new");
    markTabSaving("/a.md");

    markTabSaveError("/a.md", "disk full");

    expect(openTabs.value[0]).toMatchObject({ dirty: true, saving: false, saveError: "disk full" });
  });

  it("markTabSaving only touches the matching tab, leaving others untouched", () => {
    openOrFocusTab("/a.md", "a.md", "content a", "text");
    openOrFocusTab("/b.md", "b.md", "content b", "text");

    markTabSaving("/a.md");

    const a = openTabs.value.find((t) => t.path === "/a.md");
    const b = openTabs.value.find((t) => t.path === "/b.md");
    expect(a).toMatchObject({ saving: true });
    expect(b).toMatchObject({ saving: false });
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
      { path: "/new.md", name: "new.md", content: "content", kind: "text", dirty: false, saving: false, saveError: null },
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

// ============ F07 Phase 3: secondary group commands ============

describe("splitRight", () => {
  it("creates an empty secondary group without a target path, primary staying active", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");

    splitRight();

    expect(editorLayout.value.splitEnabled).toBe(true);
    expect(editorLayout.value.activeGroupId).toBe("primary"); // documentGroups.ts's createSplitLayout leaves primary active without a target
    expect(secondaryOpenTabs.value).toEqual([]);
    expect(openTabs.value).toHaveLength(1); // "/a.md" stays in primary
  });

  it("moves the given tab into a new secondary group and activates it there", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");

    splitRight("/b.md");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(secondaryActiveTabPath.value).toBe("/b.md");
    expect(editorLayout.value.activeGroupId).toBe("secondary");
  });

  it("is a no-op once a split already exists", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight("/a.md"); // secondary now exists, holds "/a.md", and is active
    openOrFocusTab("/b.md", "b.md", "", "text"); // lands in the now-active secondary

    splitRight("/c.md"); // must not re-run createSplitLayout and disturb placement ("/c.md" isn't even open)

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
    expect(openTabs.value).toEqual([]);
  });
});

describe("openOrFocusTab routes through the active group (spec 7.1)", () => {
  it("opens a genuinely new path into the active group, not always primary", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight("/a.md"); // moves "/a.md" into secondary and activates it; primary is now empty

    openOrFocusTab("/b.md", "b.md", "new in the active group", "text");

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
    expect(openTabs.value).toEqual([]);
  });

  it("focuses an already-open path's real owner group instead of duplicating it", () => {
    openOrFocusTab("/a.md", "a.md", "content", "text");
    splitRight(); // empty secondary created; primary (still owning "/a.md") stays active
    focusGroup("secondary");

    openOrFocusTab("/a.md", "a.md", "must not overwrite or duplicate", "text");

    expect(openTabs.value).toEqual([
      { path: "/a.md", name: "a.md", content: "content", kind: "text", dirty: false, saving: false, saveError: null },
    ]);
    expect(secondaryOpenTabs.value).toEqual([]);
    expect(editorLayout.value.activeGroupId).toBe("primary"); // focusing it moved activation back from secondary
    expect(activeTabPath.value).toBe("/a.md");
  });
});

describe("moveActiveTabToOtherGroup", () => {
  it("creates a split and moves the active primary tab when no split exists yet", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    focusTab("/a.md");

    moveActiveTabToOtherGroup();

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/a.md"]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
  });

  it("moves the active group's active tab back and forth between existing groups", () => {
    openOrFocusTab("/a.md", "a.md", "content stays put", "text");
    splitRight("/a.md"); // "/a.md" now in secondary, secondary active

    moveActiveTabToOtherGroup(); // secondary -> primary

    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]);
    expect(secondaryOpenTabs.value).toEqual([]);
    expect(openDocuments.value.find((d) => d.path === "/a.md")?.content).toBe("content stays put");
  });

  it("does nothing when the active group has no active tab", () => {
    const before = editorLayout.value;
    moveActiveTabToOtherGroup();
    expect(editorLayout.value).toBe(before);
  });
});

describe("openInOtherGroup", () => {
  it("opens a brand-new note directly in the other group, creating a split if needed", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");

    openInOtherGroup("/b.md", "b.md", "linked content", "text");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]); // current tab preserved in its group
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(secondaryActiveTabPath.value).toBe("/b.md");
    // Regression: the compact/narrow-viewport switcher must follow the
    // note into secondary, not silently stay pointed at primary.
    expect(editorLayout.value.compactVisibleGroupId).toBe("secondary");
  });

  it("moves an already-open note to the other group instead of duplicating it", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "keep me", "text");
    splitRight(); // secondary empty and active, both "/a.md"/"/b.md" stay in primary

    openInOtherGroup("/b.md", "b.md", "ignored, already open", "text");

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]);
    expect(openDocuments.value.find((d) => d.path === "/b.md")?.content).toBe("keep me");
    expect(editorLayout.value.compactVisibleGroupId).toBe("secondary");
  });

  it("still moves an already-open note when activeGroupId is stale relative to where the link was clicked", () => {
    // Both the clicked note and its already-open target tab live in
    // secondary, but activeGroupId still names primary -- the exact race
    // this function's own doc comment describes (a click's pane-focus side
    // effect hasn't run yet). openInOtherGroup must resolve the move from
    // sourceNotePath, not the stale activeGroupId, all the way through to
    // moveTabToGroup actually finding and moving the tab.
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    focusGroup("secondary");
    openOrFocusTab("/clicked-in.md", "clicked-in.md", "", "text");
    openOrFocusTab("/target.md", "target.md", "", "text");
    // Simulate the stale-activeGroupId race directly.
    editorLayout.value = { ...editorLayout.value, activeGroupId: "primary" };

    openInOtherGroup("/target.md", "target.md", "ignored, already open", "text", "/clicked-in.md");

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/clicked-in.md"]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md", "/target.md"]);
  });
});

describe("closeSecondaryGroup (merge into primary)", () => {
  it("appends secondary's pinned then unpinned tabs after primary's own, in that order", () => {
    openOrFocusTab("/p-pinned.md", "p-pinned.md", "", "text");
    pinTab("/p-pinned.md");
    openOrFocusTab("/p-plain.md", "p-plain.md", "", "text");
    splitRight();
    openOrFocusTab("/s-plain.md", "s-plain.md", "", "text");
    openOrFocusTab("/s-pinned.md", "s-pinned.md", "", "text");
    pinTab("/s-pinned.md");

    closeSecondaryGroup();

    expect(editorLayout.value.splitEnabled).toBe(false);
    expect(editorLayout.value.groups.secondary).toBeUndefined();
    expect(openTabs.value.map((t) => t.path)).toEqual([
      "/p-pinned.md", "/s-pinned.md", "/p-plain.md", "/s-plain.md",
    ]);
    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual(["/p-pinned.md", "/s-pinned.md"]);
  });
});

describe("per-group tab commands operate on the owning group only", () => {
  it("closeTab/closeOtherTabs/closeAllUnpinnedTabs only affect the group the path belongs to", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight(); // empty secondary, primary (holding "/a.md") stays active
    focusGroup("secondary");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");

    closeOtherTabs("/b.md"); // both "/b.md" and "/c.md" are in secondary

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]); // primary untouched

    closeTab("/a.md");
    expect(openTabs.value).toEqual([]);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/b.md"]); // secondary untouched
  });

  it("closeAllUnpinnedTabs(groupId) targets exactly one group's tab bar", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    focusGroup("secondary");
    openOrFocusTab("/b.md", "b.md", "", "text");

    closeAllUnpinnedTabs("secondary");

    expect(secondaryOpenTabs.value).toEqual([]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]);
  });

  it("pinTab/unpinTab/unpinAndCloseTab find a secondary-group path's real owner", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight("/a.md");

    pinTab("/a.md");
    expect(editorLayout.value.groups.secondary?.pinnedPaths).toEqual(["/a.md"]);
    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual([]);

    unpinTab("/a.md");
    expect(editorLayout.value.groups.secondary?.pinnedPaths).toEqual([]);

    pinTab("/a.md");
    unpinAndCloseTab("/a.md");
    expect(secondaryOpenTabs.value).toEqual([]);
  });
});

describe("closeTabsUnder and renameOpenTab span both groups", () => {
  it("closeTabsUnder removes matching tabs from primary and secondary alike", () => {
    openOrFocusTab("/folder/a.md", "a.md", "", "text");
    splitRight();
    focusGroup("secondary");
    openOrFocusTab("/folder/b.md", "b.md", "", "text");
    openOrFocusTab("/other.md", "other.md", "", "text");

    closeTabsUnder("/folder");

    expect(openTabs.value.map((t) => t.path)).toEqual([]);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/other.md"]);
  });

  it("renameOpenTab rewrites a secondary-group path and its pin state too", () => {
    openOrFocusTab("/old.md", "old.md", "content", "text");
    splitRight("/old.md");
    pinTab("/old.md");

    renameOpenTab("/old.md", "/new.md", "new.md");

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/new.md"]);
    expect(editorLayout.value.groups.secondary?.pinnedPaths).toEqual(["/new.md"]);
    expect(secondaryActiveTabPath.value).toBe("/new.md");
  });
});

describe("closeAllTabs resets the whole layout, not only primary", () => {
  it("clears both groups and disables the split", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    openOrFocusTab("/b.md", "b.md", "", "text");

    closeAllTabs();

    expect(openDocuments.value).toEqual([]);
    expect(editorLayout.value.splitEnabled).toBe(false);
    expect(editorLayout.value.groups.secondary).toBeUndefined();
    expect(editorLayout.value.activeGroupId).toBe("primary");
  });
});

describe("focusGroup / focusOtherGroup / activeGroupTab", () => {
  it("focusGroup activates an existing group and no-ops for a nonexistent one", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    focusGroup("primary");
    expect(editorLayout.value.activeGroupId).toBe("primary");

    const before = editorLayout.value;
    closeSecondaryGroup();
    focusGroup("secondary"); // no secondary group anymore
    expect(editorLayout.value.activeGroupId).toBe("primary");
    expect(editorLayout.value).not.toBe(before); // still changed by the merge above, just not by this call
  });

  it("focusOtherGroup toggles between primary and secondary, no-op without a secondary", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    focusOtherGroup();
    expect(editorLayout.value.activeGroupId).toBe("primary"); // no secondary to switch to

    splitRight();
    expect(editorLayout.value.activeGroupId).toBe("primary"); // splitRight() without a target leaves primary active
    focusOtherGroup();
    expect(editorLayout.value.activeGroupId).toBe("secondary");
    focusOtherGroup();
    expect(editorLayout.value.activeGroupId).toBe("primary");
  });

  it("activeGroupTab follows the active group, not always primary", () => {
    openOrFocusTab("/a.md", "a.md", "primary content", "text");
    splitRight();
    focusGroup("secondary");
    openOrFocusTab("/b.md", "b.md", "secondary content", "text");

    expect(activeGroupTab()?.path).toBe("/b.md");
    expect(activeTab()?.path).toBe("/a.md"); // compatibility selector still follows primary only
  });
});

describe("per-group view mode and split ratio", () => {
  it("setGroupViewMode changes one group's mode independently of the other", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    openOrFocusTab("/b.md", "b.md", "", "text");

    setGroupViewMode("secondary", "source");

    expect(editorLayout.value.groups.secondary?.viewMode).toBe("source");
    expect(editorLayout.value.groups.primary.viewMode).toBe("source"); // unchanged default
  });

  it("setSplitRatio clamps and resetSplitRatio restores 0.5", () => {
    setSplitRatio(0.9);
    expect(editorLayout.value.preferredRatio).toBe(0.70);

    resetSplitRatio();
    expect(editorLayout.value.preferredRatio).toBe(0.5);
  });
});

// ============ F07 Phase 3 follow-up: within-group tab reordering ============

describe("reorderTabWithinGroup", () => {
  it("swaps a tab with its left/right neighbor in the unpinned region", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");

    reorderTabWithinGroup("/b.md", "left");
    expect(openTabs.value.map((t) => t.path)).toEqual(["/b.md", "/a.md", "/c.md"]);

    reorderTabWithinGroup("/b.md", "right");
    reorderTabWithinGroup("/b.md", "right");
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md", "/c.md", "/b.md"]);
  });

  it("is a no-op at either edge of the region", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");

    reorderTabWithinGroup("/a.md", "left"); // already first
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);

    reorderTabWithinGroup("/b.md", "right"); // already last
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
  });

  it("reorders within the pinned region without touching unpinned tabs", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");
    pinTab("/a.md");
    pinTab("/b.md");

    reorderTabWithinGroup("/a.md", "right"); // swaps within {a,b}, the pinned region

    expect(openTabs.value.map((t) => t.path)).toEqual(["/b.md", "/a.md", "/c.md"]);
    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual(["/b.md", "/a.md"]);
  });

  it("reorders within whichever group the path belongs to", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    focusGroup("secondary");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");

    reorderTabWithinGroup("/b.md", "right");

    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/c.md", "/b.md"]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md"]); // untouched
  });
});

describe("moveTabWithinGroup", () => {
  it("moves a tab to sit immediately before another, within the unpinned region", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");

    moveTabWithinGroup("/c.md", "/a.md");

    expect(openTabs.value.map((t) => t.path)).toEqual(["/c.md", "/a.md", "/b.md"]);
  });

  it("moves a tab to the end of its region when beforePath is null", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    openOrFocusTab("/b.md", "b.md", "", "text");
    openOrFocusTab("/c.md", "c.md", "", "text");

    moveTabWithinGroup("/a.md", null);

    expect(openTabs.value.map((t) => t.path)).toEqual(["/b.md", "/c.md", "/a.md"]);
  });

  it("does not implicitly pin or unpin: dropping across regions is a no-op", () => {
    openOrFocusTab("/a.md", "a.md", "", "text"); // pinned
    openOrFocusTab("/b.md", "b.md", "", "text"); // unpinned
    pinTab("/a.md");

    moveTabWithinGroup("/b.md", "/a.md"); // b (unpinned) dropped onto a (pinned) -- invalid region

    expect(openTabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]); // unchanged
    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual(["/a.md"]); // still just a
  });

  it("is a no-op for a path or target that isn't actually open", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    const before = editorLayout.value;

    moveTabWithinGroup("/nonexistent.md", "/a.md");
    moveTabWithinGroup("/a.md", "/also-nonexistent.md");

    expect(editorLayout.value).toBe(before);
  });
});

// ============ F07 Phase 4: compact layout ============

describe("setCompactVisibleGroup", () => {
  it("switches which group is visible on a compact layout, independent of activeGroupId", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    splitRight();
    focusGroup("primary"); // active stays primary throughout this test

    setCompactVisibleGroup("secondary");

    expect(editorLayout.value.compactVisibleGroupId).toBe("secondary");
    expect(editorLayout.value.activeGroupId).toBe("primary"); // untouched
  });

  it("is a no-op for a group that doesn't exist", () => {
    openOrFocusTab("/a.md", "a.md", "", "text"); // no split, no secondary

    setCompactVisibleGroup("secondary");

    expect(editorLayout.value.compactVisibleGroupId).toBe("primary");
  });

  it("is a no-op (no new signal write) when already showing the requested group", () => {
    openOrFocusTab("/a.md", "a.md", "", "text");
    const before = editorLayout.value;

    setCompactVisibleGroup("primary");

    expect(editorLayout.value).toBe(before);
  });
});
