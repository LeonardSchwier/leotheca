import { describe, it, expect } from "vitest";
import {
  computeHealthAudit,
  summarizeAudit,
  type HealthAuditInput,
} from "./healthAudit";
import type { LinkIndex } from "../linking/store";

function makeIndex(overrides: Partial<LinkIndex> = {}): LinkIndex {
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
    wikiLinksByPath: new Map(),
    headingsByPath: new Map(),
    blocksByPath: new Map(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<HealthAuditInput> = {}): HealthAuditInput {
  return {
    index: makeIndex(),
    contentsByPath: new Map(),
    allFilePaths: new Set(),
    ...overrides,
  };
}

describe("computeHealthAudit", () => {
  it("returns empty array for an empty workspace", () => {
    const issues = computeHealthAudit(makeInput());
    expect(issues).toEqual([]);
  });

  // ── Duplicates ────────────────────────────────────────────────────

  it("detects duplicate notes with the same normalized name", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["a/note.md", "b/note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["a/note.md", "Content A"],
        ["b/note.md", "Content B"],
      ]),
      allFilePaths: new Set(["a/note.md", "b/note.md"]),
    });
    const issues = computeHealthAudit(input);
    const dups = issues.filter((i) => i.type === "duplicate");
    expect(dups.length).toBe(2);
    expect(dups[0].notePath).toBe("a/note.md");
    expect(dups[1].notePath).toBe("b/note.md");
    // First is not fixable, second is.
    expect(dups[0].fixable).toBe(false);
    expect(dups[1].fixable).toBe(true);
    expect(dups[1].fix?.newName).toBe("note (2).md");
  });

  it("case-insensitive duplicate detection", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["Note.md", "note.md"]],
      ]),
    });
    const issues = computeHealthAudit(makeInput({ index }));
    const dups = issues.filter((i) => i.type === "duplicate");
    expect(dups.length).toBe(2);
  });

  // ── Near-duplicates ───────────────────────────────────────────────

  it("detects near-duplicate notes with high Jaccard similarity", () => {
    const content = "This is a test note with some content that should be similar to another note in the workspace for testing purposes. It contains several words that overlap significantly.";
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note-a", ["note-a.md"]],
        ["note-b", ["note-b.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["note-a.md", content],
        // 95% similar — change one word.
        ["note-b.md", content.replace("testing", "checking")],
      ]),
      allFilePaths: new Set(["note-a.md", "note-b.md"]),
    });
    const issues = computeHealthAudit(input);
    const nearDups = issues.filter((i) => i.type === "near-duplicate");
    expect(nearDups.length).toBe(1);
    expect(nearDups[0].notePath).toBe("note-a.md");
  });

  it("does not flag low-similarity pairs as near-duplicates", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["alpha", ["alpha.md"]],
        ["beta", ["beta.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["alpha.md", "completely different content about topic A"],
        ["beta.md", "entirely unrelated text about topic B"],
      ]),
      allFilePaths: new Set(["alpha.md", "beta.md"]),
    });
    const issues = computeHealthAudit(input);
    const nearDups = issues.filter((i) => i.type === "near-duplicate");
    expect(nearDups.length).toBe(0);
  });

  it("does not flag same-name pairs as near-duplicates (covered by duplicates)", () => {
    const content = "Some shared content that is similar enough to be flagged.";
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["a/note.md", "b/note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["a/note.md", content],
        ["b/note.md", content.replace("flagged", "noted")],
      ]),
      allFilePaths: new Set(["a/note.md", "b/note.md"]),
    });
    const issues = computeHealthAudit(input);
    const nearDups = issues.filter((i) => i.type === "near-duplicate");
    expect(nearDups.length).toBe(0);
    const dups = issues.filter((i) => i.type === "duplicate");
    expect(dups.length).toBe(2);
  });

  // ── Orphans ───────────────────────────────────────────────────────

  it("detects orphan notes with no inbound or outbound links", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["orphan", ["orphan.md"]],
        ["linked", ["linked.md"]],
      ]),
      backlinksByPath: new Map([
        ["linked.md", ["other.md"]],
      ]),
      wikiLinksByPath: new Map([
        ["linked.md", []],
        ["other.md", []],
      ]),
    });
    // Need at least one wiki link record for "hasOutboundLinks" to be meaningful.
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["orphan.md", "Orphan content"],
        ["linked.md", "Linked content"],
      ]),
      allFilePaths: new Set(["orphan.md", "linked.md"]),
    });
    const issues = computeHealthAudit(input);
    const orphans = issues.filter((i) => i.type === "orphan");
    expect(orphans.some((o) => o.notePath === "orphan.md")).toBe(true);
  });

  it("does not flag a note with inbound links as an orphan", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["target", ["target.md"]],
        ["source", ["source.md"]],
      ]),
      backlinksByPath: new Map([
        ["target.md", ["source.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["target.md", "Target content"],
        ["source.md", "Source content"],
      ]),
      allFilePaths: new Set(["target.md", "source.md"]),
    });
    const issues = computeHealthAudit(input);
    const orphans = issues.filter((i) => i.type === "orphan");
    expect(orphans.some((o) => o.notePath === "target.md")).toBe(false);
  });

  // ── Empty notes ───────────────────────────────────────────────────

  it("detects empty notes with no content after frontmatter", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["empty", ["empty.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["empty.md", "---\ntitle: Empty note\n---\n\n   \n"],
      ]),
      allFilePaths: new Set(["empty.md"]),
    });
    const issues = computeHealthAudit(input);
    const empties = issues.filter((i) => i.type === "empty");
    expect(empties.length).toBe(1);
    expect(empties[0].notePath).toBe("empty.md");
    expect(empties[0].fixable).toBe(true);
    expect(empties[0].fix?.action).toBe("delete");
  });

  it("does not flag a note with actual content as empty", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["full", ["full.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["full.md", "---\ntitle: Full note\n---\n\nSome real content here."],
      ]),
      allFilePaths: new Set(["full.md"]),
    });
    const issues = computeHealthAudit(input);
    const empties = issues.filter((i) => i.type === "empty");
    expect(empties.length).toBe(0);
  });

  it("does not flag a note with frontmatter only as empty if it has body content", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["fm", ["fm.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["fm.md", "---\ntitle: Frontmatter\n---\nBody text present."],
      ]),
      allFilePaths: new Set(["fm.md"]),
    });
    const issues = computeHealthAudit(input);
    const empties = issues.filter((i) => i.type === "empty");
    expect(empties.length).toBe(0);
  });

  // ── Broken image references ───────────────────────────────────────

  it("detects broken image references", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["note.md", "Text with image: ![alt](missing.png)"],
      ]),
      allFilePaths: new Set(["note.md"]), // missing.png not in set
    });
    const issues = computeHealthAudit(input);
    const brokenImages = issues.filter((i) => i.type === "broken-image");
    expect(brokenImages.length).toBe(1);
    expect(brokenImages[0].notePath).toBe("note.md");
    expect(brokenImages[0].description).toContain("missing.png");
    expect(brokenImages[0].fixable).toBe(true);
  });

  it("does not flag existing image references as broken", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["note.md", "Text with image: ![alt](images/pic.png)"],
      ]),
      allFilePaths: new Set(["note.md", "images/pic.png"]),
    });
    const issues = computeHealthAudit(input);
    const brokenImages = issues.filter((i) => i.type === "broken-image");
    expect(brokenImages.length).toBe(0);
  });

  it("ignores external image URLs (http/https/data:)", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["note.md", "External: ![logo](https://example.com/logo.png) and ![data](data:image/png;base64,xxx)"],
      ]),
      allFilePaths: new Set(["note.md"]),
    });
    const issues = computeHealthAudit(input);
    const brokenImages = issues.filter((i) => i.type === "broken-image");
    expect(brokenImages.length).toBe(0);
  });

  it("resolves relative image paths from the note's directory", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["dir/note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["dir/note.md", "Image: ![pic](sub/folder/img.png)"],
      ]),
      allFilePaths: new Set(["dir/note.md", "dir/sub/folder/img.png"]),
    });
    const issues = computeHealthAudit(input);
    const brokenImages = issues.filter((i) => i.type === "broken-image");
    expect(brokenImages.length).toBe(0);
  });

  // ── Summary ───────────────────────────────────────────────────────

  it("summarizeAudit counts by type", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["dup", ["a/dup.md", "b/dup.md"]],
        ["empty", ["empty.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["a/dup.md", "Content A"],
        ["b/dup.md", "Content B"],
        ["empty.md", "---\ntitle: E\n---\n"],
      ]),
      allFilePaths: new Set(["a/dup.md", "b/dup.md", "empty.md"]),
    });
    const issues = computeHealthAudit(input);
    const summary = summarizeAudit(issues);
    expect(summary.totalIssues).toBe(issues.length);
    expect(summary.byType.duplicate).toBe(2);
    expect(summary.byType.empty).toBe(1);
    expect(summary.byType.orphan).toBe(3);
  });

  // ── Mixed workspace ───────────────────────────────────────────────

  it("handles a workspace with all issue types", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["a/note.md", "b/note.md"]],
        ["orphan", ["orphan.md"]],
        ["empty", ["empty.md"]],
        ["img", ["img.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["a/note.md", "Dup content A with image ![x](missing.png)"],
        ["b/note.md", "Dup content B"],
        ["orphan.md", "Orphan content, completely isolated."],
        ["empty.md", "---\ntitle: E\n---\n  \n"],
        ["img.md", "Has a broken image: ![pic](nothere.jpg)"],
      ]),
      allFilePaths: new Set([
        "a/note.md",
        "b/note.md",
        "orphan.md",
        "empty.md",
        "img.md",
      ]),
    });
    const issues = computeHealthAudit(input);
    const types = new Set(issues.map((i) => i.type));
    expect(types.has("duplicate")).toBe(true);
    expect(types.has("orphan")).toBe(true);
    expect(types.has("empty")).toBe(true);
    expect(types.has("broken-image")).toBe(true);
  });

  // ── Output stability ─────────────────────────────────────────────

  it("produces deterministic output (sorted)", () => {
    const index = makeIndex({
      pathsByNoteName: new Map([
        ["note", ["z/note.md", "a/note.md"]],
      ]),
    });
    const input = makeInput({
      index,
      contentsByPath: new Map([
        ["z/note.md", "Z content"],
        ["a/note.md", "A content"],
      ]),
      allFilePaths: new Set(["z/note.md", "a/note.md"]),
    });
    const issues1 = computeHealthAudit(input);
    const issues2 = computeHealthAudit(input);
    expect(issues1).toEqual(issues2);
  });
});
