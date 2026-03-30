import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";

const providers: Provider[] = [];

// Only add OIDC provider when not in bypass mode
if (process.env.AUTH_BYPASS !== "true") {
  providers.push({
    id: "oidc",
    name: process.env.OIDC_PROVIDER_NAME ?? "OIDC",
    type: "oidc",
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  } as Provider);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
});
