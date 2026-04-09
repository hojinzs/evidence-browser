import fs from "fs";
import path from "path";

import { chromium, type Page } from "@playwright/test";

import { seedVisualData } from "../tests/visual/test-data";

async function login(page: Page) {
  await page.goto("http://127.0.0.1:3000/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://127.0.0.1:3000/");
}

async function main() {
  await seedVisualData();
  const fixturesDir = path.resolve(process.cwd(), "tests/fixtures/figma");
  fs.mkdirSync(fixturesDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  await page.goto("http://127.0.0.1:3000/login");
  await page.screenshot({ path: path.join(fixturesDir, "login.png") });

  await login(page);
  await page.screenshot({ path: path.join(fixturesDir, "home.png") });

  await page.goto("http://127.0.0.1:3000/w/production");
  await page.screenshot({ path: path.join(fixturesDir, "workspace.png") });

  await page.goto("http://127.0.0.1:3000/w/production/b/ci-run-2024-04-08");
  await page.screenshot({ path: path.join(fixturesDir, "bundle-viewer.png") });

  await page.goto("http://127.0.0.1:3000/admin");
  await page.screenshot({ path: path.join(fixturesDir, "admin.png") });

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
