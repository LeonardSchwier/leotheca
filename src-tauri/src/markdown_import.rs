//! Markdown vault import (roadmap rm-a41aae16d492653c).
//!
//! Copies a user-chosen folder of Markdown notes (for example an exported or
//! synced note vault from another app) into a new folder inside the active
//! workspace. Plain Markdown already opens in Leotheca, so the import only
//! adds what a plain copy cannot:
//!
//! * the source is never modified (it is only ever opened for reading);
//! * the source's config and trash folders are skipped;
//! * names never overwrite an existing workspace file (a clash gets a
//!   suffix and is reported);
//! * symlinks are not followed, so a vault cannot pull in files from
//!   outside itself, and every destination is checked to stay inside the
//!   workspace after symlink resolution;
//! * note text is rewritten only where the vault's syntax differs from what
//!   Leotheca's parser supports (attachment embeds and links, nested heading
//!   links, `%%comments%%`); everything Leotheca already understands is left
//!   byte-for-byte alone and merely counted;
//! * anything not convertible or not renderable is reported, never dropped
//!   silently;
//! * files that are not valid UTF-8 are copied byte-for-byte and reported.
//!
//! The source folder is chosen by a native dialog inside the Tauri command
//! (never a path the webview supplies), the same defence the export dialog
//! uses. All logic lives in `run_import` so tests can drive it directly.

use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Lists in the report are capped so a vault with tens of thousands of
/// problems cannot produce an unreadable (or oversized IPC) report. The
/// counts always stay exact.
const MAX_LISTED: usize = 100;
const MAX_EXAMPLES: usize = 5;
const MAX_DEPTH: usize = 64;
/// A hidden (dot-prefixed) folder at the vault root is the source app's own
/// configuration, trash or version-control data, never notes: not copied.
fn is_skipped_root_dir(name: &str) -> bool {
    name.starts_with('.')
}
const IMAGE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportIssue {
    pub path: String,
    pub detail: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct IssueList {
    pub count: usize,
    pub items: Vec<ImportIssue>,
}

impl IssueList {
    fn push(&mut self, path: impl Into<String>, detail: impl Into<String>) {
        self.count += 1;
        if self.items.len() < MAX_LISTED {
            self.items.push(ImportIssue {
                path: path.into(),
                detail: detail.into(),
            });
        }
    }
}

/// One kind of syntax finding. `kind` is "preserved" (supported as is),
/// "converted" (rewritten) or "unsupported" (kept as text but Leotheca
/// does not render or resolve it).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub code: String,
    pub kind: String,
    pub count: usize,
    pub examples: Vec<ImportIssue>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    /// Workspace-relative destination folder, `/` separated.
    pub destination: String,
    pub cancelled: bool,
    pub total_files: usize,
    pub notes_copied: usize,
    pub notes_converted: usize,
    pub other_files_copied: usize,
    pub bytes_copied: u64,
    pub skipped: IssueList,
    pub renamed: IssueList,
    pub non_utf8: IssueList,
    pub failed: IssueList,
    pub findings: Vec<Finding>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub phase: String,
    pub processed: usize,
    pub total: usize,
    pub current: String,
}

/// Cancel flag shared between the running import and the cancel command.
/// Unused on non-desktop builds, whose commands are stubs.
#[derive(Default)]
#[cfg_attr(not(desktop), allow(dead_code))]
pub struct MarkdownImportState {
    cancel: Arc<AtomicBool>,
    running: Mutex<bool>,
}

// ---------------------------------------------------------------------
// Findings collection

#[derive(Default)]
struct Findings {
    by_code: BTreeMap<String, (String, usize, Vec<ImportIssue>)>,
}

impl Findings {
    fn add(&mut self, code: &str, kind: &str, note: &str, example: &str) {
        let entry = self
            .by_code
            .entry(code.to_string())
            .or_insert_with(|| (kind.to_string(), 0, Vec::new()));
        entry.1 += 1;
        if entry.2.len() < MAX_EXAMPLES {
            entry.2.push(ImportIssue {
                path: note.to_string(),
                detail: example.to_string(),
            });
        }
    }

    fn into_vec(self) -> Vec<Finding> {
        self.by_code
            .into_iter()
            .map(|(code, (kind, count, examples))| Finding {
                code,
                kind,
                count,
                examples,
            })
            .collect()
    }
}

// ---------------------------------------------------------------------
// Scan and plan

struct Planned {
    source: PathBuf,
    /// Final destination path relative to the destination folder, `/`
    /// separated, after collision renaming.
    dest_rel: String,
    original_rel: String,
    is_note: bool,
}

fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
}

fn extension_lower(name: &str) -> Option<String> {
    let dot = name.rfind('.')?;
    if dot == 0 {
        return None;
    }
    Some(name[dot + 1..].to_lowercase())
}

fn is_note_name(name: &str) -> bool {
    matches!(
        extension_lower(name).as_deref(),
        Some("md") | Some("markdown")
    )
}

