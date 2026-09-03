import { afterEach, describe, expect, it } from "vitest";
import { scanHeadings } from "../markdown/headings";
import { scanBlockIds } from "../markdown/blocks";
import { linkIndex } from "./store";
import { parseWikiLinks } from "./wikiSyntax";
import {
  crossNoteHeadingsFor,
  resolveBlockFragment,
  resolveHeadingFragment,
  resolveWikiLinkTarget,
} from "./wikiResolver";

function setNotes(namesToPaths: Record<string, string[]>) {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(Object.entries(namesToPaths)),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
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
    tasksByPath: new Map(),
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

describe("resolveBlockFragment", () => {
  const blocks = scanBlockIds("First paragraph. ^first-id\n\nSecond. ^dup\n\nThird. ^dup");

  it("resolves a unique block id", () => {
    const result = resolveBlockFragment(blocks, "first-id");
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.block.id).toBe("first-id");
  });

  it("is case-insensitive, per spec 7.1's duplicate-detection rule", () => {
    const result = resolveBlockFragment(blocks, "FIRST-ID");
    expect(result.status).toBe("resolved");
  });

  it("reports missing-fragment for a block id that doesn't exist", () => {
    expect(resolveBlockFragment(blocks, "nonexistent").status).toBe("missing-fragment");
  });

  it("reports ambiguous-fragment, not the first match, for duplicate ids", () => {
    const result = resolveBlockFragment(blocks, "dup");
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

  it("resolves a block fragment to a note-level link when the target's blocks are not supplied yet (cross-note, unread)", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note#^release-decision]]");
    const result = resolveWikiLinkTarget(record, {});
    expect(result).toEqual({ status: "resolved", notePath: "/vault/note.md" });
  });

  it("resolves a cross-note block link once the target note's blocks are supplied", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note#^release-decision]]");
    const targetBlocks = scanBlockIds("This decision is final. ^release-decision");
    const result = resolveWikiLinkTarget(record, { targetBlocks });
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/note.md");
    expect(result.block?.id).toBe("release-decision");
  });

  it("resolves a same-note block link against the current note's own blocks", () => {
    const [record] = parseWikiLinks("[[#^local-first]]");
    const targetBlocks = scanBlockIds("The user owns the files. ^local-first");
    const result = resolveWikiLinkTarget(record, {
      currentNotePath: "/vault/plan.md",
      targetBlocks,
    });
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/plan.md");
    expect(result.block?.id).toBe("local-first");
  });

  it("reports missing-fragment when the note resolves but the block id does not exist", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note#^nonexistent]]");
    const targetBlocks = scanBlockIds("Some content. ^actual-id");
    const result = resolveWikiLinkTarget(record, { targetBlocks });
    expect(result.status).toBe("missing-fragment");
    expect(result.notePath).toBe("/vault/note.md");
  });

  it("reports ambiguous-fragment, never silently picking the first occurrence, for duplicate block ids", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note#^dup]]");
    const targetBlocks = scanBlockIds("One. ^dup\n\nTwo. ^dup");
    const result = resolveWikiLinkTarget(record, { targetBlocks });
    expect(result.status).toBe("ambiguous-fragment");
    expect(result.candidateBlocks).toHaveLength(2);
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

describe("crossNoteHeadingsFor (F04 Phase 5a)", () => {
  it("returns undefined for a same-note record", () => {
    const [record] = parseWikiLinks("[[#Milestones]]");
    expect(crossNoteHeadingsFor(record)).toBeUndefined();
  });

  it("returns undefined for a plain whole-note link with no fragment", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note]]");
    expect(crossNoteHeadingsFor(record)).toBeUndefined();
  });

  it("returns undefined for a non-heading (block) fragment, out of this phase's scope", () => {
    setNotes({ note: ["/vault/note.md"] });
    const [record] = parseWikiLinks("[[Note#^some-block]]");
    expect(crossNoteHeadingsFor(record)).toBeUndefined();
  });

  it("returns undefined when the target note itself does not resolve", () => {
    const [record] = parseWikiLinks("[[Nowhere#Heading]]");
    expect(crossNoteHeadingsFor(record)).toBeUndefined();
  });

  it("returns the target note's scanned headings from LinkIndex.headingsByPath", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/vault/project-plan.md", scanHeadings("# Milestones\n\ntext")]]),
    };
    const [record] = parseWikiLinks("[[Project Plan#Milestones]]");
    const headings = crossNoteHeadingsFor(record);
    expect(headings?.map((h) => h.rawText)).toEqual(["Milestones"]);
  });

  it("returns an empty array, not undefined, when the resolving note has no entry in the sparse headingsByPath map", () => {
    setNotes({ "empty note": ["/vault/empty-note.md"] });
    linkIndex.value = { ...linkIndex.value, headingsByPath: new Map() };
    const [record] = parseWikiLinks("[[Empty Note#Anything]]");
    expect(crossNoteHeadingsFor(record)).toEqual([]);
  });

  it("lets resolveWikiLinkTarget report missing-fragment for a genuinely nonexistent cross-note heading", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/vault/project-plan.md", scanHeadings("# Milestones\n\ntext")]]),
    };
    const [record] = parseWikiLinks("[[Project Plan#Nonexistent]]");
    const result = resolveWikiLinkTarget(record, { targetHeadings: crossNoteHeadingsFor(record) });
    expect(result.status).toBe("missing-fragment");
    expect(result.notePath).toBe("/vault/project-plan.md");
  });

  it("lets resolveWikiLinkTarget report ambiguous-fragment for duplicate cross-note headings", () => {
    setNotes({ "project plan": ["/vault/project-plan.md"] });
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/vault/project-plan.md", scanHeadings("## Design\n\ntext\n\n## Design\n\nmore")]]),
    };
    const [record] = parseWikiLinks("[[Project Plan#Design]]");
    const result = resolveWikiLinkTarget(record, { targetHeadings: crossNoteHeadingsFor(record) });
    expect(result.status).toBe("ambiguous-fragment");
    expect(result.candidateHeadings).toHaveLength(2);
  });
});
