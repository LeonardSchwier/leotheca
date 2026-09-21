import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyCustomCss, removeCustomCss } from "./customCss";
import { readTextFile } from "../workspace/tauriBridge";
import { isPathWithinWorkspace, resolvePath } from "../workspace/paths";

// Mock the dependencies
vi.mock("../workspace/tauriBridge", () => ({
  readTextFile: vi.fn(),
}));

vi.mock("../workspace/paths", () => ({
  isPathWithinWorkspace: vi.fn(),
  resolvePath: vi.fn(),
}));

describe("applyCustomCss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePath).mockImplementation((p, ws) => ws + "/" + p);
    // Clean up any existing style tag
    const existing = document.getElementById("leotheca-custom-css");
    if (existing) {
      existing.remove();
    }
  });

  it("applies custom CSS when the file exists and is within the workspace", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(true);
    vi.mocked(readTextFile).mockResolvedValue("body { background: #fff; }");

    const result = await applyCustomCss("/workspace", ".leotheca/custom.css");

    expect(result).toBe(true);
    const style = document.getElementById("leotheca-custom-css");
    expect(style).not.toBeNull();
    expect(style?.textContent).toBe("body { background: #fff; }");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/.leotheca/custom.css");
  });

  it("returns false when the file is outside the workspace", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(false);
    vi.mocked(readTextFile).mockResolvedValue("body { background: #fff; }");

    const result = await applyCustomCss("/workspace", "../evil.css");

    expect(result).toBe(false);
    const style = document.getElementById("leotheca-custom-css");
    expect(style).toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("resolves a relative custom.css path to an absolute path before validation", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(true);
    vi.mocked(readTextFile).mockResolvedValue("body { background: #fff; }");

    const result = await applyCustomCss("/workspace", ".leotheca/custom.css");

    expect(result).toBe(true);
    // The relative path must be resolved to an absolute path before being
    // passed to readTextFile (and isPathWithinWorkspace).
    expect(readTextFile).toHaveBeenCalledWith("/workspace/.leotheca/custom.css");
  });

  it("returns false when the file is missing", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(true);
    vi.mocked(readTextFile).mockRejectedValue(new Error("File not found"));

    const result = await applyCustomCss("/workspace", ".leotheca/custom.css");

    expect(result).toBe(false);
    const style = document.getElementById("leotheca-custom-css");
    expect(style).toBeNull();
  });

  it("returns false when the CSS file is empty", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(true);
    vi.mocked(readTextFile).mockResolvedValue("   \n  ");

    const result = await applyCustomCss("/workspace", ".leotheca/custom.css");

    expect(result).toBe(false);
    const style = document.getElementById("leotheca-custom-css");
    expect(style).toBeNull();
  });

  it("replaces existing custom CSS when called again", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(true);
    vi.mocked(readTextFile)
      .mockResolvedValueOnce("body { color: red; }")
      .mockResolvedValueOnce("body { color: blue; }");

    await applyCustomCss("/workspace", ".leotheca/custom.css");
    let style = document.getElementById("leotheca-custom-css");
    expect(style?.textContent).toBe("body { color: red; }");

    await applyCustomCss("/workspace", ".leotheca/custom.css");
    style = document.getElementById("leotheca-custom-css");
    expect(style?.textContent).toBe("body { color: blue; }");
  });
});

describe("removeCustomCss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePath).mockImplementation((p, ws) => ws + "/" + p);
  });

  it("removes the custom CSS style tag", async () => {
    vi.mocked(isPathWithinWorkspace).mockReturnValue(true);
    vi.mocked(readTextFile).mockResolvedValue("body { color: red; }");

    await applyCustomCss("/workspace", ".leotheca/custom.css");
    expect(document.getElementById("leotheca-custom-css")).not.toBeNull();

    removeCustomCss();
    expect(document.getElementById("leotheca-custom-css")).toBeNull();
  });

  it("does nothing if no custom CSS is present", () => {
    removeCustomCss();
    expect(document.getElementById("leotheca-custom-css")).toBeNull();
  });
});
