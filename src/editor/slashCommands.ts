/**
 * Slash-command completion for the CodeMirror editor.
 *
 * Typing `/` at the start of a line opens a quick-insert menu for common
 * Markdown constructs. This complements the existing Command Palette
 * (which is for app-wide actions) by providing inline content insertion
 * while typing, as described in ROADMAP.md's "Slash commands" entry.
 *
 * The trigger is a `/` at column 0 of a line, followed by the command
 * name being typed (e.g. `/tab` matches `/table`). The completion popup
 * replaces the `/` and typed query with the chosen snippet on selection.
 *
 * No network calls, fully offline — matching CONSTITUTION.md's rule.
 */

import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/** A single slash command: the label shown in the popup, the text to
 *  insert, and a short description. */
export interface SlashCommand {
  /** The full command label shown in the popup (e.g. "table"). */
  label: string;
  /** The Markdown text inserted when selected. */
  snippet: string;
  /** A short human-readable description of what the command does. */
  description: string;
}

/** The set of slash commands available. Ordered by how commonly a user
 *  would need them, so the top of the popup is the most useful first. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    label: "table",
    snippet:
      "| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n|          |          |          |\n|          |          |          |\n|          |          |          |\n",
    description: "Insert a 3-column, 3-row table",
  },
  {
    label: "task",
    snippet: "- [ ] Task\n",
    description: "Insert a task-list item",
  },
  {
    label: "heading",
    snippet: "## Heading\n\n",
    description: "Insert a level-2 heading",
  },
  {
    label: "h1",
    snippet: "# Heading\n\n",
    description: "Insert a level-1 heading",
  },
  {
    label: "h2",
    snippet: "## Heading\n\n",
    description: "Insert a level-2 heading",
  },
  {
    label: "h3",
    snippet: "### Heading\n\n",
    description: "Insert a level-3 heading",
  },
  {
    label: "quote",
    snippet: "> Quoted text\n",
    description: "Insert a blockquote",
  },
  {
    label: "code",
    snippet: "```\n\n```\n",
    description: "Insert a fenced code block",
  },
  {
    label: "link",
    snippet: "[text](url)\n",
    description: "Insert a Markdown link",
  },
  {
    label: "image",
    snippet: "![alt text](image-url)\n",
    description: "Insert an image reference",
  },
  {
    label: "hr",
    snippet: "---\n",
    description: "Insert a horizontal rule",
  },
  {
    label: "wiki",
    snippet: "[[Note]]\n",
    description: "Insert a wikilink",
  },
  {
    label: "callout",
    snippet: "> [!note]\n> Content\n",
    description: "Insert an Obsidian-style callout",
  },
  {
    label: "bold",
    snippet: "**bold text**\n",
    description: "Insert a bold text snippet",
  },
  {
    label: "italic",
    snippet: "*italic text*\n",
    description: "Insert an italic text snippet",
  },
];

/**
 * Filters the command list by a query string (case-insensitive).
 * Returns commands whose label or description contains the query.
 * An empty query returns all commands.
 */
export function filterCommands(query: string): SlashCommand[] {
  if (!query) return [...SLASH_COMMANDS];
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().startsWith(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q),
  );
}

/**
 * The trigger regex for slash commands. Matches a `/` at the very start
 * of a line (column 0) followed by zero or more command-name characters
 * (letters, digits, hyphens). A space, newline, or any other character
 * after the command name ends the match (the popup closes).
 *
 * The `/` must be the first non-whitespace character on the line —
 * `/` inside a word or mid-line does not trigger.
 */
export const SLASH_TRIGGER = /^\/([a-zA-Z][a-zA-Z0-9-]*)$/;

/**
 * CodeMirror completion source for slash commands.
 *
 * Triggers when the cursor is on a line starting with `/` and the text
 * after the `/` is a valid command-name fragment. Returns a filtered list
 * of `SLASH_COMMANDS` whose labels match the fragment.
 *
 * On selection, the `/` and the typed fragment are replaced with the
 * chosen snippet. The cursor is placed at the end of the inserted text
 * (for most snippets) so the user can immediately start editing.
 */
export function slashCommandCompletions(context: CompletionContext): CompletionResult | null {
  // We need the current line, not just the text before the cursor.
  const line = context.state.doc.lineAt(context.pos);
  const textBeforeCursor = line.text.slice(0, context.pos - line.from);

  const match = textBeforeCursor.match(SLASH_TRIGGER);
  if (!match) return null;

  const query = match[1];
  const from = line.from; // start of the line, where the `/` is

  const filtered = filterCommands(query);
  if (filtered.length === 0) return null;

  const options = filtered.map((cmd) => ({
    label: cmd.label,
    apply: cmd.snippet,
    type: "text" as const,
    detail: cmd.description,
    // `boost` puts the most-common commands first; the array order
    // already encodes the preferred order, so we use the index as a
    // small negative boost to keep it stable.
    boost: -filtered.indexOf(cmd),
  }));

  return { from, options, filter: false };
}
