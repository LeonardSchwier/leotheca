/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "./workspaceSettings";
import type { ThemePreference, WorkspaceProfile } from "./globalConfig";

const {
  MockWorkspaceForgetUnsavedWorkError,
  MockWorkspaceRelinkConflictError,
} = vi.hoisted(() => ({
  MockWorkspaceForgetUnsavedWorkError: class extends Error {},
  MockWorkspaceRelinkConflictError: class extends Error {},
}));

// The same stand-in for ./store as SettingsPanelCurrentTests.tsx, plus what
// the real WorkspaceProfilesSettings and WorkspaceSwitcher read, so the German
// sweep covers the sub-panels the Settings panel renders.
vi.mock("./store", () => ({
  activateWorkspaceProfile: vi.fn(async () => {}),
  activeWorkspaceId: signal<string | null>(null),
  addWorkspaceFromPicker: vi.fn(async () => {}),
  appVersion: signal(""),
  externalFileOpenEnabled: signal(true),
  forgetWorkspaceProfile: vi.fn(async () => {}),
  globalConfigCorrupted: signal(false),
  relinkWorkspaceProfile: vi.fn(async () => true),
  renameWorkspaceProfile: vi.fn(async () => true),
  repairGlobalConfigFile: vi.fn(),
  settingsPanelOpen: signal(true),
  setExternalFileOpenEnabled: vi.fn(),
  setTheme: vi.fn(),
  setLanguage: vi.fn(),
  setWorkspaceProfileIcon: vi.fn(async () => true),
  repairWorkspaceSettingsFile: vi.fn(),
  retryWorkspaceSettingsSave: vi.fn(),
  theme: signal<ThemePreference>("system"),
  updateWorkspaceSettings: vi.fn(),
  viewMode: signal("source"),
  WorkspaceForgetUnsavedWorkError: MockWorkspaceForgetUnsavedWorkError,
  WorkspaceRelinkConflictError: MockWorkspaceRelinkConflictError,
  workspacePath: signal<string | null>(null),
  workspaceProfiles: signal<WorkspaceProfile[]>([]),
  workspaceSettingsCorrupted: signal(false),
  workspaceSettingsSaveError: signal<string | null>(null),
  workspaceSettingsSaving: signal(false),
  workspaceSettings: signal(DEFAULT_WORKSPACE_SETTINGS),
}));
vi.mock("../workspace/tauriBridgeImpl", () => ({
  exportTextFileViaDialog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../workspace/tauriBridge", () => ({
  getWorkspaceStats: vi.fn(),
}));
vi.mock("../linking/store", () => ({
  rebuildLinkIndex: vi.fn(),
}));
// Diagnostics belong to another directory and stay English in this slice.
vi.mock("../diagnostics/DiagnosticsPanel", () => ({
  DiagnosticsPanel: () => <button>Mock diagnostic row</button>,
}));

import { SettingsPanel } from "./SettingsPanel";
import { VaultStatsPanel, type WorkspaceStats } from "./VaultStatsPanel";
import { WorkspaceProfilesSettings } from "./WorkspaceProfilesSettings";
import {
  activeWorkspaceId,
  addWorkspaceFromPicker,
  appVersion,
  globalConfigCorrupted,
  renameWorkspaceProfile,
  settingsPanelOpen,
  workspacePath,
  workspaceProfiles,
  workspaceSettingsCorrupted,
  workspaceSettingsSaveError,
  workspaceSettingsSaving,
  workspaceSettings,
} from "./store";
import { getWorkspaceStats } from "../workspace/tauriBridge";
import { exportTextFileViaDialog } from "../workspace/tauriBridgeImpl";
import { languagePreference } from "../i18n";
import { en } from "../i18n/en";
import { de } from "../i18n/de";

const STATS: WorkspaceStats = {
  folderCount: 3,
  noteCount: 42,
  imageCount: 5,
  averageLinesPerNote: 12.345,
  oldestNoteDate: 1700000000,
  newestNoteDate: 1750000000,
};

const PROFILE: WorkspaceProfile = {
  id: "desktop",
  name: "Research",
  icon: "book",
  path: "/home/me/Research",
  lastOpenedAt: 2,
};

