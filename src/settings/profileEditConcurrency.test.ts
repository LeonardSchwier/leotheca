/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  drainWorkspaceOperations,
  getAppConfigFilePath,
  getAppVersion,
  listDir,
  pickWorkspaceFolder,
  readTextFile,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
  writeTextFile,
  writeWorkspaceTextFile,
} = vi.hoisted(() => ({
  drainWorkspaceOperations: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  pickWorkspaceFolder: vi.fn(async () => null),
  readTextFile: vi.fn(async () => {
    throw new Error("not found");
  }),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  writeTextFile: vi.fn(async () => {}),
  writeWorkspaceTextFile: vi.fn(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  drainWorkspaceOperations,
  getAppConfigFilePath,
  getAppVersion,
  listDir,
  pickWorkspaceFolder,
  readTextFile,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
  writeTextFile,
  writeWorkspaceTextFile,
}));

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const {
  activeWorkspaceId,
  renameWorkspaceProfile,
  setWorkspaceProfileIcon,
  workspaceProfiles,
} = await import("./store");

type Reject = (error: unknown) => void;

function failFirstConfigWrite(): { rejectFirst: () => void } {
  let reject: Reject | null = null;
  let configWrites = 0;
  writeTextFile.mockImplementation(async (path: string) => {
    if (path !== "/config/config.json") return;
    configWrites += 1;
    if (configWrites !== 1) return;
    await new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
  });
  return {
    rejectFirst: () => {
      if (!reject) throw new Error("first config write has not started");
      reject(new Error("disk full"));
    },
  };
}

async function waitForFirstConfigWrite(): Promise<void> {
  await vi.waitFor(() => {
    expect(writeTextFile).toHaveBeenCalledWith(
      "/config/config.json",
      expect.any(String),
    );
  });
}

describe("F20 Phase 2a profile edit persistence races", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeWorkspaceId.value = "p1";
    workspaceProfiles.value = [
      {
        id: "p1",
        name: "Original",
        icon: "folder",
        path: "/vault",
        lastOpenedAt: 1,
      },
    ];
  });

  it("does not let an older failed rename roll back a newer queued rename", async () => {
    const { rejectFirst } = failFirstConfigWrite();

    const older = renameWorkspaceProfile("p1", "First");
    await waitForFirstConfigWrite();
    const newer = renameWorkspaceProfile("p1", "Second");

    expect(workspaceProfiles.value[0].name).toBe("Second");
    rejectFirst();

    await expect(older).rejects.toThrow("disk full");
    await expect(newer).resolves.toBe(true);
    expect(workspaceProfiles.value[0].name).toBe("Second");

    const persisted = writeTextFile.mock.calls
      .filter(([path]) => path === "/config/config.json")
      .map(([, contents]) => JSON.parse(contents as string));
    expect(persisted).toHaveLength(2);
    expect(persisted[1].workspaceProfiles[0].name).toBe("Second");
  });

  it("does not let an older failed icon edit roll back a newer queued icon edit", async () => {
    const { rejectFirst } = failFirstConfigWrite();

    const older = setWorkspaceProfileIcon("p1", "book");
    await waitForFirstConfigWrite();
    const newer = setWorkspaceProfileIcon("p1", "briefcase");

    expect(workspaceProfiles.value[0].icon).toBe("briefcase");
    rejectFirst();

    await expect(older).rejects.toThrow("disk full");
    await expect(newer).resolves.toBe(true);
    expect(workspaceProfiles.value[0].icon).toBe("briefcase");

    const persisted = writeTextFile.mock.calls
      .filter(([path]) => path === "/config/config.json")
      .map(([, contents]) => JSON.parse(contents as string));
    expect(persisted).toHaveLength(2);
    expect(persisted[1].workspaceProfiles[0].icon).toBe("briefcase");
  });
});
