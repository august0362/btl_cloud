import { defineConfig } from "@playwright/test";

// Opt-in: uses the actual localhost controller/Express started by run.bat.
export default defineConfig({
  testDir: "./local-tests", workers: 1, timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5173", browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
});
