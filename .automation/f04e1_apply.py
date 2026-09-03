from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    matches = text.count(old)
    if matches != 1:
        raise SystemExit(f"{path}: expected one match, found {matches}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Reuse the already-vetted transformation body, then repair the two pieces
# whose source shape drifted since that helper was first written.
source = Path(".github/workflows/f04e1-direct.yml").read_text(encoding="utf-8")
marker = "          python - <<'PY'\n"
start = source.index(marker) + len(marker)
end = source.index("          PY\n", start)
body = source[start:end]
body = "\n".join(line[10:] if line.startswith("          ") else line for line in body.splitlines()) + "\n"

block_start = body.index("old_setext = '''")
block_end_marker = 'exact("src/markdown/headings.ts", old_setext, new_setext)'
block_end = body.index(block_end_marker, block_start) + len(block_end_marker)
old_lines = [
    "        consumedLines.add(i - 1);",
    "        consumedLines.add(i);",
    "        raw.push({",
    "          level: setextLevel,",
    "          rawText: textLine.text.slice(contentStart, contentEnd),",
    "          sourceFrom: textLine.start,",
    "          sourceTo: line.end,",
    "          contentFrom: textLine.start + contentStart,",
    "          contentTo: textLine.start + contentEnd,",
    "          line: textLine.lineNumber,",
    "          column: 1,",
    "        });",
]
new_lines = [
    "        const parsedBlockId = extractHeadingBlockId(",
    "          textLine.text.slice(contentStart, contentEnd),",
    "          textLine.start + contentStart,",
    "        );",
    "        contentEnd = parsedBlockId.contentTo - textLine.start;",
    "        consumedLines.add(i - 1);",
    "        consumedLines.add(i);",
    "        raw.push({",
    "          level: setextLevel,",
    "          rawText: parsedBlockId.rawText,",
    "          sourceFrom: textLine.start,",
    "          sourceTo: line.end,",
    "          contentFrom: textLine.start + contentStart,",
    "          contentTo: textLine.start + contentEnd,",
    "          line: textLine.lineNumber,",
    "          column: 1,",
    "          blockId: parsedBlockId.blockId,",
    "        });",
]
replacement = "old_setext = " + repr("\n".join(old_lines)) + "\nnew_setext = " + repr("\n".join(new_lines)) + "\n" + block_end_marker
body = body[:block_start] + replacement + body[block_end:]
body = body.replace('if t.count("version: 7,") != 3:', 'if t.count("version: 7,") != 9:', 1)
body = body.replace('expected 3 version 7 fixtures', 'expected 9 version 7 fixtures', 1)
compiled = compile(body, "/tmp/f04e1_generated.py", "exec")
exec(compiled, {"__name__": "__main__"})

# Phase 5e1 intentionally changes the old contract that excluded headings.
replace_once(
    "src/markdown/blocks.test.ts",
    '  it("does not attach a marker whose block is a heading", () => {\n    expect(scanBlockIds("## Architecture boundary ^architecture-boundary")).toEqual([]);\n  });',
    '  it("attaches a marker whose block is an ATX heading", () => {\n    const [block] = scanBlockIds("## Architecture boundary ^architecture-boundary");\n    expect(block.kind).toBe("heading");\n    expect(block.id).toBe("architecture-boundary");\n  });',
)
replace_once(
    "src/markdown/blocks.test.ts",
    '  it("treats a setext heading\'s title line as consumed, not a paragraph", () => {\n    const source = "A Setext Heading ^not-a-block\\n===";\n    expect(scanBlockIds(source)).toEqual([]);\n  });',
    '  it("treats a setext heading marker as a heading block, not a paragraph", () => {\n    const source = "A Setext Heading ^setext-id\\n===";\n    const [block] = scanBlockIds(source);\n    expect(block.kind).toBe("heading");\n    expect(block.id).toBe("setext-id");\n  });',
)
replace_once(
    "src/markdown/blocks.test.ts",
    '  it("a heading marker stays not-eligible even in a mixed document with other eligible kinds", () => {\n    const source = [\n      "# Heading ^not-eligible",\n      "",\n      "A real paragraph with an id. ^eligible-paragraph",\n      "",\n      "- A list item. ^eligible-list-item",\n      "",\n      "> A blockquote. ^eligible-blockquote",\n    ].join("\\n");\n    const blocks = scanBlockIds(source);\n    expect(blocks.map((b) => b.id)).toEqual(["eligible-paragraph", "eligible-list-item", "eligible-blockquote"]);\n    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list-item", "blockquote"]);\n  });',
    '  it("includes a heading marker in the shared block-ID namespace with other eligible kinds", () => {\n    const source = [\n      "# Heading ^eligible-heading",\n      "",\n      "A real paragraph with an id. ^eligible-paragraph",\n      "",\n      "- A list item. ^eligible-list-item",\n      "",\n      "> A blockquote. ^eligible-blockquote",\n    ].join("\\n");\n    const blocks = scanBlockIds(source);\n    expect(blocks.map((b) => b.id)).toEqual(["eligible-heading", "eligible-paragraph", "eligible-list-item", "eligible-blockquote"]);\n    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "list-item", "blockquote"]);\n  });',
)
replace_once(
    "src/editor/blockLinkActions.test.ts",
    '  it("returns undefined when the cursor is not inside any eligible block", () => {\n    const source = "# A heading\\n\\nA paragraph.";\n    expect(resolveBlockLinkAtCursor(source, source.indexOf("heading"))).toBeUndefined();\n  });',
    '  it("creates a block ID when the cursor is inside a markerless heading", () => {\n    const source = "# A heading\\n\\nA paragraph.";\n    const resolution = resolveBlockLinkAtCursor(source, source.indexOf("heading"));\n    expect(resolution?.linkText).toMatch(/^\\[\\[#\\^b-[a-f0-9]{8}\\]\\]$/);\n    expect(resolution?.insertion?.from).toBe(source.indexOf("\\n"));\n  });',
)
replace_once("src/linking/store.test.ts", "    expect(saved.version).toBe(7);", "    expect(saved.version).toBe(8);")

for path in [
    "src/markdown/headings.ts",
    "src/markdown/blocks.ts",
    "src/markdown/blocks.test.ts",
    "src/linking/store.ts",
    "src/linking/store.test.ts",
    "src/editor/MarkdownPreview.tsx",
    "src/editor/blockLinkActions.test.ts",
    "src/markdown/headingBlockIds.test.ts",
    "src/editor/MarkdownPreview.headingBlocks.test.tsx",
    "CHANGELOG.md",
    "documentation/ARCHITECTURE.md",
    "ROADMAP.md",
]:
    if "\x00" in Path(path).read_text(encoding="utf-8"):
        raise SystemExit(f"{path}: null byte found")
