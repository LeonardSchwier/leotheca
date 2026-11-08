# Upgrade the lint stack to clear the remaining dev-dependency advisories

## Item

rm-b11310003a5039ef, "Upgrade the lint stack to clear the remaining dev-dependency advisories". Outcome: `npm audit` reports 0 vulnerabilities without a downgrade or a blanket lint disable.

## Acceptance

- `npm audit` and `npm audit --omit=dev` report 0.
- `npm run lint`, `tsc`, `npm test`, `npm run build` and `npm run test:e2e` pass as before.
- `flatpak/node-sources.json` matches the lockfile.

## Context

GHSA-g3hv-75wg-m249 affects minimatch `>= 7.0.0, < 11.0.1`. Installed: 10.2.6 under eslint 10.14.0, `@eslint/config-array` 0.23.5 and typescript-estree 8.72.1; 11.0.5 under glob 14 (rimraf, Capacitor CLI). The npm registry's newest eslint, `@eslint/config-array` and typescript-estree all still declare `minimatch ^10.2.x`, so there is no newer major to upgrade to, and Dependabot's update fails for that reason. `npm audit fix --force` would only reinstall eslint 9.39.5, a downgrade that does not clear anything.

## Plan

1. Root `overrides` entry `minimatch: ^11.0.5` in `package.json`; `npm install`; lockfile shows one minimatch 11.0.5.
2. Run lint, tsc, unit tests, build and e2e on that tree.
3. Regenerate the Flatpak node sources; master-spec change-log and CHANGELOG entries.

## Out of scope

Waiting for upstream eslint and typescript-eslint to widen their minimatch range (the override is removed then).

## Rulings

- Override instead of major upgrade: no major exists that fixes it. Cost if wrong: delete one line. minimatch 11 keeps the named `minimatch` export and the `20 || >=22` engine range the project already meets.
- No lint source changes: lint output is identical (0 errors, the same 3 pre-existing react-hooks warnings).

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

| Claim        | Evidence                                        | Result                      |
| ------------ | ----------------------------------------------- | --------------------------- |
| audit        | `npm audit` before and after                    | 10 moderate before, 0 after |
| lint, types  | `npm run lint`, `npx tsc --noEmit`              | 0 errors, tsc clean         |
| tests, build | `npm test`, `npm run build`                     | 3328 passed, built          |
| e2e          | `npm run test:e2e`                              | 17 passed                   |
| flatpak      | `npx vitest run scripts/flatpakSources.test.js` | 13 passed                   |

Reflection: an exclusive claim on a directory (`documentation`, `skills/...`) blocked a one-row doc edit in this item, and a checked-in CRLF blob of `android/gradlew.bat` leaves every worktree dirty and blocks the ledger helper -> none: both are noted in the handoff for the next maintenance pass.
