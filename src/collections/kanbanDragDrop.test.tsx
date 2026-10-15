/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { parseFrontmatterProperties } from "../editor/frontmatterEdits";
import { CollectionResults, FOLDER_GROUP_BY } from "./CollectionResults";
import type { CollectionResultsProps } from "./CollectionResults";
import type { NoteRecord } from "./collectionQuery";
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
    id: "kanban-dnd",
    name: "Kanban DnD",
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

/** jsdom does not implement the DataTransfer constructor. The component
 * reads `event.dataTransfer.getData("text/leotheca-kanban-note")` in
 * its drop handler, so a minimal mock is sufficient. */
function mockDataTransfer(): { getData: (t: string) => string; setData: (t: string, v: string) => void } {
  const store = new Map<string, string>();
  return {
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, value: string) => { store.set(type, value); },
  };
}

afterEach(cleanup);

describe("Kanban drag-and-drop (property-grouped board)", () => {
  it("makes cards draggable in a property-grouped board", () => {
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: "status" })}
        results={[note("Alpha.md", "---\nstatus: active\n---\n")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={successfulEdit()}
      />,
    );

    const card = getByRole("button", { name: "Alpha" });
    expect(card.getAttribute("draggable")).toBe("true");
  });

  it("does not make cards draggable in a folder-grouped board", () => {
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: FOLDER_GROUP_BY })}
        results={[note("Projects/Alpha.md")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={successfulEdit()}
      />,
    );

    const card = getByRole("button", { name: "Alpha" });
    expect(card.getAttribute("draggable")).toBeNull();
  });

  it("calls onEditProperty with the target column value when a card is dropped", async () => {
    const onEditProperty = vi.fn<CollectionResultsProps["onEditProperty"]>(successfulEdit());
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: "status" })}
        results={[note("Alpha.md", "---\nstatus: active\n---\n"), note("Beta.md", "---\nstatus: done\n---\n")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={onEditProperty}
      />,
    );

    const card = getByRole("button", { name: "Alpha" });
    const targetColumn = getByRole("region", { name: "done, 1 notes" });

    const dt = mockDataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(targetColumn);
    fireEvent.drop(targetColumn, { dataTransfer: dt });

    await waitFor(() => expect(onEditProperty).toHaveBeenCalledTimes(1));
    const call = onEditProperty.mock.calls[0];
    expect(call[0].path).toBe("Alpha.md");
    expect(call[2]).toBe("done");
  });

  it("removes the property value when dropping onto Unassigned", async () => {
    const onEditProperty = vi.fn<CollectionResultsProps["onEditProperty"]>(successfulEdit());
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: "status" })}
        results={[note("Alpha.md", "---\nstatus: active\n---\n")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={onEditProperty}
      />,
    );

    const card = getByRole("button", { name: "Alpha" });
    const unassigned = getByRole("region", { name: "Unassigned, 0 notes" });

    const dt = mockDataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(unassigned);
    fireEvent.drop(unassigned, { dataTransfer: dt });

    await waitFor(() => expect(onEditProperty).toHaveBeenCalledTimes(1));
    const call = onEditProperty.mock.calls[0];
    expect(call[2]).toBe("");
  });

  it("does not call onEditProperty when dropping a card on its own column", async () => {
    const onEditProperty = vi.fn<CollectionResultsProps["onEditProperty"]>(successfulEdit());
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: "status" })}
        results={[note("Alpha.md", "---\nstatus: active\n---\n")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={onEditProperty}
      />,
    );

    const card = getByRole("button", { name: "Alpha" });
    const ownColumn = getByRole("region", { name: "active, 1 notes" });

    const dt = mockDataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(ownColumn);
    fireEvent.drop(ownColumn, { dataTransfer: dt });

    expect(onEditProperty).not.toHaveBeenCalled();
  });

  it("handles edit failure without crashing", async () => {
    const onEditProperty = vi.fn<CollectionResultsProps["onEditProperty"]>(async () => "error");
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "kanban", groupBy: "status" })}
        results={[
          note("Alpha.md", "---\nstatus: active\n---\n"),
          note("Beta.md", "---\nstatus: done\n---\n"),
        ]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={onEditProperty}
      />,
    );

    const card = getByRole("button", { name: "Alpha" });
    const target = getByRole("region", { name: "done, 1 notes" });

    const dt = mockDataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(target);
    fireEvent.drop(target, { dataTransfer: dt });

    await waitFor(() => expect(onEditProperty).toHaveBeenCalledTimes(1));
  });
});
