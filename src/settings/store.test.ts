/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  drainWorkspaceOperations,
  readTextFile,
  writeTextFile,
  writeWorkspaceTextFile,
  getAppVersion,
  listDir,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
  getAppConfigFilePath,
} = vi.hoisted(() => ({
  drainWorkspaceOperations: vi.fn(async () => {}),
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("not found");
  }),
  // Still real and still needed here: globalConfig.ts (not workspace-scoped)
  // writes through this one, unchanged by audit follow-up F-004.
  writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(
    async () => {},
  ),
  writeWorkspaceTextFile: vi.fn<
    (root: string, relativePath: string, contents: string) => Promise<void>
  >(async () => {}),
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

vi.mock("../workspace/tauriBridge", () => ({
  drainWorkspaceOperations,
  readTextFile,
  writeTextFile,
  writeWorkspaceTextFile,
  getAppVersion,
  listDir,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
  getAppConfigFilePath,
}));

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const {
  restoreLastOpenTabs,
  initSettings,
  repairWorkspaceSettingsFile,
  setWorkspacePath,
  settingsLoaded,
  updateWorkspaceSettings,
  workspacePath,
  workspaceSettings,
  workspaceSettingsCorrupted,
  workspaceSession,
} = await import("./store");
const { activeTabPath, closeAllTabs, openOrFocusTab, openTabs } =
  await import("../workspace/store");
const { DEFAULT_WORKSPACE_SETTINGS } = await import("./workspaceSettings");

function writesTo(path: string): unknown[] {
  return writeWorkspaceTextFile.mock.calls
    .filter(([root, relativePath]) => `${root}/${relativePath}` === path)
    .map(([, , content]) => JSON.parse(content as string));
}

async function flushSettingsWrites(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("setWorkspacePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not overwrite the outgoing workspace's remembered tabs with an empty list when switching away", async () => {
    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    openOrFocusTab("/workspaceA/note1.md", "note1.md", "content", "text");

    const beforeSwitch = writesTo("/workspaceA/.leotheca/settings.json");
    expect(beforeSwitch.length).toBeGreaterThan(0);
    expect(
      (beforeSwitch.at(-1) as { lastOpenPaths: string[] }).lastOpenPaths,
    ).toEqual(["/workspaceA/note1.md"]);

    await setWorkspacePath("/workspaceB");

    const afterSwitch = writesTo("/workspaceA/.leotheca/settings.json");
    expect(
      (afterSwitch.at(-1) as { lastOpenPaths: string[] }).lastOpenPaths,
    ).toEqual(["/workspaceA/note1.md"]);
  });

  it("still writes an empty tab list for a workspace whose tabs the user actually closed themselves", async () => {
    const { closeAllTabs } = await import("../workspace/store");
    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    openOrFocusTab("/workspaceA/note1.md", "note1.md", "content", "text");
    closeAllTabs();
    await flushSettingsWrites();

    const writes = writesTo("/workspaceA/.leotheca/settings.json");
    expect(
      (writes.at(-1) as { lastOpenPaths: string[] }).lastOpenPaths,
    ).toEqual([]);
  });

  it("starts a fresh session when Android changes only its opaque folder token", async () => {
    await setWorkspacePath("/workspace", "token-A");
    const firstSession = workspaceSession.value;

    await setWorkspacePath("/workspace", "token-B");

    expect(workspacePath.value).toBe("/workspace");
    expect(workspaceSession.value).toBe(firstSession + 1);
  });
});

describe("settings hydration", () => {
  it("does not persist default tabs before restored workspace settings are loaded", async () => {
    vi.clearAllMocks();
    closeAllTabs();
    workspacePath.value = null;
    settingsLoaded.value = false;
    readTextFile.mockImplementation(async (path) => {
      if (path === "/config/config.json") {
        return JSON.stringify({
          lastWorkspacePath: "/workspaceA",
          theme: "system",
        });
      }
      if (path === "/workspaceA/.leotheca/settings.json") {
        return JSON.stringify({
          ...DEFAULT_WORKSPACE_SETTINGS,
          lastOpenPaths: ["/workspaceA/note.md"],
        });
      }
      if (path === "/workspaceA/note.md") return "saved note";
      throw new Error("not found");
    });

    await initSettings();

    expect(writesTo("/workspaceA/.leotheca/settings.json")).toEqual([]);
    expect(openTabs.value.map((tab) => tab.path)).toEqual([
      "/workspaceA/note.md",
    ]);
  });
});

