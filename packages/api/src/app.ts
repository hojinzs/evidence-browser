import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "fs";
import { isAbsolute, join, resolve } from "path";
import { getEnv } from "@/config/env";
import { mapAppError } from "@/lib/http-errors";
import { authRoutes } from "@/routes/auth";
import { bundleRoutes, shareBundleRoutes } from "@/routes/bundle";
import { workspaceRoutes } from "@/routes/workspace";
import { adminRoutes } from "@/routes/admin";
import { apiKeyRoutes } from "@/routes/api-keys";
import { healthRoutes } from "@/routes/health";
import { setupRoutes } from "@/routes/setup";
import { mcpRoutes } from "@/routes/mcp";
import { uploadRoutes } from "@/routes/upload";

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

export function redactRequestLog(message: string): string {
  return message.replace(/\/api\/upload\/[^?\s]+/g, "/api/upload/:token");
}

export function createApp() {
  const app = new Hono();

  app.use("*", requestId());
  app.use("*", logger((message) => console.log(redactRequestLog(message))));

  app.onError((err, c) => {
    const mapped = mapAppError(err);
    const env = getEnv();
    const requestIdValue = c.get("requestId");
    const errorName = err instanceof Error ? err.name : "UnknownError";

    console.error(
      JSON.stringify({
        level: "error",
        event: "request_error",
        requestId: requestIdValue,
        method: c.req.method,
        path: redactRequestLog(c.req.path),
        status: mapped.status,
        error: errorName,
        message: err instanceof Error ? err.message : String(err),
      })
    );

    const message = mapped.expose || env.NODE_ENV !== "production" ? mapped.message : "Internal server error";
    return c.json({ error: message }, mapped.status);
  });

  app.route("/api/auth", authRoutes);
  app.route("/api/w", workspaceRoutes);
  app.route("/api/w", bundleRoutes);
  app.route("/api/s", shareBundleRoutes);
  app.route("/api/api-keys", apiKeyRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/setup", setupRoutes);
  app.route("/api/mcp", mcpRoutes);
  app.route("/api/upload", uploadRoutes);

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
