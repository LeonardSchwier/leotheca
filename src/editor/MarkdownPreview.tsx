import { useEffect, useMemo, useRef } from "preact/hooks";
import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { fileNameFromPath, resolveWikilink } from "../linking/store";
import { parseWikiLinks, type WikiLinkRecord } from "../linking/wikiSyntax";
import { resolveHeadingFragment, resolveWikiLinkTarget } from "../linking/wikiResolver";
import { scanHeadings, type HeadingRecord } from "../markdown/headings";
import { requestOutlineReveal } from "../outline/outlineNavigation";
import { workspacePath } from "../settings/store";
import { dirname, resolvePathWithinWorkspace } from "../workspace/paths";
import { fileSrc } from "../workspace/tauriBridge";
import "../linking/linking.css";

marked.setOptions({ gfm: true, breaks: false });

/**
 * $inline$ and $$block$$ LaTeX math, rendered with KaTeX (a pure
 * client-side renderer with its own bundled fonts, no CDN or network
 * fetch involved, required by CONSTITUTION.md's "Offline by design"
 * rule). Registered as marked extensions rather than a raw text
 * pre-processing pass (compare renderWikilinks below) so `$` inside a
 * code span or block is left alone automatically: marked's inline lexer
 * only ever tries this tokenizer at positions the code-span tokenizer
 * hasn't already consumed.
 *
 * `mathRenderingActive` is a module-level flag rather than a closure
 * argument because marked extensions are registered once, globally, on
 * marked's shared singleton (see marked.use below); MarkdownPreview sets
 * it synchronously right before each parse call, from its own
 * mathRenderingEnabled prop (see WorkspaceSettings.mathRenderingEnabled),
 * and nothing else reads or writes it in between since marked.parse with
 * `async: false` runs entirely synchronously.
 */
let mathRenderingActive = true;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch {
    // katex's own throwOnError: false only guards LaTeX parse errors, not
    // every failure mode; fall back to the literal source rather than
    // crashing the whole preview pane over one malformed expression.
    return escapeHtml(displayMode ? `$$${tex}$$` : `$${tex}$`);
  }
}

// $$...$$, matching across lines. Market Solution #2's own convention: the
// closing $$ can be on the same line or a later one.
const BLOCK_MATH = /^\$\$([\s\S]+?)\$\$/;

// $...$, deliberately excluding a leading or trailing space inside the
// delimiters (Market Solution #2's own convention too) so ordinary currency
// text like "$5 and $10" is never mistaken for math.
const INLINE_MATH = /^\$((?!\s)(?:\\\$|[^$\n])+?)(?<!\s)\$(?!\$)/;

marked.use({
  extensions: [
    {
      name: "blockMath",
      level: "block",
      start: (src: string) => src.match(/\$\$/)?.index,
      tokenizer(src: string) {
        if (!mathRenderingActive) return undefined;
        const match = BLOCK_MATH.exec(src);
        if (!match) return undefined;
        return { type: "blockMath", raw: match[0], text: match[1].trim() };
      },
      renderer: (token: Tokens.Generic) => renderMath(token.text as string, true),
    },
    {
      name: "inlineMath",
      level: "inline",
      start: (src: string) => src.indexOf("$"),
      tokenizer(src: string) {
        if (!mathRenderingActive) return undefined;
        const match = INLINE_MATH.exec(src);
        if (!match) return undefined;
        return { type: "inlineMath", raw: match[0], text: match[1] };
      },
      renderer: (token: Tokens.Generic) => renderMath(token.text as string, false),
    },
  ],
});

