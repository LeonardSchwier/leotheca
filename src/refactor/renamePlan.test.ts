import { afterEach, describe, expect, it } from "vitest";
import { linkIndex, type LinkIndex } from "../linking/store";
import { parseWikiLinks } from "../linking/wikiSyntax";
import { planNoteRename } from "./renamePlan";

/** Builds a fixture `LinkIndex` and a matching `readNote` reader from the
 * same real note content, mirroring diagnostics.test.ts's own
 * `buildFixtureIndex` convention (real `parseWikiLinks` output, assigned
 * to the live `linkIndex` signal since `resolveWikiLinkTarget` reads it
 * directly). `liveNotes` defaults to `notes` itself; pass a second,
 * different map to simulate a note that changed on disk since the index
 * was last built (this module's own freshness guarantee). */
function fixture(notes: Record<string, string>, liveNotes: Record<string, string> = notes) {
  const wikiLinksByPath = new Map<string, ReturnType<typeof parseWikiLinks>>();
  const pathsByNoteName = new Map<string, string[]>();
  for (const [path, content] of Object.entries(notes)) {
    const links = parseWikiLinks(content);
    if (links.length > 0) wikiLinksByPath.set(path, links);
    const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "").toLocaleLowerCase();
    const existing = pathsByNoteName.get(name) ?? [];
    existing.push(path);
    pathsByNoteName.set(name, existing);
  }
  const index: LinkIndex = {
    backlinksByPath: new Map(),
    pathsByNoteName,
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
    wikiLinksByPath,
  };
  linkIndex.value = index;
  const readNote = async (path: string): Promise<string> => {
    if (!(path in liveNotes)) throw new Error(`not found: ${path}`);
    return liveNotes[path];
  };
  return { index, readNote };
}

afterEach(() => {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
  };
});

