import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "src-tauri/target/",
      // Capacitor's `cap sync` copies the web build in here, and Gradle
      // copies it again into its own intermediates dir; both are build
      // output (already gitignored), not source, and lint has no business
      // walking the minified bundles they contain.
      "android/app/src/main/assets/public/",
      "android/app/build/",
      "android/.gradle/",
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
    // Plain Node scripts (release tooling, not the shared frontend bundle),
    // so they need Node's own globals rather than the browser ones the rest
    // of this config never had to declare because tseslint's TS-aware rules
    // cover src/**/*.{ts,tsx} instead of relying on eslint's no-undef there.
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
);
