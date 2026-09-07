/**
 * F05: Universal Quick Capture - Pending Captures UI
 * Shows captures that cannot be immediately committed
 */

import { useState } from "preact/hooks";
import { pendingCapturesStore, removePendingCapture } from "./pendingCaptures";
import { openCaptureSheet } from "../app/CaptureSheet";
import { DestinationMode } from "./captureDestinations";

export function PendingCaptures() {
  const pendingCaptures = pendingCapturesStore?.value || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (pendingCaptures.length === 0) {
    return null;
  }

  const handleRetry = (captureId: string) => {
    // TODO: F05 - Implement retry logic
    // For now, just remove the capture as if retry succeeded
    const capture = pendingCaptures.find(c => c.id === captureId);
    if (capture) {
      // Mark as retrying
      // TODO: Implement actual retry with the capture commit logic
      console.log("Retrying capture:", captureId);
      
      // For now, simulate successful retry by removing the capture
      removePendingCapture(captureId);
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
      openCaptureSheet(capture.text);
      // TODO: F05 - Set title, URL, mode, etc. from the pending capture
      // This would require extending the openCaptureSheet API to accept more parameters
      console.log("Reviewing capture with data:", {
        title: capture.title,
        url: capture.sourceUrl,
        mode: capture.mode,
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
