/**
 * F05: Universal Quick Capture - Pending Captures UI
 * Shows captures that cannot be immediately committed
 */

import { useState, useCallback, useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { pendingCapturesStore, removePendingCapture, updatePendingCaptureStatus, type PendingCapture } from "./pendingCaptures";
import { openCaptureSheetWithData } from "../app/CaptureSheet";
import { DestinationMode, resolveDatePattern } from "./captureDestinations";
import { appendToInboxNote, createNoteWithTitle } from "./captureCommit";
import { workspacePath, workspaceSettings } from "../settings/store";
import { resolvePathWithinWorkspace } from "../workspace/paths";

// F05-FR-27: Accessibility announcement signal for Pending Captures
const pendingCapturesAnnouncement = signal("");

// F05-FR-27: Helper function to announce messages to screen readers
function announcePendingCapturesMessage(message: string) {
  pendingCapturesAnnouncement.value = message;
  // Clear after announcement to allow repeat announcements
  setTimeout(() => { pendingCapturesAnnouncement.value = ""; }, 1000);
}

export function PendingCaptures() {
  const pendingCaptures = pendingCapturesStore?.value || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedCaptureId, setFocusedCaptureId] = useState<string | null>(null);

  // F05-FR-27: Announce count changes
  useEffect(() => {
    if (pendingCaptures.length > 0) {
      announcePendingCapturesMessage(`${pendingCaptures.length} pending capture${pendingCaptures.length === 1 ? '' : 's'} ready for review`);
    }
  }, [pendingCaptures.length]);

  if (pendingCaptures.length === 0) {
    return null;
  }

  const commitPendingCapture = useCallback(async (capture: PendingCapture) => {
    if (!workspacePath.value) {
      console.log("Cannot commit pending capture: No workspace is open");
      return false;
    }

    try {
      if (capture.mode === "append") {
        const inboxNote = workspaceSettings.value.captureInboxNote || "Inbox.md";
        const notePath = resolvePathWithinWorkspace(workspacePath.value, workspacePath.value, inboxNote);
        if (notePath) {
          await appendToInboxNote({
            inboxNotePath: notePath,
            content: capture.text,
            title: capture.title,
            sourceUrl: capture.sourceUrl,
            workspaceRoot: workspacePath.value
          });
          return true;
        }
      } else if (capture.mode === "date") {
        const datePattern = workspaceSettings.value.captureDatePattern || "Daily/{{date:YYYY-MM-DD}}.md";
        const resolvedPattern = resolveDatePattern(datePattern);
        
        const lastSlashIndex = resolvedPattern.path.lastIndexOf("/");
        const targetDir = lastSlashIndex > 0 
          ? resolvedPattern.path.substring(0, lastSlashIndex)
          : workspacePath.value;
        const fileName = lastSlashIndex > 0 
          ? resolvedPattern.path.substring(lastSlashIndex + 1)
          : resolvedPattern.path;
        
        await createNoteWithTitle(targetDir, capture.text, capture.title || fileName.replace(".md", ""), workspacePath.value);
        return true;
      } else {
        // mode === "new"
        let targetDir = workspaceSettings.value.captureInboxFolder;
        if (!targetDir) {
          // Fall back to workspace root if no inbox folder configured
          targetDir = workspacePath.value;
        } else {
          const resolvedInbox = resolvePathWithinWorkspace(workspacePath.value, workspacePath.value, targetDir);
          if (resolvedInbox) {
            targetDir = resolvedInbox;
          }
        }
        
        await createNoteWithTitle(targetDir, capture.text, capture.title, workspacePath.value);
        return true;
      }
    } catch (error) {
      console.log("Failed to commit pending capture:", error);
      return false;
    }
  }, []);

  const handleRetry = (captureId: string) => {
    const capture = pendingCaptures.find(c => c.id === captureId);
    if (capture) {
      // Mark as retrying by updating status
      // This would require modifying the store, but for now we'll just attempt to commit
      console.log("Retrying capture:", captureId);
      
      // Try to commit the capture
      commitPendingCapture(capture).then(success => {
        if (success) {
          // Remove the capture if commit succeeded
          removePendingCapture(captureId);
          console.log("Successfully committed pending capture:", captureId);
        } else {
          console.log("Failed to commit pending capture:", captureId);
          // Update status to failed so user can see the failure and retry
          updatePendingCaptureStatus(captureId, "failed", "Commit failed - check console for details");
        }
      });
    }
  };

  const handleDiscard = (captureId: string) => {
    // F05-FR-27: More descriptive confirmation for accessibility
    const capture = pendingCaptures.find(c => c.id === captureId);
    const captureDescription = capture ? 
      `from ${getSourceText(capture.source)} on ${new Date(capture.receivedAt).toLocaleDateString()}` :
      "";
    
    if (confirm(`Are you sure you want to discard this pending capture ${captureDescription}? All associated staged data will be permanently deleted.`)) {
      removePendingCapture(captureId);
      announcePendingCapturesMessage(`Pending capture discarded`);
    }
  };

  const handleRelink = (captureId: string) => {
    // F05-FR-18: Placeholder for Relink action (attachment support not yet implemented)
    console.log("Relink action for capture:", captureId);
    // In a future implementation, this would re-link staged attachments
  };

  const handleReview = (captureId: string) => {
    // Find the capture and open it in the capture sheet for editing
    const capture = pendingCaptures.find(c => c.id === captureId);
    if (capture) {
      // Pre-fill the capture sheet with the pending capture data
      openCaptureSheetWithData({
        content: capture.text,
        title: capture.title,
        sourceUrl: capture.sourceUrl,
        mode: capture.mode as DestinationMode,
        openAfterCapture: capture.openAfterCommit
      });
    }
  };

  const handleChangeDestination = (captureId: string) => {
    // F05: Implement change destination by opening CaptureSheet with existing data
    const capture = pendingCaptures.find(c => c.id === captureId);
    if (capture) {
      openCaptureSheetWithData({
        content: capture.text,
        title: capture.title || "",
        sourceUrl: capture.sourceUrl,
        mode: capture.mode as DestinationMode,
        openAfterCapture: capture.openAfterCommit
      });
    }
  };

  const toggleExpand = (captureId: string) => {
    setExpandedId(expandedId === captureId ? null : captureId);
  };

  const getStatusText = (capture: any) => {
    switch (capture.status) {
      case "pending":
        return "Ready";
      case "retrying":
        return "Retrying...";
      case "failed":
        return capture.lastError ? `Failed: ${capture.lastError}` : "Previous attempt failed";
      default:
        return "Unknown";
    }
  };

  const getSourceText = (source: string) => {
    switch (source) {
      case "in-app":
        return "In-app";
      case "deep-link":
        return "Local automation";
      case "android-share":
        return "Shared from Android";
      default:
        return source;
    }
  };

  const getModeText = (mode: string) => {
    switch (mode) {
      case "append":
        return "Append to inbox";
      case "new":
        return "Create new note";
      case "date":
        return "Date pattern";
      default:
        return mode;
    }
  };

  const getDestinationText = (capture: any) => {
    if (capture.targetNote) {
      return `Note: ${capture.targetNote}`;
    } else if (capture.targetFolder) {
      return `Folder: ${capture.targetFolder}`;
    } else if (capture.mode === "date") {
      return "Date pattern";
    }
    return "Default";
  };

  return (
    <div class="pending-captures-overlay" onClick={(e) => e.stopPropagation()}>
      <div class="pending-captures" role="region" aria-labelledby="pending-captures-title">
        {/* F05-FR-27: Accessibility live region for announcements */}
        {pendingCapturesAnnouncement.value && (
          <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
            {pendingCapturesAnnouncement.value}
          </div>
        )}
        
        <h2 id="pending-captures-title">Pending Captures</h2>
        <p class="sr-only">The following captures are waiting to be committed. Use the available actions to review, retry, change destination, or discard each capture.</p>
        
        <div class="pending-captures-list" role="list">
          {pendingCaptures.map((capture) => (
            <div 
              key={capture.id} 
              class={`pending-capture ${expandedId === capture.id ? "expanded" : ""} ${focusedCaptureId === capture.id ? "focused" : ""}`}
              role="listitem"
              aria-label={`Pending capture from ${getSourceText(capture.source)} on ${new Date(capture.receivedAt).toLocaleDateString()}, status: ${getStatusText(capture)}`}
              tabIndex={0}
              onFocus={() => setFocusedCaptureId(capture.id)}
              onBlur={() => setFocusedCaptureId(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  toggleExpand(capture.id);
                  e.preventDefault();
                }
              }}
            >
              <div class="pending-capture-header" onClick={() => toggleExpand(capture.id)}>
                <div class="pending-capture-source" aria-label={`Source: ${getSourceText(capture.source)}`}>
                  {getSourceText(capture.source)}
                </div>
                <div class="pending-capture-date" aria-label={`Received: ${new Date(capture.receivedAt).toLocaleString()}`}>
                  {new Date(capture.receivedAt).toLocaleString()}
                </div>
                <div class="pending-capture-status" aria-label={`Status: ${getStatusText(capture)}`}>
                  {getStatusText(capture)}
                </div>
                <button 
                  class="pending-capture-expand"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(capture.id); }}
                  aria-label={expandedId === capture.id ? "Collapse capture details" : "Expand capture details"}
                  aria-expanded={expandedId === capture.id}
                >
                  {expandedId === capture.id ? "▲" : "▼"}
                </button>
              </div>
              
              {expandedId === capture.id && (
                <div class="pending-capture-details" role="region" aria-label="Capture details">
                  <div class="pending-capture-text">
                    <label class="pending-capture-text-label">Content preview:</label>
                    <div 
                      class="pending-capture-text-preview"
                      aria-label="Capture text content"
                    >
                      {capture.text.length > 200 ? 
                        `${capture.text.substring(0, 200)}...` : 
                        capture.text || "(No text)"}
                    </div>
                  </div>
                  
                  <fieldset class="pending-capture-meta" disabled={false}>
                    <legend class="sr-only">Capture metadata</legend>
                    {capture.title && (
                      <div class="pending-capture-meta-item">
                        <span class="pending-capture-meta-label" id={`title-label-${capture.id}`}>Title:</span>
                        <span class="pending-capture-meta-value" aria-labelledby={`title-label-${capture.id}`}>{capture.title}</span>
                      </div>
                    )}
                    
                    {capture.sourceUrl && (
                      <div class="pending-capture-meta-item">
                        <span class="pending-capture-meta-label" id={`url-label-${capture.id}`}>URL:</span>
                        <span class="pending-capture-meta-value" aria-labelledby={`url-label-${capture.id}`}>{capture.sourceUrl}</span>
                      </div>
                    )}
                    
                    <div class="pending-capture-meta-item">
                      <span class="pending-capture-meta-label" id={`mode-label-${capture.id}`}>Mode:</span>
                      <span class="pending-capture-meta-value" aria-labelledby={`mode-label-${capture.id}`}>{getModeText(capture.mode)}</span>
                    </div>
                    
                    <div class="pending-capture-meta-item">
                      <span class="pending-capture-meta-label" id={`dest-label-${capture.id}`}>Destination:</span>
                      <span class="pending-capture-meta-value" aria-labelledby={`dest-label-${capture.id}`}>{getDestinationText(capture)}</span>
                    </div>
                  </fieldset>
                  
                  <div class="pending-capture-actions" role="toolbar" aria-label="Capture actions">
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleReview(capture.id); }}
                      aria-label={`Review capture from ${getSourceText(capture.source)}`}
                    >
                      Review
                    </button>
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleRetry(capture.id); }}
                      aria-label={`Retry capture from ${getSourceText(capture.source)}`}
                    >
                      Retry
                    </button>
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleChangeDestination(capture.id); }}
                      aria-label={`Change destination for capture from ${getSourceText(capture.source)}`}
                    >
                      Change Destination
                    </button>
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleRelink(capture.id); }}
                      aria-label={`Relink capture from ${getSourceText(capture.source)}`}
                    >
                      Relink
                    </button>
                    <button 
                      class="pending-capture-action pending-capture-action-danger" 
                      onClick={(e) => { e.stopPropagation(); handleDiscard(capture.id); }}
                      aria-label={`Discard capture from ${getSourceText(capture.source)}. All associated staged data will be permanently deleted.`}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div class="pending-captures-actions">
          <button onClick={() => setExpandedId(null)} aria-label="Collapse all pending captures">
            Collapse All
          </button>
        </div>
      </div>
    </div>
  );
}
