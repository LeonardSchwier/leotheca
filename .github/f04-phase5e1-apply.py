from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    matches = text.count(old)
    if matches != count:
        raise SystemExit(
            f"{path}: expected {count} matches, found {matches}: {old[:100]!r}"
        )
    file_path.write_text(text.replace(old, new, count), encoding="utf-8")


# The canonical heading scanner owns heading block IDs.
replace(
    "src/markdown/headings.ts",
    "  occurrence: number;\n  level: 1 | 2 | 3 | 4 | 5 | 6;",
    "  occurrence: number;\n"
    "  /** Optional explicit block ID attached to this heading. */\n"
    "  blockId?: { id: string; idFrom: number; idTo: number };\n"
    "  level: 1 | 2 | 3 | 4 | 5 | 6;",
)
replace(
    "src/markdown/headings.ts",
    "const CLOSING_HASH_RE = /[ \\t]+#+$/;",
    "const CLOSING_HASH_RE = /[ \\t]+#+$/;\n"
    "const HEADING_BLOCK_ID_RE = /[ \\t]+\\^([A-Za-z0-9][A-Za-z0-9-]{0,63})[ \\t]*$/;",
)
replace(
    "src/markdown/headings.ts",
    "  line: number;\n  column: number;\n}\n\nfunction tryParseAtx",
    "  line: number;\n"
    "  column: number;\n"
    "  blockId?: { id: string; idFrom: number; idTo: number };\n"
    "}\n\n"
    "function extractHeadingBlockId(\n"
    "  rawText: string,\n"
    "  absoluteContentStart: number,\n"
    "): { rawText: string; contentTo: number; blockId?: { id: string; idFrom: number; idTo: number } } {\n"
    "  const match = HEADING_BLOCK_ID_RE.exec(rawText);\n"
    "  if (!match) return { rawText, contentTo: absoluteContentStart + rawText.length };\n"
    "  const id = match[1];\n"
    "  const idFrom = absoluteContentStart + match.index + match[0].indexOf(\"^\");\n"
    "  return {\n"
    "    rawText: rawText.slice(0, match.index),\n"
    "    contentTo: absoluteContentStart + match.index,\n"
    "    blockId: { id, idFrom, idTo: idFrom + 1 + id.length },\n"
    "  };\n"
    "}\n\n"
    "function tryParseAtx",
)
old_atx = '''  let raw = line.text.slice(contentStart, contentEnd);
  const closing = CLOSING_HASH_RE.exec(raw);
  if (closing) {
    contentEnd -= closing[0].length;
    raw = raw.slice(0, raw.length - closing[0].length);
  }
  return {
    level: hashes.length as RawHeading["level"],
    rawText: raw,
    sourceFrom: line.start,
    sourceTo: line.end,
    contentFrom: line.start + contentStart,
    contentTo: line.start + contentEnd,
    line: line.lineNumber,
    column: 1,
  };'''
new_atx = '''  let raw = line.text.slice(contentStart, contentEnd);
  const closing = CLOSING_HASH_RE.exec(raw);
  if (closing) {
    contentEnd -= closing[0].length;
    raw = raw.slice(0, raw.length - closing[0].length);
  }
  const parsedBlockId = extractHeadingBlockId(raw, line.start + contentStart);
  raw = parsedBlockId.rawText;
  contentEnd = parsedBlockId.contentTo - line.start;
  return {
    level: hashes.length as RawHeading["level"],
    rawText: raw,
    sourceFrom: line.start,
    sourceTo: line.end,
    contentFrom: line.start + contentStart,
    contentTo: line.start + contentEnd,
    line: line.lineNumber,
    column: 1,
    blockId: parsedBlockId.blockId,
  };'''
replace("src/markdown/headings.ts", old_atx, new_atx)
old_setext = '''        consumedLines.add(i - 1);
        consumedLines.add(i);
        raw.push({
          level: setextLevel,
          rawText: textLine.text.slice(contentStart, contentEnd),
          sourceFrom: textLine.start,
          sourceTo: line.end,
          contentFrom: textLine.start + contentStart,
          contentTo: textLine.start + contentEnd,
          line: textLine.lineNumber,
          column: 1,
        });'''
new_setext = '''        const parsedBlockId = extractHeadingBlockId(
          textLine.text.slice(contentStart, contentEnd),
          textLine.start + contentStart,
        );
        contentEnd = parsedBlockId.contentTo - textLine.start;
        consumedLines.add(i - 1);
        consumedLines.add(i);
        raw.push({
          level: setextLevel,
          rawText: parsedBlockId.rawText,
          sourceFrom: textLine.start,
          sourceTo: line.end,
          contentFrom: textLine.start + contentStart,
          contentTo: textLine.start + contentEnd,
          line: textLine.lineNumber,
          column: 1,
          blockId: parsedBlockId.blockId,
        });'''
