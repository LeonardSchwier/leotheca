/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { parseFrontmatterProperties } from "../editor/frontmatterEdits";
import { CollectionResults } from "./CollectionResults";
import { sortCollectionResults, type NoteRecord } from "./collectionQuery";
import type { SmartCollectionV1 } from "./collectionTypes";

function note(path: string, frontmatter = ""): NoteRecord {
  const properties = new Map(
    parseFrontmatterProperties(frontmatter).properties.map((property) => [
      property.key.toLocaleLowerCase(),
      property,
    ]),
  );
  const slash = path.lastIndexOf("/");
  const file = slash === -1 ? path : path.slice(slash + 1);
  return {
    path,
    noteName: file.replace(/\.md$/i, ""),
    folder: slash === -1 ? "" : path.slice(0, slash),
    tags: [],
    hasFrontmatter: properties.size > 0,
    properties,
  };
}

function collection(view: SmartCollectionV1["view"]): SmartCollectionV1 {
  return {
    id: "phase2",
    name: "Phase 2",
    query: { type: "group", operator: "and", children: [] },
    view,
    sort: [],
    createdAt: "",
    updatedAt: "",
  };
}

afterEach(cleanup);

describe("F09 Phase 2 sorting", () => {
  it("applies multiple sort keys, missing placement, and the path tie-breaker", () => {
    const alpha = note("z/Alpha.md", "---\nstatus: active\nrating: 2\n---\n");
    const beta = note("a/Beta.md", "---\nstatus: active\nrating: 2\n---\n");
    const gamma = note("Gamma.md", "---\nstatus: later\n---\n");

    const result = sortCollectionResults([alpha, beta, gamma], [
      {
        field: { kind: "property", key: "rating" },
        direction: "desc",
        missing: "last",
      },
      {
        field: { kind: "property", key: "status" },
        direction: "asc",
        missing: "last",
      },
    ]);

    expect(result.map((entry) => entry.path)).toEqual(["a/Beta.md", "z/Alpha.md", "Gamma.md"]);
  });
});

describe("F09 Phase 2 result views", () => {
  it("switches views through the persisted-view callback", () => {
    const onViewChange = vi.fn();
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list" })}
        results={[note("Alpha.md")]}
        onOpenFile={vi.fn()}
        onViewChange={onViewChange}
        onEditProperty={vi.fn(async () => "ok" as const)}
      />,
    );

    fireEvent.click(getByRole("radio", { name: "Table" }));
    expect(onViewChange).toHaveBeenCalledWith({ mode: "table" });
  });

  it("renders configured table property cells and keeps note activation separate", () => {
    const onOpenFile = vi.fn();
    const entry = note("Projects/Alpha.md", "---\nstatus: active\n---\n");
    const { getByRole, getByText } = render(
      <CollectionResults
        collection={collection({ mode: "table", columns: ["status"] })}
        results={[entry]}
        onOpenFile={onOpenFile}
        onViewChange={vi.fn()}
        onEditProperty={vi.fn(async () => "ok" as const)}
      />,
    );

    expect(getByText("status")).toBeTruthy();
    expect(getByRole("button", { name: "active" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Alpha" }));
    expect(onOpenFile).toHaveBeenCalledWith("Projects/Alpha.md", "Alpha.md");
  });

  it("commits an editable scalar cell through the mutation callback", async () => {
    const entry = note("Alpha.md", "---\nstatus: active\n---\n");
    const onEditProperty = vi.fn(async () => "ok" as const);
    const { getByRole, getByLabelText } = render(
      <CollectionResults
        collection={collection({ mode: "table", columns: ["status"] })}
        results={[entry]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={onEditProperty}
      />,
    );

    fireEvent.click(getByRole("button", { name: "active" }));
    const input = getByLabelText("Edit status for Alpha") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "archived" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onEditProperty).toHaveBeenCalledTimes(1));
    expect(onEditProperty.mock.calls[0][2]).toBe("archived");
  });

  it("renders unsupported YAML read-only instead of an edit affordance", () => {
    const entry = note("Alpha.md", "---\nnested:\n  child: value\n---\n");
    const { getByTitle, queryByLabelText } = render(
      <CollectionResults
        collection={collection({ mode: "table", columns: ["nested"] })}
        results={[entry]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={vi.fn(async () => "ok" as const)}
      />,
    );

    expect(getByTitle("This YAML value is read-only")).toBeTruthy();
    expect(queryByLabelText("Edit nested for Alpha")).toBeNull();
  });

  it("renders card fields from metadata without a note-body read", () => {
    const entry = note("Projects/Alpha.md", "---\nstatus: active\nowner: Sam\n---\n");
    const { getByRole, getByText } = render(
      <CollectionResults
        collection={collection({ mode: "card", fields: ["status", "owner"] })}
        results={[entry]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={vi.fn(async () => "ok" as const)}
      />,
    );

    expect(getByRole("region", { name: "Collection cards" })).toBeTruthy();
    expect(getByText("active")).toBeTruthy();
    expect(getByText("Sam")).toBeTruthy();
  });
});
