/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceProfile } from "./globalConfig";

const { MockWorkspaceForgetUnsavedWorkError, MockWorkspaceRelinkConflictError } = vi.hoisted(() => ({
  MockWorkspaceForgetUnsavedWorkError: class extends Error {},
  MockWorkspaceRelinkConflictError: class extends Error {
    constructor(public readonly conflictingProfileName: string) {
      super(`This folder is already used by workspace "${conflictingProfileName}".`);
      this.name = "WorkspaceRelinkConflictError";
    }
  },
}));

vi.mock("./store", () => ({
  workspaceProfiles: signal<WorkspaceProfile[]>([]),
  activeWorkspaceId: signal<string | null>(null),
  addWorkspaceFromPicker: vi.fn(async () => {}),
  forgetWorkspaceProfile: vi.fn(async () => {}),
  relinkWorkspaceProfile: vi.fn(async () => true),
  renameWorkspaceProfile: vi.fn(async () => true),
  setWorkspaceProfileIcon: vi.fn(async () => true),
  WorkspaceForgetUnsavedWorkError: MockWorkspaceForgetUnsavedWorkError,
  WorkspaceRelinkConflictError: MockWorkspaceRelinkConflictError,
}));

import { WorkspaceProfilesSettings } from "./WorkspaceProfilesSettings";
import {
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  relinkWorkspaceProfile,
  renameWorkspaceProfile,
  setWorkspaceProfileIcon,
  workspaceProfiles,
} from "./store";

const DESKTOP: WorkspaceProfile = {
  id: "desktop",
  name: "Research",
  icon: "book",
  path: "/home/me/Research",
  lastOpenedAt: 2,
};
const ANDROID: WorkspaceProfile = {
  id: "android",
  name: "Phone",
  icon: "folder",
  path: "/workspace",
  token: "content://com.android.externalstorage.documents/tree/secret",
  lastOpenedAt: 1,
};

afterEach(() => {
  cleanup();
  workspaceProfiles.value = [];
  activeWorkspaceId.value = null;
  vi.restoreAllMocks();
  vi.mocked(addWorkspaceFromPicker).mockReset().mockResolvedValue(undefined);
  vi.mocked(forgetWorkspaceProfile).mockReset().mockResolvedValue(undefined);
  vi.mocked(relinkWorkspaceProfile).mockReset().mockResolvedValue(true);
  vi.mocked(renameWorkspaceProfile).mockReset().mockResolvedValue(true);
  vi.mocked(setWorkspaceProfileIcon).mockReset().mockResolvedValue(true);
});

