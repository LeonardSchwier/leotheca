import { describe, expect, it, vi } from "vitest";
import {
  decodeGlobalConfig,
  loadGlobalConfig,
  saveGlobalConfig,
  type GlobalConfigV2,
} from "./globalConfig";

const { readTextFile, writeTextFile, getAppConfigFilePath } = vi.hoisted(
  () => ({
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
  }),
);

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeTextFile,
  getAppConfigFilePath,
}));

const DEFAULTS: GlobalConfigV2 = {
  version: 2,
  theme: "system",
  activeWorkspaceId: null,
  workspaceProfiles: [],
  lastWorkspacePath: null,
};

describe("loadGlobalConfig", () => {
  it("falls back to defaults when the config file doesn't exist yet", async () => {
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const config = await loadGlobalConfig();
    expect(config).toEqual(DEFAULTS);
  });

  it("fills in fields missing from an older config file with today's defaults", async () => {
    readTextFile.mockResolvedValueOnce(JSON.stringify({ theme: "dark" }));
    const config = await loadGlobalConfig();
    expect(config.theme).toBe("dark");
    expect(config.lastWorkspacePath).toBeNull();
    expect(config.workspaceProfiles).toEqual([]);
    expect(config.activeWorkspaceId).toBeNull();
  });

  it("keeps every field from a v2 config file that already has them all, including the Android-only token", async () => {
    const saved: GlobalConfigV2 = {
      version: 2,
      theme: "light",
      activeWorkspaceId: "profile-1",
      workspaceProfiles: [
        { id: "profile-1", name: "Personal", icon: "folder", path: "/vault", token: "content://tree/abc", lastOpenedAt: 100 },
      ],
      lastWorkspacePath: "/vault",
      workspaceToken: "content://tree/abc",
    };
    readTextFile.mockResolvedValueOnce(JSON.stringify(saved));
    const config = await loadGlobalConfig();
    expect(config).toEqual(saved);
  });
});

describe("saveGlobalConfig", () => {
  it("writes to the app config directory's config.json", async () => {
    const config: GlobalConfigV2 = { ...DEFAULTS, theme: "system" };
    await saveGlobalConfig(config);
    expect(getAppConfigFilePath).toHaveBeenCalledWith("config.json");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/config/config.json",
      JSON.stringify(config, null, 2),
    );
  });
});

