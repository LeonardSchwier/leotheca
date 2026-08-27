import { describe, expect, it, vi } from "vitest";
import { getWorkspaceStats } from "./capacitorBridgeImpl";
import type { FsEntry } from "./types";

function entry(name: string, path: string, isDir = false): FsEntry {
  return { name, path, isDir };
}

describe("getWorkspaceStats (Android)", () => {
  it("counts folders, notes, and images across a nested tree", async () => {
    const listDir = vi.fn(async (path: string): Promise<FsEntry[]> => {
      if (path === "/vault") {
        return [
          entry("notes", "/vault/notes", true),
          entry("a.md", "/vault/a.md"),
          entry("photo.png", "/vault/photo.png"),
        ];
      }
      if (path === "/vault/notes") {
        return [entry("b.md", "/vault/notes/b.md")];
      }
      return [];
    });
    const readTextFile = vi.fn(async () => "one\ntwo\nthree");

    const stats = await getWorkspaceStats("/vault", { listDir, readTextFile });

    expect(stats.folderCount).toBe(1);
    expect(stats.noteCount).toBe(2);
    expect(stats.imageCount).toBe(1);
  });

  it("computes the average lines per note, and 0 with no notes at all", async () => {
    const readTextFile = vi.fn(async (path: string) => (path.endsWith("a.md") ? "one\ntwo" : "one\ntwo\nthree\nfour"));
    const listDir = vi.fn(async () => [entry("a.md", "/vault/a.md"), entry("b.md", "/vault/b.md")]);

    const stats = await getWorkspaceStats("/vault", { listDir, readTextFile });
    expect(stats.averageLinesPerNote).toBe(3); // (2 + 4) / 2

    const emptyStats = await getWorkspaceStats("/empty", {
      listDir: vi.fn(async () => []),
      readTextFile: vi.fn(),
    });
    expect(emptyStats.averageLinesPerNote).toBe(0);
    expect(emptyStats.noteCount).toBe(0);
  });

  it("never has more than a bounded number of note reads in flight at once", async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/vault/note-${i}.md`);
    const listDir = vi.fn(async () => paths.map((path, i) => entry(`note-${i}.md`, path)));

    let inFlight = 0;
    let maxInFlight = 0;
    const readTextFile = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return "";
    });

    await getWorkspaceStats("/vault", { listDir, readTextFile });

    // Loosely bounded (not coupled to the exact concurrency constant): just
    // confirming this doesn't dispatch all 20 reads at once the way the
    // pre-fix sequential walk effectively did (maxInFlight === 1 there).
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
