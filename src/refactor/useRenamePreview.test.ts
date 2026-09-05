/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkIndex, type LinkIndex } from "../linking/store";
import { openDocuments } from "../workspace/store";
import { parseWikiLinks } from "../linking/wikiSyntax";
import { useRenamePreview } from "./useRenamePreview";

const { readTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("unexpected readTextFile call");
  }),
}));

vi.mock("../workspace/tauriBridge", () => ({ readTextFile }));

function emptyIndex(): LinkIndex {
  return {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
  };
}

/** A one-note-referencing-another fixture, mirroring renamePlan.test.ts's
 * own `fixture` convention (real parseWikiLinks output on the live
 * linkIndex signal, since resolveWikiLinkTarget reads it directly). */
function indexWithBacklink(referrerPath: string, referrerContent: string): LinkIndex {
  const wikiLinksByPath = new Map([[referrerPath, parseWikiLinks(referrerContent)]]);
  const pathsByNoteName = new Map([["target", ["/vault/target.md"]], ["referrer", [referrerPath]]]);
  return { ...emptyIndex(), pathsByNoteName, wikiLinksByPath };
}

afterEach(() => {
  linkIndex.value = emptyIndex();
  openDocuments.value = [];
  readTextFile.mockClear();
});

describe("useRenamePreview", () => {
  it("resolves true immediately, with no preview, for a non-note path", async () => {
    linkIndex.value = indexWithBacklink("/vault/referrer.md", "See [[target]].");
    const { result } = renderHook(() => useRenamePreview());

    let proceed: boolean | undefined;
    await act(async () => {
      proceed = await result.current.confirmRenameWithPreview("/vault/image.png", "renamed.png");
    });

    expect(proceed).toBe(true);
    expect(result.current.preview).toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("resolves true immediately, with no preview, when nothing references the renamed note", async () => {
    linkIndex.value = emptyIndex();
    const { result } = renderHook(() => useRenamePreview());

    let proceed: boolean | undefined;
    await act(async () => {
      proceed = await result.current.confirmRenameWithPreview("/vault/target.md", "renamed.md");
    });

    expect(proceed).toBe(true);
    expect(result.current.preview).toBeNull();
  });

  it("shows a preview with the computed new path and plan when a reference exists, resolving only once continued", async () => {
    linkIndex.value = indexWithBacklink("/vault/referrer.md", "See [[target]].");
    readTextFile.mockResolvedValue("See [[target]].");
    const { result } = renderHook(() => useRenamePreview());

    let proceed: boolean | undefined;
    act(() => {
      void result.current
        .confirmRenameWithPreview("/vault/target.md", "renamed.md")
        .then((value) => (proceed = value));
    });

    await waitFor(() => expect(result.current.preview).not.toBeNull());
    expect(result.current.preview?.oldPath).toBe("/vault/target.md");
    expect(result.current.preview?.newPath).toBe("/vault/renamed.md");
    expect(result.current.preview?.plan.edits).toHaveLength(1);
    expect(proceed).toBeUndefined();

    act(() => result.current.continueRename());

    await waitFor(() => expect(proceed).toBe(true));
    expect(result.current.preview).toBeNull();
  });

  it("resolves false and clears the preview when the user cancels", async () => {
    linkIndex.value = indexWithBacklink("/vault/referrer.md", "See [[target]].");
    readTextFile.mockResolvedValue("See [[target]].");
    const { result } = renderHook(() => useRenamePreview());

    let proceed: boolean | undefined;
    act(() => {
      void result.current
        .confirmRenameWithPreview("/vault/target.md", "renamed.md")
        .then((value) => (proceed = value));
    });
    await waitFor(() => expect(result.current.preview).not.toBeNull());

    act(() => result.current.cancelRename());

    await waitFor(() => expect(proceed).toBe(false));
    expect(result.current.preview).toBeNull();
  });

  it("reads an open tab's live content instead of disk for a candidate note", async () => {
    // The index's own candidate-filter snapshot must still show the
    // reference (planNoteRename's freshness guarantee never trusts this
    // for the actual plan, only to decide which notes are worth reading
    // at all, see renamePlan.ts's own doc comment); readTextFile is set
    // up to return content with no reference at all, so this test would
    // fail with 0 edits, not silently pass, if the open tab's own newer
    // content were ever bypassed in favor of a disk read.
    linkIndex.value = indexWithBacklink("/vault/referrer.md", "See [[target]].");
    readTextFile.mockResolvedValue("no links here");
    openDocuments.value = [
      {
        path: "/vault/referrer.md",
        name: "referrer.md",
        kind: "text",
        content: "See [[target]].",
        dirty: true,
        saveError: null,
      },
    ];
    const { result } = renderHook(() => useRenamePreview());

    act(() => {
      void result.current.confirmRenameWithPreview("/vault/target.md", "renamed.md");
    });

    await waitFor(() => expect(result.current.preview).not.toBeNull());
    expect(readTextFile).not.toHaveBeenCalled();
    expect(result.current.preview?.plan.edits).toHaveLength(1);
  });
});
