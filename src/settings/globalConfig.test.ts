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
  language: "system",
  activeWorkspaceId: null,
  workspaceProfiles: [],
  lastWorkspacePath: null,
  externalFileOpenEnabled: true,
};

describe("loadGlobalConfig", () => {
  it("falls back to defaults when the config file doesn't exist yet", async () => {
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const { config, corrupt } = await loadGlobalConfig();
    expect(config).toEqual(DEFAULTS);
    expect(corrupt).toBe(false);
  });

  it("fills in fields missing from an older config file with today's defaults", async () => {
    readTextFile.mockResolvedValueOnce(JSON.stringify({ theme: "dark" }));
    const { config, corrupt } = await loadGlobalConfig();
    expect(config.theme).toBe("dark");
    expect(config.lastWorkspacePath).toBeNull();
    expect(config.workspaceProfiles).toEqual([]);
    expect(config.activeWorkspaceId).toBeNull();
    expect(corrupt).toBe(false);
  });

  it("keeps every field from a v2 config file that already has them all, including the Android-only token", async () => {
    const saved: GlobalConfigV2 = {
      version: 2,
      theme: "light",
      language: "en",
      activeWorkspaceId: "profile-1",
      workspaceProfiles: [
        {
          id: "profile-1",
          name: "Personal",
          icon: "folder",
          path: "/vault",
          token: "content://tree/abc",
          lastOpenedAt: 100,
        },
      ],
      lastWorkspacePath: "/vault",
      workspaceToken: "content://tree/abc",
      externalFileOpenEnabled: false,
    };
    readTextFile.mockResolvedValueOnce(JSON.stringify(saved));
    const { config, corrupt } = await loadGlobalConfig();
    expect(config).toEqual(saved);
    expect(corrupt).toBe(false);
  });

  it("surfaces decoder corruption alongside the usable fallback config", async () => {
    readTextFile.mockResolvedValueOnce("{ not valid json");
    const { config, corrupt } = await loadGlobalConfig();
    expect(config).toEqual(DEFAULTS);
    expect(corrupt).toBe(true);
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

  it("defaults language to system when absent, and keeps a stored language", () => {
    const missing = decodeGlobalConfig(JSON.stringify({ theme: "dark" }));
    expect(missing.config.language).toBe("system");
    expect(missing.corrupt).toBe(false);
    for (const language of ["system", "en", "de"] as const) {
      const stored = decodeGlobalConfig(JSON.stringify({ language }));
      expect(stored.config.language).toBe(language);
      expect(stored.corrupt).toBe(false);
    }
  });

  it("treats a wrong-typed language as corrupt and falls back to system", () => {
    for (const language of [42, null, {}, ["de"], true]) {
      const { config, corrupt } = decodeGlobalConfig(
        JSON.stringify({ language }),
      );
      expect(config.language).toBe("system");
      expect(corrupt).toBe(true);
    }
  });

  it("falls back to system for a language this build does not know, without calling the file corrupt", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ language: "fr" }),
    );
    expect(config.language).toBe("system");
    expect(corrupt).toBe(false);
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
      JSON.stringify({
        workspaceToken: 12345,
        version: 2,
        workspaceProfiles: [],
      }),
    );
    expect(config.workspaceToken).toBeUndefined();
    expect(corrupt).toBe(true);
  });

  it("defaults externalFileOpenEnabled to true when absent", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ theme: "dark" }),
    );
    expect(config.externalFileOpenEnabled).toBe(true);
    expect(corrupt).toBe(false);
  });

  it("rejects a wrong-typed externalFileOpenEnabled, falling back to the default", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ externalFileOpenEnabled: "yes" }),
    );
    expect(config.externalFileOpenEnabled).toBe(true);
    expect(corrupt).toBe(true);
  });

  it("keeps an explicit externalFileOpenEnabled: false", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({ externalFileOpenEnabled: false }),
    );
    expect(config.externalFileOpenEnabled).toBe(false);
    expect(corrupt).toBe(false);
  });

  it("keeps a valid, fully-populated v2 config as not corrupt", () => {
    const saved: GlobalConfigV2 = {
      version: 2,
      theme: "dark",
      language: "de",
      activeWorkspaceId: "p1",
      workspaceProfiles: [
        {
          id: "p1",
          name: "Work",
          icon: "briefcase",
          path: "/vault",
          token: "content://x",
          lastOpenedAt: 500,
        },
      ],
      lastWorkspacePath: "/vault",
      workspaceToken: "content://x",
      externalFileOpenEnabled: false,
    };
    const { config, corrupt } = decodeGlobalConfig(JSON.stringify(saved));
    expect(config).toEqual(saved);
    expect(corrupt).toBe(false);
  });

  it("preserves an unknown top-level field", () => {
    const { config } = decodeGlobalConfig(
      JSON.stringify({ theme: "dark", futureField: "kept" }),
    );
    expect((config as unknown as Record<string, unknown>).futureField).toBe(
      "kept",
    );
  });

  it("preserves an unknown field inside a recognized profile record", () => {
    const { config } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        workspaceProfiles: [
          {
            id: "p1",
            name: "Work",
            icon: "folder",
            path: "/vault",
            lastOpenedAt: 1,
            futureProfileField: "kept",
          },
        ],
      }),
    );
    expect(
      (config.workspaceProfiles[0] as unknown as Record<string, unknown>)
        .futureProfileField,
    ).toBe("kept");
  });

  it("drops a malformed profile record but keeps the other valid ones, marking corrupt", () => {
    const { config, corrupt } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        workspaceProfiles: [
          {
            id: "p1",
            name: "Work",
            icon: "folder",
            path: "/vault",
            lastOpenedAt: 1,
          },
          {
            id: "",
            name: "Bad",
            icon: "folder",
            path: "/other",
            lastOpenedAt: 2,
          },
          {
            id: "p3",
            name: "Personal",
            icon: "folder",
            path: "/home",
            lastOpenedAt: 3,
          },
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
          {
            id: "dup",
            name: "First",
            icon: "folder",
            path: "/a",
            lastOpenedAt: 1,
          },
          {
            id: "dup",
            name: "Second",
            icon: "folder",
            path: "/b",
            lastOpenedAt: 2,
          },
        ],
      }),
    );
    expect(config.workspaceProfiles).toHaveLength(2);
    expect(config.workspaceProfiles.find((p) => p.id === "dup")?.name).toBe(
      "First",
    );
    expect(corrupt).toBe(false);
  });

  describe("legacy migration (section 19)", () => {
    it("migrates a legacy config with a lastWorkspacePath into one profile", () => {
      const { config, corrupt } = decodeGlobalConfig(
        JSON.stringify({
          lastWorkspacePath: "/Users/me/vault",
          theme: "dark",
          workspaceToken: "content://x",
        }),
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
      const { config } = decodeGlobalConfig(
        JSON.stringify({ lastWorkspacePath: "/workspace" }),
      );
      expect(config.workspaceProfiles[0].name).toBe("Workspace");
    });

    it("uses the real basename for a Desktop folder that merely happens to be named 'workspace'", () => {
      // Only the exact Android synthetic root path is special-cased; a
      // real Desktop folder whose basename is coincidentally "workspace"
      // (e.g. a common dev-folder name like ~/workspace) must keep its
      // own name rather than being swallowed by that check.
      const { config } = decodeGlobalConfig(
        JSON.stringify({ lastWorkspacePath: "/Users/me/workspace" }),
      );
      expect(config.workspaceProfiles[0].name).toBe("workspace");
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
          workspaceProfiles: [
            {
              id: "p1",
              name: "Existing",
              icon: "folder",
              path: "/vault",
              lastOpenedAt: 1,
            },
          ],
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

describe("fields a newer build wrote (preserved for the next write)", () => {
  it("keeps every top-level field this build does not model, verbatim", () => {
    const future = {
      sidebarDensity: "compact",
      experimental: { flags: [1, 2, { deep: true }], note: null },
      retries: 3,
      disabled: false,
      zero: 0,
      blank: "",
      nothing: null,
    };
    const { preserved, corrupt } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        theme: "dark",
        language: "de",
        activeWorkspaceId: null,
        workspaceProfiles: [],
        lastWorkspacePath: null,
        workspaceToken: "token",
        externalFileOpenEnabled: false,
        ...future,
      }),
    );
    expect(corrupt).toBe(false);
    expect(preserved.fields).toEqual(future);
  });

  it("never lists a field this build models, so it cannot override one", () => {
    const { preserved } = decodeGlobalConfig(
      JSON.stringify({
        version: 2,
        theme: "light",
        language: "en",
        activeWorkspaceId: "p1",
        workspaceProfiles: [],
        lastWorkspacePath: "/stale",
        workspaceToken: "t",
        externalFileOpenEnabled: true,
        futureOnly: 1,
      }),
    );
    expect(Object.keys(preserved.fields)).toEqual(["futureOnly"]);
  });

  it("is empty when there is nothing to keep, for bad input and for a missing file", async () => {
    expect(
      decodeGlobalConfig(JSON.stringify({ theme: "dark" })).preserved,
    ).toEqual({ fields: {} });
    expect(decodeGlobalConfig("{ not valid json").preserved).toEqual({
      fields: {},
    });
    expect(decodeGlobalConfig("[1, 2]").preserved).toEqual({ fields: {} });
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    expect((await loadGlobalConfig()).preserved).toEqual({ fields: {} });
  });

  it("hands every caller its own empty record, so one cannot change another's", async () => {
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const first = await loadGlobalConfig();
    first.preserved.fields.leaked = true;
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const second = await loadGlobalConfig();
    expect(second.preserved.fields).toEqual({});
    expect(decodeGlobalConfig("{ not valid json").preserved.fields).toEqual({});
  });

  it("keeps the unknown fields of a file that is otherwise corrupt", () => {
    const { preserved, corrupt } = decodeGlobalConfig(
      JSON.stringify({ theme: "rainbow", futureOnly: { a: 1 } }),
    );
    expect(corrupt).toBe(true);
    expect(preserved.fields).toEqual({ futureOnly: { a: 1 } });
  });

  it("returns what loadGlobalConfig read from disk", async () => {
    readTextFile.mockResolvedValueOnce(
      JSON.stringify({ version: 2, futureOnly: [true] }),
    );
    expect((await loadGlobalConfig()).preserved.fields).toEqual({
      futureOnly: [true],
    });
  });

  it("keeps a key named __proto__ as a plain own property without touching the prototype", () => {
    const { preserved } = decodeGlobalConfig(
      '{"version":2,"__proto__":{"polluted":true},"futureOnly":1}',
    );
    expect(Object.getPrototypeOf(preserved.fields)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(preserved.fields, "__proto__"),
    ).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(preserved.fields.futureOnly).toBe(1);
  });

  describe("an interface language this build has no catalog for", () => {
    it("is kept as the raw string while the decoded language reads as system", () => {
      const { config, preserved, corrupt } = decodeGlobalConfig(
        JSON.stringify({ version: 2, language: "fr" }),
      );
      expect(config.language).toBe("system");
      expect(preserved.language).toBe("fr");
      expect(corrupt).toBe(false);
    });

    it("is not recorded for a language this build supports, a missing one or a wrong type", () => {
      for (const language of ["system", "en", "de"]) {
        expect(
          decodeGlobalConfig(JSON.stringify({ language })).preserved.language,
        ).toBeUndefined();
      }
      expect(
        decodeGlobalConfig(JSON.stringify({ theme: "dark" })).preserved
          .language,
      ).toBeUndefined();
      for (const language of [42, null, {}, ["fr"], true]) {
        const { preserved, corrupt } = decodeGlobalConfig(
          JSON.stringify({ language }),
        );
        expect(preserved.language).toBeUndefined();
        expect(corrupt).toBe(true);
      }
    });

    it("is never part of the unknown fields", () => {
      const { preserved } = decodeGlobalConfig(
        JSON.stringify({ language: "fr", futureOnly: 1 }),
      );
      expect(preserved.fields).toEqual({ futureOnly: 1 });
    });
  });
});
