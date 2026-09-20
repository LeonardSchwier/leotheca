/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkIndex, type LinkIndex } from "../linking/store";
import { openDocuments, editorLayout } from "../workspace/store";
import { parseWikiLinks } from "../linking/wikiSyntax";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";
import { useRenamePreview } from "./useRenamePreview";

// Mock tauriBridge before importing useRenamePreview (which imports it).
// readTextFile is a vi.fn so tests can assert on / configure it via
// `await import("../workspace/tauriBridge")` at the call site.
vi.mock("../workspace/tauriBridge", () => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("unexpected readTextFile call");
  }),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(async () => {}),
  updateFavoritesWidget: vi.fn(async () => {}),
  writeWorkspaceTextFile: vi.fn(async () => {}),
}));
vi.mock("../settings/store", () => ({
  updateWorkspaceSettings: vi.fn(async () => {}),
  workspaceSettings: { value: { ...DEFAULT_WORKSPACE_SETTINGS, frontmatterAliasesEnabled: true, tagsEnabled: true } },
}));

const { readTextFile } = await import("../workspace/tauriBridge");
const mockReadTextFile = vi.mocked(readTextFile);

const previewOpts = {
  workspaceRoot: "/workspace",
  editorLayout: editorLayout.value,
  workspaceSettings: { ...DEFAULT_WORKSPACE_SETTINGS, frontmatterAliasesEnabled: true, tagsEnabled: true },
  aliasesEnabled: true,
  tagsEnabled: true,
};

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
  mockReadTextFile.mockClear();
});

describe("useRenamePreview", () => {
  it("resolves true immediately, with no preview, for a non-note path", async () => {
    linkIndex.value = indexWithBacklink("/vault/referrer.md", "See [[target]].");
    const { result } = renderHook(() => useRenamePreview(previewOpts));

    let proceed: boolean | undefined;
    await act(async () => {
      proceed = await result.current.confirmRenameWithPreview("/vault/image.png", "renamed.png");
    });

    expect(proceed).toBe(true);
    expect(result.current.preview).toBeNull();
    expect(mockReadTextFile).not.toHaveBeenCalled();
  });

  it("resolves true immediately, with no preview, when nothing references the renamed note", async () => {
    linkIndex.value = emptyIndex();
    const { result } = renderHook(() => useRenamePreview(previewOpts));

    let proceed: boolean | undefined;
    await act(async () => {
      proceed = await result.current.confirmRenameWithPreview("/vault/target.md", "renamed.md");
    });

    expect(proceed).toBe(true);
    expect(result.current.preview).toBeNull();
  });

  it("shows a preview with the computed new path and plan when a reference exists, resolving only once continued", async () => {
    linkIndex.value = indexWithBacklink("/vault/referrer.md", "See [[target]].");
    mockReadTextFile.mockResolvedValue("See [[target]].");
    const { result } = renderHook(() => useRenamePreview(previewOpts));

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
    mockReadTextFile.mockResolvedValue("See [[target]].");
    const { result } = renderHook(() => useRenamePreview(previewOpts));

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

  it("shows a preview when the plan has only Markdown-link edits, with zero wikilink edits/blocked", async () => {
    // The referrer's own wikilink is to an unrelated note ([[Unrelated]]),
    // purely so the referrer becomes a wikilink-scan candidate (see
    // renamePlan.ts's own doc comment); the actual reference to the note
    // being renamed is the Markdown-style link, and only that one.
    const referrerPath = "/vault/referrer.md";
    const referrerContent = "See [[Unrelated]] and [a link](target.md).";
    linkIndex.value = {
      ...emptyIndex(),
      wikiLinksByPath: new Map([[referrerPath, parseWikiLinks(referrerContent)]]),
      pathsByNoteName: new Map([
        ["target", ["/vault/target.md"]],
        ["referrer", [referrerPath]],
      ]),
    };
    mockReadTextFile.mockResolvedValue(referrerContent);
    const { result } = renderHook(() => useRenamePreview(previewOpts));

    let proceed: boolean | undefined;
    act(() => {
      void result.current
        .confirmRenameWithPreview("/vault/target.md", "renamed.md")
        .then((value) => (proceed = value));
    });

    await waitFor(() => expect(result.current.preview).not.toBeNull());
    expect(result.current.preview?.plan.edits).toHaveLength(0);
    expect(result.current.preview?.plan.blocked).toHaveLength(0);
    expect(result.current.preview?.plan.markdownEdits).toHaveLength(1);
    expect(proceed).toBeUndefined();

    act(() => result.current.continueRename());
    await waitFor(() => expect(proceed).toBe(true));
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
    mockReadTextFile.mockResolvedValue("no links here");
    openDocuments.value = [
      {
        path: "/vault/referrer.md",
        name: "referrer.md",
        kind: "text",
        content: "See [[target]].",
        dirty: true,
        saving: false,
        saveError: null,
      },
    ];
    const { result } = renderHook(() => useRenamePreview(previewOpts));

    act(() => {
      void result.current.confirmRenameWithPreview("/vault/target.md", "renamed.md");
    });

    await waitFor(() => expect(result.current.preview).not.toBeNull());
    expect(mockReadTextFile).not.toHaveBeenCalled();
    expect(result.current.preview?.plan.edits).toHaveLength(1);
  });
});
