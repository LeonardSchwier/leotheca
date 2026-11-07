// Firefox exposes `browser`; Chrome exposes `chrome` (and `browser` only in recent versions).
const api = globalThis.browser ?? globalThis.chrome;

async function saveClip(clip) {
  await api.downloads.download({
    url: `data:text/markdown;charset=utf-8,${encodeURIComponent(clip.markdown)}`,
    filename: clip.filename,
    saveAs: true,
  });
}

// Answer through sendResponse and return true (async reply): a Promise return
// value is not understood by every Chrome version.
api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "save-clip") return false;
  saveClip(message.clip).then(
    () => sendResponse({ ok: true }),
    (error) =>
      sendResponse({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not save the Markdown file.",
      }),
  );
  return true;
});

api.commands.onCommand.addListener(async (command) => {
  if (command !== "clip-selection") return;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const result = await api.tabs.sendMessage(tab.id, { type: "build-clip" });
    if (result?.ok) await saveClip(result.clip);
  } catch {
    // The active page may not accept content scripts (browser pages, the store).
    // There is no UI on a keyboard shortcut, so there is nothing to report to.
  }
});
