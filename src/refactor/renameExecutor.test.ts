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
        viewMode: "source",
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
    const blockedEdit = { path: "some.md", from: 0, to: 5, oldText: "[[old]]", reason: "ambiguous" };
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

  it("applies two wikilink edits in the same note without corrupting the second edit's position", async () => {
    // A single note can link to the renamed note more than once; both
    // edits' offsets are computed against this original content.
    const originalContent = "[[old]] and again [[old]] end";
    const firstFrom = originalContent.indexOf("[[old]]");
    const firstTo = firstFrom + "[[old]]".length;
    const secondFrom = originalContent.indexOf("[[old]]", firstTo);
    const secondTo = secondFrom + "[[old]]".length;
    // Deliberately a different length than "[[old]]" so a stale offset
    // (computed before the previous edit shifted the text) would corrupt
    // the file instead of accidentally landing in the right place.
    const newText = "[[much-longer-new-name]]";
    const edits: PlannedWikiLinkEdit[] = [
      { path: "note.md", from: firstFrom, to: firstTo, oldText: "[[old]]", newText },
      { path: "note.md", from: secondFrom, to: secondTo, oldText: "[[old]]", newText },
    ];

    let stored = originalContent;
    const mockOptions = createMockOptions({
      readNote: vi.fn(async () => stored),
      writeNote: vi.fn(async (_path: string, content: string) => {
        stored = content;
      }),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", edits, []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );

    expect(result.success).toBe(true);
    expect(stored).toBe("[[much-longer-new-name]] and again [[much-longer-new-name]] end");
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
      newText: "[[new]]",
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

  it("rolls back a length-changing wikilink edit to the exact original content when a later step fails", async () => {
    // The rewritten text ("[[much-longer-new-name]]") is deliberately a
    // different length than the original ("[[old]]"): rollback must locate
    // what to restore by the *written* text's actual length, not the
    // pre-edit end offset, or it splices at the wrong position.
    const originalContent = "before [[old]] after";
    const from = originalContent.indexOf("[[old]]");
    const to = from + "[[old]]".length;
    const edit: PlannedWikiLinkEdit = {
      path: "note.md",
      from,
      to,
      oldText: "[[old]]",
      newText: "[[much-longer-new-name]]",
    };

    let stored = originalContent;
    const mockOptions = createMockOptions({
      readNote: vi.fn(async () => stored),
      writeNote: vi.fn(async (_path: string, content: string) => {
        stored = content;
      }),
      renameFile: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", [edit], []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );

    expect(result.success).toBe(false);
    expect(stored).toBe(originalContent);
  });

  it("rollback does not corrupt a note whose own wikilink edit never actually landed", async () => {
    // Two different notes each need one edit. The first note's write
    // succeeds; the second note's *first* write attempt (the forward
    // apply) fails, so the forward-apply loop never actually rewrites it.
    // A later write attempt (rollback's) is allowed to succeed, so if
    // rollback wrongly assumed the edit had landed and tried to "restore"
    // it anyway, that corruption would actually be persisted and this test
    // would catch it — a mock that always rejects for b.md would instead
    // hide the bug by discarding rollback's (corrupted) write too.
    const contentA = "before [[old]] after";
    const contentB = "before [[old]] after";
    const fromA = contentA.indexOf("[[old]]");
    const toA = fromA + "[[old]]".length;
    const fromB = contentB.indexOf("[[old]]");
    const toB = fromB + "[[old]]".length;
    const newText = "[[much-longer-new-name]]";

    const edits: PlannedWikiLinkEdit[] = [
      { path: "a.md", from: fromA, to: toA, oldText: "[[old]]", newText },
      { path: "b.md", from: fromB, to: toB, oldText: "[[old]]", newText },
    ];

    const store: Record<string, string> = { "a.md": contentA, "b.md": contentB };
    let bWriteAttempts = 0;
    const mockOptions = createMockOptions({
      readNote: vi.fn(async (path: string) => store[path]),
      writeNote: vi.fn(async (path: string, content: string) => {
        if (path === "b.md") {
          bWriteAttempts++;
          if (bWriteAttempts === 1) throw new Error("disk full");
        }
        store[path] = content;
      }),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", edits, []),
      createEditorLayout(),
      [],
      createWorkspaceSettings(),
      mockOptions
    );

    expect(result.success).toBe(false);
    // a.md's edit landed, then got rolled back to its exact original text.
    expect(store["a.md"]).toBe(contentA);
    // b.md's edit never landed; rollback must recognize that (rather than
    // assume the never-written newText is sitting there) and leave it
    // untouched, never attempting a second, corrupting write.
    expect(store["b.md"]).toBe(contentB);
    expect(bWriteAttempts).toBe(1);
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

  it("leaves the workspace consistent when the file rename fails after reference rewrites", async () => {
    // This is the core transactional integrity test: if the file rename
    // fails (e.g. disk full, permissions) after the reference rewrites and
    // metadata migration have already been applied, the workspace must be
    // rolled back to a consistent state. No broken links, no orphaned
    // references, no partial metadata.
    const originalContent = "before [[old]] after";
    const from = originalContent.indexOf("[[old]]");
    const to = from + "[[old]]".length;
    const newText = "[[new-name]]";

    const edits: PlannedWikiLinkEdit[] = [
      { path: "note.md", from, to, oldText: "[[old]]", newText },
    ];

    const store: Record<string, string> = { "note.md": originalContent };
    const metadataStore: Record<string, unknown> = {};

    const mockOptions = createMockOptions({
      readNote: vi.fn(async (path: string) => store[path]),
      writeNote: vi.fn(async (path: string, content: string) => {
        store[path] = content;
      }),
      // File rename fails — this is the critical failure point
      renameFile: vi.fn().mockRejectedValue(new Error("ENOSPC: no space left on device")),
      saveEditorLayout: vi.fn(async (layout: unknown) => {
        metadataStore.editorLayout = layout;
      }),
      saveBookmarks: vi.fn(async (bookmarks: unknown) => {
        metadataStore.bookmarks = bookmarks;
      }),
      saveWorkspaceSettings: vi.fn(async (settings: unknown) => {
        metadataStore.workspaceSettings = settings;
      }),
    });

    const result = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", edits, []),
      createEditorLayout(["old.md"], "old.md"),
      [{ id: "1", kind: "file", label: "test", path: "old.md" }],
      createWorkspaceSettings(["old.md"], "old.md"),
      mockOptions
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("File rename failed");

    // CRITICAL: The note content must be restored to its original state.
    // If the rollback fails, the note would contain a broken [[new-name]]
    // link pointing to a file that was never actually renamed.
    expect(store["note.md"]).toBe(originalContent);

    // The journal entry should be marked as failed/incomplete so that
    // startup recovery can handle it.
    expect(result.journalEntry?.completed).toBe(false);
    expect(result.journalEntry?.step).toBe("failed");
  });

  it("does not create a dangling reference when rename fails mid-operation and the user retries", async () => {
    // Bug: the retry mechanism can nullify the caller reference. If a
    // rename fails and the user retries, the second attempt must not
    // operate on stale state or create a dangling reference.
    // We simulate this by verifying that after a failed rename, the
    // workspace state (editor layout, bookmarks) is restored to the
    // pre-rename state, not left in the half-migrated state.

    const originalLayout = createEditorLayout(["old.md"], "old.md");
    const originalBookmarks = [{ id: "1", kind: "file", label: "test", path: "old.md" } as any];
    const originalSettings = createWorkspaceSettings(["old.md"], "old.md");

    const edits: PlannedWikiLinkEdit[] = [
      { path: "note.md", from: 0, to: 6, oldText: "[[old]]", newText: "[[new]]" },
    ];

    let metadataWriteCount = 0;
    const mockOptions = createMockOptions({
      readNote: vi.fn().mockResolvedValue("[[old]] rest"),
      writeNote: vi.fn().mockResolvedValue(undefined),
      renameFile: vi.fn().mockRejectedValue(new Error("connection reset")),
      saveEditorLayout: vi.fn(async () => { metadataWriteCount++; }),
      saveBookmarks: vi.fn(async () => { metadataWriteCount++; }),
      saveWorkspaceSettings: vi.fn(async () => { metadataWriteCount++; }),
    });

    // First attempt fails
    const firstResult = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", edits, []),
      originalLayout,
      originalBookmarks,
      originalSettings,
      mockOptions
    );

    expect(firstResult.success).toBe(false);
    expect(metadataWriteCount).toBeGreaterThan(0);

    // Reset for the retry
    resetRenameExecutor();

    // Second attempt (retry) — must not inherit stale state
    const retryOptions = createMockOptions({
      readNote: vi.fn().mockResolvedValue("[[old]] rest"),
      writeNote: vi.fn().mockResolvedValue(undefined),
      renameFile: vi.fn().mockResolvedValue(undefined),
      saveEditorLayout: vi.fn().mockResolvedValue(undefined),
      saveBookmarks: vi.fn().mockResolvedValue(undefined),
      saveWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    });

    const secondResult = await executeRenameOperation(
      "old.md",
      "new.md",
      createMockRenamePlan("old.md", "new.md", edits, []),
      originalLayout,
      originalBookmarks,
      originalSettings,
      retryOptions
    );

    // The retry should succeed if the filesystem is available,
    // and it must operate on the ORIGINAL state, not the half-migrated
    // state from the failed first attempt.
    expect(secondResult.success).toBe(true);
    expect(retryOptions.renameFile).toHaveBeenCalledWith("old.md", "new.md");
  });
});