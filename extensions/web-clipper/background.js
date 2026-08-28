/* global browser */

function browserApi() {
  return browser;
}

async function saveClip(clip) {
  const api = browserApi();
  await api.downloads.download({
    url: `data:text/markdown;charset=utf-8,${encodeURIComponent(clip.markdown)}`,
    filename: clip.filename,
    saveAs: true,
  });
}

browserApi().runtime.onMessage.addListener(async (message) => {
  if (message?.type !== "save-clip") return undefined;
  try {
    await saveClip(message.clip);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the Markdown file." };
  }
});

browserApi().commands.onCommand.addListener(async (command) => {
  if (command !== "clip-selection") return;
  const [tab] = await browserApi().tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const result = await browserApi().tabs.sendMessage(tab.id, { type: "build-clip" });
  if (result?.ok) await saveClip(result.clip);
});