// The English text of every key of these surfaces that has no placeholder
// and reads differently in German: none of it may be left on screen.
const englishOnly = Object.keys(en)
  .filter(
    (key) =>
      key.startsWith("settings.") ||
      key.startsWith("profiles.") ||
      key.startsWith("vault."),
  )
  .map((key) => key as keyof typeof en)
  .filter((key) => !en[key].includes("{") && en[key] !== de[key])
  .map((key) => en[key]);

function leakedEnglish(container: Element): string[] {
  const seen = new Set<string>();
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      const value = element.getAttribute(attribute);
      if (value) seen.add(value);
    }
    for (const node of element.childNodes) {
      if (node.nodeType === 3 && node.textContent?.trim()) {
        seen.add(node.textContent.trim());
      }
    }
  }
  return englishOnly.filter((text) => seen.has(text));
}

const GERMAN_CATEGORIES = [
  "Allgemein",
  "Arbeitsbereichsprofile",
  "Funktionen",
  "Darstellung",
  "Tastenkürzel",
  "Zustand",
  "Über",
];

function renderPanel() {
  return render(<SettingsPanel onOpenFile={vi.fn()} />);
}

function search(getByLabelText: (text: string) => HTMLElement, label: string) {
  return (query: string) =>
    fireEvent.input(getByLabelText(label), { target: { value: query } });
}

beforeEach(() => {
  languagePreference.value = "de";
  settingsPanelOpen.value = true;
  // Every optional row reachable: a workspace is open, the features that
  // reveal extra rows are on, and every alert is active.
  workspacePath.value = "/vault";
  workspaceSettings.value = {
    ...DEFAULT_WORKSPACE_SETTINGS,
    themesEnabled: true,
    snippetsEnabled: true,
    templatesEnabled: true,
    customCssEnabled: true,
  };
  workspaceSettingsCorrupted.value = true;
  globalConfigCorrupted.value = true;
  workspaceSettingsSaveError.value = "disk full";
  workspaceSettingsSaving.value = true;
  appVersion.value = "1.2.3";
  workspaceProfiles.value = [PROFILE];
  activeWorkspaceId.value = "desktop";
  vi.mocked(getWorkspaceStats).mockResolvedValue(STATS);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  languagePreference.value = "system";
  settingsPanelOpen.value = true;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  workspaceSettingsCorrupted.value = false;
  globalConfigCorrupted.value = false;
  workspaceSettingsSaveError.value = null;
  workspaceSettingsSaving.value = false;
  appVersion.value = "";
  workspaceProfiles.value = [];
  activeWorkspaceId.value = null;
  vi.mocked(addWorkspaceFromPicker).mockReset().mockResolvedValue(undefined);
  vi.mocked(renameWorkspaceProfile).mockReset().mockResolvedValue(true);
  vi.mocked(exportTextFileViaDialog).mockReset().mockResolvedValue(true);
});

