import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Capacitor } from "@capacitor/core";

/** Mirrors `src-tauri/src/markdown_import.rs` (serde camelCase). */
export interface ImportIssue {
  path: string;
  detail: string;
}

export interface IssueList {
  count: number;
  items: ImportIssue[];
}

export type FindingKind = "preserved" | "converted" | "unsupported";

export interface ImportFinding {
  code: string;
  kind: FindingKind;
  count: number;
  examples: ImportIssue[];
}

export interface MarkdownImportReport {
  destination: string;
  cancelled: boolean;
  totalFiles: number;
  notesCopied: number;
  notesConverted: number;
  otherFilesCopied: number;
  bytesCopied: number;
  skipped: IssueList;
  renamed: IssueList;
  nonUtf8: IssueList;
  failed: IssueList;
  findings: ImportFinding[];
}

export interface MarkdownImportProgress {
  phase: "scanning" | "copying" | "done";
  processed: number;
  total: number;
  current: string;
}

export type MarkdownImportOutcome =
  /** No source folder can be supplied on this platform (Android grants one
   * folder through the system picker, the workspace itself). Nothing ran. */
  | { status: "unsupported" }
  /** The user closed the folder picker. Nothing ran. */
  | { status: "dismissed" }
  | { status: "finished"; report: MarkdownImportReport };

export function isMarkdownImportSupported(): boolean {
  return !Capacitor.isNativePlatform();
}

/** Whether the palette offers the import: needs an open workspace, the
 * setting on, and a platform that can ask for a second folder. */
export function isMarkdownImportOffered(
  hasWorkspace: boolean,
  settingEnabled: boolean,
): boolean {
  return hasWorkspace && settingEnabled && isMarkdownImportSupported();
}

/**
 * Runs the native import. The native side shows the folder picker itself so
 * the webview never supplies the source path. Rejects with the native error
 * message (for example a destination outside the workspace).
 */
export async function importMarkdownVault(
  targetFolder: string,
  onProgress: (progress: MarkdownImportProgress) => void,
): Promise<MarkdownImportOutcome> {
  if (!isMarkdownImportSupported()) return { status: "unsupported" };
  const unlisten = await listen<MarkdownImportProgress>(
    "markdown-import-progress",
    (event) => onProgress(event.payload),
  );
  try {
    const report = await invoke<MarkdownImportReport | null>(
      "import_markdown_vault",
      {
        targetFolder,
      },
    );
    return report ? { status: "finished", report } : { status: "dismissed" };
  } finally {
    unlisten();
  }
}

export async function cancelMarkdownImport(): Promise<void> {
  if (!isMarkdownImportSupported()) return;
  await invoke("cancel_markdown_import");
}

/** What each finding code means for the user, in report wording. */
export const FINDING_TEXT: Record<string, { label: string; note: string }> = {
  "alias-link": {
    label: "Links with an alias, [[Note|Alias]]",
    note: "Kept as written. Leotheca resolves them.",
  },
  "heading-link": {
    label: "Heading links, [[Note#Heading]]",
    note: "Kept as written. Leotheca resolves them.",
  },
  "block-reference": {
    label: "Block references, [[Note#^id]]",
    note: "Kept as written. Leotheca resolves them.",
  },
  "note-embed": {
    label: "Note embeds, ![[Note]]",
    note: "Kept as written. Leotheca renders them in Preview.",
  },
  highlight: {
    label: "Highlights, ==text==",
    note: "Kept as written. Leotheca renders them.",
  },
  tag: {
    label: "Inline tags, #tag",
    note: "Kept as written. Leotheca indexes them.",
  },
  "image-embed-converted": {
    label: "Image embeds, ![[image.png]]",
    note: "Rewritten as standard Markdown images with a path relative to the note.",
  },
  "image-size-dropped": {
    label: "Image size options, ![[image.png|300]]",
    note: "The size was dropped, the image itself is kept. Leotheca does not apply embed sizes.",
  },
  "attachment-embed-became-link": {
    label: "Non-image embeds, ![[file.pdf]]",
    note: "Rewritten as a normal link, because Leotheca does not embed these inline.",
  },
  "attachment-link-converted": {
    label: "Links to attachments, [[file.pdf]]",
    note: "Rewritten as a normal link with a path relative to the note.",
  },
  "attachment-fragment-dropped": {
    label: "Attachment links with a page or heading part",
    note: "The part after # was dropped, the link to the file is kept.",
  },
  "attachment-path-encoded": {
    label: "Attachment paths containing spaces or brackets",
    note: "Escaped as %20 and similar. Leotheca does not decode these yet, so the image may not display until you rename the file.",
  },
  "nested-heading-link": {
    label: "Nested heading links, [[Note#A#B]]",
    note: "Rewritten to point at the innermost heading, [[Note#B]].",
  },
  comment: {
    label: "Comments, %%text%%",
    note: "Rewritten as HTML comments. The text is kept in the file and hidden in Preview.",
  },
  "unterminated-comment": {
    label: "Comments with no closing %%",
    note: "Closed at the end of the note so the rest of the file stays visible.",
  },
  callout: {
    label: "Callouts, > [!type]",
    note: "Kept as written. Leotheca shows them as plain block quotes, without the callout box or icon.",
  },
  "unresolved-link": {
    label: "Links to notes not found in the vault",
    note: "Kept as written. They stay unresolved links.",
  },
  "unresolved-embed": {
    label: "Embeds of files not found in the vault",
    note: "Kept as written.",
  },
  "renamed-note-links": {
    label: "Notes renamed to avoid a name clash",
    note: "Links that name these notes may now point at the note that was already in the workspace.",
  },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function issueSection(title: string, list: IssueList): string[] {
  if (list.count === 0) return [];
  const lines = ["", `${title} (${list.count})`];
  for (const item of list.items) lines.push(`  ${item.path}: ${item.detail}`);
  if (list.count > list.items.length) {
    lines.push(`  ...and ${list.count - list.items.length} more not listed`);
  }
  return lines;
}

/** Plain-text report for the dialog's copy action and for tests. */
export function formatImportReport(report: MarkdownImportReport): string {
  const lines: string[] = [];
  lines.push(
    report.cancelled
      ? "Import cancelled. Files already copied were kept."
      : "Import finished.",
  );
  lines.push(`Destination: ${report.destination}`);
  lines.push(
    `Notes copied: ${report.notesCopied} (${report.notesConverted} rewritten). Other files copied: ${report.otherFilesCopied}. Total: ${formatBytes(report.bytesCopied)}.`,
  );
  lines.push(`Files found in the source: ${report.totalFiles}.`);
  lines.push(...issueSection("Failed, not copied", report.failed));
  lines.push(...issueSection("Skipped", report.skipped));
  lines.push(...issueSection("Renamed to avoid overwriting", report.renamed));
  lines.push(...issueSection("Not UTF-8, copied unchanged", report.nonUtf8));
  const groups: [FindingKind, string][] = [
    ["unsupported", "Not supported by Leotheca"],
    ["converted", "Rewritten"],
    ["preserved", "Kept as written"],
  ];
  for (const [kind, title] of groups) {
    const findings = report.findings.filter((finding) => finding.kind === kind);
    if (findings.length === 0) continue;
    lines.push("", title);
    for (const finding of findings) {
      const text = FINDING_TEXT[finding.code];
      lines.push(
        `  ${text?.label ?? finding.code}: ${finding.count}. ${text?.note ?? ""}`.trimEnd(),
      );
      for (const example of finding.examples) {
        lines.push(`      ${example.path}: ${example.detail}`);
      }
    }
  }
  return lines.join("\n");
}