// Audit follow-up F-008; extended by F20 Phase 1's v2 catalog/migration.
describe("decodeGlobalConfig", () => {
  it("treats a JSON syntax error as corrupt and falls back to defaults", () => {
    const { config, corrupt } = decodeGlobalConfig("{ not valid json");
    expect(config).toEqual(DEFAULTS);
    expect(corrupt).toBe(true);
  });

  it("treats a top-level JSON array as corrupt", () => {
    const { corrupt } = decodeGlobalConfig("[1, 2, 3]");
    expect(corrupt).toBe(true);
  });

  it("rejects an unrecognized theme value", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ theme: "rainbow" }),
    );
    expect(config.theme).toBe("system");
    expect(corrupt).toBe(true);
  });

  it("rejects a wrong-typed lastWorkspacePath", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ lastWorkspacePath: 42 }),
    );
    expect(config.lastWorkspacePath).toBeNull();
    expect(corrupt).toBe(true);
  });

  it("rejects a wrong-typed workspaceToken", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ workspaceToken: 12345, version: 2, workspaceProfiles: [] }),
    );
    expect(config.workspaceToken).toBeUndefined();
    expect(corrupt).toBe(true);
  });

  it("keeps a valid, fully-populated v2 config as not corrupt", () => {
    const saved: GlobalConfigV2 = {
      version: 2,
      theme: "dark",
      activeWorkspaceId: "p1",
      workspaceProfiles: [
        { id: "p1", name: "Work", icon: "briefcase", path: "/vault", token: "content://x", lastOpenedAt: 500 },
      ],
      lastWorkspacePath: "/vault",
      workspaceToken: "content://x",
    };
    const { config, corrupt } = decodeGlobalConfig(JSON.stringify(saved));
    expect(config).toEqual(saved);
    expect(corrupt).toBe(false);
  });

  it("preserves an unknown top-level field", () => {
    const { config } = decodeGlobalConfig(
      JSON.stringify({ theme: "dark", futureField: "kept" }),
    );
    expect((config as unknown as Record<string, unknown>).futureField).toBe("kept");
  });

  it("preserves an unknown field inside a recognized profile record", () => {
    const { config } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        workspaceProfiles: [
          { id: "p1", name: "Work", icon: "folder", path: "/vault", lastOpenedAt: 1, futureProfileField: "kept" },
        ],
      }),
    );
    expect((config.workspaceProfiles[0] as unknown as Record<string, unknown>).futureProfileField).toBe("kept");
  });

  it("drops a malformed profile record but keeps the other valid ones, marking corrupt", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        workspaceProfiles: [
          { id: "p1", name: "Work", icon: "folder", path: "/vault", lastOpenedAt: 1 },
          { id: "", name: "Bad", icon: "folder", path: "/other", lastOpenedAt: 2 },
          { id: "p3", name: "Personal", icon: "folder", path: "/home", lastOpenedAt: 3 },
        ],
      }),
    );
    expect(config.workspaceProfiles.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(corrupt).toBe(true);
  });

  it("rejects the whole profiles field when it isn't an array", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ version: 2, workspaceProfiles: "not-an-array" }),
    );
    expect(config.workspaceProfiles).toEqual([]);
    expect(corrupt).toBe(true);
  });

  it("leaves duplicate valid profile IDs in place, resolved deterministically by first-match lookup", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        workspaceProfiles: [
          { id: "dup", name: "First", icon: "folder", path: "/a", lastOpenedAt: 1 },
          { id: "dup", name: "Second", icon: "folder", path: "/b", lastOpenedAt: 2 },
        ],
      }),
    );
    expect(config.workspaceProfiles).toHaveLength(2);
    expect(config.workspaceProfiles.find((p) => p.id === "dup")?.name).toBe("First");
    expect(corrupt).toBe(false);
  });

  describe("legacy migration (section 19)", () => {
    it("migrates a legacy config with a lastWorkspacePath into one profile", () => {
      const { config, corrupt } = decodeGlobalConfig(
        JSON.stringify({ lastWorkspacePath: "/Users/me/vault", theme: "dark", workspaceToken: "content://x" }),
      );
      expect(config.workspaceProfiles).toHaveLength(1);
      const [profile] = config.workspaceProfiles;
      expect(profile.name).toBe("vault");
      expect(profile.icon).toBe("folder");
      expect(profile.path).toBe("/Users/me/vault");
      expect(profile.token).toBe("content://x");
      expect(config.activeWorkspaceId).toBe(profile.id);
      expect(profile.id).toBeTruthy();
      expect(corrupt).toBe(false);
    });

    it("names a migrated profile 'Workspace' when the path is the Android synthetic root", () => {
      const { config } = decodeGlobalConfig(JSON.stringify({ lastWorkspacePath: "/workspace" }));
      expect(config.workspaceProfiles[0].name).toBe("Workspace");
    });

    it("does not migrate when there is no lastWorkspacePath", () => {
      const { config } = decodeGlobalConfig(JSON.stringify({ theme: "dark" }));
      expect(config.workspaceProfiles).toEqual([]);
      expect(config.activeWorkspaceId).toBeNull();
    });

    it("does not migrate when a v2 catalog already exists, even if lastWorkspacePath is also present", () => {
      const { config } = decodeGlobalConfig(
        JSON.stringify({
          version: 2,
          workspaceProfiles: [{ id: "p1", name: "Existing", icon: "folder", path: "/vault", lastOpenedAt: 1 }],
          activeWorkspaceId: "p1",
          lastWorkspacePath: "/vault",
        }),
      );
      expect(config.workspaceProfiles).toHaveLength(1);
      expect(config.workspaceProfiles[0].name).toBe("Existing");
    });

    it("migrates into an empty catalog when version is 2 but workspaceProfiles is missing or not an array", () => {
      const { config } = decodeGlobalConfig(
        JSON.stringify({ version: 2, lastWorkspacePath: "/vault" }),
      );
      expect(config.workspaceProfiles).toHaveLength(1);
      expect(config.workspaceProfiles[0].path).toBe("/vault");
    });
  });
});
