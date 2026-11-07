/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

/** Declarations of every rule whose selector mentions `data-accent="<name>"`. */
function accentDeclarations(name: string): string {
  const rules = css.matchAll(
    /([^{}]*data-accent="([a-z]+)"[^{}]*)\{([^}]*)\}/g,
  );
  return [...rules]
    .filter((rule) => rule[2] === name)
    .map((rule) => rule[3])
    .join("\n");
}

describe("theme.css accent choices", () => {
  for (const accent of ["ocean", "forest", "plum"]) {
    it(`${accent} sets Leoforma's accent tokens so shared components follow it`, () => {
      const declarations = accentDeclarations(accent);
      for (const token of [
        "--ds-color-accent",
        "--ds-color-accent-hover",
        "--ds-color-accent-soft",
        "--ds-color-on-accent",
      ]) {
        // light, media dark and data-theme dark: three declarations each.
        const count = declarations.split(`${token}:`).length - 1;
        expect(count, `${accent} ${token}`).toBe(3);
      }
    });
  }

  it("keeps the app's accent aliases pointing at Leoforma's tokens", () => {
    expect(css).toContain("--color-accent: var(--ds-color-accent);");
  });
});
