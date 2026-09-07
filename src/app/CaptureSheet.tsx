import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { workspacePath, workspaceSettings } from "../settings/store";
import { createNoteQuick, selectedDir } from "../workspace/fileTreeStore";
import { resolvePathWithinWorkspace } from "../workspace/paths";
import { appendToInboxNote, createNoteWithTitle } from "../capture/captureCommit";
import { resolveDatePattern, hasDateTokens, DestinationMode } from "../capture/captureDestinations";

/** Global state for Capture Sheet */
export const captureSheetOpen = signal(false);
export const captureContent = signal("");
export const captureTitle = signal("");
export const captureSourceUrl = signal("");
export const captureDestinationMode = signal<DestinationMode>("new");
export const captureOpenAfterCapture = signal(true);

/** Callback type for when a capture is successfully created */
export type OnCaptureCreated = (path: string, name: string) => void;

interface CaptureSheetProps {
  onCreated?: OnCaptureCreated;
}

/**
 * F05: In-app Capture Sheet for universal quick capture.
 * Provides a focused, minimal UI for quickly capturing notes without
 * navigating away from the current workflow.
 */
export function CaptureSheet({ onCreated }: CaptureSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Use global signals for state to support pre-filling from pending captures
  const content = captureContent.value;
  const title = captureTitle.value;
  const sourceUrl = captureSourceUrl.value;
  const destinationMode = captureDestinationMode.value;
  const openAfterCapture = captureOpenAfterCapture.value;

  // Focus textarea when sheet opens
  useEffect(() => {
    if (captureSheetOpen.value && textareaRef.current) {
      textareaRef.current.focus();
      // Select all content if there's any pre-filled text
      if (content) {
        textareaRef.current.select();
      }
    }
  }, [captureSheetOpen.value, content]);

  const handleSubmit = useCallback(async () => {
    if (!workspacePath.value || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      if (destinationMode === "append") {
        // F05: Append to configured inbox note
        const inboxNote = workspaceSettings.value.captureInboxNote || "Inbox.md";
        const notePath = resolvePathWithinWorkspace(workspacePath.value, workspacePath.value, inboxNote);
        if (notePath) {
          const { path, name } = await appendToInboxNote({
            inboxNotePath: notePath,
            content: content,
            title: title || undefined,
            sourceUrl: sourceUrl || undefined
          });
          
          // Notify caller
          onCreated?.(path, name);
          
          // Open the note if requested
          if (openAfterCapture) {
            // Import here to avoid circular dependencies
            const { handleOpenFile } = await import("../app/App");
            await handleOpenFile(path, name);
          }
        }
      } else if (destinationMode === "date") {
        // F05: Date-pattern destination
        const datePattern = workspaceSettings.value.captureDatePattern || "Daily/{{date:YYYY-MM-DD}}.md";
        const resolvedPattern = resolveDatePattern(datePattern);
        
        // Get the directory part of the pattern
        const lastSlashIndex = resolvedPattern.path.lastIndexOf("/");
        const targetDir = lastSlashIndex > 0 
          ? resolvedPattern.path.substring(0, lastSlashIndex)
          : workspacePath.value;
        const fileName = lastSlashIndex > 0 
          ? resolvedPattern.path.substring(lastSlashIndex + 1)
          : resolvedPattern.path;
        
        // Create the date-pattern note
        const { path, name } = await createNoteWithTitle(targetDir, content, title || fileName.replace(".md", ""), workspacePath.value);
        
        // Notify caller
        onCreated?.(path, name);
        
        // Open the note if requested
        if (openAfterCapture) {
          // Import here to avoid circular dependencies
          const { handleOpenFile } = await import("../app/App");
          await handleOpenFile(path, name);
        }
      } else {
        // F05: Create new note in configured folder
        let targetDir = selectedDir.value ?? workspacePath.value;
        
        const inboxFolder = workspaceSettings.value.captureInboxFolder;
        if (inboxFolder) {
          const resolvedInbox = resolvePathWithinWorkspace(workspacePath.value, workspacePath.value, inboxFolder);
          if (resolvedInbox) {
            targetDir = resolvedInbox;
          }
        }
        
        const { path, name } = await createNoteWithTitle(targetDir, content, title || undefined, workspacePath.value);
        
        // Notify caller
        onCreated?.(path, name);
        
        // Open the note if requested
        if (openAfterCapture) {
          // Import here to avoid circular dependencies
          const { handleOpenFile } = await import("../app/App");
          await handleOpenFile(path, name);
        }
      }
      
      // Close the sheet
      closeCaptureSheet();
    } finally {
      setIsSubmitting(false);
    }
  }, [content, destinationMode, openAfterCapture, isSubmitting, onCreated]);

  const handleCancel = useCallback(() => {
    closeCaptureSheet();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  }, [handleCancel, handleSubmit]);

  if (!captureSheetOpen.value) return null;

  return (
    <div class="modal-overlay" onClick={handleCancel}>
      <div class="modal capture-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Quick Capture</h2>
        
        <div class="capture-sheet-fields">
          <div class="capture-sheet-field">
            <label for="capture-title">Title (optional)</label>
            <input
              id="capture-title"
              type="text"
              class="capture-sheet-input"
              value={title}
              onChange={(e) => { captureTitle.value = e.currentTarget.value; }}
              placeholder="Note title..."
              disabled={isSubmitting}
            />
          </div>
          
          <div class="capture-sheet-field">
            <label for="capture-url">Source URL (optional)</label>
            <input
              id="capture-url"
              type="url"
              class="capture-sheet-input"
              value={sourceUrl}
              onChange={(e) => { captureSourceUrl.value = e.currentTarget.value; }}
              placeholder="https://example.com"
              disabled={isSubmitting}
            />
          </div>
          
          <div class="capture-sheet-field">
            <label>Destination Mode</label>
            <div class="capture-sheet-radio-group">
              <label class="capture-sheet-radio">
                <input
                  type="radio"
                  name="destination-mode"
                  value="append"
                  checked={destinationMode === "append"}
                  onChange={() => { captureDestinationMode.value = "append"; }}
                  disabled={isSubmitting}
                />
                Append to inbox
              </label>
              <label class="capture-sheet-radio">
                <input
                  type="radio"
                  name="destination-mode"
                  value="new"
                  checked={destinationMode === "new"}
                  onChange={() => { captureDestinationMode.value = "new"; }}
                  disabled={isSubmitting}
                />
                Create new note
              </label>
              <label class="capture-sheet-radio">
                <input
                  type="radio"
                  name="destination-mode"
                  value="date"
                  checked={destinationMode === "date"}
                  onChange={() => { captureDestinationMode.value = "date"; }}
                  disabled={isSubmitting}
                />
                Date pattern note
              </label>
            </div>
          </div>
          
          <div class="capture-sheet-field">
            <label class="capture-sheet-checkbox">
              <input
                type="checkbox"
                checked={openAfterCapture}
                onChange={(e) => { captureOpenAfterCapture.value = e.currentTarget.checked; }}
                disabled={isSubmitting}
              />
              Open after capture
            </label>
          </div>
          
          {destinationMode === "append" && (
            <div class="capture-sheet-preview">
              Destination: {workspaceSettings.value.captureInboxNote || "Inbox.md"}
            </div>
          )}
          {destinationMode === "new" && (
            <div class="capture-sheet-preview">
              Destination: {workspaceSettings.value.captureInboxFolder || workspacePath.value || "Workspace root"}
            </div>
          )}
          {destinationMode === "date" && (
            <div class="capture-sheet-preview">
              Destination: {workspaceSettings.value.captureDatePattern || "Daily/YYYY-MM-DD.md"}
            </div>
          )}
        </div>
        
        <textarea
          ref={textareaRef}
          class="capture-sheet-textarea"
          value={content}
          onChange={(e) => { captureContent.value = e.currentTarget.value; }}
          onKeyDown={handleKeyDown}
          placeholder="Type your note here..."
          disabled={isSubmitting}
          rows={6}
        />
        <div class="capture-sheet-actions">
          <button onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button 
            class="primary"
            onClick={handleSubmit} 
            disabled={isSubmitting || content.trim() === ""}
          >
            {isSubmitting ? "Saving..." : "Capture"}
          </button>
        </div>
        <div class="capture-sheet-hint">
          Press <kbd>Cmd/Ctrl+Enter</kbd> to capture, <kbd>Escape</kbd> to cancel
        </div>
      </div>
    </div>
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
  openAfterCapture?: boolean;
}) {
  // Set all global signals to pre-fill the capture sheet
  captureContent.value = data.content ?? "";
  captureTitle.value = data.title ?? "";
  captureSourceUrl.value = data.sourceUrl ?? "";
  captureDestinationMode.value = data.mode ?? "new";
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
}

/** Toggle the capture sheet */
export function toggleCaptureSheet(content?: string) {
  if (captureSheetOpen.value) {
    closeCaptureSheet();
  } else {
    openCaptureSheet(content);
  }
}
