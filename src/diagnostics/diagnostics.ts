/**
 * F03 Phase 1's workspace-wide, read-only link-integrity diagnostics
 * (spec/f03-link-integrity-refactor-center.md section 8, narrowed to a
 * first slice per this claim's own roadmap entry). Classifies every
 * structured wikilink (`linking/wikiSyntax.ts`'s `parseWikiLinks`, plain
 * `[[Note]]` and F04 Phase 1's `[[Note#Heading]]` forms) found across the
 * workspace, reusing `linking/wikiResolver.ts`'s `resolveWikiLinkTarget`/
 * `resolveHeadingFragment` rather than a second resolution
 * implementation, per this claim's own instruction.
 *
 * A pure function over `LinkIndex`, not a second signal/store module: F02
 * Phase 1 already established the precedent of extending
 * `linking/store.ts`'s single workspace read pass with new per-note data
 * (`tasksByPath`) rather than a second workspace walk; F03 Phase 1
 * continues that precedent with `wikiLinksByPath`/`headingsByPath` (see
 * their doc comments in store.ts). Diagnostics are then just a downstream
 * computation over data the index already holds, costing no extra file
 * I/O and no extra parsing beyond what `rebuildLinkIndex` already does
 * for its own purposes. This module never reads a file itself.
 *
 * Scope, matching the roadmap claim's own narrowing: plain and
 * heading-link wikilinks only, not Markdown-style `[text](path)` links,
 * canvas file references, or application metadata (spec sections 6.2-6.4,
 * later phases). Not diagnosed here, for the same reason
 * `wikiResolver.ts` itself doesn't resolve them yet: block-id fragments
 * (`[[Note#^block-id]]`, F04 Phase 2 scope) and ambiguous-note detection
 * (spec's `ambiguous-note` diagnostic requires knowing every candidate
 * path a basename could match, but `linking/store.ts`'s `resolveWikilink`
 * deliberately picks the first match today; changing that resolution
 * behavior is out of scope for a read-only diagnostics claim and would
 * risk changing what every other consumer of `resolveWikilink` already
 * depends on). Only the four statuses this claim's own scope names are
 * classified: "resolved", "broken", "missing-heading", and
 * "ambiguous-heading". A malformed wikilink (spec 5.2's "a recognized
 * `#`/`^` fragment marker with nothing after it", e.g. `[[Note#]]`) is
 * bucketed under "broken" rather than a fifth status: it is exactly as
 * unusable as a link to a nonexistent note, and the roadmap claim's own
 * description ("broken, ambiguous, and invalid local references") never
 * promised a distinct label for it, just that it wouldn't be silently
 * dropped from the results.
 */

import type { LinkIndex } from "../linking/store";
import { resolveWikiLinkTarget } from "../linking/wikiResolver";
import type { WikiLinkRecord } from "../linking/wikiSyntax";
import type { HeadingRecord } from "../markdown/headings";

/**
 * IMPORTANT: `resolveWikiLinkTarget` resolves a link's note portion via
 * `linking/store.ts`'s `resolveWikilink`, which always reads the live
 * `linkIndex` signal directly, not any index passed as an argument (see
 * that module). `classifyWikiLink`/`computeWorkspaceLinkDiagnostics`
 * below therefore only classify correctly when `index` already IS the
 * current `linkIndex.value` (true for every real call site: this
 * module's own caller always passes `linkIndex.value` straight through,
 * see `DiagnosticsPanel.tsx`). A test that builds its own fixture
 * `LinkIndex` must also assign it to the real `linkIndex.value` signal
 * before calling either function, the same way `wikiResolver.test.ts`'s
 * own fixtures do; see `diagnostics.test.ts`'s `buildFixtureIndex`.
 */

export type LinkDiagnosisStatus =
  | "resolved"
  | "broken"
  | "missing-heading"
  | "ambiguous-heading";

export interface LinkDiagnosis {
  status: LinkDiagnosisStatus;
  /** The resolved target note's path, when one was found. Present for
   * "resolved", "missing-heading", and "ambiguous-heading" (the note
   * itself exists in every one of those cases); absent for "broken". */
  notePath?: string;
  /** Every heading in the target note sharing the fragment's normalized
   * key, present only for "ambiguous-heading" (spec 6.3: show every
   * candidate rather than silently picking one). */
  candidateHeadings?: HeadingRecord[];
}

