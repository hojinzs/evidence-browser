import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@evidence-browser/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["dist/**", "node_modules/**"],
  },
});
