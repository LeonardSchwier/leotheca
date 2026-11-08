# Minimalistic Nordic UI theme

## Item

rm-248e06c0b3c3c3ee, "Minimalistic Nordic UI theme". Outcome: Leotheca looks calm and Scandinavian by default: a cool light palette (frost white, soft greys, fog blue, one muted accent), a dark polar night companion, and reduced chrome (quiet borders, flat controls, light icon strokes, soft elevation) on desktop and Android layouts, with no behavior change.

## Acceptance

- The root element carries `data-palette="nordic"`, so Leoforma's Nordic light and dark palettes drive every `--ds-*` token; the `data-theme` light, dark and system mechanism is untouched.
- Every text and control pairing that the app and Leoforma use keeps WCAG AA: body text, secondary and muted text, accent and on-accent, danger, focus ring and the strong control border (1.4.11, 3:1) in both modes. A node script computes the ratios from the built tokens and the app overrides and fails below the thresholds (`src/styles/nordic.test.ts`).
- Reduced chrome lives in one file, `src/styles/nordic.css`, scoped under `:root[data-palette="nordic"]`, imported after `App.css`. Removing the attribute restores the Folio look, which proves the change is theming only.
- The default accent choice (stored value `warm`) now resolves to the fog blue of the palette; its label reads "Fog" instead of "Warm". The stored value, the enum and every other accent choice are unchanged.
- The README screenshots are regenerated in light and dark, each under 300 KB.
- The Playwright suite, vitest, tsc, eslint and the build pass unchanged.

## Context

Read `src/styles/theme.css` (maps app names onto Leoforma `--ds-*` tokens; sets accent choices), `src/app/App.css` (2236 lines, the chrome rules), `src/main.tsx` (import order), `src/settings/store.ts` (sets `data-theme`), `src/app/App.tsx` (sets `data-accent` only when workspace themes are on), Leoforma 0.2.0 `tokens.css` and `components.css`. Leoforma 0.2.0 already ships the Nordic palette selected by `data-palette="nordic"` (colors, soft shadows), so the design system owns the tokens and the app only selects the palette. Crash-freedom: pure CSS, one HTML attribute and one label string; no runtime path changes. Android uses the same bundle, so one stylesheet covers both; the compact (Android) layout rules in App.css are not touched, only the shared chrome selectors.

## Plan

1. `index.html`: add `data-palette="nordic"` to `<html>` (no flash of the old palette). Test: `nordic.test.ts` asserts it.
2. `src/styles/nordic.css`: quiet chrome under the palette guard (toolbar and tab hairlines removed or softened, flat ghost buttons in the toolbar, borderless segmented control on a sunken track, thinner icon strokes, calmer heading weight, more room around the editor panes). Import in `src/main.tsx` after `App.css`. Test: `nordic.test.ts` asserts the guard on every rule.
3. `src/styles/nordic.test.ts`: contrast ratios for both modes from `tokens.css` plus the three other accents.
4. `src/settings/SettingsPanel.tsx`: label "Warm" -> "Fog".
5. Screenshots, CHANGELOG, master-spec change-log and appearance paragraph.

## Out of scope

Changing the Leoforma repo, new components, changing the stored accent enum, layout or behavior changes, the highlight and `==mark==` colors (they stay saturated so they remain legible on both surfaces), the Android native chrome.

## Rulings

