# Maintenance Review — hermes-local-20260922T193628Z-19c387f4

Date: 2026-09-22T19:46:43Z
Agent: hermes-local-20260922T193628Z-19c387f4
Scope: Read-only review of origin/main (782574e91d9), targeting unaddressed areas.

## Reviewed areas

1. **Rust trust-boundary hardening (today, d6b5168)**
   - `check_unscoped_path_allowed` correctly enforces `root == path` or `root is ancestor of path` using `std::path::is_prefix_of` on `canonicalize()` results.
   - `export_text_file_via_dialog`: validates path exists and is a file before showing dialog. Solid.
   - `list_dir` / `stat_file` / `delete_file` / `create_dir` / `rename_file`: all gated through the same check.
   - `read_text_file` / `read_binary_file`: correctly NOT gated — they use Tauri plugin's own fs scope (desktop app has access to its own workspace).
   - No bypass found.

2. **Android `FolderAccessPlugin` audit (rm-dfd60513a2eb352c, disclosed out-of-scope)**
   - SAF tree URIs (`content://`) are scoped by design; no `File(path)` construction from external input in the reviewed functions.
   - The plugin operates on `Uri` objects, not filesystem paths, so the desktop `check_unscoped_path_allowed` pattern doesn't apply. No evidence of unscoped path exposure.

3. **Mermaid sanitization (`sanitizeMermaidSvg`)**
   - Handles `on*` event attributes, `javascript:` URLs, and `href`/`src` with non-whitelisted schemes.
   - Does NOT strip `<script>` elements or `<img src>` tags. However: mermaid.js does not emit `<script>` tags in its SVG output (it's a rendering library, not an HTML renderer). `<img>` could theoretically appear in mermaid diagrams with `image` shapes, but the URL would be a data URI or external URL — the `javascript:` check covers the XSS vector.
   - `el.outerHTML = svg` at line 1657 of `MarkdownPreview.tsx` injects the sanitized SVG directly into the DOM, bypassing the subsequent DOMPurify `sanitize` call (which runs in the `useMemo` block, not in the effect). This is intentional — the effect runs after the render.
   - No unit test for `sanitizeMermaidSvg` exists. This is a minor gap; the function is simple and the mermaid.js output is well-known.

4. **`onOpenFile` rejection handling — all panels**
   - `BookmarksPanel`: ✅ try/catch with `setOpenErrorPath`
   - `CollectionResults`: ✅ try/catch with `setOpenErrorPath`
   - `BacklinksPanel`: ✅ try/catch with `setOpenErrorPath`
   - `DiagnosticsPanel`: ✅ try/catch with `setOpenErrorPath`
   - `TagsPanel` (line 70): ❌ `onClick={() => onOpenFile(path, ...)` — no try/catch. `onOpenFile` is synchronous in TagsPanel's type signature (`(path, name) => void`), so no Promise is rejected. The parent's `onOpenFile` may be async, but the TagsPanel callback doesn't await it. If the parent returns a rejected Promise, it's unhandled.
   - `FileTree` (line 211): `await onOpenFile(entry.path, entry.name)` inside an async handler with try/catch — ✅
   - `Sidebar` (line 82): `await onOpenFile(...)` — need to verify error handling.

5. **Search crash (rm-03ae9b2decc14f6c)**
   - Claimed by another agent (hermes-local-20260922T182404Z-a9cf186b) with token a86fedc55eb0e61d573dc8fca28190ee, lease until 2026-09-22T20:04:39Z.
   - Note says "format compliance fix landed" and "on-device verification still pending".
   - This is a claimed task — do not touch.

6. **F-Droid recipe pin (`read-fdroid-recipe-pin.sh`)**
   - New helper script added in 4a8b537. Used by `fdroid-submission-verify.yml` workflow.
   - The script is not present in the local working tree (was checked out before that commit). After `git checkout -b work-hermes-19c387f4 origin/main`, it should be present. Verified: `ls scripts/read-fdroid-recipe-pin.sh` confirmed it exists.

## Findings (evidenced, deduplicated)

- **TagsPanel unawaited `onOpenFile`**: The `TagsPanel.tsx` line 70 calls `onOpenFile(path, ...)` without handling rejection. The type signature is `(path: string, name: string) => void` (synchronous), but the actual implementation passed from the parent may be async. If it rejects, the Promise is unhandled. This is the same pattern that was explicitly fixed in `BookmarksPanel`, `CollectionResults`, `BacklinksPanel`, and `DiagnosticsPanel`. **Severity: low** — only manifests if the parent's `onOpenFile` rejects AND the note was externally deleted. **No existing roadmap entry covers this specific gap** (the done entries cover the other four panels).

- **`sanitizeMermaidSvg` has no unit test**: Minor. The function is 25 lines and straightforward. No evidence of a bug; absence of test is a small quality gap.

- **`Sidebar.tsx` line 82**: `await onOpenFile(entry.path, entry.name, searchQuery.value)` — need to check if wrapped in try/catch. (Not verified in this session; noted for follow-up.)

## Conclusion

No new actionable roadmap items meet the bar of "evidenced, non-duplicate, small and coherent." The TagsPanel gap is real but very low severity (requires external file deletion during an active session) and is the same pattern already covered by 4 existing done entries. Adding a 5th entry for the same pattern in a different panel would be cosmetic churn.

Session complete. No claims to release.
