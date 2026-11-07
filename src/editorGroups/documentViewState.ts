/** Per-path source-selection and scroll position, kept in memory only
 * (spec `f07-split-panes-pinned-tabs.md` section 9.2: "View state is
 * session memory keyed by path. It moves with the tab. It is not
 * persisted across app restarts in the first release."). Bounded LRU
 * (section 19: "Per-document view... caches are bounded, with
 * least-recently-used eviction"), by count rather than a size estimate:
 * each entry is four numbers, so a 200-entry cap is a trivial memory cost
 * regardless of document size.
 *
 * Deliberately position-only, not a cached CodeMirror `EditorState`: the
 * spec's own "preferred architecture" (section 11.3) is a retained
 * `EditorState` per open document, which would also preserve undo
 * history, but MarkdownEditor.tsx's existing path-switch effect
 * intentionally discards undo history on every file switch today (its own
 * comment: "a genuinely fresh document and a fresh (empty) history for
 * the file just opened"), for every tab switch, not only a cross-group
 * move -- a pre-existing, already-shipped behavior this module does not
 * change. Caching only plain numbers here, guarded by a doc-length check
 * before ever being applied, keeps this addition low-risk: a stale or
 * out-of-range entry is simply ignored, never applied into content it no
 * longer matches. Full undo-history preservation remains open, disclosed
 * in this repository's roadmap rather than attempted alongside this.
 */

export interface DocumentViewState {
  anchor: number;
  head: number;
  scrollTop: number;
  /** The document length this position was captured against. A cheap,
   * conservative staleness guard: if the note's content length has
   * changed since (an edit, an external change, a different revision),
   * the cached position is discarded rather than applied somewhere it no
   * longer corresponds to. */
  docLength: number;
}

const MAX_ENTRIES = 200;
const cache = new Map<string, DocumentViewState>();

/** Records `path`'s current position, most-recently-used. */
export function saveDocumentViewState(path: string, state: DocumentViewState): void {
  cache.delete(path);
  cache.set(path, state);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Returns `path`'s cached position only if the caller's current document
 * length still matches what it was captured against; otherwise `undefined`,
 * exactly as if nothing had ever been cached. */
export function getDocumentViewState(path: string, currentDocLength: number): DocumentViewState | undefined {
  const state = cache.get(path);
  if (!state || state.docLength !== currentDocLength) return undefined;
  return state;
}

/** Drops a path's cached position, e.g. once its tab has closed for good. */
export function clearDocumentViewState(path: string): void {
  cache.delete(path);
}

export function __resetDocumentViewStateForTests(): void {
  cache.clear();
}