Q: Add a new palette in the app, or select Leoforma's? -> Select Leoforma's `nordic` palette | the design system already owns it and it passed its own contrast review; a second copy would drift | a later switch back is one attribute.
Q: Make Nordic opt-in or the default? -> Default, as the roadmap item asks for a redesign of the visual system | opt-in would leave the busy look as the first impression | reverting is deleting one attribute.
Q: Rename the stored accent value `warm`? -> No, relabel only | the value is persisted in workspace settings, a rename needs a migration and would be a behavior change | the label "Fog" is slightly inexact for the stored name, harmless.
Q: Where do reduced-chrome rules go? -> One new stylesheet scoped to the palette | App.css is shared by every layout and 2236 lines long; a guarded override keeps the diff reviewable and reversible | rules in a second file can drift from App.css selectors, caught by the e2e journeys and screenshots.
Q: Does lowering border contrast break accessibility? -> No | decorative separators (`--ds-color-border`) are not UI component boundaries; controls keep `--ds-color-border-strong`, which the test holds to 3:1 | a wrongly quiet control would fail the test.
Q: Do the other accents (ocean, forest, plum) clash with the palette? -> Keep them | the owner chose them as workspace choices and their pairs were already verified at 5.3:1 and higher; the test re-checks them on the Nordic surfaces | a failing pair is fixed in theme.css.
Q: Visual regression for Android? -> Android shares the web bundle; the compact layout is exercised by the e2e mobile viewport journeys, and no native resource changes | a native-only regression cannot be seen in headless Chromium and is recorded as unverifiable here.
Q: Leoforma follow-up? -> Leoforma could expose a quiet-chrome variant (flat segmented control, ghost secondary button, icon stroke token) so apps need no override | recorded for a Leoforma item, the pin is not bumped now.

Glossary: none (palette is Leoforma's own term; GLOSSARY.md is under another live claim)

## Design system

- Reuse: Leoforma Nordic palette tokens (`--ds-color-*`, `--ds-shadow-*`), `Button`, `IconButton`, `SegmentedControl`, `Tabs`, all untouched.
- Add: `src/styles/nordic.css`, app-level overrides of Leoforma component classes (`.ds-btn-secondary`, `.ds-segmented`, `.ds-icon`) because Leoforma 0.2.0 has no quiet variant or icon stroke token; Leoforma follow-up noted in the rulings.
- Change: callers of `.ds-segmented` and secondary buttons inside the toolbar, tab bar and document header look flatter.

## Evidence

| Claim                                              | Evidence                                                                                                                                                | Result                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| palette selected on the root                       | `npx vitest run src/styles/nordic.test.ts`, "selects Leoforma's nordic palette"; seen failing with the attribute removed, then passing                  | 13 passed                                    |
| WCAG AA in light and dark (text 4.5, controls 3)   | same file, "Nordic palette contrast (WCAG AA)": text, secondary, muted on six surfaces; accent, status, on-accent, focus ring, strong border; 3 accents | all pairs pass, none below threshold         |
| every nordic.css rule guarded, no fixed colors     | same file, "scopes every nordic.css rule" and "uses tokens only"                                                                                        | passed                                       |
| nothing else broke                                 | `npx tsc --noEmit`, `npx eslint` on changed files, `npx vitest run`, `npm test` in tests/e2e                                                            | 0 errors; 3304 unit passed; 17 e2e passed    |
| README screenshots in light and dark, each < 300KB | `node screenshots.mjs` from tests/e2e; largest file 104 KB                                                                                              | 8 PNGs regenerated                           |
| review: standards                                  | self-review of the diff against the repo rules (one CSS file, one attribute, one label, tests, docs), no second model                                   | closed, no findings                          |
| review: spec                                       | each acceptance line mapped to a test or command above                                                                                                  | met; Android native rendering not verifiable |
| e2e smoke / security                               | Playwright suite above; no script, network or permission change, so the security gate has nothing to scan                                               | pass / N/A                                   |
| legal/text check                                   | `Legal/text check: 6 verified, 0 fixed, 0 open` (changelog, master spec, spec, label "Fog", regenerated screenshots of original sample notes)           | recorded                                     |

Measured lowest ratios (Nordic tokens): see the test; the weakest text pair is muted text on the selected surface in light mode, 4.66:1 (dark 4.73:1); strong border at least 3.12:1, focus ring at least 6.29:1.

Unverifiable here: Android device rendering (the WebView shares this bundle, but no emulator ran) and the Leoforma follow-up (quiet button and segmented variants, icon stroke token), which needs a Leoforma release.

Reflection: the design system already shipped the Nordic palette, so reading its tokens before designing turned a palette project into a one-attribute switch plus a quiet-chrome file -> none: the playbook's design-system check already tells agents to look there first; separately a stale ledger fetch made a claim push fail in the hook before it failed as non-fast-forward, which the existing rule to refetch both branches covers.
