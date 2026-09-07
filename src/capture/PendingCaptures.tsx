/**
 * F05: Universal Quick Capture - Pending Captures UI
 * Shows captures that cannot be immediately committed
 */

import { useState, useCallback } from "preact/hooks";
import { pendingCapturesStore, removePendingCapture, type PendingCapture } from "./pendingCaptures";
import { openCaptureSheetWithData } from "../app/CaptureSheet";
import { DestinationMode, resolveDatePattern } from "./captureDestinations";
import { appendToInboxNote, createNoteWithTitle } from "./captureCommit";
import { workspacePath, workspaceSettings } from "../settings/store";
import { resolvePathWithinWorkspace } from "../workspace/paths";

export function PendingCaptures() {
  const pendingCaptures = pendingCapturesStore?.value || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            sourceUrl: capture.sourceUrl
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
          // TODO: Update status to failed
        }
      });
    }
  };

  const handleDiscard = (captureId: string) => {
    // Implement discard with confirmation
    if (confirm("Are you sure you want to discard this pending capture? This cannot be undone.")) {
      removePendingCapture(captureId);
    }
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
    // TODO: F05 - Implement change destination logic
    // This would require a destination selection dialog
    console.log("Changing destination for capture:", captureId);
    alert("Change destination functionality will be implemented in a future update.");
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
      <div class="pending-captures">
        <h2>Pending Captures</h2>
        
        <div class="pending-captures-list">
          {pendingCaptures.map((capture) => (
            <div 
              key={capture.id} 
              class={`pending-capture ${expandedId === capture.id ? "expanded" : ""}`}
            >
              <div class="pending-capture-header" onClick={() => toggleExpand(capture.id)}>
                <div class="pending-capture-source">
                  {getSourceText(capture.source)}
                </div>
                <div class="pending-capture-date">
                  {new Date(capture.receivedAt).toLocaleString()}
                </div>
                <div class="pending-capture-status">
                  {getStatusText(capture)}
                </div>
                <button class="pending-capture-expand">
                  {expandedId === capture.id ? "▲" : "▼"}
                </button>
              </div>
              
              {expandedId === capture.id && (
                <div class="pending-capture-details">
                  <div class="pending-capture-text">
                    <div class="pending-capture-text-preview">
                      {capture.text.length > 200 ? 
                        `${capture.text.substring(0, 200)}...` : 
                        capture.text || "(No text)"}
                    </div>
                  </div>
                  
                  <div class="pending-capture-meta">
                    {capture.title && (
                      <div class="pending-capture-meta-item">
                        <span class="pending-capture-meta-label">Title:</span>
                        <span class="pending-capture-meta-value">{capture.title}</span>
                      </div>
                    )}
                    
                    {capture.sourceUrl && (
                      <div class="pending-capture-meta-item">
                        <span class="pending-capture-meta-label">URL:</span>
                        <span class="pending-capture-meta-value">{capture.sourceUrl}</span>
                      </div>
                    )}
                    
                    <div class="pending-capture-meta-item">
                      <span class="pending-capture-meta-label">Mode:</span>
                      <span class="pending-capture-meta-value">{getModeText(capture.mode)}</span>
                    </div>
                    
                    <div class="pending-capture-meta-item">
                      <span class="pending-capture-meta-label">Destination:</span>
                      <span class="pending-capture-meta-value">{getDestinationText(capture)}</span>
                    </div>
                  </div>
                  
                  <div class="pending-capture-actions">
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleReview(capture.id); }}
                    >
                      Review
                    </button>
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleRetry(capture.id); }}
                    >
                      Retry
                    </button>
                    <button 
                      class="pending-capture-action" 
                      onClick={(e) => { e.stopPropagation(); handleChangeDestination(capture.id); }}
                    >
                      Change Destination
                    </button>
                    <button 
                      class="pending-capture-action pending-capture-action-danger" 
                      onClick={(e) => { e.stopPropagation(); handleDiscard(capture.id); }}
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
          <button onClick={() => setExpandedId(null)}>
            Collapse All
          </button>
        </div>
      </div>
    </div>
  );
}
