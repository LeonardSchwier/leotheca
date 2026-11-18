import { isLanguagePreference, type LanguagePreference } from "../i18n";
import {
  anyCorrupt,
  decodeBoolean,
  decodeEnum,
  decodeNullableString,
  decodeNumberInRange,
  decodeString,
} from "./decode";
import {
  getAppConfigFilePath,
  readTextFile,
  writeTextFile,
} from "../workspace/tauriBridge";

/** The newest `version` this build can read. A file above it was written by a
 * newer build and is left alone (see `decodeGlobalConfig`). */
const NEWEST_READABLE_VERSION = 2;

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
  /** The interface language: `system` follows the device, otherwise a
   * catalog language. App-level, not per workspace: the Welcome dialog shows
   * before any workspace is open. */
  language: LanguagePreference;
  activeWorkspaceId: string | null;
  workspaceProfiles: WorkspaceProfile[];

  // Compatibility mirror for one release cycle (section 19.3): lets the
  // immediately previous app version reopen the most recently active
  // workspace. Not read as the primary source once a v2 catalog exists.
  lastWorkspacePath: string | null;
  workspaceToken?: string;

  /** Desktop only (ROADMAP.md's "Open a Markdown file from outside the
   * workspace via OS file association"): whether opening a `.md` file
   * through the OS's own "Open with"/default-app registration is acted on
   * at all. App-level rather than per-workspace, since the whole point is
   * to work with no workspace open yet -- there may be no
   * `workspaceSettings.json` to hold this when the request arrives.
   * Defaults to on; turning it off does not un-register the OS
   * association itself (that is static, bundled at install time), it only
   * makes an incoming open request a silent no-op, same as this app's
   * other "off" conventions leave existing behavior untouched. */
  externalFileOpenEnabled: boolean;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfigV2 = {
  version: 2,
  theme: "system",
  language: "system",
  activeWorkspaceId: null,
  workspaceProfiles: [],
  lastWorkspacePath: null,
  externalFileOpenEnabled: true,
};

/** Every top-level key this build reads and writes itself. Typed against
 * `GlobalConfigV2`, so a field added there without being listed here does not
 * compile; the rest of the file belongs to another build. */
const MODELED_KEY_FLAGS: Record<keyof GlobalConfigV2, true> = {
  version: true,
  theme: true,
  language: true,
  activeWorkspaceId: true,
  workspaceProfiles: true,
  lastWorkspacePath: true,
  workspaceToken: true,
  externalFileOpenEnabled: true,
};
const MODELED_KEYS: ReadonlySet<string> = new Set(
  Object.keys(MODELED_KEY_FLAGS),
);

/** What a read of `config.json` found that this build cannot model but must
 * not lose when it writes the file back (a newer build's settings).
 *
 * - `fields`: every top-level key outside `MODELED_KEYS`, value verbatim. It
 *   holds none of the keys this build owns, so spreading it first lets the
 *   build's own state win.
 * - `language`: the raw `language` string when it names a language this build
 *   has no catalog for. The decoded `config.language` reads `system` for it;
 *   this keeps the original so a write that does not change the language puts
 *   it back. Absent for a missing, supported or wrong-typed value. */
export interface PreservedGlobalConfig {
  fields: Record<string, unknown>;
  language?: string;
}

/** A fresh record on every call, so no caller can change another's. */
function emptyPreserved(): PreservedGlobalConfig {
  return { fields: {} };
}

/** Built with `Object.fromEntries`, which defines own data properties, so a
 * key named `__proto__` in the file stays plain data and never reaches the
 * prototype. Values are never copied, inspected or evaluated. */
function collectPreserved(
  record: Record<string, unknown>,
): PreservedGlobalConfig {
  const fields = Object.fromEntries(
    Object.entries(record).filter(([key]) => !MODELED_KEYS.has(key)),
  );
  const language = record.language;
  return typeof language === "string" && !isLanguagePreference(language)
    ? { fields, language }
    : { fields };
}

