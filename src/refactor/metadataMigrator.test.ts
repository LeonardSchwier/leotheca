/**
 * Tests for F03 Phase 2b: Application metadata migration adapters
 */

import { describe, expect, it } from "vitest";
import {
  editorLayoutMigrator,
  bookmarksMigrator,
  workspaceSettingsMigrator,
  findMigrator,
  migrateMetadata,
  createMetadataMigrationPlan,
} from "./metadataMigrator";
import type { EditorLayoutState } from "../workspace/types";
import type { Bookmark } from "../bookmarks/types";
import type { WorkspaceSettings } from "../settings/workspaceSettings";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";

// Helper to create a basic editor layout state
function createEditorLayout(tabPaths: string[], activePath: string | null): EditorLayoutState {
  return {
    activeGroupId: "primary",
    splitEnabled: false,
    preferredRatio: 0.5,
    compactVisibleGroupId: "primary",
    groups: {
      primary: {
        id: "primary",
        tabPaths,
        pinnedPaths: [],
        activePath,
      },
    },
  };
}

describe("editorLayoutMigrator", () => {
  it("should identify editor layout state correctly", () => {
    const layout = createEditorLayout(["note1.md"], "note1.md");
    expect(editorLayoutMigrator.canHandle(layout)).toBe(true);
    expect(editorLayoutMigrator.canHandle({})).toBe(false);
    expect(editorLayoutMigrator.canHandle(null)).toBe(false);
  });

  it("should migrate tabPaths correctly", () => {
    const layout = createEditorLayout(["note1.md", "note2.md"], "note1.md");
    const migrated = editorLayoutMigrator.migrate(layout, "note1.md", "renamed.md");
    
    expect(migrated.groups.primary.tabPaths).toEqual(["renamed.md", "note2.md"]);
    expect(migrated.groups.primary.activePath).toBe("renamed.md");
  });

  it("should migrate activePath correctly", () => {
    const layout = createEditorLayout(["note1.md", "note2.md"], "note2.md");
    const migrated = editorLayoutMigrator.migrate(layout, "note2.md", "renamed.md");
    
    expect(migrated.groups.primary.tabPaths).toEqual(["note1.md", "renamed.md"]);
    expect(migrated.groups.primary.activePath).toBe("renamed.md");
  });

  it("should not modify layout when path is not found", () => {
    const layout = createEditorLayout(["note1.md", "note2.md"], "note1.md");
    const migrated = editorLayoutMigrator.migrate(layout, "nonexistent.md", "renamed.md");
    
    expect(migrated).toEqual(layout);
  });

  it("should handle empty tabPaths", () => {
    const layout = createEditorLayout([], null);
    const migrated = editorLayoutMigrator.migrate(layout, "note1.md", "renamed.md");
    
    expect(migrated.groups.primary.tabPaths).toEqual([]);
    expect(migrated.groups.primary.activePath).toBe(null);
  });
});

describe("bookmarksMigrator", () => {
  it("should identify bookmark arrays correctly", () => {
    const bookmarks: Bookmark[] = [
      { id: "1", kind: "file", label: "Note 1", path: "note1.md" },
    ];
    expect(bookmarksMigrator.canHandle(bookmarks)).toBe(true);
    expect(bookmarksMigrator.canHandle({})).toBe(false);
    expect(bookmarksMigrator.canHandle([])).toBe(true);
  });

  it("should migrate file bookmark paths correctly", () => {
    const fileBookmark1: Bookmark = { id: "1", kind: "file", label: "Note 1", path: "note1.md" };
    const fileBookmark2: Bookmark = { id: "2", kind: "file", label: "Note 2", path: "note2.md" };
    const searchBookmark: Bookmark = { id: "3", kind: "search", label: "Search", query: "test" };
    const bookmarks: Bookmark[] = [fileBookmark1, fileBookmark2, searchBookmark];
    const migrated = bookmarksMigrator.migrate(bookmarks, "note1.md", "renamed.md");
    
    const migratedFile1 = migrated[0] as Extract<Bookmark, { kind: "file" }>;
    const migratedFile2 = migrated[1] as Extract<Bookmark, { kind: "file" }>;
    const migratedSearch = migrated[2] as Extract<Bookmark, { kind: "search" }>;
    
    expect(migratedFile1.path).toBe("renamed.md");
    expect(migratedFile2.path).toBe("note2.md");
    expect(migratedSearch.query).toBe("test");
  });

  it("should not modify non-file bookmarks", () => {
    const bookmarks: Bookmark[] = [
      { id: "1", kind: "search", label: "Search", query: "test" },
    ];
    const migrated = bookmarksMigrator.migrate(bookmarks, "note1.md", "renamed.md");
    
    expect(migrated).toEqual(bookmarks);
  });

  it("should handle empty bookmarks array", () => {
    const bookmarks: Bookmark[] = [];
    const migrated = bookmarksMigrator.migrate(bookmarks, "note1.md", "renamed.md");
    
    expect(migrated).toEqual([]);
  });
});

