import { test } from "@playwright/test";

import { expectToMatchFigma, login } from "./helpers";

test("workspace matches fixture", async ({ page }) => {
  await login(page);
  await page.goto("/w/production");
  await expectToMatchFigma(page, "workspace.png");
});