interface MarkdownPreviewProps {
  source: string;
  /** `options.headingKey` is set only when the click that opened this
   * file came from a resolved `[[Note#Heading]]` cross-note heading
   * link (see F04 Phase 1, spec/f04-heading-block-links-embeds.md
   * section 10): the raw heading text the link named, for the caller to
   * resolve against the freshly-opened note's own content (App.tsx
   * already reads that content to open the tab, so it re-scans headings
   * there rather than this component reading the file a second time) and
   * reveal via the existing outline `reveal` mechanism. A heading that
   * turns out missing or ambiguous in the freshly-read note is a
   * silent no-op reveal, not an error: the note still opens (spec
   * section 10.4's "open the note if its path still resolves"). */
  onOpenFile?: (path: string, name: string, options?: { headingKey?: string }) => void;
  /** Whether $inline$ / $$block$$ math renders via KaTeX at all; when
   * false, that syntax is left as ordinary text, same as before this
   * feature existed. Defaults to on, see
   * WorkspaceSettings.mathRenderingEnabled for why. */
  mathRenderingEnabled?: boolean;
  /** Whether `[[Note#Heading]]`/`[[#Heading]]` heading-link syntax and
   * the `[[Note|Label]]` display-label separator are parsed (F04 Phase
   * 1, see linking/wikiSyntax.ts). Defaults to on, see
   * WorkspaceSettings.headingLinksEnabled for why. Off, `[[...]]` parses
   * exactly as it did before this feature existed: the whole text
   * between the brackets is used as the note name, with no `#`/`|`
   * splitting at all. */
  headingLinksEnabled?: boolean;
  /** The path of the note being previewed, used to resolve a local
   * relative image link against its own folder (see
   * markLocalImageAttachments above). Optional so existing callers/tests
   * that render source in isolation still work; without it, local image
   * links render exactly as before this feature existed (an unresolved,
   * broken `<img src="...">`). */
  notePath?: string;
  /** Reports which rendered heading (by position among this preview's own
   * `h1`-`h6` elements, top to bottom) has crossed the reading threshold
   * near the top of the scrollable container, per
   * spec/f06-note-outline-heading-breadcrumbs.md section 7.4; `undefined`
   * before the first heading. Used by HeadingBreadcrumbs for Preview-mode
   * active-section tracking. This is a positional correspondence with
   * the shared heading scanner's output (src/markdown/headings.ts), not
   * F04's still-unbuilt deterministic anchor attributes, so it shares
   * that scanner's own documented limitation: a heading-like line inside
   * a blockquote or list renders here (marked treats it as a real
   * heading) but is not part of the scanned array, which would shift
   * every later index out of alignment for that note. */
  onActiveHeadingChange?: (index: number | undefined) => void;
  /** Fired for a real, user-initiated interaction with the preview pane
   * (a scroll event, a click anywhere inside it, or a keydown while focus
   * is inside it), never for the recompute this component already runs
   * on mount or on content change. Split view (spec section 7.5) uses
   * this to tell "the user just did something in Preview" apart from
   * "Preview's active heading was recomputed because the note changed,"
   * which fires through onActiveHeadingChange above regardless of cause
   * and would otherwise let an unrelated edit silently steal breadcrumb
   * authority from whichever pane the user actually last touched. */
  onDirectInteraction?: () => void;
}

// spec section 7.4: "the upper 25 percent of the viewport."
const READING_THRESHOLD_FRACTION = 0.25;

// Placeholder src prefix for a locally-resolved image, the same "encode a
// same-document fragment, decode and act on it after render" trick
// renderWikilinks below uses for [[wikilinks]]: DOMPurify already allows a
// bare "#..." fragment through unchanged (proven by that existing usage),
// and the real, resolved src (an asset:// URL on desktop or a data: URL on
// Android, see workspace/tauriBridge.ts's fileSrc) can only be obtained
// asynchronously, which a synchronous marked.parse call cannot wait on.
const ATTACHMENT_SRC_PREFIX = "#leotheca-attachment=";
const ATTACHMENT_READ_CONCURRENCY = 6;

// Any URI with a scheme (http:, https:, data:, etc.) is left for marked's
// own default image rendering: an absolute remote URL is exactly what
// CONSTITUTION.md's "Offline by design" rule already relies on the app's
// CSP to block from ever loading, not something to resolve here, and a
// data: URI already works natively as an <img src> with no resolution
// needed at all.
function isLocalRelativeTarget(target: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("//");
}

