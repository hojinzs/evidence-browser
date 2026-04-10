import { defineConfig } from "@playwright/test";

/**
 * Two projects:
 * - `visual`  → pixel-diff specs in tests/visual/ that use expectToMatchFigma
 * - `e2e`     → behavioral specs in tests/e2e/ (no figma snapshot expectations)
 *
 * The webServer is shared by both projects, so it runs once per `playwright test`
 * invocation regardless of which project(s) are selected.
 *
 * Run examples:
 *   npx playwright test --project=visual
 *   npx playwright test --project=e2e
 *   npx playwright test                    # runs both projects
 */
export default defineConfig({
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command:
      "tsx scripts/prepare-visual-data.ts && AUTH_SECRET=test-secret STORAGE_LOCAL_PATH=./data/bundles HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "visual",
      testDir: "./tests/visual",
      use: { browserName: "chromium" },
    },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { browserName: "chromium" },
    },
  ],
});
