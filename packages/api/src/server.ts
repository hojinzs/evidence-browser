import { serve } from "@hono/node-server";
import { getEnv } from "@/config/env";
import { createApp } from "@/app";
import { AUTH_BYPASS_WARNING } from "@/lib/auth/bypass";
import { closeDb } from "@/lib/db";
import { clearBundleCache } from "@/lib/bundle/extractor";

const app = createApp();
const { PORT = 3000, HOSTNAME = "0.0.0.0" } = process.env as { PORT?: string; HOSTNAME?: string };
const env = getEnv();
if (env.AUTH_BYPASS) {
  console.warn(`\n${AUTH_BYPASS_WARNING}\n`);
}

const port = Number(PORT);

async function main() {
  await clearBundleCache();

  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: HOSTNAME,
    },
    () => {
      console.log(
        JSON.stringify({
          level: "info",
          event: "server_start",
          host: HOSTNAME,
          port,
          env: env.NODE_ENV,
        })
      );
    }
  );

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(JSON.stringify({ level: "info", event: "server_shutdown", signal }));

    const timeout = setTimeout(() => {
      closeDb();
      process.exit(1);
    }, 10_000);
    timeout.unref();

    server.close(() => {
      clearTimeout(timeout);
      closeDb();
      process.exit(0);
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_start_failed",
      message: error instanceof Error ? error.message : String(error),
    })
  );
  closeDb();
  process.exit(1);
});