const IMAGE_MARKDOWN = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Rewrites a local, relative markdown image target (`![alt](image.png)`,
 * resolved the same way a browser resolves a relative URL: against the
 * folder of the note that embeds it, regardless of where the file was
 * actually saved, see editor/attachments.ts) into the placeholder href
 * above. Only paths that remain inside the active workspace are carried
 * into that placeholder, so user-authored markdown cannot turn preview
 * rendering into an arbitrary native file read. Absolute URLs, data: URIs,
 * and workspace escapes are left unresolved.
 */
function markLocalImageAttachments(
  source: string,
  noteDir: string | null,
  workspaceRoot: string | null,
): string {
  if (!noteDir || !workspaceRoot) return source;
  return source.replace(IMAGE_MARKDOWN, (match, alt: string, rawTarget: string) => {
    const trimmed = rawTarget.trim();
    const withTitle = /^(\S+)(\s+"[^"]*")?$/.exec(trimmed);
    if (!withTitle) return match;
    const [, target, titleSuffix = ""] = withTitle;
    if (!isLocalRelativeTarget(target)) return match;

    const containedPath = resolvePathWithinWorkspace(workspaceRoot, noteDir, target);
    if (!containedPath) return match;
    return `![${alt}](${ATTACHMENT_SRC_PREFIX}${encodeURIComponent(containedPath)}${titleSuffix})`;
  });
}

/** Markdown-escapes `[`/`]` in a wikilink's rendered label so marked
 * never mistakes it for the start of a second, nested link. */
function escapeWikilinkLabel(text: string): string {
  return text.replace(/([\\[\]])/g, "\\$1");
}

/** F04 Phase 1's `headingLinksEnabled: false` path (see
 * WorkspaceSettings.headingLinksEnabled): behaves exactly as this
 * function did before F04 existed, so turning the setting off is a real
 * escape hatch, not a cosmetic one. Kept byte-for-byte equivalent to the
 * pre-F04 implementation rather than expressed in terms of the new
 * structured parser, since the whole point is to have a code path this
 * feature cannot regress. */
function renderWikilinksLegacy(source: string): string {
  return source.replace(/\[\[([^\]]+)\]\]/g, (match, rawTarget: string) => {
    const target = rawTarget.trim();
    if (!target) return match;

    const label = escapeWikilinkLabel(target);
    const resolved = resolveWikilink(target);
    const href = `#leotheca-wikilink=${encodeURIComponent(target)}${resolved ? "&resolved=1" : ""}`;
    return `[${label}](${href})`;
  });
}

/** Builds this component's internal `#leotheca-wikilink=...` placeholder
 * href (see the ATTACHMENT_SRC_PREFIX comment above for the same "encode
 * a same-document fragment, decode and act on it after render" trick).
 * Uses `URLSearchParams` for both directions (this function and the
 * click handler's parsing below) so encoding/decoding can never drift
 * out of sync with each other the way hand-rolled `encodeURIComponent`
 * plus manual `&`-splitting would risk once more than one field exists. */
function buildWikilinkHref(fields: {
  target: string;
  resolved: boolean;
  fragmentKind?: "heading" | "block";
  fragment?: string;
  headingStatus?: "resolved" | "missing" | "ambiguous";
}): string {
  const params = new URLSearchParams();
  params.set("leotheca-wikilink", fields.target);
  if (fields.resolved) params.set("resolved", "1");
  if (fields.fragmentKind) params.set("fragmentKind", fields.fragmentKind);
  if (fields.fragment !== undefined) params.set("fragment", fields.fragment);
  if (fields.headingStatus) params.set("headingStatus", fields.headingStatus);
  return `#${params.toString()}`;
}

interface ParsedWikilinkHref {
  target: string;
  resolved: boolean;
  fragmentKind?: "heading" | "block";
  fragment?: string;
  headingStatus?: "resolved" | "missing" | "ambiguous";
}

