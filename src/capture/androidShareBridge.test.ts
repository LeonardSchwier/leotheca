/**
 * Tests for F05 Android Share Intent Bridge
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { processAndroidPendingShareData } from "./androidShareBridge";
import { getPendingCaptures, clearPendingCaptures } from "./pendingCaptures";

// Mock the tauriBridge to simulate different platforms
vi.mock("../workspace/tauriBridge", () => ({
  getPendingShareData: vi.fn(),
  hasPendingShareData: vi.fn(),
}));

describe("androidShareBridge", () => {
  beforeEach(() => {
    clearPendingCaptures();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should process pending Android share data and create pending capture", async () => {
    // Mock the bridge to return share data
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: {
        text: "Shared text content",
        title: "Shared title",
        hasSingleUri: false,
        hasMultipleUris: false
      },
      timestamp: Date.now()
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that a pending capture was created
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(1);
    
    const capture = pendingCaptures[0];
    expect(capture.source).toBe("android-share");
    expect(capture.text).toBe("Shared text content");
    expect(capture.title).toBe("Shared title");
    expect(capture.mode).toBe("new");
    expect(capture.openAfterCommit).toBe(true);
    expect(capture.status).toBe("pending");
    expect(capture.id).toBeDefined();
    expect(capture.receivedAt).toBeDefined();
  });

  it("should process pending Android share data with attachments", async () => {
    // Mock the bridge to return share data with attachments
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: {
        text: "Shared text with image",
        title: "Shared with attachment",
        hasSingleUri: false,
        hasMultipleUris: true,
        attachments: [
          {
            filePath: "/data/data/com.leonardschwier.leotheca/app_files/capture-staging/capture-20260907-abc12345-image.jpg",
            fileName: "image.jpg",
            fileSize: 102400,
            fingerprint: "102400-89abcdef01234567890abcdef01234567890",
            mimeType: "image/jpeg"
          },
          {
            filePath: "/data/data/com.leonardschwier.leotheca/app_files/capture-staging/capture-20260907-def56789-photo.png",
            fileName: "photo.png",
            fileSize: 204800,
            fingerprint: "204800 fedcba9876543210fedcba9876543210",
            mimeType: "image/png"
          }
        ]
      },
      timestamp: Date.now()
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that a pending capture was created with attachments
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(1);
    
    const capture = pendingCaptures[0];
    expect(capture.source).toBe("android-share");
    expect(capture.text).toBe("Shared text with image");
    expect(capture.title).toBe("Shared with attachment");
    expect(capture.mode).toBe("new");
    expect(capture.openAfterCommit).toBe(true);
    expect(capture.status).toBe("pending");
    expect(capture.attachments).toBeDefined();
    expect(capture.attachments).toHaveLength(2);
    
    // Verify first attachment
    const att1 = capture.attachments![0];
    expect(att1.fileName).toBe("image.jpg");
    expect(att1.fileSize).toBe(102400);
    expect(att1.mimeType).toBe("image/jpeg");
    expect(att1.fingerprint).toBe("102400-89abcdef01234567890abcdef01234567890");
    expect(att1.id).toBeDefined();
    
    // Verify second attachment
    const att2 = capture.attachments![1];
    expect(att2.fileName).toBe("photo.png");
    expect(att2.fileSize).toBe(204800);
    expect(att2.mimeType).toBe("image/png");
    expect(att2.fingerprint).toBe("204800 fedcba9876543210fedcba9876543210");
    expect(att2.id).toBeDefined();
  });

  it("should handle missing Android share data gracefully", async () => {
    // Mock the bridge to return no data
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: null,
      timestamp: 0
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that no pending capture was created
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(0);
  });

  it("should handle bridge errors gracefully on desktop", async () => {
    // Mock the bridge to throw an error (simulating desktop where method doesn't exist)
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockRejectedValue(new Error("getPendingShareData is not a function"));

    // Process the pending share data - should not throw
    await expect(processAndroidPendingShareData()).resolves.not.toThrow();

    // Check that no pending capture was created
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(0);
  });

  it("should handle partial share data with missing optional fields", async () => {
    // Mock the bridge to return partial data
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: {
        text: "Shared text only",
        title: null,
        hasSingleUri: false,
        hasMultipleUris: false
      },
      timestamp: Date.now()
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that a pending capture was created with defaults
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(1);
    
    const capture = pendingCaptures[0];
    expect(capture.text).toBe("Shared text only");
    expect(capture.title).toBeUndefined();
    expect(capture.mode).toBe("new");
    expect(capture.openAfterCommit).toBe(true);
  });

  it("should handle share data with empty attachments array", async () => {
    // Mock the bridge to return data with empty attachments
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: {
        text: "Shared text with no attachments",
        title: "No attachments",
        hasSingleUri: false,
        hasMultipleUris: false,
        attachments: []
      },
      timestamp: Date.now()
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that a pending capture was created without attachments
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(1);
    
    const capture = pendingCaptures[0];
    expect(capture.text).toBe("Shared text with no attachments");
    expect(capture.title).toBe("No attachments");
    expect(capture.attachments).toBeUndefined();
  });

  it("should handle malformed attachment data gracefully", async () => {
    // Mock the bridge to return data with malformed attachments
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: {
        text: "Shared text with malformed attachments",
        title: "Malformed attachments",
        hasSingleUri: false,
        hasMultipleUris: true,
        attachments: [
          {
            filePath: "valid-path.jpg",
            fileName: "valid.jpg",
            fileSize: 1024,
            fingerprint: "valid-fingerprint",
            mimeType: "image/jpeg"
          },
          {
            filePath: "", // Empty filePath - should be filtered out
            fileName: "invalid.jpg",
            fileSize: 1024,
            fingerprint: "invalid",
            mimeType: "image/jpeg"
          },
          {
            filePath: "another-valid.png",
            fileName: "", // Empty fileName - should be filtered out
            fileSize: 2048,
            fingerprint: "valid2",
            mimeType: "image/png"
          },
          {
            filePath: "invalid-size.jpg",
            fileName: "test.jpg",
            fileSize: -1 as unknown as number, // Invalid fileSize - should be filtered out
            fingerprint: "invalid",
            mimeType: "image/jpeg"
          }
        ]
      },
      timestamp: Date.now()
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that a pending capture was created with only valid attachments
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(1);
    
    const capture = pendingCaptures[0];
    expect(capture.text).toBe("Shared text with malformed attachments");
    expect(capture.title).toBe("Malformed attachments");
    expect(capture.attachments).toBeDefined();
    expect(capture.attachments).toHaveLength(1); // Only the first one should be valid
    
    const validAtt = capture.attachments![0];
    expect(validAtt.fileName).toBe("valid.jpg");
    expect(validAtt.fileSize).toBe(1024);
  });

  it("should handle share data with optional fields missing in attachments", async () => {
    // Mock the bridge to return data with attachments where optional fields are empty strings
    const { getPendingShareData } = await import("../workspace/tauriBridge");
    vi.mocked(getPendingShareData).mockResolvedValue({
      data: {
        text: "Shared text with minimal attachment data",
        title: "Minimal attachment data",
        hasSingleUri: false,
        hasMultipleUris: true,
        attachments: [
          {
            filePath: "/path/to/file.jpg",
            fileName: "file.jpg",
            fileSize: 1024,
            fingerprint: "", // Empty fingerprint - will be replaced with "unknown"
            mimeType: "" // Empty mimeType - will be replaced with default
          }
        ]
      },
      timestamp: Date.now()
    });

    // Process the pending share data
    await processAndroidPendingShareData();

    // Check that a pending capture was created with default values for optional fields
    const pendingCaptures = getPendingCaptures();
    expect(pendingCaptures).toHaveLength(1);
    
    const capture = pendingCaptures[0];
    expect(capture.attachments).toBeDefined();
    expect(capture.attachments).toHaveLength(1);
    
    const att = capture.attachments![0];
    expect(att.fileName).toBe("file.jpg");
    expect(att.fileSize).toBe(1024);
    expect(att.fingerprint).toBe("unknown"); // Default for missing fingerprint
    expect(att.mimeType).toBe("application/octet-stream"); // Default for missing mimeType
  });
});