/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { WorkspaceProfile } from "./globalConfig";

const { MockWorkspaceRelinkConflictError } = vi.hoisted(() => ({
  MockWorkspaceRelinkConflictError: class extends Error {
    constructor(public readonly conflictingProfileName: string) {
      super(
        `This folder is already used by workspace "${conflictingProfileName}".`,
      );
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
import { languagePreference } from "../i18n";
import { en } from "../i18n/en";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  relinkWorkspaceProfile,
  workspaceProfiles,
  workspaceSelectionError,
} from "./store";

const PROFILE_A: WorkspaceProfile = {
  id: "a",
  name: "Personal",
  icon: "folder",
  path: "/a",
  lastOpenedAt: 2,
};
const PROFILE_B: WorkspaceProfile = {
  id: "b",
  name: "Work",
  icon: "briefcase",
  path: "/b",
  lastOpenedAt: 1,
};

afterEach(() => {
  cleanup();
  languagePreference.value = "system";
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

  it("stays open for a retry and surfaces a visible error on rejection", async () => {
    vi.mocked(addWorkspaceFromPicker).mockRejectedValue(new Error("boom"));
    const { getByText, getByRole } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(getByText("Choose Folder")).toBeTruthy();
    expect(getByRole("alert").textContent).toBe(
      "Could not open that folder. Try again or choose another folder.",
    );
  });

  it("does not overwrite a more specific error setWorkspacePath already published", async () => {
    vi.mocked(addWorkspaceFromPicker).mockImplementation(async () => {
      workspaceSelectionError.value =
        "Could not open that workspace: permission denied.";
      throw new Error("boom");
    });
    const { getByText, getByRole } = render(<WelcomeDialog />);

    await fireEvent.click(getByText("Choose Folder"));
    await Promise.resolve();

    expect(getByRole("alert").textContent).toBe(
      "Could not open that workspace: permission denied.",
    );
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

    expect(alert).toHaveBeenCalledWith(
      'This folder is already used by workspace "Work".',
    );
  });

  it("lists the other known profiles to open instead", () => {
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByText, queryByText } = render(<WelcomeDialog />);
    expect(getByText("Or open a different workspace")).toBeTruthy();
    expect(getByText("Work")).toBeTruthy();
    expect(
      queryByText("Personal", { selector: ".workspace-switcher-row-name" }),
    ).toBeNull();
  });

  it("shows the actionable workspaceSelectionError from a failed retry", () => {
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    workspaceSelectionError.value =
      "Could not open that workspace: permission denied.";
    const { getByRole } = render(<WelcomeDialog />);
    expect(getByRole("alert").textContent).toBe(
      "Could not open that workspace: permission denied.",
    );
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

describe("WelcomeDialog: German", () => {
  it("shows the first-run experience in German", async () => {
    languagePreference.value = "de";
    vi.mocked(addWorkspaceFromPicker).mockRejectedValue(new Error("boom"));
    const { getByText, getByRole, queryByText } = render(<WelcomeDialog />);

    expect(getByText("Willkommen bei Leotheca")).toBeTruthy();
    expect(queryByText("Welcome to Leotheca")).toBeNull();
    expect(queryByText("Choose Folder")).toBeNull();

    await fireEvent.click(getByText("Ordner auswählen"));
    await Promise.resolve();

    expect(getByRole("alert").textContent).toBe(
      "Dieser Ordner konnte nicht geöffnet werden. Versuche es erneut oder wähle einen anderen Ordner.",
    );
  });

  it("names the unavailable profile in German with Retry and Relink", () => {
    languagePreference.value = "de";
    workspaceProfiles.value = [PROFILE_A, PROFILE_B];
    activeWorkspaceId.value = "a";
    const { getByText, getByRole, queryByText } = render(<WelcomeDialog />);

    expect(getByText("„Personal“ konnte nicht geöffnet werden")).toBeTruthy();
    expect(getByText("Erneut versuchen")).toBeTruthy();
    expect(getByText("Ordner neu verknüpfen")).toBeTruthy();
    expect(getByText("Oder einen anderen Arbeitsbereich öffnen")).toBeTruthy();
    expect(getByRole("list").getAttribute("aria-label")).toBe(
      "Zuletzt verwendete Arbeitsbereiche",
    );
    expect(queryByText("Retry")).toBeNull();
  });

  it("lists recent workspaces in German when none is active", () => {
    languagePreference.value = "de";
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = null;
    const { getByText } = render(<WelcomeDialog />);

    expect(getByText("Arbeitsbereich öffnen")).toBeTruthy();
    expect(getByText("Zuletzt verwendete Arbeitsbereiche")).toBeTruthy();
    expect(getByText("Arbeitsbereich hinzufügen")).toBeTruthy();
  });

  it("shows the relink conflict alert in German with the conflicting profile's name", async () => {
    languagePreference.value = "de";
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(relinkWorkspaceProfile).mockRejectedValueOnce(
      new MockWorkspaceRelinkConflictError("Work"),
    );

    const { getByText } = render(<WelcomeDialog />);
    await fireEvent.click(getByText("Ordner neu verknüpfen"));
    await Promise.resolve();
    await Promise.resolve();

    expect(alert).toHaveBeenCalledWith(
      "Dieser Ordner wird bereits vom Arbeitsbereich „Work“ verwendet.",
    );
  });

  it("shows the busy labels in German", async () => {
    languagePreference.value = "de";
    const never = new Promise<void>(() => {});
    vi.mocked(addWorkspaceFromPicker).mockReturnValue(never);
    vi.mocked(activateWorkspaceProfile).mockReturnValue(never);
    vi.mocked(relinkWorkspaceProfile).mockReturnValue(
      never as unknown as Promise<boolean>,
    );

    const first = render(<WelcomeDialog />);
    await fireEvent.click(first.getByText("Ordner auswählen"));
    expect(first.getByText("Ordnerauswahl wird geöffnet…")).toBeTruthy();
    first.unmount();

    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const second = render(<WelcomeDialog />);
    await fireEvent.click(second.getByText("Erneut versuchen"));
    expect(second.getByText("Neuer Versuch…")).toBeTruthy();
    await fireEvent.click(second.getByText("Ordner neu verknüpfen"));
    expect(second.getByText("Verknüpfe neu…")).toBeTruthy();
  });

  it("leaves none of the English dialog text on screen in any of the three states", () => {
    languagePreference.value = "de";
    const english = Object.entries(en)
      .filter(
        ([key, text]) => key.startsWith("welcome.") && !text.includes("{"),
      )
      .map(([, text]) => text);
    const states: Array<[WorkspaceProfile[], string | null]> = [
      [[], null],
      [[PROFILE_A, PROFILE_B], "a"],
      [[PROFILE_A, PROFILE_B], null],
    ];
    for (const [profiles, active] of states) {
      workspaceProfiles.value = profiles;
      activeWorkspaceId.value = active;
      const { container, unmount } = render(<WelcomeDialog />);
      const shown = container.textContent ?? "";
      for (const text of english) {
        expect(shown, text).not.toContain(text);
      }
      const labels = Array.from(container.querySelectorAll("[aria-label]")).map(
        (element) => element.getAttribute("aria-label") ?? "",
      );
      // The profile list carries a label; with no profiles there is none.
      if (profiles.length > 0) expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) expect(label).not.toBe("Recent workspaces");
      unmount();
    }
  });

  it("reports a failed relink in German", async () => {
    languagePreference.value = "de";
    workspaceProfiles.value = [PROFILE_A];
    activeWorkspaceId.value = "a";
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(relinkWorkspaceProfile).mockRejectedValueOnce(new Error("x"));

    const { getByText } = render(<WelcomeDialog />);
    await fireEvent.click(getByText("Ordner neu verknüpfen"));
    await Promise.resolve();
    await Promise.resolve();

    expect(alert).toHaveBeenCalledWith(
      "Der Arbeitsbereich konnte nicht neu verknüpft werden. Versuche es erneut.",
    );
  });

  it("shows a workspace name that contains braces literally", () => {
    languagePreference.value = "en";
    workspaceProfiles.value = [{ ...PROFILE_A, name: "{name} {x}" }];
    activeWorkspaceId.value = "a";
    const { getByText } = render(<WelcomeDialog />);

    expect(getByText('Couldn\'t open "{name} {x}"')).toBeTruthy();
  });
});
