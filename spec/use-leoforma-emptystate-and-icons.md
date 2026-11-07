# Use Leoforma's EmptyState and Icon set in the app

## Context

- Roadmap item `rm-eb041022ac75bcf8`, "Use Leoforma's EmptyState and Icon set in the app".
- Leoforma 0.2.0 ships a richer `EmptyState` and a typed `Icon` set (28 icons). The app still carries its own copies in `src/ui/`.
- Callers: `Icon` is used in `App.tsx`, `ActivityRail.tsx`, `DocumentHeader.tsx` and `Inspector.tsx`; `EmptyState` in `BookmarksPanel.tsx` and `TagsPanel.tsx`.

## Acceptance criteria

1. No `EmptyState` or `Icon` code remains in `src/ui/`; every caller imports them from `@leonardschwier/leoforma`.
2. Every icon name the app uses exists in Leoforma (enforced by `tsc` through Leoforma's `IconName` type).
3. The two empty states still render a labelled section with title, description and a decorative icon.
4. `src/ui/primitives.css` is gone and `src/ui/` holds only the Android back-button wiring.
5. `tsc`, `eslint`, the unit tests, the build and the e2e journeys pass.

## Grill: rulings

| Question                                                                                                                         | Ruling                                                                                                                                                                                   | Why                                                                                                                    | Cost if wrong                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The app's `Icon` took `label` and `spin`; Leoforma's takes `title` and has no `spin`.                                            | Drop both.                                                                                                                                                                               | A search shows no production caller using either; only the old component's own test did.                               | A future caller needs a spinning icon: use Leoforma's `Spinner`.              |
| The app's `EmptyState` took an icon name; Leoforma's takes an element.                                                           | Callers pass `icon={<Icon name="bookmark" size={20} />}`; the size follows the old rule (20 for `sm`, 24 for `md`, both callers use `sm`).                                               | Same pixels as before, and Leoforma's slot stays flexible.                                                             | A caller forgets the size: the glyph is the default 20 anyway.                |
| Leoforma's `.ds-icon` sets only `flex: none`; the app's `.icon` also set `display: inline-block` and `vertical-align: -0.125em`. | Keep those two properties in an app-level `.ds-icon` rule in `theme.css`, and delete `.icon` and the unused `.icon-spin` and keyframes.                                                  | Avoids a visible baseline shift in inline icon and text rows without waiting for a Leoforma release.                   | Leoforma adds the same rule later: the app rule becomes redundant and can go. |
| Keep the old `EmptyState` and `Icon` unit tests?                                                                                 | Delete them with the code. Leoforma's suite has axe and behavior tests for both. The icon-name coupling needs no test: `tsc` rejects an unknown name through Leoforma's `IconName` type. | Testing a copy of the library twice hides who owns the behavior; the type checker guards the one coupling the app has. | A Leoforma regression surfaces later: its own tests run before a release.     |

## Design-system check

Reuse: both come from the shared design system. Nothing is added to Leoforma; one follow-up is noted (the baseline rule above).

## Evidence

(filled in when the item is finished)
