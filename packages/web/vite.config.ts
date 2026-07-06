/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 20,
        branches: 20,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@evidence-browser/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
  build: {
    outDir: "dist",
  },
});
