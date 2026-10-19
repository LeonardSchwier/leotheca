/**
 * F11 — Manual group management (Group by menu): a collection's per-view
 * `groupOrder` (plain-file state) pins specific group columns to positions.
 * Any column not explicitly ordered falls back to the current alphabetical
 * order. Unassigned columns always anchor to the end regardless of manual
 * order. The menu itself is verified in CollectionResults' UI tests.
 *
 * Tests written first (TDD RED). Implementation must make these green.
 */
import { describe, expect, it } from "vitest";
import { parseFrontmatterProperties } from "../editor/frontmatterEdits";
import { groupResults } from "./CollectionResults";
import type { NoteRecord } from "./collectionQuery";

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

function results(): NoteRecord[] {
  // Three distinct property values; alphabetical order would be:
  //   active < done < in progress
  // i.e. ["active", "done", "in progress"] + Unassigned.
  return [
    note("a.md", "---\nstatus: active\n---\n"),
    note("b.md", "---\nstatus: in progress\n---\n"),
    note("c.md", "---\nstatus: done\n---\n"),
    note("d.md", "---\nstatus: done\n---\n"),
    note("e.md", "---\n---\n"), // unassigned
  ];
}

describe("groupResults: manual groupOrder override", () => {
  it("defaults to alphabetical order when no groupOrder is provided", () => {
    const columns = groupResults(results(), "status");
    expect(columns.map((c) => c.label)).toEqual([
      "active",
      "done",
      "in progress",
      "Unassigned",
    ]);
  });

  it("reorders columns according to the user's manual groupOrder", () => {
    // User wants: done first, then in progress; active falls back to alpha position.
    const columns = groupResults(results(), "status", ["done", "in progress"]);
    // Expected: done, in progress, active, Unassigned (Unassigned always last).
    expect(columns.map((c) => c.label)).toEqual([
      "done",
      "in progress",
      "active",
      "Unassigned",
    ]);
  });

  it("places only the manually-ordered columns and keeps the rest alphabetical", () => {
    // User pinned only "active" to position 0. Others keep alpha order:
    // done, in progress. Unassigned last.
    const columns = groupResults(results(), "status", ["active"]);
    expect(columns.map((c) => c.label)).toEqual([
      "active",
      "done",
      "in progress",
      "Unassigned",
    ]);
  });

  it("keeps Unassigned at the end even when the user pins it into the order", () => {
    // User tries to pin "Unassigned" to position 0.
    // Expected: active, done, in progress, Unassigned (Unassigned anchors last).
    const columns = groupResults(results(), "status", ["Unassigned"]);
    expect(columns.map((c) => c.label)).toEqual([
      "active",
      "done",
      "in progress",
      "Unassigned",
    ]);
  });

  it("ignores groupOrder entries that do not match any column label", () => {
    const columns = groupResults(results(), "status", ["Nonexistent", "done"]);
    // "Nonexistent" is a no-op (no such column); "done" pinned to position 0.
    // Remaining: active, in progress in alpha order.
    expect(columns.map((c) => c.label)).toEqual([
      "done",
      "active",
      "in progress",
      "Unassigned",
    ]);
  });

  it("handles case differences in groupOrder entries case-insensitively", () => {
    // The user typed "DONE" (uppercase) but the column label is "done".
    const columns = groupResults(results(), "status", ["ACTIVE", "DONE"]);
    // Pinned: ACTIVE → active (position 0), DONE → done (position 1).
    // Remaining: in progress. Unassigned last.
    expect(columns.map((c) => c.label)).toEqual([
      "active",
      "done",
      "in progress",
      "Unassigned",
    ]);
  });

  it("is a no-op for folder-grouped boards (groupOrder is a no-op)", () => {
    const folderResults: NoteRecord[] = [
      note("Alpha/one.md"),
      note("Beta/two.md"),
      note("Gamma/three.md"),
    ];
    const FOLDER_GROUP_BY = "file.folder";
    const columns = groupResults(folderResults, FOLDER_GROUP_BY, ["Gamma"]);
    // Folder grouping stays alphabetical (Alpha, Beta, Gamma) — groupOrder
    // is intentionally ignored for folder boards (folder paths are stable).
    expect(columns.map((c) => c.label)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("preserves note membership in each column regardless of manual order", () => {
    const columns = groupResults(results(), "status", ["done", "active"]);
    const byLabel = new Map(columns.map((c) => [c.label, c]));
    expect(byLabel.get("done")?.notes.map((n) => n.path).sort()).toEqual(["c.md", "d.md"]);
    expect(byLabel.get("active")?.notes.map((n) => n.path)).toEqual(["a.md"]);
    expect(byLabel.get("in progress")?.notes.map((n) => n.path)).toEqual(["b.md"]);
  });

  it("handles an empty groupOrder as equivalent to undefined", () => {
    const columns = groupResults(results(), "status", []);
    expect(columns.map((c) => c.label)).toEqual([
      "active",
      "done",
      "in progress",
      "Unassigned",
    ]);
  });
});