describe("planNoteRename", () => {
  it("plans a rewrite for a basename wikilink referencing the renamed note", async () => {
    const { index, readNote } = fixture({
      "/vault/Old Name.md": "content",
      "/vault/Referrer.md": "See [[Old Name]] for details.",
    });
    const plan = await planNoteRename("/vault/Old Name.md", "/vault/New Name.md", index, readNote);
    expect(plan.blocked).toEqual([]);
    expect(plan.edits).toHaveLength(1);
    const [edit] = plan.edits;
    expect(edit.path).toBe("/vault/Referrer.md");
    expect(edit.oldText).toBe("[[Old Name]]");
    expect(edit.newText).toBe("[[New Name]]");
  });

  it("preserves a fragment and label exactly, only rewriting the note target", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "## A heading",
      "/vault/Referrer.md": "See [[Old#A heading|a custom label]] above.",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits[0].newText).toBe("[[New#A heading|a custom label]]");
  });

  it("plans a rewrite for a same-basename move to a different folder", async () => {
    const { index, readNote } = fixture({
      "/vault/notes/Project.md": "content",
      "/vault/Referrer.md": "See [[Project]].",
    });
    const plan = await planNoteRename(
      "/vault/notes/Project.md",
      "/vault/archive/Project.md",
      index,
      readNote,
    );
    expect(plan.edits).toHaveLength(1);
    // Basename unchanged by the move, so the link text is unchanged too.
    expect(plan.edits[0].newText).toBe("[[Project]]");
  });

  it("finds every referring note across the workspace, not just the first", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "content",
      "/vault/A.md": "[[Old]]",
      "/vault/B.md": "Also [[Old]] here.",
      "/vault/C.md": "No reference here.",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits.map((e) => e.path).sort()).toEqual(["/vault/A.md", "/vault/B.md"]);
  });

  it("does not plan an edit for a reference in a different note that just happens to share syntax", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "content",
      "/vault/Other.md": "content",
      "/vault/Referrer.md": "[[Other]]",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toEqual([]);
  });

  it("never plans an edit inside the note actually being renamed", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "This note links to [[Old]] itself.",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  it("blocks a reference when the new name would be ambiguous with an existing note", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "content",
      "/vault/other/Taken.md": "content",
      "/vault/Referrer.md": "[[Old]]",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/moved/Taken.md", index, readNote);
    expect(plan.edits).toEqual([]);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0].reason).toMatch(/ambiguous/i);
    expect(plan.blocked[0].oldText).toBe("[[Old]]");
  });

  it("does not block on a rename that resolves its own former ambiguity", async () => {
    // Renaming to a name nothing else uses is never ambiguous, even
    // though pathsByNoteName still has a stale-looking multi-path entry
    // for the *old* name if two notes happened to share it.
    const { index, readNote } = fixture({
      "/vault/Old.md": "content",
      "/vault/Referrer.md": "[[Old]]",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/Unique New Name.md", index, readNote);
    expect(plan.blocked).toEqual([]);
    expect(plan.edits).toHaveLength(1);
  });

  it("re-reads fresh content and excludes a reference removed since the index was last built", async () => {
    const stale = { "/vault/Old.md": "content", "/vault/Referrer.md": "[[Old]]" };
    const live = { "/vault/Old.md": "content", "/vault/Referrer.md": "no longer references it" };
    const { index, readNote } = fixture(stale, live);
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toEqual([]);
  });

  it("cannot find a reference added to a note that had none at all when the index was last built (disclosed candidate-filter limitation)", async () => {
    // A deliberate, disclosed gap (see renamePlan.ts's own doc comment):
    // this module uses wikiLinksByPath purely as a candidate filter for
    // which notes are worth reading at all, so a note with zero
    // wikilinks at index-build time is never even considered a
    // candidate, no matter what it contains by the time this actually
    // runs. A full, guaranteed-fresh plan needs a real full-workspace
    // read, deferred to whichever phase wires this into the actual
    // Analyze step (spec 9.2), which can trigger a fresh
    // rebuildLinkIndex first.
    const stale = { "/vault/Old.md": "content", "/vault/Referrer.md": "no reference yet" };
    const live = { "/vault/Old.md": "content", "/vault/Referrer.md": "no reference yet, but now [[Old]] does" };
    const { index, readNote } = fixture(stale, live);
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toEqual([]);
  });

  it("uses the fresh offset, not a stale cached one, when content shifted since the index was built", async () => {
    const stale = { "/vault/Old.md": "content", "/vault/Referrer.md": "[[Old]] at the start" };
    const live = { "/vault/Old.md": "content", "/vault/Referrer.md": "Now with a prefix. [[Old]] at the start" };
    const { index, readNote } = fixture(stale, live);
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toHaveLength(1);
    const [edit] = plan.edits;
    expect(live["/vault/Referrer.md"].slice(edit.from, edit.to)).toBe("[[Old]]");
    expect(edit.from).toBe(live["/vault/Referrer.md"].indexOf("[[Old]]"));
  });

  it("silently skips a candidate note that can no longer be read", async () => {
    const { index } = fixture({
      "/vault/Old.md": "content",
      "/vault/Referrer.md": "[[Old]]",
    });
    const readNote = async (): Promise<string> => {
      throw new Error("permission denied");
    };
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  it("returns an empty plan when oldPath and newPath are the same", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "content",
      "/vault/Referrer.md": "[[Old]]",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/Old.md", index, readNote);
    expect(plan.edits).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  it("returns an empty plan when nothing in the workspace references the renamed note", async () => {
    const { index, readNote } = fixture({
      "/vault/Old.md": "content",
      "/vault/Unrelated.md": "no links here",
    });
    const plan = await planNoteRename("/vault/Old.md", "/vault/New.md", index, readNote);
    expect(plan.edits).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  it("matches a reference case-insensitively but rewrites to the note's real new casing", async () => {
    const { index, readNote } = fixture({
      "/vault/Old Name.md": "content",
      "/vault/Referrer.md": "[[old name]]",
    });
    const plan = await planNoteRename("/vault/Old Name.md", "/vault/New Name.md", index, readNote);
    expect(plan.edits[0].newText).toBe("[[New Name]]");
  });
});