replace("src/markdown/headings.ts", old_setext, new_setext)
replace(
    "src/markdown/headings.ts",
    "      key,\n      occurrence,\n      level: h.level,",
    "      key,\n      occurrence,\n      blockId: h.blockId,\n      level: h.level,",
)

# The shared block model imports canonical headings and never reparses them.
replace(
    "src/markdown/blocks.ts",
    "/**\n * F04 Phase 3a/3b/3d/3e's block-reference scanner",
    "import { scanHeadings } from \"./headings\";\n\n"
    "/**\n * F04 Phase 3a/3b/3d/3e's block-reference scanner",
)
replace(
    "src/markdown/blocks.ts",
    '  kind: "paragraph" | "list-item" | "blockquote" | "fenced-code";',
    '  kind: "paragraph" | "list-item" | "blockquote" | "fenced-code" | "heading";',
)
replace(
    "src/markdown/blocks.ts",
    "  flushPendingFencedCode();\n  flushParagraph();\n  flushOpenBlock();\n\n  return blocks;",
    "  flushPendingFencedCode();\n"
    "  flushParagraph();\n"
    "  flushOpenBlock();\n\n"
    "  for (const heading of scanHeadings(content)) {\n"
    "    blocks.push({\n"
    "      kind: \"heading\",\n"
    "      sourceFrom: heading.sourceFrom,\n"
    "      sourceTo: heading.sourceTo,\n"
    "      contentFrom: heading.contentFrom,\n"
    "      contentTo: heading.contentTo,\n"
    "      line: heading.line,\n"
    "      column: heading.column,\n"
    "      marker: heading.blockId\n"
    "        ? { id: heading.blockId.id, idFrom: heading.blockId.idFrom, idTo: heading.blockId.idTo }\n"
    "        : undefined,\n"
    "    });\n"
    "  }\n"
    "  blocks.sort((a, b) => a.sourceFrom - b.sourceFrom);\n\n"
    "  return blocks;",
)
replace(
    "src/markdown/blocks.test.ts",
    '  it("returns undefined for an offset inside a heading or a blank line between blocks", () => {\n'
    '    const source = "# A heading\\n\\nA paragraph.";\n'
    '    expect(findBlockAtOffset(source, source.indexOf("heading"))).toBeUndefined();\n'
    '    expect(findBlockAtOffset(source, source.indexOf("\\n\\n") + 1)).toBeUndefined();\n'
    "  });",
    '  it("finds a heading block and still returns undefined for a blank line between blocks", () => {\n'
    '    const source = "# A heading\\n\\nA paragraph.";\n'
    '    expect(findBlockAtOffset(source, source.indexOf("heading"))?.kind).toBe("heading");\n'
    '    expect(findBlockAtOffset(source, source.indexOf("\\n\\n") + 1)).toBeUndefined();\n'
    "  });",
)

# Persisted index shape changes invalidate old caches.
replace(
    "src/linking/store.ts",
    '      record.kind === "blockquote" ||\n      record.kind === "fenced-code") &&',
    '      record.kind === "blockquote" ||\n'
    '      record.kind === "fenced-code" ||\n'
    '      record.kind === "heading") &&',
)
replace(
    "src/linking/store.ts",
    "const LINK_INDEX_CACHE_VERSION = 7;",
    "const LINK_INDEX_CACHE_VERSION = 8;",
)
store_path = Path("src/linking/store.ts")
store_text = store_path.read_text(encoding="utf-8")
validator_start = store_text.find("function isValidHeadingRecord")
if validator_start < 0:
    raise SystemExit("missing isValidHeadingRecord")
validator_tail = store_text[validator_start:]
validator_marker = (
    '  const isFiniteNumber = (v: unknown): v is number =>\n'
    '    typeof v === "number" && Number.isFinite(v);\n'
    '  return (\n'
    '    typeof record.key === "string" &&'
)
validator_replacement = (
    '  const isFiniteNumber = (v: unknown): v is number =>\n'
    '    typeof v === "number" && Number.isFinite(v);\n'
    '  const blockId = record.blockId;\n'
    '  const validBlockId =\n'
    '    blockId === undefined ||\n'
    '    (typeof blockId === "object" &&\n'
    '      blockId !== null &&\n'
    '      typeof (blockId as Record<string, unknown>).id === "string" &&\n'
    '      isFiniteNumber((blockId as Record<string, unknown>).idFrom) &&\n'
    '      isFiniteNumber((blockId as Record<string, unknown>).idTo));\n'
    '  return (\n'
    '    validBlockId &&\n'
    '    typeof record.key === "string" &&'
)
if validator_tail.count(validator_marker) < 1:
    raise SystemExit("heading validator shape drifted")
