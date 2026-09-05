import { describe, expect, it, vi } from "vitest";
import {
  clamp,
  decodeWorkspaceSettings,
  DEFAULT_WORKSPACE_SETTINGS,
  isValidEditorLayoutState,
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

  it("defaults heading links to on, per the opt-out policy for net-new functionality", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.headingLinksEnabled).toBe(true);
  });

  it("defaults the accidental-edit note lock to on", () => {
    expect(DEFAULT_WORKSPACE_SETTINGS.noteReadOnlyLockEnabled).toBe(true);
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
        version: 3,
        aFieldVersion3Added: true,
      }),
      ROOT,
    );
    expect((settings as unknown as Record<string, unknown>).version).toBe(3);
    expect(
      (settings as unknown as Record<string, unknown>).aFieldVersion3Added,
    ).toBe(true);
    expect(corrupt).toBe(true);
  });

  it("accepts version 2 settings without flagging corruption (F07 Phase 2b)", () => {
    const { settings, corrupt } = decodeWorkspaceSettings(
      JSON.stringify({
        ...DEFAULT_WORKSPACE_SETTINGS,
        version: 2,
        editorLayout: { activeGroupId: "primary", splitEnabled: false, preferredRatio: 0.5, compactVisibleGroupId: "primary", groups: { primary: { id: "primary", tabPaths: [], pinnedPaths: [], activePath: null } } },
      }),
      ROOT,
    );
    expect(settings.version).toBe(2);
    expect(corrupt).toBe(false);
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

// F07 Phase 2b: Comprehensive tests for isValidEditorLayoutState validation
// These tests cover all the specific failure cases mentioned in the feedback
// for commit 07820fa7, ensuring the validator rejects structurally invalid state.

describe("isValidEditorLayoutState", () => {
  const WORKSPACE_ROOT = "/workspace";

  describe("valid cases", () => {
    it("accepts a minimal valid primary-only layout", () => {
      const validLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/today.md"],
            pinnedPaths: [],
            activePath: "notes/today.md",
          },
        },
      };
      expect(isValidEditorLayoutState(validLayout, WORKSPACE_ROOT)).toBe(true);
    });

    it("accepts a valid layout with secondary group", () => {
      const validLayout = {
        activeGroupId: "primary",
        splitEnabled: true,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/primary.md"],
            pinnedPaths: [],
            activePath: "notes/primary.md",
          },
          secondary: {
            id: "secondary",
            tabPaths: ["notes/secondary.md"],
            pinnedPaths: [],
            activePath: "notes/secondary.md",
          },
        },
      };
      expect(isValidEditorLayoutState(validLayout, WORKSPACE_ROOT)).toBe(true);
    });

    it("accepts valid pinned tabs", () => {
      const validLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/pinned.md", "notes/normal.md"],
            pinnedPaths: ["notes/pinned.md"],
            activePath: "notes/pinned.md",
          },
        },
      };
      expect(isValidEditorLayoutState(validLayout, WORKSPACE_ROOT)).toBe(true);
    });

    it("accepts valid ratio at boundaries [0.30, 0.70]", () => {
      const layoutWithMinRatio = {
        activeGroupId: "primary",
        splitEnabled: true,
        preferredRatio: 0.30,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      const layoutWithMaxRatio = {
        ...layoutWithMinRatio,
        preferredRatio: 0.70,
      };
      expect(isValidEditorLayoutState(layoutWithMinRatio, WORKSPACE_ROOT)).toBe(true);
      expect(isValidEditorLayoutState(layoutWithMaxRatio, WORKSPACE_ROOT)).toBe(true);
    });

    it("accepts empty tab arrays with null activePath", () => {
      const validLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(validLayout, WORKSPACE_ROOT)).toBe(true);
    });
  });

  describe("required field validation", () => {
    it("rejects missing splitEnabled", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects missing preferredRatio", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects missing activeGroupId", () => {
      const invalidLayout = {
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects missing compactVisibleGroupId", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects missing groups", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects missing primary group", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {},
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });

  describe("type validation", () => {
    it("rejects non-object values", () => {
      expect(isValidEditorLayoutState(null, WORKSPACE_ROOT)).toBe(false);
      expect(isValidEditorLayoutState(undefined, WORKSPACE_ROOT)).toBe(false);
      expect(isValidEditorLayoutState("string", WORKSPACE_ROOT)).toBe(false);
      expect(isValidEditorLayoutState(42, WORKSPACE_ROOT)).toBe(false);
      expect(isValidEditorLayoutState([], WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects wrong type for splitEnabled", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: "true", // should be boolean
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects wrong type for preferredRatio", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: "0.5", // should be number
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects NaN and Infinity for preferredRatio", () => {
      const nanLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: NaN,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      const infLayout = {
        ...nanLayout,
        preferredRatio: Infinity,
      };
      expect(isValidEditorLayoutState(nanLayout, WORKSPACE_ROOT)).toBe(false);
      expect(isValidEditorLayoutState(infLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects invalid activeGroupId values", () => {
      const invalidLayout = {
        activeGroupId: "tertiary", // invalid
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects invalid compactVisibleGroupId values", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "none", // invalid
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });

  describe("ratio range validation", () => {
    it("rejects preferredRatio below 0.30", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.29,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects preferredRatio above 0.70", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.71,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects preferredRatio at 0.29 (below minimum)", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.29,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects preferredRatio at 0.71 (above maximum)", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.71,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });

  describe("path validation", () => {
    it("rejects non-string paths in tabPaths", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [42, "valid.md"], // 42 is not a string
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects null in tabPaths", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [null, "valid.md"], // null is not a valid path
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects paths with null bytes", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes\u0000evil.md"], // null byte
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects workspace-escaping paths with ..", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["../../outside.md"], // path traversal
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects absolute paths starting with /", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["/etc/passwd"], // absolute path
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects paths with backslashes", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes\\evil.md"], // backslash
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects empty string paths", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [""], // empty path
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects non-string pinned paths", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/valid.md"],
            pinnedPaths: [42], // not a string
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects pinned paths that are not in tabPaths", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/valid.md"],
            pinnedPaths: ["notes/pinned.md"], // not in tabPaths
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects pinned paths with traversal", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/valid.md", "../evil.md"],
            pinnedPaths: ["../evil.md"], // traversal in pinned
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });

  describe("path uniqueness validation", () => {
    it("rejects duplicate paths within primary group", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/duplicate.md", "notes/duplicate.md"],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects same path in both primary and secondary", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: true,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/duplicate.md"],
            pinnedPaths: [],
            activePath: null,
          },
          secondary: {
            id: "secondary",
            tabPaths: ["notes/duplicate.md"], // same path in both groups
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });

  describe("active path validation", () => {
    it("rejects activePath when group has no tabs", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: "notes/nonexistent.md", // has activePath but no tabs
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects activePath not in tabPaths", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/valid.md"],
            pinnedPaths: [],
            activePath: "notes/nonexistent.md", // not in tabPaths
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects non-string activePath", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/valid.md"],
            pinnedPaths: [],
            activePath: 42, // not a string
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });

  describe("secondary group validation", () => {
    it("rejects activeGroupId=secondary when no secondary group exists", () => {
      const invalidLayout = {
        activeGroupId: "secondary", // references non-existent group
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects compactVisibleGroupId=secondary when no secondary group exists", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "secondary", // references non-existent group
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects wrong id for secondary group", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
          secondary: {
            id: "wrong", // should be "secondary"
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("accepts valid secondary group with correct id", () => {
      const validLayout = {
        activeGroupId: "primary",
        splitEnabled: true,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: ["notes/primary.md"],
            pinnedPaths: [],
            activePath: "notes/primary.md",
          },
          secondary: {
            id: "secondary",
            tabPaths: ["notes/secondary.md"],
            pinnedPaths: [],
            activePath: "notes/secondary.md",
          },
        },
      };
      expect(isValidEditorLayoutState(validLayout, WORKSPACE_ROOT)).toBe(true);
    });
  });

  describe("group structure validation", () => {
    it("rejects groups not being an object", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: "not an object",
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects primary group not being an object", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: "not an object",
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects missing id field in primary group", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            // missing id
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects wrong id in primary group", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "wrong", // should be "primary"
            tabPaths: [],
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects non-array tabPaths in primary", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: "not an array",
            pinnedPaths: [],
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });

    it("rejects non-array pinnedPaths in primary", () => {
      const invalidLayout = {
        activeGroupId: "primary",
        splitEnabled: false,
        preferredRatio: 0.5,
        compactVisibleGroupId: "primary",
        groups: {
          primary: {
            id: "primary",
            tabPaths: [],
            pinnedPaths: "not an array",
            activePath: null,
          },
        },
      };
      expect(isValidEditorLayoutState(invalidLayout, WORKSPACE_ROOT)).toBe(false);
    });
  });
});
