import { randomUUID } from "crypto";
import { getEnv } from "@/config/env";
import { createUser, findUserByUsername, updateUserRole } from "@/lib/db/users";
import type { AuthUser } from "./types";

const AUTH_BYPASS_USERNAME = "__auth_bypass_admin__";

export const AUTH_BYPASS_WARNING =
  "⚠ AUTH_BYPASS enabled — all requests run as admin. Do NOT expose this instance to an untrusted network.";

export function isAuthBypassEnabled(): boolean {
  return getEnv().AUTH_BYPASS;
}

export async function getAuthBypassUser(): Promise<AuthUser> {
  const existing = findUserByUsername(AUTH_BYPASS_USERNAME);
  if (existing) {
    if (existing.role !== "admin") {
      updateUserRole(existing.id, "admin");
    }
    return { id: existing.id, username: existing.username, role: "admin" };
  }

  try {
    const user = await createUser(AUTH_BYPASS_USERNAME, randomUUID(), "admin");
    return { id: user.id, username: user.username, role: user.role };
  } catch (error) {
    const user = findUserByUsername(AUTH_BYPASS_USERNAME);
    if (user) return { id: user.id, username: user.username, role: "admin" };
    throw error;
  }
}