describe("restoreLastOpenTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspacePath.value = "/workspaceA";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS };
    closeAllTabs();
    vi.clearAllMocks();
  });

  it("restores text, image, and canvas tabs with a valid active fallback", async () => {
    readTextFile.mockImplementation(async (path) => {
      if (path === "/workspaceA/missing.md") throw new Error("not found");
      return `contents of ${path}`;
    });
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      lastOpenPaths: [
        "/workspaceA/note.md",
        "/workspaceA/photo.PNG",
        "/workspaceA/board.CANVAS",
        "/workspaceA/missing.md",
      ],
      lastActivePath: "/workspaceA/missing.md",
    };

    await restoreLastOpenTabs();

    expect(openTabs.value.map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: "/workspaceA/note.md", kind: "text" },
      { path: "/workspaceA/photo.PNG", kind: "image" },
      { path: "/workspaceA/board.CANVAS", kind: "canvas" },
    ]);
    expect(activeTabPath.value).toBe("/workspaceA/board.CANVAS");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspaceA/photo.PNG");
    expect(writeWorkspaceTextFile).not.toHaveBeenCalledWith(
      "/workspaceA",
      ".leotheca/settings.json",
      expect.any(String),
    );
  });

  it("uses the saved active path when it restored and null when no path restored", async () => {
    readTextFile.mockImplementation(async (path) => {
      if (path.endsWith("missing.md")) throw new Error("not found");
      return "note";
    });
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      lastOpenPaths: ["/workspaceA/first.md", "/workspaceA/second.md"],
      lastActivePath: "/workspaceA/first.md",
    };

    await restoreLastOpenTabs();
    expect(activeTabPath.value).toBe("/workspaceA/first.md");

    closeAllTabs();
    vi.clearAllMocks();
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      lastOpenPaths: ["/workspaceA/missing.md"],
      lastActivePath: "/workspaceA/missing.md",
    };
    await restoreLastOpenTabs();

    expect(openTabs.value).toEqual([]);
    expect(activeTabPath.value).toBeNull();
  });
});

describe("tab operations that change both openTabs and activeTabPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() clears call history but not a mockImplementation
    // set by an earlier describe block (e.g. "restoreLastOpenTabs"'s own
    // readTextFile stub), so restore the module-level default explicitly
    // rather than depend on load order: these tests need workspace settings
    // to load as an ordinary, non-corrupt default, not whatever the
    // previous block's readTextFile mock happened to return.
    readTextFile.mockImplementation(async () => {
      throw new Error("not found");
    });
  });

  async function writesDuring(action: () => void): Promise<number> {
    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    openOrFocusTab("/workspaceA/a.md", "a.md", "", "text");
    openOrFocusTab("/workspaceA/folder/b.md", "b.md", "", "text");
    vi.clearAllMocks();
    action();
    await flushSettingsWrites();
    return writeWorkspaceTextFile.mock.calls.filter(
      ([root, relativePath]) =>
        root === "/workspaceA" && relativePath === ".leotheca/settings.json",
    ).length;
  }

  it("closeTab writes once when closing the active tab (which also changes activeTabPath)", async () => {
    const { closeTab } = await import("../workspace/store");
    const count = await writesDuring(() => closeTab("/workspaceA/folder/b.md"));
    expect(count).toBe(1);
  });

  it("closeOtherTabs writes once", async () => {
    const { closeOtherTabs } = await import("../workspace/store");
    const count = await writesDuring(() => closeOtherTabs("/workspaceA/a.md"));
    expect(count).toBe(1);
  });

  it("closeTabsUnder writes once when it closes the active tab", async () => {
    const { closeTabsUnder } = await import("../workspace/store");
    const count = await writesDuring(() =>
      closeTabsUnder("/workspaceA/folder"),
    );
    expect(count).toBe(1);
  });

  it("renameOpenTab writes once when renaming the active tab", async () => {
    const { renameOpenTab } = await import("../workspace/store");
    const count = await writesDuring(() =>
      renameOpenTab(
        "/workspaceA/folder/b.md",
        "/workspaceA/folder/renamed.md",
        "renamed.md",
      ),
    );
    expect(count).toBe(1);
  });
});

