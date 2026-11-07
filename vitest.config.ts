import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom, not happy-dom: DOMPurify.sanitize() strips every element tag
    // under happy-dom (verified directly - it reduces "<h1>Title</h1>" to
    // the bare text "Title", for every tag tried, not just unsafe ones),
    // which silently broke MarkdownPreview's sanitization tests and most
    // other component tests. Each test file's own
    // `/** @vitest-environment jsdom */` docblock is authoritative; this is
    // only the fallback for a file with no docblock.
    environment: "jsdom",

    // Polyfill the jsdom DOM gaps (Range.getClientRects, etc.) that
    // CodeMirror and canvas code call during normal operation. Without this,
    // one unhandled TypeError fails the whole run even when all assertions
    // pass. See the file for the full list and rationale.
    setupFiles: ["./src/test/setup-jsdom.ts"],

    // Exclude node_modules from test coverage. Agent control worktrees
    // (`.agents/control-*`, created by autonomous sessions for ledger
    // management) contain their own copies of the full test suite; running
    // those is redundant with the real tree and produces spurious unhandled
    // errors (e.g. `cancelAnimationFrame is not defined` from a preact
    // hook timer that outlives the test), which makes a fully green run
    // impossible even when the actual change is correct.
    //
    // `control-*` is matched at ANY depth (not just under `.agents/`) because
    // control worktrees are sometimes created in the repo root itself (e.g.
    // `control-opencode-20261014T071700Z-e33adb48`). The narrower
    // `.agents/control-*` pattern alone leaked 138 duplicate test runs and
    // the jsdom `Range.getClientRects` unhandled error into the real suite.
    exclude: [
      ...configDefaults.exclude,
      "**/node_modules/**",
      ".agents/control-*/**",
      ".agents/*/control-*/**",
      "control-*/**",
      "**/control-opencode-*/**",
    ],

    // Include all test files
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    // Timeout for async tests
    testTimeout: 10000,
  },
});