describe("SettingsPanel: German", () => {
  it("switches a panel that is already open when the language changes", async () => {
    languagePreference.value = "en";
    const { container, getByText, queryByText } = renderPanel();
    const navLabels = () =>
      Array.from(
        (
          container.querySelector(".settings-nav") as HTMLElement
        ).querySelectorAll("button"),
      ).map((button) => button.textContent);
    expect(navLabels()[0]).toBe("General");
    expect(getByText("Root folder")).toBeTruthy();

    languagePreference.value = "de";
    await waitFor(() => expect(navLabels()).toEqual(GERMAN_CATEGORIES));
    expect(getByText("Stammordner")).toBeTruthy();
    expect(queryByText("Root folder")).toBeNull();

    languagePreference.value = "en";
    await waitFor(() => expect(navLabels()[0]).toBe("General"));
  });

  // The sweep compares what is on screen with the English text of the catalog
  // keys, so it can only find a string that has a key: a literal nobody migrated
  // is invisible to it. Review and the grep over the migrated files cover that;
  // the keys with a `{placeholder}` have explicit assertions instead.
  it("has enough translated settings texts for the English sweep to mean something", () => {
    expect(englishOnly.length).toBeGreaterThan(80);
  });

  it("shows every category in German and leaves no English text behind", async () => {
    const { container, findByText, getByText, getByRole, getByLabelText } =
      renderPanel();
    // The statistics load asynchronously and show in every category.
    await findByText("Arbeitsbereichsstatistik");

    const nav = container.querySelector(".settings-nav") as HTMLElement;
    expect(nav.getAttribute("aria-label")).toBe("Einstellungskategorien");
    const labels = Array.from(nav.querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(GERMAN_CATEGORIES);

    expect(getByRole("heading", { name: "Einstellungen" })).toBeTruthy();
    expect(getByRole("status").textContent).toBe("Wird gespeichert…");
    expect(getByLabelText("Einstellungen schließen")).toBeTruthy();
    expect(
      getByLabelText("Einstellungen durchsuchen").getAttribute("placeholder"),
    ).toBe("Einstellungen durchsuchen…");
    expect(getByText("← Zurück")).toBeTruthy();

    for (const category of GERMAN_CATEGORIES) {
      fireEvent.click(within(nav).getByText(category));
      expect(
        within(nav).getByText(category).getAttribute("aria-current"),
        category,
      ).toBe("true");
      expect(leakedEnglish(container), category).toEqual([]);
    }
  });

  it("shows a sample of rows of each category in German", async () => {
    const {
      container,
      findByText,
      getByText,
      getByRole,
      getAllByText,
      getByLabelText,
    } = renderPanel();
    await findByText("Arbeitsbereichsstatistik");
    const nav = container.querySelector(".settings-nav") as HTMLElement;

    // General
    expect(getByRole("heading", { name: "Allgemein" })).toBeTruthy();
    expect(getByText("Stammordner")).toBeTruthy();
    expect(getByText("Ordner wechseln")).toBeTruthy();
    expect(getByText("Erneut versuchen")).toBeTruthy();
    expect(
      getByText("Die Einstellungsdatei enthielt ungültige Daten"),
    ).toBeTruthy();
    expect(getByText("Einstellungsdatei neu schreiben")).toBeTruthy();
    expect(getByText("App-Konfiguration neu schreiben")).toBeTruthy();
    expect(getByText("Löschverhalten")).toBeTruthy();
    expect(
      getByText("Wohin gelöschte Notizen und Ordner gelangen"),
    ).toBeTruthy();
    expect(getByText("Endgültig")).toBeTruthy();
    expect(getByText("Papierkorb im Arbeitsbereich")).toBeTruthy();
    expect(getByText("Akzentfarbe")).toBeTruthy();
    expect(getByText("Nebel")).toBeTruthy();
    expect(getByText("Rechtschreibprüfung")).toBeTruthy();
    expect(getByText("Eigenes CSS")).toBeTruthy();
    expect(getByText("Aktiviert")).toBeTruthy();
    expect(getAllByText("An").length).toBeGreaterThan(3);
    expect(getAllByText("Aus").length).toBeGreaterThan(3);
    expect(
      container.querySelector('input[placeholder="neben der Notiz"]'),
    ).toBeTruthy();
    expect(getByText("Arbeitsbereichsstatistik")).toBeTruthy();
    expect(getByText("Durchschnittliche Zeilen pro Notiz")).toBeTruthy();

    // Workspace profiles
    fireEvent.click(within(nav).getByText("Arbeitsbereichsprofile"));
    expect(getByText("Research (aktuell)")).toBeTruthy();
    expect(getByText("Neu verknüpfen")).toBeTruthy();
    expect(getByText("Vergessen")).toBeTruthy();
    expect(getByRole("combobox", { name: "Symbol für Research" })).toBeTruthy();

    // Features
    fireEvent.click(within(nav).getByText("Funktionen"));
    expect(getByRole("heading", { name: "Funktionsauswahl" })).toBeTruthy();
    expect(getByText("Akzentdesigns")).toBeTruthy();
    expect(getByText("Sammlungen")).toBeTruthy();
    expect(getByText("Vorlagen")).toBeTruthy();

    // Appearance
    fireEvent.click(within(nav).getByText("Darstellung"));
    const themeRow = getByText("Design").closest(
      ".settings-row",
    ) as HTMLElement;
    expect(within(themeRow).getByText("System folgen")).toBeTruthy();
    expect(within(themeRow).getByText("Hell")).toBeTruthy();
    expect(within(themeRow).getByText("Dunkel")).toBeTruthy();
    expect(getByText("Schriftgröße")).toBeTruthy();
    expect(getByText("Leseschrift")).toBeTruthy();
    expect(getByText("Standardansicht")).toBeTruthy();
    expect(getByText("Quelltext")).toBeTruthy();
    expect(getByText("Geteilt")).toBeTruthy();
    expect(getByText("Vorschau")).toBeTruthy();

    // Shortcuts: the command names come from the shared registry and stay
    // English in this slice, the section around them does not.
    fireEvent.click(within(nav).getByText("Tastenkürzel"));
    expect(getByRole("heading", { name: "Tastenkürzel" })).toBeTruthy();
    expect(getByText("Command palette")).toBeTruthy();

    // About
    fireEvent.click(within(nav).getByText("Über"));
    expect(getByRole("heading", { name: "Über" })).toBeTruthy();
    expect(getByText("Lizenz")).toBeTruthy();
    expect(getByText("Einstellungen exportieren")).toBeTruthy();
    fireEvent.click(getByText("Lizenz anzeigen"));
    expect(getByLabelText("Lizenzansicht schließen")).toBeTruthy();
    expect(leakedEnglish(container)).toEqual([]);
  });

  it("shows the switched-off and empty states in German", () => {
    workspacePath.value = null;
    workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
    const first = renderPanel();
    expect(first.getByText("Nicht festgelegt")).toBeTruthy();
    expect(leakedEnglish(first.container)).toEqual([]);
    first.unmount();

    workspacePath.value = "/vault";
    const second = renderPanel();
    expect(second.getByText("Deaktiviert")).toBeTruthy();
    expect(leakedEnglish(second.container)).toEqual([]);
  });

  it("shows the folder picker progress in German", async () => {
    vi.mocked(addWorkspaceFromPicker).mockReturnValue(new Promise(() => {}));
    const { getByText, findByText } = renderPanel();
    fireEvent.click(getByText("Ordner wechseln"));
    expect(await findByText("Ordnerauswahl wird geöffnet…")).toBeTruthy();
  });

  it("reports a failed settings export in German", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(exportTextFileViaDialog).mockRejectedValueOnce(
      new Error("denied"),
    );
    const { container, getByText } = renderPanel();
    const nav = container.querySelector(".settings-nav") as HTMLElement;
    fireEvent.click(within(nav).getByText("Über"));
    fireEvent.click(getByText("Als JSON exportieren"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Einstellungen konnten nicht exportiert werden: denied",
      ),
    );
  });
});

