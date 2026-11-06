import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const isCi = Boolean(process.env.CI);

// `*.e2e.ts` on purpose: the root vitest include pattern matches `*.test.*` and
// `*.spec.*`, so these files can never be picked up by the unit-test run.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: isCi,
  // No retries anywhere: a test that needs a second attempt is flaky and must be fixed.
  retries: 0,
  workers: isCi ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    // Kept for every failure, so the CI artifact always has a replayable trace.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Deterministic rendering: fixed locale and timezone, no motion.
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    // Drives the production bundle (vite build), not the dev server, so the
    // suite exercises what actually ships, including the strict CSP.
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: "../..",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !isCi,
    timeout: 240_000,
  },
});
