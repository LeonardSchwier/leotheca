/**
 * Stateful in-memory stand-in for the Tauri native bridge.
 *
 * The built frontend talks to Rust only through `window.__TAURI_INTERNALS__.invoke`.
 * This mock implements the same command set over a Map-backed filesystem, so a
 * write really changes what a later read, listing, search or backlink sees, and
 * records every call so tests can assert what reached the "native" side
 * (autosave, trash, rename) instead of trusting UI state alone.
 *
 * `bridgeMockInPage` is serialized by Playwright and runs inside the page, so it
 * must stay self-contained: no imports and no references to module scope.
 */

export interface BridgeMockOptions {
  /** Absolute workspace root. */
  root: string;
  /** Absolute app config directory (holds config.json). */
  configDir: string;
  /** Workspace files, keyed by path relative to `root`. */
  files: Record<string, string>;
  /** Extra directories to create even though they hold no file. */
  dirs?: string[];
  /** Optional preset for the global config's `theme` field. */
  theme?: "system" | "light" | "dark";
}

export interface BridgeCall {
  seq: number;
  cmd: string;
  args: Record<string, unknown>;
}

export interface BridgeState {
  calls: BridgeCall[];
  /** Commands the app invoked that this mock does not implement. */
  unhandled: string[];
  files: Record<string, string>;
  dirs: string[];
}

declare global {
  interface Window {
    __e2eBridge: {
      calls: BridgeCall[];
      unhandled: string[];
      snapshot(): BridgeState;
    };
  }
}

