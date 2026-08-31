import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { wikilinkCompletions } from "./MarkdownEditor";
import { linkIndex } from "../linking/store";

vi.mock("../workspace/tauriBridge", () => ({
  listDir: vi.fn(),
  readTextFile: vi.fn(),
  writeWorkspaceBinaryFile: vi.fn(),
}));

function contextAt(doc: string, pos: number): CompletionContext {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, false);
}

function setNotes(names: string[]) {
  const pathsByNoteName = new Map<string, string[]>();
  for (const name of names)
    pathsByNoteName.set(name.toLowerCase(), [`/workspace/${name}.md`]);
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName,
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
  };
}

describe("wikilinkCompletions", () => {
  it("returns null when not typing a wikilink", () => {
    setNotes(["Alpha"]);
    const doc = "just some text";
    expect(wikilinkCompletions(contextAt(doc, doc.length))).toBeNull();
  });

  it("returns null while only a single [ has been typed", () => {
    setNotes(["Alpha"]);
    const doc = "see [";
    expect(wikilinkCompletions(contextAt(doc, doc.length))).toBeNull();
  });

  it("suggests every known note right after [[", () => {
    setNotes(["Alpha", "Beta"]);
    const doc = "see [[";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result).not.toBeNull();
    expect(result!.options.map((o) => o.label).sort()).toEqual([
      "Alpha",
      "Beta",
    ]);
    // Completion should replace starting right after the "[[", not before it.
    expect(result!.from).toBe(doc.length);
  });

  it("filters suggestions by the partial text already typed", () => {
    setNotes(["Alpha", "Beta", "Alphabet"]);
    const doc = "see [[alp";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result!.options.map((o) => o.label).sort()).toEqual([
      "Alpha",
      "Alphabet",
    ]);
  });

  it("returns null when nothing matches the partial text", () => {
    setNotes(["Alpha"]);
    const doc = "see [[zzz";
    expect(wikilinkCompletions(contextAt(doc, doc.length))).toBeNull();
  });

  it("applies the closing ]] when a suggestion is accepted", () => {
    setNotes(["Alpha"]);
    const doc = "see [[alp";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result!.options[0].apply).toBe("Alpha]]");
  });

  it("de-duplicates when two paths share the same note name", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        [
          "duplicate",
          ["/workspace/a/Duplicate.md", "/workspace/b/Duplicate.md"],
        ],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    const doc = "see [[dup";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result!.options.map((o) => o.label)).toEqual(["Duplicate"]);
  });

  it("also suggests a note's aliases, alongside its file name", () => {
    setNotes(["Alpha"]);
    linkIndex.value = {
      ...linkIndex.value,
      aliasesByPath: new Map([["/workspace/Alpha.md", ["Ay", "First Letter"]]]),
    };
    const doc = "see [[";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result!.options.map((o) => o.label).sort()).toEqual([
      "Alpha",
      "Ay",
      "First Letter",
    ]);
  });

  it("applies an alias itself (not the note's file name) when that suggestion is accepted", () => {
    setNotes(["Alpha"]);
    linkIndex.value = {
      ...linkIndex.value,
      aliasesByPath: new Map([["/workspace/Alpha.md", ["Ay"]]]),
    };
    const doc = "see [[ay";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result!.options.map((o) => o.apply)).toEqual(["Ay]]"]);
  });

  it("does not duplicate a suggestion when an alias happens to match the file name of another note", () => {
    setNotes(["Alpha", "Beta"]);
    linkIndex.value = {
      ...linkIndex.value,
      aliasesByPath: new Map([["/workspace/Alpha.md", ["Beta"]]]),
    };
    const doc = "see [[";
    const result = wikilinkCompletions(contextAt(doc, doc.length));
    expect(result!.options.map((o) => o.label).sort()).toEqual([
      "Alpha",
      "Beta",
    ]);
  });
});