/// Walks the source without following symlinks. Returns planned files in a
/// deterministic order plus the skipped entries.
fn scan(
    source: &Path,
    cancel: &AtomicBool,
    skipped: &mut IssueList,
    failed: &mut IssueList,
) -> Vec<(PathBuf, String)> {
    let mut files = Vec::new();
    let mut stack: Vec<(PathBuf, String, usize)> = vec![(source.to_path_buf(), String::new(), 0)];
    while let Some((dir, rel, depth)) = stack.pop() {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let read = match fs::read_dir(&dir) {
            Ok(read) => read,
            Err(error) => {
                failed.push(
                    if rel.is_empty() { "." } else { &rel },
                    format!("could not list folder: {error}"),
                );
                continue;
            }
        };
        let mut names: Vec<(String, PathBuf)> = Vec::new();
        for entry in read {
            match entry {
                Ok(entry) => match entry.file_name().into_string() {
                    Ok(name) => names.push((name, entry.path())),
                    Err(os) => skipped.push(
                        format!("{rel}/{}", os.to_string_lossy()),
                        "file name is not valid UTF-8, not imported",
                    ),
                },
                Err(error) => failed.push(&rel, format!("could not read folder entry: {error}")),
            }
        }
        names.sort();
        // Reverse so the stack pops in sorted order.
        for (name, path) in names.into_iter().rev() {
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            if !is_safe_name(&name) {
                skipped.push(&child_rel, "unsafe file name");
                continue;
            }
            let meta = match fs::symlink_metadata(&path) {
                Ok(meta) => meta,
                Err(error) => {
                    failed.push(&child_rel, format!("could not read metadata: {error}"));
                    continue;
                }
            };
            let file_type = meta.file_type();
            if file_type.is_symlink() {
                // Never followed: the target may sit outside the vault.
                skipped.push(&child_rel, "symbolic link, not followed");
            } else if file_type.is_dir() {
                if depth == 0 && is_skipped_root_dir(&name) {
                    skipped.push(
                        &child_rel,
                        "hidden vault folder (config, trash or version control)",
                    );
                } else if depth + 1 >= MAX_DEPTH {
                    skipped.push(&child_rel, "folder nested too deeply");
                } else {
                    stack.push((path, child_rel, depth + 1));
                }
            } else if file_type.is_file() {
                files.push((path, child_rel));
            } else {
                skipped.push(&child_rel, "not a regular file");
            }
        }
    }
    files.sort_by(|a, b| a.1.cmp(&b.1));
    files
}

/// Resolves an existing-or-future path to a canonical form by canonicalizing
/// its nearest existing ancestor, so a symlinked ancestor cannot hide an
/// escape from the workspace.
fn canonical_with_suffix(path: &Path) -> io::Result<PathBuf> {
    let mut existing = path.to_path_buf();
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    while fs::symlink_metadata(&existing).is_err() {
        match (existing.file_name(), existing.parent()) {
            (Some(name), Some(parent)) => {
                suffix.push(name.to_os_string());
                existing = parent.to_path_buf();
            }
            _ => break,
        }
    }
    let mut canonical = fs::canonicalize(&existing)?;
    for part in suffix.into_iter().rev() {
        canonical.push(part);
    }
    Ok(canonical)
}

fn validate_target_rel(target_rel: &str) -> Result<Vec<String>, String> {
    let mut parts = Vec::new();
    for component in Path::new(target_rel).components() {
        match component {
            Component::Normal(part) => {
                let part = part
                    .to_str()
                    .ok_or_else(|| "target folder name is not valid UTF-8".to_string())?;
                if !is_safe_name(part) {
                    return Err(format!("invalid target folder segment \"{part}\""));
                }
                parts.push(part.to_string());
            }
            Component::CurDir => {}
            _ => {
                return Err(format!(
                    "target folder \"{target_rel}\" must stay inside the workspace"
                ))
            }
        }
    }
    Ok(parts)
}

// ---------------------------------------------------------------------
// Link index

struct Index {
    /// Final destination path of every planned file, indexed like `paths`.
    paths: Vec<String>,
    /// Lower-case basename (with extension) to indexes.
    by_name: HashMap<String, Vec<usize>>,
}

enum Resolved {
    Note,
    Attachment(usize),
    None,
}

fn dir_of(path: &str) -> &str {
    path.rfind('/').map(|i| &path[..i]).unwrap_or("")
}

impl Index {
    fn new(paths: Vec<String>) -> Self {
        let mut by_name: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, path) in paths.iter().enumerate() {
            let base = path.rsplit('/').next().unwrap_or(path).to_lowercase();
            by_name.entry(base).or_default().push(i);
        }
        Index { paths, by_name }
    }

    fn pick(&self, candidates: &[usize], target_lower: &str, note_dir: &str) -> Option<usize> {
        // A target containing `/` must match as a path suffix.
        let mut matching: Vec<usize> = candidates
            .iter()
            .copied()
            .filter(|&i| {
                !target_lower.contains('/') || {
                    let p = self.paths[i].to_lowercase();
                    p == target_lower || p.ends_with(&format!("/{target_lower}"))
                }
            })
            .collect();
        // Same folder as the note first, then shortest path, then
        // alphabetical, so the result never depends on directory order.
        matching.sort_by(|&a, &b| {
            let same_a = dir_of(&self.paths[a]) == note_dir;
            let same_b = dir_of(&self.paths[b]) == note_dir;
            same_b
                .cmp(&same_a)
                .then(self.paths[a].len().cmp(&self.paths[b].len()))
                .then(self.paths[a].cmp(&self.paths[b]))
        });
        matching.first().copied()
    }

    fn resolve(&self, target: &str, note_dir: &str) -> Resolved {
        let target = target.trim().trim_start_matches('/');
        if target.is_empty() {
            return Resolved::None;
        }
        let lower = target.to_lowercase();
        let base = lower.rsplit('/').next().unwrap_or(&lower).to_string();
        // A note link usually omits `.md`, so try that reading first.
        let note_key = if base.ends_with(".md") {
            base.clone()
        } else {
            format!("{base}.md")
        };
        let note_target = if lower.ends_with(".md") {
            lower.clone()
        } else {
            format!("{lower}.md")
        };
        if self
            .by_name
            .get(&note_key)
            .and_then(|c| self.pick(c, &note_target, note_dir))
            .is_some()
        {
            return Resolved::Note;
        }
        if extension_lower(&base).is_some() {
            if let Some(found) = self
                .by_name
                .get(&base)
                .and_then(|c| self.pick(c, &lower, note_dir))
            {
                return Resolved::Attachment(found);
            }
        }
        Resolved::None
    }
}

