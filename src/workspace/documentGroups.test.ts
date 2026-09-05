import { describe, expect, it } from "vitest";
import {
  createPrimaryEditorLayout,
  pinPrimaryEditorLayout,
  synchronizePrimaryEditorLayout,
  unpinPrimaryEditorLayout,
} from "./documentGroups";

describe("createPrimaryEditorLayout", () => {
  it("keeps each path in the primary group at most once and repairs a stale active path", () => {
    const layout = createPrimaryEditorLayout(["/a.md", "/b.md", "/a.md"], "/missing.md");

    expect(layout).toEqual({
      activeGroupId: "primary",
      groups: {
        primary: {
          id: "primary",
          tabPaths: ["/a.md", "/b.md"],
          pinnedPaths: [],
          activePath: "/b.md",
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