/**
 * Classifies a single parsed wikilink record against the shared resolver.
 * `sourcePath` is the path of the note the record was found in, used both
 * to resolve a same-note (`noteTarget === ""`) target and to look up the
 * target note's own headings from `index.headingsByPath` for fragment
 * verification, without re-reading or re-parsing either note's content:
 * both notes' structured data already live in `index` from
 * `rebuildLinkIndex`'s own read pass.
 *
 * Resolves in two steps, mirroring `MarkdownPreview.tsx`'s own use of
 * `resolveWikiLinkTarget` (see that file): a first call with no
 * `targetHeadings` establishes which note (if any) the link's note
 * portion resolves to, then, only for a heading fragment, a second call
 * supplies that note's headings so the fragment itself can be verified.
 * Two pure, in-memory resolver calls, not two file reads.
 */
export function classifyWikiLink(
  record: WikiLinkRecord,
  sourcePath: string,
  index: LinkIndex,
): LinkDiagnosis {
  if (record.parseStatus === "malformed") return { status: "broken" };

  const preliminary = resolveWikiLinkTarget(record, { currentNotePath: sourcePath });
  if (preliminary.status === "missing-note" || preliminary.status === "malformed") {
    return { status: "broken" };
  }

  // preliminary.status is "resolved" here: either no fragment, a block
  // fragment (not verified in this phase, see this file's header
  // comment), or a heading fragment not yet checked against the target
  // note's headings.
  if (!record.fragment || record.fragment.kind === "block") {
    return { status: "resolved", notePath: preliminary.notePath };
  }

  const targetHeadings = preliminary.notePath
    ? (index.headingsByPath?.get(preliminary.notePath) ?? [])
    : [];
  const final = resolveWikiLinkTarget(record, {
    currentNotePath: sourcePath,
    targetHeadings,
  });

  if (final.status === "resolved") return { status: "resolved", notePath: final.notePath };
  if (final.status === "missing-fragment") {
    return { status: "missing-heading", notePath: final.notePath };
  }
  if (final.status === "ambiguous-fragment") {
    return {
      status: "ambiguous-heading",
      notePath: final.notePath,
      candidateHeadings: final.candidateHeadings,
    };
  }
  // Unreachable in practice: resolveWikilink(record.noteTarget) is a pure
  // function of the same inputs both calls share, so the note-resolution
  // outcome can't diverge between the preliminary and final call. Kept as
  // an explicit, honest fallback rather than a silent cast, per this
  // codebase's "no unglamorous branch left implicit" convention.
  return { status: "broken" };
}

export interface WorkspaceLinkDiagnostic {
  /** Stable within one computation (source path + exact source offset),
   * not persisted or generation-scoped like the spec's own eventual
   * `WorkspaceDiagnostic.id` (section 8.2, a later phase's concern once
   * more diagnostic types exist); good enough for a React/Preact list key
   * and for tests. */
  id: string;
  sourcePath: string;
  status: Exclude<LinkDiagnosisStatus, "resolved">;
  /** The link's complete raw source text, brackets included (e.g.
   * `[[Note#Heading]]`), for display. */
  linkText: string;
  sourceFrom: number;
  sourceTo: number;
  targetNotePath?: string;
  candidateHeadings?: HeadingRecord[];
}

/**
 * Computes every non-clean wikilink finding across the whole workspace,
 * sorted by source path then source position for a stable, deterministic
 * list (matching `tasks/TaskHubPanel.tsx`'s own `flattenTasks` ordering
 * convention). Only findings are returned, not clean "resolved" links: a
 * diagnostics list is a list of problems, the same convention the spec's
 * own Diagnostics Center follows (section 8.1's table only lists
 * diagnostic types, not a "no issue" entry).
 */
export function computeWorkspaceLinkDiagnostics(index: LinkIndex): WorkspaceLinkDiagnostic[] {
  const diagnostics: WorkspaceLinkDiagnostic[] = [];
  const wikiLinksByPath = index.wikiLinksByPath ?? new Map<string, WikiLinkRecord[]>();
  for (const [sourcePath, records] of wikiLinksByPath) {
    for (const record of records) {
      const diagnosis = classifyWikiLink(record, sourcePath, index);
      if (diagnosis.status === "resolved") continue;
      diagnostics.push({
        id: `${sourcePath}#${record.sourceFrom}`,
        sourcePath,
        status: diagnosis.status,
        linkText: record.raw,
        sourceFrom: record.sourceFrom,
        sourceTo: record.sourceTo,
        targetNotePath: diagnosis.notePath,
        candidateHeadings: diagnosis.candidateHeadings,
      });
    }
  }
  return diagnostics.sort(
    (a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sourceFrom - b.sourceFrom,
  );
}
