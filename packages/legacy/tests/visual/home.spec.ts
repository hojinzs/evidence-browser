import { test } from "@playwright/test";

import { expectToMatchFigma, login } from "./helpers";

test("home matches fixture", async ({ page }) => {
  await login(page);
  await expectToMatchFigma(page, "home.png");
});
