/**
 * F05: Android Share Intent Bridge
 * Transfers Android share intent data to the TypeScript pending captures system.
 */

import { getPendingShareData } from "../workspace/tauriBridge";
import { addPendingCapture } from "./pendingCaptures";

/**
 * Check for and process any pending Android share intent data.
 * This is called during app initialization to transfer data from
 * Android shared preferences to the TypeScript pending captures queue.
 */
export async function processAndroidPendingShareData(): Promise<void> {
  try {
    const result = await getPendingShareData();
    
    if (result.data && result.timestamp > 0) {
      // Transfer the Android share data to pending captures
      addPendingCapture({
        source: "android-share",
        text: result.data.text || "",
        title: result.data.title || undefined,
        sourceUrl: undefined, // Android share doesn't currently include URL
        mode: "new", // Default mode for Android shares
        openAfterCommit: true,
        // Note: id, receivedAt, and status are added automatically by addPendingCapture
      });
      
      console.log("F05: Successfully transferred Android share intent to pending captures");
    }
  } catch (error) {
    // On desktop, this method doesn't exist, which is fine
    if (!String(error).includes("getPendingShareData is not a function")) {
      console.warn("F05: Error processing Android pending share data:", error);
    }
  }
}