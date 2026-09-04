import { anyCorrupt, decodeEnum, decodeNullableString, decodeNumberInRange, decodeString } from "./decode";
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

/** F20 Phase 1, spec `leotheca-workspace-profiles-sdd.md` section 7.4: a
 * fixed, application-bundled icon enum, not arbitrary emoji or uploaded
 * images. `WorkspaceProfile.icon` is typed as `WorkspaceIcon | string`
 * (not narrowed to this union alone), matching the spec's own forward-
 * compatibility requirement that an unknown future icon value is
 * preserved in configuration and falls back to `folder` only for
 * *display*, never silently rewritten to `folder` in the persisted file. */
export type WorkspaceIcon =
  | "folder"
  | "book"
  | "journal"
  | "briefcase"
  | "school"
  | "code"
  | "home"
  | "archive";

export const WORKSPACE_ICONS: readonly WorkspaceIcon[] = [
  "folder",
  "book",
  "journal",
  "briefcase",
  "school",
  "code",
  "home",
  "archive",
];

/** One catalog entry (section 18.1). `id` is the stable, never-reused
 * application identity (section 12.1); `path`/`token` together are the
 * platform locator this profile resolves to (an Android profile's `path`
 * is always the synthetic `/workspace`, distinguished only by `token`,
 * per section 12.3). `icon` is intentionally `WorkspaceIcon | string` (see
 * that type's own doc comment) so an unrecognized value round-trips
 * instead of being coerced at decode time. */
export interface WorkspaceProfile {
  id: string;
  name: string;
  icon: WorkspaceIcon | string;
  path: string;
  token?: string;
  lastOpenedAt: number;
}

export interface GlobalConfigV2 {
  version: 2;
  theme: ThemePreference;
  activeWorkspaceId: string | null;
  workspaceProfiles: WorkspaceProfile[];

