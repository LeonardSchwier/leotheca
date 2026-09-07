/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceProfile } from "./globalConfig";

const { MockWorkspaceRelinkConflictError } = vi.hoisted(() => ({
  MockWorkspaceRelinkConflictError: class extends Error {
    constructor(public readonly conflictingProfileName: string) {
      super(`This folder is already used by workspace "${conflictingProfileName}".`);
      this.name = "WorkspaceRelinkConflictError";
    }
  },
}));

vi.mock("./store", () => ({
  activateWorkspaceProfile: vi.fn(),
  activeWorkspaceId: signal<string | null>(null),
  addWorkspaceFromPicker: vi.fn(),
  relinkWorkspaceProfile: vi.fn(),
  workspaceProfiles: signal<WorkspaceProfile[]>([]),
  workspaceSelectionError: signal<string | null>(null),
  WorkspaceRelinkConflictError: MockWorkspaceRelinkConflictError,
}));

import { WelcomeDialog } from "./WelcomeDialog";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  relinkWorkspaceProfile,
  workspaceProfiles,
  workspaceSelectionError,
} from "./store";

const PROFILE_A: WorkspaceProfile = { id: "a", name: "Personal", icon: "folder", path: "/a", lastOpenedAt: 2 };
const PROFILE_B: WorkspaceProfile = { id: "b", name: "Work", icon: "briefcase", path: "/b", lastOpenedAt: 1 };

afterEach(() => {
  cleanup();
  workspaceProfiles.value = [];
  activeWorkspaceId.value = null;
  workspaceSelectionError.value = null;
  vi.mocked(addWorkspaceFromPicker).mockReset();
  vi.mocked(activateWorkspaceProfile).mockReset().mockResolvedValue(undefined);
  vi.mocked(relinkWorkspaceProfile).mockReset().mockResolvedValue(true);
});

describe("WelcomeDialog: no profiles at all (spec 9.4)", () => {
  it("shows the plain first-run experience", () => {
    const { getByText, queryByText } = render(<WelcomeDialog />);
    expect(getByText("Welcome to Leotheca")).toBeTruthy();
    expect(getByText("Choose Folder")).toBeTruthy();
    expect(queryByText("Add workspace")).toBeNull();
  });

  it("adds a workspace from the picker when Choose Folder is clicked", async () => {
    vi.mocked(addWorkspaceFromPicker).mockResolvedValue(undefined);
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
  });

  it("stays open and swallows a rejection so the user can retry", async () => {
    vi.mocked(addWorkspaceFromPicker).mockRejectedValue(new Error("boom"));
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(getByText("Choose Folder")).toBeTruthy();
  });
});

describe("WelcomeDialog: unavailable active profile (spec 17.2)", () => {
  it("names the profile and offers Retry and Relink", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByText } = render(<WelcomeDialog />);
    expect(getByText('Couldn\'t open "Personal"')).toBeTruthy();
    expect(getByText("Retry")).toBeTruthy();
    expect(getByText("Relink folder")).toBeTruthy();
  });

  it("retries by activating the same profile", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Retry"));
    await Promise.resolve();

    expect(activateWorkspaceProfile).toHaveBeenCalledWith("a");
  });

  it("relinks the failed profile", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Relink folder"));
    await Promise.resolve();

    expect(relinkWorkspaceProfile).toHaveBeenCalledWith("a");
  });

  it("shows the conflicting profile's name instead of a generic failure for a relink conflict", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(relinkWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceRelinkConflictError("Work"),
    );

    const { getByText } = render(<WelcomeDialog />);
    await fireEvent.click(getByText("Relink folder"));
    await Promise.resolve();
    await Promise.resolve();

    expect(alert).toHaveBeenCalledWith('This folder is already used by workspace "Work".');
  });

  it("lists the other known profiles to open instead", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByText, queryByText } = render(<WelcomeDialog />);
    expect(getByText("Or open a different workspace")).toBeTruthy();
    expect(getByText("Work")).toBeTruthy();
    expect(queryByText("Personal", { selector: ".workspace-switcher-row-name" })).toBeNull();
  });

  it("shows the actionable workspaceSelectionError from a failed retry", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    workspaceSelectionError.value = "Could not open that workspace: permission denied.";
    const { getByRole } = render(<WelcomeDialog />);
    expect(getByRole("alert").textContent).toBe("Could not open that workspace: permission denied.");
  });
});

describe("WelcomeDialog: profiles exist but none is active (spec 17.3)", () => {
  it("lists recent workspaces for one-click activation", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = null;
    const { getByText } = render(<WelcomeDialog />);
    expect(getByText("Open a workspace")).toBeTruthy();
    expect(getByText("Recent workspaces")).toBeTruthy();

    await fireEvent.click(getByText("Personal"));
    await Promise.resolve();

    expect(activateWorkspaceProfile).toHaveBeenCalledWith("a");
  });

  it("does not offer Retry/Relink when no profile is recognized as active", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = null;
    const { queryByText } = render(<WelcomeDialog />);
    expect(queryByText("Retry")).toBeNull();
    expect(queryByText("Relink folder")).toBeNull();
  });

  it("still offers Add workspace", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = null;
    vi.mocked(addWorkspaceFromPicker).mockResolvedValue(undefined);
    const { getByText } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Add workspace"));
    await Promise.resolve();

    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
  });
});
