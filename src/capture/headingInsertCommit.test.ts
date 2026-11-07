import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

describe("headingInsertCommit", () => {
  const mockReadTextFile = vi.fn();
  const mockWriteWorkspaceTextFile = vi.fn();
  const mockWriteTextFile = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reads the note, applies the insert, and writes back via workspace root", async () => {
    const original = ["## Section", "", "Old body"].join("\n");
    mockReadTextFile.mockResolvedValue(original);
    mockWriteWorkspaceTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeWorkspaceTextFile: mockWriteWorkspaceTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { headingInsertCommit } = await import("./headingInsertCommit");

    const result = await headingInsertCommit({
      path: "/ws/notes/Todo.md",
      heading: "Section",
      content: "New line",
      workspaceRoot: "/ws",
    });

    expect(mockReadTextFile).toHaveBeenCalledWith("/ws/notes/Todo.md");
    expect(mockWriteWorkspaceTextFile).toHaveBeenCalled();
    const callArgs = (mockWriteWorkspaceTextFile as unknown as Mock).mock.calls[0];
    expect(callArgs[0]).toBe("/ws");
    expect(callArgs[1]).toBe("notes/Todo.md");
    expect(callArgs[2]).toContain("New line");
    expect(result.path).toBe("/ws/notes/Todo.md");
    expect(result.name).toBe("Todo.md");
  });

  it("throws a clear error when the note does not exist", async () => {
    mockReadTextFile.mockRejectedValue(new Error("not found"));

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeWorkspaceTextFile: mockWriteWorkspaceTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { headingInsertCommit } = await import("./headingInsertCommit");

    await expect(
      headingInsertCommit({
        path: "/ws/missing.md",
        heading: "H",
        content: "X",
      }),
    ).rejects.toThrow(/note not found/);
  });

  it("propagates the 'no heading' error from insertUnderHeading", async () => {
    const original = ["## Foo", "", "Body"].join("\n");
    mockReadTextFile.mockResolvedValue(original);
    mockWriteWorkspaceTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeWorkspaceTextFile: mockWriteWorkspaceTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { headingInsertCommit } = await import("./headingInsertCommit");

    await expect(
      headingInsertCommit({
        path: "/ws/n.md",
        heading: "Bar",
        content: "X",
        workspaceRoot: "/ws",
      }),
    ).rejects.toThrow(/no heading matching "Bar"/i);
  });

  it("falls back to writeTextFile when no workspaceRoot is given", async () => {
    const original = ["## S", "", "Old"].join("\n");
    mockReadTextFile.mockResolvedValue(original);
    mockWriteTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeWorkspaceTextFile: mockWriteWorkspaceTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { headingInsertCommit } = await import("./headingInsertCommit");

    await headingInsertCommit({
      path: "/n.md",
      heading: "S",
      content: "New",
    });

    expect(mockWriteTextFile).toHaveBeenCalledWith("/n.md", expect.stringContaining("New"));
  });

  it("supports prepend position end-to-end", async () => {
    const original = ["## S", "", "Old line"].join("\n");
    mockReadTextFile.mockResolvedValue(original);
    mockWriteWorkspaceTextFile.mockResolvedValue(undefined);

    vi.doMock("../workspace/tauriBridge", () => ({
      readTextFile: mockReadTextFile,
      writeWorkspaceTextFile: mockWriteWorkspaceTextFile,
      writeTextFile: mockWriteTextFile,
    }));

    const { headingInsertCommit } = await import("./headingInsertCommit");

    await headingInsertCommit({
      path: "/ws/n.md",
      heading: "S",
      content: "New line",
      position: "prepend",
      workspaceRoot: "/ws",
    });

    const written = (mockWriteWorkspaceTextFile as unknown as Mock).mock.calls[0][2];
    const lines = written.split("\n");
    const newIdx = lines.indexOf("New line");
    const oldIdx = lines.indexOf("Old line");
    expect(newIdx).toBeLessThan(oldIdx);
  });
});
