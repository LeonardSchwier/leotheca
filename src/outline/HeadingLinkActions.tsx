import { useEffect, useRef, useState } from "preact/hooks";
import type { HeadingRecord } from "../markdown/headings";
import { copyHeadingLink, headingLinkDisabledReason, insertHeadingLink } from "./headingLinkActions";

interface HeadingLinkActionsProps {
  heading: HeadingRecord;
  noteTitle: string;
  duplicate: boolean;
  /** Whether there is anywhere sensible to insert into right now (spec
   * section 9.4: "no insertion occurs when no writable editor has
   * focus"). Copy is unaffected by this: it only needs the clipboard. */
  canInsertLink: boolean;
  /** Called right after a successful insert, mirroring OutlinePanel's own
   * `onNavigated` prop, so a host that needs to make the editor visible
   * (switching out of a preview-only view) can do so. Omitted by
   * HeadingBreadcrumbs, whose own `canInsertLink` already guarantees an
   * editor is visible whenever this action is actually enabled. */
  onInserted?: () => void;
}

// spec section 9.2: "show a local confirmation." Long enough to read,
// short enough that a second real copy of a different heading doesn't
// feel stuck on the previous confirmation.
const COPY_CONFIRMATION_MS = 1500;

/**
 * F06 Phase 3 (spec/f06-note-outline-heading-breadcrumbs.md section 9):
 * copy-heading-link and insert-heading-link actions for one heading,
 * shared between OutlineRowContent and HeadingBreadcrumbs so the two
 * surfaces the spec asks for ("reachable from both the Outline panel and
 * the heading breadcrumbs") never drift apart in behavior, disabled
 * reasoning, or confirmation UX. Both actions build their link text
 * through outline/headingLinkActions.ts, which itself builds only
 * through wikiSyntax.ts's serializeWikiLink (F04's one allowed creator of
 * `[[...]]` link text).
 */
export function HeadingLinkActions({
  heading,
  noteTitle,
  duplicate,
  canInsertLink,
  onInserted,
}: HeadingLinkActionsProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const disabledReason = headingLinkDisabledReason(heading, duplicate);
  const headingLabel = heading.displayText || "heading";

  async function handleCopy() {
    await copyHeadingLink(heading, noteTitle);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
  }

  function handleInsert() {
    insertHeadingLink(heading);
    onInserted?.();
  }

  return (
    <div class="heading-link-actions">
      <button
        type="button"
        class="heading-link-action"
        disabled={!!disabledReason}
        title={disabledReason ?? `Copy link to "${headingLabel}"`}
        aria-label={disabledReason ?? `Copy link to ${headingLabel}`}
        onClick={() => void handleCopy()}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        class="heading-link-action"
        disabled={!!disabledReason || !canInsertLink}
        title={
          disabledReason ??
          (canInsertLink
            ? `Insert link to "${headingLabel}" at the cursor`
            : "Open this note in Source or Split view to insert a link here.")
        }
        aria-label={
          disabledReason ??
          (canInsertLink
            ? `Insert link to ${headingLabel} at the cursor`
            : `Insert link to ${headingLabel} (unavailable: no editor open)`)
        }
        onClick={handleInsert}
      >
        Insert link
      </button>
    </div>
  );
}
