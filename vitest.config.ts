import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // Use jsdom environment for tests that need DOM APIs
    environment: "jsdom",
    
    // Global test setup file
    setupFiles: ["./src/vitest.setup.ts"],
    
    // Exclude node_modules from test coverage
    exclude: [...configDefaults.exclude, "**/node_modules/**"],
    
    // Include all test files
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    
    // Timeout for async tests
    testTimeout: 10000,
  },
});
