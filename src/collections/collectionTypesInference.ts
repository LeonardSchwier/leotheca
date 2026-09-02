import type { ScalarStyle } from "../editor/frontmatterEdits";

/**
 * F09 Phase 1 (spec section 7, "Property type inference"): turns a
 * frontmatter scalar's already-dequoted text (editor/frontmatterEdits.ts's
 * `EditableScalarProperty.value`) plus its original quoting style into one
 * of the indexed value types collectionQuery.ts's evaluator compares
 * against. A quoted value (style "single"/"double") always stays a
 * string, "0012" included, per spec section 7.2's own example; only an
 * unquoted scalar goes through the boolean -> number -> date -> date-time
 * -> string inference order.
 */

export type IndexedValueType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "list"
  | "unsupported";

export type InferredScalar =
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "datetime"; value: string }
  | { type: "string"; value: string };

const BOOLEAN_PATTERN = /^(true|false)$/i;
// Deliberately conservative: a leading/trailing sign, digits, and at most
// one decimal point, no thousands separators, no exponent notation. This
// matches what a hand-written or app-written frontmatter number actually
// looks like far more reliably than trusting `Number(raw)` outright, which
// also accepts "", " ", "0x10", "Infinity", and "NaN" as finite-looking
// input in ways a plain YAML scalar author never intends.
const NUMBER_PATTERN = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Rejects a syntactically-plausible but calendrically-invalid date
 * (`2024-13-40`) that DATE_PATTERN's shape check alone would accept. */
function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function inferScalar(value: string, style: ScalarStyle): InferredScalar {
  if (style !== "plain") return { type: "string", value };

  if (BOOLEAN_PATTERN.test(value)) {
    return { type: "boolean", value: value.toLowerCase() === "true" };
  }
  if (NUMBER_PATTERN.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return { type: "number", value: parsed };
  }
  if (DATE_PATTERN.test(value) && isValidCalendarDate(value)) {
    return { type: "date", value };
  }
  if (DATETIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value))) {
    return { type: "datetime", value };
  }
  return { type: "string", value };
}
