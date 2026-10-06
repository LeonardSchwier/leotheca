/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";

/**
 * Tests for src/lib/platform.ts.
 *
 * The key invariant under test: isAndroid, isIOS, and isMobile each evaluate
 * their underlying signal (Capacitor.isNativePlatform + getPlatform, or
 * navigator.userAgent) at most once per process and cache the result.
 * isAndroid already does this; isIOS and isMobile currently do not.
 */

type PlatformState = {
  isNative: boolean;
  platform: string;
  userAgent: string;
};

function mockCapacitor(state: PlatformState) {
  vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(state.isNative);
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue(state.platform as ReturnType<typeof Capacitor.getPlatform>);
  Object.defineProperty(navigator, "userAgent", {
    value: state.userAgent,
    writable: true,
    configurable: true,
  });
}

describe("platform detection (value correctness)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("isAndroid: true when Capacitor native + platform=android", async () => {
    mockCapacitor({ isNative: true, platform: "android", userAgent: "" });
    const { isAndroid } = await import("./platform");
    expect(isAndroid()).toBe(true);
  });

  it("isAndroid: true when userAgent contains Android", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "Android" });
    const { isAndroid } = await import("./platform");
    expect(isAndroid()).toBe(true);
  });

  it("isAndroid: false on iOS", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPhone" });
    const { isAndroid } = await import("./platform");
    expect(isAndroid()).toBe(false);
  });

  it("isIOS: true when Capacitor native + platform=ios", async () => {
    mockCapacitor({ isNative: true, platform: "ios", userAgent: "" });
    const { isIOS } = await import("./platform");
    expect(isIOS()).toBe(true);
  });

  it("isIOS: true for iPhone userAgent", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPhone" });
    const { isIOS } = await import("./platform");
    expect(isIOS()).toBe(true);
  });

  it("isIOS: true for iPad userAgent", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPad" });
    const { isIOS } = await import("./platform");
    expect(isIOS()).toBe(true);
  });

  it("isIOS: true for iPod userAgent", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPod" });
    const { isIOS } = await import("./platform");
    expect(isIOS()).toBe(true);
  });

  it("isIOS: false on Android", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "Android" });
    const { isIOS } = await import("./platform");
    expect(isIOS()).toBe(false);
  });

  it("isMobile: true on iPhone", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPhone" });
    const { isMobile } = await import("./platform");
    expect(isMobile()).toBe(true);
  });

  it("isMobile: true on Android", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "Android" });
    const { isMobile } = await import("./platform");
    expect(isMobile()).toBe(true);
  });

  it("isMobile: false on desktop Windows", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "Windows NT 10" });
    const { isMobile } = await import("./platform");
    expect(isMobile()).toBe(false);
  });
});

describe("platform detection (caching invariant)", () => {
  /**
   * The core test: after the first call to isAndroid/isIOS, subsequent calls
   * must NOT re-evaluate Capacitor.isNativePlatform or navigator.userAgent.
   * This is the invariant that isAndroid already upholds and that isIOS
   * currently violates.
   */
  it("isIOS does not re-evaluate Capacitor after first call", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPhone" });
    const mod = await import("./platform");
    // Warm the cache
    mod.isIOS();
    // Now spy on the underlying signal and verify no further calls
    const spy = vi.spyOn(Capacitor, "isNativePlatform");
    spy.mockClear();
    mod.isIOS();
    mod.isIOS();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("isMobile does not re-evaluate after isAndroid+isIOS are cached", async () => {
    mockCapacitor({ isNative: false, platform: "web", userAgent: "iPhone" });
    const mod = await import("./platform");
    // Warm both caches
    mod.isAndroid();
    mod.isIOS();
    // Now verify isMobile doesn't trigger new evaluations
    const spy = vi.spyOn(Capacitor, "isNativePlatform");
    spy.mockClear();
    mod.isMobile();
    mod.isMobile();
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
