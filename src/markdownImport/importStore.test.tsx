/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

const importMarkdownVault = vi.fn();
const cancelMarkdownImport = vi.fn();
vi.mock("./markdownImport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./markdownImport")>()),
  importMarkdownVault: (...args: unknown[]) => importMarkdownVault(...args),
  cancelMarkdownImport: () => cancelMarkdownImport(),
}));

import {
  IMPORT_TARGET_FOLDER,
  dismissMarkdownImport,
  markdownImportState,
  requestCancelMarkdownImport,
  startMarkdownImport,
} from "./importStore";
import { MarkdownImportDialog } from "./MarkdownImportDialog";
import type { MarkdownImportReport } from "./markdownImport";

const empty = { count: 0, items: [] };
const report: MarkdownImportReport = {
  destination: "Imported/vault",
  cancelled: false,
  totalFiles: 2,
  notesCopied: 2,
  notesConverted: 1,
  otherFilesCopied: 0,
  bytesCopied: 10,
  skipped: empty,
  renamed: {
    count: 1,
    items: [{ path: "a.md", detail: "saved as a (imported).md" }],
  },
  nonUtf8: empty,
  failed: empty,
  findings: [{ code: "callout", kind: "unsupported", count: 1, examples: [] }],
};

beforeEach(() => {
  markdownImportState.value = { phase: "idle" };
  importMarkdownVault.mockReset();
  cancelMarkdownImport.mockReset();
});
afterEach(cleanup);

describe("startMarkdownImport", () => {
  it("imports into the Imported folder, shows the report and refreshes the tree", async () => {
    importMarkdownVault.mockResolvedValue({ status: "finished", report });
    const onChanged = vi.fn();
    await expect(startMarkdownImport(onChanged)).resolves.toBe(true);
    expect(importMarkdownVault.mock.calls[0][0]).toBe(IMPORT_TARGET_FOLDER);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(markdownImportState.value).toEqual({ phase: "done", report });
  });

  it("returns to idle without refreshing when the picker was dismissed", async () => {
    importMarkdownVault.mockResolvedValue({ status: "dismissed" });
    const onChanged = vi.fn();
    await expect(startMarkdownImport(onChanged)).resolves.toBe(false);
    expect(markdownImportState.value).toEqual({ phase: "idle" });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("does not refresh when nothing was copied", async () => {
    importMarkdownVault.mockResolvedValue({
      status: "finished",
      report: { ...report, notesCopied: 0, otherFilesCopied: 0, totalFiles: 0 },
    });
    const onChanged = vi.fn();
    await startMarkdownImport(onChanged);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("surfaces a native failure as an error state, never an unhandled rejection", async () => {
    importMarkdownVault.mockRejectedValue(
      new Error("an import is already running"),
    );
    await expect(startMarkdownImport(vi.fn())).resolves.toBe(false);
    expect(markdownImportState.value).toEqual({
      phase: "error",
      message: "an import is already running",
    });
    importMarkdownVault.mockRejectedValue("plain string");
    await startMarkdownImport(vi.fn());
    expect(markdownImportState.value).toEqual({
      phase: "error",
      message: "plain string",
    });
  });

  it("keeps the report when the tree refresh throws", async () => {
    importMarkdownVault.mockResolvedValue({ status: "finished", report });
    await expect(
      startMarkdownImport(() => Promise.reject(new Error("boom"))),
    ).resolves.toBe(true);
    expect(markdownImportState.value.phase).toBe("done");
  });

  it("rejects a second start while one is running", async () => {
    let finish: (v: unknown) => void = () => {};
    importMarkdownVault.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    const first = startMarkdownImport(vi.fn());
    await expect(startMarkdownImport(vi.fn())).resolves.toBe(false);
    expect(importMarkdownVault).toHaveBeenCalledTimes(1);
    finish({ status: "dismissed" });
    await first;
  });

  it("applies progress only while running and cannot be dismissed mid-run", async () => {
    let onProgress: (p: unknown) => void = () => {};
    let finish: (v: unknown) => void = () => {};
    importMarkdownVault.mockImplementation(
      (_t: string, cb: (p: unknown) => void) => {
        onProgress = cb;
        return new Promise((resolve) => (finish = resolve));
      },
    );
    const run = startMarkdownImport(vi.fn());
    onProgress({ phase: "copying", processed: 1, total: 4, current: "a.md" });
    expect(markdownImportState.value).toMatchObject({
      phase: "running",
      progress: { processed: 1 },
    });
    dismissMarkdownImport();
    expect(markdownImportState.value.phase).toBe("running");
    finish({ status: "finished", report });
    await run;
    onProgress({ phase: "copying", processed: 9, total: 9, current: "late" });
    expect(markdownImportState.value.phase).toBe("done");
    dismissMarkdownImport();
    expect(markdownImportState.value).toEqual({ phase: "idle" });
  });
});

describe("requestCancelMarkdownImport", () => {
  it("cancels once and allows a retry when the cancel request fails", async () => {
    markdownImportState.value = {
      phase: "running",
      progress: null,
      cancelling: false,
    };
    cancelMarkdownImport.mockRejectedValueOnce(new Error("ipc"));
    await requestCancelMarkdownImport();
    expect(markdownImportState.value).toMatchObject({
      phase: "running",
      cancelling: false,
    });
    cancelMarkdownImport.mockResolvedValue(undefined);
    await requestCancelMarkdownImport();
    expect(markdownImportState.value).toMatchObject({ cancelling: true });
    await requestCancelMarkdownImport();
    expect(cancelMarkdownImport).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no import is running", async () => {
    await requestCancelMarkdownImport();
    expect(cancelMarkdownImport).not.toHaveBeenCalled();
  });
});

describe("MarkdownImportDialog", () => {
  it("renders nothing while idle", () => {
    const { container } = render(<MarkdownImportDialog />);
    expect(container.textContent).toBe("");
  });

  it("shows progress with a working Cancel button", async () => {
    markdownImportState.value = {
      phase: "running",
      cancelling: false,
      progress: {
        phase: "copying",
        processed: 3,
        total: 10,
        current: "notes/a.md",
      },
    };
    cancelMarkdownImport.mockResolvedValue(undefined);
    const { getByText, getByLabelText } = render(<MarkdownImportDialog />);
    expect(getByText("Copying 3 of 10 files")).toBeTruthy();
    expect(getByText("notes/a.md")).toBeTruthy();
    expect(getByLabelText("Import progress")).toBeTruthy();
    fireEvent.click(getByText("Cancel"));
    await vi.waitFor(() =>
      expect(cancelMarkdownImport).toHaveBeenCalledTimes(1),
    );
  });

  it("shows the report including unsupported items and renamed files", () => {
    markdownImportState.value = { phase: "done", report };
    const { getByText, container } = render(<MarkdownImportDialog />);
    expect(getByText(/2 notes copied \(1 rewritten\)/)).toBeTruthy();
    expect(container.textContent).toContain("Not supported by Leotheca");
    expect(container.textContent).toContain("Renamed to avoid overwriting (1)");
    fireEvent.click(getByText("Close"));
    expect(markdownImportState.value).toEqual({ phase: "idle" });
  });

  it("shows the error message", () => {
    markdownImportState.value = {
      phase: "error",
      message: "destination resolves outside the workspace",
    };
    const { getByRole } = render(<MarkdownImportDialog />);
    expect(getByRole("alertdialog").textContent).toContain(
      "outside the workspace",
    );
  });
});