// Audit follow-up F-008: a corrupt settings.json must never be silently
// replaced by the defaulted values loading it produced, only by an
// explicit user action (SettingsPanel's "Rewrite settings file", wired to
// repairWorkspaceSettingsFile below).
describe("workspace settings corruption recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSettingsCorrupted.value = false;
  });

  it("does not write back to disk merely from loading a corrupt settings file", async () => {
    readTextFile.mockImplementation(async (path: string) => {
      if (path === "/workspaceA/.leotheca/settings.json")
        return "{ not valid json";
      throw new Error("not found");
    });

    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();

    expect(workspaceSettingsCorrupted.value).toBe(true);
    expect(writesTo("/workspaceA/.leotheca/settings.json")).toEqual([]);
  });

  it("does not mark settings corrupted after loading an already-valid file", async () => {
    readTextFile.mockImplementation(async (path: string) => {
      if (path === "/workspaceA/.leotheca/settings.json") {
        return JSON.stringify(DEFAULT_WORKSPACE_SETTINGS);
      }
      throw new Error("not found");
    });

    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();

    expect(workspaceSettingsCorrupted.value).toBe(false);
  });

  it("repairWorkspaceSettingsFile writes the current settings and clears the corrupted flag", async () => {
    readTextFile.mockImplementation(async (path: string) => {
      if (path === "/workspaceA/.leotheca/settings.json")
        return "{ not valid json";
      throw new Error("not found");
    });

    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    expect(workspaceSettingsCorrupted.value).toBe(true);
    expect(writesTo("/workspaceA/.leotheca/settings.json")).toEqual([]);

    await repairWorkspaceSettingsFile();
    await flushSettingsWrites();

    expect(workspaceSettingsCorrupted.value).toBe(false);
    expect(
      writesTo("/workspaceA/.leotheca/settings.json").length,
    ).toBeGreaterThan(0);
  });

  it("does nothing when called while settings are not actually marked corrupted", async () => {
    readTextFile.mockImplementation(async (path: string) => {
      if (path === "/workspaceA/.leotheca/settings.json") {
        return JSON.stringify(DEFAULT_WORKSPACE_SETTINGS);
      }
      throw new Error("not found");
    });

    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    vi.clearAllMocks();

    await repairWorkspaceSettingsFile();

    expect(writeWorkspaceTextFile).not.toHaveBeenCalled();
  });

  it("does not let an unrelated update (e.g. the tab-persistence effect) write over a corrupt file", async () => {
    readTextFile.mockImplementation(async (path: string) => {
      if (path === "/workspaceA/.leotheca/settings.json")
        return "{ not valid json";
      throw new Error("not found");
    });

    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    expect(workspaceSettingsCorrupted.value).toBe(true);
    vi.clearAllMocks();

    // Simulates what the tab-persistence effect (or any other Settings
    // Panel control) does on an ordinary, non-recovery action: neither
    // switching notes nor changing an unrelated setting is the explicit
    // recovery action, so it must not be the thing that finally writes the
    // defaulted values over the still-corrupt file on disk.
    await updateWorkspaceSettings({
      lastActivePath: "/workspaceA/note.md",
      fontSize: 18,
    });
    await flushSettingsWrites();

    expect(writesTo("/workspaceA/.leotheca/settings.json")).toEqual([]);
    // The in-memory session still reflects the change, so the app stays
    // usable while the corrupted file awaits an explicit repair.
    expect(workspaceSettings.value.lastActivePath).toBe(
      "/workspaceA/note.md",
    );
    expect(workspaceSettings.value.fontSize).toBe(18);
    expect(workspaceSettingsCorrupted.value).toBe(true);
  });

  it("resumes normal persistence for later updates once repaired", async () => {
    readTextFile.mockImplementation(async (path: string) => {
      if (path === "/workspaceA/.leotheca/settings.json")
        return "{ not valid json";
      throw new Error("not found");
    });

    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    await repairWorkspaceSettingsFile();
    await flushSettingsWrites();
    vi.clearAllMocks();

    await updateWorkspaceSettings({ fontSize: 20 });
    await flushSettingsWrites();

    expect(
      (writesTo("/workspaceA/.leotheca/settings.json").at(-1) as {
        fontSize: number;
      }).fontSize,
    ).toBe(20);
  });
});
