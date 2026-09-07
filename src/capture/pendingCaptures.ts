/**
 * F05: Universal Quick Capture - Pending captures queue
 * Stores captures that cannot be immediately committed in app-private storage
 */

import { signal } from "@preact/signals";

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
}

// Maximum number of pending captures
export const MAX_PENDING_CAPTURES = 50;

// Maximum total text size for all pending captures (5MB)
export const MAX_PENDING_TEXT_SIZE = 5 * 1024 * 1024;

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
 * Enforces maximum count and text size limits
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
  
  // Enforce text size limit - remove oldest captures until we have enough space
  let totalTextSize = captures.reduce((sum, c) => sum + c.text.length, 0);
  while (totalTextSize + capture.text.length > MAX_PENDING_TEXT_SIZE && captures.length > 0) {
    const sorted = [...captures].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
    const oldest = sorted[0];
    removePendingCapture(oldest.id);
    captures = pendingCapturesStore.value; // Update after removal
    totalTextSize = captures.reduce((sum, c) => sum + c.text.length, 0);
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
    status: "pending"
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
 * Generate a unique capture ID
 */
function generateCaptureId(): string {
  return `capture-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}