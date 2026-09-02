import type { LinkIndex } from "../linking/store";
import type { FrontmatterProperty } from "../editor/frontmatterEdits";
import { inferScalar } from "./collectionTypesInference";
import type {
  QueryClauseV1,
  QueryFieldV1,
  QueryNodeV1,
  QueryOperatorV1,
  QueryValueV1,
  SmartCollectionV1,
} from "./collectionTypes";

/**
 * F09 Phase 1: the pure query evaluator (spec section 6). Operates only on
 * `NoteRecord`s derived from the shared workspace metadata index
 * (linking/store.ts's LinkIndex), never reads a note's own body content,
 * matching FR-13. No scripts, regexes, or SQL are involved anywhere in
 * this file, matching FR-26.
 */

export interface NoteRecord {
  path: string;
  noteName: string;
  folder: string;
  /** Already-lowercased tags, matching linkIndex.tagsByPath's own
   * canonicalization (see tags/tags.ts's extractTags). */
  tags: string[];
  /** Filesystem modification time in epoch milliseconds, absent when the
   * index has none for this note (see LinkIndex.mtimeByPath's own doc
   * comment on when that happens). */
  modified?: number;
  hasFrontmatter: boolean;
  /** Normalized (lowercased) property key -> the frontmatter field as
   * parsed by editor/frontmatterEdits.ts. Case-insensitive lookup per spec
   * section 6.2; a note with two keys differing only by case keeps
   * whichever this Map's construction visits last, a known, documented
   * edge case the spec itself flags as builder-warning territory (out of
   * scope for this read-only phase). */
  properties: Map<string, FrontmatterProperty>;
}

function noteNameFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

function folderFromPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function normalizeKey(key: string): string {
  return key.trim().toLocaleLowerCase();
}

/** Builds the note records the evaluator queries against, from the shared
 * metadata index alone (no file reads). Every note the index knows about
 * appears exactly once, sourced from `backlinksByPath`'s keys the same way
 * TaskHubPanel/TagsPanel already treat it as the authoritative note list. */
export function buildNoteRecords(index: LinkIndex): NoteRecord[] {
  const records: NoteRecord[] = [];
  for (const path of index.backlinksByPath.keys()) {
    const properties = new Map<string, FrontmatterProperty>();
    for (const property of index.frontmatterPropertiesByPath?.get(path) ?? []) {
      properties.set(normalizeKey(property.key), property);
    }
    records.push({
      path,
      noteName: noteNameFromPath(path),
      folder: folderFromPath(path),
      tags: index.tagsByPath.get(path) ?? [],
      modified: index.mtimeByPath?.get(path),
      hasFrontmatter: index.hasFrontmatterByPath?.has(path) ?? false,
      properties,
    });
  }
  return records;
}

