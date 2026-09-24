import { describe, expect, it, vi } from "vitest";

const { saveImpl, openImpl } = vi.hoisted(() => ({ saveImpl: vi.fn(), openImpl: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openImpl,
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
import {
  exportTextFileViaDialog,
  pickHtmlExportPath,
  pickMarkdownFileToOpen,
  setActiveWorkspaceRoot,
} from "./tauriBridgeImpl";

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

describe("pickMarkdownFileToOpen", () => {
  it("opens a file dialog filtered to .md, single-select", async () => {
    openImpl.mockResolvedValueOnce("/home/user/Documents/scratch-note.md");

    const result = await pickMarkdownFileToOpen();

    expect(openImpl).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    expect(result).toBe("/home/user/Documents/scratch-note.md");
  });

  it("returns null when the user cancels the dialog", async () => {
    openImpl.mockResolvedValueOnce(null);

    const result = await pickMarkdownFileToOpen();

    expect(result).toBeNull();
  });

  it("returns the first entry when the underlying dialog resolves an array", async () => {
    openImpl.mockResolvedValueOnce(["/home/user/Documents/first.md", "/home/user/Documents/second.md"]);

    const result = await pickMarkdownFileToOpen();

    expect(result).toBe("/home/user/Documents/first.md");
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
