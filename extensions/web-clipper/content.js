/* global document, location, window */

// Firefox exposes `browser`; Chrome exposes `chrome` (and `browser` only in recent versions).
const api = globalThis.browser ?? globalThis.chrome;

function selectedFragment() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null;
  return selection.getRangeAt(0).cloneContents();
}

// Reply synchronously through sendResponse: a bare return value is ignored by
// Chrome, and a Promise is not accepted by every Chrome version.
api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "build-clip") return false;
  sendResponse(buildResponse(message));
  return false;
});

function buildResponse(message) {
  const fragment = selectedFragment();
  if (!fragment)
    return { ok: false, error: "Select page content before clipping." };

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
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not create a clip.",
    };
  }
}
