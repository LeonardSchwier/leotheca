/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const unlisten = vi.fn();
let progressHandler: ((event: { payload: unknown }) => void) | null = null;
const listen = vi.fn(
  async (_name: string, handler: (event: { payload: unknown }) => void) => {
    progressHandler = handler;
    return unlisten;
  },
);
let native = false;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: Parameters<typeof listen>) => listen(...args),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native } }));

import {
  FINDING_TEXT,
  formatBytes,
  formatImportReport,
  importMarkdownVault,
  cancelMarkdownImport,
  isMarkdownImportOffered,
  isMarkdownImportSupported,
  type MarkdownImportReport,
} from "./markdownImport";

const empty = { count: 0, items: [] };
function report(
  overrides: Partial<MarkdownImportReport> = {},
): MarkdownImportReport {
  return {
    destination: "Imported/vault",
    cancelled: false,
    totalFiles: 3,
    notesCopied: 2,
    notesConverted: 1,
    otherFilesCopied: 1,
    bytesCopied: 2048,
    skipped: empty,
    renamed: empty,
    nonUtf8: empty,
    failed: empty,
    findings: [],
    ...overrides,
  };
}

beforeEach(() => {
  native = false;
  progressHandler = null;
  invoke.mockReset();
  listen.mockClear();
  unlisten.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("importMarkdownVault", () => {
  it("is a clean no-op on Android: nothing is invoked or listened to", async () => {
    native = true;
    expect(isMarkdownImportSupported()).toBe(false);
    await expect(importMarkdownVault("Imported", vi.fn())).resolves.toEqual({
      status: "unsupported",
    });
    await expect(cancelMarkdownImport()).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it("passes only the target folder (never a source path) and forwards progress", async () => {
    invoke.mockImplementation(async () => {
      progressHandler?.({
        payload: { phase: "copying", processed: 1, total: 2, current: "a.md" },
      });
      return report();
    });
    const onProgress = vi.fn();
    const outcome = await importMarkdownVault("Imported", onProgress);
    expect(invoke).toHaveBeenCalledWith("import_markdown_vault", {
      targetFolder: "Imported",
    });
    expect(onProgress).toHaveBeenCalledWith({
      phase: "copying",
      processed: 1,
      total: 2,
      current: "a.md",
    });
    expect(outcome.status).toBe("finished");
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("reports a dismissed folder picker (null) as dismissed", async () => {
    invoke.mockResolvedValue(null);
    await expect(importMarkdownVault("Imported", vi.fn())).resolves.toEqual({
      status: "dismissed",
    });
  });

  it("removes the progress listener when the native call rejects", async () => {
    invoke.mockRejectedValue(
      new Error("destination resolves outside the workspace"),
    );
    await expect(importMarkdownVault("Imported", vi.fn())).rejects.toThrow(
      "outside the workspace",
    );
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("cancel invokes the native cancel command", async () => {
    invoke.mockResolvedValue(undefined);
    await cancelMarkdownImport();
    expect(invoke).toHaveBeenCalledWith("cancel_markdown_import");
  });
});

describe("isMarkdownImportOffered", () => {
  it("needs a workspace, the setting on, and a desktop platform", () => {
    expect(isMarkdownImportOffered(true, true)).toBe(true);
    expect(isMarkdownImportOffered(false, true)).toBe(false);
    expect(isMarkdownImportOffered(true, false)).toBe(false);
    native = true;
    expect(isMarkdownImportOffered(true, true)).toBe(false);
  });
});

describe("formatImportReport", () => {
  it("formats bytes", () => {
    expect(formatBytes(10)).toBe("10 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("states totals, caps, and groups findings with a plain explanation", () => {
    const text = formatImportReport(
      report({
        failed: {
          count: 150,
          items: [{ path: "x.md", detail: "cannot read" }],
        },
        findings: [
          {
            code: "callout",
            kind: "unsupported",
            count: 2,
            examples: [{ path: "a.md", detail: "> [!note]" }],
          },
          { code: "comment", kind: "converted", count: 1, examples: [] },
          { code: "alias-link", kind: "preserved", count: 4, examples: [] },
          { code: "future-code", kind: "preserved", count: 1, examples: [] },
        ],
      }),
    );
    expect(text).toContain("Import finished.");
    expect(text).toContain(
      "Notes copied: 2 (1 rewritten). Other files copied: 1. Total: 2.0 KB.",
    );
    expect(text).toContain("Failed, not copied (150)");
    expect(text).toContain("...and 149 more not listed");
    expect(text.indexOf("Not supported by Leotheca")).toBeLessThan(
      text.indexOf("Rewritten"),
    );
    expect(text).toContain(FINDING_TEXT.callout.label);
    expect(text).toContain("future-code: 1.");
  });

  it("says when a run was cancelled", () => {
    expect(formatImportReport(report({ cancelled: true }))).toContain(
      "Import cancelled. Files already copied were kept.",
    );
  });
});
