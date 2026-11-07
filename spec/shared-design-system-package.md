# Shared design system package

Superseded: the package became the public Leoforma repository and the app consumes it as a pinned dependency (see `wire-the-app-to-leoforma.md`). `packages/design-system` no longer exists in this repo.

## Item

rm-4cc29a2e6a26d6b3. Tokens and Preact components as a package the app consumes as a pinned, offline-buildable dependency.

## Acceptance

- `packages/design-system` builds from its own lockfile with `npm ci` and passes `npm run check` (tsc, eslint, vitest, build).
- The application's `tsc`, `lint`, `check-version`, `test` and `build` stay green with the package present.
- No external resource (repository, registry package) is created.

## Context

A predecessor wrote the package as a standalone repo (never pushed). It is imported here unchanged except: `private: true`, repository URL points at this repo, site scripts and docs-file entries removed (no site or README existed), `@types/node` added (tsc failed without it), two test fixes for jsdom (no PointerEvent; synthetic click reaches a disabled button). The app's vitest excludes `packages/**`.

## Plan

1. In-repo package (this slice).
2. Wire the app to it (needs `package.json`, `src/styles/theme.css`, `src/ui/primitives.css`; `package.json` is held by the live git-hooks claim rm-beb6c8d16656ad41). Seeded as its own roadmap item.
3. Public repository and pinned remote dependency: owner action.

## Out of scope

Creating or publishing any GitHub repository or npm package. Changing the app's visuals.

## Rulings

- Public repo creation -> not done | creates an external, public resource without owner approval | Cost if wrong: owner creates it later; the package is extractable as is.
- App wiring now -> deferred | overlapping live claim on `package.json`; editing without a claim is forbidden | Cost: one more slice.

## Design system

Reuse/Add/Change: adds the package only; no app caller changed.

## Evidence

See `.agents/handoffs/rm-4cc29a2e6a26d6b3.md`.
