import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      // Agent ledger-only worktrees live in the repo root and hold a full
      // copy of the sources; linting them doubles the work and the noise.
      "control-*/",
      // Claude Code worktrees: full copies of the sources, local only.
      ".claude/",
      "node_modules/",
      "src-tauri/target/",
      // Capacitor's `cap sync` copies the web build in here, and Gradle
      // copies it again into its own intermediates dir; both are build
      // output (already gitignored), not source, and lint has no business
      // walking the minified bundles they contain.
      "android/app/src/main/assets/public/",
      "android/app/build/",
      "android/.gradle/",
      // Vendored pdf.js runtime data copied verbatim from pdfjs-dist
      // (CMaps, standard fonts, ICC profiles, and Emscripten-generated
      // wasm loader glue for its JBIG2/OpenJPEG decoders) -- third-party
      // build output served as static assets, not this project's source.
      "public/pdfjs/",
      // Playwright's HTML report and traces: a failed local e2e run leaves a
      // bundled report here, and walking it fails the whole lint (and the
      // pre-push gate) with thousands of errors in code nobody wrote.
      "tests/e2e/playwright-report/",
      "tests/e2e/test-results/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Static security patterns (eslint-plugin-security) on shipped code.
    // Triage of the first run (2026-11-07, 202 findings in src, tests excluded):
    //  - detect-object-injection (185): off. It flags every `obj[key]`, and the
    //    app indexes plain objects and arrays with its own keys; the real risk,
    //    prototype pollution from parsed input, is covered by tests on the
    //    parsers instead. High noise, no true finding found in a sample.
    //  - detect-possible-timing-attacks (1): off. It compared a search token with
    //    "OR"; nothing here compares a secret.
    //  - detect-unsafe-regex (10): error. One was a real quadratic stall
    //    (`/(\r?\n)+$/`, fixed by src/lib/trimTrailingNewlines.ts); the other
    //    nine are bounded and carry a `reviewed:` disable comment.
    //  - detect-non-literal-regexp (3): error; each input is escaped or a fixed
    //    tag name, and carries a `reviewed:` disable comment.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    plugins: { security },
    rules: {
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-no-csrf-before-method-override": "error",
    },
  },
  {
    // Plain Node scripts (release tooling, not the shared frontend bundle),
    // so they need Node's own globals rather than the browser ones the rest
    // of this config never had to declare because tseslint's TS-aware rules
    // cover src/**/*.{ts,tsx} instead of relying on eslint's no-undef there.
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
  },
);
