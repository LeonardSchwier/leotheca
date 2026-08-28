import { describe, expect, it } from "vitest";
import { buildTagTree, extractInlineTags, extractTags } from "./tags";

describe("extractInlineTags", () => {
  it("returns an empty array when there are no tags", () => {
    expect(extractInlineTags("Just a plain note with no tags.")).toEqual([]);
  });

  it("extracts a simple tag", () => {
    expect(extractInlineTags("This is #important.")).toEqual(["important"]);
  });

  it("extracts multiple tags from the same line", () => {
    expect(extractInlineTags("#work and #journal today.")).toEqual(["work", "journal"]);
  });

  it("extracts a nested tag as one string", () => {
    expect(extractInlineTags("Filed under #work/project-x.")).toEqual(["work/project-x"]);
  });

  it("does not treat a heading marker as a tag", () => {
    expect(extractInlineTags("# Heading\n\nBody text.")).toEqual([]);
  });

  it("does not treat a doubled hash as a tag", () => {
    expect(extractInlineTags("## Heading\n\n##tag")).toEqual([]);
  });

  it("does not match a hash in the middle of a word", () => {
    expect(extractInlineTags("C++ is not a hash#tag either.")).toEqual([]);
  });

  it("does not match inside an inline code span", () => {
    expect(extractInlineTags("Use `#define FOO` in C.")).toEqual([]);
  });

  it("does not match inside a fenced code block", () => {
    const body = ["```c", "#include <stdio.h>", "#define FOO 1", "```", "", "#real-tag outside."].join(
      "\n",
    );
    expect(extractInlineTags(body)).toEqual(["real-tag"]);
  });

  it("does not match inside a ~~~ fenced code block", () => {
    const body = ["~~~", "#notatag", "~~~"].join("\n");
    expect(extractInlineTags(body)).toEqual([]);
  });

  it("resumes normal scanning after a closed fenced code block", () => {
    const body = ["```", "code", "```", "#after"].join("\n");
    expect(extractInlineTags(body)).toEqual(["after"]);
  });

  it("does not match a tag immediately after a slash (a URL fragment)", () => {
    expect(extractInlineTags("See example.com/#section for details.")).toEqual([]);
  });

  it("matches a tag at the very start of a line with no preceding character", () => {
    expect(extractInlineTags("#start-of-line")).toEqual(["start-of-line"]);
  });
});

describe("extractTags", () => {
  it("returns an empty array for a note with no tags anywhere", () => {
    expect(extractTags("---\ncreated: 2026-08-27\n---\n\nJust a note.")).toEqual([]);
  });

  it("combines frontmatter tags and inline tags", () => {
    const source = "---\ntags: [work]\n---\n\nAlso #journal today.";
    expect(extractTags(source)).toEqual(["work", "journal"]);
  });

  it("de-duplicates the same tag from both sources, canonicalized to lowercase", () => {
    const source = "---\ntags: [Project]\n---\n\nWorking on #project again.";
    expect(extractTags(source)).toEqual(["project"]);
  });

  it("canonicalizes differently-cased inline tags to the same lowercase tag", () => {
    expect(extractTags("#Work and #work are the same tag.")).toEqual(["work"]);
  });

  it("does not mistake a stray '#' inside the frontmatter block for an inline tag", () => {
    const source = '---\ntitle: "Issue #42"\n---\n\nNo inline tags here.';
    expect(extractTags(source)).toEqual([]);
  });
});

describe("buildTagTree", () => {
  it("returns an empty array for an empty index", () => {
    expect(buildTagTree(new Map())).toEqual([]);
  });

  it("builds one root node per top-level tag, sorted alphabetically", () => {
    const tree = buildTagTree(
      new Map([
        ["work", ["/vault/a.md"]],
        ["journal", ["/vault/b.md"]],
      ]),
    );
    expect(tree.map((node) => node.segment)).toEqual(["journal", "work"]);
  });

  it("nests a '/'-separated tag under its parent segment", () => {
    const tree = buildTagTree(new Map([["work/project", ["/vault/a.md"]]]));
    expect(tree).toHaveLength(1);
    expect(tree[0].segment).toBe("work");
    expect(tree[0].fullTag).toBe("work");
    expect(tree[0].paths).toEqual([]);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({ segment: "project", fullTag: "work/project" });
  });

  it("a parent node's allPaths aggregates its own and every descendant's paths", () => {
    const tree = buildTagTree(
      new Map([
        ["work", ["/vault/a.md"]],
        ["work/project", ["/vault/b.md"]],
      ]),
    );
    const work = tree.find((node) => node.fullTag === "work")!;
    expect(work.paths).toEqual(["/vault/a.md"]);
    expect(new Set(work.allPaths)).toEqual(new Set(["/vault/a.md", "/vault/b.md"]));
  });

  it("does not double-count a note tagged with both a parent and a child tag", () => {
    const tree = buildTagTree(
      new Map([
        ["work", ["/vault/a.md"]],
        ["work/project", ["/vault/a.md"]],
      ]),
    );
    const work = tree.find((node) => node.fullTag === "work")!;
    expect(work.allPaths).toEqual(["/vault/a.md"]);
  });

  it("a leaf node's allPaths equals its own paths", () => {
    const tree = buildTagTree(new Map([["solo", ["/vault/a.md"]]]));
    expect(tree[0].allPaths).toEqual(["/vault/a.md"]);
  });

  it("sorts children alphabetically too, independent of insertion order", () => {
    const tree = buildTagTree(
      new Map([
        ["work/zeta", ["/vault/a.md"]],
        ["work/alpha", ["/vault/b.md"]],
      ]),
    );
    const work = tree.find((node) => node.fullTag === "work")!;
    expect(work.children.map((c) => c.segment)).toEqual(["alpha", "zeta"]);
  });

  it("handles three levels of nesting", () => {
    const tree = buildTagTree(new Map([["a/b/c", ["/vault/x.md"]]]));
    expect(tree[0].fullTag).toBe("a");
    expect(tree[0].children[0].fullTag).toBe("a/b");
    expect(tree[0].children[0].children[0].fullTag).toBe("a/b/c");
    expect(tree[0].children[0].children[0].paths).toEqual(["/vault/x.md"]);
  });
});
