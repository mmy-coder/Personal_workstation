import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    viewport: { width: 1440, height: 1100 },
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
  },
});
