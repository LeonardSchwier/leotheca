/**
 * F05: Universal Quick Capture - Capture commit functionality
 * Handles appending to inbox note and creating new notes with proper formatting
 */

import { readTextFile, writeTextFile, listDir, createWorkspaceTextFileNew } from "../workspace/tauriBridge";

export interface CaptureAppendOptions {
  inboxNotePath: string;
  content: string;
  title?: string;
  sourceUrl?: string;
}

/**
 * Appends content to an inbox note, creating it if it doesn't exist.
 * Preserves existing line ending conventions (LF or CRLF).
 * Adds proper spacing between existing content and new content.
 */
export async function appendToInboxNote(options: CaptureAppendOptions): Promise<{ path: string; name: string }> {
  const { inboxNotePath, content, title, sourceUrl } = options;
  
  // Check if the inbox note already exists
  try {
    const existingContent = await readTextFile(inboxNotePath);
    
    // Determine line ending convention from existing content
    const hasCRLF = existingContent.includes("\r\n");
    const hasLF = existingContent.includes("\n") && !hasCRLF;
    const lineEnding = hasCRLF ? "\r\n" : hasLF ? "\n" : "\n";
    
    // Format the capture content according to F05 spec
    const formattedContent = formatCaptureContent(content, title, sourceUrl);
    
    // Append with proper spacing
    const separator = existingContent.trim() === "" ? "" : lineEnding + lineEnding;
    const newContent = existingContent + separator + formattedContent;
    
    // Write back to the file
    await writeTextFile(inboxNotePath, newContent);
    
    return { path: inboxNotePath, name: inboxNotePath.split("/").pop() || "" };
  } catch (error) {
    // File doesn't exist, create it with the capture content
    const formattedContent = formatCaptureContent(content, title, sourceUrl);
    await writeTextFile(inboxNotePath, formattedContent);
    
    return { path: inboxNotePath, name: inboxNotePath.split("/").pop() || "" };
  }
}

/**
 * Simple relative path calculation for capture functionality
 */
function relativePath(rootPath: string, path: string): string {
  return path.startsWith(rootPath)
    ? path.slice(rootPath.length).replace(/^\//, "")
    : path;
}

/**
 * Creates a new note with a given title in the specified directory.
 * Generates a unique filename based on the title.
 */
export async function createNoteWithTitle(
  dirPath: string,
  content: string,
  title?: string,
  workspaceRoot?: string
): Promise<{ path: string; name: string }> {
  const root = workspaceRoot;
  if (!root) {
    throw new Error("No workspace is open.");
  }
  
  const existing = await listDir(dirPath);
  const existingNames = new Set(existing.map((e) => e.name));
  
  // Generate filename from title or use timestamp
  let baseName: string;
  if (title && title.trim()) {
    baseName = title.trim();
  } else {
    // Use timestamp as base name if no title provided
    const timestamp = new Date().toISOString().replace(":", "-").replace(".", "-").slice(0, 19);
    baseName = timestamp;
  }
  
  // Sanitize filename by removing markdown extension and adding it back
  baseName = baseName.replace(/\.md$/i, "");
  
  // Generate unique filename
  let name = `${baseName}.md`;
  let n = 2;
  while (existingNames.has(name)) {
    name = `${baseName} ${n}.md`;
    n++;
  }
  
  const path = `${dirPath}/${name}`;
  const relative = relativePath(root, path);
  
  // Format content for new note (per F05 spec section 8.2)
  const formattedContent = formatNewNoteContent(content, title);
  
  await createWorkspaceTextFileNew(root, relative, formattedContent);
  
  return { path, name };
}

/**
 * Formats capture content according to F05 spec.
 * Creates a properly separated Markdown block with timestamp, title, and source URL.
 */
function formatCaptureContent(content: string, title?: string, sourceUrl?: string): string {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const datePart = timestamp.split(" ")[0];
  const timePart = timestamp.split(" ")[1];
  
  // Build the header - use title if provided, otherwise use timestamp
  const header = title ? `# ${title}` : `### ${datePart} ${timePart}`;
  
  // Build content lines
  const contentLines = [header];
  
  // Add timestamp on next line if title is provided (per spec section 8.1 rule 2)
  if (title) {
    contentLines.push(`*${datePart} ${timePart}*`);
  }
  
  // Add empty line after header
  contentLines.push("");
  
  // Add the actual content
  contentLines.push(content.trim());
  
  // Add source URL if provided
  if (sourceUrl) {
    contentLines.push("");
    contentLines.push(`Source: <${sourceUrl}>`);
  }
  
  return contentLines.join("\n");
}

/**
 * Formats content for a new note according to F05 spec section 8.2.
 * Creates a new note with optional title and source URL.
 */
function formatNewNoteContent(content: string, title?: string): string {
  const contentLines = [];
  
  // Add title as heading if provided
  if (title && title.trim()) {
    contentLines.push(`# ${title.trim()}`);
    contentLines.push("");
  }
  
  // Add the content
  contentLines.push(content.trim());
  
  return contentLines.join("\n");
}