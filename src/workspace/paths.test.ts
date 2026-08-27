import { describe, expect, it } from "vitest";
import { relativePathBetween, resolvePath } from "./paths";

describe("resolvePath", () => {
  it("resolves a plain relative target against the base directory", () => {
    expect(resolvePath("/vault/notes", "image.png")).toBe("/vault/notes/image.png");
  });

  it("resolves a target that climbs out of the base directory with ..", () => {
    expect(resolvePath("/vault/notes", "../attachments/image.png")).toBe(
      "/vault/attachments/image.png",
    );
  });

  it("treats a leading ./ as a no-op", () => {
    expect(resolvePath("/vault/notes", "./sub/image.png")).toBe("/vault/notes/sub/image.png");
  });

  it("returns an already-absolute target untouched", () => {
    expect(resolvePath("/vault/notes", "/elsewhere/image.png")).toBe("/elsewhere/image.png");
  });

  it("does not climb above the root when .. is used too many times", () => {
    expect(resolvePath("/vault", "../../image.png")).toBe("/image.png");
  });

  it("collapses repeated slashes and trailing segments", () => {
    expect(resolvePath("/vault/notes/", "sub/../image.png")).toBe("/vault/notes/image.png");
  });
});

describe("relativePathBetween", () => {
  it("returns a bare file name for a file in the same directory", () => {
    expect(relativePathBetween("/vault/notes", "/vault/notes/image.png")).toBe("image.png");
  });

  it("climbs up and back down for a sibling directory", () => {
    expect(relativePathBetween("/vault/notes/sub", "/vault/attachments/image.png")).toBe(
      "../../attachments/image.png",
    );
  });

  it("descends into a child directory without climbing", () => {
    expect(relativePathBetween("/vault", "/vault/attachments/image.png")).toBe(
      "attachments/image.png",
    );
  });

  it("round-trips through resolvePath", () => {
    const fromDir = "/vault/notes/deep/nested";
    const toPath = "/vault/attachments/pasted/image.png";
    const relative = relativePathBetween(fromDir, toPath);
    expect(resolvePath(fromDir, relative)).toBe(toPath);
  });

  it("returns a single dot when both paths resolve to the same directory", () => {
    expect(relativePathBetween("/vault/notes", "/vault/notes")).toBe(".");
  });
});
