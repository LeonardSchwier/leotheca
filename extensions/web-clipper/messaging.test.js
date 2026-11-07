/** @vitest-environment jsdom */
/* global document, window */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: the first version replied by returning a value from the listener
// and read the Firefox-only `browser` global. Chrome ignores a bare return
// value, so every clip failed there. These tests pin the sendResponse protocol
// and the `chrome` fallback, with a fake extension API as the boundary.

function fakeApi() {
  const listeners = { message: [], command: [] };
  return {
    listeners,
    runtime: { onMessage: { addListener: (fn) => listeners.message.push(fn) } },
    commands: {
      onCommand: { addListener: (fn) => listeners.command.push(fn) },
    },
    downloads: { download: vi.fn(async () => 1) },
    tabs: { query: vi.fn(async () => [{ id: 7 }]), sendMessage: vi.fn() },
  };
}

beforeEach(() => {
  vi.resetModules();
  delete globalThis.browser;
  document.body.innerHTML = "<h1>Title</h1><p id='p'>Hello <b>there</b></p>";
});

describe("web clipper content script messaging", () => {
  it("uses the chrome global when browser is absent and replies through sendResponse", async () => {
    const api = fakeApi();
    globalThis.chrome = api;
    await import("./clipperCore.js");
    await import("./content.js");
    expect(api.listeners.message).toHaveLength(1);

    window.getSelection().selectAllChildren(document.body);
    const sendResponse = vi.fn();
    api.listeners.message[0](
      { type: "build-clip", title: "T", includeSource: false },
      {},
      sendResponse,
    );
    expect(sendResponse).toHaveBeenCalledTimes(1);
    const reply = sendResponse.mock.calls[0][0];
    expect(reply.ok).toBe(true);
    expect(reply.clip.markdown).toContain("Hello **there**");
    expect(reply.clip.markdown).not.toContain("Source:");
    expect(reply.clip.filename).toBe("T.md");
  });

  it("reports an empty selection and ignores unrelated messages", async () => {
    const api = fakeApi();
    globalThis.chrome = api;
    await import("./clipperCore.js");
    await import("./content.js");
    window.getSelection().removeAllRanges();
    const sendResponse = vi.fn();
    api.listeners.message[0]({ type: "build-clip" }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: "Select page content before clipping.",
    });
    const other = vi.fn();
    expect(api.listeners.message[0]({ type: "other" }, {}, other)).toBe(false);
    expect(other).not.toHaveBeenCalled();
  });
});

describe("web clipper background messaging", () => {
  it("saves through the downloads API with the save dialog and answers asynchronously", async () => {
    const api = fakeApi();
    globalThis.chrome = api;
    await import("./background.js");
    const sendResponse = vi.fn();
    const keepOpen = api.listeners.message[0](
      { type: "save-clip", clip: { filename: "A.md", markdown: "# A\n" } },
      {},
      sendResponse,
    );
    expect(keepOpen).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: true }),
    );
    expect(api.downloads.download).toHaveBeenCalledWith({
      url: "data:text/markdown;charset=utf-8,%23%20A%0A",
      filename: "A.md",
      saveAs: true,
    });
  });

  it("returns the failure instead of throwing when the download is refused", async () => {
    const api = fakeApi();
    api.downloads.download.mockRejectedValue(new Error("blocked"));
    globalThis.chrome = api;
    await import("./background.js");
    const sendResponse = vi.fn();
    api.listeners.message[0](
      { type: "save-clip", clip: { filename: "A.md", markdown: "x" } },
      {},
      sendResponse,
    );
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "blocked",
      }),
    );
  });

  it("the keyboard command clips the active tab and does not reject on a page without the content script", async () => {
    const api = fakeApi();
    globalThis.chrome = api;
    await import("./background.js");
    api.tabs.sendMessage.mockResolvedValueOnce({
      ok: true,
      clip: { filename: "K.md", markdown: "k" },
    });
    await api.listeners.command[0]("clip-selection");
    expect(api.downloads.download).toHaveBeenCalledTimes(1);
    api.tabs.sendMessage.mockRejectedValueOnce(
      new Error("Receiving end does not exist."),
    );
    await expect(
      api.listeners.command[0]("clip-selection"),
    ).resolves.toBeUndefined();
    expect(api.downloads.download).toHaveBeenCalledTimes(1);
  });
});
