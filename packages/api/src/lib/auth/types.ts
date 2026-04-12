export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
}
