/**
 * F05: Universal Quick Capture - Pending Captures UI
 * Shows captures that cannot be immediately committed
 */

import { useState } from "preact/hooks";
import { pendingCapturesStore } from "./pendingCaptures";
import { openCaptureSheet } from "../app/CaptureSheet";

export function PendingCaptures() {
  const pendingCaptures = pendingCapturesStore?.value || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (pendingCaptures.length === 0) {
    return null;
  }

  const handleRetry = (captureId: string) => {
    // TODO: F05 - Implement retry logic
    console.log("Retrying capture:", captureId);
  };

  const handleDiscard = (captureId: string) => {
    // TODO: F05 - Implement discard logic with confirmation
    console.log("Discarding capture:", captureId);
  };

  const handleReview = (captureId: string) => {
    // Find the capture and open it in the capture sheet for editing
    const capture = pendingCaptures.find(c => c.id === captureId);
    if (capture) {
      // Pre-fill the capture sheet with the pending capture data
      openCaptureSheet(capture.text);
      // TODO: F05 - Set title, URL, mode, etc. from the pending capture
    }
  };

  const handleChangeDestination = (captureId: string) => {
    // TODO: F05 - Implement change destination logic
    console.log("Changing destination for capture:", captureId);
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
                    
                    {capture.targetNote && (
                      <div class="pending-capture-meta-item">
                        <span class="pending-capture-meta-label">Target:</span>
                        <span class="pending-capture-meta-value">{capture.targetNote}</span>
                      </div>
                    )}
                    
                    {capture.targetFolder && (
                      <div class="pending-capture-meta-item">
                        <span class="pending-capture-meta-label">Folder:</span>
                        <span class="pending-capture-meta-value">{capture.targetFolder}</span>
                      </div>
                    )}
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
