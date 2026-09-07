import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // Use happy-dom environment instead of jsdom for better canvas support
    // happy-dom implements HTMLCanvasElement.getContext("2d") and other
    // Canvas APIs that jsdom doesn't support
    environment: "happy-dom",
    
    // Exclude node_modules from test coverage
    exclude: [...configDefaults.exclude, "**/node_modules/**"],
    
    // Include all test files
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    
    // Timeout for async tests
    testTimeout: 10000,
    
    // Environment-specific options for happy-dom
    environmentOptions: {
      happyDOM: {
        // Enable Canvas API support
        settings: {
          enableCanvasAPI: true,
        }
      }
    }
  },
});
