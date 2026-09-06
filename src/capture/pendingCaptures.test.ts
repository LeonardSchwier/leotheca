/**
 * Tests for F05 pending captures functionality
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  clearPendingCaptures,
  addPendingCapture,
  removePendingCapture,
  getPendingCaptures,
  updatePendingCaptureStatus,
  getPendingCaptureCount,
  hasPendingCaptures,
  MAX_PENDING_CAPTURES,
  MAX_PENDING_TEXT_SIZE
} from "./pendingCaptures";

describe("pendingCaptures", () => {
  // Reset state before each test
  beforeEach(() => {
    clearPendingCaptures();
  });

  it("should start with empty captures", () => {
    expect(getPendingCaptures()).toEqual([]);
  });

  it("should add new pending capture", () => {
    const capture = addPendingCapture({
      source: "in-app",
      text: "Test capture content",
      mode: "new"
    });
    
    expect(capture.id).toBeDefined();
    expect(capture.receivedAt).toBeDefined();
    expect(capture.status).toBe("pending");
    expect(capture.source).toBe("in-app");
    expect(capture.text).toBe("Test capture content");
    expect(capture.mode).toBe("new");
  });

  it("should return all captures", () => {
    addPendingCapture({ source: "in-app", text: "Capture 1", mode: "new" });
    addPendingCapture({ source: "deep-link", text: "Capture 2", mode: "append" });
    
    const captures = getPendingCaptures();
    expect(captures).toHaveLength(2);
  });

  it("should remove pending capture", () => {
    const capture = addPendingCapture({ source: "in-app", text: "Test capture", mode: "append" });
    
    expect(getPendingCaptures()).toHaveLength(1);
    
    const removed = removePendingCapture(capture.id);
    expect(removed).toBe(true);
    expect(getPendingCaptures()).toHaveLength(0);
  });

  it("should return false when removing non-existent capture", () => {
    const removed = removePendingCapture("non-existent-id");
    expect(removed).toBe(false);
  });

  it("should update capture status", () => {
    const capture = addPendingCapture({ source: "deep-link", text: "Test capture", mode: "append" });
    
    const updated = updatePendingCaptureStatus(capture.id, "failed", "Test error");
    expect(updated).toBe(true);
    
    const captures = getPendingCaptures();
    expect(captures[0].status).toBe("failed");
    expect(captures[0].lastError).toBe("Test error");
  });

  it("should return correct capture count", () => {
    expect(getPendingCaptureCount()).toBe(0);
    
    addPendingCapture({ source: "in-app", text: "Capture 1", mode: "new" });
    expect(getPendingCaptureCount()).toBe(1);
    
    addPendingCapture({ source: "in-app", text: "Capture 2", mode: "append" });
    expect(getPendingCaptureCount()).toBe(2);
  });

  it("should check if there are pending captures", () => {
    expect(hasPendingCaptures()).toBe(false);
    
    addPendingCapture({ source: "in-app", text: "Capture 1", mode: "new" });
    expect(hasPendingCaptures()).toBe(true);
  });

  it("should enforce maximum capture count", () => {
    // Add more captures than the limit
    for (let i = 0; i < MAX_PENDING_CAPTURES + 5; i++) {
      addPendingCapture({
        source: "in-app",
        text: `Capture ${i}`,
        mode: "new"
      });
    }
    
    // Should not exceed the maximum
    const captures = getPendingCaptures();
    expect(captures.length).toBeLessThanOrEqual(MAX_PENDING_CAPTURES);
  });

  it("should enforce maximum text size", () => {
    // Add captures until we hit the text size limit
    const largeText = "x".repeat(MAX_PENDING_TEXT_SIZE / 10); // 1/10 of the limit
    for (let i = 0; i < 20; i++) {
      addPendingCapture({
        source: "in-app",
        text: largeText,
        mode: "new"
      });
    }
    
    const captures = getPendingCaptures();
    const totalTextSize = captures.reduce((sum, c) => sum + c.text.length, 0);
    expect(totalTextSize).toBeLessThanOrEqual(MAX_PENDING_TEXT_SIZE);
  });

  it("should store captures with all properties", () => {
    const capture = addPendingCapture({
      source: "deep-link",
      text: "Full capture",
      mode: "append",
      title: "Test Title",
      sourceUrl: "https://example.com",
      targetNote: "Inbox.md",
      targetFolder: "Captures",
      openAfterCommit: true
    });
    
    expect(capture.title).toBe("Test Title");
    expect(capture.sourceUrl).toBe("https://example.com");
    expect(capture.targetNote).toBe("Inbox.md");
    expect(capture.targetFolder).toBe("Captures");
    expect(capture.openAfterCommit).toBe(true);
  });

  it("should handle multiple captures", () => {
    const capture1 = addPendingCapture({ source: "in-app", text: "First", mode: "new" });
    const capture2 = addPendingCapture({ source: "deep-link", text: "Second", mode: "append" });
    
    const captures = getPendingCaptures();
    expect(captures).toHaveLength(2);
    expect(captures.some(c => c.id === capture1.id)).toBe(true);
    expect(captures.some(c => c.id === capture2.id)).toBe(true);
  });
});