/**
 * spec/f06-note-outline-heading-breadcrumbs.md section 7.5: while Split
 * view shows both Source and Preview at once, HeadingBreadcrumbs must
 * follow whichever pane the user actually, directly acted in last, not
 * always one fixed pane. This is a pure transition function (no
 * component state of its own) purely so the rule itself, "what does each
 * kind of event resolve to," is unit-testable without mounting App.tsx;
 * App.tsx owns the actual `useState<SplitAuthority>` and is responsible
 * for calling this on the right events and for only consulting the
 * result while Split view is the active view mode.
 */

export type SplitAuthority = "source" | "preview";

export type SplitAuthorityEvent =
  /** A real Source cursor or keyboard action: CodeMirror's own primary
   * selection head changed, including via a heading navigation (outline
   * row, breadcrumb segment), which the spec's own navigation example
   * (section 8.1) already resolves to Source focus outside Preview-only
   * view. */
  | "source-cursor"
  /** A real, direct Preview interaction: a scroll event, a click, or a
   * keydown, never the active-heading index being recomputed for some
   * unrelated reason (a note edit, a re-render). See MarkdownPreview's
   * `onDirectInteraction`. */
  | "preview-interaction"
  /** The active note changed. There is no earlier "last touched pane" to
   * honor for a note nobody has looked at yet, so authority resets to
   * the same Source default a fresh Split session always starts from. */
  | "note-changed";

/**
 * The only two real outcomes: a Preview interaction hands Preview
 * authority; every other event (a Source action, or a fresh note with no
 * interaction yet) resolves to Source. Deliberately stateless: the next
 * authority depends only on which event just happened, never on what the
 * authority already was, so there is no separate "current" input to get
 * out of sync with the caller's own state.
 */
export function nextSplitAuthority(event: SplitAuthorityEvent): SplitAuthority {
  return event === "preview-interaction" ? "preview" : "source";
}