describe("workspaceSettingsMigrator", () => {
  it("should identify workspace settings correctly", () => {
    const settings = DEFAULT_WORKSPACE_SETTINGS;
    expect(workspaceSettingsMigrator.canHandle(settings)).toBe(true);
    expect(workspaceSettingsMigrator.canHandle({})).toBe(false);
  });

  it("should return settings unchanged when no path matches", () => {
    const settings = { ...DEFAULT_WORKSPACE_SETTINGS };
    const migrated = workspaceSettingsMigrator.migrate(settings, "note1.md", "renamed.md");
    
    expect(migrated).toEqual(settings);
  });

  it("should migrate lastOpenPaths correctly", () => {
    const settings: WorkspaceSettings = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      lastOpenPaths: ["note1.md", "note2.md"],
    };
    const migrated = workspaceSettingsMigrator.migrate(settings, "note1.md", "renamed.md");
    
    expect(migrated.lastOpenPaths).toEqual(["renamed.md", "note2.md"]);
    expect(migrated.lastActivePath).toBe(null);
  });

  it("should migrate lastActivePath correctly", () => {
    const settings: WorkspaceSettings = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      lastOpenPaths: [],
      lastActivePath: "note1.md",
    };
    const migrated = workspaceSettingsMigrator.migrate(settings, "note1.md", "renamed.md");
    
    expect(migrated.lastOpenPaths).toEqual([]);
    expect(migrated.lastActivePath).toBe("renamed.md");
  });

  it("should migrate editorLayout correctly", () => {
    const layout = createEditorLayout(["note1.md"], "note1.md");
    const settings: WorkspaceSettings = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      editorLayout: layout,
    };
    const migrated = workspaceSettingsMigrator.migrate(settings, "note1.md", "renamed.md");
    
    expect(migrated.editorLayout?.groups.primary.tabPaths[0]).toBe("renamed.md");
    expect(migrated.editorLayout?.groups.primary.activePath).toBe("renamed.md");
  });
});

describe("findMigrator", () => {
  it("should find the correct migrator for editor layout", () => {
    const layout = createEditorLayout(["note1.md"], "note1.md");
    const migrator = findMigrator(layout);
    
    expect(migrator).toBeDefined();
    expect(migrator?.id).toBe("editor-layout");
  });

  it("should find the correct migrator for bookmarks", () => {
    const bookmarks: Bookmark[] = [
      { id: "1", kind: "file", label: "Note 1", path: "note1.md" },
    ];
    const migrator = findMigrator(bookmarks);
    
    expect(migrator).toBeDefined();
    expect(migrator?.id).toBe("bookmarks");
  });

  it("should find the correct migrator for workspace settings", () => {
    const settings = DEFAULT_WORKSPACE_SETTINGS;
    const migrator = findMigrator(settings);
    
    expect(migrator).toBeDefined();
    expect(migrator?.id).toBe("workspace-settings");
  });

  it("should return undefined for unknown metadata", () => {
    const unknown = { custom: "object" };
    const migrator = findMigrator(unknown);
    
    expect(migrator).toBeUndefined();
  });
});

describe("migrateMetadata", () => {
  it("should migrate editor layout through unknown type", () => {
    const layout = createEditorLayout(["note1.md"], "note1.md");
    const migrated = migrateMetadata(layout, "note1.md", "renamed.md") as EditorLayoutState;
    
    expect(migrated.groups.primary.tabPaths).toEqual(["renamed.md"]);
    expect(migrated.groups.primary.activePath).toBe("renamed.md");
  });

  it("should migrate bookmark arrays through unknown type", () => {
    const fileBookmark: Bookmark = { id: "1", kind: "file", label: "Note 1", path: "note1.md" };
    const bookmarks: Bookmark[] = [fileBookmark];
    const migrated = migrateMetadata(bookmarks, "note1.md", "renamed.md") as Bookmark[];
    
    const migratedFile = migrated[0] as Extract<Bookmark, { kind: "file" }>;
    expect(migratedFile.path).toBe("renamed.md");
  });

  it("should handle arrays of metadata", () => {
    const layout1 = createEditorLayout(["note1.md"], "note1.md");
    const layout2 = createEditorLayout(["note1.md"], "note1.md");
    const metadataArray = [layout1, layout2];
    
    const migrated = migrateMetadata(metadataArray, "note1.md", "renamed.md") as EditorLayoutState[];
    
    expect(migrated[0].groups.primary.tabPaths[0]).toBe("renamed.md");
    expect(migrated[1].groups.primary.tabPaths[0]).toBe("renamed.md");
  });

  it("should return unchanged data for unknown metadata", () => {
    const unknown = { custom: "object", path: "note1.md" };
    const migrated = migrateMetadata(unknown, "note1.md", "renamed.md");
    
    expect(migrated).toEqual(unknown);
  });
});

describe("createMetadataMigrationPlan", () => {
  it("should create a complete migration plan", () => {
    const layout = createEditorLayout(["note1.md"], "note1.md");
    const fileBookmark: Bookmark = { id: "1", kind: "file", label: "Note 1", path: "note1.md" };
    const bookmarks: Bookmark[] = [fileBookmark];
    const settings = DEFAULT_WORKSPACE_SETTINGS;
    
    const plan = createMetadataMigrationPlan(layout, bookmarks, settings, "note1.md", "renamed.md");
    
    // Check that the plan contains migrated metadata
    expect(plan.editorLayout.groups.primary.tabPaths[0]).toBe("renamed.md");
    const migratedBookmark = plan.bookmarks[0] as Extract<Bookmark, { kind: "file" }>;
    expect(migratedBookmark.path).toBe("renamed.md");
    expect(plan.workspaceSettings).toEqual(settings);
  });
});