import { describe, expect, it } from "vitest";
import {
  createPrimaryEditorLayout,
  pinPrimaryEditorLayout,
  restorePrimaryEditorLayout,
  synchronizePrimaryEditorLayout,
  unpinPrimaryEditorLayout,
  createSplitLayout,
  moveTabToGroup,
  mergeSecondaryIntoPrimary,
  updateSplitRatio,
  activateGroup,
  pinGroupTab,
  unpinGroupTab,
} from "./documentGroups";
import type { EditorLayoutState } from "./types";

describe("createPrimaryEditorLayout", () => {
  it("keeps each path in the primary group at most once and repairs a stale active path", () => {
    const layout = createPrimaryEditorLayout(["/a.md", "/b.md", "/a.md"], "/missing.md");

    expect(layout).toEqual({
      activeGroupId: "primary",
      splitEnabled: false,
      preferredRatio: 0.5,
      compactVisibleGroupId: "primary",
      groups: {
        primary: {
          id: "primary",
          tabPaths: ["/a.md", "/b.md"],
          pinnedPaths: [],
          activePath: "/b.md",
          viewMode: "source",
        },
      },
    });
  });

  it("retains a valid active path and starts with no pins", () => {
    const layout = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");

    expect(layout.groups.primary.activePath).toBe("/a.md");
    expect(layout.groups.primary.pinnedPaths).toEqual([]);
  });
});

describe("synchronizePrimaryEditorLayout", () => {
  it("uses the canonical document order and does not duplicate it in a secondary group", () => {
    const initial = createPrimaryEditorLayout(["/old.md"], "/old.md");
    const layout = synchronizePrimaryEditorLayout(initial, ["/a.md", "/b.md"], "/a.md");

    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
    expect(layout.groups.primary.activePath).toBe("/a.md");
    expect(layout.groups.secondary).toBeUndefined();
  });

  it("keeps valid pins ahead of ordinary paths while removing stale pins", () => {
    const initial = pinPrimaryEditorLayout(
      createPrimaryEditorLayout(["/a.md", "/b.md", "/c.md"], "/a.md"),
      "/c.md",
    );
    const layout = synchronizePrimaryEditorLayout(initial, ["/a.md", "/b.md"], "/a.md");

    expect(layout.groups.primary.pinnedPaths).toEqual([]);
    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
  });

  it("preserves the primary group's view mode across an ordinary tab-open/close synchronization", () => {
    const initial: EditorLayoutState = {
      ...createPrimaryEditorLayout(["/a.md"], "/a.md"),
      groups: {
        primary: { ...createPrimaryEditorLayout(["/a.md"], "/a.md").groups.primary, viewMode: "preview" },
      },
    };

    const layout = synchronizePrimaryEditorLayout(initial, ["/a.md", "/b.md"], "/b.md");

    expect(layout.groups.primary.viewMode).toBe("preview");
  });
});

