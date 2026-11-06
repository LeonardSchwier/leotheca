# Leotheca design system (in-repo package)

Design tokens (CSS custom properties and JSON) and thin, accessible Preact components with two themes, Folio and Nordic. Fonts are bundled, so building and using the package needs no network.

This package lives in the application repository for now. It is private and not published. Extracting it into a standalone public repository, and consuming it from there as a pinned dependency, is a decision for the repository owner (see the roadmap item "Shared design system package").

## Develop

```sh
cd packages/design-system
npm ci
npm run check   # tsc, eslint, vitest, build
```

`npm run build` writes `dist/` (gitignored): `index.js` and types, `tokens.css`, `tokens.json`, `fonts.css`, `components.css`, `styles.css`, and the font files with their licenses.

The application's own `npm test` excludes this directory; run the package's tests with the command above.
