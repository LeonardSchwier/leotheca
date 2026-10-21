import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { workspacePath, workspaceSettings } from "../settings/store";
import { resolvePathWithinWorkspace } from "../workspace/paths";
import {
  appendToInboxNote,
  createNoteWithTitle,
} from "../capture/captureCommit";
import {
  resolveDatePattern,
  DestinationMode,
  buildCaptureTargetOptions,
  resolveCaptureTargetPath,
  CaptureTargetOption,
} from "../capture/captureDestinations";
import { bookmarks } from "../bookmarks/store";
import { findAllFiles } from "../workspace/tauriBridge";
import { relativePath } from "../workspace/fileTreeStore";
import { Sheet } from "../ui/Sheet";

// F05-FR-27: Accessibility announcement signal
export const captureAnnouncement = signal("");

/** Global state for Capture Sheet */
export const captureSheetOpen = signal(false);
export const captureContent = signal("");
export const captureTitle = signal("");
export const captureSourceUrl = signal("");
export const captureDestinationMode = signal<DestinationMode>("new");
export const captureOpenAfterCapture = signal(true);
export const captureTargetProfileId = signal<string | undefined>(undefined); // F05-FR-08

// ── Quick Capture target picker signals ────────────────────────────────────
/** The kind of capture target the user selected: inbox | daily | specific. */
export const captureTargetKind = signal<"inbox" | "daily" | "specific">("inbox");
/** Absolute note path for "specific" targets; empty otherwise. */
export const captureTargetPath = signal("");
/** Memoized target options (rebuilt when the sheet opens). */
export const captureTargetOptions = signal<CaptureTargetOption[]>([]);
/** Workspace markdown notes for the specific-note picker (loaded on demand). */
export const captureNoteList = signal<Array<{ label: string; path: string }>>([]);
export const captureNoteListLoading = signal(false);

/** Callback type for when a capture is successfully created */
export type OnCaptureCreated = (path: string, name: string) => void;

interface CaptureSheetProps {
  onCreated?: OnCaptureCreated;
}

// F05-FR-27: Helper function to announce messages to screen readers
export function announceCaptureMessage(message: string) {
  captureAnnouncement.value = message;
  // Clear after announcement to allow repeat announcements
  setTimeout(() => {
    captureAnnouncement.value = "";
  }, 1000);
}

/**
 * F05: In-app Capture Sheet for universal quick capture.
 * Provides a focused, minimal UI for quickly capturing notes without
 * navigating away from the current workflow.
 *
 * UX-01 spec sections 20/24.5: renders inside the shared `Sheet` primitive,
 * which now owns modal semantics -- focus trap/restoration, Escape,
 * backdrop and Android back-button dismissal, and scroll locking -- so
 * this component only owns its own capture-specific behavior (destination
 * preview, pre-filled-content selection, submit).
 */
