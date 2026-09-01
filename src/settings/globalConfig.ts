import { anyCorrupt, decodeEnum, decodeNullableString } from "./decode";
import {
  getAppConfigFilePath,
  readTextFile,
  writeTextFile,
} from "../workspace/tauriBridge";

/** The tiny OS-level pointer that lets the app reopen the same workspace on
 * next launch. Everything else about a workspace lives inside that
 * workspace's own folder (see workspaceSettings.ts), not here. */
export type ThemePreference = "system" | "light" | "dark";
const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export interface GlobalConfig {
  lastWorkspacePath: string | null;
  theme: ThemePreference;
  /** Opaque platform-specific token needed to reconnect to the workspace
   * on next launch. Unused on desktop, where the path alone is enough;
   * on Android this holds the persisted SAF tree content:// URI, since
   * the synthetic workspace path carries no information on its own. */
  workspaceToken?: string;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  lastWorkspacePath: null,
  theme: "system",
};

async function globalConfigPath(): Promise<string> {
  return getAppConfigFilePath("config.json");
}

/** Audit follow-up F-008: rejects a wrong-typed `lastWorkspacePath` or an
 * unrecognized `theme` value instead of letting it flow into
 * `restoreWorkspaceAccess`/the `data-theme` attribute unchecked.
 * `workspaceToken` is intentionally left as whatever the record holds
 * (or absent) rather than decoded against a fixed shape: it is opaque
 * platform-specific data this module never inspects, only round-trips.
 * Exported so its fixtures can exercise it directly, without a native
 * file read in the way. Unlike workspace settings, a corrupt global
 * config has no dedicated recovery UI: it is far smaller, and every
 * normal action that touches it (opening a workspace, changing the
 * theme) is itself a genuine, user-initiated save, not a silent one. */
export function decodeGlobalConfig(raw: string): {
  config: GlobalConfig;
  corrupt: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: DEFAULT_GLOBAL_CONFIG, corrupt: true };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { config: DEFAULT_GLOBAL_CONFIG, corrupt: true };
  }
  const record = parsed as Record<string, unknown>;

  const lastWorkspacePath = decodeNullableString(
    record.lastWorkspacePath,
    DEFAULT_GLOBAL_CONFIG.lastWorkspacePath,
  );
  const theme = decodeEnum(
    record.theme,
    THEME_PREFERENCES,
    DEFAULT_GLOBAL_CONFIG.theme,
  );
  const workspaceTokenCorrupt =
    record.workspaceToken !== undefined &&
    typeof record.workspaceToken !== "string";

  const config: GlobalConfig = {
    ...record,
    lastWorkspacePath: lastWorkspacePath.value,
    theme: theme.value,
    ...(workspaceTokenCorrupt ? { workspaceToken: undefined } : {}),
  } as GlobalConfig;

  return {
    config,
    corrupt: anyCorrupt(lastWorkspacePath, theme) || workspaceTokenCorrupt,
  };
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  let raw: string;
  try {
    raw = await readTextFile(await globalConfigPath());
  } catch {
    return DEFAULT_GLOBAL_CONFIG;
  }
  return decodeGlobalConfig(raw).config;
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await writeTextFile(
    await globalConfigPath(),
    JSON.stringify(config, null, 2),
  );
}