  // Compatibility mirror for one release cycle (section 19.3): lets the
  // immediately previous app version reopen the most recently active
  // workspace. Not read as the primary source once a v2 catalog exists.
  lastWorkspacePath: string | null;
  workspaceToken?: string;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfigV2 = {
  version: 2,
  theme: "system",
  activeWorkspaceId: null,
  workspaceProfiles: [],
  lastWorkspacePath: null,
};

async function globalConfigPath(): Promise<string> {
  return getAppConfigFilePath("config.json");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decodes one profile record. A malformed record (per section 18.2's
 * required fields) is dropped rather than repaired, a disclosed
 * narrowing of section 18.3's fuller "retain unrecognized records
 * verbatim for explicit user repair" requirement: this scanner keeps
 * every *other* valid profile and every unrelated top-level field intact
 * (the practical protection users actually need — one bad entry cannot
 * erase the rest of the catalog), but does not itself preserve a dropped
 * record's own bytes for a future recovery UI, since no such UI exists
 * yet (see ROADMAP.md's F20 Phase 2 entry). Unknown fields *inside* a
 * recognized record are preserved via the trailing spread, the same
 * technique the top-level decoder below uses. */
function decodeWorkspaceProfile(raw: unknown): WorkspaceProfile | null {
  if (!isPlainObject(raw)) return null;
  const id = decodeString(raw.id, "");
  const path = decodeString(raw.path, "");
  const name = decodeString(raw.name, "");
  const icon = decodeString(raw.icon, "folder");
  const lastOpenedAt = decodeNumberInRange(raw.lastOpenedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const tokenCorrupt = raw.token !== undefined && typeof raw.token !== "string";
  if (id.corrupt || id.value === "") return null;
  if (path.corrupt || path.value === "") return null;
  if (name.corrupt || name.value === "") return null;
  if (lastOpenedAt.corrupt) return null;
  if (tokenCorrupt) return null;

  return {
    ...raw,
    id: id.value,
    name: name.value,
    icon: icon.value,
    path: path.value,
    token: raw.token as string | undefined,
    lastOpenedAt: lastOpenedAt.value,
  } as WorkspaceProfile;
}

/** Drops a malformed entry rather than the whole array, mirroring
 * `decodeArrayDroppingInvalidEntries`'s own convention elsewhere in this
 * codebase; kept as a dedicated function here (rather than reusing that
 * helper directly) since a profile record needs its own per-field
 * decoding, not a single type-guard predicate. Duplicate valid IDs are
 * intentionally left in the array rather than deduplicated here: every
 * lookup elsewhere in this feature resolves by `Array.prototype.find`,
 * which always returns the first match, so the runtime view already
 * resolves a duplicate deterministically (section 18.3) without a
 * separate dedup pass or losing track of which record "won." */
function decodeWorkspaceProfiles(raw: unknown): { value: WorkspaceProfile[]; corrupt: boolean } {
  if (raw === undefined) return { value: [], corrupt: false };
  if (!Array.isArray(raw)) return { value: [], corrupt: true };
  const decoded = raw.map(decodeWorkspaceProfile);
  const kept = decoded.filter((p): p is WorkspaceProfile => p !== null);
  return { value: kept, corrupt: kept.length !== decoded.length };
}

/** Audit follow-up F-008 (extended by F20 Phase 1): rejects a wrong-typed
 * field rather than letting it flow into `restoreWorkspaceAccess`/the
 * `data-theme` attribute/profile activation unchecked. `workspaceToken`
 * is intentionally left as whatever the record holds (or absent) rather
 * than decoded against a fixed shape: it is opaque platform-specific
 * data this module never inspects, only round-trips.
 *
 * Migration (section 19): a document with no recognized `workspaceProfiles`
 * array and a non-null `lastWorkspacePath` is treated as legacy v1 and
 * migrated in-memory into a single profile, per section 19.2. This
 * function never writes the migrated result itself — `store.ts` persists
 * it only after that workspace has actually opened, per section 19.2's
 * own "persist only after... opened successfully" rule (or, for an
 * explicit user edit unrelated to opening a workspace at all, whenever
 * that edit's own write happens to occur).
 */
export function decodeGlobalConfig(raw: string): {
  config: GlobalConfigV2;
  corrupt: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: DEFAULT_GLOBAL_CONFIG, corrupt: true };
  }
  if (!isPlainObject(parsed)) {
    return { config: DEFAULT_GLOBAL_CONFIG, corrupt: true };
  }
  const record = parsed;

  const lastWorkspacePath = decodeNullableString(record.lastWorkspacePath, null);
  const theme = decodeEnum(record.theme, THEME_PREFERENCES, DEFAULT_GLOBAL_CONFIG.theme);
  const workspaceTokenCorrupt = record.workspaceToken !== undefined && typeof record.workspaceToken !== "string";
  const hasV2Catalog = record.version === 2 && Array.isArray(record.workspaceProfiles);
  const profiles = decodeWorkspaceProfiles(record.workspaceProfiles);
  const activeWorkspaceId = decodeNullableString(record.activeWorkspaceId, null);

  let workspaceProfiles = profiles.value;
  let resolvedActiveWorkspaceId = activeWorkspaceId.value;

  if (!hasV2Catalog && lastWorkspacePath.value) {
    // Section 19.2: migrate. The final path component is used as the
    // default name when it looks like a real (non-synthetic) Desktop
    // path; the Android synthetic "/workspace" path, or any path with no
    // usable basename, falls back to "Workspace" (section 22.2's own
    // fuller Android display-name polish is deferred, see ROADMAP.md).
    const basename = lastWorkspacePath.value.split("/").filter(Boolean).pop();
    const name = basename && basename !== "workspace" ? basename : "Workspace";
    const migratedId = crypto.randomUUID();
    workspaceProfiles = [
      {
        id: migratedId,
        name,
        icon: "folder",
        path: lastWorkspacePath.value,
        token: typeof record.workspaceToken === "string" ? record.workspaceToken : undefined,
        lastOpenedAt: Date.now(),
      },
    ];
    resolvedActiveWorkspaceId = migratedId;
  }

  const config: GlobalConfigV2 = {
    ...record,
    version: 2,
    theme: theme.value,
    activeWorkspaceId: resolvedActiveWorkspaceId,
    workspaceProfiles,
    lastWorkspacePath: lastWorkspacePath.value,
    ...(workspaceTokenCorrupt ? { workspaceToken: undefined } : {}),
  } as GlobalConfigV2;

  return {
    config,
    corrupt: anyCorrupt(lastWorkspacePath, theme, activeWorkspaceId) || workspaceTokenCorrupt || profiles.corrupt,
  };
}

/** The decoded global configuration together with whether its on-disk source
 * could be read fully as written. Callers use `corrupt` to preserve the
 * original bytes until the user explicitly chooses to rewrite the file. */
export interface GlobalConfigLoadResult {
  config: GlobalConfigV2;
  corrupt: boolean;
}

export async function loadGlobalConfig(): Promise<GlobalConfigLoadResult> {
  let raw: string;
  try {
    raw = await readTextFile(await globalConfigPath());
  } catch {
    // A first launch has no config file yet, which is not corruption and
    // should not show a recovery warning.
    return { config: DEFAULT_GLOBAL_CONFIG, corrupt: false };
  }
  return decodeGlobalConfig(raw);
}

export async function saveGlobalConfig(config: GlobalConfigV2): Promise<void> {
  await writeTextFile(
    await globalConfigPath(),
    JSON.stringify(config, null, 2),
  );
}
