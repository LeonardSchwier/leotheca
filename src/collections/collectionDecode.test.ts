import { describe, expect, it } from "vitest";
import { decodeCollectionsFile } from "./collectionDecode";
import { MAX_QUERY_CLAUSES, type QueryGroupV1, type SmartCollectionV1 } from "./collectionTypes";
import { FOLDER_GROUP_BY, groupKanbanColumns } from "./CollectionResults";
import type { NoteRecord } from "./collectionQuery";
import type { FrontmatterProperty } from "../editor/frontmatterEdits";

function validCollection(overrides: Partial<SmartCollectionV1> = {}): SmartCollectionV1 {
  return {
    id: "c1",
    name: "Active work",
    description: "",
    query: {
      type: "group",
      operator: "and",
      children: [
        {
          type: "clause",
          field: { kind: "system", field: "tag" },
          operator: "contains-item",
          value: { type: "string", value: "work" },
        },
      ],
    },
    view: { mode: "list" },
    sort: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function fileWith(collections: unknown[], order?: string[]): string {
  return JSON.stringify({
    version: 1,
    collections,
    order: order ?? collections.map((c) => (c as { id: string }).id),
  });
}

describe("decodeCollectionsFile: valid input", () => {
  it("decodes a well-formed file without flagging corruption", () => {
    const { file, corrupt } = decodeCollectionsFile(fileWith([validCollection()]));
    expect(corrupt).toBe(false);
    expect(file.collections).toHaveLength(1);
    expect(file.collections[0].name).toBe("Active work");
    expect(file.order).toEqual(["c1"]);
  });

  it("decodes nested AND/OR groups", () => {
    const nested: QueryGroupV1 = {
      type: "group",
      operator: "or",
      children: [
        {
          type: "clause",
          field: { kind: "property", key: "status" },
          operator: "is",
          value: { type: "string", value: "active" },
        },
        {
          type: "group",
          operator: "and",
          children: [
            {
              type: "clause",
              field: { kind: "system", field: "hasFrontmatter" },
              operator: "is-true",
            },
          ],
        },
      ],
    };
    const { file, corrupt } = decodeCollectionsFile(fileWith([validCollection({ query: nested })]));
    expect(corrupt).toBe(false);
    expect(file.collections[0].query).toEqual(nested);
  });

  it("decodes a board view with its required grouping property", () => {
    const { file, corrupt } = decodeCollectionsFile(
      fileWith([validCollection({ view: { mode: "kanban", groupBy: "status" } })]),
    );
    expect(corrupt).toBe(false);
    expect(file.collections[0].view).toEqual({ mode: "kanban", groupBy: "status" });
  });
});

describe("decodeCollectionsFile: missing input", () => {
  it("returns an empty, non-corrupt file when the collections/order fields are entirely absent", () => {
    const { file, corrupt } = decodeCollectionsFile(JSON.stringify({ version: 1 }));
    expect(corrupt).toBe(false);
    expect(file.collections).toEqual([]);
    expect(file.order).toEqual([]);
  });

  it("defaults a missing name to a placeholder without flagging corruption (a missing field is not corruption)", () => {
    const raw = validCollection() as unknown as Record<string, unknown>;
    delete raw.name;
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(false);
    expect(file.collections[0].name).toBe("Untitled collection");
  });

  it("appends a collection missing from `order` rather than hiding it", () => {
    const { file } = decodeCollectionsFile(fileWith([validCollection()], []));
    expect(file.order).toEqual(["c1"]);
  });
});

describe("decodeCollectionsFile: malformed input", () => {
  it("returns an empty, corrupt result for invalid JSON", () => {
    const { file, corrupt } = decodeCollectionsFile("{not json");
    expect(corrupt).toBe(true);
    expect(file.collections).toEqual([]);
  });

  it("returns an empty, corrupt result for a top-level array instead of an object", () => {
    const { file, corrupt } = decodeCollectionsFile("[]");
    expect(corrupt).toBe(true);
    expect(file.collections).toEqual([]);
  });

  it("defaults a wrong-typed name to a placeholder and flags corruption", () => {
    const raw = validCollection() as unknown as Record<string, unknown>;
    raw.name = 123;
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    expect(file.collections[0].name).toBe("Untitled collection");
  });

  it("drops a collection with a missing or blank id without discarding valid siblings", () => {
    const noId = validCollection({ id: "" });
    const good = validCollection({ id: "c2", name: "Good" });
    const { file, corrupt } = decodeCollectionsFile(fileWith([noId, good], ["c2"]));
    expect(corrupt).toBe(true);
    expect(file.collections).toHaveLength(1);
    expect(file.collections[0].id).toBe("c2");
  });

  it("drops a duplicate id, keeping the first occurrence", () => {
    const first = validCollection({ id: "dup", name: "First" });
    const second = validCollection({ id: "dup", name: "Second" });
    const { file, corrupt } = decodeCollectionsFile(fileWith([first, second], ["dup"]));
    expect(corrupt).toBe(true);
    expect(file.collections).toHaveLength(1);
    expect(file.collections[0].name).toBe("First");
  });

  it("drops a negation clause missing the comparison value it needs, instead of decoding it as a match-everything filter", () => {
    // Maintenance review: before the fix, this decoded successfully (no
    // `value` required) and evaluateQueryNode's own is-not/does-not-contain
    // handling then matched every note, the opposite of a narrowing filter.
    const raw = validCollection({
      query: {
        type: "group",
        operator: "and",
        children: [
          { type: "clause", field: { kind: "system", field: "name" }, operator: "is-not" },
          {
            type: "clause",
            field: { kind: "system", field: "hasFrontmatter" },
            operator: "is-true",
          },
        ],
      } as unknown as QueryGroupV1,
    });
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    const query = file.collections[0].query as QueryGroupV1;
    expect(query.children).toHaveLength(1);
    expect((query.children[0] as { operator: string }).operator).toBe("is-true");
  });

  it("still decodes a value-less clause for an operator that genuinely takes no value", () => {
    const raw = validCollection({
      query: {
        type: "group",
        operator: "and",
        children: [{ type: "clause", field: { kind: "system", field: "tag" }, operator: "is-empty" }],
      },
    });
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(false);
    const query = file.collections[0].query as QueryGroupV1;
    expect(query.children).toHaveLength(1);
  });

  it("drops an individual invalid clause but keeps the rest of the query", () => {
    const raw = validCollection({
      query: {
        type: "group",
        operator: "and",
        children: [
          { type: "clause", field: { kind: "system", field: "tag" }, operator: "not-a-real-operator" },
          {
            type: "clause",
            field: { kind: "system", field: "hasFrontmatter" },
            operator: "is-true",
          },
        ],
      } as unknown as QueryGroupV1,
    });
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    const query = file.collections[0].query as QueryGroupV1;
    expect(query.children).toHaveLength(1);
    expect(query.type).toBe("group");
  });

  it("drops the whole collection when its query is fundamentally unparseable", () => {
    const raw = validCollection({ query: "not a query" as unknown as QueryGroupV1 });
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    expect(file.collections).toEqual([]);
  });

  it("rejects a group nested deeper than MAX_QUERY_DEPTH", () => {
    // Build a group nested one level past the allowed depth: root (0) ->
    // 1 -> 2 -> 3 -> 4 (rejected, since MAX_QUERY_DEPTH is 3 below root).
    let deepest: QueryGroupV1 = { type: "group", operator: "and", children: [] };
    for (let i = 0; i < 5; i++) {
      deepest = { type: "group", operator: "and", children: [deepest] };
    }
    const raw = validCollection({ query: deepest });
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    // The root itself still decodes; only the too-deep branch is pruned.
    expect(file.collections).toHaveLength(1);
  });

  it("enforces MAX_QUERY_CLAUSES across the whole query tree", () => {
    const children = Array.from({ length: MAX_QUERY_CLAUSES + 5 }, () => ({
      type: "clause" as const,
      field: { kind: "system" as const, field: "hasFrontmatter" as const },
      operator: "exists" as const,
    }));
    const raw = validCollection({ query: { type: "group", operator: "and", children } });
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    const query = file.collections[0].query as QueryGroupV1;
    expect(query.children.length).toBe(MAX_QUERY_CLAUSES);
  });

  it("falls back an invalid view to list mode", () => {
    const raw = validCollection() as unknown as Record<string, unknown>;
    raw.view = { mode: "not-a-real-mode" };
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    expect(file.collections[0].view).toEqual({ mode: "list" });
  });

  it("rejects a board view without a non-blank grouping property", () => {
    const raw = validCollection() as unknown as Record<string, unknown>;
    raw.view = { mode: "kanban", groupBy: "   " };
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    expect(file.collections[0].view).toEqual({ mode: "list" });
  });

  it("drops an invalid sort entry but keeps the collection", () => {
    const raw = validCollection() as unknown as Record<string, unknown>;
    raw.sort = [{ field: { kind: "system", field: "modified" }, direction: "asc", missing: "last" }, "garbage"];
    const { file, corrupt } = decodeCollectionsFile(fileWith([raw]));
    expect(corrupt).toBe(true);
    expect(file.collections[0].sort).toHaveLength(1);
  });

  it("flags an unrecognized top-level version as corrupt but still decodes what it can", () => {
    const raw = { version: 99, collections: [validCollection()], order: ["c1"] };
    const { file, corrupt } = decodeCollectionsFile(JSON.stringify(raw));
    expect(corrupt).toBe(true);
    expect(file.version).toBe(1);
    expect(file.collections).toHaveLength(1);
  });

  it("does not crash and returns an empty file for a non-object collections array entry", () => {
    const { file, corrupt } = decodeCollectionsFile(fileWith([null, 42, "x"], []));
    expect(corrupt).toBe(true);
    expect(file.collections).toEqual([]);
  });
});

describe("groupKanbanColumns — folder-based grouping", () => {
  function noteWithFolder(folder: string, title: string): NoteRecord {
    return {
      path: folder ? `${folder}/${title}.md` : `${title}.md`,
      noteName: title,
      folder,
      tags: [],
      hasFrontmatter: false,
      properties: new Map<string, FrontmatterProperty>(),
    };
  }

  it("groups notes by their folder into named columns", () => {
    const columns = groupKanbanColumns(
      [
        noteWithFolder("Projects", "alpha"),
        noteWithFolder("Projects", "beta"),
        noteWithFolder("Inbox", "gamma"),
      ],
      FOLDER_GROUP_BY,
    );
    expect(columns.map((c) => c.label)).toEqual(["Inbox", "Projects"]);
    const projects = columns.find((c) => c.label === "Projects")!;
    expect(projects.notes.map((n) => n.noteName)).toEqual(["alpha", "beta"]);
    const inbox = columns.find((c) => c.label === "Inbox")!;
    expect(inbox.notes.map((n) => n.noteName)).toEqual(["gamma"]);
  });

  it("places root-level notes (empty folder) in Unassigned", () => {
    const columns = groupKanbanColumns(
      [
        noteWithFolder("", "root-note"),
        noteWithFolder("Projects", "deep"),
      ],
      FOLDER_GROUP_BY,
    );
    expect(columns.map((c) => c.label)).toEqual(["Projects", "Unassigned"]);
    const unassigned = columns.find((c) => c.label === "Unassigned")!;
    expect(unassigned.notes.map((n) => n.noteName)).toEqual(["root-note"]);
  });

  it("trims whitespace in folder paths before grouping", () => {
    const columns = groupKanbanColumns(
      [
        noteWithFolder("  Projects  ", "a"),
        noteWithFolder("Projects", "b"),
      ],
      FOLDER_GROUP_BY,
    );
    // Both should land in the same "Projects" column.
    expect(columns).toHaveLength(1);
    expect(columns[0].label).toBe("Projects");
    expect(columns[0].notes).toHaveLength(2);
  });

  it("keeps folder grouping separate from property grouping", () => {
    const withProp = noteWithFolder("Projects", "p1");
    // Set a scalar property so property-based grouping can find it.
    withProp.properties.set("status", {
      kind: "scalar",
      key: "status",
      value: "done",
      editable: true,
      style: "plain",
      sourceWasEmpty: false,
      replaceRange: { start: 0, end: 0 },
      removeRange: { start: 0, end: 0 },
    });
    const columns = groupKanbanColumns([withProp], FOLDER_GROUP_BY);
    expect(columns.map((c) => c.label)).toEqual(["Projects"]);
    // Property-based grouping would give a different result.
    const byProp = groupKanbanColumns([withProp], "status");
    expect(byProp.map((c) => c.label)).toEqual(["done"]);
  });
});
