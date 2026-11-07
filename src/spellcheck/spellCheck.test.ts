/**
 * Unit tests for the offline spellcheck module.
 *
 * These tests verify the pure logic (checkSpelling, createNspellChecker)
 * without a CodeMirror editor, using a mock SpellChecker and real nspell
 * with a minimal test dictionary.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  checkSpelling,
  createNspellChecker,
  spellCheckExtension,
  type SpellChecker,
} from "./spellCheck";

// ─── Mock checker ────────────────────────────────────────────────────────────

/** A SpellChecker that says a word is correct iff it is in the allowed set. */
function mockChecker(correctWords: Set<string>): SpellChecker {
  return {
    isCorrect(word: string) {
      return correctWords.has(word.toLowerCase());
    },
  };
}

// ─── checkSpelling ───────────────────────────────────────────────────────────

describe("checkSpelling", () => {
  const correct = new Set(["hello", "world", "don't", "well-known"]);

  it("flags misspelled words", () => {
    const results = checkSpelling("hlello mesage", 0, mockChecker(correct));
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.word)).toEqual(["hlello", "mesage"]);
  });

  it("passes through correctly spelled words", () => {
    const results = checkSpelling("hello world", 0, mockChecker(correct));
    expect(results).toHaveLength(0);
  });

  it("respects the line offset for positions", () => {
    const results = checkSpelling("teh", 100, mockChecker(correct));
    expect(results).toHaveLength(1);
    expect(results[0].from).toBe(100);
    expect(results[0].to).toBe(103);
  });

  it("handles words with internal apostrophes", () => {
    // "don't" is in the correct set, so it should pass
    const results = checkSpelling("don't stop", 0, mockChecker(correct));
    expect(results.find((r) => r.word === "don't")).toBeUndefined();
    expect(results).toHaveLength(1); // "stop" is not in the set
  });

  it("handles hyphenated words", () => {
    // "well-known" is in the correct set
    const results = checkSpelling("a well-known fact", 0, mockChecker(correct));
    expect(results.find((r) => r.word === "well-known")).toBeUndefined();
    expect(results).toHaveLength(2); // "a" and "fact"
  });

  it("skips pure digits", () => {
    const results = checkSpelling("value 12345 ok", 0, mockChecker(correct));
    expect(results.find((r) => r.word === "12345")).toBeUndefined();
  });

  it("handles accented characters (Unicode-aware)", () => {
    const accented = new Set(["café", "naïve", "über"]);
    const results = checkSpelling("café naïve über", 0, mockChecker(accented));
    expect(results).toHaveLength(0);
  });

  it("flags unknown accented words", () => {
    const results = checkSpelling("café cffet", 0, mockChecker(new Set(["café"])));
    expect(results).toHaveLength(1);
    expect(results[0].word).toBe("cffet");
  });

  it("handles empty string", () => {
    expect(checkSpelling("", 0, mockChecker(new Set()))).toHaveLength(0);
  });

  it("handles single-character words", () => {
    const results = checkSpelling("a a", 0, mockChecker(new Set(["a"])));
    expect(results).toHaveLength(0);
  });

  it("handles mixed-case words", () => {
    const results = checkSpelling("Hello WORLD", 0, mockChecker(new Set(["hello", "world"])));
    // Mock checker lowercases, so both should pass
    expect(results).toHaveLength(0);
  });

  it("handles markdown inline syntax correctly", () => {
    // **bold** and *italic* markers are not word chars, so the words inside
    // are matched correctly
    const results = checkSpelling("**bold** *italic*", 0, mockChecker(new Set(["bold", "italic"])));
    expect(results).toHaveLength(0);
  });

  it("does not flag words inside URLs embedded in prose (lintSource filters them)", () => {
    // URL tokens in prose (not entire-line URLs) were previously flagged
    // as misspellings. lintSource now strips URL tokens before calling
    // checkSpelling, so "example" and "com" from https://example.com
    // should not appear in the results.
    // This is tested at the lintSource level in the spellCheckExtension
    // tests below, not here, because checkSpelling is a pure function
    // that checks a single line without context.
  });
});

// ─── createNspellChecker ─────────────────────────────────────────────────────

describe("createNspellChecker", () => {
  const aff = "SET L\n";
  const dic = "EN\nt\nthe\na\nand\nword\nhello\n";

  it("creates a working checker from dictionary content", () => {
    const checker = createNspellChecker(aff, dic);
    expect(checker).not.toBeNull();
    expect(checker!.isCorrect("the")).toBe(true);
    expect(checker!.isCorrect("word")).toBe(true);
    expect(checker!.isCorrect("teh")).toBe(false);
    expect(checker!.isCorrect("xyz")).toBe(false);
  });

  it("returns null for empty aff content", () => {
    expect(createNspellChecker("", dic)).toBeNull();
  });

  it("returns null for empty dic content", () => {
    expect(createNspellChecker(aff, "")).toBeNull();
  });
});

