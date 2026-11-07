import { signal } from "@preact/signals";
import {
  cancelMarkdownImport,
  importMarkdownVault,
  type MarkdownImportProgress,
  type MarkdownImportReport,
} from "./markdownImport";

/** Workspace-relative folder that receives each imported vault, as a new
 * subfolder named after the source folder. */
export const IMPORT_TARGET_FOLDER = "Imported";

export type MarkdownImportUiState =
  | { phase: "idle" }
  | {
      phase: "running";
      progress: MarkdownImportProgress | null;
      cancelling: boolean;
    }
  | { phase: "done"; report: MarkdownImportReport }
  | { phase: "error"; message: string };

export const markdownImportState = signal<MarkdownImportUiState>({
  phase: "idle",
});

export function dismissMarkdownImport(): void {
  // A running import owns the dialog; it can only be left by cancelling.
  if (markdownImportState.value.phase === "running") return;
  markdownImportState.value = { phase: "idle" };
}

export async function requestCancelMarkdownImport(): Promise<void> {
  const state = markdownImportState.value;
  if (state.phase !== "running" || state.cancelling) return;
  markdownImportState.value = { ...state, cancelling: true };
  try {
    await cancelMarkdownImport();
  } catch {
    // The run itself reports its own failure; a failed cancel request
    // leaves the import running, so let the user try again.
    const current = markdownImportState.value;
    if (current.phase === "running")
      markdownImportState.value = { ...current, cancelling: false };
  }
}

/**
 * Starts an import. `onChanged` runs once files were written (including a
 * cancelled run that copied some) so the caller can refresh the file tree.
 * Resolves false when nothing ran (unsupported platform, picker dismissed,
 * or another import in progress).
 */
export async function startMarkdownImport(
  onChanged: () => Promise<void> | void,
): Promise<boolean> {
  if (markdownImportState.value.phase === "running") return false;
  markdownImportState.value = {
    phase: "running",
    progress: null,
    cancelling: false,
  };
  try {
    const outcome = await importMarkdownVault(
      IMPORT_TARGET_FOLDER,
      (progress) => {
        const current = markdownImportState.value;
        if (current.phase === "running")
          markdownImportState.value = { ...current, progress };
      },
    );
    if (outcome.status !== "finished") {
      markdownImportState.value = { phase: "idle" };
      return false;
    }
    markdownImportState.value = { phase: "done", report: outcome.report };
    if (outcome.report.notesCopied + outcome.report.otherFilesCopied > 0) {
      try {
        await onChanged();
      } catch {
        // The report is already shown; a failed tree refresh is recovered
        // by the next normal refresh.
      }
    }
    return true;
  } catch (error) {
    markdownImportState.value = {
      phase: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    return false;
  }
}
