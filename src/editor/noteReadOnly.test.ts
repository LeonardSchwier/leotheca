import { describe, expect, it } from "vitest";
import { isNoteReadOnly, isNoteReadOnlyActive, setNoteReadOnly } from "./noteReadOnly";

describe("per-note read-only marker", () => {
  it("adds a portable true marker to a note without frontmatter", () => {
    const locked = setNoteReadOnly("Body.\n", true);
    expect(locked).toBe("---\nleotheca-read-only: true\n---\nBody.\n");
    expect(isNoteReadOnly(locked)).toBe(true);
  });

  it("changes only the marker while preserving other frontmatter", () => {
    const source = "---\ntitle: Keep\nleotheca-read-only: false\n---\nBody\n";
    const locked = setNoteReadOnly(source, true);
    expect(locked).toBe("---\ntitle: Keep\nleotheca-read-only: true\n---\nBody\n");
    expect(setNoteReadOnly(locked, false)).toContain("leotheca-read-only: false");
  });

  it("does not mistake an arbitrary string for an active lock", () => {
    expect(isNoteReadOnly("---\nleotheca-read-only: yes\n---\nBody")).toBe(false);
  });

  it("does not enforce a true marker when the workspace feature is disabled", () => {
    const source = "---\nleotheca-read-only: true\n---\nBody\n";
    expect(isNoteReadOnlyActive(source, true)).toBe(true);
    expect(isNoteReadOnlyActive(source, false)).toBe(false);
  });
});
