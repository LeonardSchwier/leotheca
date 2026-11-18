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
    readTextFile.mockRejectedValueOnce(
      new Error("No such file or directory (os error 2)"),
    );
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
    readTextFile.mockRejectedValueOnce(
      new Error("No such file or directory (os error 2)"),
    );
    expect((await loadGlobalConfig()).preserved).toEqual({ fields: {} });
  });

  it("hands every caller its own empty record, so one cannot change another's", async () => {
    readTextFile.mockRejectedValueOnce(
      new Error("No such file or directory (os error 2)"),
    );
    const first = await loadGlobalConfig();
    first.preserved.fields.leaked = true;
    readTextFile.mockRejectedValueOnce(
      new Error("No such file or directory (os error 2)"),
    );
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

describe("loadGlobalConfig: a file that is missing versus a file that cannot be read", () => {
  const MISSING = [
    [
      "a Rust io error on Linux and macOS",
      "No such file or directory (os error 2)",
    ],
    [
      "a Rust io error on a localized Windows",
      "Das System kann die angegebene Datei nicht finden. (os error 2)",
    ],
    [
      "a Rust io error for a missing folder on Windows",
      "Das System kann den angegebenen Pfad nicht finden. (os error 3)",
    ],
    [
      "a Windows message in English",
      "The system cannot find the file specified.",
    ],
    [
      "a Windows message for a folder in English",
      "The system cannot find the path specified.",
    ],
    ["a Rust io error without its suffix", "No such file or directory"],
    [
      "the Capacitor plugin on Android",
      "'readFile' failed because file at '/data/user/0/app/files/config.json' does not exist.",
    ],
  ] as const;

  it.each(MISSING)("reads %s as a first launch", async (_label, message) => {
    readTextFile.mockRejectedValueOnce(message);
    const first = await loadGlobalConfig();
    expect(first.corrupt).toBe(false);
    expect(first.config).toEqual(DEFAULTS);
    readTextFile.mockRejectedValueOnce(new Error(message));
    expect((await loadGlobalConfig()).corrupt).toBe(false);
  });

  it("reads an ENOENT error code as a first launch", async () => {
    readTextFile.mockRejectedValueOnce(
      Object.assign(new Error("open failed"), { code: "ENOENT" }),
    );
    expect((await loadGlobalConfig()).corrupt).toBe(false);
  });

  const UNREADABLE = [
    ["a permission error", "Permission denied (os error 13)"],
    ["an I/O error", "Input/output error (os error 5)"],
    ["a file that is not UTF-8", "stream did not contain valid UTF-8"],
    ["a path that is not allowed", "path is outside the allowed directories"],
    ["a locked file", "The process cannot access the file (os error 32)"],
    [
      "an unreachable network share",
      "The network path was not found. (os error 53)",
    ],
    ["a bare not found", "not found"],
  ] as const;

  it.each(UNREADABLE)(
    "keeps the file and flags it when the read fails with %s",
    async (_label, message) => {
      readTextFile.mockRejectedValueOnce(message);
      const asString = await loadGlobalConfig();
      expect(asString.corrupt).toBe(true);
      expect(asString.config).toEqual(DEFAULTS);
      expect(asString.preserved).toEqual({ fields: {} });
      readTextFile.mockRejectedValueOnce(new Error(message));
      expect((await loadGlobalConfig()).corrupt).toBe(true);
    },
  );

  it("flags the file when the config path cannot be resolved", async () => {
    getAppConfigFilePath.mockRejectedValueOnce(new Error("no app data dir"));
    const result = await loadGlobalConfig();
    expect(result.corrupt).toBe(true);
    expect(result.config).toEqual(DEFAULTS);
  });

  const odd: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an empty object", {}],
    ["an object whose message is not text", { message: 7 }],
    ["an object that cannot become text", Object.create(null)],
    [
      "an object whose message getter throws",
      {
        get message(): string {
          throw new Error("boom");
        },
      },
    ],
    [
      "an object whose code getter throws",
      {
        get code(): string {
          throw new Error("boom");
        },
      },
    ],
    [
      "an object whose text says the file is missing, never turned into text",
      {
        toString() {
          return "No such file or directory (os error 2)";
        },
      },
    ],
  ];

  it.each(odd)(
    "does not throw for a rejection with %s and keeps the file",
    async (_label, value) => {
      readTextFile.mockRejectedValueOnce(value);
      const result = await loadGlobalConfig();
      expect(result.corrupt).toBe(true);
      expect(result.config).toEqual(DEFAULTS);
    },
  );

  it("hands every caller its own empty record when the file is unreadable", async () => {
    readTextFile.mockRejectedValueOnce("Permission denied (os error 13)");
    const first = await loadGlobalConfig();
    first.preserved.fields.leaked = true;
    readTextFile.mockRejectedValueOnce("Permission denied (os error 13)");
    expect((await loadGlobalConfig()).preserved.fields).toEqual({});
  });
});

describe("decodeGlobalConfig: a file written by a newer build", () => {
  const catalog = {
    version: 3,
    theme: "dark",
    language: "de",
    activeWorkspaceId: "p1",
    workspaceProfiles: [
      {
        id: "p1",
        name: "Notes",
        icon: "book",
        path: "/home/erika/notes",
        lastOpenedAt: 1700000000000,
      },
      {
        id: "p2",
        name: "Work",
        icon: "briefcase",
        path: "/home/erika/work",
        lastOpenedAt: 1700000001000,
      },
    ],
    lastWorkspacePath: "/home/erika/notes",
    externalFileOpenEnabled: false,
    futureOnly: { a: 1 },
  };

  it("is unreadable, with this build's defaults and nothing to adopt", () => {
    const result = decodeGlobalConfig(JSON.stringify(catalog));
    expect(result.corrupt).toBe(true);
    expect(result.config).toEqual(DEFAULTS);
  });

  it("keeps its unknown keys for the explicit rewrite, like any corrupt file that parses", () => {
    const result = decodeGlobalConfig(
      JSON.stringify({ ...catalog, language: "fr" }),
    );
    expect(result.preserved).toEqual({
      fields: { futureOnly: { a: 1 } },
      language: "fr",
    });
  });

  it("reads a version too large for a number as newer too", () => {
    expect(decodeGlobalConfig('{"version": 1e999}').corrupt).toBe(true);
  });

  it("does not migrate the legacy path of a newer file into a profile", () => {
    const { config } = decodeGlobalConfig(
      JSON.stringify({ version: 3, lastWorkspacePath: "/home/erika/notes" }),
    );
    expect(config.workspaceProfiles).toEqual([]);
    expect(config.activeWorkspaceId).toBeNull();
    expect(config.lastWorkspacePath).toBeNull();
  });

  it.each([3, 4, 2.5, 1e9, Number.MAX_SAFE_INTEGER])(
    "treats version %s as newer",
    (version) => {
      expect(
        decodeGlobalConfig(JSON.stringify({ version, theme: "dark" })).corrupt,
      ).toBe(true);
    },
  );

  it("treats a newer version without any catalog as newer too", () => {
    const result = decodeGlobalConfig(JSON.stringify({ version: 3 }));
    expect(result.corrupt).toBe(true);
    expect(result.config).toEqual(DEFAULTS);
  });

  it("still reads versions 2, 1 and a missing version as before", () => {
    const v2 = decodeGlobalConfig(
      JSON.stringify({ ...catalog, version: 2, futureOnly: undefined }),
    );
    expect(v2.corrupt).toBe(false);
    expect(v2.config.workspaceProfiles).toHaveLength(2);
    expect(v2.config.theme).toBe("dark");

    const v1 = decodeGlobalConfig(
      JSON.stringify({ version: 1, lastWorkspacePath: "/home/erika/notes" }),
    );
    expect(v1.corrupt).toBe(false);
    expect(v1.config.workspaceProfiles).toHaveLength(1);

    const none = decodeGlobalConfig(
      JSON.stringify({ lastWorkspacePath: "/home/erika/notes" }),
    );
    expect(none.corrupt).toBe(false);
    expect(none.config.workspaceProfiles).toHaveLength(1);
  });

  it("does not take a string or a null version for a newer one", () => {
    expect(
      decodeGlobalConfig(JSON.stringify({ version: "3", theme: "dark" }))
        .corrupt,
    ).toBe(false);
    expect(
      decodeGlobalConfig('{"version": null, "theme": "dark"}').corrupt,
    ).toBe(false);
  });
});
