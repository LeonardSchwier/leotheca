import { describe, expect, it } from "vitest";
import type { LinkIndex } from "../linking/store";
import { parseFrontmatterProperties } from "../editor/frontmatterEdits";
import {
  buildNoteRecords,
  evaluateCollection,
  evaluateQueryNode,
  type NoteRecord,
} from "./collectionQuery";
import type { QueryClauseV1, QueryGroupV1, SmartCollectionV1 } from "./collectionTypes";

function emptyIndex(): LinkIndex {
  return {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
    mtimeByPath: new Map(),
    hasFrontmatterByPath: new Set(),
    frontmatterPropertiesByPath: new Map(),
  };
}

function clause(
  field: QueryClauseV1["field"],
  operator: QueryClauseV1["operator"],
  value?: QueryClauseV1["value"],
): QueryClauseV1 {
  return { type: "clause", field, operator, value };
}

function group(operator: "and" | "or", children: (QueryGroupV1 | QueryClauseV1)[]): QueryGroupV1 {
  return { type: "group", operator, children };
}

describe("buildNoteRecords", () => {
  it("derives one record per indexed note, sourced from backlinksByPath's keys", () => {
    const index = emptyIndex();
    index.backlinksByPath.set("Projects/Alpha.md", []);
    index.backlinksByPath.set("Beta.md", []);
    index.tagsByPath.set("Beta.md", ["work"]);
    index.mtimeByPath!.set("Beta.md", 1_700_000_000_000);
    index.hasFrontmatterByPath!.add("Beta.md");
    index.frontmatterPropertiesByPath!.set(
      "Beta.md",
      parseFrontmatterProperties("---\nstatus: active\n---\n").properties,
    );

    const records = buildNoteRecords(index);
    expect(records).toHaveLength(2);

    const alpha = records.find((r) => r.path === "Projects/Alpha.md")!;
    expect(alpha.noteName).toBe("Alpha");
    expect(alpha.folder).toBe("Projects");
    expect(alpha.tags).toEqual([]);
    expect(alpha.hasFrontmatter).toBe(false);
    expect(alpha.modified).toBeUndefined();

    const beta = records.find((r) => r.path === "Beta.md")!;
    expect(beta.folder).toBe("");
    expect(beta.tags).toEqual(["work"]);
    expect(beta.hasFrontmatter).toBe(true);
    expect(beta.modified).toBe(1_700_000_000_000);
    expect(beta.properties.get("status")?.value).toBe("active");
  });
});

function note(overrides: Partial<NoteRecord>): NoteRecord {
  return {
    path: "Note.md",
    noteName: "Note",
    folder: "",
    tags: [],
    hasFrontmatter: false,
    properties: new Map(),
    ...overrides,
  };
}

describe("evaluateQueryNode: system fields", () => {
  it("matches note name case-insensitively with 'contains'", () => {
    const n = note({ noteName: "Weekly Review" });
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "name" }, "contains", { type: "string", value: "weekly" }),
        n,
      ),
    ).toBe(true);
  });

  it("matches path 'is-under-folder'", () => {
    const n = note({ path: "Projects/Alpha/Note.md", folder: "Projects/Alpha" });
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "path" }, "is-under-folder", { type: "path", value: "Projects" }),
        n,
      ),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "path" }, "is-under-folder", { type: "path", value: "Other" }),
        n,
      ),
    ).toBe(false);
  });

  it("matches folder 'is' exactly, case-insensitively", () => {
    const n = note({ folder: "Projects/Alpha" });
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "folder" }, "is", { type: "path", value: "projects/alpha" }),
        n,
      ),
    ).toBe(true);
  });

  it("matches tag 'contains-item' against the lowercased tag list", () => {
    const n = note({ tags: ["work", "urgent"] });
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "Work" }),
        n,
      ),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "missing" }),
        n,
      ),
    ).toBe(false);
  });

  it("evaluates tag 'is-empty'/'is-not-empty'", () => {
    expect(
      evaluateQueryNode(clause({ kind: "system", field: "tag" }, "is-empty"), note({ tags: [] })),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "tag" }, "is-not-empty"),
        note({ tags: ["a"] }),
      ),
    ).toBe(true);
  });

  it("evaluates 'modified' with a date value using local calendar semantics", () => {
    // 2026-09-02T12:00:00 local time, regardless of the runtime's own zone.
    const n = note({ modified: new Date(2026, 8, 2, 12, 0, 0).getTime() });
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "modified" }, "is", { type: "date", value: "2026-09-02" }),
        n,
      ),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "modified" }, "before", { type: "date", value: "2026-09-02" }),
        n,
      ),
    ).toBe(false);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "modified" }, "after", { type: "date", value: "2026-09-01" }),
        n,
      ),
    ).toBe(true);
  });

  it("'modified' exists/does-not-exist reflect whether the index had an mtime at all", () => {
    expect(
      evaluateQueryNode(clause({ kind: "system", field: "modified" }, "exists"), note({ modified: 1 })),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "modified" }, "does-not-exist"),
        note({ modified: undefined }),
      ),
    ).toBe(true);
  });

  it("evaluates 'hasFrontmatter' boolean operators", () => {
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "hasFrontmatter" }, "is-true"),
        note({ hasFrontmatter: true }),
      ),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "system", field: "hasFrontmatter" }, "is-false"),
        note({ hasFrontmatter: false }),
      ),
    ).toBe(true);
  });
});

function propNote(frontmatter: string): NoteRecord {
  const properties = new Map(
    parseFrontmatterProperties(frontmatter).properties.map((p) => [p.key.toLowerCase(), p]),
  );
  return note({ hasFrontmatter: true, properties });
}

