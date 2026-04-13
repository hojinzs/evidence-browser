import { Hono } from "hono";

export const healthRoutes = new Hono().get("/", (c) => c.json({ status: "ok" }));