validator_tail = validator_tail.replace(validator_marker, validator_replacement, 1)
store_path.write_text(store_text[:validator_start] + validator_tail, encoding="utf-8")

store_test_path = Path("src/linking/store.test.ts")
store_test = store_test_path.read_text(encoding="utf-8")
version_count = store_test.count("version: 7,")
if version_count != 3:
    raise SystemExit(f"expected 3 version 7 fixtures, found {version_count}")
store_test = store_test.replace("version: 7,", "version: 8,")
store_test = store_test.replace(
    'if (path.endsWith("Alpha.md")) return "A paragraph with an id. ^my-block";',
    'if (path.endsWith("Alpha.md")) return "# Section ^heading-id\\n\\nA paragraph with an id. ^my-block";',
    1,
)
store_test = store_test.replace(
    'expect(alphaBlocks?.map((b) => b.id)).toEqual(["my-block"]);',
    'expect(alphaBlocks?.map((b) => b.id)).toEqual(["heading-id", "my-block"]);',
    1,
)
store_test_path.write_text(store_test, encoding="utf-8")

# Preview keeps closing hashes/setext underline and anchors the heading element.
replace(
    "src/editor/MarkdownPreview.tsx",
    "    result += source.slice(cursor, block.contentTo);\n    cursor = block.sourceTo;",
    "    result += source.slice(cursor, block.contentTo);\n"
    "    cursor = block.kind === \"heading\" ? block.marker!.idTo : block.sourceTo;",
)
replace(
    "src/editor/MarkdownPreview.tsx",
    '              kind === "list-item" ? "li" : kind === "blockquote" ? "blockquote" : "p",',
    '              kind === "list-item"\n'
    '                ? "li"\n'
    '                : kind === "blockquote"\n'
    '                  ? "blockquote"\n'
    '                  : kind === "heading"\n'
    '                    ? "h1,h2,h3,h4,h5,h6"\n'
    '                    : "p",',
)

Path("src/markdown/headingBlockIds.test.ts").write_text(
    '''import { describe, expect, it } from "vitest";
import { resolveBlockLinkAtCursor } from "../editor/blockLinkActions";
import { findBlockAtOffset, scanBlockIds } from "./blocks";
import { scanHeadings } from "./headings";

describe("heading block IDs", () => {
  it("parses ATX markers without exposing them as heading text", () => {
    const source = "## Architecture boundary ^architecture-boundary";
    const [heading] = scanHeadings(source);
    expect(heading.displayText).toBe("Architecture boundary");
    expect(heading.blockId?.id).toBe("architecture-boundary");
    expect(source.slice(heading.contentFrom, heading.contentTo)).toBe("Architecture boundary");
  });

  it("recognizes a marker before optional closing hashes", () => {
    const [heading] = scanHeadings("### Shipping ^release ##");
    expect(heading.displayText).toBe("Shipping");
    expect(heading.blockId?.id).toBe("release");
  });

  it("parses setext markers while preserving the underline", () => {
    const source = "Architecture ^arch\n============\nBody";
    const [heading] = scanHeadings(source);
    expect(heading.displayText).toBe("Architecture");
    expect(heading.blockId?.id).toBe("arch");
    expect(source.slice(heading.sourceFrom, heading.sourceTo)).toContain("============");
  });

  it("leaves malformed markers visible", () => {
    const [heading] = scanHeadings("## Heading ^bad_id");
    expect(heading.blockId).toBeUndefined();
    expect(heading.displayText).toBe("Heading ^bad_id");
  });

  it("shares one case-insensitive duplicate namespace", () => {
    const blocks = scanBlockIds("## Heading ^Shared\n\nParagraph. ^shared");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph"]);
    expect(blocks.map((block) => block.occurrence)).toEqual([1, 2]);
  });

  it("finds markerless headings at the cursor", () => {
    const source = "# Markerless heading\n\nBody.";
    expect(findBlockAtOffset(source, source.indexOf("heading"))?.kind).toBe("heading");
  });

  it("lets Copy block link create a marker for a markerless heading", () => {
    const source = "## Heading\n\nBody.";
    const heading = scanHeadings(source)[0];
    const result = resolveBlockLinkAtCursor(source, source.indexOf("Heading") + 2)!;
    expect(result.insertion?.from).toBe(heading.contentTo);
    expect(result.insertion?.text).toMatch(/^ \^b-[a-f0-9]{8}$/);
    expect(result.linkText).toBe(`[[#^${result.insertion!.text.slice(2)}]]`);
  });
});
''',
    encoding="utf-8",
)

