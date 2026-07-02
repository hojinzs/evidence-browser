import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const sampleBundlePath = path.join(repoRoot, "examples", "sample.zip");

test("uploads and renders a fixture bundle", async ({ page, request }) => {
  const workspaceSlug = `smoke-${Date.now()}`;
  const bundleId = "sample-smoke";

  const workspaceResponse = await request.post("/api/w", {
    data: {
      slug: workspaceSlug,
      name: "Smoke Workspace",
      description: "Playwright smoke workspace",
    },
  });
  expect(workspaceResponse.ok()).toBe(true);

  const uploadResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
    multipart: {
      bundleId,
      file: {
        name: "sample.zip",
        mimeType: "application/zip",
        buffer: fs.readFileSync(sampleBundlePath),
      },
    },
  });
  expect(uploadResponse.ok()).toBe(true);

  await page.goto(`/w/${workspaceSlug}/b/${bundleId}`);

  await expect(page.getByRole("heading", { name: "Evidence Browser Demo Bundle" })).toBeVisible();
  await expect(page.getByText("Bundle upload")).toBeVisible();
  await expect(page.getByText("Nested report details")).toBeVisible();
});
