/**
 * F05: Universal Quick Capture - Capture Processor
 * Handles processing of capture requests and pending captures
 */

import { resolvePathWithinWorkspace } from "../workspace/paths";
import { workspaceSettings } from "../settings/store";
import { createNoteWithTitle, appendToInboxNote } from "./captureCommit";
import { resolveDatePattern } from "./captureDestinations";
import { removePendingCapture, updatePendingCaptureStatus, getPendingCaptures, addPendingCapture } from "./pendingCaptures";

// F05-FR-23: Track captures in progress to serialize for same note
const capturesInProgress = new Set<string>();

/**
 * Wait for any existing capture to complete for the same target note
 * F05-FR-23: Multiple captures for one note shall serialize without lost updates
 */
async function waitForNoteSerialization(targetNotePath: string): Promise<void> {
  const key = `note-${targetNotePath}`;
  
  // If there's already a capture in progress for this note, wait for it
  while (capturesInProgress.has(key)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Mark this note as having a capture in progress
  capturesInProgress.add(key);
}

/**
 * Mark capture as completed for the target note
 */
function markCaptureCompleted(targetNotePath: string): void {
  const key = `note-${targetNotePath}`;
  capturesInProgress.delete(key);
}

import { PendingAttachment } from "./pendingCaptures";

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
 * Process a single capture request
 * Returns the path and name of the created/updated note if successful
 */
export async function processCaptureRequest(
  capture: CaptureRequest,
  workspacePath: string,
  handleOpenFile: (path: string, name: string) => Promise<void>
): Promise<{ path: string; name: string } | null> {
  try {
    let targetNotePath: string | null = null;
    
    // Determine the target note path based on mode
    // F05: Get attachment folder from workspace settings
    const attachmentFolder = workspaceSettings.value.attachmentsFolder;
    
    if (capture.mode === "append") {
      const inboxNote = workspaceSettings.value.captureInboxNote || "Inbox.md";
      targetNotePath = resolvePathWithinWorkspace(workspacePath, workspacePath, inboxNote) || null;
      
      if (targetNotePath) {
        // F05-FR-23: Serialize captures for the same note
        await waitForNoteSerialization(targetNotePath);
        
        try {
          await appendToInboxNote({
            inboxNotePath: targetNotePath,
            content: capture.text,
            title: capture.title,
            sourceUrl: capture.sourceUrl,
            workspaceRoot: workspacePath,
            attachments: capture.attachments,
            attachmentsFolder: attachmentFolder
          });
          
          if (capture.openAfterCommit) {
            await handleOpenFile(targetNotePath, inboxNote);
          }
          
          return { path: targetNotePath, name: inboxNote };
        } finally {
          markCaptureCompleted(targetNotePath);
        }
      }
    } else if (capture.mode === "date") {
      const datePattern = workspaceSettings.value.captureDatePattern || "Daily/{{date:YYYY-MM-DD}}.md";
      const resolvedPattern = resolveDatePattern(datePattern);
      
      const lastSlashIndex = resolvedPattern.path.lastIndexOf("/");
      const targetDir = lastSlashIndex > 0 
        ? resolvedPattern.path.substring(0, lastSlashIndex)
        : workspacePath;
      const fileName = lastSlashIndex > 0 
        ? resolvedPattern.path.substring(lastSlashIndex + 1)
        : resolvedPattern.path;
      
      const fullPath = `${targetDir}/${fileName}`;
      
      // F05-FR-23: Serialize captures for the same note
      await waitForNoteSerialization(fullPath);
      
      try {
        const { path, name } = await createNoteWithTitle(
          targetDir, 
          capture.text, 
          capture.title || fileName.replace(".md", ""), 
          workspacePath,
          capture.attachments,
          attachmentFolder
        );
        
        if (capture.openAfterCommit) {
          await handleOpenFile(path, name);
        }
        
        return { path, name };
      } finally {
        markCaptureCompleted(fullPath);
      }
    } else {
      // mode === "new"
      let targetDir = workspaceSettings.value.captureInboxFolder;
      if (!targetDir) {
        targetDir = workspacePath;
      } else {
        const resolvedInbox = resolvePathWithinWorkspace(workspacePath, workspacePath, targetDir);
        if (resolvedInbox) {
          targetDir = resolvedInbox;
        }
      }
      
      // For new notes, we don't serialize since each creates a unique file
      const { path, name } = await createNoteWithTitle(
        targetDir, 
        capture.text, 
        capture.title, 
        workspacePath,
        capture.attachments,
        attachmentFolder
      );
      
      if (capture.openAfterCommit) {
        await handleOpenFile(path, name);
      }
      
      return { path, name };
    }
    return null;
  } catch (error) {
    console.error("Failed to process capture:", error);
    throw error;
  }
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

/**
 * Process all pending captures for the current workspace
 */
export async function processPendingCaptures(
  workspacePath: string,
  handleOpenFile: (path: string, name: string) => Promise<void>,
  activateWorkspaceProfile?: (profileId: string) => Promise<void> // F05-FR-09: for activating target profiles
): Promise<void> {
  const captures = getPendingCaptures();
  for (const capture of captures) {
    try {
      // F05-FR-25: Check if capture still exists (prevents stale callback processing)
      const currentCaptures = getPendingCaptures();
      const currentCapture = currentCaptures.find(c => c.id === capture.id);
      if (!currentCapture) {
        // Capture was removed by another process - skip it
        console.warn("F05-FR-25: Skipping stale capture that was removed during processing:", capture.id);
        continue;
      }
      
      // F05-FR-09: If capture targets a specific profile, activate it first
      if (currentCapture.targetProfileId && activateWorkspaceProfile) {
        await activateWorkspaceProfile(currentCapture.targetProfileId);
      }
      
      const result = await processCaptureRequest(
        {
          text: currentCapture.text,
          title: currentCapture.title,
          sourceUrl: currentCapture.sourceUrl,
          mode: currentCapture.mode,
          targetProfileId: currentCapture.targetProfileId,
          openAfterCommit: currentCapture.openAfterCommit ?? false,
          attachments: currentCapture.attachments || []
        },
        workspacePath,
        handleOpenFile
      );
      
      // F05-FR-25: Check again if capture still exists before removal (prevents stale success)
      const finalCaptures = getPendingCaptures();
      const finalCapture = finalCaptures.find(c => c.id === currentCapture.id);
      
      if (!finalCapture) {
        // Capture was removed by another process during our processing
        console.warn("F05-FR-25: Capture removed by another process during commit:", currentCapture.id);
        continue;
      }
      
      // F05-FR-11: Only remove pending data after successful commit
      if (result !== null) {
        removePendingCapture(currentCapture.id);
        console.log("F05: Successfully processed pending capture:", currentCapture.id);
      } else {
        console.error("Failed to process pending capture (null result):", currentCapture.id);
        updatePendingCaptureStatus(currentCapture.id, "failed", "Capture processing returned null");
      }
    } catch (error) {
      console.error("Failed to process pending capture:", capture.id, error);
      
      // F05-FR-25: Only update status if capture still exists (prevents stale error updates)
      try {
        const currentCaptures = getPendingCaptures();
        const captureStillExists = currentCaptures.some(c => c.id === capture.id);
        if (captureStillExists) {
          updatePendingCaptureStatus(capture.id, "failed", String(error));
        } else {
          console.warn("F05-FR-25: Not updating status for stale capture:", capture.id);
        }
      } catch (statusError) {
        console.error("F05-FR-25: Failed to check capture existence for status update:", statusError);
      }
    }
  }
}