import { describe, expect, it } from "vitest";
import { escapeWikiLinkText, parseWikiLinks, unescapeWikiLinkText } from "./wikiSyntax";

describe("parseWikiLinks", () => {
  it("parses a plain [[Note]] link with no fragment or label", () => {
    const source = "See [[Existing Note]] for details.";
    const [record] = parseWikiLinks(source);
    expect(record.noteTarget).toBe("Existing Note");
    expect(record.fragment).toBeUndefined();
    expect(record.label).toBeUndefined();
    expect(record.parseStatus).toBe("valid");
    expect(record.raw).toBe("[[Existing Note]]");
    expect(record.sourceFrom).toBe(source.indexOf("[["));
    expect(record.sourceTo).toBe(source.indexOf("]]") + 2);
    expect(source.slice(record.sourceFrom, record.sourceTo)).toBe(record.raw);
  });

  it("parses [[Note|Label]] with an explicit label", () => {
    const [record] = parseWikiLinks("[[Existing Note|see this]]");
    expect(record.noteTarget).toBe("Existing Note");
    expect(record.label).toBe("see this");
    expect(record.fragment).toBeUndefined();
  });

  it("parses [[Note#Heading]] into a heading fragment", () => {
    const [record] = parseWikiLinks("[[Project Plan#Milestones]]");
    expect(record.noteTarget).toBe("Project Plan");
    expect(record.fragment).toEqual({ kind: "heading", value: "Milestones" });
    expect(record.label).toBeUndefined();
  });

  it("parses [[#Heading]] as a same-note heading link with an empty note target", () => {
    const [record] = parseWikiLinks("[[#Design System]]");
    expect(record.noteTarget).toBe("");
    expect(record.fragment).toEqual({ kind: "heading", value: "Design System" });
  });

  it("parses [[Note#Heading|Label]] with both a fragment and a label", () => {
    const [record] = parseWikiLinks("[[Project Plan#Milestones|the milestones]]");
    expect(record.noteTarget).toBe("Project Plan");
    expect(record.fragment).toEqual({ kind: "heading", value: "Milestones" });
    expect(record.label).toBe("the milestones");
  });

  it("parses [[#Heading|Label]] as a same-note heading link with a label", () => {
    const [record] = parseWikiLinks("[[#Milestones|see above]]");
    expect(record.noteTarget).toBe("");
    expect(record.fragment).toEqual({ kind: "heading", value: "Milestones" });
    expect(record.label).toBe("see above");
  });

  it("parses [[Note#^block-id]] into a block fragment", () => {
    const [record] = parseWikiLinks("[[Note#^release-decision]]");
    expect(record.fragment).toEqual({ kind: "block", value: "release-decision" });
  });

  it("parses [[#^block-id]] as a same-note block reference", () => {
    const [record] = parseWikiLinks("[[#^principle]]");
    expect(record.noteTarget).toBe("");
    expect(record.fragment).toEqual({ kind: "block", value: "principle" });
  });

  it("trims surrounding whitespace around the note target and fragment", () => {
    const [record] = parseWikiLinks("[[ Note # Heading ]]");
    expect(record.noteTarget).toBe("Note");
    expect(record.fragment).toEqual({ kind: "heading", value: "Heading" });
  });

  it("does not trim the label", () => {
    const [record] = parseWikiLinks("[[Note| padded label ]]");
    expect(record.label).toBe(" padded label ");
  });

  it("only treats the first unescaped # in the target expression as the fragment separator", () => {
    const [record] = parseWikiLinks("[[Note#Heading#2]]");
    expect(record.noteTarget).toBe("Note");
    expect(record.fragment).toEqual({ kind: "heading", value: "Heading#2" });
  });

  it("does not treat a # appearing only inside the label as a fragment separator", () => {
    const [record] = parseWikiLinks("[[Note|Label #1]]");
    expect(record.noteTarget).toBe("Note");
    expect(record.fragment).toBeUndefined();
    expect(record.label).toBe("Label #1");
  });

  it("leaves an empty [[]] wikilink unmatched, same as before this feature existed", () => {
    expect(parseWikiLinks("Just [[]] brackets.")).toEqual([]);
  });

  it("leaves an unterminated [[ with no closing ]] unmatched rather than guessing", () => {
    expect(parseWikiLinks("This has [[ no closing brackets at all")).toEqual([]);
  });

  it("marks an empty fragment after # as malformed", () => {
    const [record] = parseWikiLinks("[[Note#]]");
    expect(record.parseStatus).toBe("malformed");
  });

  it("marks an empty fragment after #| (fragment omitted before a label) as malformed", () => {
    const [record] = parseWikiLinks("[[Note#|Label]]");
    expect(record.parseStatus).toBe("malformed");
  });

  it("marks an empty block id after #^ as malformed", () => {
    const [record] = parseWikiLinks("[[Note#^]]");
    expect(record.parseStatus).toBe("malformed");
  });

  it("finds multiple, non-overlapping links in one document", () => {
    const records = parseWikiLinks("[[First]] and [[Second#Heading]] and [[Third|Label]].");
    expect(records).toHaveLength(3);
    expect(records[0].noteTarget).toBe("First");
    expect(records[1].noteTarget).toBe("Second");
    expect(records[2].noteTarget).toBe("Third");
  });

  it("finds a wikilink spanning multiple lines, matching the pre-F04 regex's own behavior", () => {
    const records = parseWikiLinks("[[Multi\nLine]]");
    expect(records).toHaveLength(1);
    expect(records[0].noteTarget).toBe("Multi\nLine");
  });

  describe("legacyRaw", () => {
    it("keeps the complete raw inner text, hash and pipe included, for the compatibility fallback", () => {
      const [record] = parseWikiLinks("[[Foo#1|Bar]]");
      expect(record.legacyRaw).toBe("Foo#1|Bar");
    });
  });

  describe("escaping", () => {
    it("escapes a literal # so it does not split off a fragment", () => {
      const [record] = parseWikiLinks("[[Note\\#1]]");
      expect(record.noteTarget).toBe("Note#1");
      expect(record.fragment).toBeUndefined();
    });

    it("escapes a literal | so it does not split off a label", () => {
      const [record] = parseWikiLinks("[[Note\\|1]]");
      expect(record.noteTarget).toBe("Note|1");
      expect(record.label).toBeUndefined();
    });

    it("escapes a literal ] so it does not end the link early", () => {
      const [record] = parseWikiLinks("[[Note\\]1]]");
      expect(record.noteTarget).toBe("Note]1");
    });

    it("escapes a literal backslash", () => {
      const [record] = parseWikiLinks("[[Note\\\\1]]");
      expect(record.noteTarget).toBe("Note\\1");
    });

    it("leaves a backslash before a non-escapable character literal", () => {
      expect(unescapeWikiLinkText("a\\nb")).toBe("a\\nb");
    });

    it("unescapes inside a heading fragment too", () => {
      const [record] = parseWikiLinks("[[Note#Heading \\# One]]");
      expect(record.fragment).toEqual({ kind: "heading", value: "Heading # One" });
    });
  });

  describe("escapeWikiLinkText", () => {
    it("leaves plain text without any of the five escapable characters unchanged", () => {
      expect(escapeWikiLinkText("Plain Heading Text")).toBe("Plain Heading Text");
    });

    it("escapes a literal # so a round trip through parseWikiLinks keeps it in the fragment", () => {
      const escaped = escapeWikiLinkText("Issue #12");
      expect(escaped).toBe("Issue \\#12");
      const [record] = parseWikiLinks(`[[Note#${escaped}]]`);
      expect(record.fragment).toEqual({ kind: "heading", value: "Issue #12" });
    });

    it("escapes a literal | so it does not split off a label", () => {
      const escaped = escapeWikiLinkText("Before | After");
      const [record] = parseWikiLinks(`[[Note#${escaped}]]`);
      expect(record.fragment).toEqual({ kind: "heading", value: "Before | After" });
      expect(record.label).toBeUndefined();
    });

    it("escapes brackets and backslashes", () => {
      expect(escapeWikiLinkText("[a]\\b")).toBe("\\[a\\]\\\\b");
    });

    it("is the exact inverse of unescapeWikiLinkText for every escapable character combined", () => {
      const original = "A \\ heading # with | every ] special [ character";
      expect(unescapeWikiLinkText(escapeWikiLinkText(original))).toBe(original);
    });
  });
});
