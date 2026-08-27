import { describe, expect, it, vi } from "vitest";
import { loadGlobalConfig, saveGlobalConfig, type GlobalConfig } from "./globalConfig";

const { readTextFile, writeTextFile, getAppConfigFilePath } = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

vi.mock("../workspace/tauriBridge", () => ({ readTextFile, writeTextFile, getAppConfigFilePath }));

describe("loadGlobalConfig", () => {
  it("falls back to defaults when the config file doesn't exist yet", async () => {
    readTextFile.mockRejectedValueOnce(new Error("not found"));
    const config = await loadGlobalConfig();
    expect(config).toEqual({ lastWorkspacePath: null, theme: "system" });
  });

  it("fills in fields missing from an older config file with today's defaults", async () => {
    readTextFile.mockResolvedValueOnce(JSON.stringify({ theme: "dark" }));
    const config = await loadGlobalConfig();
    expect(config.theme).toBe("dark");
    expect(config.lastWorkspacePath).toBeNull();
  });

  it("keeps every field from a config file that already has them all, including the Android-only token", async () => {
    const saved: GlobalConfig = {
      lastWorkspacePath: "/vault",
      theme: "light",
      workspaceToken: "content://tree/abc",
    };
    readTextFile.mockResolvedValueOnce(JSON.stringify(saved));
    const config = await loadGlobalConfig();
    expect(config).toEqual(saved);
  });
});

describe("saveGlobalConfig", () => {
  it("writes to the app config directory's config.json", async () => {
    const config: GlobalConfig = { lastWorkspacePath: "/vault", theme: "system" };
    await saveGlobalConfig(config);
    expect(getAppConfigFilePath).toHaveBeenCalledWith("config.json");
    expect(writeTextFile).toHaveBeenCalledWith("/config/config.json", JSON.stringify(config, null, 2));
  });
});
