import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The WebView reaches files only through the app's own scoped commands. The
// Tauri file-system plugin was registered but granted nothing (inert), so it
// was removed. This guard fails if the plugin or an `fs:` permission returns.

const read = (path) => readFileSync(path, "utf8");

describe("tauri-plugin-fs is gone", () => {
  it("is not a Cargo or npm dependency and is not registered", () => {
    expect(read("src-tauri/Cargo.toml")).not.toMatch(/tauri-plugin-fs/);
    expect(read("src-tauri/src/lib.rs")).not.toMatch(/tauri_plugin_fs/);
    expect(read("package.json")).not.toMatch(/plugin-fs/);
  });

  it("is not a direct dependency in the lockfiles", () => {
    // tauri-plugin-dialog depends on the crate, so it stays in Cargo.lock as
    // a library; the app itself must not list it.
    const lock = read("src-tauri/Cargo.lock");
    const app = lock
      .split("[[package]]")
      .find((block) => /\nname = "leotheca"\n/.test(block));
    expect(app).toBeDefined();
    expect(app).not.toMatch(/tauri-plugin-fs/);
    expect(read("package-lock.json")).not.toMatch(/@tauri-apps\/plugin-fs/);
  });

  it("is absent from the Flatpak npm source list", () => {
    expect(read("flatpak/node-sources.json")).not.toMatch(/plugin-fs/);
  });

  it("no capability grants an fs: permission", () => {
    for (const name of readdirSync("src-tauri/capabilities")) {
      const grants =
        JSON.parse(read(join("src-tauri/capabilities", name))).permissions ??
        [];
      const ids = grants.map((p) => (typeof p === "string" ? p : p.identifier));
      expect(ids.filter((id) => id.startsWith("fs:"))).toEqual([]);
    }
  });
});
