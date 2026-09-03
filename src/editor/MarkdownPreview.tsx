import { useEffect, useMemo, useRef } from "preact/hooks";
import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { fileNameFromPath, resolveWikilink } from "../linking/store";
import { parseWikiLinks, type WikiLinkFragment, type WikiLinkRecord } from "../linking/wikiSyntax";
import {
  crossNoteBlocksFor,
  crossNoteHeadingsFor,
  resolveBlockFragment,
  resolveHeadingFragment,
  resolveWikiLinkTarget,
} from "../linking/wikiResolver";
import { scanHeadings, type HeadingRecord } from "../markdown/headings";
import { scanBlockIds, type BlockRecord } from "../markdown/blocks";
import { frontmatterBodyStart } from "./frontmatterEdits";
import { requestOutlineReveal } from "../outline/outlineNavigation";
import { workspacePath } from "../settings/store";
import { dirname, resolvePathWithinWorkspace } from "../workspace/paths";
import { fileSrc, readTextFile } from "../workspace/tauriBridge";
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
  /** `options.headingKey`/`options.blockId` are set only when the click
   * that opened this file came from a resolved `[[Note#Heading]]` or
   * `[[Note#^block-id]]` cross-note link (F04 Phase 1 for headings,
   * spec/f04-heading-block-links-embeds.md section 10; F04 Phase 3a for
   * blocks): the raw heading text or block id the link named, for the
   * caller to resolve against the freshly-opened note's own content
   * (App.tsx already reads that content to open the tab, so it re-scans
   * there rather than this component reading the file a second time) and
   * reveal via the existing outline `reveal` mechanism. A target that
   * turns out missing or ambiguous in the freshly-read note is a
   * silent no-op reveal, not an error: the note still opens (spec
   * section 10.4's "open the note if its path still resolves"). */
  onOpenFile?: (path: string, name: string, options?: { headingKey?: string; blockId?: string }) => void;
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

// F04 Phase 4b, spec section 11.4's three numeric embed-recursion limits:
// implementation constants for the first release, not yet user-facing
// settings, per that section's own closing note.
const MAX_EMBED_DEPTH = 3;
const MAX_EMBED_INSTANCES = 25;
const MAX_EMBED_BYTES = 1024 * 1024;

// F04 Phase 4b follow-up 2, spec section 11.4's "per-note load timeout":
// bounds a single cross-note embed's readTextFile call independently of
// the stale-preview-generation cancellation the resolution effect's own
// `cancelled` flag already provides, so one slow or hung native read
// cannot leave its own embed frame stuck on "Loading..." forever even
// within an otherwise still-current preview. An implementation constant,
// same footing as the three limits directly above.
const EMBED_LOAD_TIMEOUT_MS = 8000;

/** Races a cross-note embed's own `readTextFile` call against
 * `EMBED_LOAD_TIMEOUT_MS`, rejecting with an `Error` (caught uniformly by
 * the resolution effect's own try/catch, alongside a genuine read
 * failure) if the read itself hasn't settled in time. The underlying
 * native call cannot actually be cancelled from here, no cancellation
 * token flows through `tauriBridge.ts`'s `readTextFile` today, so a hung
 * read keeps running in the background; this function only stops
 * *waiting* on it. The `settled` flag discards whichever outcome loses
 * the race, so a very-late real resolution can never overwrite a
 * placeholder the timeout already caused to render. */
function readEmbedNoteWithTimeout(path: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`embed load timed out after ${timeoutMs}ms: ${path}`));
    }, timeoutMs);
    readTextFile(path).then(
      (content) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(content);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

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
  blockStatus?: "resolved" | "missing" | "ambiguous";
}): string {
  const params = new URLSearchParams();
  params.set("leotheca-wikilink", fields.target);
  if (fields.resolved) params.set("resolved", "1");
  if (fields.fragmentKind) params.set("fragmentKind", fields.fragmentKind);
  if (fields.fragment !== undefined) params.set("fragment", fields.fragment);
  if (fields.headingStatus) params.set("headingStatus", fields.headingStatus);
  if (fields.blockStatus) params.set("blockStatus", fields.blockStatus);
  return `#${params.toString()}`;
}

interface ParsedWikilinkHref {
  target: string;
  resolved: boolean;
  fragmentKind?: "heading" | "block";
  fragment?: string;
  headingStatus?: "resolved" | "missing" | "ambiguous";
  blockStatus?: "resolved" | "missing" | "ambiguous";
}

