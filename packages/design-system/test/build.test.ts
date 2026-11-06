import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { themes, tokens } from "../src/tokens";

const root = join(__dirname, "..");
const dist = join(root, "dist");
const read = (name: string) => readFileSync(join(dist, name), "utf8");

describe("build output", () => {
  beforeAll(() => {
    execFileSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "pipe" });
  }, 60_000);

  it("emits every token format, each from the same source", () => {
    expect(JSON.parse(read("tokens.json"))).toEqual(JSON.parse(JSON.stringify(tokens)));
    const css = read("tokens.css");
    expect(css).toContain(`--ds-color-canvas: ${themes.folio.color.light.canvas};`);
    expect(css).toContain(`--ds-color-canvas: ${themes.nordic.color.dark.canvas};`);
    expect(css).toContain(`--ds-space-4: ${tokens.space["4"]};`);
  });

  it("selects themes through OS preference, data-theme, and data-palette", () => {
    const css = read("tokens.css");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-palette="nordic"]:not([data-theme="light"])');
    expect(css).toContain(':root[data-palette="nordic"][data-theme="dark"]');
  });

  it("collapses motion under prefers-reduced-motion", () => {
    const css = read("tokens.css");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const key of Object.keys(tokens.motion)) {
      expect(block).toContain(`--ds-motion-${key}: 1ms;`);
    }
  });

  it("references no remote resource and only bundled font files", () => {
    for (const file of ["tokens.css", "fonts.css", "components.css", "styles.css"]) {
      const urls = [...read(file).matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!);
      for (const url of urls) {
        expect(url).toMatch(/^\.\/fonts\//);
        expect(existsSync(join(dist, url))).toBe(true);
      }
      expect(read(file)).not.toMatch(/@import|https?:\/\//);
    }
  });

  it("ships a license next to every font family", () => {
    const files = readdirSync(join(dist, "fonts"));
    for (const family of ["Figtree", "Literata", "SourceCodePro"]) {
      expect(files.some((f) => f.startsWith(`${family}-LICENSE`))).toBe(true);
    }
  });

  it("keeps preact the only runtime import", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies)).toEqual(["preact"]);

    const visit = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? visit(join(dir, entry.name))
          : entry.name.endsWith(".js")
            ? [join(dir, entry.name)]
            : [],
      );
    for (const file of visit(dist)) {
      const specifiers = [
        ...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g),
      ].map((m) => m[1]!);
      for (const specifier of specifiers) {
        expect(specifier).toMatch(/^(preact(\/.*)?|\.{1,2}\/.*)$/);
      }
    }
  });

  it("uses import paths a native ESM consumer can resolve", () => {
    const index = read("index.js");
    expect(index).toMatch(/from "\.\/tokens\/index\.js"/);
  });
});
