import { expect, test, type Page } from "@playwright/test";

type AuthConfig = {
  local: boolean;
  oidc: {
    enabled: boolean;
    label: string;
  };
};

async function stubLoginPrerequisites(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthenticated" }),
    });
  });
  await page.route("**/api/setup/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ needsSetup: false, hasAdmin: true, hasWorkspace: true }),
    });
  });
}

async function stubAuthConfig(page: Page, config: AuthConfig) {
  await page.route("**/api/auth/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config),
    });
  });
}

async function gotoLogin(page: Page, path: string, configuredBaseURL?: string) {
  const baseURL = configuredBaseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  await page.goto(new URL(path, baseURL).toString());
}

test.beforeEach(async ({ page }) => {
  await stubLoginPrerequisites(page);
});

test("does not render sign-in controls while auth config is loading", async ({ page, baseURL }) => {
  await page.route("**/api/auth/config", () => undefined);

  await gotoLogin(page, "/login?callbackUrl=%2Fw%2Finfra", baseURL);

  await expect(page.getByLabel("Username")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /SSO/ })).toHaveCount(0);
});

test("renders the unchanged local-only login form", async ({ page, baseURL }) => {
  await stubAuthConfig(page, {
    local: true,
    oidc: { enabled: false, label: "Sign in with SSO" },
  });

  await gotoLogin(page, "/login?callbackUrl=%2Fw%2Finfra", baseURL);

  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await expect(page.getByText("Enter your credentials to access your workspace.")).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with SSO" })).toHaveCount(0);
  await expect(page.getByRole("separator", { name: "or" })).toHaveCount(0);
});

test("renders local form with divider and SSO button when both modes are enabled", async ({ page, baseURL }) => {
  await stubAuthConfig(page, {
    local: true,
    oidc: { enabled: true, label: "Continue with Acme SSO" },
  });

  await gotoLogin(page, "/login?callbackUrl=%2Fw%2Finfra", baseURL);

  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("separator", { name: "or" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Acme SSO" })).toHaveAttribute(
    "href",
    "/api/auth/oidc/start?callbackUrl=%2Fw%2Finfra"
  );
});

test("renders only the SSO button when local login is disabled", async ({ page, baseURL }) => {
  await stubAuthConfig(page, {
    local: false,
    oidc: { enabled: true, label: "Continue with Company SSO" },
  });

  await gotoLogin(page, "/login?callbackUrl=%2Fadmin", baseURL);

  await expect(page.getByText("Continue with single sign-on to access your workspace.")).toBeVisible();
  await expect(page.getByText("Enter your credentials to access your workspace.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue with Company SSO" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("separator", { name: "or" })).toHaveCount(0);
});

test("uses full-page SSO navigation with the current callbackUrl", async ({ page, baseURL }) => {
  await stubAuthConfig(page, {
    local: false,
    oidc: { enabled: true, label: "Continue with SSO" },
  });
  await page.route("**/api/auth/oidc/start**", async (route) => {
    await route.fulfill({
      status: 204,
    });
  });

  await gotoLogin(page, "/login?callbackUrl=%2Fw%2Finfra%3Ftab%3Dfiles", baseURL);

  const requestPromise = page.waitForRequest("**/api/auth/oidc/start?callbackUrl=%2Fw%2Finfra%3Ftab%3Dfiles");
  await page.getByRole("link", { name: "Continue with SSO" }).click();

  expect((await requestPromise).url()).toContain("/api/auth/oidc/start?callbackUrl=%2Fw%2Finfra%3Ftab%3Dfiles");
});

test("renders safe OIDC error copy without raw error detail", async ({ page, baseURL }) => {
  await stubAuthConfig(page, {
    local: false,
    oidc: { enabled: true, label: "Continue with SSO" },
  });

  await gotoLogin(page, "/login?error=oidc_failed&callbackUrl=%2F", baseURL);

  const loginCard = page.locator(".relative.z-10");
  await expect(page.getByText("Single sign-on could not be completed. Try again or use another sign-in method.")).toBeVisible();
  await expect(loginCard).not.toContainText("oidc_failed");
  await expect(loginCard).not.toContainText("issuer");
});

test("falls back to local login when auth config fails", async ({ page, baseURL }) => {
  await page.route("**/api/auth/config", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Config unavailable" }),
    });
  });

  await gotoLogin(page, "/login?callbackUrl=%2F", baseURL);

  await expect(page.getByText("Could not load sign-in options. Local sign-in is still available.")).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
