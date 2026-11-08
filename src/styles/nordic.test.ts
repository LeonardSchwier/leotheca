/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tokens = readFileSync(
  require.resolve("@leonardschwier/leoforma/tokens.css"),
  "utf8",
);
const nordicCss = readFileSync(
  new URL("./nordic.css", import.meta.url),
  "utf8",
);
const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const indexHtml = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);

type Palette = Record<string, string>;

/** Custom properties of the first rule whose selector is exactly `selector`. */
function declarations(css: string, selector: string): Palette {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const end = css.indexOf("}", start);
  const out: Palette = {};
  for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g))
    out[m[1]] = m[2].trim();
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = declarations(tokens, ':root[data-palette="nordic"]');
const dark = declarations(
  tokens,
  ':root[data-palette="nordic"][data-theme="dark"]',
);

const SURFACES = [
  "--ds-color-canvas",
  "--ds-color-panel",
  "--ds-color-raised",
  "--ds-color-sunken",
  "--ds-color-hover",
  "--ds-color-selected",
];

describe("Nordic palette contrast (WCAG AA)", () => {
  for (const [mode, p] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    describe(mode, () => {
      it("keeps body, secondary and muted text at 4.5:1 on every surface", () => {
        for (const text of [
          "--ds-color-text",
          "--ds-color-text-secondary",
          "--ds-color-text-muted",
        ])
          for (const surface of SURFACES)
            expect(
              contrast(p[text], p[surface]),
              `${mode} ${text} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps accent, status and link-like text at 4.5:1 on the main surfaces", () => {
        for (const text of [
          "--ds-color-accent",
          "--ds-color-accent-hover",
          "--ds-color-success",
          "--ds-color-warning",
          "--ds-color-danger",
        ])
          for (const surface of [
            "--ds-color-canvas",
            "--ds-color-panel",
            "--ds-color-raised",
          ])
            expect(
              contrast(p[text], p[surface]),
              `${mode} ${text} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(p["--ds-color-accent"], p["--ds-color-accent-soft"]),
          `${mode} accent on accent-soft`,
        ).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps button labels at 4.5:1 on their fills", () => {
        for (const fill of ["--ds-color-accent", "--ds-color-accent-hover"])
          expect(
            contrast(p["--ds-color-on-accent"], p[fill]),
            `${mode} on-accent on ${fill}`,
          ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(p["--ds-color-on-danger"], p["--ds-color-danger"]),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps the focus ring and control border at 3:1 (non-text)", () => {
        for (const surface of [
          "--ds-color-canvas",
          "--ds-color-panel",
          "--ds-color-raised",
        ]) {
          expect(
            contrast(p["--ds-color-focus"], p[surface]),
            `${mode} focus on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
          expect(
            contrast(p["--ds-color-border-strong"], p[surface]),
            `${mode} border-strong on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }

  it("keeps the ocean, forest and plum accents at AA on the Nordic surfaces", () => {
    for (const accent of ["ocean", "forest", "plum"]) {
      const lightSel = `:root[data-accent="${accent}"]`;
      const darkSel = `:root[data-theme="dark"][data-accent="${accent}"]`;
      for (const [mode, sel, p] of [
        ["light", lightSel, light],
        ["dark", darkSel, dark],
      ] as const) {
        const a = declarations(themeCss, sel);
        for (const surface of [
          "--ds-color-canvas",
          "--ds-color-panel",
          "--ds-color-raised",
        ])
          expect(
            contrast(a["--ds-color-accent"], p[surface]),
            `${accent} ${mode} accent on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(a["--ds-color-on-accent"], a["--ds-color-accent"]),
          `${accent} ${mode} on-accent`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("Nordic theme wiring", () => {
  it("selects Leoforma's nordic palette on the root element", () => {
    expect(indexHtml).toMatch(/<html[^>]*data-palette="nordic"/);
  });

  it("loads nordic.css after App.css so equal selectors resolve to it", () => {
    expect(main.indexOf("./app/App.css")).toBeGreaterThan(-1);
    expect(main.indexOf("./styles/nordic.css")).toBeGreaterThan(
      main.indexOf("./app/App.css"),
    );
  });

  it("scopes every nordic.css rule to the palette so removing it restores Folio", () => {
    const body = nordicCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = body
      .split("}")
      .map((rule) => rule.split("{")[0].trim())
      .filter(Boolean)
      .flatMap((s) => s.split(",").map((x) => x.trim()));
    expect(selectors.length).toBeGreaterThan(5);
    for (const s of selectors)
      expect(s, s).toMatch(/^:root\[data-palette="nordic"\]/);
  });

  it("uses tokens only, no fixed colors", () => {
    expect(nordicCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
