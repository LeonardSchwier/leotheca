import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  attachmentFileName,
  attachmentSaveDir,
  attachmentsInsertText,
  saveAttachment,
} from "./attachments";
import { writeWorkspaceBinaryFile } from "../workspace/tauriBridge";

vi.mock("../workspace/tauriBridge", () => ({
  writeWorkspaceBinaryFile: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(writeWorkspaceBinaryFile).mockClear();
  vi.spyOn(Math, "random").mockReturnValue(0.123456789);
});

describe("attachmentFileName", () => {
  it("uses the Pasted image convention with a known mime extension when there is no real name", () => {
    expect(attachmentFileName("image/png", 1700000000000)).toBe(
      "Pasted image 1700000000000-4fzzzx.png",
    );
  });

  it("maps common image mime types to their conventional extension", () => {
    expect(attachmentFileName("image/jpeg", 1)).toMatch(/\.jpg$/);
    expect(attachmentFileName("image/gif", 1)).toMatch(/\.gif$/);
    expect(attachmentFileName("image/webp", 1)).toMatch(/\.webp$/);
    expect(attachmentFileName("image/svg+xml", 1)).toMatch(/\.svg$/);
  });

  it("falls back to png for an unrecognized mime type", () => {
    expect(attachmentFileName("application/octet-stream", 1)).toMatch(/\.png$/);
  });

  it("treats a bare 'image' or 'image.<ext>' original name as not meaningful", () => {
    expect(attachmentFileName("image/png", 1, "image")).toMatch(
      /^Pasted image /,
    );
    expect(attachmentFileName("image/png", 1, "image.png")).toMatch(
      /^Pasted image /,
    );
  });

  it("preserves a real dropped file name, inserting the suffix before the extension", () => {
    expect(attachmentFileName("image/png", 1, "vacation-photo.png")).toBe(
      "vacation-photo-4fzzzx.png",
    );
  });

  it("appends the suffix directly when the real name has no extension", () => {
    expect(attachmentFileName("image/png", 1, "diagram")).toBe(
      "diagram-4fzzzx",
    );
  });

  it("sanitizes path-separator-like characters out of a real file name", () => {
    expect(attachmentFileName("image/png", 1, "a/b:c.png")).toBe(
      "a-b-c-4fzzzx.png",
    );
  });

  it("produces different names on repeated calls (random suffix)", () => {
    vi.spyOn(Math, "random").mockRestore();
    const names = new Set(
      Array.from({ length: 20 }, () => attachmentFileName("image/png", 1)),
    );
    expect(names.size).toBe(20);
  });
});

describe("attachmentSaveDir", () => {
  it("resolves next to the note when no attachments folder is configured", () => {
    expect(attachmentSaveDir("/vault", "/vault/notes/today.md", "")).toBe(
      "/vault/notes",
    );
  });

  it("resolves next to the note when the attachments folder is only whitespace", () => {
    expect(attachmentSaveDir("/vault", "/vault/notes/today.md", "   ")).toBe(
      "/vault/notes",
    );
  });

  it("resolves under the workspace root when an attachments folder is configured", () => {
    expect(
      attachmentSaveDir("/vault", "/vault/notes/today.md", "attachments"),
    ).toBe("/vault/attachments");
  });

  it("trims leading and trailing slashes from the configured folder", () => {
    expect(
      attachmentSaveDir("/vault", "/vault/notes/today.md", "/attachments/"),
    ).toBe("/vault/attachments");
  });

  it("supports a nested attachments folder", () => {
    expect(
      attachmentSaveDir("/vault", "/vault/notes/today.md", "assets/images"),
    ).toBe("/vault/assets/images");
  });

  it("ignores the note's own location once a folder is configured", () => {
    expect(
      attachmentSaveDir("/vault", "/vault/deep/nested/today.md", "attachments"),
    ).toBe("/vault/attachments");
  });
});

describe("saveAttachment", () => {
  it("writes to the resolved save directory and returns a note-relative link", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const relative = await saveAttachment({
      bytes,
      mimeType: "image/png",
      notePath: "/vault/notes/today.md",
      workspaceRoot: "/vault",
      attachmentsFolder: "",
      now: 1700000000000,
    });

    expect(writeWorkspaceBinaryFile).toHaveBeenCalledWith(
      "/vault",
      "notes/Pasted image 1700000000000-4fzzzx.png",
      bytes,
    );
    expect(relative).toBe("Pasted image 1700000000000-4fzzzx.png");
  });

  it("returns a relative link that climbs out to a configured attachments folder", async () => {
    const relative = await saveAttachment({
      bytes: new Uint8Array(),
      mimeType: "image/png",
      notePath: "/vault/notes/sub/today.md",
      workspaceRoot: "/vault",
      attachmentsFolder: "attachments",
      now: 1,
    });

    expect(relative).toBe("../../attachments/Pasted image 1-4fzzzx.png");
  });

  it("preserves a real dropped file's own name in the returned link", async () => {
    const relative = await saveAttachment({
      bytes: new Uint8Array(),
      mimeType: "image/jpeg",
      notePath: "/vault/notes/today.md",
      workspaceRoot: "/vault",
      attachmentsFolder: "",
      now: 1,
      originalName: "photo.jpg",
    });

    expect(relative).toBe("photo-4fzzzx.jpg");
  });
});

describe("attachmentsInsertText", () => {
  const context = {
    notePath: "/vault/notes/today.md",
    workspaceRoot: "/vault",
    attachmentsFolder: "",
    now: 1,
  };

  it("returns a single markdown image line for one pasted file", async () => {
    const text = await attachmentsInsertText(
      [{ bytes: new Uint8Array(), mimeType: "image/png" }],
      context,
    );
    expect(text).toBe("![](Pasted image 1-4fzzzx.png)");
  });

  it("joins multiple dropped files, one per line, in the given order", async () => {
    const text = await attachmentsInsertText(
      [
        {
          bytes: new Uint8Array(),
          mimeType: "image/png",
          originalName: "first.png",
        },
        {
          bytes: new Uint8Array(),
          mimeType: "image/jpeg",
          originalName: "second.jpg",
        },
      ],
      context,
    );
    expect(text).toBe("![](first-4fzzzx.png)\n![](second-4fzzzx.jpg)");
  });

  it("saves every file before returning, not just the first", async () => {
    await attachmentsInsertText(
      [
        {
          bytes: new Uint8Array([1]),
          mimeType: "image/png",
          originalName: "a.png",
        },
        {
          bytes: new Uint8Array([2]),
          mimeType: "image/png",
          originalName: "b.png",
        },
      ],
      context,
    );
    expect(writeWorkspaceBinaryFile).toHaveBeenCalledTimes(2);
  });

  it("returns an empty string for an empty file list", async () => {
    expect(await attachmentsInsertText([], context)).toBe("");
    expect(writeWorkspaceBinaryFile).not.toHaveBeenCalled();
  });
});
