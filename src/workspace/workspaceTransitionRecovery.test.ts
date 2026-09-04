import { describe, expect, it } from "vitest";
import { classifyTransitionErrorKind, recoveryActionsFor } from "./workspaceTransitionRecovery";

describe("classifyTransitionErrorKind", () => {
  it("classifies the save phase as save_failed on every platform", () => {
    expect(classifyTransitionErrorKind("save", false)).toBe("save_failed");
    expect(classifyTransitionErrorKind("save", true)).toBe("save_failed");
  });

  it("classifies the access phase as permission_missing on Android", () => {
    expect(classifyTransitionErrorKind("access", true)).toBe("permission_missing");
  });

  it("classifies the access phase as workspace_missing on Desktop", () => {
    expect(classifyTransitionErrorKind("access", false)).toBe("workspace_missing");
  });

  it("classifies the global-config phase as global_config_save_failed regardless of platform", () => {
    expect(classifyTransitionErrorKind("global-config", false)).toBe("global_config_save_failed");
    expect(classifyTransitionErrorKind("global-config", true)).toBe("global_config_save_failed");
  });

  it("classifies the settings phase as unknown (settings_corrupt never throws, see this module's own doc comment)", () => {
    expect(classifyTransitionErrorKind("settings", false)).toBe("unknown");
  });
});

describe("recoveryActionsFor", () => {
  it("offers only retry for save_failed (no 'switch without saving' yet, see this module's own doc comment)", () => {
    expect(recoveryActionsFor("save_failed").map((a) => a.id)).toEqual(["retry"]);
  });

  it("offers grant-access, open-another, and forget for permission_missing, matching spec 23 exactly (no bare retry)", () => {
    expect(recoveryActionsFor("permission_missing").map((a) => a.id)).toEqual([
      "grant-access",
      "open-another",
      "forget",
    ]);
  });

  it("offers retry, relink, open-another, and forget for workspace_missing, matching spec 23", () => {
    expect(recoveryActionsFor("workspace_missing").map((a) => a.id)).toEqual([
      "retry",
      "relink",
      "open-another",
      "forget",
    ]);
  });

  it("offers only retry for a non-blocking global_config_save_failed, matching spec 16.5's 'Retry. Do not imply recency survives restart until persistence succeeds'", () => {
    expect(recoveryActionsFor("global_config_save_failed").map((a) => a.id)).toEqual(["retry"]);
  });

  it("falls back to a bare retry for an unclassified failure", () => {
    expect(recoveryActionsFor("unknown").map((a) => a.id)).toEqual(["retry"]);
  });
});
