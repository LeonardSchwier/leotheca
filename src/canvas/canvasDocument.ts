/**
 * Versioned, tolerant canvas document parsing, serialization, and file-
 * reference resolution (audit follow-up F-010).
 *
 * The previous `parseCanvas` discarded anything it didn't recognize: an
 * unknown top-level field, a node missing a required field, or an edge
 * that didn't validate was silently dropped the moment the user made any
 * unrelated edit and the document was re-saved. That's real, user-owned
 * data loss triggered by something as small as dragging a different card.
 * `decodeCanvas` below keeps every node and edge record that isn't
 * outright unusable (not a JSON object at all), even when it can't be
 * shown as an editable card, and keeps every top-level field it doesn't
 * itself recognize. A genuinely unusable source (invalid JSON, or a
 * `nodes`/`edges` field present but not an array) still returns `null`,
 * exactly like before: there's no way to safely represent "the array
 * itself is nonsense" as a recoverable value, and the UI already treats
 * `null` as "don't render an editable canvas, don't call `onChange`",
 * which by construction means an invalid document is never overwritten.
 */

import { dirname, isPathWithinWorkspace, resolvePathWithinWorkspace } from "../workspace/paths";

export interface CanvasNode {
  id: string;
  text: string;
  x: number;
  y: number;
  filePath?: string;
}

export interface CanvasEdge {
  from: string;
  to: string;
}

export interface CanvasDocument {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export const CANVAS_VERSION = 1;

function isValidNode(entry: unknown): entry is CanvasNode {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id !== "" &&
    typeof candidate.text === "string" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    (candidate.filePath === undefined || typeof candidate.filePath === "string")
  );
}

/** A plain JSON object that isn't a valid `CanvasNode` (a future field
 * shape, a required field missing or wrong-typed) but is still a real
 * object worth keeping, as opposed to a primitive, `null`, or a nested
 * array, which carry no recoverable card data at all. */
function isRetainableRecord(entry: unknown): entry is Record<string, unknown> {
  return typeof entry === "object" && entry !== null && !Array.isArray(entry);
}

function recordId(entry: Record<string, unknown>): string | null {
  return typeof entry.id === "string" && entry.id !== "" ? entry.id : null;
}

function isValidEdgeShape(entry: unknown): entry is CanvasEdge {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.from === "string" &&
    typeof candidate.to === "string" &&
    candidate.from !== candidate.to
  );
}

/** The decoded working document (editable nodes/edges), plus what has to
 * survive a save without being editable through the card UI: the raw
 * top-level record (including its original `nodes`/`edges`, overwritten
 * by the decoded arrays on serialize, the same spread-then-overlay
 * technique F-008's `decodeWorkspaceSettings` uses for its own unknown
 * fields), and node/edge array entries that didn't decode as a
 * `CanvasNode`/`CanvasEdge` but are still real objects. */
export interface DecodedCanvas {
  document: CanvasDocument;
  extraFields: Record<string, unknown>;
  unknownNodes: Record<string, unknown>[];
  unknownEdges: Record<string, unknown>[];
}

/** Parses `source` as a canvas document. Returns `null` only when there is
 * no safe way to interpret it as one at all: invalid JSON, a non-object
 * top level, or a present `nodes`/`edges` field that isn't an array (a
 * missing `nodes` or `edges` field is treated as an empty array, the same
 * "missing isn't corruption" distinction audit follow-up F-008 already
 * applies to persisted settings, not as a reason to refuse the whole
 * file). A dangling edge, i.e. one whose `from`/`to` doesn't match any
 * node's `id`, valid or retained-unknown, carries no meaning without that
 * node and is dropped, same as before this item. */
export function decodeCanvas(source: string): DecodedCanvas | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const rawNodes = record.nodes;
  if (rawNodes !== undefined && !Array.isArray(rawNodes)) return null;
  const rawEdges = record.edges;
  if (rawEdges !== undefined && !Array.isArray(rawEdges)) return null;

  const nodes: CanvasNode[] = [];
  const unknownNodes: Record<string, unknown>[] = [];
  for (const entry of (rawNodes ?? []) as unknown[]) {
    if (isValidNode(entry)) nodes.push(entry);
    else if (isRetainableRecord(entry)) unknownNodes.push(entry);
  }

  const knownIds = new Set(nodes.map((node) => node.id));
  for (const unknown of unknownNodes) {
    const id = recordId(unknown);
    if (id) knownIds.add(id);
  }

  const edges: CanvasEdge[] = [];
  const unknownEdges: Record<string, unknown>[] = [];
  for (const entry of (rawEdges ?? []) as unknown[]) {
    if (isValidEdgeShape(entry)) {
      // A shape-valid edge referencing a genuinely unknown id is dangling,
      // not malformed-but-retainable: dropped outright, same as before
      // this item, rather than kept as an opaque record with nothing left
      // to recover.
      if (knownIds.has(entry.from) && knownIds.has(entry.to)) edges.push(entry);
    } else if (isRetainableRecord(entry)) {
      unknownEdges.push(entry);
    }
  }

  return { document: { nodes, edges }, extraFields: record, unknownNodes, unknownEdges };
}

/** Re-serializes a decoded canvas, appending preserved unknown node/edge
 * records after the editable ones (their position among the editable
 * cards isn't meaningful data; their content is). `version` is written
 * as `CANVAS_VERSION` only when the source didn't already carry one, so a
 * genuinely newer file's own version marker survives a round trip
 * through this build instead of being silently downgraded, the same
 * choice F-008's `decodeWorkspaceSettings` makes for its own `version`
 * field. */
export function serializeCanvas(decoded: DecodedCanvas): string {
  const versionField = decoded.extraFields.version === undefined ? { version: CANVAS_VERSION } : {};
  return JSON.stringify(
    {
      ...decoded.extraFields,
      ...versionField,
      nodes: [...decoded.document.nodes, ...decoded.unknownNodes],
      edges: [...decoded.document.edges, ...decoded.unknownEdges],
    },
    null,
    2,
  );
}

/** Resolves a canvas card's `filePath` the way `MarkdownPreview.tsx`
 * resolves a note's local image links: as a path relative to the
 * directory of the file that embeds it (here, the open `.canvas` file),
 * validated through `resolvePathWithinWorkspace`'s containment check
 * rather than trusted as an already-absolute, unchecked global path.
 * `filePath` values written before this contract existed are absolute
 * in-workspace paths (the only shape this app ever wrote); those are
 * still supported, but only once validated through the same containment
 * boundary via `isPathWithinWorkspace`, never assumed safe just because
 * they're absolute. Returns `null` for anything that can't be resolved
 * inside the workspace at all, so the caller can refuse to open it rather
 * than reading an arbitrary path. */
export function resolveCanvasFileReference(
  workspaceRoot: string,
  canvasPath: string,
  filePath: string,
): string | null {
  if (!filePath) return null;
  const relative = resolvePathWithinWorkspace(workspaceRoot, dirname(canvasPath), filePath);
  if (relative) return relative;
  return isPathWithinWorkspace(workspaceRoot, filePath) ? filePath : null;
}
