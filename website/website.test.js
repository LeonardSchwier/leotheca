// @vitest-environment node
// Regression guards for the static site. GitHub project Pages serves it under
// /leotheca/, so a root-absolute URL (href="/styles.css") resolves to the
// account root and 404s. The first deployment attempt shipped exactly that.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const pages = readdirSync(root).filter((name) => name.endsWith(".html"));

function localRefs(html) {
  return [...html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((ref) => !/^(https?:|mailto:|data:)/.test(ref));
}

describe("website static pages", () => {
  it("has both pages", () => {
    expect(pages.sort()).toEqual(["features.html", "index.html"]);
  });

  for (const page of pages) {
    const html = readFileSync(join(root, page), "utf8");

    it(`${page} uses only relative local URLs that exist`, () => {
      const refs = localRefs(html);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref.startsWith("/"), `${page}: root-absolute URL ${ref}`).toBe(
          false,
        );
        const target = ref === "./" ? "index.html" : ref;
        expect(existsSync(join(root, target)), `${page}: missing ${ref}`).toBe(
          true,
        );
      }
    });

    it(`${page} makes no third-party request`, () => {
      const external = [
        ...html.matchAll(
          /<(?:link|script|img|source|iframe)[^>]+(?:href|src)="(https?:[^"]+)"/g,
        ),
      ].map((m) => m[1]);
      expect(external).toEqual([]);
    });

    it(`${page} carries no unverifiable count or absolute promise`, () => {
      expect(html).not.toMatch(/\b250\b/);
      expect(html).not.toMatch(/forever|\bEver\.|nothing leaves your device/i);
    });
  }

  it("does not advertise unsubmitted stores as install options", () => {
    const html = readFileSync(join(root, "index.html"), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(html).toMatch(/F-Droid is planned, not yet submitted/);
    expect(html).toMatch(/Flathub is planned, not yet submitted/);
  });
});
