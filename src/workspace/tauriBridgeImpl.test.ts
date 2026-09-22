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

import { invoke } from "@tauri-apps/api/core";
import { exportTextFileViaDialog, pickHtmlExportPath, setActiveWorkspaceRoot } from "./tauriBridgeImpl";

const invokeMock = vi.mocked(invoke);

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

describe("exportTextFileViaDialog", () => {
  it("invokes the combined native dialog-and-write command with the default name and contents", async () => {
    invokeMock.mockResolvedValueOnce(true);

    const result = await exportTextFileViaDialog("My Note.html", "<html></html>");

    expect(invokeMock).toHaveBeenCalledWith("export_text_file_via_dialog", {
      defaultFileName: "My Note.html",
      contents: "<html></html>",
    });
    expect(result).toBe(true);
  });

  it("resolves false when the native command reports the user cancelled", async () => {
    invokeMock.mockResolvedValueOnce(false);

    const result = await exportTextFileViaDialog("My Note.html", "<html></html>");

    expect(result).toBe(false);
  });
});

describe("setActiveWorkspaceRoot", () => {
  it("invokes the native command with the given path", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setActiveWorkspaceRoot("/home/user/vault");

    expect(invokeMock).toHaveBeenCalledWith("set_active_workspace_root", {
      path: "/home/user/vault",
    });
  });

  it("invokes the native command with null to clear it", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setActiveWorkspaceRoot(null);

    expect(invokeMock).toHaveBeenCalledWith("set_active_workspace_root", { path: null });
  });
});
