import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { workspacePath, workspaceSettings } from "../settings/store";
import { selectedDir } from "../workspace/fileTreeStore";
import { resolvePathWithinWorkspace } from "../workspace/paths";
import { appendToInboxNote, createNoteWithTitle } from "../capture/captureCommit";
import { resolveDatePattern, DestinationMode } from "../capture/captureDestinations";

// F05-FR-27: Accessibility announcements signal
const captureAnnouncement = signal("");

/** Global state for Capture Sheet */
export const captureSheetOpen = signal(false);
export const captureContent = signal("");
export const captureTitle = signal("");
export const captureSourceUrl = signal("");
export const captureDestinationMode = signal<DestinationMode>("new");
export const captureOpenAfterCapture = signal(true);
export const captureTargetProfileId = signal<string | undefined>(undefined); // F05-FR-08

/** Callback type for when a capture is successfully created */
export type OnCaptureCreated = (path: string, name: string) => void;

interface CaptureSheetProps {
  onCreated?: OnCaptureCreated;
}

// F05-FR-27: Helper function to announce messages to screen readers
export function announceCaptureMessage(message: string) {
  captureAnnouncement.value = message;
  // Clear after announcement to allow repeat announcements
  setTimeout(() => { captureAnnouncement.value = ""; }, 1000);
}

/**
 * F05: In-app Capture Sheet for universal quick capture.
 * Provides a focused, minimal UI for quickly capturing notes without
 * navigating away from the current workflow.
 */