// ─── spellCheckExtension: linter race regression ────────────────────────────

/**
 * Minimal fake EditorView. lintSource only reads view.state.doc (a
 * Text/State) — it never touches the DOM, selection, or dispatch. We build
 * the smallest possible object that satisfies that read so the extracted
 * linter source can be driven directly in jsdom without mounting a real
 * CodeMirror view.
 */
function viewWithDoc(text: string) {
  // Reuse the real State from @codemirror/state so doc.lines / doc.line(n)
  // behave exactly as in production.
  const state = EditorState.create({ doc: text });
  return { state };
}

/** Extract the lintSource function from a spellCheckExtension extension array. */
function extractLinterSource(extensions: unknown): (view: unknown) => Promise<{ message: string }[]> {
  // spellCheckExtension returns [ linter(...), lintGutter() ]. linter(...)
  // is itself an array [ lintConfig.of({source,config}), lintPlugin,
  // lintExtensions ]. The source lives on the first facet provider's value.
  const linterExt = (extensions as unknown[])[0] as unknown[];
  const facetProvider = linterExt[0] as { value: { source: (v: unknown) => Promise<{ message: string }[]> } };
  return facetProvider.value.source;
}

describe("spellCheckExtension linter race (rm-f506e6522fb79cba)", () => {
  it("produces diagnostics on a later pass after the first pass had no dictionary", async () => {
    // Simulate the exact production race: the linter's first pass fires
    // before the editor's dictionary-load effect resolves, so createChecker
    // sees an empty dictionary and returns null. The next pass (dictionary
    // now loaded) must still get a working checker and flag misspellings.
    //
    // Before the fix, getChecker cached the first null permanently
    // (checkerChecked=true), so the second pass also returned null and the
    // linter produced [] forever — spellchecking silently dead for the whole
    // view's lifetime. After the fix, getChecker re-derives while the cached
    // value is null, so the second pass gets a real checker.
    let pass = 0;
    const workingChecker = mockChecker(new Set(["brown", "fox"]));
    const extensions = spellCheckExtension(
      () => {
        pass += 1;
        if (pass === 1) return null; // first pass: dictionary not yet loaded
        return workingChecker; // later passes: dictionary loaded
      },
      true,
    );

    const lintSource = extractLinterSource(extensions) as (
      view: unknown,
    ) => Promise<{ message: string }[]>;

    const doc = "teh quik brown fox";

    // First lint pass: checker unavailable → no diagnostics.
    const first = await lintSource(viewWithDoc(doc));
    expect(first).toEqual([]);

    // Second lint pass: checker now available → misspellings flagged.
    const second = await lintSource(viewWithDoc(doc));
    const messages = second.map((d) => d.message);
    expect(messages).toContain("Misspelled word: teh");
    expect(messages).toContain("Misspelled word: quik");
    expect(messages).not.toContain("Misspelled word: brown");
  });

  it("stays silently off (no crash) when the dictionary is permanently absent", async () => {
    // The "missing dictionary → silently off" contract must be preserved:
    // if createChecker keeps returning null (files genuinely don't exist),
    // the linter must keep returning [] on every pass without throwing or
    // attempting a real nspell parse.
    let callCount = 0;
    const extensions = spellCheckExtension(
      () => {
        callCount += 1;
        return null; // dictionary never loads
      },
      true,
    );
    const lintSource = extractLinterSource(extensions) as (
      view: unknown,
    ) => Promise<unknown[]>;
    const first = await lintSource(viewWithDoc("teh quik"));
    const second = await lintSource(viewWithDoc("teh quik"));
    const third = await lintSource(viewWithDoc("teh quik"));
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(third).toEqual([]);
    // The cache is re-derived each pass while null — that's the fix. Call
    // count grows, but every call returns null quickly (no nspell parse
    // because createChecker's empty-dictionary guard short-circuits).
    expect(callCount).toBe(3);
  });

  it("does not flag words inside URLs embedded in prose", async () => {
    // URL tokens in prose (not entire-line URLs) were previously flagged
    // as misspellings. lintSource now strips URL tokens before calling
    // checkSpelling, so "example" and "com" from https://example.com
    // should not appear in the results.
    const extensions = spellCheckExtension(
      () => mockChecker(new Set(["visit", "for", "info"])),
      true,
    );
    const lintSource = extractLinterSource(extensions) as (
      view: unknown,
    ) => Promise<{ message: string }[]>;

    const doc = "visit https://example.com for info";
    const results = await lintSource(viewWithDoc(doc));
    const messages = results.map((d) => d.message);
    expect(messages).not.toContain("Misspelled word: example");
    expect(messages).not.toContain("Misspelled word: com");
    expect(messages).not.toContain("Misspelled word: https");
  });
});
