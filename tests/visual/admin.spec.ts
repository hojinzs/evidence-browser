import { test } from "@playwright/test";

import { expectToMatchFigma, login } from "./helpers";

test("admin matches fixture", async ({ page }) => {
  await login(page);
  await page.goto("/admin");
  await expectToMatchFigma(page, "admin.png");
});
