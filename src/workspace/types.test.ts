import { describe, expect, it } from "vitest";
import { classifyWorkspaceResource, isImagePath, isTextFile } from "./types";

describe("isImagePath", () => {
  it("recognizes every supported image extension", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]) {
      expect(isImagePath(`/vault/photo.${ext}`)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isImagePath("/vault/photo.PNG")).toBe(true);
    expect(isImagePath("/vault/photo.PnG")).toBe(true);
  });

  it("returns false for a markdown note", () => {
    expect(isImagePath("/vault/note.md")).toBe(false);
  });

  it("returns false for an unsupported extension", () => {
    expect(isImagePath("/vault/clip.mp4")).toBe(false);
  });

  it("returns false for a path with no extension", () => {
    expect(isImagePath("/vault/README")).toBe(false);
  });

  it("uses the last extension of a multi-dot filename", () => {
    expect(isImagePath("/vault/archive.tar.png")).toBe(true);
    expect(isImagePath("/vault/photo.png.md")).toBe(false);
  });
});

describe("isTextFile", () => {
  it("treats a hidden file with no other dot as text, same as a no-extension file", () => {
    // Regression: the ext-extraction previously produced "" for a basename
    // whose only dot leads it (".gitignore"), and `!!"" && ...` is always
    // false, so every such hidden file was misclassified as binary and
    // excluded from search content matching, unlike an equivalent
    // no-dot-at-all basename such as "README".
    expect(isTextFile("/vault/.gitignore", false)).toBe(true);
    expect(isTextFile("/vault/.env", false)).toBe(true);
    expect(isTextFile("/vault/.npmrc", false)).toBe(true);
    expect(isTextFile("/vault/.editorconfig", false)).toBe(true);
  });

  it("still excludes a known directory basename even when passed as a file", () => {
    expect(isTextFile("/vault/.git", false)).toBe(false);
    expect(isTextFile("/vault/node_modules", false)).toBe(false);
  });

  it("excludes a hidden file whose real extension is not in the whitelist", () => {
    expect(isTextFile("/vault/.env.local", false)).toBe(false);
  });

  it("still recognizes a hidden file with a known text extension", () => {
    expect(isTextFile("/vault/.config.json", false)).toBe(true);
  });

  it("returns false for a directory, regardless of name", () => {
    expect(isTextFile("/vault/.gitignore", true)).toBe(false);
    expect(isTextFile("/vault/README", true)).toBe(false);
  });

  it("still treats a plain no-extension basename as text", () => {
    expect(isTextFile("/vault/README", false)).toBe(true);
    expect(isTextFile("/vault/Makefile", false)).toBe(true);
  });

  it("still excludes a known binary extension", () => {
    expect(isTextFile("/vault/archive.zip", false)).toBe(false);
  });
});

describe("classifyWorkspaceResource", () => {
  it("uses the same case-insensitive policy for images and canvases", () => {
    expect(classifyWorkspaceResource("/vault/photo.PNG")).toBe("image");
    expect(classifyWorkspaceResource("/vault/board.CANVAS")).toBe("canvas");
    expect(classifyWorkspaceResource("/vault/note.md")).toBe("text");
  });
});
