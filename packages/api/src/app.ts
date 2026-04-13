import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
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

  // Serve Vite web static assets when present (production Docker)
  const webDir = join(process.cwd(), "web");
  if (existsSync(webDir)) {
    app.use("/*", serveStatic({ root: "./web" }));
    app.notFound((c) => {
      const indexPath = join(webDir, "index.html");
      if (!c.req.path.startsWith("/api/") && existsSync(indexPath)) {
        return c.html(readFileSync(indexPath, "utf-8"));
      }
      return c.json({ error: "Not found" }, 404);
    });
  } else {
    app.notFound((c) => c.json({ error: "Not found" }, 404));
  }

  return app;
}
