import { describe, expect, it, vi } from "vitest";
import { bytesToBase64, findAllFiles, findMarkdownFiles, getWorkspaceStats } from "./capacitorBridgeImpl";

interface NativeMarkdownFile {
  relativePath: string;
  uri: string;
  mtime?: number;
}

function walkResult(overrides: {
  markdownFiles?: NativeMarkdownFile[];
  folderCount?: number;
  imageCount?: number;
} = {}) {
  return { markdownFiles: [], folderCount: 0, imageCount: 0, ...overrides };
}

describe("findMarkdownFiles (Android)", () => {
  it("prefixes each discovered file's relative path with the walked root", async () => {
    const walk = vi.fn(async () =>
      walkResult({
        markdownFiles: [
          { relativePath: "a.md", uri: "content://a" },
          { relativePath: "notes/b.md", uri: "content://b", mtime: 1234 },
        ],
      }),
    );

    const files = await findMarkdownFiles("/vault", { walk });

    expect(files).toEqual([
      { name: "a.md", path: "/vault/a.md", isDir: false },
      { name: "b.md", path: "/vault/notes/b.md", isDir: false, mtime: 1234 },
    ]);
  });

  it("returns an empty list for a workspace with no markdown files", async () => {
    const walk = vi.fn(async () => walkResult());

    expect(await findMarkdownFiles("/vault", { walk })).toEqual([]);
  });
});

describe("findAllFiles (Android)", () => {
  it("prefixes each discovered file's relative path with the walked root, any extension", async () => {
    const walk = vi.fn(async () => ({
      files: [
        { relativePath: "a.md", uri: "content://a" },
        { relativePath: "attachments/photo.png", uri: "content://photo", mtime: 1234 },
      ],
    }));

    const files = await findAllFiles("/vault", { walk });

    expect(files).toEqual([
      { name: "a.md", path: "/vault/a.md", isDir: false },
      { name: "photo.png", path: "/vault/attachments/photo.png", isDir: false, mtime: 1234 },
    ]);
  });

  it("returns an empty list for an empty workspace", async () => {
    const walk = vi.fn(async () => ({ files: [] }));

    expect(await findAllFiles("/vault", { walk })).toEqual([]);
  });
});

describe("getWorkspaceStats (Android)", () => {
  it("counts folders, notes, and images from a single native walk", async () => {
    const walk = vi.fn(async () =>
      walkResult({
        markdownFiles: [
          { relativePath: "a.md", uri: "content://a" },
          { relativePath: "notes/b.md", uri: "content://b" },
        ],
        folderCount: 1,
        imageCount: 1,
      }),
    );
    const readTextFile = vi.fn(async () => "one\ntwo\nthree");

    const stats = await getWorkspaceStats("/vault", { walk, readTextFile });

    expect(stats.folderCount).toBe(1);
    expect(stats.noteCount).toBe(2);
    expect(stats.imageCount).toBe(1);
  });

  it("reads each note's content by its full workspace-relative path", async () => {
    const walk = vi.fn(async () => walkResult({ markdownFiles: [{ relativePath: "notes/a.md", uri: "x" }] }));
    const readTextFile = vi.fn(async () => "one\ntwo");

    await getWorkspaceStats("/vault", { walk, readTextFile });

    expect(readTextFile).toHaveBeenCalledWith("/vault/notes/a.md");
  });

  it("computes the average lines per note, and 0 with no notes at all", async () => {
    const readTextFile = vi.fn(async (path: string) => (path.endsWith("a.md") ? "one\ntwo" : "one\ntwo\nthree\nfour"));
    const walk = vi.fn(async () =>
      walkResult({
        markdownFiles: [
          { relativePath: "a.md", uri: "1" },
          { relativePath: "b.md", uri: "2" },
        ],
      }),
    );

    const stats = await getWorkspaceStats("/vault", { walk, readTextFile });
    expect(stats.averageLinesPerNote).toBe(3); // (2 + 4) / 2

    const emptyStats = await getWorkspaceStats("/empty", {
      walk: vi.fn(async () => walkResult()),
      readTextFile: vi.fn(),
    });
    expect(emptyStats.averageLinesPerNote).toBe(0);
    expect(emptyStats.noteCount).toBe(0);
  });

  it("never has more than a bounded number of note reads in flight at once", async () => {
    const markdownFiles = Array.from({ length: 20 }, (_, i) => ({ relativePath: `note-${i}.md`, uri: `${i}` }));
    const walk = vi.fn(async () => walkResult({ markdownFiles }));

    let inFlight = 0;
    let maxInFlight = 0;
    const readTextFile = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return "";
    });

    await getWorkspaceStats("/vault", { walk, readTextFile });

    // Loosely bounded (not coupled to the exact concurrency constant): just
    // confirming this doesn't dispatch all 20 reads at once.
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

/** Decodes base64 back to bytes via the platform's own atob, an
 * independent implementation from bytesToBase64 under test, so a
 * round-trip genuinely exercises correctness rather than checking the
 * function against itself. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe("bytesToBase64", () => {
  it("encodes an empty buffer as an empty string", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("matches a known base64 encoding for a small buffer", () => {
    const bytes = new TextEncoder().encode("Hello, world! This is a paste-image test.");
    expect(bytesToBase64(bytes)).toBe("SGVsbG8sIHdvcmxkISBUaGlzIGlzIGEgcGFzdGUtaW1hZ2UgdGVzdC4=");
  });

  it("round-trips a buffer exactly at the chunk boundary (0x8000 bytes)", () => {
    const bytes = new Uint8Array(0x8000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips a buffer spanning multiple chunks with an uneven remainder", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 137);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