fn relative_link(from_dir: &str, to_path: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|s| !s.is_empty()).collect();
    let to: Vec<&str> = to_path.split('/').filter(|s| !s.is_empty()).collect();
    let mut common = 0;
    while common < from.len() && common + 1 < to.len() && from[common] == to[common] {
        common += 1;
    }
    let mut parts: Vec<String> = vec!["..".to_string(); from.len() - common];
    parts.extend(to[common..].iter().map(|s| s.to_string()));
    parts.join("/")
}

/// Leotheca resolves a Markdown image target literally (it does not decode
/// percent escapes), so only characters that would end the link are
/// escaped, and the result is flagged to the caller.
fn encode_link_target(path: &str) -> (String, bool) {
    let mut out = String::with_capacity(path.len());
    let mut changed = false;
    for ch in path.chars() {
        match ch {
            ' ' => {
                out.push_str("%20");
                changed = true;
            }
            '(' => {
                out.push_str("%28");
                changed = true;
            }
            ')' => {
                out.push_str("%29");
                changed = true;
            }
            _ => out.push(ch),
        }
    }
    (out, changed)
}

// ---------------------------------------------------------------------
// Note conversion

struct LineState {
    in_comment: bool,
}

fn sanitize_comment(text: &str) -> String {
    // `-->` inside the text would end the HTML comment early and leak the
    // rest of it into the page.
    text.replace("-->", "-- >")
}

fn find_unescaped(haystack: &str, needle: char) -> Option<usize> {
    let mut prev_backslash = false;
    for (i, ch) in haystack.char_indices() {
        if ch == needle && !prev_backslash {
            return Some(i);
        }
        prev_backslash = ch == '\\' && !prev_backslash;
    }
    None
}

/// Splits `Target#Fragment|Alias` into (target, fragment segments, alias).
fn split_wiki(inner: &str) -> (String, Vec<String>, Option<String>) {
    let (expr, alias) = match find_unescaped(inner, '|') {
        Some(i) => (&inner[..i], Some(inner[i + 1..].to_string())),
        None => (inner, None),
    };
    let mut segments: Vec<String> = Vec::new();
    let mut rest = expr;
    while let Some(i) = find_unescaped(rest, '#') {
        segments.push(rest[..i].to_string());
        rest = &rest[i + 1..];
    }
    segments.push(rest.to_string());
    let target = segments.remove(0);
    (target, segments, alias)
}

fn is_size_option(option: &str) -> bool {
    let option = option.trim();
    !option.is_empty()
        && option.chars().all(|c| c.is_ascii_digit() || c == 'x')
        && option.chars().any(|c| c.is_ascii_digit())
}

struct NoteContext<'a> {
    index: &'a Index,
    note_path: &'a str,
}

fn convert_wikilink(
    inner: &str,
    embed: bool,
    ctx: &NoteContext,
    findings: &mut Findings,
    raw: &str,
) -> String {
    let (target, fragment, alias) = split_wiki(inner);
    let target_trim = target.trim();
    let note_dir = dir_of(ctx.note_path);
    if target_trim.is_empty() {
        // Same-note link: Leotheca's own grammar, nothing to resolve.
        return finish_note_link(embed, "", &fragment, alias.as_deref(), findings, ctx, raw);
    }
    match ctx.index.resolve(target_trim, note_dir) {
        Resolved::Attachment(i) => {
            let dest = &ctx.index.paths[i];
            let (href, encoded) = encode_link_target(&relative_link(note_dir, dest));
            if encoded {
                findings.add(
                    "attachment-path-encoded",
                    "unsupported",
                    ctx.note_path,
                    dest,
                );
            }
            let name = dest.rsplit('/').next().unwrap_or(dest);
            let ext = extension_lower(name).unwrap_or_default();
            let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
            if !fragment.is_empty() {
                findings.add(
                    "attachment-fragment-dropped",
                    "converted",
                    ctx.note_path,
                    raw,
                );
            }
            if embed && IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                let alt = match alias.as_deref() {
                    Some(option) if is_size_option(option) => {
                        findings.add("image-size-dropped", "converted", ctx.note_path, raw);
                        stem.to_string()
                    }
                    Some(option) if !option.trim().is_empty() => option.trim().to_string(),
                    _ => stem.to_string(),
                };
                findings.add("image-embed-converted", "converted", ctx.note_path, raw);
                format!("![{}]({href})", alt.replace(['[', ']'], ""))
            } else {
                let label = match alias.as_deref() {
                    Some(label) if !label.trim().is_empty() && !is_size_option(label) => {
                        label.trim().to_string()
                    }
                    _ => name.to_string(),
                };
                findings.add(
                    if embed {
                        "attachment-embed-became-link"
                    } else {
                        "attachment-link-converted"
                    },
                    "converted",
                    ctx.note_path,
                    raw,
                );
                format!("[{}]({href})", label.replace(['[', ']'], ""))
            }
        }
        Resolved::Note => finish_note_link(
            embed,
            target_trim,
            &fragment,
            alias.as_deref(),
            findings,
            ctx,
            raw,
        ),
        Resolved::None => {
            findings.add(
                if embed {
                    "unresolved-embed"
                } else {
                    "unresolved-link"
                },
                "unsupported",
                ctx.note_path,
                raw,
            );
            raw.to_string()
        }
    }
}

fn finish_note_link(
    embed: bool,
    target: &str,
    fragment: &[String],
    alias: Option<&str>,
    findings: &mut Findings,
    ctx: &NoteContext,
    raw: &str,
) -> String {
    if embed {
        findings.add("note-embed", "preserved", ctx.note_path, raw);
    }
    if alias.is_some() && !embed {
        findings.add("alias-link", "preserved", ctx.note_path, raw);
    }
    if let Some(first) = fragment.first() {
        if first.starts_with('^') && fragment.len() == 1 {
            findings.add("block-reference", "preserved", ctx.note_path, raw);
        } else if fragment.len() == 1 {
            findings.add("heading-link", "preserved", ctx.note_path, raw);
        }
    }
    if fragment.len() > 1 {
        // `[[Note#Section#Sub]]` names a nested heading; Leotheca's link
        // grammar splits at the first `#` only, so keep the innermost
        // heading, which is the one the link points to.
        findings.add("nested-heading-link", "converted", ctx.note_path, raw);
        let last = fragment.last().map(String::as_str).unwrap_or("");
        let mut out = String::new();
        if embed {
            out.push('!');
        }
        out.push_str("[[");
        out.push_str(target);
        out.push('#');
        out.push_str(last);
        if let Some(alias) = alias {
            out.push('|');
            out.push_str(alias);
        }
        out.push_str("]]");
        return out;
    }
    raw.to_string()
}

