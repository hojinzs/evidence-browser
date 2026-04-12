import { Hono } from "hono";
import { authRoutes } from "@/routes/auth";
import { bundleRoutes } from "@/routes/bundle";
import { workspaceRoutes } from "@/routes/workspace";
import { adminRoutes } from "@/routes/admin";
import { apiKeyRoutes } from "@/routes/api-keys";
import { healthRoutes } from "@/routes/health";
import { setupRoutes } from "@/routes/setup";
import { mcpRoutes } from "@/routes/mcp";

export function createApp() {
  const app = new Hono();

  app.route("/api/auth", authRoutes);
  app.route("/api/w", workspaceRoutes);
  app.route("/api/w", bundleRoutes);
  app.route("/api/api-keys", apiKeyRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/setup", setupRoutes);
  app.route("/api/mcp", mcpRoutes);

  app.get("/", (c) => c.json({ service: "evidence-browser-api", status: "ok" }));
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
