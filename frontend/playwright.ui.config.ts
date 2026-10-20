import { defineConfig } from "@playwright/test";

// Isolated browser UI verification with contract-shaped route mocks, not full-stack E2E.
export default defineConfig({
  testDir: "./ui-tests",
  workers: 1,
  timeout: 30_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/ui-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:4173",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host localhost --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
  },
});
