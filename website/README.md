# Leotheca website

A two-page static site: `index.html` (landing page) and `features.html` (a short, code-checked feature list). There is no build step, framework, script or third-party request; `styles.css`, `fonts/`, `icons/` and `screenshots/` are served as they are. All local URLs are relative on purpose: project Pages serves the site under `/leotheca/`, where a root-absolute `/styles.css` would 404. `website.test.js` enforces this.

## Preview locally

```sh
python3 -m http.server 8000 --directory website
```

Open `http://localhost:8000/`. To reproduce the sub-path of the hosted site, serve a parent directory that contains a `leotheca` link to this folder and open `/leotheca/`.

## Deploy

`.github/workflows/gh-pages.yml` uploads the `website/` directory as a Pages artifact and deploys it with `actions/deploy-pages`. It runs on a push to `main` that changes `website/**` or the workflow file, and on manual dispatch (Actions tab, "Deploy to GitHub Pages").

The workflow needs a one-time repository setting: **Settings, Pages, Build and deployment, Source: GitHub Actions**. As of 2026-11-07 that setting is off (`gh api repos/LeonardSchwier/leotheca/pages` returns 404), so the site is not live and both earlier runs failed at the Setup Pages step with "Get Pages site failed". To publish it:

```sh
gh api -X POST repos/LeonardSchwier/leotheca/pages -f build_type=workflow
gh workflow run gh-pages.yml
```

The site is then served at `https://leonardschwier.github.io/leotheca/`.

## Editing rules

Every statement on the pages must be true of the code or of the shipped release artifacts. Do not list unsubmitted stores as install options, keep counts out of the copy, and narrow anything that has not been verified on a real device. Screenshots in `screenshots/` are of the web build with a sample workspace, taken 2026-09-25; replace them when the visual theme changes.
