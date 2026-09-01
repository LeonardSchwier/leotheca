/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { INSPIRATION_QUOTES } from "./inspirationQuotes";
import { EmptyEditorState } from "./EmptyEditorState";

afterEach(cleanup);

describe("EmptyEditorState", () => {
  it("renders one of the curated quotes together with its author", () => {
    const { container } = render(<EmptyEditorState />);
    const quoteEl = container.querySelector(".editor-empty-quote");
    const authorEl = container.querySelector(".editor-empty-author");
    expect(quoteEl).not.toBeNull();
    expect(authorEl).not.toBeNull();

    const rendered = INSPIRATION_QUOTES.find((quote) =>
      quoteEl!.textContent!.includes(quote.text),
    );
    expect(rendered).toBeDefined();
    expect(authorEl!.textContent).toBe(rendered!.author);
  });

  it("never shows the old bare 'No file open.' message", () => {
    const { container } = render(<EmptyEditorState />);
    expect(container.textContent).not.toContain("No file open.");
  });
});