describe("evaluateQueryNode: property fields", () => {
  it("'exists'/'does-not-exist' match presence regardless of type, including unsupported YAML", () => {
    const n = propNote("---\nrating: 4\nnested:\n  a: 1\n---\n");
    expect(
      evaluateQueryNode(clause({ kind: "property", key: "rating" }, "exists"), n),
    ).toBe(true);
    expect(
      evaluateQueryNode(clause({ kind: "property", key: "missing" }, "does-not-exist"), n),
    ).toBe(true);
    // Unsupported nested YAML: exists matches, but a typed comparison never does.
    expect(evaluateQueryNode(clause({ kind: "property", key: "nested" }, "exists"), n)).toBe(true);
  });

  it("property lookup is case-insensitive per spec section 6.2", () => {
    const n = propNote("---\nStatus: active\n---\n");
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "status" }, "is", { type: "string", value: "active" }),
        n,
      ),
    ).toBe(true);
  });

  it("a number-family clause only matches a property that infers as a number", () => {
    const n = propNote('---\nrating: 4\nname: "5"\n---\n');
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "rating" }, "greater-than", { type: "number", value: 3 }),
        n,
      ),
    ).toBe(true);
    // "5" is quoted, so it stays a string and never matches a number clause
    // (spec section 7.3: "incompatible note values do not match that typed
    // clause"), even though its text looks numeric.
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "name" }, "equals", { type: "number", value: 5 }),
        n,
      ),
    ).toBe(false);
  });

  it("a boolean-family clause only matches a property that infers as boolean", () => {
    const n = propNote("---\ndone: true\ncount: 1\n---\n");
    expect(evaluateQueryNode(clause({ kind: "property", key: "done" }, "is-true"), n)).toBe(true);
    expect(evaluateQueryNode(clause({ kind: "property", key: "count" }, "is-true"), n)).toBe(false);
  });

  it("a date-family clause matches a property that infers as a date", () => {
    const n = propNote("---\nreview: 2026-01-15\n---\n");
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "review" }, "before", { type: "date", value: "2026-02-01" }),
        n,
      ),
    ).toBe(true);
  });

  it("list-property operators evaluate against the property's own list value", () => {
    const n = propNote("---\ncategories: [alpha, beta]\n---\n");
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "categories" }, "contains-item", { type: "string", value: "Beta" }),
        n,
      ),
    ).toBe(true);
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "categories" }, "contains-all-items", {
          type: "string-list",
          value: ["alpha", "gamma"],
        }),
        n,
      ),
    ).toBe(false);
  });

  it("an unsupported (readonly) property never matches a typed comparison", () => {
    const n = propNote("---\nnested:\n  a: 1\n---\n");
    expect(
      evaluateQueryNode(
        clause({ kind: "property", key: "nested" }, "is", { type: "string", value: "anything" }),
        n,
      ),
    ).toBe(false);
  });
});

describe("evaluateQueryNode: groups", () => {
  it("an empty AND group matches every note (spec section 6.1)", () => {
    expect(evaluateQueryNode(group("and", []), note({}))).toBe(true);
  });

  it("an empty OR group matches no notes (spec section 6.1)", () => {
    expect(evaluateQueryNode(group("or", []), note({}))).toBe(false);
  });

  it("an AND group requires every child to match", () => {
    const n = note({ noteName: "Alpha", tags: ["work"] });
    const q = group("and", [
      clause({ kind: "system", field: "name" }, "contains", { type: "string", value: "alpha" }),
      clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "work" }),
    ]);
    expect(evaluateQueryNode(q, n)).toBe(true);
    const failing = group("and", [
      clause({ kind: "system", field: "name" }, "contains", { type: "string", value: "alpha" }),
      clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "missing" }),
    ]);
    expect(evaluateQueryNode(failing, n)).toBe(false);
  });

  it("an OR group requires only one child to match", () => {
    const n = note({ noteName: "Alpha", tags: [] });
    const q = group("or", [
      clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "missing" }),
      clause({ kind: "system", field: "name" }, "is", { type: "string", value: "alpha" }),
    ]);
    expect(evaluateQueryNode(q, n)).toBe(true);
  });

  it("evaluates a group nested inside a group", () => {
    const n = note({ noteName: "Alpha", tags: ["work"] });
    const nested = group("and", [
      clause({ kind: "system", field: "name" }, "is", { type: "string", value: "alpha" }),
      group("or", [
        clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "missing" }),
        clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "work" }),
      ]),
    ]);
    expect(evaluateQueryNode(nested, n)).toBe(true);
  });
});

describe("evaluateCollection", () => {
  function makeCollection(query: QueryGroupV1): SmartCollectionV1 {
    return {
      id: "c1",
      name: "Test",
      query,
      view: { mode: "list" },
      sort: [],
      createdAt: "",
      updatedAt: "",
    };
  }

  it("filters to matching notes and sorts by path ascending as the tie-breaker", () => {
    const notes = [
      note({ path: "Zeta.md", noteName: "Zeta", tags: ["work"] }),
      note({ path: "Alpha.md", noteName: "Alpha", tags: ["work"] }),
      note({ path: "Excluded.md", noteName: "Excluded", tags: [] }),
    ];
    const collection = makeCollection(
      group("and", [clause({ kind: "system", field: "tag" }, "contains-item", { type: "string", value: "work" })]),
    );
    const results = evaluateCollection(collection, notes);
    expect(results.map((r) => r.path)).toEqual(["Alpha.md", "Zeta.md"]);
  });
});
