/**
 * F05-FR-27: Tests for CaptureSheet accessibility features
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

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

// UX-01 spec sections 20/24.5: CaptureSheet now renders inside the shared
// Sheet primitive rather than a bespoke modal, so it inherits Sheet's
// modal semantics (title labeling, Escape/backdrop dismissal, initial
// focus, scroll lock, focus restoration) instead of reimplementing them.
describe("CaptureSheet Sheet-primitive integration", () => {
  beforeEach(() => {
    captureSheetOpen.value = false;
    captureContent.value = "";
    captureTitle.value = "";
    captureSourceUrl.value = "";
    captureDestinationMode.value = "new";
    captureOpenAfterCapture.value = true;
    captureAnnouncement.value = "";
  });

  afterEach(() => {
    cleanup();
    closeCaptureSheet();
    document.body.style.overflow = "";
  });

  it("renders nothing when closed", () => {
    const { container } = render(<CaptureSheet />);
    expect(container.firstChild).toBeNull();
  });

  it("renders as a labeled Sheet dialog once open, with focus on the capture textarea", () => {
    captureSheetOpen.value = true;
    const { getByRole } = render(<CaptureSheet />);
    const sheet = getByRole("dialog", { name: "Quick Capture" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      sheet.querySelector("#capture-content"),
    );
  });

  it("closes on Escape, the shared Sheet primitive's own dismissal path", () => {
    captureSheetOpen.value = true;
    render(<CaptureSheet />);
    expect(captureSheetOpen.value).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(captureSheetOpen.value).toBe(false);
  });

  it("closes when the Cancel action is pressed", () => {
    captureSheetOpen.value = true;
    const { getByText } = render(<CaptureSheet />);
    fireEvent.click(getByText("Cancel"));
    expect(captureSheetOpen.value).toBe(false);
  });

  it("restores focus to the opener once dismissed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    captureSheetOpen.value = true;
    render(<CaptureSheet />);
    expect(document.activeElement).not.toBe(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});