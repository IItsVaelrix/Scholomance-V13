import { defineConfig, devices } from "playwright/test";

const previewMode = process.env.STUDIO_PREVIEW === "1";
const baseURL =
  process.env.STUDIO_BASE_URL ?? (previewMode ? "http://127.0.0.1:8091" : "http://127.0.0.1:8090");

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: previewMode ? "npm run preview" : "npm run dev",
    url: `${baseURL}/studio/foundry`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
