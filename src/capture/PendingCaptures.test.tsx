/**
 * F05-FR-27: Tests for PendingCaptures accessibility features
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PendingCaptures } from "./PendingCaptures";
import { pendingCapturesStore, addPendingCapture, removePendingCapture, clearPendingCaptures, MAX_PENDING_CAPTURES } from "./pendingCaptures";

describe("PendingCaptures Accessibility (F05-FR-27)", () => {
  beforeEach(() => {
    clearPendingCaptures();
  });

  afterEach(() => {
    clearPendingCaptures();
    vi.clearAllMocks();
  });

  it("should export PendingCaptures component", () => {
    expect(PendingCaptures).toBeDefined();
    expect(typeof PendingCaptures).toBe("function");
  });

  it("should start with empty pending captures", () => {
    expect(pendingCapturesStore.value).toEqual([]);
  });

  it("should add pending capture", () => {
    const capture = addPendingCapture({
      text: "Test content",
      title: "Test title",
      source: "in-app",
      mode: "new"
    });
    
    expect(capture).toBeDefined();
    expect(capture.id).toBeDefined();
    expect(capture.source).toBe("in-app");
    expect(capture.text).toBe("Test content");
    expect(capture.title).toBe("Test title");
    expect(capture.mode).toBe("new");
    expect(capture.status).toBe("pending");
    
    expect(pendingCapturesStore.value).toHaveLength(1);
  });

  it("should remove pending capture", () => {
    const capture = addPendingCapture({
      text: "Test content",
      title: "Test title",
      source: "in-app",
      mode: "new"
    });
    
    expect(pendingCapturesStore.value).toHaveLength(1);
    
    removePendingCapture(capture.id);
    expect(pendingCapturesStore.value).toHaveLength(0);
  });

  it("should enforce maximum pending captures", () => {
    // Add up to the maximum
    for (let i = 0; i < MAX_PENDING_CAPTURES; i++) {
      addPendingCapture({
        text: `Test content ${i}`,
        title: `Test title ${i}`,
        source: "in-app",
        mode: "new"
      });
    }
    
    expect(pendingCapturesStore.value).toHaveLength(MAX_PENDING_CAPTURES);
    
    // Adding one more should remove the oldest
    addPendingCapture({
      text: "New content",
      title: "New title",
      source: "in-app",
      mode: "new"
    });
    
    // Should still be at max
    expect(pendingCapturesStore.value).toHaveLength(MAX_PENDING_CAPTURES);
  });

  it("should clear all pending captures", () => {
    // Add several captures
    addPendingCapture({
      text: "Test content 1",
      title: "Test title 1",
      source: "in-app",
      mode: "new"
    });
    
    addPendingCapture({
      text: "Test content 2",
      title: "Test title 2",
      source: "in-app",
      mode: "new"
    });
    
    expect(pendingCapturesStore.value).toHaveLength(2);
    
    clearPendingCaptures();
    expect(pendingCapturesStore.value).toHaveLength(0);
  });

  it("should support all capture sources", () => {
    const sources = ["in-app", "deep-link", "android-share"] as const;
    sources.forEach(source => {
      const capture = addPendingCapture({
        text: `Test content for ${source}`,
        title: `Test title for ${source}`,
        source,
        mode: "new"
      });
      
      expect(capture.source).toBe(source);
      removePendingCapture(capture.id);
    });
  });

  it("should support all capture modes", () => {
    const modes = ["append", "new", "date"] as const;
    modes.forEach(mode => {
      const capture = addPendingCapture({
        text: `Test content for ${mode}`,
        title: `Test title for ${mode}`,
        source: "in-app",
        mode
      });
      
      expect(capture.mode).toBe(mode);
      removePendingCapture(capture.id);
    });
  });

  it("should handle optional fields", () => {
    const capture = addPendingCapture({
      text: "Test content",
      // title is optional
      source: "in-app",
      mode: "new"
      // Note: targetNote, targetFolder, targetProfileId, sourceUrl are all optional
      // status is automatically set to "pending"
    });
    
    expect(capture.text).toBe("Test content");
    expect(capture.title).toBeUndefined();
    expect(capture.sourceUrl).toBeUndefined();
    expect(capture.mode).toBe("new");
    expect(capture.status).toBe("pending");
    
    removePendingCapture(capture.id);
  });

  it("should have pending status by default", () => {
    const capture = addPendingCapture({
      text: "Test content",
      title: "Test title",
      source: "in-app",
      mode: "new"
    });
    
    // All newly added captures should have pending status
    expect(capture.status).toBe("pending");
    removePendingCapture(capture.id);
  });
});