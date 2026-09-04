/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceProfile } from "./globalConfig";
import {
  workspaceAddRequest,
  workspaceManageRequest,
  workspaceSwitcherOpenRequest,
} from "./workspaceSwitcherControl";

const { MockWorkspaceForgetUnsavedWorkError } = vi.hoisted(() => ({
  MockWorkspaceForgetUnsavedWorkError: class extends Error {},
}));

vi.mock("./store", () => ({
  workspaceProfiles: signal<WorkspaceProfile[]>([]),
  activeWorkspaceId: signal<string | null>(null),
  settingsPanelOpen: signal(false),
  activateWorkspaceProfile: vi.fn(async () => {}),
  addWorkspaceFromPicker: vi.fn(async () => {}),
  forgetWorkspaceProfile: vi.fn(async () => {}),
  WorkspaceForgetUnsavedWorkError: MockWorkspaceForgetUnsavedWorkError,
}));

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  settingsPanelOpen,
  workspaceProfiles,
} from "./store";

const PROFILE_A: WorkspaceProfile = { id: "a", name: "Personal", icon: "folder", path: "/a", lastOpenedAt: 2 };
const PROFILE_B: WorkspaceProfile = { id: "b", name: "Work", icon: "briefcase", path: "/b", lastOpenedAt: 1 };
const PROFILE_ANDROID: WorkspaceProfile = {
  id: "c",
  name: "Phone",
  icon: "folder",
  path: "/workspace",
  token: "content://secret/tree",
  lastOpenedAt: 0,
};

