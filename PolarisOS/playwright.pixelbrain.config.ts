import { defineConfig, devices } from "@playwright/test";

const port = 4174;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  workers: 1,
  reporter: "line",
  outputDir: "/tmp/polaris-pixelbrain-playwright-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url:
      `http://127.0.0.1:${port}/tests/browser/pixelbrain-alpha.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