describe("WorkspaceProfilesSettings", () => {
  it("shows desktop locator text but never exposes an Android token or synthetic root", () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const { getByText, queryByText, container } = render(<WorkspaceProfilesSettings />);
    expect(getByText("/home/me/Research")).toBeTruthy();
    expect(queryByText("/workspace")).toBeNull();
    expect(container.textContent).not.toContain("content://");
  });

  it("renames with the strict store action and changes only to a bundled icon", async () => {
    workspaceProfiles.value = [DESKTOP];
    activeWorkspaceId.value = "desktop";
    vi.spyOn(window, "prompt").mockReturnValue("  New Research  ");
    const { getByText, getByLabelText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Rename"));
    await Promise.resolve();
    expect(renameWorkspaceProfile).toHaveBeenCalledWith("desktop", "  New Research  ");

    fireEvent.change(getByLabelText("Icon for Research"), { target: { value: "archive" } });
    expect(setWorkspaceProfileIcon).toHaveBeenCalledWith("desktop", "archive");
  });

  it("reports persistence failures for rename and icon edits instead of leaving rejected promises unhandled", async () => {
    workspaceProfiles.value = [DESKTOP];
    activeWorkspaceId.value = "desktop";
    vi.spyOn(window, "prompt").mockReturnValue("New Research");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(renameWorkspaceProfile).mockRejectedValueOnce(new Error("disk full"));
    vi.mocked(setWorkspaceProfileIcon).mockRejectedValueOnce(new Error("disk full"));

    const { getByText, getByLabelText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Rename"));
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledWith("Could not rename workspace profile. Try again.");

    fireEvent.change(getByLabelText("Icon for Research"), { target: { value: "archive" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledWith("Could not update workspace profile. Try again.");
  });

  it("offers Forget for both the active and an inactive profile", () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const { getAllByText } = render(<WorkspaceProfilesSettings />);
    expect(getAllByText("Forget")).toHaveLength(2);
    fireEvent.click(getAllByText("Forget")[1]);
    expect(forgetWorkspaceProfile).toHaveBeenCalledWith("android");
  });

  it("forgets the active profile via Forget when nothing is unsaved", async () => {
    workspaceProfiles.value = [DESKTOP];
    activeWorkspaceId.value = "desktop";
    const { getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Forget"));
    await Promise.resolve();
    expect(forgetWorkspaceProfile).toHaveBeenCalledWith("desktop");
  });

  it("offers a confirmed 'forget without saving' retry when unsaved work blocks forgetting the active profile", async () => {
    workspaceProfiles.value = [DESKTOP];
    activeWorkspaceId.value = "desktop";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(forgetWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceForgetUnsavedWorkError("unsaved"),
    );

    const { getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Forget"));
    await Promise.resolve();
    await Promise.resolve();

    expect(confirm).toHaveBeenCalled();
    expect(forgetWorkspaceProfile).toHaveBeenNthCalledWith(2, "desktop", { discardUnsaved: true });
  });

  it("does not retry forgetting the active profile when the unsaved-work confirmation is declined", async () => {
    workspaceProfiles.value = [DESKTOP];
    activeWorkspaceId.value = "desktop";
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(forgetWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceForgetUnsavedWorkError("unsaved"),
    );

    const { getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Forget"));
    await Promise.resolve();
    await Promise.resolve();

    expect(forgetWorkspaceProfile).toHaveBeenCalledTimes(1);
  });

  it("reports failed forget and add actions without leaving rejected promises unhandled", async () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(forgetWorkspaceProfile).mockRejectedValueOnce(new Error("disk full"));
    vi.mocked(addWorkspaceFromPicker).mockRejectedValueOnce(new Error("picker failure"));

    const { getAllByText, getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getAllByText("Forget")[1]);
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledWith("Could not forget workspace. Try again.");

    fireEvent.click(getByText("Add workspace"));
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledWith("Could not add workspace. Try again.");
  });

  it("routes Add workspace through the profile-aware picker flow", () => {
    workspaceProfiles.value = [DESKTOP];
    const { getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Add workspace"));
    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
  });

  it("offers Relink for both the active and an inactive profile", () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const { getAllByText } = render(<WorkspaceProfilesSettings />);
    expect(getAllByText("Relink")).toHaveLength(2);
  });

  it("relinks the profile whose row was clicked", () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const { getAllByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getAllByText("Relink")[1]);
    expect(relinkWorkspaceProfile).toHaveBeenCalledWith("android");
  });

  it("shows the conflicting profile's name instead of a generic failure for a relink conflict", async () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(relinkWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceRelinkConflictError("Phone"),
    );

    const { getAllByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getAllByText("Relink")[1]);
    await Promise.resolve();
    await Promise.resolve();

    expect(alert).toHaveBeenCalledWith(
      'This folder is already used by workspace "Phone".',
    );
  });

  it("reports a generic failure for any other relink error", async () => {
    workspaceProfiles.value = [DESKTOP];
    activeWorkspaceId.value = "desktop";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(relinkWorkspaceProfile).mockRejectedValueOnce(new Error("denied"));

    const { getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Relink"));
    await Promise.resolve();
    await Promise.resolve();

    expect(alert).toHaveBeenCalledWith("Could not relink workspace. Try again.");
  });
});
