import { afterEach, describe, expect, it } from "vitest";
import { linkIndex, type LinkIndex } from "../linking/store";
import { parseWikiLinks } from "../linking/wikiSyntax";
import { scanHeadings } from "../markdown/headings";
import { classifyWikiLink, computeWorkspaceLinkDiagnostics } from "./diagnostics";

/** Builds a fixture `LinkIndex` from real note content, running the real
 * scanners (`parseWikiLinks`/`scanHeadings`) over each note rather than
 * hand-building `WikiLinkRecord`/`HeadingRecord` literals, matching this
 * codebase's established fixture convention (see TaskHubPanel.test.tsx's
 * own use of `scanTasks` on real content). `pathsByNoteName` is derived
 * from each note's own basename, same as `rebuildLinkIndex` itself.
 *
 * Also assigns the built index to the real `linkIndex` signal: as
 * `diagnostics.ts`'s own header comment explains, `resolveWikiLinkTarget`
 * resolves note targets against that live signal, not any argument, so a
 * fixture only classifies correctly once it's also the current
 * `linkIndex.value` (exactly true at every real call site). */
function buildFixtureIndex(notes: Record<string, string>): LinkIndex {
  const wikiLinksByPath = new Map<string, ReturnType<typeof parseWikiLinks>>();
  const headingsByPath = new Map<string, ReturnType<typeof scanHeadings>>();
  const pathsByNoteName = new Map<string, string[]>();
  for (const [path, content] of Object.entries(notes)) {
    const links = parseWikiLinks(content);
    if (links.length > 0) wikiLinksByPath.set(path, links);
    const headings = scanHeadings(content);
    if (headings.length > 0) headingsByPath.set(path, headings);
    const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "").toLocaleLowerCase();
    const existing = pathsByNoteName.get(name) ?? [];
    existing.push(path);
    pathsByNoteName.set(name, existing);
  }
  const index: LinkIndex = {
    backlinksByPath: new Map(),
    pathsByNoteName,
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
    wikiLinksByPath,
    headingsByPath,
  };
  linkIndex.value = index;
  return index;
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

describe("classifyWikiLink", () => {
  it("classifies a plain wikilink to an existing note as resolved", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B]]",
      "/vault/B.md": "content",
    });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    expect(classifyWikiLink(record, "/vault/A.md", index)).toEqual({
      status: "resolved",
      notePath: "/vault/B.md",
    });
  });

  it("classifies a wikilink to a nonexistent note as broken", () => {
    const index = buildFixtureIndex({ "/vault/A.md": "[[Missing]]" });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    expect(classifyWikiLink(record, "/vault/A.md", index).status).toBe("broken");
  });

  it("classifies a heading-link to an existing heading as resolved", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B#Intro]]",
      "/vault/B.md": "# Intro\ntext",
    });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    const result = classifyWikiLink(record, "/vault/A.md", index);
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/B.md");
  });

  it("classifies a heading-link to an existing note but missing heading as missing-heading", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B#Nope]]",
      "/vault/B.md": "# Intro\ntext",
    });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    const result = classifyWikiLink(record, "/vault/A.md", index);
    expect(result.status).toBe("missing-heading");
    expect(result.notePath).toBe("/vault/B.md");
  });

  it("classifies a heading-link whose fragment matches duplicate headings as ambiguous-heading", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B#Design]]",
      "/vault/B.md": "# Design\ntext\n\n# Design\nmore",
    });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    const result = classifyWikiLink(record, "/vault/A.md", index);
    expect(result.status).toBe("ambiguous-heading");
    expect(result.candidateHeadings).toHaveLength(2);
  });

  it("classifies a same-note heading-link against the current note's own headings", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "# Intro\nSee [[#Intro]] and [[#Nope]].",
    });
    const records = index.wikiLinksByPath!.get("/vault/A.md")!;
    expect(classifyWikiLink(records[0], "/vault/A.md", index).status).toBe("resolved");
    expect(classifyWikiLink(records[1], "/vault/A.md", index).status).toBe("missing-heading");
  });

  it("classifies a malformed wikilink (an empty fragment marker) as broken", () => {
    const index = buildFixtureIndex({ "/vault/A.md": "[[Note#]]" });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    expect(record.parseStatus).toBe("malformed");
    expect(classifyWikiLink(record, "/vault/A.md", index).status).toBe("broken");
  });

  it("classifies a block-id fragment link as resolved at the note level (block verification is a later phase)", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B#^my-block]]",
      "/vault/B.md": "content, no block markers at all",
    });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    const result = classifyWikiLink(record, "/vault/A.md", index);
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/B.md");
  });

  it("classifies a legacy-fallback link (fragment syntax that is actually part of a real filename) as resolved", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[Q#1 FAQ]]",
      "/vault/Q#1 FAQ.md": "content",
    });
    const record = index.wikiLinksByPath!.get("/vault/A.md")![0];
    const result = classifyWikiLink(record, "/vault/A.md", index);
    expect(result.status).toBe("resolved");
    expect(result.notePath).toBe("/vault/Q#1 FAQ.md");
  });
});