export function bridgeMockInPage(opts: BridgeMockOptions): void {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const calls: BridgeCall[] = [];
  const unhandled: string[] = [];
  let seq = 0;
  let nextCallbackId = 1;
  let nextEventId = 1;

  const root = opts.root;
  const join = (...parts: string[]) =>
    parts
      .join("/")
      .replace(/\/{2,}/g, "/")
      .replace(/(.)\/$/, "$1");
  const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";
  const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

  const ensureDir = (dir: string) => {
    let cur = dir;
    while (cur && cur !== "/" && !dirs.has(cur)) {
      dirs.add(cur);
      cur = parentOf(cur);
    }
  };
  const putFile = (path: string, content: string) => {
    ensureDir(parentOf(path));
    files.set(path, content);
  };
  const fail = (code: string, message: string): never => {
    // Rust returns `code: message` strings; tauriBridge.ts decodes that shape.
    throw `${code}: ${message}`;
  };
  const exists = (p: string) => files.has(p) || dirs.has(p);
  const inside = (parent: string, p: string) => p.startsWith(parent + "/");
  const resolveIn = (workspaceRoot: string, relativePath: string) => {
    if (relativePath.split("/").includes(".."))
      fail("outside_workspace", relativePath);
    return join(workspaceRoot, relativePath);
  };

  for (const [rel, content] of Object.entries(opts.files))
    putFile(join(root, rel), content);
  for (const d of opts.dirs ?? []) ensureDir(join(root, d));
  ensureDir(root);

  const config = {
    version: 2,
    theme: opts.theme ?? "system",
    activeWorkspaceId: "ws-e2e",
    workspaceProfiles: [
      {
        id: "ws-e2e",
        name: "E2E Notes",
        path: root,
        icon: "book",
        lastOpenedAt: 1,
      },
    ],
    lastWorkspacePath: root,
    externalFileOpenEnabled: true,
  };
  putFile(join(opts.configDir, "config.json"), JSON.stringify(config, null, 2));

  const entry = (path: string) => ({
    name: baseName(path),
    path,
    isDir: dirs.has(path),
  });
  const visible = (path: string, base: string) =>
    !path
      .slice(base.length + 1)
      .split("/")
      .some((segment) => segment.startsWith("."));

  const listDir = (path: string) => {
    const out = new Map<
      string,
      { name: string; path: string; isDir: boolean }
    >();
    for (const d of dirs)
      if (parentOf(d) === path && !baseName(d).startsWith("."))
        out.set(d, entry(d));
    for (const f of files.keys())
      if (parentOf(f) === path && !baseName(f).startsWith("."))
        out.set(f, entry(f));
    return [...out.values()].sort((a, b) =>
      a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name),
    );
  };
  const walkFiles = (base: string) =>
    [...files.keys()]
      .filter((f) => inside(base, f) && visible(f, base))
      .map(entry);

  const move = (from: string, to: string) => {
    if (!exists(from)) fail("io_failure", `No such file or directory: ${from}`);
    ensureDir(parentOf(to));
    if (files.has(from)) {
      files.set(to, files.get(from) as string);
      files.delete(from);
      return;
    }
    for (const f of [...files.keys()]) {
      if (inside(from, f)) {
        files.set(to + f.slice(from.length), files.get(f) as string);
        files.delete(f);
      }
    }
    for (const d of [...dirs]) {
      if (d === from || inside(from, d)) {
        dirs.delete(d);
        dirs.add(to + d.slice(from.length));
      }
    }
    dirs.add(to);
  };
  const remove = (path: string) => {
    files.delete(path);
    for (const f of [...files.keys()]) if (inside(path, f)) files.delete(f);
    for (const d of [...dirs])
      if (d === path || inside(path, d)) dirs.delete(d);
  };

  const readText = (path: string) => {
    const content = files.get(path);
    if (content === undefined)
      fail("io_failure", `No such file or directory: ${path}`);
    return content as string;
  };

  type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  const commands: Record<string, (a: Args) => unknown> = {
    list_dir: (a) => listDir(a.path),
    find_markdown_files: (a) =>
      walkFiles(a.path).filter((e) => e.name.endsWith(".md")),
    find_all_files: (a) => walkFiles(a.path),
    find_all_entries: (a) => [
      ...walkFiles(a.path),
      ...[...dirs]
        .filter((d) => inside(a.path, d) && visible(d, a.path))
        .map(entry),
    ],
    read_text_file: (a) => readText(a.path),
    read_text_files_batch: (a) =>
      (a.paths as string[]).map((p) => files.get(p) ?? null),
    read_binary_file: (a) => [...new TextEncoder().encode(readText(a.path))],
    write_text_file: (a) => void putFile(a.path, a.contents),
    write_binary_file: (a) =>
      void putFile(a.path, new TextDecoder().decode(new Uint8Array(a.data))),
    write_workspace_text_file: (a) =>
      void putFile(resolveIn(a.workspaceRoot, a.relativePath), a.contents),
    write_workspace_binary_file: (a) =>
      void putFile(
        resolveIn(a.workspaceRoot, a.relativePath),
        new TextDecoder().decode(new Uint8Array(a.data)),
      ),
    create_workspace_text_file_new: (a) => {
      const target = resolveIn(a.workspaceRoot, a.relativePath);
      if (exists(target)) fail("already_exists", a.relativePath);
      putFile(target, a.contents);
    },
    create_workspace_binary_file_new: (a) => {
      const target = resolveIn(a.workspaceRoot, a.relativePath);
      if (exists(target)) fail("already_exists", a.relativePath);
      putFile(target, new TextDecoder().decode(new Uint8Array(a.data)));
    },
    create_dir: (a) => void ensureDir(a.path),
    create_workspace_dir: (a) =>
      void ensureDir(resolveIn(a.workspaceRoot, a.relativePath)),
    create_workspace_dir_new: (a) => {
      const target = resolveIn(a.workspaceRoot, a.relativePath);
      if (exists(target)) fail("already_exists", a.relativePath);
      ensureDir(target);
    },
    // The workspace variants take paths relative to `workspaceRoot` (the Rust
    // side joins and confines them); the plain one takes absolute paths.
    rename_path: (a) => void move(a.from, a.to),
    rename_workspace_path: (a) =>
      void move(
        resolveIn(a.workspaceRoot, a.from),
        resolveIn(a.workspaceRoot, a.to),
      ),
    rename_workspace_path_no_replace: (a) => {
      const from = resolveIn(a.workspaceRoot, a.from);
      const to = resolveIn(a.workspaceRoot, a.to);
      if (exists(to)) fail("already_exists", a.to);
      move(from, to);
    },
    trash_path: (a) => {
      const relative = (a.path as string).slice(
        (a.workspaceRoot as string).length + 1,
      );
      let dest = join(a.workspaceRoot, ".trash", relative);
      if (exists(dest))
        dest = join(parentOf(dest), `${Date.now()}-${baseName(dest)}`);
      move(a.path, dest);
    },
    delete_path_permanent: (a) => void remove(a.path),
    delete_workspace_path_permanent: (a) =>
      void remove(resolveIn(a.workspaceRoot, a.relativePath)),
    workspace_stats: (a) => {
      const notes = walkFiles(a.path).filter((e) => e.name.endsWith(".md"));
      const lines = notes.map((n) => readText(n.path).split("\n").length);
      return {
        folderCount: [...dirs].filter(
          (d) => inside(a.path, d) && visible(d, a.path),
        ).length,
        noteCount: notes.length,
        imageCount: 0,
        averageLinesPerNote: lines.length
          ? lines.reduce((s, n) => s + n, 0) / lines.length
          : 0,
        oldestNoteDate: null,
        newestNoteDate: null,
      };
    },
    set_active_workspace_root: () => null,
    take_pending_open_file: () => null,
    take_pending_quick_capture: () => false,
    pick_and_read_external_markdown_file: () => null,
    export_text_file_via_dialog: () => false,
    "plugin:app|version": () => "0.0.0-e2e",
    "plugin:path|resolve_directory": () => opts.configDir,
    "plugin:path|join": (a) => join(...(a.paths as string[])),
    "plugin:path|resolve": (a) => join(...(a.paths as string[])),
    "plugin:path|dirname": (a) => parentOf(a.path),
    "plugin:path|basename": (a) => baseName(a.path),
    "plugin:path|normalize": (a) => a.path,
    "plugin:path|is_absolute": (a) => (a.path as string).startsWith("/"),
    "plugin:dialog|open": () => null,
    "plugin:dialog|save": () => null,
    "plugin:dialog|ask": () => false,
    "plugin:dialog|confirm": () => false,
    "plugin:dialog|message": () => null,
    "plugin:event|listen": () => nextEventId++,
    "plugin:event|unlisten": () => null,
    "plugin:event|emit": () => null,
    "plugin:deep-link|get_current": () => null,
    "plugin:resources|close": () => null,
  };

  const invoke = async (cmd: string, args: Args = {}) => {
    calls.push({
      seq: ++seq,
      cmd,
      args: JSON.parse(JSON.stringify(args ?? {})),
    });
    const handler = commands[cmd];
    if (!handler) {
      unhandled.push(cmd);
      throw `e2e bridge mock: command not implemented: ${cmd}`;
    }
    return handler(args);
  };

  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {
      invoke,
      transformCallback: () => nextCallbackId++,
      unregisterCallback: () => undefined,
      convertFileSrc: (path: string) => `blob:e2e-${encodeURIComponent(path)}`,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    },
  });
  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    value: { unregisterListener: () => undefined },
  });

  window.__e2eBridge = {
    calls,
    unhandled,
    snapshot: () => ({
      calls: calls.slice(),
      unhandled: unhandled.slice(),
      files: Object.fromEntries(files),
      dirs: [...dirs],
    }),
  };
}