/// Rewrites one line. Inline code spans pass through untouched.
fn convert_line(
    line: &str,
    state: &mut LineState,
    ctx: &NoteContext,
    findings: &mut Findings,
) -> String {
    let mut out = String::with_capacity(line.len());
    let trimmed = line.trim_start();
    let quote_stripped = trimmed.trim_start_matches(['>', ' ']);
    if !state.in_comment && trimmed.starts_with('>') && quote_stripped.starts_with("[!") {
        findings.add(
            "callout",
            "unsupported",
            ctx.note_path,
            quote_stripped.trim_end(),
        );
    }
    let mut i = 0;
    while i < line.len() {
        if state.in_comment {
            match line[i..].find("%%") {
                Some(p) => {
                    out.push_str(&sanitize_comment(&line[i..i + p]));
                    out.push_str(" -->");
                    state.in_comment = false;
                    i += p + 2;
                }
                None => {
                    out.push_str(&sanitize_comment(&line[i..]));
                    i = line.len();
                }
            }
            continue;
        }
        let rest = &line[i..];
        let ch = rest.chars().next().unwrap_or(' ');
        if ch == '`' {
            let run = rest.chars().take_while(|&c| c == '`').count();
            let fence = "`".repeat(run);
            match rest[run..].find(&fence) {
                Some(p) => {
                    let end = run + p + run;
                    out.push_str(&rest[..end]);
                    i += end;
                }
                None => {
                    out.push_str(&fence);
                    i += run;
                }
            }
        } else if rest.starts_with("%%") {
            findings.add("comment", "converted", ctx.note_path, "%% comment %%");
            out.push_str("<!-- ");
            state.in_comment = true;
            i += 2;
        } else if rest.starts_with("![[") || rest.starts_with("[[") {
            let embed = rest.starts_with('!');
            let open = if embed { 3 } else { 2 };
            match rest[open..].find("]]") {
                Some(p) if p > 0 && !rest[open..open + p].contains('[') => {
                    let raw = &rest[..open + p + 2];
                    out.push_str(&convert_wikilink(
                        &rest[open..open + p],
                        embed,
                        ctx,
                        findings,
                        raw,
                    ));
                    i += open + p + 2;
                }
                _ => {
                    out.push_str(&rest[..open]);
                    i += open;
                }
            }
        } else if let Some(after) = rest.strip_prefix("==") {
            match after.find("==") {
                Some(p) if p > 0 => {
                    findings.add("highlight", "preserved", ctx.note_path, &rest[..p + 4]);
                    out.push_str(&rest[..p + 4]);
                    i += p + 4;
                }
                _ => {
                    out.push_str("==");
                    i += 2;
                }
            }
        } else if ch == '#' {
            let prev = line[..i].chars().next_back();
            let next = rest[1..].chars().next();
            let boundary =
                prev.is_none_or(|c| !(c.is_alphanumeric() || c == '#' || c == '/' || c == '_'));
            if boundary && next.is_some_and(|c| c.is_alphanumeric() || c == '_') {
                let end = rest[1..]
                    .find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '-' || c == '/'))
                    .map_or(rest.len(), |p| p + 1);
                findings.add("tag", "preserved", ctx.note_path, &rest[..end]);
                out.push_str(&rest[..end]);
                i += end;
            } else {
                out.push('#');
                i += 1;
            }
        } else {
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

/// Converts a whole note. Front matter and fenced code are copied as is.
fn convert_note(text: &str, ctx: &NoteContext, findings: &mut Findings) -> String {
    let mut out = String::with_capacity(text.len() + 64);
    let mut state = LineState { in_comment: false };
    let mut in_fence: Option<(char, usize)> = None;
    let mut in_front = false;
    for (n, raw_line) in text.split_inclusive('\n').enumerate() {
        let content = raw_line.trim_end_matches(['\n', '\r']);
        let ending = &raw_line[content.len()..];
        if n == 0 && content == "---" {
            in_front = true;
            out.push_str(raw_line);
            continue;
        }
        if in_front {
            if content == "---" || content == "..." {
                in_front = false;
            }
            out.push_str(raw_line);
            continue;
        }
        let stripped = content.trim_start();
        let fence_char = stripped.chars().next().filter(|c| *c == '`' || *c == '~');
        if let Some(fc) = fence_char {
            let run = stripped.chars().take_while(|&c| c == fc).count();
            if run >= 3 {
                match in_fence {
                    None => in_fence = Some((fc, run)),
                    Some((open_char, open_run)) if open_char == fc && run >= open_run => {
                        in_fence = None;
                    }
                    _ => {}
                }
                out.push_str(raw_line);
                continue;
            }
        }
        if in_fence.is_some() {
            out.push_str(raw_line);
            continue;
        }
        out.push_str(&convert_line(content, &mut state, ctx, findings));
        out.push_str(ending);
    }
    if state.in_comment {
        findings.add("unterminated-comment", "converted", ctx.note_path, "%%");
        out.push_str(" -->");
    }
    out
}

// ---------------------------------------------------------------------
// Import driver

fn unique_name(rel: &str, taken: &HashSet<String>, exists: &dyn Fn(&str) -> bool) -> String {
    let (dir, name) = match rel.rfind('/') {
        Some(i) => (&rel[..=i], &rel[i + 1..]),
        None => ("", rel),
    };
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let mut n = 1;
    loop {
        let suffix = if n == 1 {
            " (imported)".to_string()
        } else {
            format!(" (imported {n})")
        };
        let candidate = format!("{dir}{stem}{suffix}{ext}");
        if !taken.contains(&candidate.to_lowercase()) && !exists(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

fn write_new(dest: &Path, write: impl FnOnce(&mut fs::File) -> io::Result<u64>) -> io::Result<u64> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(dest)?;
    let written = write(&mut file)?;
    file.flush()?;
    Ok(written)
}

pub fn run_import(
    source: &Path,
    workspace_root: &Path,
    target_rel: &str,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(&ImportProgress),
) -> Result<ImportReport, String> {
    let source_canon = fs::canonicalize(source).map_err(|e| format!("cannot open source: {e}"))?;
    if !source_canon.is_dir() {
        return Err("the chosen source is not a folder".into());
    }
    let root_canon =
        fs::canonicalize(workspace_root).map_err(|e| format!("cannot open workspace: {e}"))?;
    let target_parts = validate_target_rel(target_rel)?;

    let vault_name = source_canon
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| is_safe_name(n))
        .unwrap_or("Imported vault")
        .to_string();
    let mut dest_dir = root_canon.clone();
    let mut destination_rel: Vec<String> = Vec::new();
    for part in target_parts.iter().chain(std::iter::once(&vault_name)) {
        dest_dir.push(part);
        destination_rel.push(part.clone());
    }
    let dest_canon =
        canonical_with_suffix(&dest_dir).map_err(|e| format!("cannot resolve destination: {e}"))?;
    if !dest_canon.starts_with(&root_canon) {
        return Err("destination resolves outside the workspace".into());
    }
    if dest_canon.starts_with(&source_canon) {
        return Err("the destination folder is inside the source folder".into());
    }

    let mut report = ImportReport {
        destination: destination_rel.join("/"),
        ..Default::default()
    };
    let mut findings = Findings::default();

    on_progress(&ImportProgress {
        phase: "scanning".into(),
        processed: 0,
        total: 0,
        current: String::new(),
    });
    let scanned = scan(source, cancel, &mut report.skipped, &mut report.failed);
    if cancel.load(Ordering::Relaxed) {
        report.cancelled = true;
        return Ok(report);
    }
    report.total_files = scanned.len();

    // Plan names first so links can point at the final names.
    let mut taken: HashSet<String> = HashSet::new();
    let exists = |rel: &str| fs::symlink_metadata(dest_canon.join(rel)).is_ok();
    let mut planned: Vec<Planned> = Vec::with_capacity(scanned.len());
    for (path, rel) in scanned {
        let name = rel.rsplit('/').next().unwrap_or(&rel);
        let mut dest_rel = rel.clone();
        if taken.contains(&dest_rel.to_lowercase()) || exists(&dest_rel) {
            dest_rel = unique_name(&rel, &taken, &exists);
            report.renamed.push(
                rel.clone(),
                format!("name already used in the workspace, saved as {dest_rel}"),
            );
            if is_note_name(name) {
                findings.add(
                    "renamed-note-links",
                    "unsupported",
                    &rel,
                    "links to this note by name may point at the existing note",
                );
            }
        }
        taken.insert(dest_rel.to_lowercase());
        planned.push(Planned {
            is_note: is_note_name(name),
            source: path,
            dest_rel,
            original_rel: rel,
        });
    }
    let index = Index::new(planned.iter().map(|p| p.dest_rel.clone()).collect());

    fs::create_dir_all(&dest_canon).map_err(|e| format!("cannot create destination: {e}"))?;
    // Re-check after creation: a racing symlink swap must not escape.
    let created = fs::canonicalize(&dest_canon).map_err(|e| e.to_string())?;
    if !created.starts_with(&root_canon) || created.starts_with(&source_canon) {
        return Err("destination resolves outside the workspace".into());
    }

    let total = planned.len();
    let mut last_report = std::time::Instant::now();
    for (n, item) in planned.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            report.cancelled = true;
            break;
        }
        if n == 0 || n + 1 == total || last_report.elapsed().as_millis() >= 100 {
            last_report = std::time::Instant::now();
            on_progress(&ImportProgress {
                phase: "copying".into(),
                processed: n,
                total,
                current: item.original_rel.clone(),
            });
        }
        let dest = created.join(&item.dest_rel);
        let outcome = copy_one(item, &dest, &created, &index, &mut findings, &mut report);
        if let Err(detail) = outcome {
            report.failed.push(item.original_rel.clone(), detail);
        }
    }
    on_progress(&ImportProgress {
        phase: "done".into(),
        processed: report.notes_copied + report.other_files_copied,
        total,
        current: String::new(),
    });
    report.findings = findings.into_vec();
    Ok(report)
}

