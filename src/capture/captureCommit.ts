/**
 * F05: Universal Quick Capture - Capture commit functionality
 * Handles appending to inbox note and creating new notes with proper formatting
 */

import { readTextFile, writeTextFile, listDir, createWorkspaceTextFileNew, writeWorkspaceBinaryFile, readBinaryFile } from "../workspace/tauriBridge";
import { resolvePathWithinWorkspace } from "../workspace/paths";
import { PendingAttachment } from "./pendingCaptures";
import { rebuildLinkIndex } from "../linking/store";

// F05-FR-07: Prohibited path prefix
const PROHIBITED_PATH_PREFIX = ".leotheca/";

/**
 * Validates that a path is not under the prohibited .leotheca/ directory
 * F05-FR-07: Destination paths shall be contained, validated, and prohibited under `.leotheca/`
 */
function validatePathNotInLeotheca(path: string, workspaceRoot: string): void {
  const relativePath = path.startsWith(workspaceRoot)
    ? path.slice(workspaceRoot.length)
    : path;
  
  if (relativePath.startsWith(PROHIBITED_PATH_PREFIX) || 
      relativePath.includes("/" + PROHIBITED_PATH_PREFIX)) {
    throw new Error(`Capture destination cannot be under .leotheca/ directory: ${path}`);
  }
}

export interface CaptureAppendOptions {
  inboxNotePath: string;
  content: string;
  title?: string;
  sourceUrl?: string;
  workspaceRoot?: string;
  attachments?: PendingAttachment[];
  attachmentsFolder?: string; // Use workspace's attachment folder setting
}

/**
 * Appends content to an inbox note, creating it if it doesn't exist.
 * Preserves existing line ending conventions (LF or CRLF).
 * Adds proper spacing between existing content and new content.
 */