describe("SettingsPanel: search in German and English", () => {
  beforeEach(() => {
    // Active alerts are never hidden by a search, so they would keep the
    // empty state away.
    workspaceSettingsCorrupted.value = false;
    globalConfigCorrupted.value = false;
    workspaceSettingsSaveError.value = null;
  });

  it("finds the Font size row by its German and its English name", () => {
    for (const query of ["Schriftgröße", "font size", "SCHRIFTGRÖßE"]) {
      const { getByLabelText, queryByText, unmount } = renderPanel();
      search(getByLabelText, "Einstellungen durchsuchen")(query);
      expect(queryByText("Schriftgröße"), query).toBeTruthy();
      expect(queryByText("Stammordner"), query).toBeNull();
      expect(queryByText("Akzentfarbe"), query).toBeNull();
      unmount();
    }
  });

  it("finds a row by its German hint and by the English search text", () => {
    const accent = "Akzentfarbe";
    const external =
      "Markdown-Dateien von außerhalb deines Arbeitsbereichs öffnen";
    const cases: [query: string, shown: string, hidden: string][] = [
      ["Ändert Hervorhebungen", accent, external],
      ["Changes highlights", accent, external],
      ["from your file manager", external, accent],
    ];
    for (const [query, shown, hidden] of cases) {
      const { getByLabelText, queryByText, unmount } = renderPanel();
      search(getByLabelText, "Einstellungen durchsuchen")(query);
      expect(queryByText(shown), query).toBeTruthy();
      expect(queryByText(hidden), query).toBeNull();
      unmount();
    }
  });

  it("shows the translated empty state when nothing matches", () => {
    const { getByLabelText, getByText, container } = renderPanel();
    search(getByLabelText, "Einstellungen durchsuchen")("xyznonexistent");
    expect(
      getByText("Keine Einstellung passt zu „xyznonexistent“."),
    ).toBeTruthy();
    expect(leakedEnglish(container)).toEqual([]);
  });

  it("behaves as before in English: English text matches, German does not", () => {
    languagePreference.value = "en";
    const first = renderPanel();
    search(first.getByLabelText, "Search settings")("font size");
    expect(first.getByText("Font size")).toBeTruthy();
    first.unmount();

    const second = renderPanel();
    search(second.getByLabelText, "Search settings")("Schriftgröße");
    expect(second.queryByText("Font size")).toBeNull();
    expect(second.getByText('No settings match "Schriftgröße".')).toBeTruthy();
    second.unmount();

    // The search text of a row may differ from its hint; English keeps it.
    const third = renderPanel();
    search(third.getByLabelText, "Search settings")("from your file manager");
    expect(
      third.getByText("Open Markdown files from outside your workspace"),
    ).toBeTruthy();
  });
});

