import { randomUUID } from "crypto";
import { getEnv } from "@/config/env";
import {
  createUser,
  findUserById,
  findUserByUsername,
  updateUserRole,
} from "@/lib/db/users";
import type { AuthUser } from "./types";

export const AUTH_BYPASS_USERNAME = "__auth_bypass_admin__";

export const AUTH_BYPASS_WARNING =
  "⚠ AUTH_BYPASS enabled — all requests run as admin. Do NOT expose this instance to an untrusted network.";

let cachedBypassUser: AuthUser | null = null;

export function isAuthBypassEnabled(): boolean {
  return getEnv().AUTH_BYPASS;
}

export function isAuthBypassUserId(userId: string): boolean {
  return findUserById(userId)?.username === AUTH_BYPASS_USERNAME;
}

export async function getAuthBypassUser(): Promise<AuthUser> {
  if (cachedBypassUser) return cachedBypassUser;

  const existing = findUserByUsername(AUTH_BYPASS_USERNAME);
  if (existing) {
    if (existing.role !== "user") {
      updateUserRole(existing.id, "user");
    }
    cachedBypassUser = {
      id: existing.id,
      username: existing.username,
      role: "admin",
    };
    return cachedBypassUser;
  }

  try {
    const user = await createUser(AUTH_BYPASS_USERNAME, randomUUID(), "user");
    cachedBypassUser = { id: user.id, username: user.username, role: "admin" };
    return cachedBypassUser;
  } catch (error) {
    const user = findUserByUsername(AUTH_BYPASS_USERNAME);
    if (user) {
      cachedBypassUser = { id: user.id, username: user.username, role: "admin" };
      return cachedBypassUser;
    }
    throw error;
  }
}

/** Reset cached bypass identity between isolated test databases. */
export function resetAuthBypassUserCache(): void {
  cachedBypassUser = null;
}