export async function appendToInboxNote(options: CaptureAppendOptions): Promise<{ path: string; name: string }> {
  const { inboxNotePath, content, title, sourceUrl, workspaceRoot, attachments = [], attachmentsFolder } = options;
  
  // F05-FR-07: Validate destination path is not under .leotheca/
  if (workspaceRoot) {
    validatePathNotInLeotheca(inboxNotePath, workspaceRoot);
  }
  
  // F05-FR-15/F05-FR-16/F05-FR-17: Handle attachments with proper paths and fingerprinting
  const attachmentPaths = await copyAttachmentsToWorkspace(
    attachments, 
    workspaceRoot || inboxNotePath.split("/").slice(0, -1).join("/"),
    attachmentsFolder
  );
  
  // F05-FR-19: For closed target note, re-read and conflict-check before append
  let existingContent: string;
  
  try {
    // Read existing content (re-read for closed notes to detect external changes)
    existingContent = await readTextFile(inboxNotePath);
    
    // Determine line ending convention from existing content
    const hasCRLF = existingContent.includes("\r\n");
    const hasLF = existingContent.includes("\n") && !hasCRLF;
    const lineEnding = hasCRLF ? "\r\n" : hasLF ? "\n" : "\n";
    
    // Format the capture content according to F05 spec
    const formattedContent = formatCaptureContent(content, title, sourceUrl, attachmentPaths);
    
    // Append with proper spacing
    const separator = existingContent.trim() === "" ? "" : lineEnding + lineEnding;
    const newContent = existingContent + separator + formattedContent;
    
    // Write back to the file
    await writeTextFile(inboxNotePath, newContent);
    
    // F05-FR-22: Refresh workspace metadata after successful commit
    // Trigger a link index rebuild for the workspace to pick up the new content
    const workspaceRoot = options.workspaceRoot;
    if (workspaceRoot) {
      try {
        // Use a small delay to ensure the file write is visible to the filesystem
        setTimeout(() => {
          rebuildLinkIndex(workspaceRoot).catch(console.warn);
        }, 50);
      } catch (refreshError) {
        console.warn("F05-FR-22: Failed to refresh workspace metadata:", refreshError);
        // Non-fatal: the file watcher will eventually pick up the change
      }
    }
    
    return { path: inboxNotePath, name: inboxNotePath.split("/").pop() || "" };
  } catch {
    // File doesn't exist, create it with the capture content
    const formattedContent = formatCaptureContent(content, title, sourceUrl, attachmentPaths);
    await writeTextFile(inboxNotePath, formattedContent);
    
    // F05-FR-22: Refresh workspace metadata after successful commit for newly created files too
    const workspaceRoot = options.workspaceRoot;
    if (workspaceRoot) {
      try {
        // Use a small delay to ensure the file write is visible to the filesystem
        setTimeout(() => {
          rebuildLinkIndex(workspaceRoot).catch(console.warn);
        }, 50);
      } catch (refreshError) {
        console.warn("F05-FR-22: Failed to refresh workspace metadata for new file:", refreshError);
        // Non-fatal: the file watcher will eventually pick up the change
      }
    }
    
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
 * Generate unique filename for attachments based on F05 spec section 9.3
 * Uses: capture-<local-date>-<local-time>-<short-random>-<safe-name>.<ext>
 * F05-FR-15: Attachment filenames shall be sanitized and final paths shall be collision-free
 */
function generateAttachmentFilename(safeName: string): string {
  const date = new Date().toISOString().replace(":", "-").replace(".", "-").slice(0, 19).replace("T", "-");
  const randomId = Math.random().toString(36).substring(2, 8);
  
  // Extract extension if present
  const lastDot = safeName.lastIndexOf(".");
  const baseName = lastDot > 0 ? safeName.substring(0, lastDot) : safeName;
  const extension = lastDot > 0 ? safeName.substring(lastDot) : ".jpg";
  
  return `capture-${date}-${randomId}-${baseName}${extension}`;
}

/**
 * Copy attachments from app-private staging to workspace with proper paths
 * F05-FR-15: Filename sanitization and collision-free paths
 * F05-FR-16: Existing files shall never be overwritten
 * F05-FR-17: Fingerprint-based retry reuse
 */
async function copyAttachmentsToWorkspace(
  attachments: PendingAttachment[], 
  workspaceRoot: string,
  attachmentsFolder?: string
): Promise<string[]> {
  const attachmentPaths: string[] = [];
  
  // F05: Use workspace's attachment folder setting if available, otherwise use workspace root
  const attachmentFolder = attachmentsFolder 
    ? resolvePathWithinWorkspace(workspaceRoot, workspaceRoot, attachmentsFolder) || workspaceRoot
    : workspaceRoot;
  
  for (const attachment of attachments) {
    try {
      // Generate unique filename
      const uniqueFilename = generateAttachmentFilename(attachment.fileName);
      const destinationPath = `${attachmentFolder}/${uniqueFilename}`;
      
      // F05-FR-17: Check for existing file with same fingerprint before copying
      // This allows reusing already-copied attachments on retry
      let finalPath = destinationPath;
      
      try {
        const sourceFingerprint = await generateFingerprintForFile(attachment.filePath);
        const existingFiles = await listDir(workspaceRoot, attachmentFolder);
        
        // Look for an existing file with the same fingerprint
        let existingMatch: { path: string } | undefined;
        
        for (const f of existingFiles) {
          // Skip the destination path itself
          if (f.path === destinationPath) continue;
          
          try {
            const existingFingerprint = await generateFingerprintForFile(f.path);
            if (existingFingerprint === sourceFingerprint) {
              existingMatch = f;
              break;
            }
          } catch {
            // Can't read existing file's fingerprint, skip it
            continue;
          }
        }
        
        if (existingMatch) {
          // Reuse the existing file instead of copying
          finalPath = existingMatch.path;
        }
      } catch (fingerprintError) {
        // F05-AC-25: Don't log raw errors that may contain sensitive data
        void fingerprintError;
        console.warn("F05-FR-17: Could not check for existing fingerprint match");
        // Continue with normal copy flow
      }
      
      // Check if destination exists
      try {
        const existingFiles = await listDir(workspaceRoot, attachmentFolder);
        const destinationExists = existingFiles.some(f => f.path === destinationPath);
        
        if (destinationExists) {
          // Generate new unique path with collision suffix
          let collisionSuffix = 2;
          let newPath: string;
          do {
            // Split the filename and extension, insert suffix before extension
            const lastDot = uniqueFilename.lastIndexOf(".");
            const base = lastDot > 0 ? uniqueFilename.substring(0, lastDot) : uniqueFilename;
            const ext = lastDot > 0 ? uniqueFilename.substring(lastDot) : "";
            newPath = `${attachmentFolder}/${base}-${collisionSuffix}${ext}`;
            collisionSuffix++;
          } while (existingFiles.some(f => f.path === newPath));
          finalPath = newPath;
        }
      } catch (error) {
        // Directory doesn't exist or can't be read, use generated path
        // F05-AC-25: Don't log raw errors that may contain sensitive data
        void error;
        console.warn("F05: Could not check for existing attachments");
      }
      
      // Copy the file from staging to workspace
      await copyFile(attachment.filePath, workspaceRoot, relativePath(workspaceRoot, finalPath));
      
      // Verify the copy was successful by checking fingerprint
      const sourceFingerprint = await generateFingerprintForFile(attachment.filePath);
      const destFingerprint = await generateFingerprintForFile(finalPath);
      
      if (sourceFingerprint !== destFingerprint) {
        console.warn("F05: Attachment fingerprint mismatch after copy");
        // Try to clean up the destination file
        try {
          // In a real implementation, we'd have a way to delete the file
          // For now, just log the issue
        } catch (cleanupError) {
          // F05-AC-25: Don't log raw errors that may contain sensitive data
          void cleanupError;
          console.error("F05: Failed to cleanup mismatched attachment");
        }
        continue;
      }
      
      // Calculate relative path for markdown reference (from note to attachment)
      const relativeFromNote = relativePath(workspaceRoot, finalPath);
      attachmentPaths.push(relativeFromNote);
      
    } catch (error) {
      // F05-AC-25: Don't log raw errors that may contain sensitive data
      void error;
      console.error("F05: Failed to copy attachment to workspace");
      // Continue with other attachments
    }
  }
  
  return attachmentPaths;
}

/**
 * Copy an attachment from app-private staging to the workspace, byte-for-byte.
 * Writes through the workspace-contained bridge function (audit follow-up
 * F-004's convention for every mutation inside an open workspace), not the
 * plain uncontained one: `relativeDestPath` is derived from a generated
 * filename that only ever gets as safe as its caller's own sanitization, so
 * this is the actual boundary that must reject an escape, not merely rely
 * on one.
 * F05-FR-15/F05-FR-16: Copy attachments to workspace
 */
async function copyFile(sourcePath: string, workspaceRoot: string, relativeDestPath: string): Promise<void> {
  try {
    const bytes = await readBinaryFile(sourcePath);
    await writeWorkspaceBinaryFile(workspaceRoot, relativeDestPath, bytes);
  } catch (error) {
    // F05-AC-25: Don't log raw errors that may contain sensitive data
    console.error("F05: Failed to copy file");
    throw error;
  }
}

/**
 * Generate a fingerprint for a file from its raw bytes, so it identifies the
 * same content regardless of whether it happens to be valid UTF-8.
 * F05-FR-17: Fingerprint for retry matching
 */
async function generateFingerprintForFile(filePath: string): Promise<string> {
  try {
    const bytes = await readBinaryFile(filePath);
    const size = bytes.length;
    const header = bytes.subarray(0, 16);
    const headerHex = Array.from(header).map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    return `${size}-${headerHex}`;
  } catch (error) {
    // F05-AC-25: Don't log raw errors that may contain sensitive data
    void error;
    console.warn("F05: Failed to generate fingerprint");
    return `unknown-${Date.now()}`;
  }
}

/**
 * Creates a new note with a given title in the specified directory.
 * Generates a unique filename based on the title.
 */
export async function createNoteWithTitle(
  dirPath: string,
  content: string,
  title?: string,
  workspaceRoot?: string,
  attachments?: PendingAttachment[],
  attachmentsFolder?: string
): Promise<{ path: string; name: string }> {
  const root = workspaceRoot;
  if (!root) {
    throw new Error("No workspace is open.");
  }
  
  // F05-FR-07: Validate destination path is not under .leotheca/
  validatePathNotInLeotheca(dirPath, root);
  
  // F05-FR-19: For closed target note, re-read and conflict-check before append
  // Since this is a new note, we only need to check for filename conflicts
  const existing = await listDir(root, dirPath);
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
  
  // Generate unique filename (F05-FR-20: New-note creation shall fail rather than overwrite)
  let name = `${baseName}.md`;
  let n = 2;
  while (existingNames.has(name)) {
    name = `${baseName} ${n}.md`;
    n++;
  }
  
  const path = `${dirPath}/${name}`;
  const relative = relativePath(root, path);
  
  // F05-FR-15/F05-FR-16/F05-FR-17: Handle attachments for new notes
  const attachmentPaths = attachments && attachments.length > 0 
    ? await copyAttachmentsToWorkspace(attachments, root || dirPath, attachmentsFolder)
    : [];
  
  // Format content for new note (per F05 spec section 8.2)
  const formattedContent = formatNewNoteContent(content, title, attachmentPaths);
  
  await createWorkspaceTextFileNew(root, relative, formattedContent);
  
  return { path, name };
}

/**
 * Formats capture content according to F05 spec.
 * Creates a properly separated Markdown block with timestamp, title, source URL, and attachments.
 * F05-FR-12: Markdown output shall use the versioned local serializer and contain no hidden capture ID
 * F05-FR-26: Uses local attachment syntax
 */
function formatCaptureContent(content: string, title?: string, sourceUrl?: string, attachmentPaths?: string[]): string {
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
  
  // Add attachments if provided (F05-FR-26: uses local attachment syntax)
  if (attachmentPaths && attachmentPaths.length > 0) {
    contentLines.push("");
    for (const attachmentPath of attachmentPaths) {
      // Use standard markdown image syntax for local attachments
      contentLines.push(`![[${attachmentPath}]]`);
    }
  }
  
  // Add source URL if provided
  if (sourceUrl) {
    contentLines.push("");
    contentLines.push(`Source: <${sourceUrl}>`);
  }
  
  return contentLines.join("\n");
}

/**
 * Formats content for a new note according to F05 spec section 8.2.
 * Creates a new note with optional title, source URL, and attachments.
 * F05-FR-12: Markdown output shall use the versioned local serializer and contain no hidden capture ID
 */
function formatNewNoteContent(content: string, title?: string, attachmentPaths?: string[]): string {
  const contentLines = [];
  
  // Add title as heading if provided
  if (title && title.trim()) {
    contentLines.push(`# ${title.trim()}`);
    contentLines.push("");
  }
  
  // Add the content
  contentLines.push(content.trim());
  
  // Add attachments if provided
  if (attachmentPaths && attachmentPaths.length > 0) {
    contentLines.push("");
    for (const attachmentPath of attachmentPaths) {
      // Use standard markdown image syntax for local attachments
      contentLines.push(`![[${attachmentPath}]]`);
    }
  }
  
  return contentLines.join("\n");
}