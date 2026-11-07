# Use Leoforma's Sheet and StatusIndicator in the app

## Context

- Roadmap item `rm-caa94101255e6ade`, "Use Leoforma's Sheet and StatusIndicator in the app".
- Leoforma 0.2.0 ships `Sheet` (it wraps Leoforma's `Dialog`) and `StatusIndicator`, ported from the app. The app still carries its own copies in `src/ui/`.
- Callers: `src/app/App.tsx` and `src/app/layout/DocumentHeader.tsx` use `StatusIndicator`; `src/app/CaptureSheet.tsx` uses `Sheet`.

## Acceptance criteria

1. No `Sheet` or `StatusIndicator` code remains in `src/ui/`; the three callers import them from `@leonardschwier/leoforma`.
2. The "Unsaved" indicator in `DocumentHeader` keeps its accessible name "Unsaved changes" (`getByLabelText` still finds it).
3. The Android back button still dismisses the topmost overlay when that overlay is a `Sheet`, including a `Sheet` above a `Dialog`.
4. The CSS rules for the removed components are deleted from `src/ui/primitives.css`.
5. `tsc`, `eslint`, the unit tests, the build and the e2e journeys pass.

## Grill: rulings

| Question                                                                                    | Ruling                                                                                                                                                                                                             | Why                                                                                                                        | Cost if wrong                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Leoforma's `StatusIndicator` has no `ariaLabel` prop. Extend Leoforma, or adapt in the app? | Adapt in the app: wrap the one affected indicator in `<span role="group" aria-label="Unsaved changes">`.                                                                                                           | Only one call site uses it. A release of Leoforma plus a new pin and Flatpak entries is a lot for one label.               | A second call site needs the label: then add the prop to Leoforma.            |
| Should the wrapper be a live region (`role="status"`)?                                      | No. A `group` gives a name without announcing every save-state change.                                                                                                                                             | The old element had an `aria-label` on a plain span and no live role; announcing "Unsaved" on each edit would be noise.    | Screen-reader users miss a state change: the visible text is still there.     |
| Who wires the Android back button now that `Sheet.tsx` (which imported it) is gone?         | `CaptureSheet.tsx` imports `../ui/overlayBackButton` itself, like `ConfirmDialogHost` and `MarkdownImportDialog` already do.                                                                                       | The import is a side effect that registers one listener on Leoforma's overlay stack; a user of `Sheet` must load it.       | A future `Sheet` user forgets the import: the back button exits the app.      |
| Keep the old `Sheet` and `StatusIndicator` unit tests?                                      | Delete them with the code. Leoforma's suite covers the components (axe and behavior). Port only the app-owned contract: stacking with `Dialog` and the back press, into `src/ui/overlayBackButton.sheet.test.tsx`. | Testing a copy of the library's behavior twice hides which side owns it; the integration with the app's back button stays. | A Leoforma regression is caught later: its own tests run before each release. |
| Do the look and the class names change?                                                     | The look follows Leoforma (`ds-sheet`, `ds-status`), which the app already uses for `Dialog` and `Button`. The app's `.sheet-*` and `.status-indicator*` rules are deleted.                                        | One source for the component styles.                                                                                       | A visual regression in the Quick Capture sheet: the e2e journeys cover boot.  |

## Design-system check

Reuse: both components come from the shared design system. Nothing is added or changed in Leoforma. No new UI surface.

## Evidence

Landed 1bee0c5 (formatting only) and c91a06c (swap). Hosted on c91a06c: Agent policy 42370369392, Rules 42370369385, CI 42370369419, Release 42370369400 success; Release jobs windows, macos, flatpak, publish success. Local gate in the pre-push hook: tsc 0, eslint 0 errors (3 warnings), vitest 174 files / 3276 tests, build ok, e2e 14 passed; the ported stacking and back-press tests pass against Leoforma's Sheet; master spec and traceability updated.
