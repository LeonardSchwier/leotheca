import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { workspacePath, workspaceSettings } from "../settings/store";
import { createNoteQuick, selectedDir } from "../workspace/fileTreeStore";
import { resolvePathWithinWorkspace } from "../workspace/paths";
import { appendToInboxNote, createNoteWithTitle } from "../capture/captureCommit";

/** Global state for Capture Sheet visibility */
export const captureSheetOpen = signal(false);

/** Global state for the capture content being edited */
export const captureContent = signal("");

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
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [destinationMode, setDestinationMode] = useState<"append" | "new">("new");
  const [openAfterCapture, setOpenAfterCapture] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync with global state when opened
  useEffect(() => {
    if (captureSheetOpen.value && textareaRef.current) {
      setContent(captureContent.value);
      textareaRef.current.focus();
      // Select all content if there's any pre-filled text
      if (captureContent.value) {
        textareaRef.current.select();
      }
    }
  }, [captureSheetOpen.value]);

  // Update global content as user types
  useEffect(() => {
    if (captureSheetOpen.value) {
      captureContent.value = content;
    }
  }, [content, captureSheetOpen.value]);

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
              onChange={(e) => setTitle(e.currentTarget.value)}
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
              onChange={(e) => setSourceUrl(e.currentTarget.value)}
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
                  onChange={() => setDestinationMode("append")}
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
                  onChange={() => setDestinationMode("new")}
                  disabled={isSubmitting}
                />
                Create new note
              </label>
            </div>
          </div>
          
          <div class="capture-sheet-field">
            <label class="capture-sheet-checkbox">
              <input
                type="checkbox"
                checked={openAfterCapture}
                onChange={(e) => setOpenAfterCapture(e.currentTarget.checked)}
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
        </div>
        
        <textarea
          ref={textareaRef}
          class="capture-sheet-textarea"
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
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

/** Close the capture sheet */
export function closeCaptureSheet() {
  captureSheetOpen.value = false;
  // Clear content when closing to start fresh next time
  captureContent.value = "";
}

/** Toggle the capture sheet */
export function toggleCaptureSheet(content?: string) {
  if (captureSheetOpen.value) {
    closeCaptureSheet();
  } else {
    openCaptureSheet(content);
  }
}
