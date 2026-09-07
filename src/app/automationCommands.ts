/** The custom URL scheme this app registers for local inter-application
 * automation (see `src-tauri/tauri.conf.json`'s plugins.deep-link config
 * and ROADMAP.md's "Local Automation Commands" item): an OS-level tool (a
 * Shortcuts action, a shell script, a launcher) can trigger these without
 * this app ever making a network call itself, since dispatch happens
 * entirely through the OS's own URL-scheme mechanism, not a server. */
const SCHEME = "leotheca:";

export type AutomationCommand =
  | { kind: "read-current-note" }
  | { kind: "open-favorites" }
  | { kind: "new-note"; content: string }
  | { kind: "capture"; text: string; title?: string; url?: string; mode?: "append" | "new" | "date"; profile?: string; open?: boolean };

/** Parses an incoming leotheca:// URL into a typed command, or null for
 * anything not recognized (a different scheme, an unknown command, or a
 * malformed URL) rather than throwing: a URL this app didn't ask to be
 * launched with (a stray argv entry, a future OS quirk) should be quietly
 * ignored by the caller, not crash the handler that calls this. */
export function parseAutomationUrl(url: string): AutomationCommand | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== SCHEME) return null;
  switch (parsed.hostname) {
    case "read-current-note":
      return { kind: "read-current-note" };
    case "new-note":
      return { kind: "new-note", content: parsed.searchParams.get("content") ?? "" };
    case "open-favorites":
      return { kind: "open-favorites" };
    case "capture": {
      // F05: Support text, title, url, mode, profile, open parameters
      const text = parsed.searchParams.get("text") ?? parsed.searchParams.get("content") ?? "";
      const title = parsed.searchParams.get("title");
      const url = parsed.searchParams.get("url");
      const mode = parsed.searchParams.get("mode") as "append" | "new" | "date" | null;
      const profile = parsed.searchParams.get("profile");
      const open = parsed.searchParams.get("open") === "true";
      
      // F05-FR-02/F05-FR-06: Validate payload size (32 KiB limit for text+title+url)
      const payloadSize = (text.length + (title?.length ?? 0) + (url?.length ?? 0));
      const MAX_CAPTURE_PAYLOAD_SIZE = 32 * 1024; // 32 KiB
      if (payloadSize > MAX_CAPTURE_PAYLOAD_SIZE) {
        console.warn(`F05: Capture payload size (${payloadSize}) exceeds 32 KiB limit`);
        return null; // Reject oversized payload
      }
      
      return {
        kind: "capture",
        text,
        ...(title && { title }),
        ...(url && { url }),
        ...(mode && { mode }),
        ...(profile && { profile }),
        ...(open && { open })
      };
    }
    default:
      return null;
  }
}
