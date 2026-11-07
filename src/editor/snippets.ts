export interface EditorSnippet {
  trigger: string;
  replacement: string;
}

/** Converts the workspace's compact, line-oriented snippet setting into
 * editor data. Invalid or duplicate triggers are ignored so one typo in
 * settings cannot make typing in a note fail. */
export function parseSnippets(source: string): EditorSnippet[] {
  const seen = new Set<string>();
  const snippets: EditorSnippet[] = [];
  for (const line of source.split("\n")) {
    const separator = line.indexOf("\t");
    if (separator < 1) continue;
    const trigger = line.slice(0, separator).trim();
    const replacement = line.slice(separator + 1);
    if (!/^[a-z0-9_-]+$/i.test(trigger) || !replacement || seen.has(trigger)) continue;
    seen.add(trigger);
    snippets.push({ trigger, replacement });
  }
  return snippets;
}

/** Returns the replacement span for a `;trigger` immediately before a
 * cursor, or null when Tab should retain its normal editor behavior. */
export function snippetExpansion(
  textBeforeCursor: string,
  snippets: EditorSnippet[],
): { from: number; replacement: string } | null {
  const match = /;([a-z0-9_-]+)$/i.exec(textBeforeCursor);
  if (!match) return null;
  const snippet = snippets.find((candidate) => candidate.trigger === match[1]);
  if (!snippet) return null;
  return { from: textBeforeCursor.length - match[0].length, replacement: snippet.replacement };
}
