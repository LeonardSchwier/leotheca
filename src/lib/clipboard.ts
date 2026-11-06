/**
 * Writes text to the clipboard without ever rejecting. The Clipboard API
 * rejects for a denied permission, an unfocused document or a restrictive
 * WebView, and is missing entirely in some insecure contexts; fire-and-forget
 * call sites (`void navigator.clipboard.writeText(...)`) turned each of those
 * into an unhandled promise rejection. Resolves true when the write succeeded.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
