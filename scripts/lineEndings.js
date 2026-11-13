// Finds tracked files whose stored copy has CRLF line endings although the
// repository's attributes ask for LF in the index (`* text=auto eol=lf` in
// .gitattributes). With an explicit `text` attribute (an `eol` attribute
// implies it) git converts the working file to LF before it compares, so a
// CRLF blob never matches: git lists the file as modified whenever it re-reads
// it (a fresh clone does, when the checkout and the index share a timestamp,
// and so does any touch of the file), and scripts/agent_ledger.py refuses to
// claim, renew or finish in a dirty checkout. Under `text=auto` git leaves a
// CRLF blob that is already stored alone and does not list it; this check
// still names such a file, because the repository's rule is LF in the index.
// `git ls-files --eol` prints the stored ending in its `i/` column and the
// attributes after `attr/`.
//
// The repair is `git add --renormalize <path>` and a commit. A file that must
// keep CRLF on disk, like a Windows batch file, has `eol=crlf` in
// .gitattributes: the index holds LF and the working tree gets CRLF.

// `i/crlf  w/crlf  attr/text eol=crlf    <TAB>android/gradlew.bat`
// The `w/` column is empty when the working file is missing (deleted, or
// outside a sparse checkout); the stored copy still has to be checked then.
const ENTRY = /^i\/(\S+)\s+w\/(\S*)\s+attr\/([^\t]*)\t([\s\S]+)$/;

/** True when the attributes ask git to store the file with LF endings. */
function asksForLf(attr) {
  const tokens = attr.trim().split(/\s+/).filter(Boolean);
  if (tokens.includes("-text")) return false;
  return tokens.some(
    (token) =>
      token === "text" || token.startsWith("text=") || token.startsWith("eol="),
  );
}

/**
 * Every record of `git ls-files --eol` output (newline or NUL separated) that
 * has the expected columns. A submodule line has an empty index column and is
 * not a record.
 * @param {string} output
 * @returns {{index: string, worktree: string, attr: string, path: string}[]}
 */
export function eolRecords(output) {
  const records = [];
  for (const line of output.split(/\0|\n/)) {
    const match = ENTRY.exec(line);
    if (!match) continue;
    const [, index, worktree, attr, path] = match;
    records.push({ index, worktree, attr: attr.trim(), path });
  }
  return records;
}

/**
 * Paths in `git ls-files --eol` output whose index copy has CRLF or mixed
 * endings while the attributes ask for LF. Throws when the output has content
 * but no readable record: a changed format must fail the check, not turn it
 * into a pass that inspected nothing.
 * @param {string} output
 * @returns {string[]}
 */
export function phantomLineEndingFiles(output) {
  const records = eolRecords(output);
  const firstLine = output.split(/\0|\n/).find((line) => line.trim() !== "");
  if (firstLine !== undefined && records.length === 0) {
    throw new Error(
      `unrecognised \`git ls-files --eol\` output, first line: ${firstLine.slice(0, 80)}`,
    );
  }
  return records
    .filter(
      ({ index, attr }) =>
        (index === "crlf" || index === "mixed") && asksForLf(attr),
    )
    .map(({ path }) => path);
}