function fold(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function textValueOf(value: QueryValueV1 | undefined): string | undefined {
  if (!value) return undefined;
  if (value.type === "string" || value.type === "path") return value.value;
  return undefined;
}

function evaluateStringLike(
  fieldValue: string,
  operator: QueryOperatorV1,
  value: QueryValueV1 | undefined,
): boolean {
  const target = textValueOf(value);
  const folded = fold(fieldValue);
  switch (operator) {
    case "exists":
      return true;
    case "does-not-exist":
      return false;
    case "is":
      return target !== undefined && folded === fold(target);
    case "is-not":
      return target === undefined || folded !== fold(target);
    case "contains":
      return target !== undefined && folded.includes(fold(target));
    case "does-not-contain":
      return target === undefined || !folded.includes(fold(target));
    case "starts-with":
      return target !== undefined && folded.startsWith(fold(target));
    case "ends-with":
      return target !== undefined && folded.endsWith(fold(target));
    default:
      return false;
  }
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function evaluatePathLike(
  fieldValue: string,
  operator: QueryOperatorV1,
  value: QueryValueV1 | undefined,
): boolean {
  const target = textValueOf(value);
  const folded = fold(trimSlashes(fieldValue));
  switch (operator) {
    case "exists":
      return true;
    case "does-not-exist":
      return false;
    case "is":
      return target !== undefined && folded === fold(trimSlashes(target));
    case "is-under-folder":
      return target !== undefined && folded.startsWith(`${fold(trimSlashes(target))}/`);
    case "is-not-under-folder":
      return target === undefined || !folded.startsWith(`${fold(trimSlashes(target))}/`);
    case "contains-segment":
      return (
        target !== undefined &&
        folded.split("/").some((segment) => segment === fold(target))
      );
    default:
      return false;
  }
}

function stringListValueOf(value: QueryValueV1 | undefined): string[] | undefined {
  if (value?.type === "string-list") return value.value;
  return undefined;
}

function evaluateListLike(
  list: string[],
  operator: QueryOperatorV1,
  value: QueryValueV1 | undefined,
): boolean {
  const folded = list.map(fold);
  switch (operator) {
    case "exists":
      return true;
    case "does-not-exist":
      return false;
    case "is-empty":
      return list.length === 0;
    case "is-not-empty":
      return list.length > 0;
    case "contains-item": {
      const item = textValueOf(value);
      return item !== undefined && folded.includes(fold(item));
    }
    case "contains-all-items": {
      const items = stringListValueOf(value);
      return !!items && items.every((item) => folded.includes(fold(item)));
    }
    case "contains-any-item": {
      const items = stringListValueOf(value);
      return !!items && items.some((item) => folded.includes(fold(item)));
    }
    case "contains-no-item": {
      const items = stringListValueOf(value);
      return !!items && !items.some((item) => folded.includes(fold(item)));
    }
    default:
      return false;
  }
}

/** Local (wall-clock) calendar day of a Date, for the "local calendar
 * semantics" date-only comparisons FR-10 and acceptance criterion 7
 * require: two users in different timezones editing the same note on the
 * same wall-clock day must see the same calendar-date match result,
 * which only holds if this is derived from local time components, never
 * from the UTC-anchored instant alone. */
function localCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses an ISO `YYYY-MM-DD` string as a *local* midnight, not a UTC one:
 * `new Date("2024-05-01")` is UUTC-anchored per the ECMAScript spec, which
 * shifts to the previous day once converted back to local components in
 * any negative UTC-offset timezone. Constructing from the numeric parts
 * instead keeps the calendar day stable regardless of the runtime's zone. */
function localMidnightFromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function calendarDateOfEpoch(ms: number): string {
  return localCalendarDate(new Date(ms));
}

function calendarDateOfIsoDate(iso: string): string {
  return localCalendarDate(localMidnightFromIsoDate(iso));
}

function calendarDateOfIsoDateTime(iso: string): string {
  return localCalendarDate(new Date(iso));
}

/** Compares a note-side instant (either a raw epoch or an ISO
 * date/date-time string already known to be one of those two shapes)
 * against a clause's date-or-date-time value, per spec section 6.4: a
 * "date" value compares local calendar days; a "datetime" value compares
 * exact instants. */
function evaluateDateLike(
  fieldValue: number | { iso: string; kind: "date" | "datetime" },
  operator: QueryOperatorV1,
  value: QueryValueV1 | undefined,
): boolean {
  if (operator === "exists") return true;
  if (operator === "does-not-exist") return false;
  if (!value || (value.type !== "date" && value.type !== "datetime")) return false;

  if (value.type === "date") {
    const fieldCalendarDate =
      typeof fieldValue === "number"
        ? calendarDateOfEpoch(fieldValue)
        : fieldValue.kind === "date"
          ? calendarDateOfIsoDate(fieldValue.iso)
          : calendarDateOfIsoDateTime(fieldValue.iso);
    const targetCalendarDate = value.value;
    switch (operator) {
      case "is":
        return fieldCalendarDate === targetCalendarDate;
      case "before":
        return fieldCalendarDate < targetCalendarDate;
      case "on-or-before":
        return fieldCalendarDate <= targetCalendarDate;
      case "after":
        return fieldCalendarDate > targetCalendarDate;
      case "on-or-after":
        return fieldCalendarDate >= targetCalendarDate;
      default:
        return false;
    }
  }

  const fieldInstant =
    typeof fieldValue === "number"
      ? fieldValue
      : fieldValue.kind === "date"
        ? localMidnightFromIsoDate(fieldValue.iso).getTime()
        : new Date(fieldValue.iso).getTime();
  const targetInstant = Date.parse(value.value);
  if (Number.isNaN(targetInstant)) return false;
  switch (operator) {
    case "is":
      return fieldInstant === targetInstant;
    case "before":
      return fieldInstant < targetInstant;
    case "on-or-before":
      return fieldInstant <= targetInstant;
    case "after":
      return fieldInstant > targetInstant;
    case "on-or-after":
      return fieldInstant >= targetInstant;
    default:
      return false;
  }
}

/** Evaluates a clause against a property whose presence is already
 * confirmed (the caller handles `exists`/`does-not-exist`, which apply
 * uniformly to any present key regardless of type, per spec section 7.4).
 * A list-shaped property uses the list operators; an unsupported
 * (`readonly`) property never matches a typed comparison, only `exists`;
 * a scalar property is run through type inference and only matches an
 * operator whose family agrees with the inferred type, per section 7.3's
 * "incompatible note values do not match that typed clause." */
function evaluatePropertyClause(
  property: FrontmatterProperty,
  operator: QueryOperatorV1,
  value: QueryValueV1 | undefined,
): boolean {
  if (property.kind === "list") {
    return evaluateListLike(property.value, operator, value);
  }
  if (property.kind === "readonly") {
    return false;
  }

  const inferred = inferScalar(property.value, property.style);
  switch (inferred.type) {
    case "string":
      return evaluateStringLike(inferred.value, operator, value);
    case "boolean":
      if (operator === "is-true") return inferred.value;
      if (operator === "is-false") return !inferred.value;
      return false;
    case "number": {
      if (value?.type !== "number") return false;
      switch (operator) {
        case "equals":
          return inferred.value === value.value;
        case "does-not-equal":
          return inferred.value !== value.value;
        case "greater-than":
          return inferred.value > value.value;
        case "greater-than-or-equal":
          return inferred.value >= value.value;
        case "less-than":
          return inferred.value < value.value;
        case "less-than-or-equal":
          return inferred.value <= value.value;
        default:
          return false;
      }
    }
    case "date":
      return evaluateDateLike({ iso: inferred.value, kind: "date" }, operator, value);
    case "datetime":
      return evaluateDateLike({ iso: inferred.value, kind: "datetime" }, operator, value);
    default:
      return false;
  }
}

function evaluateClause(clause: QueryClauseV1, note: NoteRecord): boolean {
  const { field, operator, value } = clause;

  if (field.kind === "property") {
    const property = note.properties.get(normalizeKey(field.key));
    if (operator === "exists") return property !== undefined;
    if (operator === "does-not-exist") return property === undefined;
    if (!property) return false;
    return evaluatePropertyClause(property, operator, value);
  }

  switch (field.field) {
    case "name":
      return evaluateStringLike(note.noteName, operator, value);
    case "path":
      return evaluatePathLike(note.path, operator, value);
    case "folder":
      return evaluatePathLike(note.folder, operator, value);
    case "tag":
      return evaluateListLike(note.tags, operator, value);
    case "modified":
      if (operator === "exists") return note.modified !== undefined;
      if (operator === "does-not-exist") return note.modified === undefined;
      if (note.modified === undefined) return false;
      return evaluateDateLike(note.modified, operator, value);
    case "hasFrontmatter":
      if (operator === "exists") return true;
      if (operator === "does-not-exist") return false;
      if (operator === "is-true") return note.hasFrontmatter;
      if (operator === "is-false") return !note.hasFrontmatter;
      return false;
    default:
      return false;
  }
}

/** Evaluates one query node (spec section 6.1): an empty AND group matches
 * every note, an empty OR group matches none, exactly as specified. */
export function evaluateQueryNode(node: QueryNodeV1, note: NoteRecord): boolean {
  if (node.type === "clause") return evaluateClause(node, note);
  if (node.children.length === 0) return node.operator === "and";
  return node.operator === "and"
    ? node.children.every((child) => evaluateQueryNode(child, note))
    : node.children.some((child) => evaluateQueryNode(child, note));
}

/** Every note matching a collection's query, sorted by normalized path
 * ascending (spec section 9.5's tie-breaker; full multi-key sort
 * configuration is Phase 2 scope per this feature's own rollout plan, see
 * ROADMAP.md's F09 Phase 1 entry). */
export function evaluateCollection(
  collection: SmartCollectionV1,
  notes: NoteRecord[],
): NoteRecord[] {
  return notes
    .filter((note) => evaluateQueryNode(collection.query, note))
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));
}

export type { QueryFieldV1 };
