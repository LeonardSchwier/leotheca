/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { parseFrontmatterProperties } from "../editor/frontmatterEdits";
import { CollectionResults, FOLDER_GROUP_BY, groupResults } from "./CollectionResults";
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
    id: "collapsible",
    name: "Collapsible",
    query: { type: "group", operator: "and", children: [] },
    view,
    sort: [],
    createdAt: "",
    updatedAt: "",
  };
}

afterEach(cleanup);

describe("groupResults — shared grouping helper (was groupKanbanColumns)", () => {
  it("groups notes by their folder into named columns", () => {
    const columns = groupResults(
      [
        note("Projects/alpha.md"),
        note("Projects/beta.md"),
        note("Inbox/gamma.md"),
      ],
      FOLDER_GROUP_BY,
    );
    expect(columns.map((c) => c.label)).toEqual(["Inbox", "Projects"]);
    const projects = columns.find((c) => c.label === "Projects")!;
    expect(projects.notes.map((n) => n.noteName)).toEqual(["alpha", "beta"]);
  });

  it("groups notes by a scalar frontmatter property", () => {
    const columns = groupResults(
      [
        note("a/Alpha.md", "---\nstatus: Work\n---\n"),
        note("b/Beta.md", "---\nstatus: work\n---\n"),
        note("c/Gamma.md", "---\nowner: Sam\n---\n"),
      ],
      "status",
    );
    expect(columns.map((c) => c.label)).toEqual(["Work", "Unassigned"]);
    expect(columns[0].notes).toHaveLength(2);
    expect(columns[1].notes).toHaveLength(1);
  });
});

describe("Collapsible groups in list view", () => {
  it("renders collapsible group sections with a folder grouping", () => {
    const { getAllByRole, getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list", groupBy: FOLDER_GROUP_BY })}
        results={[
          note("Projects/Alpha.md"),
          note("Projects/Beta.md"),
          note("Inbox/Gamma.md"),
        ]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={async () => "ok"}
      />,
    );

    const headings = getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toContain("Projects (2)");
    expect(headings.map((h) => h.textContent)).toContain("Inbox (1)");
    // Each group has a collapse toggle.
    expect(getByRole("button", { name: /collapse Projects/i })).toBeTruthy();
  });

  it("collapses and re-expands a group section", () => {
    const { getByRole, queryByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list", groupBy: FOLDER_GROUP_BY })}
        results={[
          note("Projects/Alpha.md"),
          note("Projects/Beta.md"),
          note("Inbox/Gamma.md"),
        ]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={async () => "ok"}
      />,
    );

    const toggle = getByRole("button", { name: /collapse Projects/i });
    fireEvent.click(toggle);
    // After collapse, Alpha's open button is gone from the DOM.
    expect(queryByRole("button", { name: /Alpha/ })).toBeNull();
    expect(getByRole("button", { name: /expand Projects/i })).toBeTruthy();
    // Re-expanding restores the notes.
    fireEvent.click(getByRole("button", { name: /expand Projects/i }));
    expect(getByRole("button", { name: /Alpha/ })).toBeTruthy();
  });

  it("renders a plain flat list when list mode has no groupBy (backward compatible)", () => {
    const { queryByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list" })}
        results={[note("Projects/Alpha.md"), note("Projects/Beta.md")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={async () => "ok"}
      />,
    );
    expect(queryByRole("heading", { level: 3 })).toBeNull();
    expect(getByTextSafe()).toBeTruthy();
  });

  function getByTextSafe() {
    // The ungrouped list still renders note names.
    return document.body.textContent!.includes("Alpha");
  }
});

describe("Collapsible groups in table view", () => {
  it("renders collapsible property groups around table rows", () => {
    const { getAllByRole, getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "table", columns: ["status"], groupBy: "status" })}
        results={[
          note("a/Alpha.md", "---\nstatus: Work\n---\n"),
          note("b/Beta.md", "---\nstatus: Home\n---\n"),
          note("c/Gamma.md", "---\nowner: Sam\n---\n"),
        ]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={async () => "ok"}
      />,
    );

    const headings = getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toContain("Work (1)");
    expect(headings).toContain("Home (1)");
    expect(headings).toContain("Unassigned (1)");

    expect(getByRole("button", { name: /collapse Work/i }) || getByRole("button", { name: /collapse Home/i }) || getByRole("button", { name: /collapse Unassigned/i })).toBeTruthy();
  });
});

describe("Collapsible groups in card view", () => {
  it("renders collapsible property groups around cards", () => {
    const { getAllByRole } = render(
      <CollectionResults
        collection={collection({ mode: "card", fields: ["status"], groupBy: "status" })}
        results={[
          note("Projects/Alpha.md", "---\nstatus: Work\n---\n"),
          note("Projects/Beta.md", "---\nstatus: Work\n---\n"),
          note("Inbox/Gamma.md", "---\nowner: Sam\n---\n"),
        ]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={async () => "ok"}
      />,
    );

    const headings = getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toContain("Work (2)");
    expect(headings).toContain("Unassigned (1)");
  });
});

describe("Grouping selector and persistence across view modes", () => {
  it("exposes a Group by selector in list mode when a groupBy is set", () => {
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list", groupBy: FOLDER_GROUP_BY })}
        results={[note("Projects/Alpha.md"), note("Inbox/Beta.md")]}
        onOpenFile={vi.fn()}
        onViewChange={vi.fn()}
        onEditProperty={async () => "ok"}
      />,
    );
    expect(getByRole("combobox", { name: "Grouping property" })).toBeTruthy();
  });

  it("persists the groupBy when switching between non-board modes", () => {
    const onViewChange = vi.fn();
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list", groupBy: FOLDER_GROUP_BY })}
        results={[note("Projects/Alpha.md"), note("Inbox/Beta.md")]}
        onOpenFile={vi.fn()}
        onViewChange={onViewChange}
        onEditProperty={async () => "ok"}
      />,
    );

    fireEvent.click(getByRole("radio", { name: "Table" }));
    expect(onViewChange).toHaveBeenLastCalledWith({ mode: "table", groupBy: FOLDER_GROUP_BY });
    fireEvent.click(getByRole("radio", { name: "Cards" }));
    expect(onViewChange).toHaveBeenLastCalledWith({ mode: "card", groupBy: FOLDER_GROUP_BY });
  });

  it("clears grouping to an ungrouped view when the selector is set to Ungrouped", () => {
    const onViewChange = vi.fn();
    const { getByRole } = render(
      <CollectionResults
        collection={collection({ mode: "list", groupBy: FOLDER_GROUP_BY })}
        results={[note("Projects/Alpha.md"), note("Inbox/Beta.md")]}
        onOpenFile={vi.fn()}
        onViewChange={onViewChange}
        onEditProperty={async () => "ok"}
      />,
    );

    fireEvent.change(getByRole("combobox", { name: "Grouping property" }), {
      target: { value: "" },
    });
    expect(onViewChange).toHaveBeenLastCalledWith({ mode: "list" });
  });
});
