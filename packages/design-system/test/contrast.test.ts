import { describe, expect, it } from "vitest";
import { themes, type ColorMode, type ColorRoles, type ThemeName } from "../src/tokens";
import { contrastRatio } from "../src/tokens/contrast";

type Role = keyof ColorRoles;
const SURFACES: Role[] = ["canvas", "panel", "raised", "sunken", "hover", "selected"];
const CONTROL_SURFACES: Role[] = ["canvas", "panel", "raised"];

/** [foreground, background, minimum ratio]. WCAG 2.1 AA: 4.5 for text, 3 for
 * focus indicators and control boundaries (1.4.3 and 1.4.11). */
const PAIRS: [Role, Role, number][] = [
  ...SURFACES.flatMap((s): [Role, Role, number][] => [
    ["text", s, 4.5],
    ["textSecondary", s, 4.5],
    ["textMuted", s, 4.5],
  ]),
  ...CONTROL_SURFACES.flatMap((s): [Role, Role, number][] => [
    ["accent", s, 4.5],
    ["success", s, 4.5],
    ["warning", s, 4.5],
    ["danger", s, 4.5],
    ["focus", s, 3],
    ["borderStrong", s, 3],
  ]),
  ["onAccent", "accent", 4.5],
  ["onAccent", "accentHover", 4.5],
  ["onDanger", "danger", 4.5],
  ["accent", "accentSoft", 4.5],
  ["text", "accentSoft", 4.5],
];

describe("WCAG AA contrast", () => {
  for (const themeName of Object.keys(themes) as ThemeName[]) {
    for (const mode of ["light", "dark"] as ColorMode[]) {
      const roles = themes[themeName].color[mode];
      describe(`${themeName} ${mode}`, () => {
        it.each(PAIRS)("%s on %s reaches %d:1", (fg, bg, min) => {
          expect(contrastRatio(roles[fg], roles[bg])).toBeGreaterThanOrEqual(min);
        });
      });
    }
  }
});

describe("contrastRatio", () => {
  it("matches the WCAG reference points", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("rejects anything but six digit hex, so a typo cannot pass silently", () => {
    expect(() => contrastRatio("red", "#ffffff")).toThrow(/six digit hex/);
  });
});
