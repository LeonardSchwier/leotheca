/**
 * F05: Universal Quick Capture - Capture commit functionality
 * Handles appending to inbox note and creating new notes with proper formatting
 */

import { readTextFile, writeTextFile } from "../workspace/tauriBridge";

export interface CaptureAppendOptions {
  inboxNotePath: string;
  content: string;
}

/**
 * Appends content to an inbox note, creating it if it doesn't exist.
 * Preserves existing line ending conventions (LF or CRLF).
 * Adds proper spacing between existing content and new content.
 */
export async function appendToInboxNote(options: CaptureAppendOptions): Promise<{ path: string; name: string }> {
  const { inboxNotePath, content } = options;
  
  // Check if the inbox note already exists
  try {
    const existingContent = await readTextFile(inboxNotePath);
    
    // Determine line ending convention from existing content
    const hasCRLF = existingContent.includes("\r\n");
    const hasLF = existingContent.includes("\n") && !hasCRLF;
    const lineEnding = hasCRLF ? "\r\n" : hasLF ? "\n" : "\n";
    
    // Format the capture content according to F05 spec
    const formattedContent = formatCaptureContent(content);
    
    // Append with proper spacing
    const separator = existingContent.trim() === "" ? "" : lineEnding + lineEnding;
    const newContent = existingContent + separator + formattedContent;
    
    // Write back to the file
    await writeTextFile(inboxNotePath, newContent);
    
    return { path: inboxNotePath, name: inboxNotePath.split("/").pop() || "" };
  } catch (error) {
    // File doesn't exist, create it with the capture content
    const formattedContent = formatCaptureContent(content);
    await writeTextFile(inboxNotePath, formattedContent);
    
    return { path: inboxNotePath, name: inboxNotePath.split("/").pop() || "" };
  }
}

/**
 * Formats capture content according to F05 spec.
 * Creates a properly separated Markdown block with timestamp.
 */
function formatCaptureContent(content: string): string {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const datePart = timestamp.split(" ")[0];
  const timePart = timestamp.split(" ")[1];
  
  // Format: ### YYYY-MM-DD HH:MM
  // 
  // Content here
  
  return `### ${datePart} ${timePart}\n\n${content.trim()}`;
}