export function CaptureSheet({ onCreated }: CaptureSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Use global signals for state to support pre-filling from pending captures
  const content = captureContent.value;
  const title = captureTitle.value;
  const sourceUrl = captureSourceUrl.value;
  const openAfterCapture = captureOpenAfterCapture.value;
  const targetKind = captureTargetKind.value;
  const targetPath = captureTargetPath.value;

  // Load target options when the sheet opens
  useEffect(() => {
    if (captureSheetOpen.value) {
      const fileBookmarks = bookmarks.value
        .filter((b): b is Extract<typeof b, { kind: "file" }> => b.kind === "file")
        .map((b) => ({ id: b.id, label: b.label, path: b.path }));
      captureTargetOptions.value = buildCaptureTargetOptions(
        {
          captureInboxNote: workspaceSettings.value.captureInboxNote,
          captureDatePattern: workspaceSettings.value.captureDatePattern,
        },
        fileBookmarks,
        workspacePath.value ?? undefined,
      );
      // Reset to inbox if not already set by openCaptureSheetWithData
      if (captureTargetKind.value === "inbox" && captureTargetPath.value === "") {
        // default: inbox
      }
    }
  }, [captureSheetOpen.value]);

  // Load workspace notes for the specific-note picker when needed
  useEffect(() => {
    if (
      captureSheetOpen.value &&
      captureTargetKind.value === "specific" &&
      captureNoteList.value.length === 0 &&
      workspacePath.value
    ) {
      captureNoteListLoading.value = true;
      findAllFiles(workspacePath.value)
        .then((files) => {
          const root = workspacePath.value;
          if (!root) return;
          captureNoteList.value = files
            .filter((f) => !f.isDir && f.name.toLowerCase().endsWith(".md"))
            .map((f) => ({
              label: relativePath(root, f.path),
              path: f.path,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        })
        .catch(() => {
          captureNoteList.value = [];
        })
        .finally(() => {
          captureNoteListLoading.value = false;
        });
    }
  }, [captureSheetOpen.value, captureTargetKind.value]);

  // F05-FR-27: Announce destination changes for screen readers
  useEffect(() => {
    const kindNames = {
      inbox: "Inbox (append)",
      daily: "Daily note",
      specific: "Specific note",
    };
    // Only announce if there's actual content (not initial empty state)
    if (content || title || sourceUrl) {
      announceCaptureMessage(
        `Destination changed to: ${kindNames[targetKind] || targetKind}`,
      );
    }
  }, [targetKind, content, title, sourceUrl]);

  // F05-FR-27: Focus management for accessibility. The Sheet primitive
  // already focuses `textareaRef` (passed as `initialFocusRef` below) once
  // on mount; this effect owns only this component's own additional
  // behavior on top of that: selecting pre-filled content and announcing
  // that the sheet opened.
  useEffect(() => {
    if (captureSheetOpen.value) {
      if (textareaRef.current && content) {
        textareaRef.current.select();
      }
      // F05-FR-27: Announce that capture sheet is open
      announceCaptureMessage("Quick Capture sheet opened");
    }
  }, [content]);

  const handleSubmit = useCallback(async () => {
    if (!workspacePath.value || isSubmitting) return;

    // F05-FR-27: Validate content before submission
    if (content.trim() === "") {
      setSubmitError("Capture content is required");
      // Focus on the textarea if it's empty
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      announceCaptureMessage("Capture content is required");
      return;
    }

    // Validate the target picker selection
    if (targetKind === "specific" && !targetPath.trim()) {
      setSubmitError("Please select a note to capture into");
      announceCaptureMessage("Please select a note to capture into");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let resultPath = "";
      let resultName = "";

      // Resolve the target option from the picker
      const option =
        captureTargetOptions.value.find(
          (o) => o.kind === targetKind,
        ) ?? { kind: targetKind, label: targetKind };

      // For "specific" targets, the path comes from the user-typed field
      const effectiveOption: CaptureTargetOption =
        targetKind === "specific"
          ? { kind: "specific", label: targetPath, path: targetPath }
          : option;

      const resolvedPath = resolveCaptureTargetPath(
        effectiveOption,
        workspacePath.value,
      );

      if (!resolvedPath) {
        setSubmitError("Could not resolve the capture destination");
        announceCaptureMessage("Could not resolve the capture destination");
        return;
      }

      if (targetKind === "daily") {
        // Date-pattern destination: create a new note
        const datePattern =
          workspaceSettings.value.captureDatePattern ||
          "Daily/{{date:YYYY-MM-DD}}.md";
        const resolvedPattern = resolveDatePattern(datePattern);

        const lastSlashIndex = resolvedPattern.path.lastIndexOf("/");
        const targetDir =
          lastSlashIndex > 0
            ? resolvedPattern.path.substring(0, lastSlashIndex)
            : workspacePath.value;
        const fileName =
          lastSlashIndex > 0
            ? resolvedPattern.path.substring(lastSlashIndex + 1)
            : resolvedPattern.path;

        const { path, name } = await createNoteWithTitle(
          targetDir,
          content,
          title || fileName.replace(".md", ""),
          workspacePath.value,
        );
        resultPath = path;
        resultName = name;
        announceCaptureMessage(`Created note: ${name}`);
      } else {
        // inbox / bookmarked / specific: append to the target note
        const notePath = resolvePathWithinWorkspace(
          workspacePath.value,
          workspacePath.value,
          resolvedPath.startsWith(workspacePath.value + "/")
            ? resolvedPath.slice(workspacePath.value.length + 1)
            : resolvedPath,
        );
        const finalPath = notePath ?? resolvedPath;

        const { path, name } = await appendToInboxNote({
          inboxNotePath: finalPath,
          content,
          title: title || undefined,
          sourceUrl: sourceUrl || undefined,
          workspaceRoot: workspacePath.value,
        });
        resultPath = path;
        resultName = name;
        announceCaptureMessage(`Captured to ${name}`);
      }

      // Notify caller and open the note if requested
      if (openAfterCapture && resultPath && resultName) {
        onCreated?.(resultPath, resultName);
      }

      // Close the sheet. The Sheet primitive restores focus to whatever
      // was focused before it opened.
      closeCaptureSheet();
    } catch (error) {
      setSubmitError(
        `Failed to capture: ${error instanceof Error ? error.message : String(error)}`,
      );
      announceCaptureMessage(
        `Capture failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    targetKind,
    targetPath,
    openAfterCapture,
    isSubmitting,
    onCreated,
    title,
    sourceUrl,
  ]);

  const handleCancel = useCallback(() => {
    closeCaptureSheet();
  }, []);

  // Escape, Tab trapping, and dismissal are now owned by the Sheet
  // primitive itself; this only needs the capture-specific submit shortcut.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
        e.preventDefault();
      }
    },
    [handleSubmit],
  );

  if (!captureSheetOpen.value) return null;

  return (
    <Sheet
      title="Quick Capture"
      className="capture-sheet"
      initialFocusRef={textareaRef}
      onDismiss={handleCancel}
      actions={
        <>
          <button onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            class="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || content.trim() === ""}
            aria-label={isSubmitting ? "Saving capture" : "Capture note"}
          >
            {isSubmitting ? "Saving..." : "Capture"}
          </button>
        </>
      }
    >
      <p class="sr-only">
        Use this form to quickly capture notes, URLs, and other content. All
        fields except the capture body are optional.
      </p>

      {/* F05-FR-27: Accessibility live region for announcements */}
      {captureAnnouncement.value && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          class="sr-only"
        >
          {captureAnnouncement.value}
        </div>
      )}

      {/* F05-FR-27: Error announcement */}
      {submitError && (
        <div role="alert" aria-live="assertive" class="capture-sheet-error">
          {submitError}
        </div>
      )}

      <div
        class="capture-sheet-fields"
        role="form"
        aria-label="Quick Capture Form"
      >
        <div class="capture-sheet-field">
          <label for="capture-title">
            Title <span class="sr-only">(optional)</span>
          </label>
          <input
            id="capture-title"
            ref={titleRef}
            type="text"
            class="capture-sheet-input"
            value={title}
            onChange={(e) => {
              captureTitle.value = e.currentTarget.value;
            }}
            placeholder="Note title..."
            disabled={isSubmitting}
            aria-describedby="title-hint"
          />
          <span id="title-hint" class="sr-only">
            Optional note title
          </span>
        </div>

        <div class="capture-sheet-field">
          <label for="capture-url">
            Source URL <span class="sr-only">(optional)</span>
          </label>
          <input
            id="capture-url"
            ref={urlRef}
            type="url"
            class="capture-sheet-input"
            value={sourceUrl}
            onChange={(e) => {
              captureSourceUrl.value = e.currentTarget.value;
            }}
            placeholder="https://example.com"
            disabled={isSubmitting}
            aria-describedby="url-hint"
          />
          <span id="url-hint" class="sr-only">
            Optional source URL, will be recorded but never fetched
          </span>
        </div>

        <div class="capture-sheet-field">
          <label
            for="capture-target"
          >
            Capture into <span class="sr-only">(required)</span>
          </label>
          <select
            id="capture-target"
            class="capture-sheet-input capture-sheet-select"
            value={targetKind}
            onChange={(e) => {
              captureTargetKind.value = e.currentTarget.value as
                | "inbox"
                | "daily"
                | "specific";
              // Reset path when switching away from "specific"
              if (e.currentTarget.value !== "specific") {
                captureTargetPath.value = "";
              }
            }}
            disabled={isSubmitting}
            aria-describedby="target-hint"
          >
            <option value="inbox">Inbox (append)</option>
            <option value="daily">Daily note</option>
            <option value="specific">Specific note…</option>
          </select>
          <span id="target-hint" class="sr-only">
            Choose where the capture should be saved
          </span>
        </div>

        {/* Specific-note sub-picker */}
        {targetKind === "specific" && (
          <div class="capture-sheet-field capture-sheet-specific">
            <label for="capture-target-note">
              Note <span class="sr-only">(required)</span>
            </label>
            {captureNoteListLoading.value ? (
              <span class="capture-sheet-loading" role="status">
                Loading notes…
              </span>
            ) : (
              <select
                id="capture-target-note"
                class="capture-sheet-input capture-sheet-select"
                value={captureTargetPath.value}
                onChange={(e) => {
                  captureTargetPath.value = e.currentTarget.value;
                }}
                disabled={isSubmitting}
                aria-describedby="target-note-hint"
              >
                <option value="">Select a note…</option>
                {captureNoteList.value.map((n) => (
                  <option value={n.path}>{n.label}</option>
                ))}
              </select>
            )}
            <span id="target-note-hint" class="sr-only">
              Choose an existing note to append to
            </span>
          </div>
        )}

        <div class="capture-sheet-field">
          <label class="capture-sheet-checkbox">
            <input
              type="checkbox"
              checked={openAfterCapture}
              onChange={(e) => {
                captureOpenAfterCapture.value = e.currentTarget.checked;
              }}
              disabled={isSubmitting}
            />
            Open after capture
          </label>
        </div>

        {/* F05-FR-27: Destination preview with proper accessibility */}
        <div class="capture-sheet-preview" aria-live="polite">
          {targetKind === "inbox" && (
            <span>
              Destination:{" "}
              <strong>
                {workspaceSettings.value.captureInboxNote || "Inbox.md"}
              </strong>
            </span>
          )}
          {targetKind === "daily" && (
            <span>
              Destination:{" "}
              <strong>
                {workspaceSettings.value.captureDatePattern ||
                  "Daily/YYYY-MM-DD.md"}
              </strong>
            </span>
          )}
          {targetKind === "specific" && (
            <span>
              Destination:{" "}
              <strong>
                {captureTargetPath.value || "Select a note…"}
              </strong>
            </span>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        id="capture-content"
        class="capture-sheet-textarea"
        value={content}
        onChange={(e) => {
          captureContent.value = e.currentTarget.value;
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type your note here..."
        disabled={isSubmitting}
        rows={6}
        aria-label="Capture content"
        aria-describedby="content-hint content-error"
        aria-required="true"
      />
      <span id="content-hint" class="sr-only">
        Main capture content - required field
      </span>
      <div class="capture-sheet-hint" aria-hidden="true">
        Press <kbd>Cmd/Ctrl+Enter</kbd> to capture, <kbd>Escape</kbd> to cancel
      </div>
    </Sheet>
  );
}

/** Open the capture sheet with optional pre-filled content */
export function openCaptureSheet(content?: string) {
  captureContent.value = content ?? "";
  captureSheetOpen.value = true;
}

/** Open the capture sheet with full capture data for editing a pending capture */
export function openCaptureSheetWithData(data: {
  content?: string;
  title?: string;
  sourceUrl?: string;
  mode?: DestinationMode;
  targetProfileId?: string; // F05-FR-08: Target profile UUID
  openAfterCapture?: boolean;
}) {
  // Set all global signals to pre-fill the capture sheet
  captureContent.value = data.content ?? "";
  captureTitle.value = data.title ?? "";
  captureSourceUrl.value = data.sourceUrl ?? "";
  captureDestinationMode.value = data.mode ?? "new";
  captureTargetProfileId.value = data.targetProfileId;
  captureOpenAfterCapture.value = data.openAfterCapture ?? true;
  captureSheetOpen.value = true;
}

/** Close the capture sheet */
export function closeCaptureSheet() {
  captureSheetOpen.value = false;
  // Clear all state when closing to start fresh next time
  captureContent.value = "";
  captureTitle.value = "";
  captureSourceUrl.value = "";
  captureDestinationMode.value = "new";
  captureOpenAfterCapture.value = true;
  // Reset target picker state
  captureTargetKind.value = "inbox";
  captureTargetPath.value = "";
  captureNoteList.value = [];
  // F05-FR-27: Clear accessibility announcement
  captureAnnouncement.value = "";
}

/** Toggle the capture sheet */
export function toggleCaptureSheet(content?: string) {
  if (captureSheetOpen.value) {
    closeCaptureSheet();
  } else {
    openCaptureSheet(content);
  }
}