function parseWikilinkHref(href: string): ParsedWikilinkHref {
  const raw = href.startsWith("#") ? href.slice(1) : href;
  const params = new URLSearchParams(raw);
  const fragmentKind = params.get("fragmentKind");
  const headingStatus = params.get("headingStatus");
  return {
    target: params.get("leotheca-wikilink") ?? "",
    resolved: params.get("resolved") === "1",
    fragmentKind: fragmentKind === "heading" || fragmentKind === "block" ? fragmentKind : undefined,
    fragment: params.get("fragment") ?? undefined,
    headingStatus:
      headingStatus === "resolved" || headingStatus === "missing" || headingStatus === "ambiguous"
        ? headingStatus
        : undefined,
  };
}

/**
 * The default display label for a wikilink with no explicit `|Label`,
 * per spec section 5.4: a resolved note link shows the note name (here,
 * the target text as written, matching this component's pre-F04
 * behavior exactly since there is no separate "canonical note name"
 * available without a file read); a resolved heading link shows the
 * heading text; anything unresolved (including a cross-note heading
 * link whose heading hasn't been verified, since Phase 1 does not read
 * cross-note content just to render Preview, see the module doc comment
 * below) falls back to the literal `Note#Heading`-shaped target
 * expression rather than guessing.
 */
function defaultWikilinkLabel(record: WikiLinkRecord, headingStatus: "resolved" | "missing" | "ambiguous" | undefined): string {
  if (!record.fragment) return record.noteTarget;
  if (record.fragment.kind === "heading" && headingStatus === "resolved") return record.fragment.value;
  const marker = record.fragment.kind === "block" ? "^" : "";
  return record.noteTarget ? `${record.noteTarget}#${marker}${record.fragment.value}` : `#${marker}${record.fragment.value}`;
}

/**
 * F04 Phase 1's structured rendering path (spec section 21 Phase 1),
 * used when `headingLinksEnabled` is on. Resolves each `[[...]]`
 * occurrence through the shared parser (wikiSyntax.ts) and resolver
 * (wikiResolver.ts) rather than the ad hoc regex the legacy path above
 * still uses, so a heading fragment is handled distinctly instead of
 * folding it into a note name that will never actually match a file.
 *
 * Same-note fragments (`currentHeadings` from this note's own already-
 * available source) resolve fully: resolved, missing, or ambiguous, all
 * distinctly styled (see linking/linking.css). A cross-note fragment
 * resolves at the note level only: verifying the heading would need
 * reading the target note's file, which this render pass deliberately
 * does not do (Preview renders synchronously from the source it already
 * has; see MarkdownPreview's module doc comment for the async
 * image-attachment precedent this deliberately does NOT extend to
 * cross-note heading verification in this phase). A cross-note heading
 * link therefore renders with the same "resolved" look as a plain note
 * link once its target note exists, and the actual heading lookup
 * happens once, correctly, at click time in App.tsx against the note's
 * freshly-read content (see onOpenFile's `headingKey` option). This is
 * a disclosed, deliberate scope narrowing, not an oversight: it keeps
 * Preview's rendering pass free of new per-keystroke file reads while
 * still making cross-note heading navigation work correctly on click.
 */
