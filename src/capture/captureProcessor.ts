/**
 * F05: Universal Quick Capture - Capture Processor
 * Handles queueing of capture requests that cannot commit immediately.
 */

import { addPendingCapture, type PendingAttachment } from "./pendingCaptures";

export interface CaptureRequest {
  text: string;
  title?: string;
  sourceUrl?: string;
  mode: "append" | "new" | "date";
  targetProfileId?: string; // F05-FR-08: F20 profile UUID for capture destination
  openAfterCommit: boolean;
  attachments?: PendingAttachment[]; // F05-FR-04: Support for attachments
}

/**
 * Queue a capture for later processing (when workspace becomes available)
 */
export function queueCaptureIfNoWorkspace(
  capture: CaptureRequest,
  workspacePath: string | null | undefined,
  source: "in-app" | "deep-link" | "android-share" = "in-app"
): boolean {
  if (!workspacePath) {
    addPendingCapture({
      source,
      text: capture.text,
      title: capture.title,
      sourceUrl: capture.sourceUrl,
      mode: capture.mode,
      targetProfileId: capture.targetProfileId,
      openAfterCommit: capture.openAfterCommit,
      attachments: capture.attachments || []
    });
    return true; // Was queued
  }
  return false; // Was not queued (workspace available)
}
