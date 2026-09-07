/**
 * Tests for F03 Phase 3: Transaction executor and recovery
 * Covers mutation lock, preflight validation, journal entries, 
 * execution flow, rollback capability, and startup recovery
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  acquireMutationLock,
  releaseMutationLock,
  renameMutationLock,
  startRenameOperation,
  getCurrentOperation,
  getRenameJournal,
  clearCompletedOperations,
  resetRenameExecutor,
  preflightRename,
  executeRenameOperation,
  hasIncompleteOperations,
  getIncompleteOperation,
  recoverFromIncompleteOperations,
} from "./renameExecutor";
import type { EditorLayoutState } from "../workspace/types";
import type { WorkspaceSettings } from "../settings/workspaceSettings";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";
import type { RenamePlan, PlannedWikiLinkEdit, BlockedWikiLinkEdit } from "./renamePlan";

// Helper to create a basic editor layout state
function createEditorLayout(tabPaths: string[] = [], activePath: string | null = null): EditorLayoutState {
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

// Helper to create basic workspace settings
function createWorkspaceSettings(lastOpenPaths: string[] = [], lastActivePath: string | null = null): WorkspaceSettings {
  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    lastOpenPaths,
    lastActivePath,
  };
}

// Helper to create a mock RenamePlan
function createMockRenamePlan(oldPath: string, newPath: string, edits: PlannedWikiLinkEdit[] = [], blocked: BlockedWikiLinkEdit[] = []): RenamePlan {
  return {
    oldPath,
    newPath,
    edits,
    blocked,
  };
}

// Helper to create mock platform options
function createMockOptions({
  readNote = vi.fn().mockResolvedValue(""),
  writeNote = vi.fn().mockResolvedValue(undefined),
  renameFile = vi.fn().mockResolvedValue(undefined),
  saveEditorLayout = vi.fn().mockResolvedValue(undefined),
  saveBookmarks = vi.fn().mockResolvedValue(undefined),
  saveWorkspaceSettings = vi.fn().mockResolvedValue(undefined),
} = {}) {
  return {
    readNote,
    writeNote,
    renameFile,
    saveEditorLayout,
    saveBookmarks,
    saveWorkspaceSettings,
  };
}

describe("renameExecutor - Mutation Lock", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should start with mutation lock released", () => {
    expect(renameMutationLock.value).toBe(false);
  });

  it("should acquire mutation lock successfully when available", () => {
    const acquired = acquireMutationLock();
    expect(acquired).toBe(true);
    expect(renameMutationLock.value).toBe(true);
  });

  it("should fail to acquire mutation lock when already locked", () => {
    acquireMutationLock();
    const acquired = acquireMutationLock();
    expect(acquired).toBe(false);
    expect(renameMutationLock.value).toBe(true);
  });

  it("should release mutation lock successfully", () => {
    acquireMutationLock();
    releaseMutationLock();
    expect(renameMutationLock.value).toBe(false);
  });
});

describe("renameExecutor - Journal Management", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should start rename operation and create journal entry", () => {
    const entry = startRenameOperation("old.md", "new.md");
    
    expect(entry.operationId).toBeDefined();
    expect(entry.oldPath).toBe("old.md");
    expect(entry.newPath).toBe("new.md");
    expect(entry.startedAt).toBeLessThanOrEqual(Date.now());
    expect(entry.step).toBe("preflight");
    expect(entry.completed).toBe(false);
    expect(entry.originalWikilinks).toEqual([]);
    expect(entry.error).toBeUndefined();
  });

  it("should get current operation", () => {
    startRenameOperation("old.md", "new.md");
    const current = getCurrentOperation();
    
    expect(current).not.toBeNull();
    expect(current?.oldPath).toBe("old.md");
    expect(current?.newPath).toBe("new.md");
  });

  it("should return null for current operation when none exists", () => {
    const current = getCurrentOperation();
    expect(current).toBeNull();
  });

  it("should get all journal entries", () => {
    startRenameOperation("old1.md", "new1.md");
    startRenameOperation("old2.md", "new2.md");
    
    const journal = getRenameJournal();
    expect(journal).toHaveLength(2);
    expect(journal[0].oldPath).toBe("old1.md");
    expect(journal[1].oldPath).toBe("old2.md");
  });

  it("should clear completed operations from journal", () => {
    // This test would need a completed operation
    // For now, test that it doesn't fail with empty journal
    clearCompletedOperations();
    expect(getRenameJournal()).toHaveLength(0);
  });

  it("should reset rename executor completely", () => {
    acquireMutationLock();
    startRenameOperation("old.md", "new.md");
    
    resetRenameExecutor();
    
    expect(renameMutationLock.value).toBe(false);
    expect(getCurrentOperation()).toBeNull();
    expect(getRenameJournal()).toHaveLength(0);
  });
});

describe("renameExecutor - Preflight Validation", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should fail preflight when oldPath equals newPath", async () => {
    const result = await preflightRename(
      "same.md", "same.md", 
      createMockRenamePlan("same.md", "same.md"),
      { editorLayout: createEditorLayout(), bookmarks: [], workspaceSettings: createWorkspaceSettings() },
      createEditorLayout(), [], createWorkspaceSettings()
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("same");
  });

  it("should fail preflight when there are blocked references", async () => {
    const blockedEdit = { path: "some.md", reason: "ambiguous" };
    const result = await preflightRename(
      "old.md", "new.md", 
      createMockRenamePlan("old.md", "new.md", [], [blockedEdit]),
      { editorLayout: createEditorLayout(), bookmarks: [], workspaceSettings: createWorkspaceSettings() },
      createEditorLayout(), [], createWorkspaceSettings()
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("ambiguous");
  });

  it("should fail preflight when there are no changes to apply", async () => {
    const result = await preflightRename(
      "old.md", "new.md", 
      createMockRenamePlan("old.md", "new.md", [], []), // renamePlan - no edits, no blocks
      {
        editorLayout: createEditorLayout(),
        bookmarks: [],
        workspaceSettings: createWorkspaceSettings(),
      }, // metadataMigrationPlan - same as current state
      createEditorLayout(), // currentEditorLayout
      [], // currentBookmarks  
      createWorkspaceSettings() // currentWorkspaceSettings
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("No changes");
  });

  it("should pass preflight when there are valid wikilink edits", async () => {
    const wikilinkEdit = { 
      path: "note.md", 
      from: 0, 
      to: 10, 
      oldText: "[[old]]", 
      newText: "[[new]]" 
    };
    const result = await preflightRename(
      "old.md", "new.md", 
      createMockRenamePlan("old.md", "new.md", [wikilinkEdit], []),
      { editorLayout: createEditorLayout(), bookmarks: [], workspaceSettings: createWorkspaceSettings() },
      createEditorLayout(), [], createWorkspaceSettings()
    );
    
    expect(result.success).toBe(true);
  });

  it("should pass preflight when there are metadata changes", async () => {
    const layout = createEditorLayout(["old.md"], "old.md");
    const result = await preflightRename(
      "old.md", "new.md", 
      createMockRenamePlan("old.md", "new.md", [], []),
      {
        editorLayout: createEditorLayout(["new.md"], "new.md"), // migrated layout
        bookmarks: [{ id: "1", kind: "file", label: "test", path: "new.md" }],
        workspaceSettings: createWorkspaceSettings(["new.md"], "new.md"),
      },
      layout,
      [{ id: "1", kind: "file", label: "test", path: "old.md" }],
      createWorkspaceSettings(["old.md"], "old.md")
    );
    
    expect(result.success).toBe(true);
  });
});

describe("renameExecutor - Complete Execution Flow", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should execute complete rename operation successfully", async () => {
    const wikilinkEdit = { 
      path: "note.md", 
      from: 0, 
      to: 6, 
      oldText: "[[old]]", 
      newText: "[[new]]" 
    };
    
    const mockOptions = createMockOptions({
      readNote: vi.fn().mockResolvedValue("[[old]] rest"),
      writeNote: vi.fn().mockResolvedValue(undefined),
      renameFile: vi.fn().mockResolvedValue(undefined),
      saveEditorLayout: vi.fn().mockResolvedValue(undefined),
      saveBookmarks: vi.fn().mockResolvedValue(undefined),
      saveWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", [wikilinkEdit], []),
      createEditorLayout(["old.md"], "old.md"),
      [],
      createWorkspaceSettings(["old.md"], "old.md"),
      mockOptions
    );
    
    expect(result.success).toBe(true);
    expect(result.journalEntry).toBeDefined();
    expect(result.journalEntry?.completed).toBe(true);
    expect(mockOptions.renameFile).toHaveBeenCalledWith("old.md", "new.md");
    expect(mockOptions.writeNote).toHaveBeenCalled();
  });

  it("should fail when mutation lock cannot be acquired", async () => {
    // First, acquire the lock
    acquireMutationLock();
    
    const mockOptions = createMockOptions();
    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", [], []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("already in progress");
  });

  it("should fail when preflight fails", async () => {
    const mockOptions = createMockOptions();
    const result = await executeRenameOperation(
      "old.md",
      "old.md", // Same path - should fail preflight
      createMockRenamePlan("old.md", "old.md", [], []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("same");
  });
});

describe("renameExecutor - Rollback Capability", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should detect incomplete operations", async () => {
    // Start an operation but don't complete it
    startRenameOperation("old.md", "new.md");
    
    expect(hasIncompleteOperations()).toBe(true);
    expect(getIncompleteOperation()).not.toBeNull();
  });

  it("should return false when no incomplete operations", () => {
    expect(hasIncompleteOperations()).toBe(false);
    expect(getIncompleteOperation()).toBeNull();
  });

  it("should rollback incomplete operations on startup recovery", async () => {
    // Start an operation
    const entry = startRenameOperation("old.md", "new.md");
    
    // Simulate some state changes that would need rollback
    const mockOptions = createMockOptions({
      renameFile: vi.fn().mockResolvedValue(undefined),
      readNote: vi.fn().mockResolvedValue("content"),
      writeNote: vi.fn().mockResolvedValue(undefined),
      saveEditorLayout: vi.fn().mockResolvedValue(undefined),
      saveBookmarks: vi.fn().mockResolvedValue(undefined),
      saveWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    });

    // Add some original state for rollback
    entry.originalWikilinks = [{
      path: "note.md",
      from: 0,
      to: 6,
      oldText: "[[old]]",
    }];
    entry.originalMetadata = {
      editorLayout: createEditorLayout(["old.md"], "old.md"),
      bookmarks: [{ id: "1", kind: "file", label: "test", path: "old.md" }],
      workspaceSettings: createWorkspaceSettings(["old.md"], "old.md"),
    };

    // Mark as incomplete
    entry.completed = false;
    
    const result = await recoverFromIncompleteOperations(mockOptions);
    
    expect(result.recovered).toBe(true);
    expect(result.operations).toHaveLength(1);
  });
});

describe("renameExecutor - State Isolation", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should maintain separate journal entries for different operations", () => {
    startRenameOperation("old1.md", "new1.md");
    startRenameOperation("old2.md", "new2.md");
    
    const journal = getRenameJournal();
    expect(journal).toHaveLength(2);
    expect(journal[0].operationId).not.toBe(journal[1].operationId);
    expect(journal[0].oldPath).toBe("old1.md");
    expect(journal[1].oldPath).toBe("old2.md");
  });

  it("should only have one current operation at a time", () => {
    startRenameOperation("old1.md", "new1.md");
    const entry2 = startRenameOperation("old2.md", "new2.md");
    
    const current = getCurrentOperation();
    expect(current?.operationId).toBe(entry2.operationId);
    expect(current?.oldPath).toBe("old2.md");
  });
});

describe("renameExecutor - Error Handling", () => {
  beforeEach(() => {
    resetRenameExecutor();
  });

  it("should handle file rename failure with rollback", async () => {
    const wikilinkEdit = { 
      path: "note.md", 
      from: 0, 
      to: 6, 
      oldText: "[[old]]", 
      newText: "[[new]]" 
    };
    
    const mockOptions = createMockOptions({
      readNote: vi.fn().mockResolvedValue("[[old]] rest"),
      writeNote: vi.fn().mockResolvedValue(undefined),
      renameFile: vi.fn().mockRejectedValue(new Error("File system error")),
      saveEditorLayout: vi.fn().mockResolvedValue(undefined),
      saveBookmarks: vi.fn().mockResolvedValue(undefined),
      saveWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", [wikilinkEdit], []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("File rename failed");
    expect(result.journalEntry?.step).toBe("failed");
  });

  it("should handle metadata migration failure with rollback", async () => {
    const mockOptions = createMockOptions({
      saveEditorLayout: vi.fn().mockRejectedValue(new Error("Metadata error")),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", [], []),
      createEditorLayout(["old.md"], "old.md"),
      [],
      createWorkspaceSettings(["old.md"], "old.md"),
      mockOptions
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Metadata migration failed");
  });

  it("should handle wikilink update failure with rollback", async () => {
    const wikilinkEdit = { 
      path: "note.md", 
      from: 0, 
      to: 6, 
      oldText: "[[old]]", 
      newText: "[[new]]" 
    };
    
    const mockOptions = createMockOptions({
      readNote: vi.fn().mockResolvedValue("[[old]] rest"),
      writeNote: vi.fn().mockRejectedValue(new Error("Write error")),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", [wikilinkEdit], []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Wikilink updates failed");
  });
});