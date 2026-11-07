Task: rm-e21b17dd07db2ce3 - Mermaid diagrams: theme-aware, responsive, zoomable rendering
Owner/token: released (finished)
Scope: src/markdown/mermaid.ts, mermaidFigure.ts, src/editor/MarkdownPreview.tsx, src/styles/mermaid.css, tests, master-spec.md, CHANGELOG.md, spec
Acceptance: theme follows the app and redraws on a flip; width-responsive; zoom, pan, full screen; error notice without crash; sanitization intact; no new dependency
Landed: PR 75, squash merge eec6c19e8eabf87b8667272a30d7a994fbdb3b2d
Checks: tsc, eslint, vitest 3302 pass, build, e2e 15 pass; PR checks green (android and appimage-smoke were still pending at merge and are not required)
CI: post-merge runs on eec6c19: Release 42410223109, Rules 42410223026, CI 42410223032, Secret scan 42410223023, Agent policy 42410223003 (queued at finish time)
Missing evidence: post-merge run conclusions not yet seen
Next action: whoever next touches main inspects those run ids
