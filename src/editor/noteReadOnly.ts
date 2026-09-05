import {
  addFrontmatterProperty,
  parseFrontmatterProperties,
  updateFrontmatterProperty,
} from "./frontmatterEdits";

/** The portable, intentionally non-secret note lock marker. A literal
 * boolean is used so a user can understand and remove it in any editor. */
export const NOTE_READ_ONLY_KEY = "leotheca-read-only";

export function isNoteReadOnly(source: string): boolean {
  const property = parseFrontmatterProperties(source).properties.find(
    (candidate) => candidate.key === NOTE_READ_ONLY_KEY,
  );
  return property?.kind === "scalar" && property.value.trim().toLowerCase() === "true";
}

/** Returns whether the portable marker is currently enforced for this workspace. */
export function isNoteReadOnlyActive(source: string, featureEnabled: boolean): boolean {
  return featureEnabled && isNoteReadOnly(source);
}

/** Updates only the lock marker, preserving unrelated frontmatter. */
export function setNoteReadOnly(source: string, readOnly: boolean): string {
  const properties = parseFrontmatterProperties(source).properties;
  const existing = properties.find((property) => property.key === NOTE_READ_ONLY_KEY);
  if (existing?.kind === "scalar") {
    return updateFrontmatterProperty(source, existing, String(readOnly));
  }
  const withMarker = addFrontmatterProperty(source, NOTE_READ_ONLY_KEY);
  // addFrontmatterProperty deliberately creates an empty quoted scalar for
  // ordinary user fields. This marker is intentionally a YAML boolean,
  // so replace that fresh, exact value once rather than changing the
  // general property editor's serialization rules.
  return withMarker.replace(`${NOTE_READ_ONLY_KEY}: ""`, `${NOTE_READ_ONLY_KEY}: ${readOnly}`);
}
