import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { addAutoTextDirection, buildTextDirectionDecorations, detectTextDirection } from "./textDirection";

describe("detectTextDirection", () => {
  it("detects plain Latin text as ltr", () => {
    expect(detectTextDirection("Hello world")).toBe("ltr");
  });

  it("detects Hebrew text as rtl", () => {
    expect(detectTextDirection("שלום עולם")).toBe("rtl");
  });

  it("detects Arabic text as rtl", () => {
    expect(detectTextDirection("مرحبا بالعالم")).toBe("rtl");
  });

  it("skips a Markdown heading marker to find the first strong character", () => {
    expect(detectTextDirection("# שלום עולם")).toBe("rtl");
    expect(detectTextDirection("# Hello world")).toBe("ltr");
  });

  it("skips a bullet/ordered-list marker", () => {
    expect(detectTextDirection("- שלום")).toBe("rtl");
    expect(detectTextDirection("1. مرحبا")).toBe("rtl");
  });

  it("falls back to ltr for a blank line", () => {
    expect(detectTextDirection("")).toBe("ltr");
    expect(detectTextDirection("   ")).toBe("ltr");
  });

  it("falls back to ltr for a line with no strong character at all (digits/punctuation only)", () => {
    expect(detectTextDirection("42 - 17 = 25")).toBe("ltr");
  });

  it("skips leading digits and punctuation to find a later strong character", () => {
    expect(detectTextDirection("2026-09-07: שלום")).toBe("rtl");
  });

  it("detects rtl for a mixed line where the first strong character is Hebrew", () => {
    expect(detectTextDirection("שלום world")).toBe("rtl");
  });

  it("detects ltr for a mixed line where the first strong character is Latin", () => {
    expect(detectTextDirection("hello עולם")).toBe("ltr");
  });
});

describe("buildTextDirectionDecorations", () => {
  function stateFor(doc: string) {
    return EditorState.create({ doc });
  }

  function decoratedLineStarts(state: EditorState, visibleRange?: { from: number; to: number }) {
    const decorations = buildTextDirectionDecorations(state, visibleRange ? [visibleRange] : undefined);
    const starts: number[] = [];
    decorations.between(0, state.doc.length, (from) => {
      starts.push(from);
    });
    return starts;
  }

  it("decorates an rtl line and not an ltr line", () => {
    const state = stateFor("Hello world\nשלום עולם");
    const line1 = state.doc.line(1);
    const line2 = state.doc.line(2);
    expect(decoratedLineStarts(state)).toEqual([line2.from]);
    expect(line1.from).not.toBe(line2.from);
  });

  it("applies direction: rtl and text-align: right as the line's decoration attributes", () => {
    const state = stateFor("שלום עולם");
    const decorations = buildTextDirectionDecorations(state);
    let sawAttributes: Record<string, string> | undefined;
    decorations.between(0, state.doc.length, (_from, _to, value) => {
      sawAttributes = (value.spec as { attributes?: Record<string, string> }).attributes;
    });
    expect(sawAttributes?.style).toContain("direction: rtl");
    expect(sawAttributes?.style).toContain("text-align: right");
  });

  it("decorates no lines at all when every line is ltr", () => {
    const state = stateFor("line one\nline two\nline three");
    expect(decoratedLineStarts(state)).toEqual([]);
  });

  it("decorates each rtl line independently in a mixed-direction note", () => {
    const state = stateFor("Hello\nשלום\nworld\nעולם");
    const rtlLines = [state.doc.line(2).from, state.doc.line(4).from];
    expect(decoratedLineStarts(state)).toEqual(rtlLines);
  });

  it("only scans lines within the given visible range, not the whole document", () => {
    const state = stateFor("שלום one\nHello two\nשלום three");
    const line1 = state.doc.line(1);
    const line2 = state.doc.line(2);
    // Limiting the visible range to line 2 only must not report line 1's
    // rtl decoration, proving this is a real viewport-scoped scan and not
    // a full-document one that merely ignores the range argument.
    const starts = decoratedLineStarts(state, { from: line2.from, to: line2.to });
    expect(starts).toEqual([]);
    expect(line1.from).not.toBe(line2.from);
  });
});

