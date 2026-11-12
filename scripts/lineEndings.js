// Finds tracked files whose stored copy has CRLF line endings although the
// repository's attributes ask for LF in the index (`* text=auto eol=lf` in
// .gitattributes). With an explicit `text` attribute git converts the working
// file to LF before it compares, so a CRLF blob never matches: git lists the
// file as modified whenever it re-reads it (a fresh clone does, when the
// checkout and the index share a timestamp, and so does any touch of the
// file), and scripts/agent_ledger.py refuses to claim, renew or finish in a
// dirty checkout. `git ls-files --eol` prints the stored ending in its `i/`
// column and the attributes after `attr/`.
//
// The repair is `git add --renormalize <path>` and a commit. A file that must
// keep CRLF on disk, like a Windows batch file, has `eol=crlf` in
// .gitattributes: the index holds LF and the working tree gets CRLF.

// `i/crlf  w/crlf  attr/text eol=crlf    <TAB>android/gradlew.bat`
const ENTRY = /^i\/(\S+)\s+w\/(\S+)\s+attr\/([^\t]*)\t([\s\S]+)$/;

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
 * Paths in `git ls-files --eol` output (newline or NUL separated) whose index
 * copy has CRLF or mixed endings while the attributes ask for LF.
 * @param {string} output
 * @returns {string[]}
 */
export function phantomLineEndingFiles(output) {
  const paths = [];
  for (const record of output.split(/\0|\n/)) {
    const match = ENTRY.exec(record);
    if (!match) continue;
    const [, index, , attr, path] = match;
    if ((index === "crlf" || index === "mixed") && asksForLf(attr)) {
      paths.push(path);
    }
  }
  return paths;
}
