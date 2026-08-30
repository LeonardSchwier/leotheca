/**
 * Pure path-string helpers for absolute, forward-slash workspace paths.
 * A plain string join is safe here on every desktop platform, including
 * Windows: `commands.rs`'s `path_to_string` normalizes every path to
 * forward slashes at the one place a real filesystem path crosses into
 * the frontend, specifically so this module (and fileTreeStore.ts's own
 * small path helpers, dirname/relativePath) never needs to know Windows
 * paths are natively backslash-separated. Kept separate from
 * fileTreeStore.ts's helpers so both the editor (inserting a link to a
 * newly saved attachment) and the preview (resolving that link back to a
 * real file) can share this logic without a new dependency between those
 * two layers.
 */

function normalizeSegments(path: string): string[] {
  const segments: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length > 0) segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments;
}

interface AbsolutePathParts {
  prefix: string;
  segments: string[];
}

function splitAbsolutePath(path: string): AbsolutePathParts | null {
  const forward = path.replace(/\\/g, "/");
  const drive = /^([A-Za-z]:)\//.exec(forward);
  if (drive) {
    return {
      prefix: drive[1].toUpperCase(),
      segments: normalizeSegments(forward.slice(drive[0].length)),
    };
  }
  if (!forward.startsWith("/")) return null;
  return { prefix: "", segments: normalizeSegments(forward) };
}

function joinAbsolutePath(parts: AbsolutePathParts): string {
  const suffix = parts.segments.join("/");
  if (parts.prefix) return suffix ? `${parts.prefix}/${suffix}` : `${parts.prefix}/`;
  return suffix ? `/${suffix}` : "/";
}

function sameVolume(a: AbsolutePathParts, b: AbsolutePathParts): boolean {
  return a.prefix.toUpperCase() === b.prefix.toUpperCase();
}

function isAbsoluteTarget(target: string): boolean {
  const forward = target.replace(/\\/g, "/");
  return forward.startsWith("/") || /^[A-Za-z]:\//.test(forward);
}

function pathIsWithin(root: AbsolutePathParts, candidate: AbsolutePathParts): boolean {
  if (!sameVolume(root, candidate)) return false;
  if (candidate.segments.length < root.segments.length) return false;
  const caseInsensitive = root.prefix !== "";
  return root.segments.every((segment, index) => {
    const other = candidate.segments[index];
    return caseInsensitive ? segment.toLowerCase() === other.toLowerCase() : segment === other;
  });
}

/** Same logic as fileTreeStore.ts's own dirname, deliberately duplicated
 * rather than imported: fileTreeStore.ts pulls in settings/store.ts (and
 * its module-load-time `document` side effects) transitively, which
 * would drag that whole chain into every place that just wants this one
 * pure string operation, including test files (attachments.test.ts,
 * paths.test.ts) that run outside jsdom and have no `document` at all. */
export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Resolves `target` against `baseDir` (an absolute path), the way a
 * browser resolves a relative URL against its base: `..` climbs a
 * directory, `.` is a no-op, and a `target` that is already absolute
 * (starts with `/`) is returned untouched. */
export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target;
  return "/" + normalizeSegments(`${baseDir}/${target}`).join("/");
}

/**
 * Resolves a relative path only when both its base and result stay inside
 * `workspaceRoot`. This is the frontend read-boundary check for user-authored
 * relative paths before they are sent to a native file-read bridge. Absolute
 * targets and traversal that escapes the workspace are rejected. Both slash
 * forms are treated as separators so a Windows-style traversal cannot bypass
 * the same lexical containment rule used by the normalized frontend paths.
 */
export function resolvePathWithinWorkspace(
  workspaceRoot: string,
  baseDir: string,
  target: string,
): string | null {
  if (!target || isAbsoluteTarget(target)) return null;

  const root = splitAbsolutePath(workspaceRoot);
  const base = splitAbsolutePath(baseDir);
  if (!root || !base || !pathIsWithin(root, base)) return null;

  const targetSegments = target.replace(/\\/g, "/").split("/");
  const candidate: AbsolutePathParts = {
    prefix: base.prefix,
    segments: [...base.segments],
  };
  for (const part of targetSegments) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (candidate.segments.length > 0) candidate.segments.pop();
      continue;
    }
    candidate.segments.push(part);
  }

  return pathIsWithin(root, candidate) ? joinAbsolutePath(candidate) : null;
}

/** The inverse of resolvePath: a relative path from `fromDir` to
 * `toPath`, both absolute, e.g. `relativePathBetween("/a/b", "/a/c/d")`
 * -> `"../c/d"`. Used to insert a working markdown link to a newly saved
 * attachment regardless of where it was actually saved (next to the
 * note, or in a configured attachments folder elsewhere in the
 * workspace). */
export function relativePathBetween(fromDir: string, toPath: string): string {
  const fromSegments = normalizeSegments(fromDir);
  const toSegments = normalizeSegments(toPath);

  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++;
  }

  const ups = fromSegments.length - common;
  const downs = toSegments.slice(common);
  const parts = [...Array<string>(ups).fill(".."), ...downs];
  return parts.length > 0 ? parts.join("/") : ".";
}
