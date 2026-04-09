import { seedVisualData } from "../tests/visual/test-data";

seedVisualData().catch((error) => {
  console.error(error);
  process.exit(1);
});
