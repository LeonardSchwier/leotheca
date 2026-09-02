import { describe, expect, it } from "vitest";
import { beginFileOpenAuthority, isCurrentFileOpen } from "./fileOpenAuthority";
import { workspaceTransitions } from "./workspaceTransition";

describe("fileOpenAuthority", () => {
  it("a freshly begun authority is current", () => {
    const authority = beginFileOpenAuthority();
    expect(isCurrentFileOpen(authority)).toBe(true);
  });

  it("a later begin invalidates an earlier authority (latest-selection-wins)", () => {
    const first = beginFileOpenAuthority();
    expect(isCurrentFileOpen(first)).toBe(true);

    const second = beginFileOpenAuthority();
    expect(isCurrentFileOpen(first)).toBe(false);
    expect(isCurrentFileOpen(second)).toBe(true);
  });

  it("a synchronous open (e.g. an image tab) invalidates a slower request started before it", () => {
    // Simulates: a note click starts an async read, then the user
    // immediately clicks an image (which never itself awaits anything,
    // but still must call beginFileOpenAuthority to claim authority).
    const noteRequest = beginFileOpenAuthority();
    const imageRequest = beginFileOpenAuthority();
    expect(isCurrentFileOpen(noteRequest)).toBe(false);
    expect(isCurrentFileOpen(imageRequest)).toBe(true);
  });

  it("a workspace transition starting after an authority began invalidates it", async () => {
    const authority = beginFileOpenAuthority();
    expect(isCurrentFileOpen(authority)).toBe(true);

    // A transition's generation is bumped synchronously at the very
    // start of run(), before prepareOutgoing (which clears tabs) even
    // begins, so authority is already stale by the time any step runs.
    let sawStaleDuringPrepare = false;
    await workspaceTransitions.run({
      prepareOutgoing: async () => {
        sawStaleDuringPrepare = !isCurrentFileOpen(authority);
      },
      connectIncoming: async () => {},
      loadIncoming: async () => undefined,
      publishIncoming: () => {},
    });

    expect(sawStaleDuringPrepare).toBe(true);
    expect(isCurrentFileOpen(authority)).toBe(false);
  });

  it("an authority begun after a transition completes is current again", async () => {
    await workspaceTransitions.run({
      prepareOutgoing: async () => {},
      connectIncoming: async () => {},
      loadIncoming: async () => undefined,
      publishIncoming: () => {},
    });

    const authority = beginFileOpenAuthority();
    expect(isCurrentFileOpen(authority)).toBe(true);
  });

  it("an authority begun before a transition started, and never superseded by another open request, is still invalidated by the transition alone", async () => {
    const authority = beginFileOpenAuthority();

    await workspaceTransitions.run({
      prepareOutgoing: async () => {},
      connectIncoming: async () => {},
      loadIncoming: async () => undefined,
      publishIncoming: () => {},
    });

    expect(isCurrentFileOpen(authority)).toBe(false);
  });
});
