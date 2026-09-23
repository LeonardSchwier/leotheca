/**
 * Tauri Mock for E2E testing Leotheca in a headless browser.
 * Inject BEFORE the app loads to simulate the Tauri filesystem bridge.
 */

const TAURI_MOCK_JS = `
(function() {
  const WORKSPACE_ROOT = '/home/leonard/leotheca-test-workspace';

  const MOCK_FILES = {
    'notes/welcome.md': '# Welcome to Leotheca\n\nThis is a **bold** and *italic* test workspace.\n\n## Features\n- ==Highlight== testing\n- [inline code] blocks\n\n> A blockquote for testing.\n\n### Subheading\nContent here.\n\n- [x] Done task\n- [ ] Open task\n\n$\\frac{a}{b} + c$\n\n| Col1 | Col2 |\n|------|------|\n| a    | b    |',
    'notes/todos.md': '# Todo List\n\n- [x] Build E2E test harness\n- [ ] Verify highlight rendering\n- [ ] Test file tree\n\n#tag:test #tag:todo\n\n> Deadline: 2026-10-01',
    'projects/leotheca.md': '# Leotheca Project\n\nA local-first note-taking app.\n\n## Tech Stack\n- Preact\n- Tauri\n- Capacitor\n\n==Local-first by design==\n\n$E = mc^2$\n\n```js\nconst x = 42;\n```',
    'research/ai.md': '# AI Research\n\nNotes about AI and machine learning.\n\n## Key Concepts\n- Neural networks\n- Transformers\n- **Attention mechanism**\n\n> The future is local-first.\n\n#tag:ai #tag:research\n\n$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$',
    'inbox/ideas.md': '# Ideas\n\n- Build a ==dashboard== for token tracking\n- Add dark mode\n- Mobile app\n\n#tag:ideas'
  };

  const FULL_PATHS = {};
  for (const [rel, content] of Object.entries(MOCK_FILES)) {
    FULL_PATHS[WORKSPACE_ROOT + '/' + rel] = content;
  }

  const GLOBAL_CONFIG = {
    version: 2,
    theme: 'system',
    activeWorkspaceId: 'ws-test-1',
    workspaceProfiles: [{
      id: 'ws-test-1', name: 'Test Workspace', path: WORKSPACE_ROOT,
      token: 'mock-token', icon: 'book', lastOpenedAt: Date.now()
    }],
    lastWorkspacePath: WORKSPACE_ROOT,
    externalFileOpenEnabled: true
  };
  FULL_PATHS['/home/leonard/.config/leotheca/config.json'] = JSON.stringify(GLOBAL_CONFIG, null, 2);

  function listDir(path) {
    const normalized = path.endsWith('/') ? path : path + '/';
    const results = [];
    const seen = new Set();
    for (const filePath of Object.keys(FULL_PATHS)) {
      if (filePath.startsWith(normalized)) {
        const rest = filePath.slice(normalized.length);
        const firstPart = rest.split('/')[0];
        if (firstPart && !seen.has(firstPart)) {
          seen.add(firstPart);
          results.push({ name: firstPart, path: normalized + firstPart, isDir: rest.includes('/') });
        }
      }
    }
    if (path === WORKSPACE_ROOT || path === WORKSPACE_ROOT + '/') {
      for (const dir of ['notes', 'projects', 'research', 'inbox']) {
        if (!seen.has(dir)) { seen.add(dir); results.push({ name: dir, path: normalized + dir, isDir: true }); }
      }
    }
    return results;
  }

  function findAllEntries(path) {
    const normalized = path.endsWith('/') ? path : path + '/';
    const entries = [];
    for (const rel of Object.keys(MOCK_FILES)) {
      const full = WORKSPACE_ROOT + '/' + rel;
      if (full.startsWith(normalized)) {
        entries.push({ name: rel.split('/').pop(), path: full, isDir: false });
      }
    }
    return entries;
  }

  function findMarkdownFiles(path) {
    const normalized = path.endsWith('/') ? path : path + '/';
    return Object.keys(FULL_PATHS).filter(f => f.startsWith(normalized) && f.endsWith('.md'));
  }

  function readTextFile(path) {
    if (FULL_PATHS[path]) return FULL_PATHS[path];
    const stripped = path.replace(WORKSPACE_ROOT + '/', '').replace(WORKSPACE_ROOT, '');
    if (FULL_PATHS[stripped]) return FULL_PATHS[stripped];
    const fileName = path.split('/').pop();
    for (const [k, v] of Object.entries(FULL_PATHS)) { if (k.endsWith(fileName)) return v; }
    throw new Error('File not found: ' + path);
  }

  function getAppVersion() { return '0.1.0-e2e'; }
  function getAppConfigFilePath() { return '/home/leonard/.config/leotheca/config.json'; }

  function getWorkspaceStats(path) {
    return {
      total_files: Object.keys(MOCK_FILES).length,
      total_words: Object.values(MOCK_FILES).reduce((sum, c) => sum + c.split(/\\s+/).length, 0),
      total_chars: Object.values(MOCK_FILES).reduce((sum, c) => sum + c.length, 0)
    };
  }

  function convertFileSrc(path) { return 'blob:mock-' + btoa(path); }

  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args, options) => {
      switch (cmd) {
        case 'list_dir': return listDir(args.path);
        case 'find_markdown_files': return findMarkdownFiles(args.path).map(f => ({ name: f.split('/').pop(), path: f, isDir: false }));
        case 'find_all_files': return Object.keys(FULL_PATHS).filter(f => f.startsWith(WORKSPACE_ROOT)).map(f => ({ name: f.split('/').pop(), path: f, isDir: false }));
        case 'find_all_entries': return findAllEntries(args.path);
        case 'read_text_file': return readTextFile(args.path);
        case 'read_text_files_batch': return args.paths.map(p => { try { return readTextFile(p); } catch { return null; } });
        case 'write_text_file': return null;
        case 'create_dir': return null;
        case 'rename_path': return null;
        case 'trash_path': return null;
        case 'delete_path_permanent': return null;
        case 'write_workspace_text_file': return null;
        case 'write_workspace_binary_file': return null;
        case 'create_workspace_text_file_new': return null;
        case 'create_workspace_binary_file_new': return null;
        case 'create_workspace_dir': return null;
        case 'create_workspace_dir_new': return null;
        case 'rename_workspace_path': return null;
        case 'rename_workspace_path_no_replace': return null;
        case 'delete_workspace_path_permanent': return null;
        case 'get_app_version': return getAppVersion();
        case 'get_app_config_file_path': return getAppConfigFilePath();
        case 'get_workspace_stats': return getWorkspaceStats(args.path);
        case 'set_active_workspace_root': return null;
        case 'take_pending_external_file': return null;
        case 'export_text_file_via_dialog': return true;
        case 'plugin:dialog|open': return WORKSPACE_ROOT;
        case 'plugin:dialog|save': return '/home/leonard/export.html';
        case 'plugin:app|version': return '0.1.0-e2e';
        case 'plugin:deep-link|get_current': return null;
        case 'plugin:event|listen': return null;
        case 'take_pending_open_file': return null;
        case 'plugin:path|resolve_directory':
          if (args && args.directory === 11) return '/home/leonard/.config/leotheca';
          return '/home/leonard/.config/leotheca';
        case 'plugin:path|join':
          if (args && args.paths) return args.paths.join('/');
          return null;
        case 'plugin:path|dirname':
          if (args && args.path) { const p = args.path.split('/'); p.pop(); return p.join('/') || '/'; }
          return null;
        case 'plugin:path|is_absolute':
          if (args && args.path) return args.path.startsWith('/');
          return false;
        case 'plugin:path|sep': return '/';
        case 'plugin:path|normalize':
          if (args && args.path) return args.path;
          return null;
        case 'plugin:path|basename':
          if (args && args.path) return args.path.split('/').pop();
          return null;
        case 'plugin:path|extname':
          if (args && args.path) { const p = args.path.split('/').pop().split('.'); return p.length > 1 ? '.' + p.pop() : ''; }
          return '';
        default:
          console.log('[TAURI-MOCK] Unknown command:', cmd);
          return null;
      }
    },
    transformCallback: function(cb, once) { return 'mock-cb-' + Math.random().toString(36).slice(2); },
    unregisterCallback: function(id) { return null; },
    convertFileSrc: function(path, protocol) { return 'blob:mock-' + btoa(path); },
  };

  window.__TAURI__ = {
    invoke: window.__TAURI_INTERNALS__.invoke,
    core: { invoke: window.__TAURI_INTERNALS__.invoke, convertFileSrc: window.__TAURI_INTERNALS__.convertFileSrc }
  };
  window.isTauri = true;

  try {
    localStorage.setItem('leotheca_workspace', JSON.stringify({ path: WORKSPACE_ROOT, name: 'Test Workspace' }));
    localStorage.setItem('leotheca_onboarding_complete', 'true');
  } catch (e) {}

  console.log('[TAURI-MOCK] Injected');
  console.log('[TAURI-MOCK] Workspace:', WORKSPACE_ROOT);
})();
`;

module.exports = { TAURI_MOCK_JS };
