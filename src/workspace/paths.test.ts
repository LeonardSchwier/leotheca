import { describe, expect, it } from "vitest";
import { relativePathBetween, resolvePath, resolvePathWithinWorkspace } from "./paths";

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

describe("resolvePathWithinWorkspace", () => {
  it("keeps a nested relative target inside the workspace", () => {
    expect(resolvePathWithinWorkspace("/vault", "/vault/notes", "images/cat.png")).toBe(
      "/vault/notes/images/cat.png",
    );
  });

  it("allows a sibling attachment that remains inside the workspace", () => {
    expect(resolvePathWithinWorkspace("/vault", "/vault/notes", "../attachments/cat.png")).toBe(
      "/vault/attachments/cat.png",
    );
  });

  it("rejects traversal that escapes the workspace root", () => {
    expect(resolvePathWithinWorkspace("/vault", "/vault/notes", "../../outside.png")).toBeNull();
  });

  it("uses a component boundary rather than a string prefix", () => {
    expect(resolvePathWithinWorkspace("/vault", "/vault/notes", "../../vault-other/cat.png")).toBeNull();
  });

  it("rejects an out-of-workspace base even if its target would resolve back inside", () => {
    expect(resolvePathWithinWorkspace("/vault", "/outside", "../vault/cat.png")).toBeNull();
  });

  it("rejects absolute targets before resolution", () => {
    expect(resolvePathWithinWorkspace("/vault", "/vault/notes", "/outside/cat.png")).toBeNull();
    expect(resolvePathWithinWorkspace("C:/vault", "C:/vault/notes", "D:/outside/cat.png")).toBeNull();
  });

  it("treats backslashes as separators so Windows traversal cannot escape", () => {
    expect(resolvePathWithinWorkspace("C:/vault", "C:/vault/notes", "..\\..\\outside.png")).toBeNull();
  });

  it("preserves a valid Windows-style workspace path", () => {
    expect(resolvePathWithinWorkspace("C:/vault", "C:/vault/notes", "..\\attachments\\cat.png")).toBe(
      "C:/vault/attachments/cat.png",
    );
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
