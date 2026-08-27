import { describe, expect, it } from "vitest";
import { isImagePath } from "./types";

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
