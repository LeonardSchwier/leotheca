import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndOpen } from "./quickCreate";

describe("createAndOpen", () => {
  // jsdom never fires a window "unhandledrejection" event, so listen where
  // Node reports it: a rejection nobody handled.
  const unhandled = vi.fn();

  beforeEach(() => {
    unhandled.mockClear();
    process.on("unhandledRejection", unhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", unhandled);
  });

  async function settle() {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }

  it("creates, then opens the new file, and reports nothing", async () => {
    const create = vi.fn(async () => ({
      path: "/v/Untitled.md",
      name: "Untitled.md",
    }));
    const open = vi.fn(async () => {});
    const report = vi.fn();

    await expect(createAndOpen("note", create, open, report)).resolves.toBe(
      true,
    );

    expect(open).toHaveBeenCalledWith("/v/Untitled.md", "Untitled.md");
    expect(report).not.toHaveBeenCalled();
  });

  it("reports a failed create once, names the kind and the reason, and never opens", async () => {
    const create = vi.fn(async () => {
      throw new Error("EACCES: permission denied");
    });
    const open = vi.fn();
    const report = vi.fn();

    await expect(createAndOpen("canvas", create, open, report)).resolves.toBe(
      false,
    );
    await settle();

    expect(open).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      "Couldn't create the new canvas: EACCES: permission denied",
    );
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("reports a rejection that is not an Error by its string form", async () => {
    const report = vi.fn();
    await createAndOpen(
      "drawing",
      () => Promise.reject("disk full"),
      vi.fn(),
      report,
    );
    expect(report).toHaveBeenCalledWith(
      "Couldn't create the new drawing: disk full",
    );
  });

  it("reports a synchronous throw from create", async () => {
    const report = vi.fn();
    await createAndOpen(
      "note",
      () => {
        throw new Error("No workspace is open");
      },
      vi.fn(),
      report,
    );
    expect(report).toHaveBeenCalledWith(
      "Couldn't create the new note: No workspace is open",
    );
  });

  it("tells the user the file exists when only the open fails", async () => {
    const create = async () => ({
      path: "/v/Untitled 2.md",
      name: "Untitled 2.md",
    });
    const open = vi.fn(async () => {
      throw new Error("file vanished");
    });
    const report = vi.fn();

    await expect(createAndOpen("note", create, open, report)).resolves.toBe(
      false,
    );
    await settle();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      'Created "Untitled 2.md" but couldn\'t open it: file vanished',
    );
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("reports a synchronous throw from open the same way", async () => {
    const report = vi.fn();
    await createAndOpen(
      "note",
      async () => ({ path: "/v/a.md", name: "a.md" }),
      () => {
        throw new Error("boom");
      },
      report,
    );
    expect(report).toHaveBeenCalledWith(
      'Created "a.md" but couldn\'t open it: boom',
    );
  });

  it("does not reject when the reporter itself throws", async () => {
    const report = vi.fn(() => {
      throw new Error("alert is not available");
    });
    await expect(
      createAndOpen(
        "note",
        () => Promise.reject(new Error("x")),
        vi.fn(),
        report,
      ),
    ).resolves.toBe(false);
    await settle();
    expect(unhandled).not.toHaveBeenCalled();
  });
});
