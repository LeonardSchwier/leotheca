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
  // Reads through the native `pick_and_read_external_markdown_file`
  // command -- which shows the dialog and reads the picked file in the
  // same trusted Rust call -- rather than the dialog plugin directly:
  // `read_text_file`/`read_binary_file` are scoped to the active
  // workspace root and app config directory only (2026-09-22 security
  // review), so a bare path returned here for a second, separately gated
  // call to fetch content through could never work for a real file
  // outside the workspace, exactly this feature's whole purpose. See
  // `external_open.rs`'s `ExternalMarkdownFile` doc comment.
  it("invokes the native pick-and-read command and returns its path and content", async () => {
    invokeMock.mockResolvedValueOnce({
      path: "/home/user/Documents/scratch-note.md",
      content: "# scratch",
    });

    const result = await pickMarkdownFileToOpen();

    expect(invokeMock).toHaveBeenCalledWith("pick_and_read_external_markdown_file");
    expect(result).toEqual({
      path: "/home/user/Documents/scratch-note.md",
      content: "# scratch",
    });
  });

  it("returns null when the user cancels the dialog", async () => {
    invokeMock.mockResolvedValueOnce(null);

    const result = await pickMarkdownFileToOpen();

    expect(result).toBeNull();
  });

  it("returns null, rather than rejecting, when the native command errors (e.g. a real read failure after a genuine pick)", async () => {
    invokeMock.mockRejectedValueOnce(new Error("permission denied"));

    const result = await pickMarkdownFileToOpen();

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
