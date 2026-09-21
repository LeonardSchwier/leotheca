import { describe, expect, it, vi } from "vitest";

const { saveImpl } = vi.hoisted(() => ({ saveImpl: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: saveImpl,
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({ appConfigDir: vi.fn(), join: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { pickHtmlExportPath } from "./tauriBridgeImpl";

describe("pickHtmlExportPath", () => {
  it("opens a Save dialog defaulting to the given file name, filtered to .html", async () => {
    saveImpl.mockResolvedValueOnce("/home/user/Desktop/My Note.html");

    const result = await pickHtmlExportPath("My Note.html");

    expect(saveImpl).toHaveBeenCalledWith({
      defaultPath: "My Note.html",
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    expect(result).toBe("/home/user/Desktop/My Note.html");
  });

  it("returns null when the user cancels the dialog", async () => {
    saveImpl.mockResolvedValueOnce(null);

    const result = await pickHtmlExportPath("My Note.html");

    expect(result).toBeNull();
  });
});