/** A string this build has no catalog for (a language a newer app wrote) is
 * not corruption: it is a harmless preference, and calling it corrupt would
 * block every later config write. It reads as `system` (the raw string is
 * kept in `PreservedGlobalConfig.language` for the next write). Only a value
 * of the wrong type is corrupt. */
function decodeLanguage(raw: unknown): {
  value: LanguagePreference;
  corrupt: boolean;
} {
  if (raw === undefined) return { value: "system", corrupt: false };
  if (typeof raw !== "string") return { value: "system", corrupt: true };
  return { value: isLanguagePreference(raw) ? raw : "system", corrupt: false };
}

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
  const lastOpenedAt = decodeNumberInRange(
    raw.lastOpenedAt,
    0,
    Number.MAX_SAFE_INTEGER,
    0,
  );
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
function decodeWorkspaceProfiles(raw: unknown): {
  value: WorkspaceProfile[];
  corrupt: boolean;
} {
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
 *
 * A `version` above 2 (a newer build wrote the file) is unreadable here:
 * defaults and `corrupt`, nothing migrated, so the bytes stay on disk until
 * the user rewrites them. Like any corrupt file that still parses, it keeps
 * its unknown top-level keys for that explicit rewrite.
 *
 * `preserved` is what the writer must put back (see `PreservedGlobalConfig`).
 * `config` is this build's own view of the file (an unsupported `language`
 * is already `system` there), so callers write `preserved` back and do not
 * rely on whatever else the decoded object happens to carry.
 */
export function decodeGlobalConfig(raw: string): {
  config: GlobalConfigV2;
  corrupt: boolean;
  preserved: PreservedGlobalConfig;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: DEFAULT_GLOBAL_CONFIG,
      corrupt: true,
      preserved: emptyPreserved(),
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      config: DEFAULT_GLOBAL_CONFIG,
      corrupt: true,
      preserved: emptyPreserved(),
    };
  }
  const record = parsed;
  // A file written by a newer build. Its fields may mean something else, and
  // without the v2 catalog marker below it would be read as a v1 file and
  // replaced by one migrated profile on the next write. Unreadable instead.
  if (
    typeof record.version === "number" &&
    record.version > NEWEST_READABLE_VERSION
  ) {
    return {
      config: DEFAULT_GLOBAL_CONFIG,
      corrupt: true,
      preserved: collectPreserved(record),
    };
  }

  const lastWorkspacePath = decodeNullableString(
    record.lastWorkspacePath,
    null,
  );
  const theme = decodeEnum(
    record.theme,
    THEME_PREFERENCES,
    DEFAULT_GLOBAL_CONFIG.theme,
  );
  const language = decodeLanguage(record.language);
  const workspaceTokenCorrupt =
    record.workspaceToken !== undefined &&
    typeof record.workspaceToken !== "string";
  const hasV2Catalog =
    record.version === 2 && Array.isArray(record.workspaceProfiles);
  const profiles = decodeWorkspaceProfiles(record.workspaceProfiles);
  const activeWorkspaceId = decodeNullableString(
    record.activeWorkspaceId,
    null,
  );
  const externalFileOpenEnabled = decodeBoolean(
    record.externalFileOpenEnabled,
    DEFAULT_GLOBAL_CONFIG.externalFileOpenEnabled,
  );

  let workspaceProfiles = profiles.value;
  let resolvedActiveWorkspaceId = activeWorkspaceId.value;

  if (!hasV2Catalog && lastWorkspacePath.value) {
    // Section 19.2: migrate. The final path component is used as the
    // default name when it looks like a real (non-synthetic) Desktop
    // path; the Android synthetic "/workspace" path (compared as the
    // *whole* path, not just its basename, so a real Desktop folder that
    // merely happens to be named "workspace" -- e.g. `~/workspace`, a
    // common dev-folder name -- isn't mistaken for it, mirroring
    // workspaceProfiles.ts's defaultProfileName fix for the identical
    // bug), or any path with no usable basename, falls back to
    // "Workspace" (section 22.2's own fuller Android display-name polish
    // is deferred, see ROADMAP.md).
    const isAndroidSyntheticRoot = lastWorkspacePath.value === "/workspace";
    const basename = isAndroidSyntheticRoot
      ? undefined
      : lastWorkspacePath.value.split("/").filter(Boolean).pop();
    const name = basename ?? "Workspace";
    const migratedId = crypto.randomUUID();
    workspaceProfiles = [
      {
        id: migratedId,
        name,
        icon: "folder",
        path: lastWorkspacePath.value,
        token:
          typeof record.workspaceToken === "string"
            ? record.workspaceToken
            : undefined,
        lastOpenedAt: Date.now(),
      },
    ];
    resolvedActiveWorkspaceId = migratedId;
  }

  const config: GlobalConfigV2 = {
    ...record,
    version: 2,
    theme: theme.value,
    language: language.value,
    activeWorkspaceId: resolvedActiveWorkspaceId,
    workspaceProfiles,
    lastWorkspacePath: lastWorkspacePath.value,
    externalFileOpenEnabled: externalFileOpenEnabled.value,
    ...(workspaceTokenCorrupt ? { workspaceToken: undefined } : {}),
  } as GlobalConfigV2;

  return {
    config,
    preserved: collectPreserved(record),
    corrupt:
      anyCorrupt(
        lastWorkspacePath,
        theme,
        language,
        activeWorkspaceId,
        externalFileOpenEnabled,
      ) ||
      workspaceTokenCorrupt ||
      profiles.corrupt,
  };
}

