/**
 * F05: Universal Quick Capture - Pending captures queue
 * Stores captures that cannot be immediately committed in app-private storage
 */

import { signal } from "@preact/signals";

export interface PendingAttachment {
  id: string; // Unique attachment ID within the capture
  filePath: string; // App-private staged file path
  fileName: string; // Original file name (sanitized)
  fileSize: number; // Size in bytes
  fingerprint: string; // Content fingerprint for retry matching (F05-FR-17)
  mimeType: string; // MIME type of the attachment
}

export interface PendingCapture {
  id: string;
  receivedAt: string;
  source: "in-app" | "deep-link" | "android-share";
  text: string;
  title?: string;
  sourceUrl?: string;
  mode: "append" | "new" | "date";
  targetNote?: string;
  targetFolder?: string;
  targetProfileId?: string; // F05-FR-08: F20 profile UUID for capture destination
  openAfterCommit?: boolean;
  status: "pending" | "retrying" | "failed";
  lastError?: string;
  attachments?: PendingAttachment[]; // F05-FR-04/F05-FR-05: Support for staged attachments
}

// Maximum number of pending captures
export const MAX_PENDING_CAPTURES = 50;

// Maximum total text size for all pending captures (5MB)
export const MAX_PENDING_TEXT_SIZE = 5 * 1024 * 1024;

// Maximum individual capture text size (32 KiB, matching deep link payload limit)
export const MAX_INDIVIDUAL_CAPTURE_SIZE = 32 * 1024;

// Attachment limits (F05 spec section 9.1)
export const MAX_ATTACHMENTS_PER_CAPTURE = 10;
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MiB per image
export const MAX_CAPTURE_ATTACHMENTS_SIZE = 100 * 1024 * 1024; // 100 MiB per capture
export const MAX_TOTAL_PENDING_ATTACHMENT_SIZE = 250 * 1024 * 1024; // 250 MiB total queue

// Storage key for pending captures
const PENDING_CAPTURES_STORAGE_KEY = "leotheca-pending-captures";

// In-memory store for pending captures
export const pendingCapturesStore = signal<PendingCapture[]>([]);

// Save to storage whenever the store changes
pendingCapturesStore.subscribe(() => {
  savePendingCapturesToStorage();
});

/**
 * Initialize pending captures store
 * Loads from localStorage if available
 */
export function initPendingCaptures(): void {
  // Try to load from localStorage
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = window.localStorage.getItem(PENDING_CAPTURES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PendingCapture[];
        pendingCapturesStore.value = parsed;
        return;
      }
    }
  } catch (error) {
    console.warn("Failed to load pending captures from storage:", error);
  }
  
  // Initialize with empty store
  pendingCapturesStore.value = [];
}

/**
 * Save pending captures to localStorage
 */
function savePendingCapturesToStorage(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const captures = pendingCapturesStore.value;
      window.localStorage.setItem(PENDING_CAPTURES_STORAGE_KEY, JSON.stringify(captures));
    }
  } catch (error) {
    console.warn("Failed to save pending captures to storage:", error);
  }
}

/**
 * Clear all pending captures (for testing)
 */
export function clearPendingCaptures(): void {
  pendingCapturesStore.value = [];
}

/**
 * Get all pending captures
 */
export function getPendingCaptures(): PendingCapture[] {
  return [...pendingCapturesStore.value];
}

/**
 * Add a new pending capture
 * Enforces maximum count, text size, and attachment limits
 */
