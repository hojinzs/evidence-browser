import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3101);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e-oidc",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "docker compose -f ../../docker-compose.test.yml up -d oidc",
      url: "http://127.0.0.1:5556/dex/.well-known/openid-configuration",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: [
        "rm -rf $(pwd)/.playwright/oidc-data $(pwd)/.playwright/oidc-bundles &&",
        `PORT=${port}`,
        "HOSTNAME=127.0.0.1",
        "AUTH_SECRET=test-secret",
        "AUTH_BYPASS=false",
        "AUTH_LOCAL_ENABLED=false",
        "OIDC_ENABLED=true",
        "OIDC_ISSUER=http://127.0.0.1:5556/dex",
        "OIDC_CLIENT_ID=evidence-browser",
        "OIDC_CLIENT_SECRET=evidence-browser-secret",
        `OIDC_REDIRECT_URI=${baseURL}/api/auth/oidc/callback`,
        "OIDC_SCOPES='openid profile email'",
        "OIDC_BUTTON_LABEL='Continue with Dex SSO'",
        "DATA_DIR=$(pwd)/.playwright/oidc-data",
        "STORAGE_LOCAL_PATH=$(pwd)/.playwright/oidc-bundles",
        "STATIC_ROOT=$(pwd)/dist",
        "npm -w @evidence-browser/api run start",
      ].join(" "),
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "oidc-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
