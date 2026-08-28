/* global browser, document, location, window */

function selectedFragment() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return selection.getRangeAt(0).cloneContents();
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "build-clip") return undefined;
  const fragment = selectedFragment();
  if (!fragment) return { ok: false, error: "Select page content before clipping." };

  try {
    return {
      ok: true,
      clip: globalThis.LeothecaClipperCore.buildClip({
        title: message.title || document.title,
        fragment,
        sourceUrl: location.href,
        includeSource: message.includeSource !== false,
      }),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create a clip." };
  }
});
