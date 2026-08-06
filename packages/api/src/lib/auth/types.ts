export type { AuthUser } from "@evidence-browser/shared/api/types";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
}
