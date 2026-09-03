/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceProfile } from "./globalConfig";

vi.mock("./store", () => ({
  workspaceProfiles: signal<WorkspaceProfile[]>([]),
  activeWorkspaceId: signal<string | null>(null),
  addWorkspaceFromPicker: vi.fn(),
  forgetWorkspaceProfile: vi.fn(),
  renameWorkspaceProfile: vi.fn(async () => true),
  setWorkspaceProfileIcon: vi.fn(async () => true),
}));

import { WorkspaceProfilesSettings } from "./WorkspaceProfilesSettings";
import {
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
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

  it("does not offer Forget for the active profile, but does for an inactive one", () => {
    workspaceProfiles.value = [DESKTOP, ANDROID];
    activeWorkspaceId.value = "desktop";
    const { getByText, getAllByText } = render(<WorkspaceProfilesSettings />);
    expect(getAllByText("Forget")).toHaveLength(1);
    fireEvent.click(getByText("Forget"));
    expect(forgetWorkspaceProfile).toHaveBeenCalledWith("android");
  });

  it("routes Add workspace through the profile-aware picker flow", () => {
    workspaceProfiles.value = [DESKTOP];
    const { getByText } = render(<WorkspaceProfilesSettings />);
    fireEvent.click(getByText("Add workspace"));
    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
  });
});