describe("WorkspaceProfilesSettings: German", () => {
  it("prompts and reports failures in German", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(renameWorkspaceProfile).mockResolvedValueOnce(false);
    const { getByText, container } = render(<WorkspaceProfilesSettings />);
    expect(getByText("Arbeitsbereichsprofile")).toBeTruthy();
    expect(leakedEnglish(container)).toEqual([]);

    fireEvent.click(getByText("Umbenennen"));
    expect(prompt).toHaveBeenCalledWith(
      "Name des Arbeitsbereichsprofils",
      "Research",
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Verwende einen Namen mit 1 bis 80 Zeichen ohne Zeilenumbrüche.",
      ),
    );

    vi.mocked(renameWorkspaceProfile).mockRejectedValueOnce(new Error("x"));
    fireEvent.click(getByText("Umbenennen"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Das Arbeitsbereichsprofil konnte nicht umbenannt werden. Versuche es erneut.",
      ),
    );

    vi.mocked(addWorkspaceFromPicker).mockRejectedValueOnce(new Error("x"));
    fireEvent.click(getByText("Arbeitsbereich hinzufügen"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Der Arbeitsbereich konnte nicht hinzugefügt werden. Versuche es erneut.",
      ),
    );
  });
});

describe("VaultStatsPanel: German", () => {
  it("shows loading, error and missing dates in German", async () => {
    const loading = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={() => new Promise(() => {})}
      />,
    );
    expect(
      loading.getByText("Arbeitsbereichsstatistik wird geladen…"),
    ).toBeTruthy();
    loading.unmount();

    const failed = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={() => Promise.reject(new Error("unreadable"))}
      />,
    );
    expect(
      await failed.findByText(
        "Arbeitsbereichsstatistik konnte nicht geladen werden: unreadable",
      ),
    ).toBeTruthy();
    failed.unmount();

    const empty = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={async () => ({
          ...STATS,
          noteCount: 0,
          oldestNoteDate: null,
          newestNoteDate: null,
        })}
      />,
    );
    await waitFor(() =>
      expect(empty.getAllByText("Noch keine Notizen")).toHaveLength(2),
    );
    expect(leakedEnglish(empty.container)).toEqual([]);
    empty.unmount();

    const android = render(
      <VaultStatsPanel
        rootPath="/vault"
        loadStats={async () => ({
          ...STATS,
          oldestNoteDate: null,
          newestNoteDate: null,
        })}
      />,
    );
    await waitFor(() =>
      expect(
        android.getAllByText("Auf dieser Plattform nicht verfügbar"),
      ).toHaveLength(2),
    );
    expect(android.getByText("Älteste Notiz")).toBeTruthy();
    expect(android.getByText("Neueste Notiz")).toBeTruthy();
    expect(leakedEnglish(android.container)).toEqual([]);
  });
});
