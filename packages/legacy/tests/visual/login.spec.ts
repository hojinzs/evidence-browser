import { test } from "@playwright/test";

import { expectToMatchFigma } from "./helpers";

test("login matches fixture", async ({ page }) => {
  await page.goto("/login");
  await expectToMatchFigma(page, "login.png");
});
