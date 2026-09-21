/**
 * Offline spellchecking for the CodeMirror editor.
 *
 * Uses nspell (Hunspell-compatible) with user-supplied .aff/.dic
 * dictionary files loaded from the workspace's `.leotheca/` directory.
 * No network calls are made; dictionaries are read from the local
 * filesystem only, matching the offline-by-design rule.
 *
 * The module exports:
 * - `SpellCheckResult` — the shape of a single misspelling report
 * - `checkSpelling` — core checking logic (testable without CM)
 * - `spellCheckExtension` — the CM6 linter extension (gated behind
 *   `spellcheckEnabled` workspace setting)
 */
import type { Extension } from "@codemirror/state";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

// nspell is a Node.js package. In the Tauri desktop context we import
// it directly; in tests we inject a fake checker so no real dictionary
// files are needed.
import nspell from "nspell";

/** A single misspelled word found in the document. */
export interface SpellCheckResult {
  /** Start position (0-indexed char offset from doc start). */
  from: number;
  /** End position (exclusive). */
  to: number;
  /** The word as it appears in the document. */
  word: string;
}

/**
 * A minimal spell-checker interface so tests can inject a fake
 * implementation without nspell or Hunspell files.
 */
export interface SpellChecker {
  isCorrect(word: string): boolean;
}

/**
 * Check `text` (a single line) for misspelled words using the
 * supplied `checker`.
 *
 * Returns one `SpellCheckResult` per word that fails the check.
 * `lineOffset` is the character offset of the start of this line
 * within the full document.
 *
 * The function is pure and synchronous, so it is trivially testable.
 * It does NOT skip markdown syntax — the caller (the linter) is
 * responsible for filtering out code blocks, URLs, and other
 * non-prose contexts before calling this.
 */
export function checkSpelling(
  text: string,
  lineOffset: number,
  checker: SpellChecker,
): SpellCheckResult[] {
  const results: SpellCheckResult[] = [];
  // Match word tokens: sequences of letters/digits (Unicode-aware),
  // with internal apostrophes (don't, l'homme) and hyphens (well-known).
  const wordPattern = /\p{L}[\p{L}\p{N}'-]*\p{L}|\p{L}/gu;
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[0];
    // Skip pure digits (catch-all from \p{L} pattern edge cases)
    if (/^\d+$/.test(word)) continue;
    if (!checker.isCorrect(word)) {
      results.push({
        from: lineOffset + match.index,
        to: lineOffset + match.index + word.length,
        word,
      });
    }
  }
  return results;
}

/**
 * Create a `SpellChecker` backed by nspell using the given .aff/.dic
 * file contents. Returns `null` if either file is empty or the
 * dictionary fails to load.
 */
export function createNspellChecker(
  affContent: string,
  dicContent: string,
): SpellChecker | null {
  if (!affContent || !dicContent) return null;
  try {
    const checker = nspell(affContent, dicContent);
    return {
      isCorrect(word: string): boolean {
        return checker.correct(word);
      },
    };
  } catch {
    return null;
  }
}

/**
 * Returns a CM6 `Extension` that integrates spellchecking via
 * `@codemirror/lint`.
 *
 * @param createChecker  A factory that returns a `SpellChecker`
 *                       (typically wrapping an nspell instance
 *                       loaded from disk). Called once per editor
 *                       view lifetime. If it throws or returns null,
 *                       spellchecking is silently disabled for that
 *                       view (no error is surfaced to the user; the
 *                       gutter simply shows no diagnostics).
 * @param enabled        Whether to activate the linter. When `false`,
 *                       returns an empty extension (no-op).
 */
export function spellCheckExtension(
  createChecker: () => SpellChecker | null,
  enabled: boolean,
): Extension {
  if (!enabled) return [];

  let cachedChecker: SpellChecker | null = null;
  // Re-derive on every pass while the last attempt yielded null, so a
  // first lint pass that fires before the dictionary-load effect resolves
  // does not permanently disable spellchecking (see roadmap
  // rm-f506e6522fb79cba). createChecker() returns null in O(1) when the
  // dictionary files are empty, so the "missing dictionary stays off"
  // behavior is preserved and no nspell parse is repeated needlessly once
  // a real checker is cached.
  function getChecker(): SpellChecker | null {
    if (cachedChecker) return cachedChecker;
    try {
      cachedChecker = createChecker();
    } catch {
      cachedChecker = null;
    }
    return cachedChecker;
  }

  // Convert SpellCheckResult[] → Diagnostic[]
  function toDiagnostics(results: SpellCheckResult[]): Diagnostic[] {
    return results.map((r) => ({
      from: r.from,
      to: r.to,
      severity: "info" as const,
      message: `Misspelled word: ${r.word}`,
      source: "spellcheck",
    }));
  }

  // Lint source: scan each line of the visible document.
  // We skip lines that look like they are inside fenced code blocks
  // by tracking fence state line-by-line.
  const fencePattern = /^\s*(```|~~~)/;

  async function lintSource(view: EditorView): Promise<Diagnostic[]> {
    const checker = getChecker();
    if (!checker) return [];

    const diagnostics: Diagnostic[] = [];
    let inFence = false;

    for (let line = 1; line <= view.state.doc.lines; line++) {
      const lineObj = view.state.doc.line(line);
      const text = lineObj.text;

      // Track fence state
      if (fencePattern.test(text)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        continue;
      }

      // Skip lines that are entirely a URL or a markdown link
      if (/^\s*(https?:\/\/|www\.)/.test(text)) {
        continue;
      }

      const results = checkSpelling(text, lineObj.from, checker);
      diagnostics.push(...toDiagnostics(results));
    }

    return diagnostics;
  }

  return [linter(lintSource, { delay: 800 }), lintGutter()];
}
