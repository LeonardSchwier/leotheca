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

  it("caps an excessively long name at 120 characters", () => {
    const long = "x".repeat(200);
    expect(normalizeProfileName(long)).toHaveLength(120);
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

  it("falls back to 'Workspace' when a suggested name is only whitespace", () => {
    expect(defaultProfileName("/Users/me/vault", "   ")).toBe("vault");
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

  it("does not mutate its input array", () => {
    const profiles = [profile({ id: "a", lastOpenedAt: 1 }), profile({ id: "b", lastOpenedAt: 2 })];
    const original = [...profiles];
    sortWorkspaceProfiles(profiles);
    expect(profiles).toEqual(original);
  });
});

describe("matchesWorkspaceSearch", () => {
  it("matches the display name case-insensitively", () => {
    expect(matchesWorkspaceSearch(profile({ name: "Personal Notes" }), "personal")).toBe(true);
    expect(matchesWorkspaceSearch(profile({ name: "Personal Notes" }), "work")).toBe(false);
  });

  it("matches the Desktop folder basename", () => {
    expect(matchesWorkspaceSearch(profile({ name: "Notes", path: "/Users/me/vault" }), "vault")).toBe(true);
  });

  it("matches the full Desktop path text", () => {
    expect(matchesWorkspaceSearch(profile({ name: "Notes", path: "/Users/me/vault" }), "users/me")).toBe(true);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesWorkspaceSearch(profile({ name: "Anything" }), "")).toBe(true);
    expect(matchesWorkspaceSearch(profile({ name: "Anything" }), "   ")).toBe(true);
  });

  it("never matches on the token alone", () => {
    expect(matchesWorkspaceSearch(profile({ name: "Android", path: "/workspace", token: "content://secret" }), "secret")).toBe(
      false,
    );
  });
});
