/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTextFile, writeWorkspaceTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("not found");
  }),
  writeWorkspaceTextFile: vi.fn<
    (root: string, relativePath: string, contents: string) => Promise<void>
  >(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeWorkspaceTextFile,
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

// collectionStore.ts imports workspacePath from settings/store.ts, which
// reads window.matchMedia/document at module load time; same jsdom +
// dynamic-import setup as bookmarks/store.test.ts.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { workspacePath } = await import("../settings/store");
const { collectionsFile, createCollection, resetCollections } = await import("./collectionStore");
const { emptyQueryGroup } = await import("./collectionTypes");

describe("collectionStore: concurrent saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspacePath.value = "/workspace";
    resetCollections();
  });

  it("serializes overlapping saves so a later mutation's write never starts until the earlier one finishes", async () => {
    // Regression for: saveCollections called writeWorkspaceTextFile
    // immediately and independently on every invocation, with no
    // serialization between overlapping calls -- the same defect already
    // fixed in bookmarks/store.ts, whose shape this module was explicitly
    // modeled on. Two mutations fired in quick succession (e.g. create
    // then create, before the first write lands) produced two independent
    // native write calls; if those calls resolved out of order, the
    // earlier call's now-stale snapshot could land on disk after the later
    // one's, silently reverting the newer change even though
    // collectionsFile.value (and the UI) correctly showed both.
    let resolveFirstWrite!: () => void;
    let firstWriteStarted = false;
    let secondWriteStarted = false;

    writeWorkspaceTextFile.mockImplementationOnce(() => {
      firstWriteStarted = true;
      return new Promise<void>((resolve) => {
        resolveFirstWrite = resolve;
      });
    });
    writeWorkspaceTextFile.mockImplementationOnce((_root, _path, content: string) => {
      secondWriteStarted = true;
      // By the time the second (queued) write actually runs, it must
      // reflect the fully up-to-date state (both collections), not a stale
      // snapshot captured back when it was originally queued.
      expect(JSON.parse(content).collections).toHaveLength(2);
      return Promise.resolve();
    });

    const p1 = createCollection("First", emptyQueryGroup());
    await Promise.resolve();
    await Promise.resolve();
    expect(firstWriteStarted).toBe(true);

    const p2 = createCollection("Second", emptyQueryGroup());
    await Promise.resolve();
    await Promise.resolve();

    // The second mutation's write must not start while the first is still
    // in flight -- otherwise their native calls are two independent,
    // unserialized writes whose actual on-disk completion order is not
    // guaranteed to match invocation order.
    expect(secondWriteStarted).toBe(false);

    resolveFirstWrite();
    await p1;
    await p2;

    expect(secondWriteStarted).toBe(true);
    expect(collectionsFile.value.collections).toHaveLength(2);
  });
});
