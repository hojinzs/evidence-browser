export type { AuthUser } from "@evidence-browser/shared/api/types";

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
}
