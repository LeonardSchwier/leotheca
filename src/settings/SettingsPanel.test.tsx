/** @vitest-environment happy-dom */
import { vi } from "vitest";

vi.mock("./WorkspaceProfilesSettings", () => ({
  WorkspaceProfilesSettings: () => null,
}));

await import("./SettingsPanelCurrentTests");
