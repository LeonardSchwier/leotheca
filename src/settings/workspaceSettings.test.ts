import { describe, expect, it, vi } from "vitest";
import {
  clamp,
  decodeWorkspaceSettings,
  DEFAULT_WORKSPACE_SETTINGS,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
} from "./workspaceSettings";

const { readTextFile, writeWorkspaceTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  writeWorkspaceTextFile: vi.fn(),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeWorkspaceTextFile,
}));

const ROOT = "/workspace";

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
  it("falls back to defaults, not corrupt, when the settings file doesn't exist yet", async () => {
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const { settings, corrupt } = await loadWorkspaceSettings(ROOT);
    expect(settings).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(corrupt).toBe(false);
  });

  it("fills in fields missing from an older settings file with today's defaults, not corrupt", async () => {
    // A settings.json written before uiZoom/lastOpenPaths existed, the
    // real shape of files already on disk from earlier sessions.
    readTextFile.mockResolvedValueOnce(
      JSON.stringify({ version: 1, sortOrder: "name-desc" }),
    );
    const { settings, corrupt } = await loadWorkspaceSettings(ROOT);
    expect(settings.sortOrder).toBe("name-desc");
    expect(settings.uiZoom).toBe(DEFAULT_WORKSPACE_SETTINGS.uiZoom);
    expect(settings.lastOpenPaths).toEqual([]);
    expect(settings.frontmatterAliasesEnabled).toBe(true);
    expect(corrupt).toBe(false);
  });

  it("keeps every field from a settings file that already has them all, not corrupt", async () => {
    const saved = { ...DEFAULT_WORKSPACE_SETTINGS, fontSize: 20, uiZoom: 150 };
    readTextFile.mockResolvedValueOnce(JSON.stringify(saved));
    const { settings, corrupt } = await loadWorkspaceSettings(ROOT);
    expect(settings).toEqual(saved);
    expect(corrupt).toBe(false);
  });
});

describe("saveWorkspaceSettings", () => {
  it("writes to .leotheca/settings.json under the workspace root", async () => {
    await saveWorkspaceSettings(ROOT, DEFAULT_WORKSPACE_SETTINGS);
    expect(writeWorkspaceTextFile).toHaveBeenCalledWith(
      ROOT,
      ".leotheca/settings.json",
      JSON.stringify(DEFAULT_WORKSPACE_SETTINGS, null, 2),
    );
  });
});

// Audit follow-up F-008: decodeWorkspaceSettings is the pure function
// loadWorkspaceSettings delegates to once it has raw text in hand; testing
// it directly, with no native read in the way, is what lets these fixtures
// cover every failure shape precisely rather than only the shapes a real
// file happens to exist in.
describe("decodeWorkspaceSettings", () => {
  it("treats a JSON syntax error as corrupt and falls back to full defaults", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      "{ not valid json",
      ROOT,
    );
    expect(settings).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(corrupt).toBe(true);
  });

  it("treats a top-level JSON array as corrupt", () => {
    const { settings, corrupt } = decodeWorkspaceSettings("[1, 2, 3]", ROOT);
    expect(settings).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(corrupt).toBe(true);
  });

  it("treats a top-level JSON primitive as corrupt", () => {
    const { corrupt } = decodeWorkspaceSettings("42", ROOT);
    expect(corrupt).toBe(true);
  });

  it("defaults a wrong-typed field and marks the result corrupt, without disturbing valid sibling fields", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        fontSize: "huge",
        sortOrder: "name-desc",
      }),
      ROOT,
    );
    expect(settings.fontSize).toBe(DEFAULT_WORKSPACE_SETTINGS.fontSize);
    expect(settings.sortOrder).toBe("name-desc");
    expect(corrupt).toBe(true);
  });

  it("rejects a number field outside its valid range", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({ ...DEFAULT_WORKSPACE_SETTINGS, fontSize: 999 }),
      ROOT,
    );
    expect(settings.fontSize).toBe(DEFAULT_WORKSPACE_SETTINGS.fontSize);
    expect(corrupt).toBe(true);
  });

  it("rejects an unrecognized enum value", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        accentColor: "chartreuse",
      }),
      ROOT,
    );
    expect(settings.accentColor).toBe(DEFAULT_WORKSPACE_SETTINGS.accentColor);
    expect(corrupt).toBe(true);
  });

  it("rejects an absolute attachmentsFolder instead of treating it as workspace-relative", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        attachmentsFolder: "/etc",
      }),
      ROOT,
    );
    expect(settings.attachmentsFolder).toBe(
      DEFAULT_WORKSPACE_SETTINGS.attachmentsFolder,
    );
    expect(corrupt).toBe(true);
  });

  it("rejects a templatesFolder containing a .. traversal segment", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        templatesFolder: "../outside",
      }),
      ROOT,
    );
    expect(settings.templatesFolder).toBe(
      DEFAULT_WORKSPACE_SETTINGS.templatesFolder,
    );
    expect(corrupt).toBe(true);
  });

  it("accepts an empty attachmentsFolder as valid (means: next to the note)", () => {
    const { corrupt } = decodeWorkspaceSettings(
      JSON.stringify({ ...DEFAULT_WORKSPACE_SETTINGS, attachmentsFolder: "" }),
      ROOT,
    );
    expect(corrupt).toBe(false);
  });

  it("drops a lastOpenPaths entry that resolves outside the workspace, keeping the ones that don't", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        lastOpenPaths: ["/workspace/note.md", "/etc/passwd"],
      }),
      ROOT,
    );
    expect(settings.lastOpenPaths).toEqual(["/workspace/note.md"]);
    expect(corrupt).toBe(true);
  });

  it("nulls a lastActivePath that resolves outside the workspace", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        lastActivePath: "/etc/passwd",
      }),
      ROOT,
    );
    expect(settings.lastActivePath).toBeNull();
    expect(corrupt).toBe(true);
  });

  it("keeps a lastActivePath that resolves inside the workspace, not corrupt", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        lastActivePath: "/workspace/note.md",
      }),
      ROOT,
    );
    expect(settings.lastActivePath).toBe("/workspace/note.md");
    expect(corrupt).toBe(false);
  });

  it("drops a malformed graphColorGroups entry while keeping the valid ones", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        graphColorGroups: [
          { id: "a", query: "todo", color: "#ff0000" },
          { id: "b", query: "done", color: "not-a-color" },
          { id: "", query: "empty-id", color: "#00ff00" },
        ],
      }),
      ROOT,
    );
    expect(settings.graphColorGroups).toEqual([
      { id: "a", query: "todo", color: "#ff0000" },
    ]);
    expect(corrupt).toBe(true);
  });

  it("preserves an unknown top-level field for forward compatibility instead of dropping it", () => {
    const { settings } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        aFutureFieldThisVersionDoesNotKnow: "keep-me",
      }),
      ROOT,
    );
    expect(
      (settings as unknown as Record<string, unknown>)
        .aFutureFieldThisVersionDoesNotKnow,
    ).toBe("keep-me");
  });

  it("flags an unrecognized version as corrupt but preserves its actual value rather than downgrading it to 1", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        version: 2,
        aFieldVersion2Added: true,
      }),
      ROOT,
    );
    expect((settings as unknown as Record<string, unknown>).version).toBe(2);
    expect(
      (settings as unknown as Record<string, unknown>).aFieldVersion2Added,
    ).toBe(true);
    expect(corrupt).toBe(true);
  });

  it("defaults a missing version to 1 without flagging corruption", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({ sortOrder: "name-desc" }),
      ROOT,
    );
    expect(settings.version).toBe(1);
    expect(corrupt).toBe(false);
  });
});
