import type { FullConfig } from "@playwright/test";

import { seedVisualData } from "./test-data";

export default async function globalSetup(_: FullConfig) {
  await seedVisualData();
}
