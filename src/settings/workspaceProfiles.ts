import type { WorkspaceIcon, WorkspaceProfile } from "./globalConfig";
import { WORKSPACE_ICONS } from "./globalConfig";

/** Pure validation/sort/naming/dedup helpers for workspace profiles (F20
 * Phase 1/2a, spec `leotheca-workspace-profiles-sdd.md` sections 7.5, 12,
 * 13.1). No signal reads, no platform calls: every function here is a
 * plain data transform, so `settings/store.ts`'s actions stay thin
 * wrappers around them plus the transition coordinator, and both sides
 * are independently testable. */

const MAX_PROFILE_NAME_LENGTH = 80;

/** Section 13.1: names are trimmed, non-empty, contain no line breaks, and
 * contain at most 80 Unicode scalar values. JavaScript string length counts
 * UTF-16 code units, so Array.from is deliberate here: supplementary-plane
 * characters count as one scalar rather than two. Returns `null` instead of
 * silently truncating an invalid user edit. */
export function normalizeProfileName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "" || /[\r\n]/.test(trimmed)) return null;
  const scalars = Array.from(trimmed);
  if (scalars.length > MAX_PROFILE_NAME_LENGTH) return null;
  return trimmed;
}

/** Section 11 step 6's default-name fallback chain for a brand-new
 * profile: an explicit suggested name, else the Desktop folder's own
 * basename (when it isn't the Android synthetic root), else a plain
 * "Workspace". Mirrors `globalConfig.ts`'s own legacy-migration naming
 * exactly, so a freshly added profile and a migrated one pick a default
 * name the same way. */
export function defaultProfileName(path: string, suggestedName?: string): string {
  const suggested = suggestedName ? normalizeProfileName(suggestedName) : null;
  if (suggested) return suggested;
  const basename = path.split("/").filter(Boolean).pop();
  if (basename && basename !== "workspace") {
    const normalized = normalizeProfileName(basename);
    if (normalized) return normalized;
  }
  return "Workspace";
}

/** Section 7.4: an icon value outside the bundled enum still round-trips
 * through persistence (see `WorkspaceProfile.icon`'s own doc comment) but
 * must never be *chosen* through the UI's icon picker, and falls back to
 * `folder` for display. */
export function isKnownWorkspaceIcon(icon: string): icon is WorkspaceIcon {
  return (WORKSPACE_ICONS as readonly string[]).includes(icon);
}

export function displayWorkspaceIcon(icon: string): WorkspaceIcon {
  return isKnownWorkspaceIcon(icon) ? icon : "folder";
}

/** Section 12.2: the locator key used only for duplicate detection, never
 * persisted as a second source of truth. A non-empty token (Android, or
 * any future platform that supplies one) is the exact identity; a
 * Desktop profile with no token is identified by its path alone.
 * Deliberately exact string comparison rather than a platform-aware
 * case-folding normalization: `pickWorkspaceFolder` always returns the
 * OS's own canonical-cased string for a given folder, so two picks of
 * the same real folder already produce identical strings in practice,
 * and a real case-insensitive-filesystem normalizer needs a platform
 * signal this frontend does not currently expose (disclosed narrowing,
 * see ROADMAP.md). */
export function workspaceLocatorKey(path: string, token: string | undefined): string {
  return token ? `token:${token}` : `path:${path}`;
}

/** Section 11 step 4-5: finds an existing profile whose locator matches a
 * freshly picked folder, so `addWorkspaceFromPicker` activates it instead
 * of creating a duplicate catalog entry. */
export function findProfileByLocator(
  profiles: readonly WorkspaceProfile[],
  path: string,
  token: string | undefined,
): WorkspaceProfile | undefined {
  const key = workspaceLocatorKey(path, token);
  return profiles.find((p) => workspaceLocatorKey(p.path, p.token) === key);
}

/** Section 7.5: descending `lastOpenedAt`, ties broken by case-insensitive
 * name and then stable ID. Returns a new array; never mutates its input,
 * since callers hold this as `readonly WorkspaceProfileView[]` signal
 * state. */
export function sortWorkspaceProfiles(profiles: readonly WorkspaceProfile[]): WorkspaceProfile[] {
  return [...profiles].sort((a, b) => {
    if (a.lastOpenedAt !== b.lastOpenedAt) return b.lastOpenedAt - a.lastOpenedAt;
    const nameCompare = a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
    if (nameCompare !== 0) return nameCompare;
    return a.id.localeCompare(b.id);
  });
}

/** Section 10.2: case-insensitive match against the display name and,
 * Desktop only, the folder basename and full path text. An Android
 * profile's `path` is always the synthetic `/workspace` root and its
 * `token` is never searchable, so only `name` ever matches for one. */
export function matchesWorkspaceSearch(profile: WorkspaceProfile, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  if (profile.name.toLocaleLowerCase().includes(q)) return true;
  if (profile.token) return false;
  const basename = profile.path.split("/").filter(Boolean).pop() ?? "";
  return basename.toLocaleLowerCase().includes(q) || profile.path.toLocaleLowerCase().includes(q);
}
