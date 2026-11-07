import { readTextFile } from "../workspace/tauriBridge";
import { isPathWithinWorkspace, resolvePath } from "../workspace/paths";

/**
 * Loads and applies the user's custom CSS file to the app's UI.
 *
 * The CSS file must live inside the workspace (enforced by
 * isPathWithinWorkspace) to prevent escaping to system locations. A
 * missing file is not an error; the app simply applies no custom CSS.
 *
 * The CSS is injected as a <style> tag with a fixed ID so it can be
 * removed or replaced when the setting changes. It's appended to
 * document.head, after all bundled styles, so it can override any
 * CSS variable or class the app uses.
 *
 * This is a deliberately small, safe step: user-authored CSS only,
 * no JavaScript, no third-party code execution.
 */

const CUSTOM_CSS_STYLE_ID = "leotheca-custom-css";

/**
 * Loads the custom CSS file from the workspace and injects it into the
 * DOM. Returns true if the CSS was applied, false if the file was missing
 * or unreadable.
 *
 * @param workspacePath The absolute path to the workspace root.
 * @param customCssPath The relative path to the CSS file (e.g. ".leotheca/custom.css").
 * @returns true if the CSS was successfully applied, false otherwise.
 */
export async function applyCustomCss(
  workspacePath: string,
  customCssPath: string,
): Promise<boolean> {
  // The path may be relative (e.g. `.leotheca/custom.css` stored as a
  // workspace-relative default) or absolute. `isPathWithinWorkspace`
  // requires an absolute path because `splitAbsolutePath` only recognises
  // `/` or `C:\` prefixes — a relative path silently fails the workspace
  // check. Resolve before validating.
  const absolutePath = resolvePath(customCssPath, workspacePath);
  if (!isPathWithinWorkspace(absolutePath, workspacePath)) {
    return false;
  }

  const fullPath = absolutePath;

  let css: string;
  try {
    css = await readTextFile(fullPath);
  } catch {
    // Missing or unreadable file: not an error, just no custom CSS.
    return false;
  }

  if (!css.trim()) {
    return false;
  }

  // Remove any existing custom CSS style tag.
  const existing = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (existing) {
    existing.remove();
  }

  // Inject the new CSS.
  const style = document.createElement("style");
  style.id = CUSTOM_CSS_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);

  return true;
}

/**
 * Removes the custom CSS from the DOM (when the setting is disabled or
 * the workspace is closed).
 */
export function removeCustomCss(): void {
  const existing = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (existing) {
    existing.remove();
  }
}