describe("addAutoTextDirection", () => {
  it("adds dir=\"auto\" to a bare paragraph tag", () => {
    expect(addAutoTextDirection("<p>שלום</p>")).toBe('<p dir="auto">שלום</p>');
  });

  it("adds dir=\"auto\" to headings, list items, blockquotes, and table cells", () => {
    expect(addAutoTextDirection("<h1>x</h1>")).toBe('<h1 dir="auto">x</h1>');
    expect(addAutoTextDirection("<h6>x</h6>")).toBe('<h6 dir="auto">x</h6>');
    expect(addAutoTextDirection("<li>x</li>")).toBe('<li dir="auto">x</li>');
    expect(addAutoTextDirection("<blockquote>x</blockquote>")).toBe('<blockquote dir="auto">x</blockquote>');
    expect(addAutoTextDirection("<td>x</td>")).toBe('<td dir="auto">x</td>');
    expect(addAutoTextDirection("<th>x</th>")).toBe('<th dir="auto">x</th>');
  });

  it("preserves existing attributes, inserting dir right after the tag name", () => {
    expect(addAutoTextDirection('<h1 id="intro">x</h1>')).toBe('<h1 dir="auto" id="intro">x</h1>');
    expect(addAutoTextDirection('<td style="text-align:right">x</td>')).toBe(
      '<td dir="auto" style="text-align:right">x</td>',
    );
  });

  it("never touches an inline tag like strong, em, code, or a", () => {
    const html = "<p>a <strong>b</strong> <em>c</em> <code>d</code> <a href=\"x\">e</a></p>";
    const result = addAutoTextDirection(html);
    expect(result).not.toContain("<strong dir=");
    expect(result).not.toContain("<em dir=");
    expect(result).not.toContain("<code dir=");
    expect(result).not.toContain("<a dir=");
    expect(result).toContain('<p dir="auto">');
  });

  it("does not duplicate dir on a tag that already declares one", () => {
    expect(addAutoTextDirection('<p dir="ltr">x</p>')).toBe('<p dir="ltr">x</p>');
    expect(addAutoTextDirection('<p dir="rtl" class="x">y</p>')).toBe('<p dir="rtl" class="x">y</p>');
  });

  it("still recognizes an existing dir attribute after a quoted value containing a literal >", () => {
    // A quoted attribute value is valid HTML even when it contains a
    // literal ">" (e.g. title="x>y"); a naive [^>]* scan would mistake
    // that embedded ">" for the tag's own close, hiding a real dir=
    // attribute that appears later in the same tag and injecting a
    // second, earlier dir="auto" that wins over the author's explicit
    // choice once a real parser (a browser, or DOMPurify) only keeps the
    // first of two same-named attributes.
    expect(addAutoTextDirection('<p title="x>y" dir="ltr">z</p>')).toBe('<p title="x>y" dir="ltr">z</p>');
    expect(addAutoTextDirection("<td title='x>y' dir=\"rtl\">z</td>")).toBe(
      "<td title='x>y' dir=\"rtl\">z</td>",
    );
  });

  it("still adds dir=\"auto\" when a quoted attribute value contains a literal >", () => {
    expect(addAutoTextDirection('<blockquote cite="a > b">x</blockquote>')).toBe(
      '<blockquote dir="auto" cite="a > b">x</blockquote>',
    );
  });

  it("still adds dir=\"auto\" when an unrelated attribute merely ends in \"-dir\"", () => {
    // A plain word-boundary check on "dir=" would also match inside
    // "data-dir=" (the hyphen-to-letter transition is itself a word
    // boundary), wrongly treating the tag as already having its own dir
    // attribute and skipping the injection.
    expect(addAutoTextDirection('<p data-dir="x">y</p>')).toBe('<p dir="auto" data-dir="x">y</p>');
  });

  it("leaves an escaped tag-like substring in rendered text content alone", () => {
    // marked/DOMPurify already HTML-escape a literal "<p>" appearing in
    // note text to "&lt;p&gt;"; this must never be rewritten as if it
    // were a real tag.
    const html = "<p>literal text: &lt;p&gt;</p>";
    expect(addAutoTextDirection(html)).toBe('<p dir="auto">literal text: &lt;p&gt;</p>');
  });

  it("handles multiple block tags across a larger document", () => {
    const html = "<h1>Title</h1><p>שלום</p><ul><li>one</li><li>two</li></ul>";
    const result = addAutoTextDirection(html);
    expect(result).toBe(
      '<h1 dir="auto">Title</h1><p dir="auto">שלום</p><ul><li dir="auto">one</li><li dir="auto">two</li></ul>',
    );
  });
});
