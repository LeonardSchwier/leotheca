import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findFlatpakSourceProblems, sha512Hex } from "./flatpakSources.js";

const URL = "https://registry.npmjs.org/a/-/a-1.0.0.tgz";
const INTEGRITY = `sha512-${Buffer.from("abcd".repeat(16), "hex").toString("base64")}`;
const HEX = "abcd".repeat(16);
const lockfile = (extra = {}) => ({
  packages: {
    "": { name: "root" },
    "node_modules/a": { resolved: URL, integrity: INTEGRITY, ...extra },
  },
});
const goodEntry = {
  type: "file",
  url: URL,
  sha512: HEX,
  dest: "flatpak-node/npm-cache/_cacache/content-v2/sha512/ab/cd",
  "dest-filename": HEX.slice(4),
};

describe("findFlatpakSourceProblems", () => {
  it("accepts an entry at the path npm's cache reads", () => {
    expect(findFlatpakSourceProblems(lockfile(), [goodEntry])).toEqual([]);
  });

  it("reports a locked package with no source entry", () => {
    expect(findFlatpakSourceProblems(lockfile(), [])[0]).toContain("no source entry");
  });

  it("reports the wrong cache layout that broke the Flatpak build", () => {
    const handPatched = {
      ...goodEntry,
      dest: "flatpak-node/npm-cache/_cacache/content-v2/sha512/ab",
      "dest-filename": HEX,
    };
    expect(findFlatpakSourceProblems(lockfile(), [handPatched])[0]).toContain("npm looks in");
  });

  it("reports a hash that no longer matches the lockfile", () => {
    const stale = { ...goodEntry, sha512: "0".repeat(128) };
    expect(findFlatpakSourceProblems(lockfile(), [stale])[0]).toContain("sha512 differs");
  });

  it("skips bundled, local and integrity-less packages", () => {
    expect(findFlatpakSourceProblems(lockfile({ inBundle: true }), [])).toEqual([]);
    expect(findFlatpakSourceProblems(lockfile({ resolved: "src/local" }), [])).toEqual([]);
    expect(findFlatpakSourceProblems(lockfile({ integrity: undefined }), [])).toEqual([]);
  });
});

describe("sha512Hex", () => {
  it("returns null for missing or non-sha512 integrity", () => {
    expect(sha512Hex(undefined)).toBeNull();
    expect(sha512Hex("sha1-abc")).toBeNull();
  });
});

describe("checked-in sources", () => {
  it("match the checked-in lockfile", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const sources = JSON.parse(readFileSync("flatpak/node-sources.json", "utf8"));
    expect(findFlatpakSourceProblems(lock, sources)).toEqual([]);
  });
});
