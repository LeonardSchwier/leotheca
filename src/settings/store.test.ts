/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readTextFile,
  writeTextFile,
  getAppVersion,
  listDir,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
  getAppConfigFilePath,
} = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("not found");
  }),
  writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(async () => {}),
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeTextFile,
  getAppVersion,
  listDir,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
  getAppConfigFilePath,
}));

// jsdom doesn't implement matchMedia; settings/store.ts calls it at module
// load time (the "system theme" effects), so this has to be in place
// before that module is ever imported, hence the dynamic import below
// rather than a static one (static imports evaluate before any of this
// file's own top-level code runs).
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const {
  restoreLastOpenTabs,
  initSettings,
  setWorkspacePath,
  settingsLoaded,
  workspacePath,
  workspaceSettings,
  workspaceSession,
} = await import("./store");
const { activeTabPath, closeAllTabs, openOrFocusTab, openTabs } = await import(
  "../workspace/store",
);
const { DEFAULT_WORKSPACE_SETTINGS } = await import("./workspaceSettings");

function writesTo(path: string): unknown[] {
  return writeTextFile.mock.calls.filter(([p]) => p === path).map(([, content]) => JSON.parse(content as string));
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
    expect((beforeSwitch.at(-1) as { lastOpenPaths: string[] }).lastOpenPaths).toEqual([
      "/workspaceA/note1.md",
    ]);

    await setWorkspacePath("/workspaceB");

    // The switch itself (closeAllTabs on the way out) must not have written
    // an empty tab list back over workspace A's real one. If it did, this
    // would be the exact regression session 22 found and fixed.
    const afterSwitch = writesTo("/workspaceA/.leotheca/settings.json");
    expect((afterSwitch.at(-1) as { lastOpenPaths: string[] }).lastOpenPaths).toEqual([
      "/workspaceA/note1.md",
    ]);
  });

  it("still writes an empty tab list for a workspace whose tabs the user actually closed themselves", async () => {
    const { closeAllTabs } = await import("../workspace/store");
    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    openOrFocusTab("/workspaceA/note1.md", "note1.md", "content", "text");
    closeAllTabs();
    await flushSettingsWrites();

    const writes = writesTo("/workspaceA/.leotheca/settings.json");
    expect((writes.at(-1) as { lastOpenPaths: string[] }).lastOpenPaths).toEqual([]);
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
        return JSON.stringify({ lastWorkspacePath: "/workspaceA", theme: "system" });
      }
      if (path === "/workspaceA/.leotheca/settings.json") {
        return JSON.stringify({ ...DEFAULT_WORKSPACE_SETTINGS, lastOpenPaths: ["/workspaceA/note.md"] });
      }
      if (path === "/workspaceA/note.md") return "saved note";
      throw new Error("not found");
    });

    await initSettings();

    expect(writesTo("/workspaceA/.leotheca/settings.json")).toEqual([]);
    expect(openTabs.value.map((tab) => tab.path)).toEqual(["/workspaceA/note.md"]);
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
    expect(writeTextFile).not.toHaveBeenCalledWith(
      "/workspaceA/.leotheca/settings.json",
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

// Each of these workspace/store.ts functions changes both openTabs and
// activeTabPath in one call. Without batch() (see session 23's fix to
// closeAllTabs, and this same treatment applied to these four functions
// right after), each signal write fires the persistence effect separately,
// producing an extra write with a state that was never real on its own.
// Asserting exactly one write per operation is a direct check that the
// batching is actually in effect, not just that the final state ends up
// correct (which could pass even with two writes, the way closeAllTabs's
// broken version happened to end up "correct" after its second write too).
describe("tab operations that change both openTabs and activeTabPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function writesDuring(action: () => void): Promise<number> {
    await setWorkspacePath("/workspaceA");
    await flushSettingsWrites();
    openOrFocusTab("/workspaceA/a.md", "a.md", "", "text");
    openOrFocusTab("/workspaceA/folder/b.md", "b.md", "", "text");
    vi.clearAllMocks();
    action();
    await flushSettingsWrites();
    return writeTextFile.mock.calls.filter(([p]) => p === "/workspaceA/.leotheca/settings.json").length;
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
    const count = await writesDuring(() => closeTabsUnder("/workspaceA/folder"));
    expect(count).toBe(1);
  });

  it("renameOpenTab writes once when renaming the active tab", async () => {
    const { renameOpenTab } = await import("../workspace/store");
    const count = await writesDuring(() =>
      renameOpenTab("/workspaceA/folder/b.md", "/workspaceA/folder/renamed.md", "renamed.md"),
    );
    expect(count).toBe(1);
  });
});
