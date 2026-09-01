/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { CompletionContext } from "@codemirror/autocomplete";
import { MarkdownEditor, wikilinkCompletions } from "./MarkdownEditor";
import { linkIndex } from "../linking/store";

const { writeWorkspaceBinaryFile } = vi.hoisted(() => ({
  writeWorkspaceBinaryFile: vi.fn<
    (root: string, relativePath: string, bytes: Uint8Array) => Promise<void>
  >(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  listDir: vi.fn(),
  readTextFile: vi.fn(),
  writeWorkspaceBinaryFile,
}));

afterEach(cleanup);

function baseEditorProps() {
  return {
    onChange: vi.fn(),
    workspaceRoot: "/vault",
    attachmentsFolder: "",
    pasteImagesEnabled: true,
    snippetsEnabled: false,
    snippets: "",
  };
}

/** CodeMirror attaches the live `EditorView` instance to its own root DOM
 * node; `findFromDOM` is the documented way to retrieve it in a test
 * without the component itself exposing an internal ref. */
function editorView(container: Element): EditorView {
  const host = container.querySelector(".markdown-editor") as HTMLElement;
  const view = EditorView.findFromDOM(host);
  if (!view) throw new Error("no EditorView mounted");
  return view;
}

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

describe("MarkdownEditor: reusing the editor view across a file switch", () => {
  it("shows the newly opened file's content when path and value change together", () => {
    const { container, rerender } = render(
      <MarkdownEditor path="/vault/a.md" value="first file" {...baseEditorProps()} />,
    );
    expect(editorView(container).state.doc.toString()).toBe("first file");

    rerender(
      <MarkdownEditor path="/vault/b.md" value="second file" {...baseEditorProps()} />,
    );
    expect(editorView(container).state.doc.toString()).toBe("second file");
  });

  it("does not let undo reach back into the previous file's content", () => {
    const { container, rerender } = render(
      <MarkdownEditor path="/vault/a.md" value="first file" {...baseEditorProps()} />,
    );
    rerender(
      <MarkdownEditor path="/vault/b.md" value="second file" {...baseEditorProps()} />,
    );
    const view = editorView(container);

    // A naive reuse that swaps content via a tracked `dispatch` change
    // (instead of `setState`) would make this undo call fall back to
    // "first file"; reconfiguring via setState starts a fresh, empty
    // history for the newly opened file instead.
    undo(view);
    expect(view.state.doc.toString()).toBe("second file");
  });

  it("rebuilds the paste-attachment extension for the newly opened file, not the previous one", async () => {
    writeWorkspaceBinaryFile.mockClear();
    const { container, rerender } = render(
      <MarkdownEditor path="/vault/folderA/a.md" value="" {...baseEditorProps()} />,
    );
    rerender(
      <MarkdownEditor path="/vault/folderB/b.md" value="" {...baseEditorProps()} />,
    );
    const view = editorView(container);

    const file = new File([new Uint8Array([1, 2, 3])], "pic.png", {
      type: "image/png",
    });
    const clipboardData = {
      items: [{ type: "image/png", getAsFile: () => file }],
    };
    fireEvent.paste(view.contentDOM, { clipboardData });
    await vi.waitFor(() => expect(writeWorkspaceBinaryFile).toHaveBeenCalled());

    // Saved relative to folderB (the current file), not folderA (the one
    // this component was first mounted with).
    expect(writeWorkspaceBinaryFile.mock.calls[0][1]).toMatch(/^folderB\//);
  });
});