describe("computeWorkspaceLinkDiagnostics", () => {
  it("returns an empty array for an empty workspace", () => {
    expect(computeWorkspaceLinkDiagnostics(buildFixtureIndex({}))).toEqual([]);
  });

  it("returns an empty array when every wikilink resolves cleanly", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B]]",
      "/vault/B.md": "content",
    });
    expect(computeWorkspaceLinkDiagnostics(index)).toEqual([]);
  });

  it("reports every non-resolved wikilink across the whole workspace", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[Missing]] and [[B#Nope]]",
      "/vault/B.md": "# Intro\ntext",
    });
    const diagnostics = computeWorkspaceLinkDiagnostics(index);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].status).toBe("broken");
    expect(diagnostics[0].linkText).toBe("[[Missing]]");
    expect(diagnostics[1].status).toBe("missing-heading");
    expect(diagnostics[1].linkText).toBe("[[B#Nope]]");
  });

  it("includes the exact source range for click-to-navigate", () => {
    const content = "prefix [[Missing]] suffix";
    const index = buildFixtureIndex({ "/vault/A.md": content });
    const diagnostics = computeWorkspaceLinkDiagnostics(index);
    expect(diagnostics[0].sourceFrom).toBe(content.indexOf("[[Missing]]"));
    expect(diagnostics[0].sourceTo).toBe(content.indexOf("[[Missing]]") + "[[Missing]]".length);
  });

  it("sorts findings by source path, then by position within a note", () => {
    const index = buildFixtureIndex({
      "/vault/Zeta.md": "[[Nope1]]",
      "/vault/Alpha.md": "[[Nope2]] [[Nope3]]",
    });
    const diagnostics = computeWorkspaceLinkDiagnostics(index);
    expect(diagnostics.map((d) => [d.sourcePath, d.linkText])).toEqual([
      ["/vault/Alpha.md", "[[Nope2]]"],
      ["/vault/Alpha.md", "[[Nope3]]"],
      ["/vault/Zeta.md", "[[Nope1]]"],
    ]);
  });

  it("carries the ambiguous-heading candidate list through into the finding", () => {
    const index = buildFixtureIndex({
      "/vault/A.md": "[[B#Design]]",
      "/vault/B.md": "# Design\ntext\n\n# Design\nmore",
    });
    const diagnostics = computeWorkspaceLinkDiagnostics(index);
    expect(diagnostics[0].candidateHeadings).toHaveLength(2);
  });

  it("treats a workspace with no wikiLinksByPath at all as having no findings, rather than throwing", () => {
    const index: LinkIndex = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    linkIndex.value = index;
    expect(computeWorkspaceLinkDiagnostics(index)).toEqual([]);
  });
});