describe("restorePrimaryEditorLayout", () => {
  it("restores only the pins whose paths actually reopened, and the persisted view mode", () => {
    const layout = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");

    const restored = restorePrimaryEditorLayout(layout, {
      pinnedPaths: ["/b.md", "/missing.md"],
      viewMode: "split",
    });

    expect(restored.groups.primary.pinnedPaths).toEqual(["/b.md"]);
    expect(restored.groups.primary.tabPaths).toEqual(["/b.md", "/a.md"]);
    expect(restored.groups.primary.viewMode).toBe("split");
  });

  it("is a no-op on tabPaths and activePath when nothing is pinned", () => {
    const layout = createPrimaryEditorLayout(["/a.md", "/b.md"], "/b.md");

    const restored = restorePrimaryEditorLayout(layout, { pinnedPaths: [], viewMode: "source" });

    expect(restored.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
    expect(restored.groups.primary.activePath).toBe("/b.md");
    expect(restored.groups.primary.pinnedPaths).toEqual([]);
  });
});

describe("primary-group pins", () => {
  it("pins in stable order and returns an unpinned tab to the leading ordinary region", () => {
    const initial = createPrimaryEditorLayout(["/a.md", "/b.md", "/c.md"], "/a.md");
    const pinned = pinPrimaryEditorLayout(pinPrimaryEditorLayout(initial, "/c.md"), "/b.md");
    const unpinned = unpinPrimaryEditorLayout(pinned, "/c.md");

    expect(pinned.groups.primary).toMatchObject({
      pinnedPaths: ["/c.md", "/b.md"],
      tabPaths: ["/c.md", "/b.md", "/a.md"],
    });
    expect(unpinned.groups.primary).toMatchObject({
      pinnedPaths: ["/b.md"],
      tabPaths: ["/b.md", "/c.md", "/a.md"],
    });
  });
});

// ============ F07 Phase 2b-6 Tests ============

describe("createSplitLayout", () => {
  it("creates secondary group with no initial tab", () => {
    const initial = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");
    const layout = createSplitLayout(initial);

    expect(layout.splitEnabled).toBe(true);
    expect(layout.activeGroupId).toBe("primary");
    expect(layout.groups.secondary).toBeDefined();
    expect(layout.groups.secondary?.tabPaths).toEqual([]);
    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
  });

  it("creates secondary group with initial tab, moving it from primary", () => {
    const initial = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");
    const layout = createSplitLayout(initial, "/a.md");

    expect(layout.splitEnabled).toBe(true);
    expect(layout.activeGroupId).toBe("secondary");
    expect(layout.groups.secondary?.tabPaths).toEqual(["/a.md"]);
    expect(layout.groups.secondary?.activePath).toBe("/a.md");
    expect(layout.groups.primary.tabPaths).toEqual(["/b.md"]);
    expect(layout.groups.primary.activePath).toBe("/b.md");
  });
});

describe("moveTabToGroup", () => {
  it("moves tab from primary to secondary", () => {
    const initial = createSplitLayout(createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md"));
    const layout = moveTabToGroup(initial, "/a.md", "secondary");

    expect(layout.activeGroupId).toBe("secondary");
    expect(layout.groups.primary.tabPaths).toEqual(["/b.md"]);
    expect(layout.groups.secondary?.tabPaths).toEqual(["/a.md"]);
  });

  it("does not move tab that is not in source group", () => {
    const initial = createSplitLayout(createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md"));
    const layout = moveTabToGroup(initial, "/c.md", "secondary");

    expect(layout).toBe(initial);
  });

  it("does not move tab if it already exists in target group", () => {
    const initial = createSplitLayout(createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md"));
    // This shouldn't happen in normal usage but guard against it
    const layout = moveTabToGroup(initial, "/a.md", "primary");

    expect(layout).toBe(initial);
  });
});

describe("mergeSecondaryIntoPrimary", () => {
  it("merges secondary tabs into primary and disables split", () => {
    const initial = createPrimaryEditorLayout(["/a.md"], "/a.md");
    const split = createSplitLayout(initial, "/b.md");
    const layout = mergeSecondaryIntoPrimary(split);

    expect(layout.splitEnabled).toBe(false);
    expect(layout.activeGroupId).toBe("primary");
    expect(layout.groups.secondary).toBeUndefined();
    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
  });

  it("preserves pinned tabs from both groups", () => {
    const initial = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");
    let layout = pinPrimaryEditorLayout(initial, "/a.md");
    layout = createSplitLayout(layout, "/b.md");
    layout = pinGroupTab(layout, "secondary", "/b.md");
    layout = mergeSecondaryIntoPrimary(layout);

    expect(layout.splitEnabled).toBe(false);
    expect(layout.groups.primary.pinnedPaths).toEqual(["/a.md", "/b.md"]);
    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
  });

  it("returns original layout if split is not enabled", () => {
    const initial = createPrimaryEditorLayout(["/a.md"], "/a.md");
    const layout = mergeSecondaryIntoPrimary(initial);

    expect(layout).toBe(initial);
  });
});

describe("updateSplitRatio", () => {
  it("clamps ratio between 0.30 and 0.70", () => {
    const initial = createPrimaryEditorLayout(["/a.md"], "/a.md");
    
    expect(updateSplitRatio(initial, 0.25).preferredRatio).toBe(0.30);
    expect(updateSplitRatio(initial, 0.50).preferredRatio).toBe(0.50);
    expect(updateSplitRatio(initial, 0.75).preferredRatio).toBe(0.70);
    expect(updateSplitRatio(initial, 1.50).preferredRatio).toBe(0.70);
  });
});

describe("activateGroup", () => {
  it("changes active group to specified group", () => {
    const initial = createSplitLayout(createPrimaryEditorLayout(["/a.md"], "/a.md"));
    const layout = activateGroup(initial, "secondary");

    expect(layout.activeGroupId).toBe("secondary");
  });

  it("returns original layout if group does not exist", () => {
    const initial = createPrimaryEditorLayout(["/a.md"], "/a.md");
    const layout = activateGroup(initial, "secondary");

    expect(layout).toBe(initial);
  });
});

describe("pinGroupTab", () => {
  it("pins tab in primary group", () => {
    const initial = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");
    const layout = pinGroupTab(initial, "primary", "/a.md");

    expect(layout.groups.primary.pinnedPaths).toEqual(["/a.md"]);
    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
  });

  it("pins tab in secondary group", () => {
    const initial = createSplitLayout(createPrimaryEditorLayout(["/a.md"], "/a.md"), "/b.md");
    const layout = pinGroupTab(initial, "secondary", "/b.md");

    expect(layout.groups.secondary?.pinnedPaths).toEqual(["/b.md"]);
    expect(layout.groups.secondary?.tabPaths).toEqual(["/b.md"]);
  });

  it("does not pin tab not in group", () => {
    const initial = createPrimaryEditorLayout(["/a.md"], "/a.md");
    const layout = pinGroupTab(initial, "primary", "/b.md");

    expect(layout).toBe(initial);
  });
});

describe("unpinGroupTab", () => {
  it("unpins tab in primary group", () => {
    const initial = createPrimaryEditorLayout(["/a.md", "/b.md"], "/a.md");
    let layout = pinGroupTab(initial, "primary", "/a.md");
    layout = unpinGroupTab(layout, "primary", "/a.md");

    expect(layout.groups.primary.pinnedPaths).toEqual([]);
    expect(layout.groups.primary.tabPaths).toEqual(["/a.md", "/b.md"]);
  });

  it("unpins tab in secondary group", () => {
    const initial = createSplitLayout(createPrimaryEditorLayout(["/a.md"], "/a.md"), "/b.md");
    let layout = pinGroupTab(initial, "secondary", "/b.md");
    layout = unpinGroupTab(layout, "secondary", "/b.md");

    expect(layout.groups.secondary?.pinnedPaths).toEqual([]);
    expect(layout.groups.secondary?.tabPaths).toEqual(["/b.md"]);
  });

  it("does not unpin tab not in group pinned paths", () => {
    const initial = createPrimaryEditorLayout(["/a.md"], "/a.md");
    const layout = unpinGroupTab(initial, "primary", "/a.md");

    expect(layout).toBe(initial);
  });
});
