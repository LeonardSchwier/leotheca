/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { parseFrontmatterProperties } from "../editor/frontmatterEdits";
import { CollectionResults, groupKanbanColumns, type CollectionResultsProps } from "./CollectionResults";
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

function successfulEdit(): CollectionResultsProps["onEditProperty"] {
  return async () => "ok";
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
        onEditProperty={successfulEdit()}
      />,
    );

    fireEvent.click(getByRole("radio", { name: "Table" }));
    expect(onViewChange).toHaveBeenCalledWith({ mode: "table" });
  });

  it("switches to a board using the first indexed property", () => {
    const onViewChange = vi.fn();
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list" })}
        results={[note("Alpha.md", "---\nstatus: active\n---\n")]}
        onOpenFile={vi.fn()}
        onViewChange={onViewChange}
        onEditProperty={successfulEdit()}
      />,
    );

    fireEvent.click(getByRole("radio", { name: "Board" }));
    expect(onViewChange).toHaveBeenCalledWith({ mode: "kanban", groupBy: "status" });
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
        onEditProperty={successfulEdit()}
      />,
    );

    expect(getByText("status")).toBeTruthy();
    expect(getByRole("button", { name: "active" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Alpha" }));
    expect(onOpenFile).toHaveBeenCalledWith("Projects/Alpha.md", "Alpha.md");
  });

  it("commits an editable scalar cell through the mutation callback", async () => {
    const entry = note("Alpha.md", "---\nstatus: active\n---\n");
    const onEditProperty = vi.fn<CollectionResultsProps["onEditProperty"]>(successfulEdit());
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
        onEditProperty={successfulEdit()}
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
        onEditProperty={successfulEdit()}
      />,
    );

    expect(getByRole("region", { name: "Collection cards" })).toBeTruthy();
    expect(getByText("active")).toBeTruthy();
    expect(getByText("Sam")).toBeTruthy();
  });

  it("renders a read-only board, opens cards, and lets its grouping change", () => {
    const onOpenFile = vi.fn();
    const onViewChange = vi.fn();
    const { getByRole, getByText } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: "status" })}
        results={[
          note("Projects/Alpha.md", "---\nstatus: active\nowner: Sam\n---\n"),
          note("Projects/Beta.md", "---\nowner: Sam\n---\n"),
        ]}
        onOpenFile={onOpenFile}
        onViewChange={onViewChange}
        onEditProperty={successfulEdit()}
      />,
    );

    expect(getByRole("region", { name: "Collection board grouped by status" })).toBeTruthy();
    expect(getByText("Unassigned")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Alpha" }));
    expect(onOpenFile).toHaveBeenCalledWith("Projects/Alpha.md", "Alpha.md");
    fireEvent.change(getByRole("combobox", { name: "Board grouping property" }), {
      target: { value: "owner" },
    });
    expect(onViewChange).toHaveBeenCalledWith({ mode: "kanban", groupBy: "owner" });
  });

  it("orders board columns deterministically and keeps list values unassigned", () => {
    const columns = groupKanbanColumns([
      note("z/Done.md", "---\nstatus: done\n---\n"),
      note("a/Active.md", "---\nstatus: active\n---\n"),
      note("b/Tags.md", "---\nstatus: [one, two]\n---\n"),
      note("c/Missing.md", "---\nowner: Sam\n---\n"),
    ], "status");

    expect(columns.map((column) => column.label)).toEqual(["active", "done", "Unassigned"]);
    expect(columns[2].notes.map((entry) => entry.path)).toEqual(["b/Tags.md", "c/Missing.md"]);
  });
});
