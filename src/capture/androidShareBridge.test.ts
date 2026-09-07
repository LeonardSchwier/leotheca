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
});