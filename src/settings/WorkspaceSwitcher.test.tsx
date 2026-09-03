/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceProfile } from "./globalConfig";

vi.mock("./store", () => ({
  workspaceProfiles: signal<WorkspaceProfile[]>([]),
  activeWorkspaceId: signal<string | null>(null),
  activateWorkspaceProfile: vi.fn(),
  addWorkspaceFromPicker: vi.fn(),
  forgetWorkspaceProfile: vi.fn(),
}));

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  workspaceProfiles,
} from "./store";

const PROFILE_A: WorkspaceProfile = { id: "a", name: "Personal", icon: "folder", path: "/a", lastOpenedAt: 2 };
const PROFILE_B: WorkspaceProfile = { id: "b", name: "Work", icon: "briefcase", path: "/b", lastOpenedAt: 1 };

afterEach(() => {
  cleanup();
  workspaceProfiles.value = [];
  activeWorkspaceId.value = null;
  vi.mocked(activateWorkspaceProfile).mockReset();
  vi.mocked(addWorkspaceFromPicker).mockReset();
  vi.mocked(forgetWorkspaceProfile).mockReset();
});

describe("WorkspaceSwitcher", () => {
  it("shows 'Open workspace' when no profile is active", () => {
    const { getByLabelText } = render(<WorkspaceSwitcher />);
    expect(getByLabelText("Open workspace")).toBeTruthy();
  });

  it("shows the active profile's name as the trigger label", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByText } = render(<WorkspaceSwitcher />);
    expect(getByLabelText("Switch workspace")).toBeTruthy();
    expect(getByText("Personal")).toBeTruthy();
  });

  it("opens the menu listing every profile, checkmarking the active one", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByRole, getAllByRole } = render(<WorkspaceSwitcher />);

    fireEvent.click(getByLabelText("Switch workspace"));

    expect(getByRole("listbox")).toBeTruthy();
    expect(getAllByRole("option")).toHaveLength(2);
  });

  it("activates a profile when its row is clicked and closes the menu", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByText, queryByRole } = render(<WorkspaceSwitcher />);

    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByText("Work"));
    await Promise.resolve();

    expect(activateWorkspaceProfile).toHaveBeenCalledWith("b");
    expect(queryByRole("listbox")).toBeNull();
  });

  it("does not show a Forget button for the active profile, only for others", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, queryByLabelText } = render(<WorkspaceSwitcher />);

    fireEvent.click(getByLabelText("Switch workspace"));

    expect(queryByLabelText("Forget Personal")).toBeNull();
    expect(getByLabelText("Forget Work")).toBeTruthy();
  });

  it("forgets a non-active profile via its Forget button", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText } = render(<WorkspaceSwitcher />);

    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByLabelText("Forget Work"));
    await Promise.resolve();

    expect(forgetWorkspaceProfile).toHaveBeenCalledWith("b");
  });

  it("calls addWorkspaceFromPicker and closes the menu when Add workspace is clicked", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByText, queryByRole } = render(<WorkspaceSwitcher />);

    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByText("+ Add workspace"));
    await Promise.resolve();

    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
    expect(queryByRole("listbox")).toBeNull();
  });

  it("closes the menu on Escape and returns focus to the trigger", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, queryByRole } = render(<WorkspaceSwitcher />);
    const trigger = getByLabelText("Switch workspace");

    fireEvent.click(trigger);
    expect(queryByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the menu when clicking outside it", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, queryByRole } = render(<WorkspaceSwitcher />);

    fireEvent.click(getByLabelText("Switch workspace"));
    expect(queryByRole("listbox")).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(queryByRole("listbox")).toBeNull();
  });

  it("shows an empty-state message when there are no profiles yet", () => {
    const { getByLabelText, getByText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Open workspace"));
    expect(getByText("No workspaces yet")).toBeTruthy();
  });
});
