import { serve } from "@hono/node-server";
import { getEnv } from "@/config/env";
import { createApp } from "@/app";
import { AUTH_BYPASS_WARNING } from "@/lib/auth/bypass";

const app = createApp();
const { PORT = 3000, HOSTNAME = "0.0.0.0" } = process.env as { PORT?: string; HOSTNAME?: string };
const env = getEnv();
if (env.AUTH_BYPASS) {
  console.warn(`\n${AUTH_BYPASS_WARNING}\n`);
}

serve({
  fetch: app.fetch,
  port: Number(PORT),
  hostname: HOSTNAME,
});
