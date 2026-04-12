import { test } from "@playwright/test";

import { expectToMatchFigma, login } from "./helpers";

test("bundle viewer matches fixture", async ({ page }) => {
  await login(page);
  await page.goto("/w/production/b/ci-run-2024-04-08");
  await expectToMatchFigma(page, "bundle-viewer.png");
});