export function addPendingCapture(capture: Omit<PendingCapture, "id" | "receivedAt" | "status">): PendingCapture {
  // Get current captures
  let captures = pendingCapturesStore.value;
  
  // Enforce maximum count limit - remove oldest captures until we have room
  while (captures.length >= MAX_PENDING_CAPTURES) {
    const oldest = captures.reduce((oldest, current) => 
      current.receivedAt < oldest.receivedAt ? current : oldest
    );
    removePendingCapture(oldest.id);
    captures = pendingCapturesStore.value; // Update after removal
  }
  
  // F05-FR-14: Enforce individual capture size limit
  if (capture.text.length > MAX_INDIVIDUAL_CAPTURE_SIZE) {
    console.warn(`F05: Individual capture text size (${capture.text.length}) exceeds ${MAX_INDIVIDUAL_CAPTURE_SIZE} byte limit`);
    throw new Error(`Capture text exceeds maximum size of ${MAX_INDIVIDUAL_CAPTURE_SIZE} bytes`);
  }

  // F05-FR-14: Enforce attachment count limit per capture
  if (capture.attachments && capture.attachments.length > MAX_ATTACHMENTS_PER_CAPTURE) {
    console.warn(`F05: Attachment count (${capture.attachments.length}) exceeds ${MAX_ATTACHMENTS_PER_CAPTURE} limit`);
    throw new Error(`Capture attachments exceed maximum count of ${MAX_ATTACHMENTS_PER_CAPTURE}`);
  }

  // F05-FR-14: Enforce individual attachment size limit
  if (capture.attachments) {
    for (const attachment of capture.attachments) {
      if (attachment.fileSize > MAX_ATTACHMENT_SIZE) {
        console.warn(`F05: Individual attachment size (${attachment.fileSize}) exceeds ${MAX_ATTACHMENT_SIZE} byte limit`);
        throw new Error(`Attachment exceeds maximum size of ${MAX_ATTACHMENT_SIZE} bytes`);
      }
    }
  }

  // Enforce text size limit - remove oldest captures until we have enough space
  let totalTextSize = captures.reduce((sum, c) => sum + c.text.length, 0);
  while (totalTextSize + capture.text.length > MAX_PENDING_TEXT_SIZE && captures.length > 0) {
    const sorted = [...captures].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
    const oldest = sorted[0];
    removePendingCapture(oldest.id);
    captures = pendingCapturesStore.value; // Update after removal
    totalTextSize = captures.reduce((sum, c) => sum + c.text.length, 0);
  }
  
  // F05-FR-14: Enforce total attachment size limit across all pending captures
  const captureAttachmentsSize = capture.attachments?.reduce((sum, a) => sum + a.fileSize, 0) || 0;
  let totalAttachmentsSize = captures.reduce((sum, c) => sum + (c.attachments?.reduce((attSum, a) => attSum + a.fileSize, 0) || 0), 0);
  
  while (totalAttachmentsSize + captureAttachmentsSize > MAX_TOTAL_PENDING_ATTACHMENT_SIZE && captures.length > 0) {
    const sorted = [...captures].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
    const oldest = sorted[0];
    removePendingCapture(oldest.id);
    captures = pendingCapturesStore.value; // Update after removal
    totalAttachmentsSize = captures.reduce((sum, c) => sum + (c.attachments?.reduce((attSum, a) => attSum + a.fileSize, 0) || 0), 0);
  }
  
  // F05-FR-14: Enforce per-capture attachment size limit
  if (captureAttachmentsSize > MAX_CAPTURE_ATTACHMENTS_SIZE) {
    console.warn(`F05: Capture attachment size (${captureAttachmentsSize}) exceeds ${MAX_CAPTURE_ATTACHMENTS_SIZE} byte limit`);
    throw new Error(`Capture attachments exceed maximum size of ${MAX_CAPTURE_ATTACHMENTS_SIZE} bytes`);
  }

  const newCapture: PendingCapture = {
    id: generateCaptureId(),
    receivedAt: new Date().toISOString(),
    source: capture.source,
    text: capture.text,
    title: capture.title,
    sourceUrl: capture.sourceUrl,
    mode: capture.mode,
    targetNote: capture.targetNote,
    targetFolder: capture.targetFolder,
    targetProfileId: capture.targetProfileId,
    openAfterCommit: capture.openAfterCommit ?? false,
    status: "pending",
    // F05-FR-15: sanitize here, the one place every attachment (Android
    // share intent, deep link, in-app capture) enters the queue, so
    // PendingAttachment.fileName's own "(sanitized)" contract actually
    // holds by the time captureCommit.ts builds a filesystem path from it.
    // The Android share intent's fileName in particular comes from
    // another app's content-provider display name, an untrusted string
    // that could otherwise carry "/" or ".." path segments.
    attachments: capture.attachments?.map((attachment) => ({
      ...attachment,
      fileName: sanitizeAttachmentFilename(attachment.fileName),
    })),
  };
  
  pendingCapturesStore.value = [...captures, newCapture];
  
  return newCapture;
}

