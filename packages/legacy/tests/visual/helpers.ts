import fs from "fs/promises";
import path from "path";

import { expect, type Locator, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

export async function expectToMatchFigma(
  target: Page | Locator,
  fixtureName: string,
  maxDiffRatio = 0.05
) {
  const actualBuffer = await target.screenshot({ animations: "disabled" });

  const fixturePath = path.resolve(process.cwd(), "tests/fixtures/figma", fixtureName);
  const expectedBuffer = await fs.readFile(fixturePath);

  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(expectedBuffer);

  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(
    actual.data,
    expected.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: 0.1 }
  );

  const diffRatio = diffPixels / (actual.width * actual.height);
  expect(
    diffRatio,
    `Visual diff ratio for ${fixtureName} was ${diffRatio.toFixed(4)}`
  ).toBeLessThanOrEqual(maxDiffRatio);
}
