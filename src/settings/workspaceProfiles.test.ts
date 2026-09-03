import { describe, expect, it } from "vitest";
import type { WorkspaceProfile } from "./globalConfig";
import {
  defaultProfileName,
  displayWorkspaceIcon,
  findProfileByLocator,
  isKnownWorkspaceIcon,
  matchesWorkspaceSearch,
  normalizeProfileName,
  sortWorkspaceProfiles,
  workspaceLocatorKey,
} from "./workspaceProfiles";

function profile(overrides: Partial<WorkspaceProfile>): WorkspaceProfile {
  return {
    id: "id",
    name: "Name",
    icon: "folder",
    path: "/vault",
    lastOpenedAt: 0,
    ...overrides,
  };
}

describe("normalizeProfileName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeProfileName("  Work  ")).toBe("Work");
  });

  it("returns null for an empty or whitespace-only name", () => {
    expect(normalizeProfileName("")).toBeNull();
    expect(normalizeProfileName("   ")).toBeNull();
  });

  it("accepts exactly 80 Unicode scalar values and rejects 81", () => {
    expect(normalizeProfileName("x".repeat(80))).toBe("x".repeat(80));
    expect(normalizeProfileName("x".repeat(81))).toBeNull();
    expect(normalizeProfileName("😀".repeat(80))).toBe("😀".repeat(80));
    expect(normalizeProfileName("😀".repeat(81))).toBeNull();
  });

  it("rejects line breaks", () => {
    expect(normalizeProfileName("Work\nNotes")).toBeNull();
    expect(normalizeProfileName("Work\rNotes")).toBeNull();
  });
});

describe("defaultProfileName", () => {
  it("prefers a suggested name when present and valid", () => {
    expect(defaultProfileName("/Users/me/vault", "My Notes")).toBe("My Notes");
  });

  it("falls back to the Desktop path's basename", () => {
    expect(defaultProfileName("/Users/me/vault")).toBe("vault");
  });

  it("falls back to 'Workspace' for the Android synthetic root", () => {
    expect(defaultProfileName("/workspace")).toBe("Workspace");
  });

  it("falls back to the path basename when a suggested name is invalid", () => {
    expect(defaultProfileName("/Users/me/vault", "   ")).toBe("vault");
    expect(defaultProfileName("/Users/me/vault", "bad\nname")).toBe("vault");
  });

  it("falls back to 'Workspace' for a path with no usable basename", () => {
    expect(defaultProfileName("/")).toBe("Workspace");
  });
});

describe("isKnownWorkspaceIcon / displayWorkspaceIcon", () => {
  it("recognizes every bundled icon", () => {
    expect(isKnownWorkspaceIcon("book")).toBe(true);
    expect(isKnownWorkspaceIcon("archive")).toBe(true);
  });

  it("rejects an unknown icon value", () => {
    expect(isKnownWorkspaceIcon("rocket")).toBe(false);
  });

  it("falls back an unknown icon to 'folder' for display, without mutating the stored value", () => {
    expect(displayWorkspaceIcon("rocket")).toBe("folder");
    expect(displayWorkspaceIcon("book")).toBe("book");
  });
});

describe("workspaceLocatorKey / findProfileByLocator", () => {
  it("keys on the token when present, ignoring the (synthetic) path", () => {
    expect(workspaceLocatorKey("/workspace", "content://tree/a")).toBe(
      workspaceLocatorKey("/workspace", "content://tree/a"),
    );
    expect(workspaceLocatorKey("/workspace", "content://tree/a")).not.toBe(
      workspaceLocatorKey("/workspace", "content://tree/b"),
    );
  });

  it("keys on the exact path when no token is present", () => {
    expect(workspaceLocatorKey("/vault", undefined)).toBe(workspaceLocatorKey("/vault", undefined));
    expect(workspaceLocatorKey("/vault", undefined)).not.toBe(workspaceLocatorKey("/Vault", undefined));
  });

  it("finds an existing profile matching a freshly picked folder's locator", () => {
    const profiles = [profile({ id: "p1", path: "/vault" }), profile({ id: "p2", path: "/other" })];
    expect(findProfileByLocator(profiles, "/other", undefined)?.id).toBe("p2");
    expect(findProfileByLocator(profiles, "/unknown", undefined)).toBeUndefined();
  });

  it("matches by token identity across an Android profile's shared synthetic path", () => {
    const profiles = [
      profile({ id: "p1", path: "/workspace", token: "content://a" }),
      profile({ id: "p2", path: "/workspace", token: "content://b" }),
    ];
    expect(findProfileByLocator(profiles, "/workspace", "content://b")?.id).toBe("p2");
  });
});

describe("sortWorkspaceProfiles", () => {
  it("sorts by descending lastOpenedAt", () => {
    const profiles = [
      profile({ id: "old", lastOpenedAt: 1 }),
      profile({ id: "new", lastOpenedAt: 3 }),
      profile({ id: "mid", lastOpenedAt: 2 }),
    ];
    expect(sortWorkspaceProfiles(profiles).map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks a tied lastOpenedAt by case-insensitive name", () => {
    const profiles = [
      profile({ id: "b", name: "banana", lastOpenedAt: 5 }),
      profile({ id: "a", name: "Apple", lastOpenedAt: 5 }),
    ];
    expect(sortWorkspaceProfiles(profiles).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("breaks a tied name by stable ID", () => {
    const profiles = [
      profile({ id: "z", name: "Same", lastOpenedAt: 5 }),
      profile({ id: "a", name: "Same", lastOpenedAt: 5 }),
    ];
    expect(sortWorkspaceProfiles(profiles).map((p) => p.id)).toEqual(["a", "z"]);
  });
});

describe("matchesWorkspaceSearch", () => {
  it("matches names, desktop basenames, and desktop path text case-insensitively", () => {
    const p = profile({ name: "Project Notes", path: "/Users/me/Research/Vault" });
    expect(matchesWorkspaceSearch(p, "project")).toBe(true);
    expect(matchesWorkspaceSearch(p, "vault")).toBe(true);
    expect(matchesWorkspaceSearch(p, "RESEARCH")).toBe(true);
    expect(matchesWorkspaceSearch(p, "missing")).toBe(false);
  });

  it("does not expose Android path or token text through search", () => {
    const p = profile({ name: "Phone Notes", path: "/workspace", token: "content://secret/tree" });
    expect(matchesWorkspaceSearch(p, "phone")).toBe(true);
    expect(matchesWorkspaceSearch(p, "workspace")).toBe(false);
    expect(matchesWorkspaceSearch(p, "secret")).toBe(false);
  });

  it("matches every profile for an empty query", () => {
    expect(matchesWorkspaceSearch(profile({}), "   ")).toBe(true);
  });
});
