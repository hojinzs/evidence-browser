import { serve } from "@hono/node-server";
import { getEnv } from "@/config/env";
import { createApp } from "@/app";

const app = createApp();
const { PORT = 3000, HOSTNAME = "0.0.0.0" } = process.env as { PORT?: string; HOSTNAME?: string };
getEnv();

serve({
  fetch: app.fetch,
  port: Number(PORT),
  hostname: HOSTNAME,
});
