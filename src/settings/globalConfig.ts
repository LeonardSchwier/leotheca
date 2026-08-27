import { getAppConfigFilePath, readTextFile, writeTextFile } from "../workspace/tauriBridge";

/** The tiny OS-level pointer that lets the app reopen the same workspace on
 * next launch. Everything else about a workspace lives inside that
 * workspace's own folder (see workspaceSettings.ts), not here. */
export type ThemePreference = "system" | "light" | "dark";

export interface GlobalConfig {
  lastWorkspacePath: string | null;
  theme: ThemePreference;
  /** Opaque platform-specific token needed to reconnect to the workspace
   * on next launch. Unused on desktop, where the path alone is enough;
   * on Android this holds the persisted SAF tree content:// URI, since
   * the synthetic workspace path carries no information on its own. */
  workspaceToken?: string;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = { lastWorkspacePath: null, theme: "system" };

async function globalConfigPath(): Promise<string> {
  return getAppConfigFilePath("config.json");
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    const raw = await readTextFile(await globalConfigPath());
    return { ...DEFAULT_GLOBAL_CONFIG, ...(JSON.parse(raw) as Partial<GlobalConfig>) };
  } catch {
    return DEFAULT_GLOBAL_CONFIG;
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await writeTextFile(await globalConfigPath(), JSON.stringify(config, null, 2));
}
