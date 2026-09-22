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

    // Exclude node_modules from test coverage. Agent control worktrees
    // (`.agents/control-*`, created by autonomous sessions for ledger
    // management) contain their own copies of the full test suite; running
    // those is redundant with the real tree and produces spurious unhandled
    // errors (e.g. `cancelAnimationFrame is not defined` from a preact
    // hook timer that outlives the test), which makes a fully green run
    // impossible even when the actual change is correct.
    exclude: [
      ...configDefaults.exclude,
      "**/node_modules/**",
      ".agents/control-*/**",
      ".agents/*/control-*/**",
    ],

    // Include all test files
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    // Timeout for async tests
    testTimeout: 10000,
  },
});
