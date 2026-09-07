/**
 * Tests for F05 capture commit functionality
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

describe("appendToInboxNote", () => {
  // Mock the tauri bridge functions at module level
  const mockReadTextFile = vi.fn();
  const mockWriteTextFile = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockReadTextFile.mockReset();
    mockWriteTextFile.mockReset();
  });

  it("creates a new inbox note when file doesn't exist", async () => {
    // Mock readTextFile to throw (file doesn't exist)
    mockReadTextFile.mockRejectedValue(new Error("File not found"));
    mockWriteTextFile.mockResolvedValue(undefined);

    // Need to set up the module with mocks
    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { appendToInboxNote } = await import("./captureCommit");

    const result = await appendToInboxNote({
      inboxNotePath: "/workspace/Inbox.md",
      content: "Test capture content"
    });

    expect(result.path).toBe("/workspace/Inbox.md");
    expect(result.name).toBe("Inbox.md");
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining("### 2026") // Should contain formatted timestamp
    );
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining("Test capture content")
    );
  });

  it("appends to existing inbox note with LF line endings", async () => {
    const existingContent = "# Inbox\n\nSome existing content";
    mockReadTextFile.mockResolvedValue(existingContent);
    mockWriteTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { appendToInboxNote } = await import("./captureCommit");

    const result = await appendToInboxNote({
      inboxNotePath: "/workspace/Inbox.md",
      content: "New capture content"
    });

    expect(result.path).toBe("/workspace/Inbox.md");
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining(existingContent)
    );
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining("New capture content")
    );
  });

  it("appends to existing inbox note with CRLF line endings", async () => {
    const existingContent = "# Inbox\r\n\r\nSome existing content";
    mockReadTextFile.mockResolvedValue(existingContent);
    mockWriteTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { appendToInboxNote } = await import("./captureCommit");

    const result = await appendToInboxNote({
      inboxNotePath: "/workspace/Inbox.md",
      content: "New capture content"
    });

    expect(result.path).toBe("/workspace/Inbox.md");
    // Should preserve CRLF line endings
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining("\r\n")
    );
  });

  it("handles empty existing content", async () => {
    const existingContent = "";
    mockReadTextFile.mockResolvedValue(existingContent);
    mockWriteTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { appendToInboxNote } = await import("./captureCommit");

    const result = await appendToInboxNote({
      inboxNotePath: "/workspace/Inbox.md",
      content: "First capture"
    });

    expect(result.path).toBe("/workspace/Inbox.md");
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining("First capture")
    );
    // Should not have leading blank lines for empty files
    expect(mockWriteTextFile.mock.calls[0][1]).not.toMatch(/^\n\n/);
  });

  it("handles whitespace-only existing content", async () => {
    const existingContent = "   \n\n  \t\n";
    mockReadTextFile.mockResolvedValue(existingContent);
    mockWriteTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { appendToInboxNote } = await import("./captureCommit");

    const result = await appendToInboxNote({
      inboxNotePath: "/workspace/Inbox.md",
      content: "First real capture"
    });

    expect(result.path).toBe("/workspace/Inbox.md");
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/workspace/Inbox.md",
      expect.stringContaining("First real capture")
    );
  });

  it("F05-AC-25: never logs a raw error when copying an attachment fails", async () => {
    // A provider exception surfacing a real content:// URI/path is exactly the
    // caller-controlled data F05 acceptance criterion 25 forbids in logs.
    // Placed last in this file: it needs a wider mock export shape than the
    // "../workspace/tauriBridge" mocks above, and vi.resetModules() (needed to
    // pick that shape up cleanly) would otherwise leave later tests bound to
    // this test's own mock functions instead of their own.
    const sensitiveMessage = "content://com.other.app/document/999: permission denied for /private/vault/path";
    const mockListDir = vi.fn().mockResolvedValue([]);
    const mockCreateWorkspaceTextFileNew = vi.fn().mockResolvedValue(undefined);
    const mockWriteBinaryFile = vi.fn().mockResolvedValue(undefined);
    const mockBridgeReadTextFile = vi.fn().mockRejectedValue(new Error(sensitiveMessage));

    vi.resetModules();
    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockBridgeReadTextFile,
      writeTextFile: vi.fn(),
      listDir: mockListDir,
      createWorkspaceTextFileNew: mockCreateWorkspaceTextFileNew,
      writeBinaryFile: mockWriteBinaryFile,
    }));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createNoteWithTitle } = await import("./captureCommit");

    const result = await createNoteWithTitle(
      "/workspace",
      "Captured text",
      "Note title",
      "/workspace",
      [
        {
          id: "att-1",
          filePath: "/app-private/staging/att-1.jpg",
          fileName: "photo.jpg",
          fileSize: 1024,
          fingerprint: "irrelevant",
          mimeType: "image/jpeg",
        },
      ]
    );

    // The note is still created; the failing attachment is skipped, not fatal.
    expect(result.name).toBe("Note title.md");
    expect(mockCreateWorkspaceTextFileNew).toHaveBeenCalled();

    const allLoggedArgs = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat();
    for (const arg of allLoggedArgs) {
      expect(arg).not.toBeInstanceOf(Error);
      if (typeof arg === "string") {
        expect(arg).not.toContain(sensitiveMessage);
        expect(arg).not.toContain("content://");
      }
    }

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});