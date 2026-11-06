import "./markdownImport.css";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Spinner } from "../ui/Spinner";
import {
  FINDING_TEXT,
  formatBytes,
  formatImportReport,
  type FindingKind,
  type IssueList,
  type MarkdownImportReport,
} from "./markdownImport";
import {
  dismissMarkdownImport,
  markdownImportState,
  requestCancelMarkdownImport,
} from "./importStore";

const FINDING_GROUPS: { kind: FindingKind; title: string }[] = [
  { kind: "unsupported", title: "Not supported by Leotheca" },
  { kind: "converted", title: "Rewritten" },
  { kind: "preserved", title: "Kept as written" },
];

function IssueSection({
  title,
  list,
  tone,
}: {
  title: string;
  list: IssueList;
  tone: "bad" | "warn" | "info";
}) {
  if (list.count === 0) return null;
  return (
    <section class={`md-import-section md-import-${tone}`}>
      <h3>
        {title} ({list.count})
      </h3>
      <ul>
        {list.items.map((item, index) => (
          <li key={`${item.path}-${index}`}>
            <code>{item.path}</code> {item.detail}
          </li>
        ))}
      </ul>
      {list.count > list.items.length && (
        <p class="md-import-more">
          ...and {list.count - list.items.length} more not listed.
        </p>
      )}
    </section>
  );
}

function ReportView({ report }: { report: MarkdownImportReport }) {
  const copy = () => {
    void navigator.clipboard.writeText(formatImportReport(report)).catch(() => {
      // Copying is a convenience; the report stays visible.
    });
  };
  const nothing = report.totalFiles === 0;
  return (
    <div class="md-import-report">
      <p class="md-import-summary" role="status">
        {report.cancelled
          ? "Cancelled. Files already copied were kept."
          : "Finished."}{" "}
        {nothing
          ? "The chosen folder has no files to import."
          : `${report.notesCopied} notes copied (${report.notesConverted} rewritten), ${report.otherFilesCopied} other files, ${formatBytes(report.bytesCopied)}.`}
      </p>
      <p class="md-import-destination">
        Destination: <code>{report.destination}</code>
      </p>
      <IssueSection
        title="Failed, not copied"
        list={report.failed}
        tone="bad"
      />
      <IssueSection title="Skipped" list={report.skipped} tone="info" />
      <IssueSection
        title="Renamed to avoid overwriting"
        list={report.renamed}
        tone="warn"
      />
      <IssueSection
        title="Not UTF-8, copied unchanged"
        list={report.nonUtf8}
        tone="warn"
      />
      {FINDING_GROUPS.map(({ kind, title }) => {
        const findings = report.findings.filter(
          (finding) => finding.kind === kind,
        );
        if (findings.length === 0) return null;
        return (
          <section
            key={kind}
            class={`md-import-section md-import-${kind === "unsupported" ? "warn" : "info"}`}
          >
            <h3>{title}</h3>
            <ul>
              {findings.map((finding) => {
                const text = FINDING_TEXT[finding.code];
                return (
                  <li key={finding.code}>
                    <strong>{text?.label ?? finding.code}</strong>:{" "}
                    {finding.count}. {text?.note}
                    {finding.examples.length > 0 && (
                      <ul class="md-import-examples">
                        {finding.examples.map((example, index) => (
                          <li key={`${example.path}-${index}`}>
                            <code>{example.path}</code> {example.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <div class="md-import-copy">
        <Button variant="secondary" size="sm" onClick={copy}>
          Copy report
        </Button>
      </div>
    </div>
  );
}

/** Progress, cancel, and the final report for a Markdown vault import.
 * Mounted once at the app root; renders nothing while idle. */
export function MarkdownImportDialog() {
  const state = markdownImportState.value;
  if (state.phase === "idle") return null;

  if (state.phase === "running") {
    const progress = state.progress;
    const known = progress && progress.total > 0;
    return (
      <Dialog
        title="Importing Markdown vault"
        size="md"
        closeOnEscape={false}
        closeOnBackdrop={false}
        onDismiss={() => void requestCancelMarkdownImport()}
        actions={
          <Button
            variant="secondary"
            disabled={state.cancelling}
            onClick={() => void requestCancelMarkdownImport()}
          >
            {state.cancelling ? "Cancelling..." : "Cancel"}
          </Button>
        }
      >
        <div class="md-import-progress">
          <p>
            <Spinner size={16} />{" "}
            {!progress || progress.phase === "scanning"
              ? "Choose a folder, then Leotheca scans it..."
              : `Copying ${progress.processed} of ${progress.total} files`}
          </p>
          {known && (
            <progress
              max={progress.total}
              value={progress.processed}
              aria-label="Import progress"
            />
          )}
          {progress?.current && (
            <p class="md-import-current">{progress.current}</p>
          )}
          <p class="md-import-hint">
            The source folder is only read, never changed. Cancelling keeps the
            files already copied.
          </p>
        </div>
      </Dialog>
    );
  }

  if (state.phase === "error") {
    return (
      <Dialog
        role="alertdialog"
        title="Import failed"
        size="sm"
        description={state.message}
        onDismiss={dismissMarkdownImport}
        actions={<Button onClick={dismissMarkdownImport}>Close</Button>}
      />
    );
  }

  return (
    <Dialog
      title="Markdown vault import report"
      size="lg"
      onDismiss={dismissMarkdownImport}
      actions={<Button onClick={dismissMarkdownImport}>Close</Button>}
    >
      <ReportView report={state.report} />
    </Dialog>
  );
}
