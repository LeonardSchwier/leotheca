/**
 * F05: Android Share Intent Bridge
 * Transfers Android share intent data to the TypeScript pending captures system.
 */

import { getPendingShareData } from "../workspace/tauriBridge";
import { addPendingCapture, type PendingAttachment } from "./pendingCaptures";
import type { AndroidStagedAttachment } from "../workspace/capacitorBridgeImpl";

/**
 * Map Android staged attachment to pending capture attachment format
 * Returns null if attachment data is malformed or incomplete
 */
function mapAndroidAttachment(androidAtt: AndroidStagedAttachment): PendingAttachment | null {
  // F05: Validate required fields - filePath, fileName, and fileSize are essential
  if (!androidAtt.filePath || androidAtt.filePath.trim() === "") {
    console.warn("F05: Skipping Android attachment with empty filePath");
    return null;
  }
  
  if (!androidAtt.fileName || androidAtt.fileName.trim() === "") {
    console.warn("F05: Skipping Android attachment with empty fileName");
    return null;
  }
  
  if (typeof androidAtt.fileSize !== "number" || androidAtt.fileSize <= 0) {
    console.warn("F05: Skipping Android attachment with invalid fileSize");
    return null;
  }
  
  return {
    id: `android-att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    filePath: androidAtt.filePath,
    fileName: androidAtt.fileName,
    fileSize: androidAtt.fileSize,
    fingerprint: androidAtt.fingerprint || "unknown",
    mimeType: androidAtt.mimeType || "application/octet-stream"
  };
}

/**
 * Check for and process any pending Android share intent data.
 * This is called during app initialization to transfer data from
 * Android shared preferences to the TypeScript pending captures queue.
 */
export async function processAndroidPendingShareData(): Promise<void> {
  try {
    const result = await getPendingShareData();
    
    if (result.data && result.timestamp > 0) {
      // Map Android staged attachments to pending capture attachments
      // Filter out any malformed attachments (null from mapAndroidAttachment)
      const attachments = result.data.attachments
        ? result.data.attachments.map(mapAndroidAttachment).filter((a): a is PendingAttachment => a !== null)
        : undefined;
      
      // Only log success if we have valid attachments or no attachments expected
      if (attachments && attachments.length > 0) {
        console.log(`F05: Successfully transferred Android share intent with ${attachments.length} attachments to pending captures`);
      } else if (!result.data.attachments || result.data.attachments.length === 0) {
        console.log("F05: Successfully transferred Android share intent to pending captures");
      } else {
        // Some attachments were malformed and filtered out
        console.warn(`F05: Transferred Android share intent with ${attachments?.length || 0}/${result.data.attachments.length} valid attachments`);
      }
      
      // Transfer the Android share data to pending captures
      addPendingCapture({
        source: "android-share",
        text: result.data.text || "",
        title: result.data.title || undefined,
        sourceUrl: undefined, // Android share doesn't currently include URL
        mode: "new", // Default mode for Android shares
        openAfterCommit: true,
        attachments,
        // Note: id, receivedAt, and status are added automatically by addPendingCapture
      });
    }
  } catch (error) {
    // On desktop, this method doesn't exist, which is fine
    if (!String(error).includes("getPendingShareData is not a function")) {
      console.warn("F05: Error processing Android pending share data:", error);
    }
  }
}