fn copy_one(
    item: &Planned,
    dest: &Path,
    dest_root: &Path,
    index: &Index,
    findings: &mut Findings,
    report: &mut ImportReport,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("could not create folder: {e}"))?;
        let canonical_parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
        if !canonical_parent.starts_with(dest_root) {
            return Err("destination folder resolves outside the import folder".into());
        }
    }
    // Re-check the source at copy time: it may have been swapped for a
    // symlink since the scan.
    let meta = fs::symlink_metadata(&item.source).map_err(|e| format!("cannot read: {e}"))?;
    if !meta.file_type().is_file() {
        return Err("source changed since the scan and is no longer a regular file".into());
    }
    if item.is_note {
        let bytes = fs::read(&item.source).map_err(|e| format!("cannot read: {e}"))?;
        match String::from_utf8(bytes) {
            Ok(text) => {
                let ctx = NoteContext {
                    index,
                    note_path: &item.dest_rel,
                };
                let mut local = Findings::default();
                let converted = convert_note(&text, &ctx, &mut local);
                let changed = converted != text;
                let written = write_new(dest, |f| {
                    f.write_all(converted.as_bytes())?;
                    Ok(converted.len() as u64)
                })
                .map_err(|e| format!("could not write: {e}"))?;
                for (code, (kind, count, examples)) in local.by_code {
                    let entry = findings
                        .by_code
                        .entry(code)
                        .or_insert_with(|| (kind, 0, Vec::new()));
                    entry.1 += count;
                    for example in examples {
                        if entry.2.len() < MAX_EXAMPLES {
                            entry.2.push(example);
                        }
                    }
                }
                report.notes_copied += 1;
                if changed {
                    report.notes_converted += 1;
                }
                report.bytes_copied += written;
            }
            Err(error) => {
                // Not UTF-8 (often Latin-1 or UTF-16): converting would
                // corrupt it, so copy the original bytes.
                let bytes = error.into_bytes();
                let written = write_new(dest, |f| {
                    f.write_all(&bytes)?;
                    Ok(bytes.len() as u64)
                })
                .map_err(|e| format!("could not write: {e}"))?;
                report.notes_copied += 1;
                report.bytes_copied += written;
                report.non_utf8.push(
                    item.original_rel.clone(),
                    "not valid UTF-8, copied unchanged and not converted",
                );
            }
        }
    } else {
        let mut input = fs::File::open(&item.source).map_err(|e| format!("cannot read: {e}"))?;
        let written = write_new(dest, |f| io::copy(&mut input, f))
            .map_err(|e| format!("could not write: {e}"))?;
        report.other_files_copied += 1;
        report.bytes_copied += written;
    }
    Ok(())
}

