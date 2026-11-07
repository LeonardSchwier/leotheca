/**
 * Small, dependency-free runtime decoders for persisted JSON (audit
 * follow-up F-008). `JSON.parse(...) as SomeType` only checks that the
 * text is syntactically valid JSON; it says nothing about whether the
 * actual values match the type it's being cast to. A workspace's
 * `.leotheca/settings.json` (or the global config, or bookmarks) is a
 * plain file the user's own sync tool, editor, or a future app version
 * can touch, so a wrong type, an out-of-range number, or an unrecognized
 * enum value reaching the app is a real, expected failure mode, not a
 * hypothetical one.
 *
 * Every decoder here follows the same shape: given a raw value and a
 * fallback, it returns `{ value, corrupt }`. `corrupt: false` covers both
 * "the field was missing" (an ordinary, expected case handled by the
 * fallback) and "the field was present and valid"; `corrupt: true` means
 * the field was present but did not match its expected shape, which is
 * the signal calling code uses to avoid silently persisting a "fixed"
 * file over data that might still be worth the user's own look. A missing
 * field is not corruption, just an older or hand-trimmed file.
 */

export interface DecodedField<T> {
  value: T;
  corrupt: boolean;
}

function missingOrPresent<T>(
  raw: unknown,
  fallback: T,
  isValid: (raw: unknown) => raw is T,
): DecodedField<T> {
  if (raw === undefined) return { value: fallback, corrupt: false };
  if (isValid(raw)) return { value: raw, corrupt: false };
  return { value: fallback, corrupt: true };
}

export function decodeString(
  raw: unknown,
  fallback: string,
): DecodedField<string> {
  return missingOrPresent(
    raw,
    fallback,
    (v): v is string => typeof v === "string",
  );
}

export function decodeNullableString(
  raw: unknown,
  fallback: string | null,
): DecodedField<string | null> {
  return missingOrPresent(
    raw,
    fallback,
    (v): v is string | null => v === null || typeof v === "string",
  );
}

export function decodeBoolean(
  raw: unknown,
  fallback: boolean,
): DecodedField<boolean> {
  return missingOrPresent(
    raw,
    fallback,
    (v): v is boolean => typeof v === "boolean",
  );
}

/** Rejects `NaN`/`Infinity` in addition to the range check: both survive
 * `JSON.parse` only via a caller constructing the object by hand (a real
 * `JSON.stringify` output never contains them), which is exactly the
 * "not written by this app" signal this decoder exists to catch. */
export function decodeNumberInRange(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): DecodedField<number> {
  return missingOrPresent(
    raw,
    fallback,
    (v): v is number =>
      typeof v === "number" && Number.isFinite(v) && v >= min && v <= max,
  );
}

export function decodeEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): DecodedField<T> {
  return missingOrPresent(
    raw,
    fallback,
    (v): v is T =>
      typeof v === "string" && (allowed as readonly string[]).includes(v),
  );
}

export function decodeStringArray(
  raw: unknown,
  fallback: string[],
): DecodedField<string[]> {
  return missingOrPresent(
    raw,
    fallback,
    (v): v is string[] =>
      Array.isArray(v) && v.every((item) => typeof item === "string"),
  );
}

/** A workspace-relative folder fragment (e.g. `WorkspaceSettings.attachmentsFolder`
 * or `.templatesFolder`): rejects an absolute path or a `..` traversal
 * segment, the same shape of check `workspace/paths.ts`'s
 * `resolvePathWithinWorkspace` already applies to a note's own relative
 * links, rather than trusting a persisted string outright. An empty
 * string is valid on its own (it means "no folder configured" for both
 * of these fields), so it is checked before the segment walk, not folded
 * into "missing." */
export function decodeRelativeFolder(
  raw: unknown,
  fallback: string,
): DecodedField<string> {
  return missingOrPresent(raw, fallback, (v): v is string => {
    if (typeof v !== "string") return false;
    if (v === "") return true;
    const forward = v.replace(/\\/g, "/");
    if (forward.startsWith("/") || /^[A-Za-z]:\//.test(forward)) return false;
    return !forward.split("/").some((segment) => segment === "..");
  });
}

/** Decodes an array field where the array shape itself must be right
 * (missing/wrong-typed as a whole falls back to `fallback` and is
 * corrupt), but an individual malformed entry is dropped rather than
 * discarding every entry alongside it: one interactively-added bad group
 * is not a reason to silently forget every other one the user configured
 * by hand. `corrupt` is still set when any entry was dropped, so the
 * caller's overall corruption signal reflects it. */
export function decodeArrayDroppingInvalidEntries<T>(
  raw: unknown,
  fallback: T[],
  isValidEntry: (entry: unknown) => entry is T,
): DecodedField<T[]> {
  if (raw === undefined) return { value: fallback, corrupt: false };
  if (!Array.isArray(raw)) return { value: fallback, corrupt: true };
  const kept = raw.filter(isValidEntry);
  return { value: kept, corrupt: kept.length !== raw.length };
}

/** Folds a list of decoded fields' `corrupt` flags into one boolean, so
 * call sites don't need to `||` them by hand and risk missing one. */
export function anyCorrupt(...fields: Array<{ corrupt: boolean }>): boolean {
  return fields.some((field) => field.corrupt);
}