function renderWikilinksStructured(
  source: string,
  currentHeadings: HeadingRecord[],
  currentNotePath: string | undefined,
): string {
  const records = parseWikiLinks(source);
  if (records.length === 0) return source;

  let result = "";
  let cursor = 0;
  for (const record of records) {
    result += source.slice(cursor, record.sourceFrom);
    cursor = record.sourceTo;

    if (record.parseStatus === "malformed") {
      result += record.raw;
      continue;
    }

    const target = resolveWikiLinkTarget(record, {
      currentNotePath,
      targetHeadings: record.noteTarget === "" ? currentHeadings : undefined,
    });

    const legacyFallback = Boolean(target.legacyFallback);
    let headingStatus: "resolved" | "missing" | "ambiguous" | undefined;
    if (!legacyFallback && record.fragment?.kind === "heading") {
      if (target.heading) headingStatus = "resolved";
      else if (target.status === "missing-fragment") headingStatus = "missing";
      else if (target.status === "ambiguous-fragment") headingStatus = "ambiguous";
    }

    const overallResolved =
      target.status === "resolved" && (headingStatus === undefined || headingStatus === "resolved");

    const label = legacyFallback
      ? record.legacyRaw
      : (record.label ?? defaultWikilinkLabel(record, headingStatus));

    const href = buildWikilinkHref({
      target: legacyFallback ? record.legacyRaw : record.noteTarget,
      resolved: overallResolved,
      fragmentKind: legacyFallback ? undefined : record.fragment?.kind,
      fragment: legacyFallback ? undefined : record.fragment?.value,
      headingStatus,
    });

    // A markdown title (rendered as the anchor's `title` attribute)
    // gives a screen-reader- and hover-discoverable reason for the two
    // heading-specific broken states (spec section 16: "unresolved and
    // ambiguous links have textual status ... not color alone"), without
    // building a new tooltip mechanism for it.
    const title =
      headingStatus === "missing"
        ? ' "Heading not found in this note"'
        : headingStatus === "ambiguous"
          ? ' "More than one heading matches this name"'
          : "";

    result += `[${escapeWikilinkLabel(label)}](${href}${title})`;
  }
  result += source.slice(cursor);
  return result;
}

