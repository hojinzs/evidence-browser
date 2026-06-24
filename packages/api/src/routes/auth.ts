import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { login, logout, SESSION_COOKIE_NAME, validateSession } from "@/lib/auth";
import { getAuthBypassUser, isAuthBypassEnabled } from "@/lib/auth/bypass";

const auth = new Hono();

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  const result = await login(body.username, body.password);
  if (!result) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  setCookie(c, SESSION_COOKIE_NAME, result.signedSessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 7 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });

  return c.json({ user: result.user });
});

auth.post("/logout", (c) => {
  const cookie = getCookie(c, SESSION_COOKIE_NAME);
  if (cookie) logout(cookie);
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  if (isAuthBypassEnabled()) {
    return c.json({ user: await getAuthBypassUser() });
  }

  const cookie = getCookie(c, SESSION_COOKIE_NAME);
  if (!cookie) return c.json({ error: "Unauthorized" }, 401);

  const user = validateSession(cookie);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user });
});

export const authRoutes = auth;
