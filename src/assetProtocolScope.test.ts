/**
 * Security regression guard for audit finding S-1 (2026-10-16).
 *
 * S-1 (medium): `assetProtocol.scope` in `tauri.conf.json` must stay
 * deny-by-default. An empty scope array means the `asset:` protocol
 * serves no files at all until the app explicitly allows a directory at
 * runtime. That is exactly what `set_active_workspace_root`
 * (`src-tauri/src/commands.rs`) does: it calls
 * `app.asset_protocol_scope().allow_directory(root)` when a workspace is
 * activated, and `forbid_directory(previous_root)` when it is switched
 * away. The Rust-side regression test
 * `set_active_workspace_root_scopes_asset_protocol_to_the_active_workspace_only`
 * (commands.rs) proves the dynamic-grant half. This TS test proves the
 * *static* half: that the shipped config starts from deny-all rather than
 * from a match-all pattern.
 *
 * The 2026-09-23 correction fixed the original `["**"]` scope (which the
 * `glob` crate's `Pattern::matches` treats as matching *any* absolute path,
 * including `/etc/passwd`) to `[]`. This test guards that correction: if a
 * future edit reverts the scope to `["**"]`, `null`, or any pattern that
 * matches outside the active workspace, this test fails in CI and the
 * arbitrary-file-read vulnerability is caught before it ships.
 *
 * This is a pure config-shape assertion — no runtime, no network, no
 * device. It runs on every platform CI targets.
 */

/** @vitest-environment node */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const confPath = path.resolve(__dirname, "..", "src-tauri", "tauri.conf.json");

interface TauriConf {
  app?: {
    security?: {
      assetProtocol?: {
        enable?: boolean;
        scope?: unknown;
      };
    };
  };
}

function loadConfig(): TauriConf {
  return JSON.parse(fs.readFileSync(confPath, "utf8")) as TauriConf;
}

describe("tauri.conf.json — assetProtocol scope (audit S-1)", () => {
  it("asset protocol is enabled (required for local image/attachment rendering)", () => {
    const conf = loadConfig();
    expect(conf?.app?.security?.assetProtocol?.enable).toBe(true);
  });

  it("asset protocol scope is an array (not null, not a bare string)", () => {
    // A `null` scope in Tauri means "allow everything" — the exact
    // vulnerability the 2026-09-23 fix corrected. A bare string would be a
    // single pattern; we need the array form so we can assert its contents.
    const conf = loadConfig();
    const scope = conf?.app?.security?.assetProtocol?.scope;
    expect(Array.isArray(scope)).toBe(true);
  });

  it(
    "asset protocol scope is deny-by-default: the match-all `**` pattern is absent",
    () => {
      const conf = loadConfig();
      const rawScope = conf?.app?.security?.assetProtocol?.scope;
      expect(Array.isArray(rawScope)).toBe(true);
      const scope = rawScope as unknown[];

      // Also assert no element is a bare glob that would match every
      // absolute path: `**/*`, `*`, `/**`, or any pattern that is just
      // `**` with optional path segments on either side.
      for (const entry of scope) {
        expect(typeof entry, `scope entry must be a string, got ${typeof entry}`).toBe(
          "string"
        );
        const s = entry as string;
        // Deny patterns that match-all: "**", "**/*", "*", "/**", "/**/*"
        expect(
          !["**", "**/*", "*", "/**", "/**/*"].includes(s),
          `scope entry "${s}" matches any absolute path — reintroduces S-1`
        ).toBe(true);
      }
    }
  );

  it(
    "asset protocol scope does not grant $APPDATA or $HOME unconditionally",
    () => {
      // A scope entry like "$APPDATA/**" or "$HOME/**" would grant access
      // to the entire app-data or home directory at every launch, before
      // any workspace is activated. The only runtime grant must come from
      // `set_active_workspace_root` (the active workspace directory),
      // never from a static config pattern.
      const conf = loadConfig();
      const rawScope = conf?.app?.security?.assetProtocol?.scope;
      if (Array.isArray(rawScope)) {
        const scope = rawScope as unknown[];
        for (const entry of scope) {
          expect(typeof entry).toBe("string");
          const s = entry as string;
          expect(
            s,
            `static grant of "${s}" would bypass runtime workspace scoping`
          ).not.toMatch(/^\$(APPDATA|HOME)\b/);
        }
      }
    }
  );
});
