import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "fs";
import { isAbsolute, join, resolve } from "path";
import { getEnv } from "@/config/env";
import { authRoutes } from "@/routes/auth";
import { bundleRoutes, shareBundleRoutes } from "@/routes/bundle";
import { workspaceRoutes } from "@/routes/workspace";
import { adminRoutes } from "@/routes/admin";
import { apiKeyRoutes } from "@/routes/api-keys";
import { healthRoutes } from "@/routes/health";
import { setupRoutes } from "@/routes/setup";
import { mcpRoutes } from "@/routes/mcp";

export function resolveStaticRoot(
  configuredRoot = getEnv().STATIC_ROOT,
  cwd = process.cwd(),
  pathExists: (path: string) => boolean = existsSync
): string {
  if (configuredRoot) {
    return isAbsolute(configuredRoot) ? configuredRoot : resolve(cwd, configuredRoot);
  }

  const candidates = [
    join(cwd, "packages", "web", "dist"),
    join(cwd, "..", "web", "dist"),
  ];

  return candidates.find((dir) => pathExists(dir)) ?? candidates[0];
}

export function createApp() {
  const app = new Hono();

  app.route("/api/auth", authRoutes);
  app.route("/api/w", workspaceRoutes);
  app.route("/api/w", bundleRoutes);
  app.route("/api/s", shareBundleRoutes);
  app.route("/api/api-keys", apiKeyRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/setup", setupRoutes);
  app.route("/api/mcp", mcpRoutes);

  const staticRoot = resolveStaticRoot();
  if (existsSync(staticRoot)) {
    app.use(
      "/*",
      serveStatic({
        root: staticRoot,
      })
    );
    app.notFound((c) => {
      const indexPath = join(staticRoot, "index.html");
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