/** What goes to disk: the modeled fields as this build holds them, except that
 * `language` may be a string only a newer build can show (see
 * `PreservedGlobalConfig`). The writer also carries the preserved top-level
 * keys, which this type does not name. */
export type GlobalConfigFile = Omit<GlobalConfigV2, "language"> & {
  language: string;
};

/** The decoded global configuration together with whether its on-disk source
 * could be read fully as written. Callers use `corrupt` to preserve the
 * original bytes until the user explicitly chooses to rewrite the file. */
export interface GlobalConfigLoadResult {
  config: GlobalConfigV2;
  corrupt: boolean;
  preserved: PreservedGlobalConfig;
}

/** What a rejected read of a file that is not there says. The desktop shell
 * returns the Rust `io::Error` text, whose `(os error 2)` or `(os error 3)`
 * suffix is the same on every OS and in every UI language; the Android plugin
 * says `'readFile' failed because file at '...' does not exist.`; a
 * Node-style error carries `code: "ENOENT"`. A bare `not found` is deliberately
 * not accepted: Windows says `The network path was not found. (os error 53)` for
 * an unreachable share, and reading that as a first launch would bring the
 * original defect back. */
const MISSING_FILE_TEXT: readonly RegExp[] = [
  /\(os error (?:2|3)\)/,
  /no such file or directory/i,
  /cannot find the (?:file|path)/i,
  /does not exist/i,
];

function rejectionText(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    return typeof message === "string" ? message : null;
  }
  return null;
}

/** True only when `error` says the file is missing. Anything else, including a
 * rejection of a shape nobody expected, is "cannot be read": the file is kept.
 * Reading the value never throws (a hostile getter counts as unreadable). */
function isMissingFileError(error: unknown): boolean {
  try {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return true;
    }
    const text = rejectionText(error);
    return (
      text !== null && MISSING_FILE_TEXT.some((pattern) => pattern.test(text))
    );
  } catch {
    return false;
  }
}

export async function loadGlobalConfig(): Promise<GlobalConfigLoadResult> {
  let raw: string;
  try {
    raw = await readTextFile(await globalConfigPath());
  } catch (error) {
    // A first launch has no config file yet, which is not corruption and
    // should not show a recovery warning. Any other failure (permission,
    // I/O, encoding, an unresolved path) leaves a file that may well exist:
    // flag it so no ordinary write replaces it with defaults.
    return {
      config: DEFAULT_GLOBAL_CONFIG,
      corrupt: !isMissingFileError(error),
      preserved: emptyPreserved(),
    };
  }
  return decodeGlobalConfig(raw);
}

export async function saveGlobalConfig(
  config: GlobalConfigFile,
): Promise<void> {
  await writeTextFile(
    await globalConfigPath(),
    JSON.stringify(config, null, 2),
  );
}
