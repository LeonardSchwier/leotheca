import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { highlightExtension } from "./highlights";

marked.use({ extensions: [highlightExtension] });

function render(md: string): string {
  return (marked.parse(md, { async: false }) as string).trim();
}

describe("inlineHighlight extension", () => {
  it("wraps plain highlighted text in a bare <mark>", () => {
    expect(render("==hello==")).toBe("<p><mark>hello</mark></p>");
  });

  it("strips a red color emoji and applies the hl-red class", () => {
    expect(render("==🔴 red==")).toBe('<p><mark class="hl-red">red</mark></p>');
  });

  it("strips a green color emoji and applies the hl-green class", () => {
    expect(render("==🟢 green==")).toBe('<p><mark class="hl-green">green</mark></p>');
  });

  it("applies an orange color class", () => {
    expect(render("==🟠 orange==")).toBe('<p><mark class="hl-orange">orange</mark></p>');
  });

  it("applies a blue color class", () => {
    expect(render("==🔵 blue==")).toBe('<p><mark class="hl-blue">blue</mark></p>');
  });

  it("applies a purple color class", () => {
    expect(render("==🟣 purple==")).toBe('<p><mark class="hl-purple">purple</mark></p>');
  });

  it("keeps surrounding text intact", () => {
    expect(render("before ==highlight== after")).toBe(
      "<p>before <mark>highlight</mark> after</p>",
    );
  });

  it("does not match a single = sign", () => {
    expect(render("a = b")).toBe("<p>a = b</p>");
  });

  it("does not match a lone == without a closing marker", () => {
    expect(render("a == b")).toBe("<p>a == b</p>");
  });

  it("treats a triple = run as the inner ==x== highlight", () => {
    // [^=\n]+? (content excludes "=") makes marked's tokenizer match the
    // inner ==x== of "===x===", leaving one extra "=" on each side rather
    // than consuming the whole run.
    expect(render("===x===")).toBe("<p>=<mark>x</mark>=</p>");
  });

  it("escapes HTML in the highlighted text", () => {
    expect(render("==<b>bold</b>==")).toBe("<p><mark>&lt;b&gt;bold&lt;/b&gt;</mark></p>");
  });

  it("renders multiple highlights in one paragraph", () => {
    expect(render("==one== and ==🔴 two==")).toBe(
      '<p><mark>one</mark> and <mark class="hl-red">two</mark></p>',
    );
  });
});