afterEach(() => {
  cleanup();
  workspaceProfiles.value = [];
  activeWorkspaceId.value = null;
  settingsPanelOpen.value = false;
  workspaceSwitcherOpenRequest.value = 0;
  workspaceAddRequest.value = 0;
  workspaceManageRequest.value = 0;
  vi.mocked(activateWorkspaceProfile).mockReset().mockResolvedValue(undefined);
  vi.mocked(addWorkspaceFromPicker).mockReset().mockResolvedValue(undefined);
  vi.mocked(forgetWorkspaceProfile).mockReset().mockResolvedValue(undefined);
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

  it("opens the dialog listing every profile and announces the active one", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByRole, getAllByRole } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    expect(getByRole("dialog", { name: "Workspaces" })).toBeTruthy();
    expect(getAllByRole("listitem")).toHaveLength(2);
    expect(getByRole("listitem", { name: "Personal, current workspace" })).toBeTruthy();
  });

  it("positions the dialog from the trigger rect so toolbar overflow cannot clip it", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByRole } = render(<WorkspaceSwitcher />);
    const trigger = getByLabelText("Switch workspace");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 24,
      width: 140,
      height: 40,
      top: 24,
      right: 260,
      bottom: 64,
      left: 120,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);
    const dialog = getByRole("dialog", { name: "Workspaces" });
    expect(dialog.style.top).toBe("68px");
    expect(dialog.style.left).toBe("120px");
  });

  it("activates a profile when its row is clicked and closes the dialog", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByText, queryByRole } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByText("Work"));
    await Promise.resolve();
    expect(activateWorkspaceProfile).toHaveBeenCalledWith("b");
    expect(queryByRole("dialog", { name: "Workspaces" })).toBeNull();
  });

  it("selecting the already-active profile closes without a filesystem activation", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByRole } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    const activeRow = getByRole("listitem", { name: "Personal, current workspace" });
    fireEvent.click(within(activeRow).getByRole("button", { name: /^Personal/ }));
    await Promise.resolve();
    expect(activateWorkspaceProfile).not.toHaveBeenCalled();
  });

  it("shows a Forget button for every profile, including the active one", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    expect(getByLabelText("Forget Personal")).toBeTruthy();
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

  it("forgets the active profile via its Forget button when nothing is unsaved", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByLabelText("Forget Personal"));
    await Promise.resolve();
    expect(forgetWorkspaceProfile).toHaveBeenCalledWith("a");
  });

  it("offers a confirmed 'forget without saving' retry when unsaved work blocks forgetting the active profile", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(forgetWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceForgetUnsavedWorkError("unsaved"),
    );

    const { getByLabelText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByLabelText("Forget Personal"));
    await Promise.resolve();
    await Promise.resolve();

    expect(confirm).toHaveBeenCalled();
    expect(forgetWorkspaceProfile).toHaveBeenNthCalledWith(2, "a", { discardUnsaved: true });
  });

  it("does not retry forgetting the active profile when the unsaved-work confirmation is declined", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(forgetWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceForgetUnsavedWorkError("unsaved"),
    );

    const { getByLabelText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByLabelText("Forget Personal"));
    await Promise.resolve();
    await Promise.resolve();

    expect(forgetWorkspaceProfile).toHaveBeenCalledTimes(1);
  });

  it("calls addWorkspaceFromPicker and closes the dialog when Add workspace is clicked", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByText, queryByRole } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByText("+ Add workspace"));
    await Promise.resolve();
    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
    expect(queryByRole("dialog", { name: "Workspaces" })).toBeNull();
  });

  it("handles rejected switch, forget, and add actions without unhandled promises", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(activateWorkspaceProfile).mockRejectedValueOnce(new Error("cannot open"));
    vi.mocked(forgetWorkspaceProfile).mockRejectedValueOnce(new Error("disk full"));
    vi.mocked(addWorkspaceFromPicker).mockRejectedValueOnce(new Error("picker failed"));

    const { getByLabelText, getByText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByText("Work"));
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).not.toHaveBeenCalled();

    fireEvent.click(getByLabelText("Switch workspace"));
    fireEvent.click(getByLabelText("Forget Work"));
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledWith("Could not forget workspace. Try again.");

    fireEvent.click(getByText("+ Add workspace"));
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledWith("Could not add workspace. Try again.");
  });

  it("filters desktop profiles by name/path without exposing Android locator secrets", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B, PROFILE_ANDROID];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByRole, queryByText, container } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    const search = getByRole("searchbox");
    fireEvent.input(search, { target: { value: "/b" } });
    expect(queryByText("Work")).toBeTruthy();
    expect(queryByText("Phone")).toBeNull();
    fireEvent.input(search, { target: { value: "secret" } });
    expect(queryByText("Phone")).toBeNull();
    expect(container.textContent).not.toContain("content://");
  });

  it("ArrowDown and Enter activate the next visible profile", async () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByLabelText, getByRole } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    const search = getByRole("searchbox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    await Promise.resolve();
    expect(activateWorkspaceProfile).toHaveBeenCalledWith("b");
  });

  it("closes the dialog on Escape and returns focus to the trigger", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, queryByRole } = render(<WorkspaceSwitcher />);
    const trigger = getByLabelText("Switch workspace");
    fireEvent.click(trigger);
    expect(queryByRole("dialog", { name: "Workspaces" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByRole("dialog", { name: "Workspaces" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the dialog when clicking outside it", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByLabelText, queryByRole } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Switch workspace"));
    expect(queryByRole("dialog", { name: "Workspaces" })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(queryByRole("dialog", { name: "Workspaces" })).toBeNull();
  });

  it("shows an empty-state message when there are no profiles yet", () => {
    const { getByLabelText, getByText } = render(<WorkspaceSwitcher />);
    fireEvent.click(getByLabelText("Open workspace"));
    expect(getByText("No workspaces yet")).toBeTruthy();
  });

  it("responds to command-palette open, add, and manage requests", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const { getByRole } = render(<WorkspaceSwitcher />);
    workspaceSwitcherOpenRequest.value++;
    await waitFor(() => expect(getByRole("dialog", { name: "Workspaces" })).toBeTruthy());
    workspaceAddRequest.value++;
    workspaceManageRequest.value++;
    await waitFor(() => {
      expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
      expect(settingsPanelOpen.value).toBe(true);
    });
  });

  it("reports a command-palette Add failure instead of leaving it unhandled", async () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(addWorkspaceFromPicker).mockRejectedValueOnce(new Error("picker failed"));
    render(<WorkspaceSwitcher />);
    workspaceAddRequest.value++;
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Could not add workspace. Try again."));
  });
});
