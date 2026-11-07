/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { CompletionResult } from "@codemirror/autocomplete";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { HIGHLIGHT_COLOR_CHOICES } from "./highlightColors";
import { highlightColorCompletions } from "./MarkdownEditor";

const RED = "\u{1F534}"; // 🔴

function contextAt(doc: string, pos: number): CompletionContext {
  return new CompletionContext(EditorState.create({ doc }), pos, false);
}

async function run(ctx: CompletionContext): Promise<CompletionResult | null> {
  return await highlightColorCompletions()(ctx);
}

describe("highlightColorCompletions (typing `==` suggests colors)", () => {
  it("suggests all five colors plus plain, at a bare `==`", async () => {
    const doc = "before ==";
    const result = await run(contextAt(doc, doc.length));
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.options.map((o) => o.label)).toEqual([
      "Highlight (plain)",
      ...HIGHLIGHT_COLOR_CHOICES.map((c) => `Highlight (${c.label})`),
    ]);
    expect(r.filter).toBe(false);
  });

  it("replaces only the `==` portion, keeping any text already typed after it", async () => {
    const doc = "note ==im";
    const result = await run(contextAt(doc, doc.length));
    const r = result!;
    // from points at the `=` where the replacement starts:
    expect(doc.slice(r.from, r.from + 2)).toBe("==");
    // Selecting red re-colors the in-progress "im" in place:
    const redOption = r.options.find((o) => o.label === "Highlight (Red)")!;
    const redApply = typeof redOption.apply === "string" ? redOption.apply : "";
    expect(redApply).toBe(`==${RED} im==`);
  });

  it("does not trigger inside a longer run of equals (e.g. `===`)", async () => {
    const doc = "before ===";
    const result = await run(contextAt(doc, doc.length));
    expect(result).toBeNull();
  });

  it("does not trigger when `==` is not immediately before the cursor", async () => {
    const doc = "before == word";
    const result = await run(contextAt(doc, doc.length));
    expect(result).toBeNull();
  });

  it("does not trigger mid-word (an identifier char directly before `==`)", async () => {
    const doc = "abc==";
    const result = await run(contextAt(doc, doc.length));
    expect(result).toBeNull();
  });

  it("does not trigger at the very start of the document", async () => {
    const doc = "==" ;
    const result = await run(contextAt(doc, 0));
    // Cursor at 0: no text before it, matchBefore finds nothing.
    expect(result).toBeNull();
  });

  it("plain option applies a plain `==` pair around the typed remainder", async () => {
    const doc = "note ==hi";
    const r = (await run(contextAt(doc, doc.length)))!;
    const plain = r.options.find((o) => o.label === "Highlight (plain)")!;
    const plainApply = typeof plain.apply === "string" ? plain.apply : "";
    expect(plainApply).toBe("==hi==");
  });

  it("each colored option carries the color emoji plus the typed remainder", async () => {
    const doc = "note ==hi";
    const r = (await run(contextAt(doc, doc.length)))!;
    for (const choice of HIGHLIGHT_COLOR_CHOICES) {
      const option = r.options.find((o) => o.label === `Highlight (${choice.label})`)!;
      const apply = typeof option.apply === "string" ? option.apply : "";
      expect(apply.endsWith("hi==")).toBe(true);
      expect(apply.length > "hi==".length).toBe(true);
    }
  });

  it('plain option strips a previously-typed color emoji back to plain', async () => {
    // The author has already colored the in-progress `==` — the emoji is
    // right after `==`, the suggestion is still open. Choosing "Highlight
    // (plain)" must undo the color, not re-emit the emoji on top of it.
    const doc = `note ==${RED}`;
    const r = (await run(contextAt(doc, doc.length)))!;
    const plain = r.options.find((o) => o.label === "Highlight (plain)")!;
    const plainApply = typeof plain.apply === "string" ? plain.apply : "";
    // The color emoji is stripped; an empty plain `==` pair is all that remains.
    expect(plainApply).toBe("====");
  });

  it("plain option strips the emoji but keeps the typed remainder after it", async () => {
    const doc = `note ==${RED}hi`;
    const r = (await run(contextAt(doc, doc.length)))!;
    const plain = r.options.find((o) => o.label === "Highlight (plain)")!;
    const plainApply = typeof plain.apply === "string" ? plain.apply : "";
    expect(plainApply).toBe("==hi==");
  });

  it("plain option does not strip a non-color leading codepoint", async () => {
    // A leading codepoint the detector does not recognize (a heart, e.g.)
    // is content, not a color marker — plain keeps it, consistent with
    // insertHighlightColor's own "don't rewrite what the user typed" rule.
    const HEART = "\u{2764}"; // ❤ (base heart, single codepoint)
    const doc = `note ==${HEART}`;
    const r = (await run(contextAt(doc, doc.length)))!;
    const plain = r.options.find((o) => o.label === "Highlight (plain)")!;
    const plainApply = typeof plain.apply === "string" ? plain.apply : "";
    expect(plainApply).toBe(`==${HEART}==`);
  });
});