/**
 * Remove a pending capture
 */
export function removePendingCapture(captureId: string): boolean {
  const captures = pendingCapturesStore.value;
  const index = captures.findIndex(c => c.id === captureId);
  
  if (index !== -1) {
    const newCaptures = [...captures];
    newCaptures.splice(index, 1);
    pendingCapturesStore.value = newCaptures;
    return true;
  }
  
  return false;
}

/**
 * Update a pending capture status
 */
export function updatePendingCaptureStatus(captureId: string, status: PendingCapture["status"], error?: string): boolean {
  const captures = pendingCapturesStore.value;
  const index = captures.findIndex(c => c.id === captureId);
  
  if (index !== -1) {
    const newCaptures = [...captures];
    newCaptures[index] = {
      ...newCaptures[index],
      status,
      ...(error && { lastError: error })
    };
    pendingCapturesStore.value = newCaptures;
    return true;
  }
  
  return false;
}

/**
 * Get pending capture count
 */
export function getPendingCaptureCount(): number {
  return pendingCapturesStore.value.length;
}

/**
 * Check if there are any pending captures
 */
export function hasPendingCaptures(): boolean {
  return pendingCapturesStore.value.length > 0;
}

/**
 * Sanitize filename to be safe for filesystem
 * F05-FR-15: Attachment filenames shall be sanitized
 */
export function sanitizeAttachmentFilename(filename: string): string {
  if (!filename || filename.trim() === "") {
    return "capture";
  }
  
  // Remove path separators and control characters
  let sanitized = filename
    .replace(/[/\\:*?"<>|]/g, "_")
    .split("").filter(c => c.charCodeAt(0) >= 32 || c.charCodeAt(0) === 9).join(""); // Keep printable + tab
  
  // Remove bidirectional control characters
  sanitized = sanitized.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
  
  // Remove reserved names on Windows
  const reservedNames = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
  for (const reserved of reservedNames) {
    if (sanitized.toUpperCase() === reserved) {
      sanitized = "_" + sanitized;
    }
  }
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  
  // If empty after sanitization, use default
  if (!sanitized || sanitized.trim() === "") {
    sanitized = "capture";
  }
  
  // Truncate to reasonable length (max 128 chars)
  if (sanitized.length > 128) {
    sanitized = sanitized.substring(0, 128);
  }
  
  return sanitized;
}

/**
 * Generate a fingerprint for attachment content to support retry matching
 * F05-FR-17: Attachment retry shall reuse an existing planned file only when its fingerprint matches
 */
export async function generateAttachmentFingerprint(filePath: string, bridgeReadFile: (path: string) => Promise<Uint8Array>): Promise<string> {
  try {
    const content = await bridgeReadFile(filePath);
    const size = content.length;
    
    // Create a simple fingerprint based on size and first 16 bytes
    const header = content.slice(0, 16);
    const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, "0")).join("");
    
    return `${size}-${headerHex}`;
  } catch (error) {
    // F05-AC-25: Don't log raw errors that may contain sensitive data
    void error;
    console.warn("F05: Failed to generate attachment fingerprint");
    return `unknown-${Date.now()}`;
  }
}

/**
 * Generate a unique capture ID
 */
function generateCaptureId(): string {
  return `capture-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}