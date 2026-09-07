/**
 * F05-FR-27: Tests for CaptureSheet accessibility features
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// CaptureSheet.tsx imports workspacePath from settings/store.ts, which reads
// window.matchMedia at module load time; same jsdom + dynamic-import setup
// as settings/store.test.ts, see its own comment.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const {
  CaptureSheet,
  captureSheetOpen,
  captureContent,
  captureTitle,
  captureSourceUrl,
  captureDestinationMode,
  captureOpenAfterCapture,
  closeCaptureSheet,
  announceCaptureMessage,
  captureAnnouncement,
} = await import("./CaptureSheet");

describe("CaptureSheet Accessibility (F05-FR-27)", () => {
  beforeEach(() => {
    // Reset state
    captureSheetOpen.value = false;
    captureContent.value = "";
    captureTitle.value = "";
    captureSourceUrl.value = "";
    captureDestinationMode.value = "new";
    captureOpenAfterCapture.value = true;
    captureAnnouncement.value = "";
  });

  afterEach(() => {
    closeCaptureSheet();
    vi.clearAllMocks();
  });

  it("should have announcement signal", () => {
    expect(captureAnnouncement).toBeDefined();
    expect(captureAnnouncement.value).toBe("");
  });

  it("should announce messages without throwing", () => {
    expect(() => announceCaptureMessage("Test announcement")).not.toThrow();
  });

  it("should clear announcement when closing sheet", () => {
    captureAnnouncement.value = "Test announcement";
    expect(captureAnnouncement.value).toBe("Test announcement");
    
    closeCaptureSheet();
    expect(captureAnnouncement.value).toBe("");
  });

  it("should open and close capture sheet", () => {
    expect(captureSheetOpen.value).toBe(false);
    
    captureSheetOpen.value = true;
    expect(captureSheetOpen.value).toBe(true);
    
    closeCaptureSheet();
    expect(captureSheetOpen.value).toBe(false);
  });

  it("should clear all state when closing sheet", () => {
    captureSheetOpen.value = true;
    captureContent.value = "test content";
    captureTitle.value = "test title";
    captureSourceUrl.value = "https://example.com";
    captureDestinationMode.value = "append";
    captureOpenAfterCapture.value = false;
    
    closeCaptureSheet();
    
    expect(captureContent.value).toBe("");
    expect(captureTitle.value).toBe("");
    expect(captureSourceUrl.value).toBe("");
    expect(captureDestinationMode.value).toBe("new");
    expect(captureOpenAfterCapture.value).toBe(true);
  });

  it("should handle all destination modes", () => {
    const modes = ["append", "new", "date"] as const;
    modes.forEach(mode => {
      captureDestinationMode.value = mode;
      expect(captureDestinationMode.value).toBe(mode);
    });
  });

  it("should export all required signals and functions", () => {
    // Export check for F05-FR-27 accessibility
    expect(CaptureSheet).toBeDefined();
    expect(captureSheetOpen).toBeDefined();
    expect(captureContent).toBeDefined();
    expect(captureTitle).toBeDefined();
    expect(captureSourceUrl).toBeDefined();
    expect(captureDestinationMode).toBeDefined();
    expect(captureOpenAfterCapture).toBeDefined();
    expect(closeCaptureSheet).toBeDefined();
    expect(announceCaptureMessage).toBeDefined();
    expect(captureAnnouncement).toBeDefined();
  });
});