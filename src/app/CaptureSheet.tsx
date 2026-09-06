import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { workspacePath } from "../settings/store";
import { createNoteQuick, selectedDir } from "../workspace/fileTreeStore";

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
      const targetDir = selectedDir.value ?? workspacePath.value;
      const { path, name } = await createNoteQuick(targetDir, content);
      
      // Notify caller
      onCreated?.(path, name);
      
      // Close the sheet
      closeCaptureSheet();
    } finally {
      setIsSubmitting(false);
    }
  }, [content, isSubmitting, onCreated]);

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
