export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Computes the smallest single replacement that turns `oldText` into
 * `newText`, by trimming the longest common prefix and suffix. Used to
 * sync an external content change (see MarkdownEditor.tsx's Properties
 * panel integration) into a live CodeMirror document without replacing
 * the whole document: a whole-document replace has no unchanged region
 * for CodeMirror to map the user's cursor/scroll position through, so it
 * would otherwise jump the cursor to the start or end on every external
 * edit, even one confined to the frontmatter block at the top of the
 * file while the user is editing further down.
 */
export function minimalChange(oldText: string, newText: string): TextChange {
  const maxCommon = Math.min(oldText.length, newText.length);

  let start = 0;
  while (start < maxCommon && oldText[start] === newText[start]) start++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { from: start, to: oldEnd, insert: newText.slice(start, newEnd) };
}
