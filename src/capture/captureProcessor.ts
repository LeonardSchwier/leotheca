/**
 * F05: Universal Quick Capture - Capture Processor
 * Handles processing of capture requests and pending captures
 */

import { resolvePathWithinWorkspace } from "../workspace/paths";
import { workspaceSettings } from "../settings/store";
import { createNoteWithTitle, appendToInboxNote } from "./captureCommit";
import { resolveDatePattern } from "./captureDestinations";
import { removePendingCapture, updatePendingCaptureStatus, getPendingCaptures, addPendingCapture } from "./pendingCaptures";

export interface CaptureRequest {
  text: string;
  title?: string;
  sourceUrl?: string;
  mode: "append" | "new" | "date";
  targetProfileId?: string; // F05-FR-08: F20 profile UUID for capture destination
  openAfterCommit: boolean;
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
    if (capture.mode === "append") {
      const inboxNote = workspaceSettings.value.captureInboxNote || "Inbox.md";
      const notePath = resolvePathWithinWorkspace(workspacePath, workspacePath, inboxNote);
      if (notePath) {
        await appendToInboxNote({
          inboxNotePath: notePath,
          content: capture.text,
          title: capture.title,
          sourceUrl: capture.sourceUrl,
          workspaceRoot: workspacePath
        });
        if (capture.openAfterCommit) {
          await handleOpenFile(notePath, inboxNote);
        }
        return { path: notePath, name: inboxNote };
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
      
      const { path, name } = await createNoteWithTitle(
        targetDir, 
        capture.text, 
        capture.title || fileName.replace(".md", ""), 
        workspacePath
      );
      if (capture.openAfterCommit) {
        await handleOpenFile(path, name);
      }
      return { path, name };
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
      
      const { path, name } = await createNoteWithTitle(
        targetDir, 
        capture.text, 
        capture.title, 
        workspacePath
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
      openAfterCommit: capture.openAfterCommit
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
      // F05-FR-09: If capture targets a specific profile, activate it first
      if (capture.targetProfileId && activateWorkspaceProfile) {
        await activateWorkspaceProfile(capture.targetProfileId);
      }
      
      const result = await processCaptureRequest(
        {
          text: capture.text,
          title: capture.title,
          sourceUrl: capture.sourceUrl,
          mode: capture.mode,
          targetProfileId: capture.targetProfileId,
          openAfterCommit: capture.openAfterCommit ?? false
        },
        workspacePath,
        handleOpenFile
      );
      
      // F05-FR-11: Only remove pending data after successful commit
      if (result !== null) {
        removePendingCapture(capture.id);
      } else {
        console.error("Failed to process pending capture (null result):", capture.id);
        updatePendingCaptureStatus(capture.id, "failed", "Capture processing returned null");
      }
    } catch (error) {
      console.error("Failed to process pending capture:", capture.id, error);
      updatePendingCaptureStatus(capture.id, "failed", String(error));
    }
  }
}