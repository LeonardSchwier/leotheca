/**
 * F05: Universal Quick Capture - Destination resolution
 * Handles date-pattern destination paths and validation
 */

/**
 * Supported date tokens for F05 date-pattern destinations
 */
export const DATE_TOKENS = [
  "{{date:YYYY-MM-DD}}",
  "{{date:YYYY-MM}}", 
  "{{date:YYYY}}",
] as const;

/**
 * Date token type
 */
export type DateToken = typeof DATE_TOKENS[number];

/**
 * Result of resolving a date pattern
 */
export interface ResolvedDatePattern {
  path: string;  // The resolved path with date tokens replaced
  dateUsed: Date; // The date that was used for resolution
}

/**
 * Validates that a path contains only supported date tokens
 */
export function validateDatePattern(pattern: string): boolean {
  // Check for unsupported tokens by looking for {{ and }} patterns
  const tokenRegex = /\{{\w+:.*?\}\}/g;
  const matches = pattern.match(tokenRegex) || [];
  
  // All date tokens must be from our supported list
  return matches.every(token => DATE_TOKENS.includes(token as DateToken));
}

/**
 * Resolves date tokens in a pattern string using the current date
 */
export function resolveDatePattern(pattern: string, date: Date = new Date()): ResolvedDatePattern {
  let resolvedPath = pattern;
  
  // Extract date components
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  
  // Replace each supported token
  resolvedPath = resolvedPath.replace(/\{{\s*date:YYYY-MM-DD\s*\}\}/g, `${year}-${month}-${day}`);
  resolvedPath = resolvedPath.replace(/\{{\s*date:YYYY-MM\s*\}\}/g, `${year}-${month}`);
  resolvedPath = resolvedPath.replace(/\{{\s*date:YYYY\s*\}\}/g, year);
  
  return {
    path: resolvedPath,
    dateUsed: date
  };
}

/**
 * Checks if a path contains any date tokens
 */
export function hasDateTokens(pattern: string): boolean {
  return DATE_TOKENS.some(token => pattern.includes(token));
}

/**
 * F05 destination modes
 */
export type DestinationMode = "append" | "new" | "date";

/**
 * Validates a destination mode
 */
export function isValidDestinationMode(mode: string): mode is DestinationMode {
  return ["append", "new", "date"].includes(mode);
}

/**
 * F05-FR target picker: a concrete, user-selectable note to capture into,
 * distinct from the mode (append/new/date) which decides *how* it is written.
 *
 * - `inbox`: the configured inbox note (the "Append to inbox" destination).
 * - `daily`: today's daily note, resolved from the date-pattern setting
 *   (or its default).
 * - `bookmarked`: a note the user has bookmarked (kind "file").
 * - `specific`: any other note the user picked (a "specific note").
 *
 * `bookmarked` and `specific` both carry the absolute note path; `inbox`
 * and `daily` resolve their target path from workspace settings, so they
 * carry none. `label` is the human-readable display name shown in the
 * picker.
 */
export type CaptureTargetKind = "inbox" | "daily" | "bookmarked" | "specific";

export interface CaptureTargetOption {
  kind: CaptureTargetKind;
  label: string;
  /** Absolute note path, present for "bookmarked" and "specific". */
  path?: string;
  /** The bookmark's own id, present only for "bookmarked" (key + identity). */
  bookmarkId?: string;
}

/**
 * Builds the picker's target list: the two always-available presets
 * (inbox, today's daily note) followed by every bookmarked note, each in
 * its own "bookmarked" entry so a bookmarked note can be chosen directly.
 *
 * The specific-note picker lives in CaptureSheet (it lists the workspace's
 * markdown files); this keeps this module free of workspace-file IO so it
 * stays pure and trivially testable. `workspaceRoot` anchors inbox/daily
 * labels to the open workspace when one is set; it is omitted when not.
 */
export function buildCaptureTargetOptions(
  workspaceSettings: {
    captureInboxNote: string;
    captureDatePattern: string;
  },
  bookmarkedNotes: Array<{ id: string; label: string; path: string }>,
  workspaceRoot?: string,
): CaptureTargetOption[] {
  const inboxNote = workspaceSettings.captureInboxNote || "Inbox.md";
  const options: CaptureTargetOption[] = [
    {
      kind: "inbox",
      label: `Inbox: ${inboxNote}`,
      ...(workspaceRoot ? { path: `${workspaceRoot}/${inboxNote}` } : {}),
    },
    {
      kind: "daily",
      label: "Today's daily note",
    },
  ];
  for (const note of bookmarkedNotes) {
    options.push({
      kind: "bookmarked",
      label: note.label,
      path: note.path,
      bookmarkId: note.id,
    });
  }
  return options;
}

/**
 * Resolves the concrete destination a capture target writes into.
 *
 * - "inbox"/"bookmarked"/"specific" → the note path (the option's own
 *   `path`, or the workspace root + configured inbox note for "inbox"),
 *   which the caller passes to `appendToInboxNote` (append into existing).
 * - "daily" → today's daily note from the date pattern (or its default),
 *   which the caller passes to `createNoteWithTitle` (create new).
 *
 * Returns `null` when a required input is missing (no workspace root, or a
 * bookmark/specific target with no path) so callers can refuse rather than
 * write somewhere undefined. Pure: `resolvePathWithinWorkspace` and the
 * daily pattern math are done here with no native bridge, so it stays
 * trivially testable.
 */
export function resolveCaptureTargetPath(
  option: CaptureTargetOption,
  workspaceRoot: string | undefined,
  date: Date = new Date(),
): string | null {
  if (!workspaceRoot) return null;
  switch (option.kind) {
    case "inbox":
      return (
        option.path ??
        `${workspaceRoot}/${
          option.label.replace(/^Inbox: /, "") || "Inbox.md"
        }`
      );
    case "daily":
      return option.path ?? resolveDatePattern("Daily/{{date:YYYY-MM-DD}}.md", date).path;
    case "bookmarked":
    case "specific":
      return option.path && option.path.trim() !== "" ? option.path : null;
  }
}