function parseWikilinkHref(href: string): ParsedWikilinkHref {
  const raw = href.startsWith("#") ? href.slice(1) : href;
  const params = new URLSearchParams(raw);
  const fragmentKind = params.get("fragmentKind");
  const headingStatus = params.get("headingStatus");
  const blockStatus = params.get("blockStatus");
  const asStatus = (value: string | null) =>
    value === "resolved" || value === "missing" || value === "ambiguous" ? value : undefined;
  return {
    target: params.get("leotheca-wikilink") ?? "",
    resolved: params.get("resolved") === "1",
    fragmentKind: fragmentKind === "heading" || fragmentKind === "block" ? fragmentKind : undefined,
    fragment: params.get("fragment") ?? undefined,
    headingStatus: asStatus(headingStatus),
    blockStatus: asStatus(blockStatus),
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
 *
 * F04 Phase 3a extends the same treatment to `^block-id` fragments: a
 * same-note `[[#^block-id]]` resolves fully against `currentBlocks`
 * (resolved/missing/ambiguous, styled the same dotted-underline way as
 * the equivalent heading states), a cross-note `[[Note#^block-id]]`
 * resolves at the note level only for the same reason cross-note headings
 * do, and the real block lookup happens once, correctly, at click time in
 * App.tsx (see onOpenFile's `blockId` option).
 *
 * F04 Phase 4a adds `![[Note]]`/`![[Note#Heading]]`/`![[Note#^block-id]]`
 * embeds (`record.kind === "embed"`, see `RenderContext.embedRecursion`
 * and the embed helper functions directly below this doc comment for how
 * they render, resolve, and degrade). Phase 4b adds real recursion up to
 * spec 11.4's max depth 3, cycle detection against the active recursion
 * chain, and a shared per-preview instance-count/byte-load budget (see
 * `EmbedRecursionState`/`EmbedBudget`).
 */
/** Escapes `&`, `"`, `<`, and `>` for safe embedding inside a
 * double-quoted HTML attribute value built by hand (as opposed to
 * `escapeHtml` above, used for ordinary text content, which does not
 * need to escape `"`). Used by the embed-frame HTML this file builds
 * directly rather than through `marked` (F04 Phase 4a). */
function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bundles every piece of context `renderWikilinksStructured` and its
 * embed-rendering helpers need, since a single flat parameter list would
 * be unwieldy at this point (F04 Phase 4a added several embed-only
 * fields on top of Phase 1/3a's existing heading/block ones). Mirrors
 * `wikiResolver.ts`'s `WikiResolutionContext` in spirit: one options
 * object per call, not a growing positional argument list. */
/** Mutable, shared across an entire host preview's whole embed tree (F04
 * Phase 4b, spec 11.4): the same object reference is threaded through
 * every same-note extraction and every cross-note resolution, nested ones
 * included, so "maximum resolved embed instances" and "maximum total
 * source bytes loaded" are enforced against the *whole preview*, not
 * reset per recursion level. Decremented only when an embed actually
 * resolves into rendered content ("ok"), never for an attempt that ends
 * in a not-found/ambiguous/cycle placeholder, matching "resolved
 * instances" wording. Deliberately allowed to go negative rather than
 * truncating a single oversized embed mid-render to fit the remaining
 * byte budget: an embed already in progress always renders whole, and
 * only the *next* attempted embed sees the budget exhausted. */
interface EmbedBudget {
  instancesRemaining: number;
  bytesRemaining: number;
}

function createEmbedBudget(): EmbedBudget {
  return { instancesRemaining: MAX_EMBED_INSTANCES, bytesRemaining: MAX_EMBED_BYTES };
}

/** Everything needed to decide whether, and how, to expand a nested
 * `![[...]]` one level deeper (F04 Phase 4b). `embedAncestryPaths` is the
 * chain of embed identities (see `embedIdentity` below: note path plus
 * fragment, so two different headings/blocks in the same note are
 * distinct entries) reached by *already expanding* an embed, empty at the
 * host preview's own root (the host's top-level render is not itself an
 * embed of anything, so an ordinary same-note embed referencing the host
 * note, `![[#Heading]]`, is not by itself a cycle); a target whose exact
 * identity already appears in this chain is a cycle, at any depth, not
 * merely an immediate repeat, while a same-note chain of *different*
 * headings/blocks (`![[#H1]]` containing `![[#H2]]`) is not, even though
 * every level shares one note path. `embedBudget` is the one shared
 * object described above.
 * `crossNoteEmbedsOut` is the flat, ever-growing queue of not-yet-read
 * cross-note embeds for this whole preview (nested ones append to the
 * exact same array the top-level render started, rather than a
 * per-level list), so `MarkdownPreview`'s single resolution effect keeps
 * draining it, newly discovered entries included, without a second
 * effect or a second queue. */
interface EmbedRecursionState {
  embedDepth: number;
  embedAncestryPaths: readonly string[];
  embedBudget: EmbedBudget;
  crossNoteEmbedsOut: CrossNoteEmbedRequest[];
}

interface RenderContext {
  currentHeadings: HeadingRecord[];
  currentBlocks: BlockRecord[];
  currentNotePath: string | undefined;
  /** The note's own pristine, unmodified source (F04 Phase 4a): needed
   * to extract a same-note embed's target section by the exact same
   * `sourceFrom`/`sectionTo`/`contentFrom`/`contentTo` offsets
   * `currentHeadings`/`currentBlocks` were computed against, since
   * `source` (the string actually being scanned for `[[...]]`
   * occurrences) may already be a rewritten copy (block markers
   * stripped, image attachments marked) whose offsets no longer align
   * with those records once any earlier rewrite has changed the
   * string's length before the embed's own position. */
  pristineNoteSource: string;
  noteDir: string | null;
  workspaceRoot: string | null;
  /** F04 Phase 4b: real recursion state (depth/ancestry/budget/queue),
   * replacing Phase 4a's plain `allowEmbeds` boolean. A `![[...]]`
   * encountered once `embedDepth >= MAX_EMBED_DEPTH` is not expanded,
   * falling through to this function's ordinary link rendering exactly
   * as if its leading `!` were not there: still a working, clickable
   * link to the same target, just not expanded inline, the same degrade
   * Phase 4a used for every nesting level. */
  embedRecursion: EmbedRecursionState;
}

/** One cross-note embed placeholder emitted synchronously during render,
 * to be resolved asynchronously afterward (F04 Phase 4a): the target
 * note's content must be read from disk before its section/block can be
 * extracted and rendered, the same reason `ATTACHMENT_SRC_PREFIX` images
 * above resolve in a follow-up effect rather than during this synchronous
 * render pass. `nextRecursion` (F04 Phase 4b) is the state to render this
 * embed's own resolved content with, once read: depth already incremented
 * and this embed's own target path already appended to the ancestry
 * chain, computed at enqueue time since both only depend on the
 * synchronously-known target note path, not its (not yet read) content. */
interface CrossNoteEmbedRequest {
  notePath: string;
  fragment?: WikiLinkFragment;
  nextRecursion: EmbedRecursionState;
}

type EmbedExtraction =
  | { status: "ok"; text: string; sectionLabel?: string }
  | { status: "missing-heading" }
  | { status: "ambiguous-heading" }
  | { status: "missing-block" }
  | { status: "ambiguous-block" };

/**
 * Extracts the exact text an embed should render, per spec section 11.1:
 * the whole note body after frontmatter for a plain `![[Note]]`, a
 * heading's own text through its full section (equal-or-higher-level
 * heading boundary, reusing `HeadingRecord.sectionTo`, the same range the
 * outline feature already computes) for `![[Note#Heading]]`, or the
 * exact block content for `![[Note#^block-id]]`. `headings`/`blocks` must
 * already be scanned from the exact same `content` this function slices,
 * whether that's the current note's own pristine source (same-note) or a
 * freshly-read target note's content (cross-note).
 */
function extractEmbedSection(
  content: string,
  fragment: WikiLinkFragment | undefined,
  headings: HeadingRecord[],
  blocks: BlockRecord[],
): EmbedExtraction {
  if (!fragment) {
    return { status: "ok", text: content.slice(frontmatterBodyStart(content)).trim() };
  }
  if (fragment.kind === "heading") {
    const result = resolveHeadingFragment(headings, fragment.value);
    if (result.status === "missing-fragment") return { status: "missing-heading" };
    if (result.status === "ambiguous-fragment") return { status: "ambiguous-heading" };
    return {
      status: "ok",
      text: content.slice(result.heading.sourceFrom, result.heading.sectionTo).trim(),
      sectionLabel: result.heading.displayText,
    };
  }
  const result = resolveBlockFragment(blocks, fragment.value);
  if (result.status === "missing-fragment") return { status: "missing-block" };
  if (result.status === "ambiguous-fragment") return { status: "ambiguous-block" };
  return { status: "ok", text: content.slice(result.block.contentFrom, result.block.contentTo).trim() };
}

/**
 * Renders an already-extracted embed section's own Markdown to sanitized-
 * at-the-end HTML: strips its own block-id markers (a nested paragraph
 * inside the embedded section can itself carry one), resolves its own
 * local image attachments against the EMBEDDED note's own directory (spec
 * 11.3: "relative images and attachments resolve from the embedded
 * note's directory," not the host's), and processes its own wikilinks
 * with `notePath` as the same-note context, so a same-note link inside
 * the embedded section correctly refers to the embedded note (spec 11.3),
 * not the host note previewing it. `recursion` (F04 Phase 4b) carries this
 * embed's own already-incremented depth and already-extended ancestry
 * chain, so a further nested `![[...]]` this section's own text contains
 * is itself checked against real recursion limits rather than always
 * degrading to a link.
 */
function renderEmbeddedMarkdownToHtml(
  text: string,
  notePath: string,
  noteDir: string | null,
  workspaceRoot: string | null,
  recursion: EmbedRecursionState,
): string {
  if (text.trim() === "") {
    return '<p class="embed-frame-message">This section is empty</p>';
  }
  const headings = scanHeadings(text);
  const blocks = scanBlockIds(text);
  const withoutBlockMarkers = stripBlockIdMarkers(text, blocks);
  const withAttachments = markLocalImageAttachments(withoutBlockMarkers, noteDir, workspaceRoot);
  const withWikilinks = renderWikilinksStructured(withAttachments, {
    currentHeadings: headings,
    currentBlocks: blocks,
    currentNotePath: notePath,
    pristineNoteSource: text,
    noteDir,
    workspaceRoot,
    embedRecursion: recursion,
  });
  return marked.parse(withWikilinks, { async: false }) as string;
}

/** Converts an `EmbedExtraction` result into the embed frame's body HTML:
 * a placeholder message for a status spec section 11.4 explicitly
 * requires one for, or the fully rendered section for "ok". `nextRecursion`
 * (F04 Phase 4b) is the recursion state to render an "ok" section's own
 * content with; the shared `embedBudget` it carries is checked and, only
 * on success, decremented here, immediately before actually rendering,
 * since only a truly resolved (not not-found/ambiguous) embed counts
 * against "maximum resolved embed instances"/"maximum total source bytes
 * loaded" (spec 11.4). */
function embedExtractionHtml(
  extraction: EmbedExtraction,
  notePath: string,
  noteDir: string | null,
  workspaceRoot: string | null,
  nextRecursion: EmbedRecursionState,
): string {
  switch (extraction.status) {
    case "missing-heading":
      return '<p class="embed-frame-message">Embedded heading not found</p>';
    case "ambiguous-heading":
      return '<p class="embed-frame-message">Embedded heading matches more than one heading in the note</p>';
    case "missing-block":
      return '<p class="embed-frame-message">Embedded block not found</p>';
    case "ambiguous-block":
      return '<p class="embed-frame-message">Embedded block matches more than one block in the note</p>';
    case "ok": {
      const { embedBudget } = nextRecursion;
      const textBytes = new TextEncoder().encode(extraction.text).length;
      if (embedBudget.instancesRemaining <= 0 || embedBudget.bytesRemaining <= 0) {
        return '<p class="embed-frame-message">Embed limit reached</p>';
      }
      embedBudget.instancesRemaining -= 1;
      embedBudget.bytesRemaining -= textBytes;
      return renderEmbeddedMarkdownToHtml(extraction.text, notePath, noteDir, workspaceRoot, nextRecursion);
    }
  }
}

/**
 * Builds one embed's "application frame" (spec section 11.2): a visually
 * quiet container naming the source note, an `Open source note` action
 * (reusing `buildWikilinkHref` and this file's own existing wikilink
 * click handling, rather than a second navigation mechanism), and an
 * accessible `Embedded content from ...` label. Wrapped in blank lines so
 * `marked` reliably recognizes the `<div>` as a raw HTML block regardless
 * of whether the `![[...]]` it replaces sat inline mid-paragraph or alone
 * on its own line in the source.
 */
function embedFrameHtml(params: {
  embedId?: number;
  labelName: string;
  openHref?: string;
  sectionLabel?: string;
  bodyHtml: string;
}): string {
  const idAttr = params.embedId !== undefined ? ` data-lt-embed-id="${params.embedId}"` : "";
  const openLink = params.openHref
    ? `<a href="${escapeAttr(params.openHref)}" class="embed-frame-open">Open source note</a>`
    : "";
  const sectionSuffix = params.sectionLabel ? ` &middot; ${escapeHtml(params.sectionLabel)}` : "";
  return (
    `\n\n<div class="embed-frame"${idAttr} aria-label="${escapeAttr(`Embedded content from ${params.labelName}`)}">` +
    `<div class="embed-frame-header"><span class="embed-frame-label">${escapeHtml(params.labelName)}${sectionSuffix}</span>${openLink}</div>` +
    `<div class="embed-frame-body">${params.bodyHtml}</div>` +
    `</div>\n\n`
  );
}

/** The exact "target" an embed's cycle detection should compare against
 * (F04 Phase 4b, spec 11.4's "duplicate target in the active recursion
 * chain"): a note path alone is not enough, since same-note embeds of
 * two different headings/blocks legitimately share one note path without
 * being a cycle (`![[#H1]]` containing `![[#H2]]` is a normal 2-level
 * chain, not H1 re-embedding itself) — only the *same* note+fragment
 * combination recurring is. A plain whole-note embed (`fragment`
 * undefined) still keys on the note path alone, correctly catching
 * `![[NoteA]]` containing `![[NoteB]]` containing `![[NoteA]]` again. */
function embedIdentity(notePath: string, fragment: WikiLinkFragment | undefined): string {
  return fragment ? `${notePath}#${fragment.kind}:${fragment.value}` : notePath;
}

function renderWikilinksStructured(source: string, context: RenderContext): string {
  const { currentHeadings, currentBlocks, currentNotePath, pristineNoteSource, noteDir, workspaceRoot, embedRecursion } =
    context;
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

    const sameNote = record.noteTarget === "";
    const target = resolveWikiLinkTarget(record, {
      currentNotePath,
      // F04 Phase 5a/5c: a cross-note heading or block fragment is now
      // verified against LinkIndex.headingsByPath/blocksByPath too, not
      // just the note's own existence (see crossNoteHeadingsFor/
      // crossNoteBlocksFor's own doc comments).
      targetHeadings: sameNote ? currentHeadings : crossNoteHeadingsFor(record),
      targetBlocks: sameNote ? currentBlocks : crossNoteBlocksFor(record),
    });

    if (record.kind === "embed" && embedRecursion.embedDepth < MAX_EMBED_DEPTH) {
      if (target.status === "missing-note" || !target.notePath) {
        result += embedFrameHtml({
          labelName: record.noteTarget || "this note",
          bodyHtml: '<p class="embed-frame-message">Embedded note not found</p>',
        });
        continue;
      }

      const notePath = target.notePath;
      const labelName = fileNameFromPath(notePath);
      const openHref = buildWikilinkHref({
        target: target.legacyFallback ? record.legacyRaw : record.noteTarget,
        resolved: true,
        fragmentKind: record.fragment?.kind,
        fragment: record.fragment?.value,
      });

      // F04 Phase 4b, spec 11.4: a target already in the active
      // recursion chain is a cycle regardless of remaining depth or
      // budget, checked before either is consulted. Keyed by
      // note+fragment (see embedIdentity's own doc comment), not the
      // note path alone: a same-note chain of *different* headings/blocks
      // (`![[#H1]]` containing `![[#H2]]`) is a normal multi-level embed,
      // not a cycle, even though every level shares one note path
      // (`notePath` for a same-note fragment is `currentNotePath` itself,
      // see wikiResolver.ts's own `sameNote ? context.currentNotePath :
      // ...`).
      const identity = embedIdentity(notePath, record.fragment);
      if (embedRecursion.embedAncestryPaths.includes(identity)) {
        result += embedFrameHtml({
          labelName,
          openHref,
          bodyHtml: '<p class="embed-frame-message">Embed cycle stopped</p>',
        });
        continue;
      }

      const nextRecursion: EmbedRecursionState = {
        embedDepth: embedRecursion.embedDepth + 1,
        embedAncestryPaths: [...embedRecursion.embedAncestryPaths, identity],
        embedBudget: embedRecursion.embedBudget,
        crossNoteEmbedsOut: embedRecursion.crossNoteEmbedsOut,
      };

      if (sameNote) {
        const extraction = extractEmbedSection(pristineNoteSource, record.fragment, currentHeadings, currentBlocks);
        result += embedFrameHtml({
          labelName,
          openHref,
          sectionLabel: extraction.status === "ok" ? extraction.sectionLabel : undefined,
          bodyHtml: embedExtractionHtml(extraction, notePath, noteDir, workspaceRoot, nextRecursion),
        });
      } else {
        const embedId = embedRecursion.crossNoteEmbedsOut.length;
        embedRecursion.crossNoteEmbedsOut.push({ notePath, fragment: record.fragment, nextRecursion });
        result += embedFrameHtml({
          embedId,
          labelName,
          openHref,
          bodyHtml: '<p class="embed-frame-message embed-frame-loading">Loading&hellip;</p>',
        });
      }
      continue;
    }

    const legacyFallback = Boolean(target.legacyFallback);
    let headingStatus: "resolved" | "missing" | "ambiguous" | undefined;
    let blockStatus: "resolved" | "missing" | "ambiguous" | undefined;
    if (!legacyFallback && record.fragment?.kind === "heading") {
      if (target.heading) headingStatus = "resolved";
      else if (target.status === "missing-fragment") headingStatus = "missing";
      else if (target.status === "ambiguous-fragment") headingStatus = "ambiguous";
    } else if (!legacyFallback && record.fragment?.kind === "block") {
      if (target.block) blockStatus = "resolved";
      else if (target.status === "missing-fragment") blockStatus = "missing";
      else if (target.status === "ambiguous-fragment") blockStatus = "ambiguous";
    }

    const overallResolved =
      target.status === "resolved" &&
      (headingStatus === undefined || headingStatus === "resolved") &&
      (blockStatus === undefined || blockStatus === "resolved");

    const label = legacyFallback
      ? record.legacyRaw
      : (record.label ?? defaultWikilinkLabel(record, headingStatus));

    const href = buildWikilinkHref({
      target: legacyFallback ? record.legacyRaw : record.noteTarget,
      resolved: overallResolved,
      fragmentKind: legacyFallback ? undefined : record.fragment?.kind,
      fragment: legacyFallback ? undefined : record.fragment?.value,
      headingStatus,
      blockStatus,
    });

    // A markdown title (rendered as the anchor's `title` attribute)
    // gives a screen-reader- and hover-discoverable reason for the
    // heading/block-specific broken states (spec section 16: "unresolved
    // and ambiguous links have textual status ... not color alone"),
    // without building a new tooltip mechanism for it.
    const title =
      headingStatus === "missing"
        ? ' "Heading not found in this note"'
        : headingStatus === "ambiguous"
          ? ' "More than one heading matches this name"'
          : blockStatus === "missing"
            ? ' "Block reference not found in this note"'
            : blockStatus === "ambiguous"
              ? ' "More than one block matches this id"'
              : "";

    result += `[${escapeWikilinkLabel(label)}](${href}${title})`;
  }
  result += source.slice(cursor);
  return result;
}

/**
 * F04 Phase 3a, spec section 7.3: "a valid block ID token is not shown as
 * ordinary rendered text." Removes each block's own `^id` marker (and its
 * required leading whitespace, `contentTo` through `sourceTo`) from the
 * source text fed to `marked.parse`, leaving the rest of the block's own
 * content, and every surrounding line break, untouched. Must run against
 * the pristine `source` before any other rewriting pass in this file
 * (`markLocalImageAttachments`, `renderWikilinksStructured`): `blocks`
 * itself was scanned against that same pristine text, so its offsets only
 * stay valid here, before anything else has shifted the string around
 * them. `blocks` (and the `contentFrom`/`contentTo` offsets any resulting
 * click-reveal uses) still describe the pristine `source`, exactly what
 * the CodeMirror editor itself displays; this function's output is used
 * for `marked.parse` alone, never re-scanned or revealed against.
 *
 * Only the deterministic DOM ID / `data-lt-block-id` attribute and the
 * copy-link affordance spec 7.3 also describes are deferred to a
 * follow-up (see ROADMAP.md): this phase makes the marker invisible and
 * makes an existing block reference resolvable and navigable, but does
 * not yet expose a stable anchor on the rendered element itself.
 */
function stripBlockIdMarkers(source: string, blocks: BlockRecord[]): string {
  if (blocks.length === 0) return source;
  let result = "";
  let cursor = 0;
  for (const block of blocks) {
    result += source.slice(cursor, block.contentTo);
    cursor = block.sourceTo;
  }
  result += source.slice(cursor);
  return result;
}

/**
 * Resolves a batch of already-rendered `ATTACHMENT_SRC_PREFIX` placeholder
 * `<img>` elements to their real, loadable `src` (`fileSrc`, see
 * workspace/tauriBridge.ts), through a small bounded worker pool. Shared
 * by the top-level image-resolution effect and F04 Phase 4a's cross-note
 * embed effect (its own newly-injected images were never part of the DOM
 * when the top-level effect ran, so they need their own resolution pass
 * through the exact same logic, not a second copy of it). `isCancelled`
 * is a function rather than a plain boolean so the caller's own `let
 * cancelled` flag, set from that effect's cleanup, is read fresh on every
 * loop iteration rather than captured stale at call time.
 */
async function resolveAttachmentImages(
  images: HTMLImageElement[],
  isCancelled: () => boolean,
): Promise<void> {
  // Group by absolute path first: a note (or an embedded section of one)
  // can reference the same image more than once, and resolving each
  // occurrence independently means one native fileSrc() read of the same
  // file per occurrence. Resolving each unique path once and fanning the
  // result out to every <img> that needs it removes that redundant work
  // without caching anything beyond this single render pass, so unlike a
  // persisted cache it carries no staleness risk (see the "Image data URL
  // caching" roadmap entry).
  const imagesByPath = new Map<string, HTMLImageElement[]>();
  for (const img of images) {
    const absolutePath = decodeURIComponent(img.getAttribute("src")!.slice(ATTACHMENT_SRC_PREFIX.length));
    const group = imagesByPath.get(absolutePath);
    if (group) group.push(img);
    else imagesByPath.set(absolutePath, [img]);
  }
  const uniquePaths = Array.from(imagesByPath.keys());
  let nextPathIndex = 0;

  const resolveNext = async () => {
    while (!isCancelled()) {
      const path = uniquePaths[nextPathIndex];
      if (path === undefined) return;
      nextPathIndex += 1;

      try {
        const resolved = await fileSrc(path);
        if (isCancelled()) return;
        for (const img of imagesByPath.get(path)!) img.src = resolved;
      } catch {
        // Keep this path's attachment(s) unresolved. The worker
        // continues with the rest of the current queue.
      }
    }
  };

  const workerCount = Math.min(ATTACHMENT_READ_CONCURRENCY, uniquePaths.length);
  await Promise.allSettled(Array.from({ length: workerCount }, () => resolveNext()));
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
  // F04 Phase 3a's analog of currentHeadings above, for `^block-id`
  // fragments (see markdown/blocks.ts).
  const currentBlocks = useMemo(() => scanBlockIds(source), [source]);

  const { html, crossNoteEmbeds } = useMemo(() => {
    mathRenderingActive = mathRenderingEnabled;
    // Must run first, against the pristine source: see
    // stripBlockIdMarkers's own doc comment for why offset-based rewrites
    // have to happen in this order. Gated behind the same
    // headingLinksEnabled flag as renderWikilinksStructured below, so
    // turning that setting off is still a genuine escape hatch back to
    // this feature's pre-F04 rendering, `^block-id` text included.
    const withoutBlockMarkers = headingLinksEnabled ? stripBlockIdMarkers(source, currentBlocks) : source;
    const withAttachments = markLocalImageAttachments(withoutBlockMarkers, noteDir, workspaceRoot);
    const crossNoteEmbedsOut: CrossNoteEmbedRequest[] = [];
    // F04 Phase 4b: the host preview's own recursion root. Depth 0, one
    // shared budget for this whole preview render, and an empty ancestry
    // chain: the host's own top-level render is not itself an embed of
    // anything, so a same-note embed referencing the host note (the
    // ordinary, already-shipped Phase 3a/4a case) is not a cycle merely
    // because its target equals the host's own path. Only a target
    // actually reached by expanding an embed (see `nextRecursion` below)
    // joins the chain, so a *repeated* self-embed further down (a section
    // that embeds another section of the same note that was already
    // being expanded) is still caught.
    const embedRecursion: EmbedRecursionState = {
      embedDepth: 0,
      embedAncestryPaths: [],
      embedBudget: createEmbedBudget(),
      crossNoteEmbedsOut,
    };
    const withWikilinks = headingLinksEnabled
      ? renderWikilinksStructured(withAttachments, {
          currentHeadings,
          currentBlocks,
          currentNotePath: notePath,
          pristineNoteSource: source,
          noteDir,
          workspaceRoot,
          embedRecursion,
        })
      : renderWikilinksLegacy(withAttachments);
    const rendered = marked.parse(withWikilinks, {
      async: false,
    }) as string;
    return { html: DOMPurify.sanitize(rendered), crossNoteEmbeds: crossNoteEmbedsOut };
  }, [
    source,
    mathRenderingEnabled,
    headingLinksEnabled,
    noteDir,
    workspaceRoot,
    currentHeadings,
    currentBlocks,
    notePath,
  ]);

  // marked.parse is synchronous, but resolving a placeholder src into a
  // real, loadable one (fileSrc, see workspace/tauriBridge.ts) is not. A
  // small worker queue bounds native reads on both desktop and Android.
  // Cancelling a stale render stops its workers before they schedule any
  // more queued reads; already-invoked reads may finish but cannot update
  // the obsolete DOM. Shared with the cross-note embed effect below (F04
  // Phase 4a), whose own newly-injected images need the exact same
  // grouped, bounded resolution, not a second copy of this logic.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>(`img[src^="${ATTACHMENT_SRC_PREFIX}"]`),
    );
    void resolveAttachmentImages(images, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [html]);

  // F04 Phase 4a: resolves each cross-note embed placeholder
  // `renderWikilinksStructured` emitted above (`data-lt-embed-id`, one
  // per `crossNoteEmbeds` entry) by reading its target note, extracting
  // the referenced section (`extractEmbedSection`, the same function the
  // synchronous same-note path already uses), rendering it, and replacing
  // the placeholder's "Loading…" body in place. A bounded worker pool,
  // the same convention and concurrency as the image-resolution effect
  // above, rather than one unbounded `Promise.all` over every embed in a
  // note at once. Any local images the resolved embed body itself
  // contains are queued through the same `resolveAttachmentImages` helper
  // immediately after insertion, since they were not yet part of the DOM
  // when the image effect above ran.
  //
  // F04 Phase 4b: `embedExtractionHtml`'s recursive render of a resolved
  // "ok" section can itself append further cross-note requests onto this
  // exact `crossNoteEmbeds` array (via each request's own `nextRecursion.
  // crossNoteEmbedsOut`, the same object reference the top-level render
  // started, not a fresh one per level), and each such newly-inserted
  // placeholder already exists in the DOM by the time `body.innerHTML` is
  // set below (the recursive render is synchronous). No second effect or
  // queue is needed: the worker loop below re-reads `crossNoteEmbeds.
  // length` on every iteration, so a still-running worker naturally picks
  // up entries appended after the effect started, the standard
  // growing-work-queue pattern.
  //
  // F04 Phase 4b follow-up 2: `resolveOne`'s own `readTextFile` call is
  // now raced against `EMBED_LOAD_TIMEOUT_MS` via
  // `readEmbedNoteWithTimeout`, so a single slow or hung native read
  // shows "Could not read embedded note" instead of leaving that one
  // embed frame on "Loading…" forever, independent of this effect's own
  // `cancelled` flag (which only covers a *newer preview generation*
  // superseding this one, not a single call within an otherwise-current
  // preview taking too long).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || crossNoteEmbeds.length === 0) return;
    let cancelled = false;

    const resolveOne = async (embedId: number, request: CrossNoteEmbedRequest) => {
      const body = container.querySelector<HTMLElement>(
        `[data-lt-embed-id="${embedId}"] .embed-frame-body`,
      );
      if (!body) return;

      let content: string;
      try {
        content = await readEmbedNoteWithTimeout(request.notePath, EMBED_LOAD_TIMEOUT_MS);
      } catch {
        if (cancelled) return;
        body.innerHTML = DOMPurify.sanitize('<p class="embed-frame-message">Could not read embedded note</p>');
        return;
      }
      if (cancelled) return;

      const extraction = extractEmbedSection(content, request.fragment, scanHeadings(content), scanBlockIds(content));
      const embedNoteDir = dirname(request.notePath);
      const bodyHtml = embedExtractionHtml(extraction, request.notePath, embedNoteDir, workspaceRoot, request.nextRecursion);
      // A fresh DOM mutation from freshly-read note content, outside the
      // synchronous render pass DOMPurify.sanitize(rendered) above already
      // covers: this is a second, genuinely necessary sanitize call, not
      // a redundant one.
      body.innerHTML = DOMPurify.sanitize(bodyHtml);

      const newImages = Array.from(
        body.querySelectorAll<HTMLImageElement>(`img[src^="${ATTACHMENT_SRC_PREFIX}"]`),
      );
      if (newImages.length > 0) void resolveAttachmentImages(newImages, () => cancelled);
    };

    let nextIndex = 0;
    const worker = async () => {
      while (!cancelled) {
        const index = nextIndex;
        if (index >= crossNoteEmbeds.length) return;
        nextIndex += 1;
        await resolveOne(index, crossNoteEmbeds[index]);
      }
    };
    const workerCount = Math.min(ATTACHMENT_READ_CONCURRENCY, crossNoteEmbeds.length);
    void Promise.allSettled(Array.from({ length: workerCount }, () => worker()));

    return () => {
      cancelled = true;
    };
  }, [html, crossNoteEmbeds, workspaceRoot]);

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
          // Same-note link ([[#Heading]]/[[#^block-id]], or the rare bare
          // [[|Label]] self-link): no note switch happens, so a resolved
          // fragment reveals directly against this note's own
          // already-scanned headings/blocks rather than round-tripping
          // through onOpenFile.
          if (parsed.fragmentKind === "heading" && parsed.fragment) {
            const match = resolveHeadingFragment(currentHeadings, parsed.fragment);
            if (match.status === "resolved") {
              requestOutlineReveal(match.heading.contentFrom, match.heading.contentTo);
            }
            // missing-fragment/ambiguous-fragment: no navigation, per
            // spec section 10.4's "never scroll to an arbitrary
            // similarly named target."
          } else if (parsed.fragmentKind === "block" && parsed.fragment) {
            const match = resolveBlockFragment(currentBlocks, parsed.fragment);
            if (match.status === "resolved") {
              requestOutlineReveal(match.block.contentFrom, match.block.contentTo);
            }
          }
          return;
        }

        const path = resolveWikilink(parsed.target);
        if (!path) return;

        if (parsed.fragmentKind === "heading" && parsed.fragment) {
          onOpenFile?.(path, fileNameFromPath(path), { headingKey: parsed.fragment });
        } else if (parsed.fragmentKind === "block" && parsed.fragment) {
          onOpenFile?.(path, fileNameFromPath(path), { blockId: parsed.fragment });
        } else {
          onOpenFile?.(path, fileNameFromPath(path));
        }
      }}
      onKeyDown={() => onDirectInteractionRef.current?.()}
    />
  );
}
