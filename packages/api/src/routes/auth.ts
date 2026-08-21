import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getEnv } from "@/config/env";
import {
  login,
  logout,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  signSessionId,
  validateSession,
} from "@/lib/auth";
import { SESSION_TTL_SECONDS } from "@/lib/auth/types";
import { getAuthBypassUser, isAuthBypassEnabled } from "@/lib/auth/bypass";
import { createSession as dbCreateSession } from "@/lib/db/sessions";
import {
  buildAuthorizationUrl,
  handleCallback,
  OidcDiscoveryError,
  OidcResolutionError,
  resolveOidcUser,
  sanitizeCallbackUrl,
  signOidcTx,
  verifyOidcTx,
} from "@/lib/auth/oidc";

const auth = new Hono();
const OIDC_TX_COOKIE_NAME = "eb_oidc_tx";

function oidcEnabled(): boolean {
  return getEnv().OIDC_ENABLED;
}

function clearOidcTxCookie(headers: Headers): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${OIDC_TX_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

auth.get("/config", (c) => {
  const env = getEnv();
  return c.json({
    local: env.AUTH_LOCAL_ENABLED,
    oidc: {
      enabled: env.OIDC_ENABLED,
      label: env.OIDC_BUTTON_LABEL,
    },
  });
});

auth.post("/login", async (c) => {
  if (!getEnv().AUTH_LOCAL_ENABLED) {
    return c.json({ error: "Local login is disabled" }, 403);
  }

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
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  return c.json({ user: result.user });
});

auth.get("/oidc/start", async (c) => {
  if (!oidcEnabled()) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    const callbackUrl = sanitizeCallbackUrl(c.req.query("callbackUrl"));
    const tx = await buildAuthorizationUrl();
    const signedTx = signOidcTx({
      state: tx.state,
      nonce: tx.nonce,
      codeVerifier: tx.codeVerifier,
      callbackUrl,
    });

    setCookie(c, OIDC_TX_COOKIE_NAME, signedTx, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
    });
    return c.redirect(tx.url.toString(), 302);
  } catch (error) {
    if (error instanceof OidcDiscoveryError) {
      return c.json({ error: "OIDC discovery unavailable" }, 503);
    }
    throw error;
  }
});

auth.get("/oidc/callback", async (c) => {
  if (!oidcEnabled()) {
    return c.json({ error: "Not found" }, 404);
  }

  const tx = verifyOidcTx(getCookie(c, OIDC_TX_COOKIE_NAME));
  if (!tx) {
    const response = c.redirect("/login?error=oidc_failed", 302);
    clearOidcTxCookie(response.headers);
    return response;
  }

  try {
    const claims = await handleCallback(new URL(c.req.url), tx);
    const user = await resolveOidcUser(claims);
    const session = dbCreateSession(user.id);
    const response = c.redirect(tx.callbackUrl, 302);
    setSessionCookie(response.headers, signSessionId(session.id));
    clearOidcTxCookie(response.headers);
    return response;
  } catch (error) {
    const redirectTo =
      error instanceof OidcResolutionError
        ? error.redirectTo
        : "/login?error=oidc_failed";
    const response = c.redirect(redirectTo, 302);
    clearOidcTxCookie(response.headers);
    return response;
  }
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