Path("src/editor/MarkdownPreview.headingBlocks.test.tsx").write_text(
    '''/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../workspace/tauriBridge", () => ({ fileSrc: vi.fn(), readTextFile: vi.fn() }));
vi.mock("../settings/store", async () => {
  const { signal } = await import("@preact/signals");
  return { workspacePath: signal<string | null>(null) };
});

import { MarkdownPreview } from "./MarkdownPreview";

afterEach(cleanup);

describe("MarkdownPreview heading block IDs", () => {
  it("hides and anchors an ATX marker", () => {
    const { container } = render(
      <MarkdownPreview source="## Architecture ^arch" notePath="/vault/note.md" />,
    );
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Architecture");
    expect(heading?.id).toBe("lt-block-arch");
    expect(heading?.getAttribute("data-lt-block-id")).toBe("arch");
  });

  it("keeps setext rendering intact", () => {
    const { container } = render(
      <MarkdownPreview source={"Architecture ^arch\n============\nBody"} notePath="/vault/note.md" />,
    );
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Architecture");
    expect(heading?.id).toBe("lt-block-arch");
  });
});
''',
    encoding="utf-8",
)

replace(
    "CHANGELOG.md",
    "## Unreleased\n",
    "## Unreleased\n\n"
    "- Block references now support headings. A trailing `^id` on an ATX or setext heading stays hidden in Preview, shares the normal block-ID namespace, and works with Copy block link.\n",
)
replace(
    "documentation/ARCHITECTURE.md",
    "\n## Build and distribution architecture\n",
    "\n### Heading-owned block IDs\n\n"
    "`markdown/headings.ts` remains the only heading parser and owns optional trailing `^id` markers. `markdown/blocks.ts` merges those canonical heading records into the shared block model for resolution, duplicate detection, Copy block link, indexing, and Preview anchoring. The persisted index cache version changes with this record shape so stale caches cannot hide heading IDs.\n\n"
    "## Build and distribution architecture\n",
)

roadmap_path = Path("ROADMAP.md")
roadmap_lines = roadmap_path.read_text(encoding="utf-8").splitlines()
claims = [
    index
    for index, line in enumerate(roadmap_lines)
    if line.startswith("- 🚧 **F04 Phase 5e1:")
]
if len(claims) != 1:
    raise SystemExit(f"expected one 5e1 claim, found {len(claims)}")
roadmap_lines.pop(claims[0])
implemented = (
    "- ✅ **F04 Phase 5e1: heading block-ID eligibility and Preview heading anchors** "
    "(claim: ChatGPT-GPT-5.6-Sol-manual-20260903T2052Z, branch: agent/f04-phase5e1-heading-block-ids, "
    "spec: `spec/f04-heading-block-links-embeds.md`, sections 7.1-7.4 and 21 Phase 5): "
    "ATX and setext headings can own trailing explicit `^id` markers through the canonical heading scanner. "
    "Markers stay out of visible heading text; headings join the same case-insensitive block-ID namespace as other blocks; "
    "Copy block link can create or reuse a heading ID; Preview attaches deterministic block anchors to rendered headings; "
    "and the persisted link-index cache advances to version 8 so old caches cannot hide heading IDs. Focused tests cover ATX, closing hashes, setext headings, malformed markers, duplicates across block kinds, markerless heading lookup, Copy block link insertion, Preview anchoring, and indexed heading IDs. Phase 5e2 remains open for the Preview hover/focus/long-press copy affordance, and Phase 5e3 remains open for the separate Create block link action."
)
implemented_index = roadmap_lines.index("## Implemented")
roadmap_lines[implemented_index + 1 : implemented_index + 1] = ["", implemented]
roadmap_path.write_text("\n".join(roadmap_lines) + "\n", encoding="utf-8")

for changed_path in [
    "src/markdown/headings.ts",
    "src/markdown/blocks.ts",
    "src/markdown/blocks.test.ts",
    "src/linking/store.ts",
    "src/linking/store.test.ts",
    "src/editor/MarkdownPreview.tsx",
    "src/markdown/headingBlockIds.test.ts",
    "src/editor/MarkdownPreview.headingBlocks.test.tsx",
    "CHANGELOG.md",
    "documentation/ARCHITECTURE.md",
    "ROADMAP.md",
]:
    if "\x00" in Path(changed_path).read_text(encoding="utf-8"):
        raise SystemExit(f"null byte in {changed_path}")
