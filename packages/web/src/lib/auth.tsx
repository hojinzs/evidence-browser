import { createContext, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.me(),
    retry: false,
  });

  const value = useMemo<AuthContextValue>(() => ({
    user: meQuery.data?.user ?? null,
    isLoading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data?.user),
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  }), [meQuery.data?.user, meQuery.isLoading, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