export function MarkdownPreview({
  source,
  onOpenFile,
  mathRenderingEnabled = true,
  headingLinksEnabled = true,
  notePath,
  onActiveHeadingChange,
  onDirectInteraction,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteDir = notePath ? dirname(notePath) : null;
  const workspaceRoot = workspacePath.value;
  const onActiveHeadingChangeRef = useRef(onActiveHeadingChange);
  onActiveHeadingChangeRef.current = onActiveHeadingChange;
  const onDirectInteractionRef = useRef(onDirectInteraction);
  onDirectInteractionRef.current = onDirectInteraction;

  // Scanned once per source change, reused both to render same-note
  // heading-link status below and to resolve a same-note link's target
  // on click (see the container's onClick below). Cheap: the same
  // bounded, non-recursive scan OutlinePanel/HeadingBreadcrumbs already
  // run for this exact note's content.
  const currentHeadings = useMemo(() => scanHeadings(source), [source]);

  const html = useMemo(() => {
    mathRenderingActive = mathRenderingEnabled;
    const withAttachments = markLocalImageAttachments(source, noteDir, workspaceRoot);
    const withWikilinks = headingLinksEnabled
      ? renderWikilinksStructured(withAttachments, currentHeadings, notePath)
      : renderWikilinksLegacy(withAttachments);
    const rendered = marked.parse(withWikilinks, {
      async: false,
    }) as string;
    return DOMPurify.sanitize(rendered);
  }, [source, mathRenderingEnabled, headingLinksEnabled, noteDir, workspaceRoot, currentHeadings, notePath]);

  // marked.parse is synchronous, but resolving a placeholder src into a
  // real, loadable one (fileSrc, see workspace/tauriBridge.ts) is not. A
  // small worker queue bounds native reads on both desktop and Android.
  // Cancelling a stale render stops its workers before they schedule any
  // more queued reads; already-invoked reads may finish but cannot update
  // the obsolete DOM.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>(`img[src^="${ATTACHMENT_SRC_PREFIX}"]`),
    );

    // Group by absolute path first: a note can embed the same image more
    // than once (e.g. a diagram referenced twice), and resolving each
    // occurrence independently means one native fileSrc() read of the
    // same file per occurrence. Resolving each unique path once and
    // fanning the result out to every <img> that needs it removes that
    // redundant work without caching anything beyond this single render
    // pass, so unlike a persisted cache it carries no staleness risk (see
    // the "Image data URL caching" roadmap entry).
    const imagesByPath = new Map<string, HTMLImageElement[]>();
    for (const img of images) {
      const absolutePath = decodeURIComponent(
        img.getAttribute("src")!.slice(ATTACHMENT_SRC_PREFIX.length),
      );
      const group = imagesByPath.get(absolutePath);
      if (group) group.push(img);
      else imagesByPath.set(absolutePath, [img]);
    }
    const uniquePaths = Array.from(imagesByPath.keys());
    let nextPathIndex = 0;

    const resolveNext = async () => {
      while (!cancelled) {
        const path = uniquePaths[nextPathIndex];
        if (path === undefined) return;
        nextPathIndex += 1;

        try {
          const resolved = await fileSrc(path);
          if (cancelled) return;
          for (const img of imagesByPath.get(path)!) img.src = resolved;
        } catch {
          // Keep this path's attachment(s) unresolved. The worker
          // continues with the rest of the current queue.
        }
      }
    };

    const workerCount = Math.min(ATTACHMENT_READ_CONCURRENCY, uniquePaths.length);
    void Promise.allSettled(Array.from({ length: workerCount }, () => resolveNext()));

    return () => {
      cancelled = true;
    };
  }, [html]);

  // Section 7.4's active-section tracking. Recomputed on every scroll of
  // the preview's own scroll container (see .markdown-preview's
  // `overflow: auto`) and once right after each render, so switching
  // notes or editing content updates the active heading immediately
  // rather than waiting for the next scroll. A plain scroll-event
  // recompute rather than an IntersectionObserver or a
  // requestAnimationFrame throttle: bounded by the same heading-count
  // scale Phase 1 already defers to a later phase, and simpler to test.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const headingElements = Array.from(
      container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    );

    const update = () => {
      if (headingElements.length === 0) {
        onActiveHeadingChangeRef.current?.(undefined);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const thresholdY = containerRect.top + containerRect.height * READING_THRESHOLD_FRACTION;
      let active: number | undefined;
      for (let i = 0; i < headingElements.length; i++) {
        if (headingElements[i].getBoundingClientRect().top <= thresholdY) active = i;
        else break;
      }
      onActiveHeadingChangeRef.current?.(active);
    };

    const handleScroll = () => {
      update();
      onDirectInteractionRef.current?.();
    };

    update();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [html]);

  return (
    <div
      class="markdown-preview"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        onDirectInteractionRef.current?.();

        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          'a[href^="#leotheca-wikilink="]',
        );
        if (!anchor) return;

        event.preventDefault();
        // Read the literal attribute, not `anchor.hash`: this href is an
        // internal placeholder this component wrote itself (see
        // buildWikilinkHref above), never a real navigable URL, so there
        // is no reason to route it through the browser's URL parser.
        const parsed = parseWikilinkHref(anchor.getAttribute("href") ?? "");

        if (parsed.target === "") {
          // Same-note link ([[#Heading]], or the rare bare [[|Label]]
          // self-link): no note switch happens, so a resolved heading
          // fragment reveals directly against this note's own
          // already-scanned headings rather than round-tripping through
          // onOpenFile.
          if (parsed.fragmentKind === "heading" && parsed.fragment) {
            const match = resolveHeadingFragment(currentHeadings, parsed.fragment);
            if (match.status === "resolved") {
              requestOutlineReveal(match.heading.contentFrom, match.heading.contentTo);
            }
            // missing-fragment/ambiguous-fragment: no navigation, per
            // spec section 10.4's "never scroll to an arbitrary
            // similarly named target."
          }
          return;
        }

        const path = resolveWikilink(parsed.target);
        if (!path) return;

        if (parsed.fragmentKind === "heading" && parsed.fragment) {
          onOpenFile?.(path, fileNameFromPath(path), { headingKey: parsed.fragment });
        } else {
          onOpenFile?.(path, fileNameFromPath(path));
        }
      }}
      onKeyDown={() => onDirectInteractionRef.current?.()}
    />
  );
}
