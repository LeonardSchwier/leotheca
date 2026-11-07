import { describe, expect, it } from "vitest";
import {
  MARKDOWN_ASSOCIATION,
  defaultHandlerForPlatform,
  detectPlatform,
} from "./defaultHandler";

describe("detectPlatform", () => {
  it("recognizes Capacitor platform values (ios / android)", () => {
    expect(detectPlatform("ios")).toBe("macos");
    expect(detectPlatform("android")).toBe("android");
  });

  it("recognizes Windows user-agent strings", () => {
    expect(detectPlatform("Windows NT 10.0; Win64; x64")).toBe("windows");
    expect(detectPlatform("WINDOWS")).toBe("windows");
  });

  it("recognizes macOS and iPad user-agent strings", () => {
    expect(detectPlatform("Macintosh; Intel Mac OS X 10_15_7")).toBe("macos");
    expect(detectPlatform("iPad; CPU OS 17_0")).toBe("macos");
  });

  it("recognizes Linux user-agent strings", () => {
    expect(detectPlatform("X11; Linux x86_64")).toBe("linux");
    expect(detectPlatform("Ubuntu; Linux")).toBe("linux");
  });

  it("returns 'other' for anything unrecognized (never throws)", () => {
    expect(detectPlatform("totally-unknown-platform-9.9")).toBe("other");
    expect(detectPlatform("")).toBe("other");
  });
});

describe("defaultHandlerForPlatform", () => {
  const allPlatforms = [
    "windows",
    "macos",
    "linux",
    "ios",
    "android",
    "other",
  ] as const;

  it("is total: every platform returns a non-empty contract", () => {
    for (const platform of allPlatforms) {
      const contract = defaultHandlerForPlatform(platform);
      expect(contract.platform).toBe(platform);
      expect(contract.steps.length).toBeGreaterThan(0);
      for (const step of contract.steps) {
        expect(step.target.length).toBeGreaterThan(0);
        expect(step.summary.length).toBeGreaterThan(0);
      }
    }
  });

  it("always advertises the bundled .md association", () => {
    for (const platform of allPlatforms) {
      expect(defaultHandlerForPlatform(platform).association).toEqual(
        MARKDOWN_ASSOCIATION,
      );
    }
  });

  it("marks desktop default-app platforms as settable", () => {
    expect(defaultHandlerForPlatform("windows").isSettable).toBe(true);
    expect(defaultHandlerForPlatform("macos").isSettable).toBe(true);
    expect(defaultHandlerForPlatform("linux").isSettable).toBe(true);
  });

  it("marks mobile and unknown platforms as not settable (instructions only)", () => {
    expect(defaultHandlerForPlatform("ios").isSettable).toBe(false);
    expect(defaultHandlerForPlatform("android").isSettable).toBe(false);
    expect(defaultHandlerForPlatform("other").isSettable).toBe(false);
  });

  it("openWithTarget is always the first step's target (single source of truth)", () => {
    for (const platform of allPlatforms) {
      const contract = defaultHandlerForPlatform(platform);
      expect(contract.openWithTarget).toBe(contract.steps[0].target);
    }
  });
});

describe("bundled .md association matches tauri.conf.json", () => {
  it("has the exact values the Tauri bundle registers", () => {
    expect(MARKDOWN_ASSOCIATION.ext).toBe("md");
    expect(MARKDOWN_ASSOCIATION.description).toBe("Markdown Document");
    expect(MARKDOWN_ASSOCIATION.mimeType).toBe("text/markdown");
    expect(MARKDOWN_ASSOCIATION.role).toBe("Editor");
  });
});
