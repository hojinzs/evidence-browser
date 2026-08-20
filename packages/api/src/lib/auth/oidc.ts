import { randomUUID } from "crypto";
import * as client from "openid-client";
import { getEnv } from "@/config/env";
import { signSessionId, verifySignedCookie } from "@/lib/auth";
import {
  createPasswordlessUser,
  countAdmins,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  updateUserRole,
  type User,
} from "@/lib/db/users";
import { findIdentity, linkIdentity } from "@/lib/db/identities";
import type { AuthUser } from "@/lib/auth/types";

const OIDC_PROVIDER = "oidc";
const TX_TTL_SECONDS = 600;

type OidcConfig = Awaited<ReturnType<typeof client.discovery>>;

let cachedDiscovery:
  | { issuer: string; clientId: string; redirectUri: string; config: OidcConfig }
  | null = null;

export interface OidcClaims {
  sub: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  groups: string[];
}

export interface OidcTx {
  state: string;
  nonce: string;
  codeVerifier: string;
  callbackUrl: string;
  exp: number;
}

export class OidcDiscoveryError extends Error {
  constructor(message = "OIDC discovery failed") {
    super(message);
    this.name = "OidcDiscoveryError";
  }
}

export class OidcResolutionError extends Error {
  readonly status: 403;
  readonly redirectTo: string;

  constructor(message = "OIDC user is not allowed") {
    super(message);
    this.name = "OidcResolutionError";
    this.status = 403;
    this.redirectTo = "/login?error=oidc_forbidden";
  }
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeUsername(value: string | undefined, fallback: string): string {
  const source = value?.trim() || fallback;
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "oidc-user";
}

function normalizeEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function parseGroupsClaim(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, username: user.username, role: user.role };
}

function roleFromClaims(claims: OidcClaims): "admin" | "user" | undefined {
  const adminGroup = getEnv().OIDC_ADMIN_GROUP;
  if (!adminGroup) return undefined;
  return claims.groups.includes(adminGroup) ? "admin" : "user";
}

function syncUserRole(user: User, claims: OidcClaims): AuthUser {
  const nextRole = roleFromClaims(claims);
  if (!nextRole || user.role === nextRole) return toAuthUser(user);

  if (
    user.role === "admin" &&
    nextRole === "user" &&
    countAdmins({ excludeUsername: user.username }) === 0
  ) {
    return toAuthUser(user);
  }

  updateUserRole(user.id, nextRole);
  return { id: user.id, username: user.username, role: nextRole };
}

function hasAllowedGroup(claims: OidcClaims): boolean {
  const allowedGroups = splitCsv(getEnv().OIDC_ALLOWED_GROUPS);
  if (allowedGroups.length === 0) return true;
  return claims.groups.some((group) => allowedGroups.includes(group));
}

function uniqueUsername(preferred: string | undefined, sub: string): string {
  const base = normalizeUsername(preferred, `oidc-${sub.slice(0, 12)}`);
  if (!findUserByUsername(base)) return base;

  for (let index = 2; index < 1000; index++) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!findUserByUsername(candidate)) return candidate;
  }

  return `${base.slice(0, 48)}-${randomUUID().slice(0, 8)}`;
}

async function getOidcConfig(): Promise<OidcConfig> {
  const env = getEnv();
  const issuer = env.OIDC_ISSUER;
  const clientId = env.OIDC_CLIENT_ID;
  const clientSecret = env.OIDC_CLIENT_SECRET;
  const redirectUri = env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    throw new OidcDiscoveryError("OIDC is not fully configured");
  }

  if (
    cachedDiscovery?.issuer === issuer &&
    cachedDiscovery.clientId === clientId &&
    cachedDiscovery.redirectUri === redirectUri
  ) {
    return cachedDiscovery.config;
  }

  try {
    const config = await client.discovery(
      new URL(issuer),
      clientId,
      {
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ["code"],
      },
      client.ClientSecretPost(clientSecret)
    );
    cachedDiscovery = { issuer, clientId, redirectUri, config };
    return config;
  } catch (error) {
    throw new OidcDiscoveryError(
      error instanceof Error ? error.message : "OIDC discovery failed"
    );
  }
}

export function sanitizeCallbackUrl(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

export async function buildAuthorizationUrl(): Promise<{
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}> {
  const env = getEnv();
  const config = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: env.OIDC_REDIRECT_URI ?? "",
    scope: env.OIDC_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return { url, state, nonce, codeVerifier };
}

export async function handleCallback(currentUrl: URL, tx: OidcTx): Promise<OidcClaims> {
  const env = getEnv();
  const config = await getOidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    expectedState: tx.state,
    expectedNonce: tx.nonce,
    pkceCodeVerifier: tx.codeVerifier,
  });
  const claims = tokens.claims();
  if (!claims?.sub) {
    throw new Error("OIDC ID token missing sub claim");
  }

  return {
    sub: claims.sub,
    preferred_username:
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : undefined,
    email: typeof claims.email === "string" ? claims.email : undefined,
    email_verified: claims.email_verified === true,
    groups: parseGroupsClaim(claims[env.OIDC_GROUPS_CLAIM]),
  };
}

export function signOidcTx(
  tx: Omit<OidcTx, "exp">,
  now = Math.floor(Date.now() / 1000)
): string {
  const payload: OidcTx = { ...tx, callbackUrl: sanitizeCallbackUrl(tx.callbackUrl), exp: now + TX_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return signSessionId(encoded);
}

export function verifyOidcTx(value: string | undefined | null): OidcTx | null {
  if (!value) return null;
  const encoded = verifySignedCookie(value);
  if (!encoded) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OidcTx;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.callbackUrl !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return { ...parsed, callbackUrl: sanitizeCallbackUrl(parsed.callbackUrl) };
  } catch {
    return null;
  }
}

export async function resolveOidcUser(claims: OidcClaims): Promise<AuthUser> {
  if (!hasAllowedGroup(claims)) {
    throw new OidcResolutionError();
  }

  const identity = findIdentity(OIDC_PROVIDER, claims.sub);
  if (identity) {
    const user = findUserById(identity.user_id);
    if (!user) throw new OidcResolutionError("OIDC identity user was not found");
    return syncUserRole(user, claims);
  }

  const email = normalizeEmail(claims.email);
  if (getEnv().OIDC_LINK_BY_VERIFIED_EMAIL && claims.email_verified && email) {
    const user = findUserByEmail(email);
    if (user) {
      linkIdentity(user.id, OIDC_PROVIDER, claims.sub, email);
      return syncUserRole(user, claims);
    }
  }

  if (getEnv().OIDC_AUTO_PROVISION) {
    const role = roleFromClaims(claims) ?? "user";
    const created = createPasswordlessUser({
      username: uniqueUsername(claims.preferred_username, claims.sub),
      email,
      role,
    });
    linkIdentity(created.id, OIDC_PROVIDER, claims.sub, email);
    return { id: created.id, username: created.username, role: created.role };
  }

  throw new OidcResolutionError();
}

export function resetOidcDiscoveryCache(): void {
  cachedDiscovery = null;
}
