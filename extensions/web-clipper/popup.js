/* global browser, document */

const api = browser;
const titleInput = document.querySelector("#title");
const includeSourceInput = document.querySelector("#include-source");
const clipButton = document.querySelector("#clip");
const status = document.querySelector("#status");

function showStatus(message, isError = true) {
  status.textContent = message;
  status.style.color = isError ? "#8b2424" : "#28633a";
}

async function clipSelection() {
  clipButton.disabled = true;
  showStatus("Creating Markdown file...", false);
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active page is available to clip.");
    const built = await api.tabs.sendMessage(tab.id, {
      type: "build-clip",
      title: titleInput.value,
      includeSource: includeSourceInput.checked,
    });
    if (!built?.ok) throw new Error(built?.error || "Could not create a clip.");

    const saved = await api.runtime.sendMessage({ type: "save-clip", clip: built.clip });
    if (!saved?.ok) throw new Error(saved?.error || "Could not save the Markdown file.");
    showStatus("Choose your workspace folder in the save dialog.", false);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Could not save the Markdown file.");
  } finally {
    clipButton.disabled = false;
  }
}

clipButton.addEventListener("click", () => void clipSelection());