export function CaptureSheet({ onCreated }: CaptureSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  
  // Use global signals for state to support pre-filling from pending captures
  const content = captureContent.value;
  const title = captureTitle.value;
  const sourceUrl = captureSourceUrl.value;
  const destinationMode = captureDestinationMode.value;
  const openAfterCapture = captureOpenAfterCapture.value;

  // F05-FR-27: Announce destination changes for screen readers
  useEffect(() => {
    const modeNames = {
      append: "Append to inbox",
      new: "Create new note",
      date: "Date pattern"
    };
    // Only announce if there's actual content (not initial empty state)
    if (content || title || sourceUrl) {
      announceCaptureMessage(`Destination changed to: ${modeNames[destinationMode] || destinationMode}`);
    }
  }, [destinationMode, content, title, sourceUrl]);

  // F05-FR-27: Focus management for accessibility
  useEffect(() => {
    if (captureSheetOpen.value) {
      // Save the currently focused element before opening the sheet
      lastFocusedElement.current = document.activeElement as HTMLElement;
      
      // Focus the textarea when the sheet opens
      if (textareaRef.current) {
        textareaRef.current.focus();
        // Select all content if there's any pre-filled text
        if (content) {
          textareaRef.current.select();
        }
      }
      
      // F05-FR-27: Announce that capture sheet is open
      announceCaptureMessage("Quick Capture sheet opened");
    }
  }, [captureSheetOpen.value, content]);

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
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      let resultPath = "";
      let resultName = "";
      
      if (destinationMode === "append") {
        // F05: Append to configured inbox note
        const inboxNote = workspaceSettings.value.captureInboxNote || "Inbox.md";
        const notePath = resolvePathWithinWorkspace(workspacePath.value, workspacePath.value, inboxNote);
        if (notePath) {
          const { path, name } = await appendToInboxNote({
            inboxNotePath: notePath,
            content: content,
            title: title || undefined,
            sourceUrl: sourceUrl || undefined,
            workspaceRoot: workspacePath.value
          });
          resultPath = path;
          resultName = name;
          
          // F05-FR-27: Announce successful capture
          announceCaptureMessage(`Captured to ${name}`);
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
        resultPath = path;
        resultName = name;
        
        // F05-FR-27: Announce successful capture
        announceCaptureMessage(`Created note: ${name}`);
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
        resultPath = path;
        resultName = name;
        
        // F05-FR-27: Announce successful capture
        announceCaptureMessage(`Created note: ${name}`);
      }
      
      // Notify caller and open the note if requested
      if (openAfterCapture && resultPath && resultName) {
        onCreated?.(resultPath, resultName);
      }
      
      // Close the sheet
      closeCaptureSheet();
      
      // F05-FR-27: Restore focus to previously focused element
      if (lastFocusedElement.current) {
        lastFocusedElement.current.focus();
      }
    } catch (error) {
      setSubmitError(`Failed to capture: ${error instanceof Error ? error.message : String(error)}`);
      announceCaptureMessage(`Capture failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [content, destinationMode, openAfterCapture, isSubmitting, onCreated, title, sourceUrl]);

  const handleCancel = useCallback(() => {
    closeCaptureSheet();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
      e.preventDefault();
    } else if (e.key === "Tab") {
      // F05-FR-27: Handle Tab for keyboard navigation within the sheet
      // Let the browser handle tab navigation normally
      return;
    }
    // F05-FR-27: Allow Enter key without modifier to submit when not in textarea
  }, [handleCancel, handleSubmit]);

  if (!captureSheetOpen.value) return null;

  return (
    <div class="modal-overlay" onClick={handleCancel}>
      <div class="modal capture-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="capture-sheet-title" aria-modal="true">
        <h2 id="capture-sheet-title">Quick Capture</h2>
        <p id="capture-sheet-desc" class="sr-only">Use this form to quickly capture notes, URLs, and other content. All fields except the capture body are optional.</p>
        
        {/* F05-FR-27: Accessibility live region for announcements */}
        {captureAnnouncement.value && (
          <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
            {captureAnnouncement.value}
          </div>
        )}
        
        {/* F05-FR-27: Error announcement */}
        {submitError && (
          <div role="alert" aria-live="assertive" class="capture-sheet-error">
            {submitError}
          </div>
        )}
        
        <div class="capture-sheet-fields" role="form" aria-label="Quick Capture Form">
          <div class="capture-sheet-field">
            <label for="capture-title">Title <span class="sr-only">(optional)</span></label>
            <input
              id="capture-title"
              ref={titleRef}
              type="text"
              class="capture-sheet-input"
              value={title}
              onChange={(e) => { captureTitle.value = e.currentTarget.value; }}
              placeholder="Note title..."
              disabled={isSubmitting}
              aria-describedby="title-hint"
            />
            <span id="title-hint" class="sr-only">Optional note title</span>
          </div>
          
          <div class="capture-sheet-field">
            <label for="capture-url">Source URL <span class="sr-only">(optional)</span></label>
            <input
              id="capture-url"
              ref={urlRef}
              type="url"
              class="capture-sheet-input"
              value={sourceUrl}
              onChange={(e) => { captureSourceUrl.value = e.currentTarget.value; }}
              placeholder="https://example.com"
              disabled={isSubmitting}
              aria-describedby="url-hint"
            />
            <span id="url-hint" class="sr-only">Optional source URL, will be recorded but never fetched</span>
          </div>
          
          <fieldset class="capture-sheet-field" disabled={isSubmitting}>
            <legend>Destination Mode</legend>
            <div class="capture-sheet-radio-group" role="radiogroup" aria-label="Destination mode">
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
          </fieldset>
          
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
          
          {/* F05-FR-27: Destination preview with proper accessibility */}
          <div class="capture-sheet-preview" aria-live="polite">
            {destinationMode === "append" && (
              <span>Destination: <strong>{workspaceSettings.value.captureInboxNote || "Inbox.md"}</strong></span>
            )}
            {destinationMode === "new" && (
              <span>Destination: <strong>{workspaceSettings.value.captureInboxFolder || workspacePath.value || "Workspace root"}</strong></span>
            )}
            {destinationMode === "date" && (
              <span>Destination: <strong>{workspaceSettings.value.captureDatePattern || "Daily/YYYY-MM-DD.md"}</strong></span>
            )}
          </div>
        </div>
        
        <textarea
          ref={textareaRef}
          id="capture-content"
          class="capture-sheet-textarea"
          value={content}
          onChange={(e) => { captureContent.value = e.currentTarget.value; }}
          onKeyDown={handleKeyDown}
          placeholder="Type your note here..."
          disabled={isSubmitting}
          rows={6}
          aria-label="Capture content"
          aria-describedby="content-hint content-error"
          aria-required="true"
        />
        <span id="content-hint" class="sr-only">Main capture content - required field</span>
        <div class="capture-sheet-actions">
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
        </div>
        <div class="capture-sheet-hint" aria-hidden="true">
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