// ---------------------------------------------------------------------
// Tauri commands (desktop only: Android cannot supply a second folder grant,
// so the frontend resolves to a clean no-op there and never invokes these).

#[cfg(desktop)]
struct RunGuard<'a>(&'a Mutex<bool>);

#[cfg(desktop)]
impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut running) = self.0.lock() {
            *running = false;
        }
    }
}

/// Asks for a source folder with a native dialog, then imports it into
/// `target_folder` (workspace relative). The source path never comes from
/// the webview. `Ok(None)` means the user cancelled the dialog.
#[cfg(desktop)]
#[tauri::command]
pub async fn import_markdown_vault(
    target_folder: String,
    app: tauri::AppHandle,
    workspace_root: tauri::State<'_, crate::commands::ActiveWorkspaceRoot>,
    state: tauri::State<'_, MarkdownImportState>,
) -> Result<Option<ImportReport>, String> {
    use tauri::Emitter;
    use tauri_plugin_dialog::DialogExt;

    let root = workspace_root
        .0
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .ok_or_else(|| "no workspace is open".to_string())?;
    {
        let mut running = state
            .running
            .lock()
            .map_err(|_| "state poisoned".to_string())?;
        if *running {
            return Err("an import is already running".into());
        }
        *running = true;
    }
    let _guard = RunGuard(&state.running);
    let cancel = state.cancel.clone();
    cancel.store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let source = picked.into_path().map_err(|e| e.to_string())?;
        let mut emit = |progress: &ImportProgress| {
            let _ = app.emit("markdown-import-progress", progress);
        };
        run_import(&source, &root, &target_folder, &cancel, &mut emit).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(desktop)]
