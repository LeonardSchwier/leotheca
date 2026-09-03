import type { LinkIndex } from "../linking/store";
import type { FrontmatterProperty } from "../editor/frontmatterEdits";
import { inferScalar } from "./collectionTypesInference";
import type {
  CollectionSortV1,
  QueryClauseV1,
  QueryFieldV1,
  QueryNodeV1,
  QueryOperatorV1,
  QueryValueV1,
  SmartCollectionV1,
} from "./collectionTypes";

/**
 * F09 query evaluator and result ordering (spec section 6 and section 9).
 * Operates only on `NoteRecord`s derived from the shared workspace metadata
 * index (`LinkIndex`), never reads note body content while rendering a view.
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
   * parsed by editor/frontmatterEdits.ts. */
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

/** Builds note records from the shared metadata index alone. */
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
      return target !== undefined && folded.split("/").some((segment) => segment === fold(target));
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

function localCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

function evaluatePropertyClause(
  property: FrontmatterProperty,
  operator: QueryOperatorV1,
  value: QueryValueV1 | undefined,
): boolean {
  if (property.kind === "list") return evaluateListLike(property.value, operator, value);
  if (property.kind === "readonly") return false;

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

export function evaluateQueryNode(node: QueryNodeV1, note: NoteRecord): boolean {
  if (node.type === "clause") return evaluateClause(node, note);
  if (node.children.length === 0) return node.operator === "and";
  return node.operator === "and"
    ? node.children.every((child) => evaluateQueryNode(child, note))
    : node.children.some((child) => evaluateQueryNode(child, note));
}

function propertySortValue(note: NoteRecord, key: string): string | number | undefined {
  const property = note.properties.get(normalizeKey(key));
  if (!property || property.kind === "readonly") return undefined;
  if (property.kind === "list") return property.value.join("\u0000").toLocaleLowerCase();
  const inferred = inferScalar(property.value, property.style);
  if (inferred.type === "number") return inferred.value;
  if (inferred.type === "boolean") return inferred.value ? 1 : 0;
  if (inferred.type === "date" || inferred.type === "datetime") {
    const parsed = Date.parse(inferred.value);
    return Number.isNaN(parsed) ? inferred.value.toLocaleLowerCase() : parsed;
  }
  return inferred.value.toLocaleLowerCase();
}

function sortValue(note: NoteRecord, sort: CollectionSortV1): string | number | undefined {
  if (sort.field.kind === "property") return propertySortValue(note, sort.field.key);
  switch (sort.field.field) {
    case "name":
      return note.noteName.toLocaleLowerCase();
    case "path":
      return note.path.toLocaleLowerCase();
    case "folder":
      return note.folder.toLocaleLowerCase();
    case "modified":
      return note.modified;
  }
}

function compareSortValue(
  a: string | number | undefined,
  b: string | number | undefined,
  sort: CollectionSortV1,
): number {
  if (a === undefined || b === undefined) {
    if (a === b) return 0;
    return a === undefined ? (sort.missing === "first" ? -1 : 1) : sort.missing === "first" ? 1 : -1;
  }
  const comparison =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return sort.direction === "desc" ? -comparison : comparison;
}

/** Stable multi-key ordering with normalized path as the final tie-breaker.
 * Only the first three persisted sort keys are considered, matching the
 * SDD's explicit maximum. */
export function sortCollectionResults(notes: NoteRecord[], sorts: CollectionSortV1[]): NoteRecord[] {
  const effectiveSorts = sorts.slice(0, 3);
  return notes.slice().sort((a, b) => {
    for (const sort of effectiveSorts) {
      const comparison = compareSortValue(sortValue(a, sort), sortValue(b, sort), sort);
      if (comparison !== 0) return comparison;
    }
    return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
  });
}

export function evaluateCollection(collection: SmartCollectionV1, notes: NoteRecord[]): NoteRecord[] {
  return sortCollectionResults(
    notes.filter((note) => evaluateQueryNode(collection.query, note)),
    collection.sort,
  );
}

export type { QueryFieldV1 };