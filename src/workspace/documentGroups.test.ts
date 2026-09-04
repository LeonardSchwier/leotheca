import { describe, expect, it } from "vitest";
import { createPrimaryEditorLayout, synchronizePrimaryEditorLayout } from "./documentGroups";

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

  it("retains a valid active path and leaves the first phase unpinned", () => {
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
});
