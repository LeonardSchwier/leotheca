#!/usr/bin/env node
/**
 * Regenerates the README screenshots from the current app.
 *
 * It drives the production frontend bundle (`vite build` + `vite preview`)
 * with the same in-page native-bridge mock the e2e suite uses
 * (support/bridgeMock.ts), over a small workspace of original sample notes
 * written for this script: no real names and no third-party text. Every
 * request that is not same-origin, a data URI or a blob fails the run, the
 * same offline rule the e2e fixtures enforce.
 *
 * Usage, from tests/e2e (after `npm ci` and `npm run install:browsers`):
 *
 *   node screenshots.mjs
 *
 * Output: assets/screenshots/{split-view,graph-view,settings}.png (light) and
 * {split-view,graph-view,settings}-dark.png, optimised with optipng when it
 * is installed. The light files keep their historic names because the Flatpak
 * metainfo links split-view.png. Needs Node 22.18 or newer: it imports the
 * TypeScript bridge mock directly.
 */
/* global console, fetch, setTimeout, window */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { bridgeMockInPage } from "./support/bridgeMock.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outDir = join(repoRoot, "assets", "screenshots");
const PORT = 4174;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = "/sample/notes";
const CONFIG = "/sample/config";

/** Original sample notes; the wikilinks form the graph that gets shown. */
const NOTES = {
  "Welcome.md": [
    "# Welcome to the Garden Notebook",
    "",
    "This notebook is a folder of plain `.md` files. Nothing here is locked in:",
    "any editor can open it, and any sync tool can copy it.",
    "",
    "## Where things live",
    "",
    "- Planting dates and bed layouts are in [[Spring Planting Plan]].",
    "- What went wrong last year is in [[Pest Log]].",
    "- Seed sources and a wish list are in [[Seed Orders]].",
    "- The weekly diary starts at [[2026-03-14]].",
    "",
    "## Conventions",
    "",
    "Open tasks use `- [ ]` so they show up in the Task Hub. ==Highlights==",
    "mark things to revisit, and #garden marks the notes that belong together.",
    "",
    "- [x] Order the seed potatoes",
    "- [ ] Build the second cold frame",
    "",
  ].join("\n"),
  "Spring Planting Plan.md": [
    "# Spring Planting Plan",
    "",
    "Back to [[Welcome]]. Seeds are tracked in [[Seed Orders]].",
    "",
    "| Bed | Crop | Sow indoors | Plant out |",
    "| --- | ---- | ----------- | --------- |",
    "| North | Tomatoes | early March | mid May |",
    "| North | Basil | late March | late May |",
    "| South | Peas | not needed | late March |",
    "",
    "- [ ] Harden off the tomato seedlings for a week",
    "- [ ] Sow peas along the south fence",
    "",
    "#garden #plan",
    "",
  ].join("\n"),
  "Pest Log.md": [
    "# Pest Log",
    "",
    "Aphids returned on the beans in July, see [[2026-03-14]] for the",
    "plan to plant marigolds earlier this year. Related: [[Spring Planting Plan]].",
    "",
    "#garden",
    "",
  ].join("\n"),
  "Seed Orders.md": [
    "# Seed Orders",
    "",
    "- [x] Seed potatoes, two varieties",
    "- [ ] Marigolds, one packet",
    "- [ ] Sweet peas for the fence",
    "",
    "Planning notes live in [[Spring Planting Plan]]. Index: [[Welcome]].",
    "",
    "#garden #shopping",
    "",
  ].join("\n"),
  "Journal/2026-03-14.md": [
    "# Saturday in the garden",
    "",
    "Turned the compost and cleared the north bed. The soil is still cold, so",
    "the tomatoes stay indoors for now. See [[Spring Planting Plan]] and",
    "[[Pest Log]].",
    "",
    "#journal",
    "",
  ].join("\n"),
  "Reading/Soil Basics.md": [
    "# Soil Basics",
    "",
    "Notes from a library book on soil: texture, drainage and why compost",
    "beats fertiliser. Feeds into [[Spring Planting Plan]].",
    "",
    "#reading",
    "",
  ].join("\n"),
};

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview server did not start on ${ORIGIN}`);
}

const fileName = (name, theme) =>
  theme === "dark" ? `${name}-dark.png` : `${name}.png`;

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  // Always screenshot the current source, never a stale dist.
  run("npx", ["vite", "build"], repoRoot);
  const server = spawn(
    "npx",
    [
      "vite",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--strictPort",
    ],
    { cwd: repoRoot, stdio: "ignore" },
  );
  const violations = [];
  const browser = await chromium.launch();
  try {
    await waitForServer();
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "UTC",
        reducedMotion: "reduce",
        colorScheme: theme,
        deviceScaleFactor: 1,
      });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (
          url.startsWith(ORIGIN) ||
          url.startsWith("data:") ||
          url.startsWith("blob:")
        ) {
          return route.continue();
        }
        violations.push(url);
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => violations.push(`uncaught: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") violations.push(`console: ${m.text()}`);
      });
      await page.addInitScript(bridgeMockInPage, {
        root: ROOT,
        configDir: CONFIG,
        files: NOTES,
        theme,
      });
      // The mock names its workspace profile "E2E Notes"; show a neutral name
      // by rewriting it in the config the app reads (support/ stays untouched).
      await page.addInitScript((name) => {
        const internals = window.__TAURI_INTERNALS__;
        const real = internals.invoke;
        internals.invoke = async (cmd, args, ...rest) => {
          const out = await real(cmd, args, ...rest);
          return typeof out === "string"
            ? out.replaceAll("E2E Notes", name)
            : out;
        };
      }, "Garden Notebook");

      const shot = async (name) => {
        await page.screenshot({
          path: join(outDir, fileName(name, theme)),
          animations: "disabled",
        });
      };
      const nav = page.getByRole("navigation", { name: "Primary navigation" });

      await page.goto(ORIGIN);
      await page.locator(`[data-tree-path="${ROOT}/Welcome.md"]`).waitFor();

      // Build the link index (the app does so when a panel needing it opens),
      // then go back to the file tree.
      await nav.getByRole("button", { name: "Tags" }).click();
      await page.getByText("garden", { exact: true }).first().waitFor();
      await nav.getByRole("button", { name: "Files" }).click();

      await page.locator(`[data-tree-path="${ROOT}/Welcome.md"]`).click();
      await page.getByRole("radio", { name: "Preview" }).click();
      await page.getByRole("heading", { name: /Garden Notebook/ }).waitFor();

      await page.getByRole("radio", { name: "Split" }).click();
      await page.locator(".cm-content").waitFor();
      await page.waitForTimeout(500);
      await shot("split-view");

      await nav.getByRole("button", { name: "Graph view" }).click();
      await page.waitForTimeout(2500); // let the force layout settle
      await shot("graph-view");

      await page.getByRole("button", { name: "Close graph" }).click();
      await nav.getByRole("button", { name: "Settings" }).click();
      await page.waitForTimeout(500);
      await shot("settings");

      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  if (violations.length > 0)
    throw new Error(`offline or console violations:\n${violations.join("\n")}`);

  const opt = spawnSync("optipng", ["--version"], { stdio: "ignore" });
  if (opt.error) {
    console.warn("optipng not installed: PNGs left unoptimised");
  } else {
    for (const theme of ["light", "dark"])
      for (const name of ["split-view", "graph-view", "settings"])
        spawnSync(
          "optipng",
          [
            "-quiet",
            "-o5",
            "-strip",
            "all",
            join(outDir, fileName(name, theme)),
          ],
          { stdio: "inherit" },
        );
  }
}

await main();