#[tauri::command]
pub fn cancel_markdown_import(state: tauri::State<'_, MarkdownImportState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Non-desktop builds (Android) share the handler list but cannot show a
/// folder dialog for a second folder; the frontend never calls this, and a
/// direct call gets a clean error instead of an unregistered-command panic.
#[cfg(not(desktop))]
#[tauri::command]
pub async fn import_markdown_vault(_target_folder: String) -> Result<Option<ImportReport>, String> {
    Err("Markdown vault import is not available on this platform".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn cancel_markdown_import() {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct Dirs {
        base: PathBuf,
        source: PathBuf,
        workspace: PathBuf,
    }

    impl Dirs {
        fn new() -> Self {
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let base = std::env::temp_dir()
                .join(format!("leotheca-import-test-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&base);
            let source = base.join("vault");
            let workspace = base.join("workspace");
            fs::create_dir_all(&source).unwrap();
            fs::create_dir_all(&workspace).unwrap();
            Dirs {
                base,
                source,
                workspace,
            }
        }
        fn put(&self, rel: &str, content: &[u8]) {
            let path = self.source.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        fn run(&self) -> Result<ImportReport, String> {
            run_import(
                &self.source,
                &self.workspace,
                "Imported",
                &AtomicBool::new(false),
                &mut |_| {},
            )
        }
        fn read(&self, rel: &str) -> String {
            fs::read_to_string(self.workspace.join("Imported/vault").join(rel)).unwrap()
        }
    }

    impl Drop for Dirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    fn snapshot(root: &Path) -> BTreeMap<String, Vec<u8>> {
        let mut out = BTreeMap::new();
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    stack.push(path);
                } else {
                    out.insert(
                        path.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .to_string(),
                        fs::read(&path).unwrap(),
                    );
                }
            }
        }
        out
    }

    fn finding<'a>(report: &'a ImportReport, code: &str) -> Option<&'a Finding> {
        report.findings.iter().find(|f| f.code == code)
    }

    #[test]
    fn copies_notes_and_attachments_without_touching_the_source() {
        let d = Dirs::new();
        d.put(
            "A.md",
            b"# A\n[[B|alias]] and [[B#Heading]] and [[B#^blk]] ==hi== #tag\n",
        );
        d.put("sub/B.md", b"# Heading\ntext ^blk\n");
        d.put("img/pic.png", &[0, 1, 2, 255]);
        let before = snapshot(&d.source);
        let report = d.run().unwrap();
        assert_eq!(snapshot(&d.source), before, "source must be unchanged");
        assert_eq!(report.notes_copied, 2);
        assert_eq!(report.other_files_copied, 1);
        assert_eq!(report.destination, "Imported/vault");
        assert_eq!(
            fs::read(d.workspace.join("Imported/vault/img/pic.png")).unwrap(),
            vec![0, 1, 2, 255]
        );
        // Supported syntax is left byte-for-byte alone.
        assert_eq!(
            d.read("A.md"),
            "# A\n[[B|alias]] and [[B#Heading]] and [[B#^blk]] ==hi== #tag\n"
        );
        assert_eq!(finding(&report, "alias-link").unwrap().count, 1);
        assert_eq!(finding(&report, "heading-link").unwrap().count, 1);
        assert_eq!(finding(&report, "block-reference").unwrap().count, 1);
        assert_eq!(finding(&report, "highlight").unwrap().count, 1);
        assert_eq!(finding(&report, "tag").unwrap().count, 1);
        assert_eq!(report.notes_converted, 0);
    }

    #[test]
    fn skips_hidden_folders_at_the_root_only() {
        let d = Dirs::new();
        d.put(".appconfig/app.json", b"{}");
        d.put(".trash/old.md", b"gone");
        d.put("keep/.trash/nested.md", b"kept");
        d.put("n.md", b"x");
        let report = d.run().unwrap();
        assert!(!d.workspace.join("Imported/vault/.appconfig").exists());
        assert!(!d.workspace.join("Imported/vault/.trash").exists());
        assert!(d
            .workspace
            .join("Imported/vault/keep/.trash/nested.md")
            .exists());
        assert_eq!(report.skipped.count, 2);
    }

    #[test]
    fn converts_attachment_embeds_and_links_with_relative_paths() {
        let d = Dirs::new();
        d.put(
            "notes/N.md",
            b"![[pic.png|300]] ![[pic.png|Alt text]] ![[doc.pdf]] [[doc.pdf|the doc]]\n",
        );
        d.put("Attachments/pic.png", &[1]);
        d.put("Attachments/doc.pdf", &[2]);
        let report = d.run().unwrap();
        assert_eq!(
            d.read("notes/N.md"),
            "![pic](../Attachments/pic.png) ![Alt text](../Attachments/pic.png) [doc.pdf](../Attachments/doc.pdf) [the doc](../Attachments/doc.pdf)\n"
        );
        assert_eq!(finding(&report, "image-size-dropped").unwrap().count, 1);
        assert_eq!(
            finding(&report, "attachment-embed-became-link")
                .unwrap()
                .count,
            1
        );
        assert_eq!(report.notes_converted, 1);
    }

    #[test]
    fn spaced_attachment_paths_are_encoded_and_flagged() {
        let d = Dirs::new();
        d.put("N.md", b"![[my pic.png]]\n");
        d.put("my pic.png", &[1]);
        let report = d.run().unwrap();
        assert_eq!(d.read("N.md"), "![my pic](my%20pic.png)\n");
        assert!(finding(&report, "attachment-path-encoded").is_some());
    }

    #[test]
    fn nested_heading_links_keep_the_innermost_heading() {
        let d = Dirs::new();
        d.put("A.md", b"[[B#Top#Inner|x]] ![[B#Top#Inner]]\n");
        d.put("B.md", b"# Top\n## Inner\n");
        let report = d.run().unwrap();
        assert_eq!(d.read("A.md"), "[[B#Inner|x]] ![[B#Inner]]\n");
        assert_eq!(finding(&report, "nested-heading-link").unwrap().count, 2);
    }

    #[test]
    fn comments_become_html_comments_including_multiline() {
        let d = Dirs::new();
        d.put(
            "A.md",
            b"before %%hidden --> text%% after\n%%\nblock\n%%\nend\n",
        );
        let report = d.run().unwrap();
        assert_eq!(
            d.read("A.md"),
            "before <!-- hidden -- > text --> after\n<!-- \nblock\n -->\nend\n"
        );
        assert_eq!(finding(&report, "comment").unwrap().count, 2);
    }

    #[test]
    fn unterminated_comment_is_closed_and_reported() {
        let d = Dirs::new();
        d.put("A.md", b"a %%oops\nmore\n");
        let report = d.run().unwrap();
        assert!(d.read("A.md").trim_end().ends_with("-->"));
        assert!(finding(&report, "unterminated-comment").is_some());
    }

    #[test]
    fn code_blocks_spans_and_front_matter_are_not_rewritten() {
        let d = Dirs::new();
        let note = "---\ntags: [a]\nx: %%no%%\n---\n```\n%% [[Missing]] ![[pic.png]]\n```\n`%% [[Missing]]` text\n";
        d.put("A.md", note.as_bytes());
        d.put("pic.png", &[1]);
        let report = d.run().unwrap();
        assert_eq!(d.read("A.md"), note);
        assert!(report.findings.is_empty());
    }

    #[test]
    fn callouts_are_reported_as_unsupported_and_kept() {
        let d = Dirs::new();
        d.put("A.md", b"> [!warning]- Careful\n> body\n");
        let report = d.run().unwrap();
        assert_eq!(d.read("A.md"), "> [!warning]- Careful\n> body\n");
        let callout = finding(&report, "callout").unwrap();
        assert_eq!(callout.kind, "unsupported");
        assert_eq!(callout.count, 1);
    }

    #[test]
    fn unresolved_links_are_kept_and_reported() {
        let d = Dirs::new();
        d.put("A.md", b"[[Nowhere]] ![[ghost.png]]\n");
        let report = d.run().unwrap();
        assert_eq!(d.read("A.md"), "[[Nowhere]] ![[ghost.png]]\n");
        assert_eq!(finding(&report, "unresolved-link").unwrap().count, 1);
        assert_eq!(finding(&report, "unresolved-embed").unwrap().count, 1);
    }

    #[test]
    fn existing_workspace_files_are_never_overwritten() {
        let d = Dirs::new();
        let existing = d.workspace.join("Imported/vault");
        fs::create_dir_all(&existing).unwrap();
        fs::write(existing.join("A.md"), "mine").unwrap();
        d.put("A.md", b"theirs");
        d.put("a.MD", b"case clash");
        let report = d.run().unwrap();
        assert_eq!(fs::read_to_string(existing.join("A.md")).unwrap(), "mine");
        assert_eq!(
            fs::read_to_string(existing.join("A (imported).md")).unwrap(),
            "theirs"
        );
        assert!(report.renamed.count >= 1);
        // The report lists the rename and the link-risk finding.
        assert!(finding(&report, "renamed-note-links").is_some());
        assert_eq!(report.failed.count, 0);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_skipped_and_never_followed() {
        let d = Dirs::new();
        let outside = d.base.join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.md"), "secret").unwrap();
        d.put("A.md", b"a");
        std::os::unix::fs::symlink(&outside, d.source.join("link-dir")).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.md"), d.source.join("link.md")).unwrap();
        let report = d.run().unwrap();
        assert!(!d.workspace.join("Imported/vault/link-dir").exists());
        assert!(!d.workspace.join("Imported/vault/link.md").exists());
        assert_eq!(report.skipped.count, 2);
        assert_eq!(report.notes_copied, 1);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_target_folder_cannot_escape_the_workspace() {
        let d = Dirs::new();
        let outside = d.base.join("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, d.workspace.join("Imported")).unwrap();
        d.put("A.md", b"a");
        let error = d.run().unwrap_err();
        assert!(error.contains("outside the workspace"), "{error}");
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
    }

    #[test]
    fn traversal_in_the_target_folder_is_rejected() {
        let d = Dirs::new();
        d.put("A.md", b"a");
        for bad in ["../escape", "/abs", "a/../../b"] {
            let result = run_import(
                &d.source,
                &d.workspace,
                bad,
                &AtomicBool::new(false),
                &mut |_| {},
            );
            assert!(result.is_err(), "{bad} must be rejected");
        }
        assert!(!d.base.join("escape").exists());
    }

    #[test]
    fn destination_inside_the_source_is_rejected() {
        let d = Dirs::new();
        d.put("A.md", b"a");
        let result = run_import(
            &d.source,
            &d.source,
            "Imported",
            &AtomicBool::new(false),
            &mut |_| {},
        );
        assert!(result.unwrap_err().contains("inside the source"));
    }

    #[test]
    fn non_utf8_notes_are_copied_unchanged_and_reported() {
        let d = Dirs::new();
        let latin1: &[u8] = b"caf\xe9 [[Nowhere]] %%c%%\n";
        d.put("old.md", latin1);
        let report = d.run().unwrap();
        assert_eq!(
            fs::read(d.workspace.join("Imported/vault/old.md")).unwrap(),
            latin1
        );
        assert_eq!(report.non_utf8.count, 1);
        assert_eq!(report.notes_converted, 0);
    }

    #[test]
    fn cancel_stops_the_copy_and_reports_partial_progress() {
        let d = Dirs::new();
        for i in 0..20 {
            d.put(&format!("n{i:02}.md"), b"x");
        }
        let cancel = AtomicBool::new(false);
        let mut seen = Vec::new();
        let report = run_import(&d.source, &d.workspace, "Imported", &cancel, &mut |p| {
            seen.push((p.phase.clone(), p.processed));
            if p.phase == "copying" {
                cancel.store(true, Ordering::Relaxed);
            }
        })
        .unwrap();
        assert!(report.cancelled);
        assert!(report.notes_copied < 20);
        assert_eq!(report.notes_copied, 1);
        assert_eq!(report.total_files, 20);
        assert!(seen.iter().any(|(phase, _)| phase == "scanning"));
        assert!(seen.iter().any(|(phase, _)| phase == "copying"));
    }

    #[test]
    fn cancel_before_start_writes_nothing() {
        let d = Dirs::new();
        d.put("A.md", b"a");
        let report = run_import(
            &d.source,
            &d.workspace,
            "Imported",
            &AtomicBool::new(true),
            &mut |_| {},
        )
        .unwrap();
        assert!(report.cancelled);
        assert!(!d.workspace.join("Imported").exists());
    }

    #[cfg(unix)]
    #[test]
    fn an_unreadable_file_is_a_partial_failure_not_an_abort() {
        use std::os::unix::fs::PermissionsExt;
        let d = Dirs::new();
        d.put("a.md", b"fine");
        d.put("b.md", b"locked");
        d.put("c.md", b"fine");
        let locked = d.source.join("b.md");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let can_still_read = fs::read(&locked).is_ok();
        let report = d.run().unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o644)).unwrap();
        if can_still_read {
            // Running as a user that bypasses permissions (root): the
            // scenario cannot be produced here.
            return;
        }
        assert_eq!(report.failed.count, 1);
        assert_eq!(report.failed.items[0].path, "b.md");
        assert_eq!(report.notes_copied, 2);
        assert!(d.workspace.join("Imported/vault/c.md").exists());
    }

    #[test]
    fn empty_source_produces_an_empty_report() {
        let d = Dirs::new();
        let report = d.run().unwrap();
        assert_eq!(report.total_files, 0);
        assert!(d.workspace.join("Imported/vault").is_dir());
    }

    #[test]
    fn large_vaults_report_exact_counts_with_capped_lists() {
        let d = Dirs::new();
        for i in 0..(MAX_LISTED + 20) {
            d.put(&format!("n{i}.md"), b"[[Nowhere]]\n");
        }
        let report = d.run().unwrap();
        assert_eq!(report.notes_copied, MAX_LISTED + 20);
        let unresolved = finding(&report, "unresolved-link").unwrap();
        assert_eq!(unresolved.count, MAX_LISTED + 20);
        assert_eq!(unresolved.examples.len(), MAX_EXAMPLES);
    }

    #[test]
    fn crlf_line_endings_survive_conversion() {
        let d = Dirs::new();
        d.put("A.md", b"%%c%%\r\ntext\r\n");
        d.run().unwrap();
        assert_eq!(d.read("A.md"), "<!-- c -->\r\ntext\r\n");
    }
}
