import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const sampleBundlePath = path.join(repoRoot, "examples", "sample.zip");

async function seedDefaultWorkspace(request: APIRequestContext) {
  const admin = await request.post("/api/setup/admin", {
    data: { username: `setup-${Date.now()}`, password: "password123" },
  });
  expect([200, 403]).toContain(admin.status());

  const workspace = await request.post("/api/setup/workspace", {
    data: {
      slug: "default",
      name: "Default",
      description: "OIDC QA workspace",
    },
  });
  expect([200, 409]).toContain(workspace.status());
}

async function signInWithDex(page: Page, callbackUrl = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await expect(page.getByRole("link", { name: "Continue with Dex SSO" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);

  await page.getByRole("link", { name: "Continue with Dex SSO" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5556\/dex\/auth/);

  await page.getByLabel("Email Address").fill("oidc-member@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(new RegExp(`${callbackUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}

async function fetchJson<T>(page: Page, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ requestPath, requestInit }) => {
      const response = await fetch(requestPath, requestInit);
      const body = (await response.json().catch(() => null)) as T;
      return { status: response.status, body };
    },
    { requestPath: path, requestInit: init }
  );
}

async function createApiKey(page: Page): Promise<string> {
  const response = await fetchJson<{ key: string }>(page, "/api/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "oidc-upload", scope: "upload" }),
  });
  expect(response.status).toBe(201);
  return response.body.key;
}

test.describe("OIDC authorization-code flow with Dex", () => {
  test("signs in through Dex, reuses the user row, and preserves API-key uploads", async ({
    browser,
    baseURL,
    page,
    request,
  }) => {
    await seedDefaultWorkspace(request);

    await signInWithDex(page, "/w/default");
    await expect(page.getByRole("heading", { name: "Default" })).toBeVisible();
    await expect(page.getByText("oidc-member")).toBeVisible();

    const firstMe = await fetchJson<{ user: { id: string; username: string; role: string } }>(
      page,
      "/api/auth/me"
    );
    expect(firstMe.status).toBe(200);
    const firstUser = firstMe.body.user;
    expect(firstUser).toMatchObject({ username: "oidc-member", role: "user" });

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await signInWithDex(page, "/w/default");

    const secondMe = await fetchJson<{ user: { id: string; username: string } }>(
      page,
      "/api/auth/me"
    );
    expect(secondMe.status).toBe(200);
    const secondUser = secondMe.body.user;
    expect(secondUser.id).toBe(firstUser.id);

    const localLogin = await fetchJson<{ error: string }>(page, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "oidc-member", password: "password" }),
    });
    expect(localLogin.status).toBe(403);

    const key = await createApiKey(page);
    const apiContext = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${key}` },
    });
    const apiRequest = apiContext.request;
    const uploadResponse = await apiRequest.post(`/api/w/default/bundle`, {
      multipart: {
        bundleId: `oidc-${Date.now()}`,
        file: {
          name: "sample.zip",
          mimeType: "application/zip",
          buffer: fs.readFileSync(sampleBundlePath),
        },
      },
    });
    expect(uploadResponse.status()).toBe(201);
    await apiContext.close();
  });
});
