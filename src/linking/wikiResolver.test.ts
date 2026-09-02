import { afterEach, describe, expect, it } from "vitest";
import { scanHeadings } from "../markdown/headings";
import { linkIndex } from "./store";
import { parseWikiLinks } from "./wikiSyntax";
import { resolveHeadingFragment, resolveWikiLinkTarget } from "./wikiResolver";

function setNotes(namesToPaths: Record<string, string[]>) {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(Object.entries(namesToPaths)),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
  };
}

afterEach(() => {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
  };
});

describe("resolveHeadingFragment", () => {
  const headings = scanHeadings("# Intro\n\n## Design\n\ntext\n\n## Design\n\nmore text");

  it("resolves a unique heading by its normalized key", () => {
    const result = resolveHeadingFragment(headings, "Intro");
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.heading.rawText).toBe("Intro");
  });

  it("is case-insensitive and collapses whitespace, per the shared normalization contract", () => {
    const result = resolveHeadingFragment(headings, "  INTRO  ");
    expect(result.status).toBe("resolved");
  });

  it("reports missing-fragment for a heading that doesn't exist", () => {
    expect(resolveHeadingFragment(headings, "Nonexistent").status).toBe("missing-fragment");
  });

  it("reports ambiguous-fragment, not the first match, for duplicate headings", () => {
    const result = resolveHeadingFragment(headings, "Design");
    expect(result.status).toBe("ambiguous-fragment");
    if (result.status === "ambiguous-fragment") expect(result.candidates).toHaveLength(2);
  });
});

describe("resolveWikiLinkTarget", () => {
  it("returns malformed for a malformed record without attempting resolution", () => {
    const [record] = parseWikiLinks("[[Note#]]");
    expect(resolveWikiLinkTarget(record, {}).status).toBe("malformed");
  });

  it("resolves a plain note link with no fragment", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    const [record] = parseWikiLinks("[[Project Plan]]");
    const result = resolveWikiLinkTarget(record, {});
    expect(result).toEqual({ status: "resolved", notePath: "/vault/project-plan.md" });
  });

  it("reports missing-note for a note target that doesn't resolve", () => {
    const [record] = parseWikiLinks("[[Nowhere]]");
    expect(resolveWikiLinkTarget(record, {}).status).toBe("missing-note");
  });

  it("resolves a same-note heading link against the current note's own headings", () => {
    const [record] = parseWikiLinks("[[#Milestones]]");
    const targetHeadings = scanHeadings("# Milestones\n\ntext");
    const result = resolveWikiLinkTarget(record, {
      currentNotePath: "/vault/plan.md",
      targetHeadings,
    });
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/plan.md");
    expect(result.heading?.rawText).toBe("Milestones");
  });

  it("reports missing-note for a same-note fragment with no current note path", () => {
    const [record] = parseWikiLinks("[[#Milestones]]");
    expect(resolveWikiLinkTarget(record, {}).status).toBe("missing-note");
  });

  it("resolves a cross-note heading link once the target note's headings are supplied", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    const [record] = parseWikiLinks("[[Project Plan#Milestones]]");
    const targetHeadings = scanHeadings("# Milestones\n\ntext");
    const result = resolveWikiLinkTarget(record, { targetHeadings });
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/project-plan.md");
    expect(result.heading?.rawText).toBe("Milestones");
  });

  it("reports the note as resolved without a heading verdict when the target's headings are not supplied yet", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    const [record] = parseWikiLinks("[[Project Plan#Milestones]]");
    const result = resolveWikiLinkTarget(record, {});
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/project-plan.md");
    expect(result.heading).toBeUndefined();
  });

  it("reports missing-fragment when the note resolves but the heading does not exist", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    const [record] = parseWikiLinks("[[Project Plan#Nonexistent]]");
    const targetHeadings = scanHeadings("# Milestones\n\ntext");
    const result = resolveWikiLinkTarget(record, { targetHeadings });
    expect(result.status).toBe("missing-fragment");
    expect(result.notePath).toBe("/vault/project-plan.md");
  });

  it("reports ambiguous-fragment, never silently picking the first occurrence, for duplicate headings", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    const [record] = parseWikiLinks("[[Project Plan#Design]]");
    const targetHeadings = scanHeadings("## Design\n\ntext\n\n## Design\n\nmore");
    const result = resolveWikiLinkTarget(record, { targetHeadings });
    expect(result.status).toBe("ambiguous-fragment");
    expect(result.candidateHeadings).toHaveLength(2);
  });

  it("degrades a block fragment to a note-level link, since block resolution is a later phase", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note#^release-decision]]");
    const result = resolveWikiLinkTarget(record, {});
    expect(result).toEqual({ status: "resolved", notePath: "/vault/note.md" });
  });

  describe("legacy compatibility fallback (spec 5.3)", () => {
    it("falls back to a literal filename containing a raw # when the structured note portion doesn't resolve", () => {
      setNotes({ "foo#1": ["/vault/foo#1.md"] });
      const [record] = parseWikiLinks("[[Foo#1]]");
      const result = resolveWikiLinkTarget(record, {});
      expect(result).toEqual({ status: "resolved", notePath: "/vault/foo#1.md", legacyFallback: true });
    });

    it("falls back to a literal filename containing a raw | when the structured note portion doesn't resolve", () => {
      setNotes({ "foo|bar": ["/vault/foo|bar.md"] });
      const [record] = parseWikiLinks("[[Foo|Bar]]");
      const result = resolveWikiLinkTarget(record, {});
      expect(result).toEqual({ status: "resolved", notePath: "/vault/foo|bar.md", legacyFallback: true });
    });

    it("prefers structured resolution over the legacy fallback when the structured note target itself resolves", () => {
      setNotes({
        foo: ["/vault/foo.md"],
        "foo|bar": ["/vault/foo|bar.md"],
      });
      const [record] = parseWikiLinks("[[Foo|Bar]]");
      const result = resolveWikiLinkTarget(record, {});
      expect(result).toEqual({ status: "resolved", notePath: "/vault/foo.md" });
    });

    it("never falls back for a same-note target, which is deliberately empty, not a filename", () => {
      const [record] = parseWikiLinks("[[#Heading]]");
      expect(resolveWikiLinkTarget(record, {}).status).toBe("missing-note");
    });

    it("reports missing-note when neither the structured target nor the legacy whole text resolves", () => {
      const [record] = parseWikiLinks("[[Nowhere#Heading]]");
      expect(resolveWikiLinkTarget(record, {}).status).toBe("missing-note");
    });
  });
});
