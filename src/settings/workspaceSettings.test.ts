import { describe, expect, it, vi } from "vitest";
import {
  clamp,
  DEFAULT_WORKSPACE_SETTINGS,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
} from "./workspaceSettings";

const { readTextFile, writeTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("../workspace/tauriBridge", () => ({ readTextFile, writeTextFile }));

describe("clamp", () => {
  it("passes values already inside the range through unchanged", () => {
    expect(clamp(15, 12, 24)).toBe(15);
  });

  it("clamps values below the minimum up to it", () => {
    expect(clamp(0, 12, 24)).toBe(12);
  });

  it("clamps values above the maximum down to it", () => {
    expect(clamp(999, 12, 24)).toBe(24);
  });
});

describe("DEFAULT_WORKSPACE_SETTINGS", () => {
  it("has sane defaults that don't visibly change anything on first use", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.uiZoom).toBe(100);
    expect(DEFAULT_WORKSPACE_SETTINGS.deleteBehavior).toBe("project-trash");
    expect(DEFAULT_WORKSPACE_SETTINGS.lastOpenPaths).toEqual([]);
  });

  it("defaults frontmatter aliases to on, per the opt-out policy for queued features", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.frontmatterAliasesEnabled).toBe(true);
  });

  it("defaults paste-to-attach images to on, per the opt-out policy for queued features", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.pasteImagesEnabled).toBe(true);
  });

  it("defaults the frontmatter Properties panel to on, per the opt-out policy for queued features", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.frontmatterPropertiesEnabled).toBe(true);
  });

  it("defaults the attachments folder to empty, i.e. next to the note", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.attachmentsFolder).toBe("");
  });

  it("defaults graph color groups to empty, so the graph looks unchanged until the user defines one", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.graphColorGroups).toEqual([]);
  });

  it("defaults tags to on, per the opt-out policy for queued features", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.tagsEnabled).toBe(true);
  });

  it("keeps accents and snippets enabled without changing an existing palette or note", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.themesEnabled).toBe(true);
    expect(DEFAULT_WORKSPACE_SETTINGS.accentColor).toBe("warm");
    expect(DEFAULT_WORKSPACE_SETTINGS.snippetsEnabled).toBe(true);
  });
});

describe("loadWorkspaceSettings", () => {
  it("falls back to defaults when the settings file doesn't exist yet", async () => {
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const settings = await loadWorkspaceSettings("/workspace");
    expect(settings).toEqual(DEFAULT_WORKSPACE_SETTINGS);
  });

  it("fills in fields missing from an older settings file with today's defaults", async () => {
    // A settings.json written before uiZoom/lastOpenPaths existed, the
    // real shape of files already on disk from earlier sessions.
    readTextFile.mockResolvedValueOnce(JSON.stringify({ version: 1, sortOrder: "name-desc" }));
    const settings = await loadWorkspaceSettings("/workspace");
    expect(settings.sortOrder).toBe("name-desc");
    expect(settings.uiZoom).toBe(DEFAULT_WORKSPACE_SETTINGS.uiZoom);
    expect(settings.lastOpenPaths).toEqual([]);
    expect(settings.frontmatterAliasesEnabled).toBe(true);
  });

  it("keeps every field from a settings file that already has them all", async () => {
    const saved = { ...DEFAULT_WORKSPACE_SETTINGS, fontSize: 20, uiZoom: 150 };
    readTextFile.mockResolvedValueOnce(JSON.stringify(saved));
    const settings = await loadWorkspaceSettings("/workspace");
    expect(settings).toEqual(saved);
  });
});

describe("saveWorkspaceSettings", () => {
  it("writes to .leotheca/settings.json under the workspace root", async () => {
    await saveWorkspaceSettings("/workspace", DEFAULT_WORKSPACE_SETTINGS);
    expect(writeTextFile).toHaveBeenCalledWith(
      "/workspace/.leotheca/settings.json",
      JSON.stringify(DEFAULT_WORKSPACE_SETTINGS, null, 2),
    );
  });
});
