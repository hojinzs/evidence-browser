import { describe, expect, it } from "vitest";
import { envSchema } from "./env";

describe("env schema", () => {
  it("parses the default config unchanged", () => {
    const result = envSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      AUTH_LOCAL_ENABLED: true,
      OIDC_ENABLED: false,
      OIDC_SCOPES: "openid profile email",
      OIDC_GROUPS_CLAIM: "groups",
      OIDC_AUTO_PROVISION: true,
      OIDC_LINK_BY_VERIFIED_EMAIL: false,
      OIDC_BUTTON_LABEL: "Sign in with SSO",
    });
  });

  it("parses a valid OIDC config", () => {
    const result = envSchema.safeParse({
      OIDC_ENABLED: "true",
      OIDC_ISSUER: "https://auth.example.com/application/o/evidence/",
      OIDC_CLIENT_ID: "client-id",
      OIDC_CLIENT_SECRET: "client-secret",
      OIDC_REDIRECT_URI: "https://app.example.com/api/auth/oidc/callback",
      OIDC_ADMIN_GROUP: "admins",
      OIDC_ALLOWED_GROUPS: "admins,users",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      OIDC_ENABLED: true,
      OIDC_CLIENT_ID: "client-id",
      OIDC_ADMIN_GROUP: "admins",
      OIDC_ALLOWED_GROUPS: "admins,users",
    });
  });

  it("rejects enabled OIDC without an issuer", () => {
    const result = envSchema.safeParse({
      OIDC_ENABLED: "true",
      OIDC_CLIENT_ID: "client-id",
      OIDC_CLIENT_SECRET: "client-secret",
      OIDC_REDIRECT_URI: "https://app.example.com/api/auth/oidc/callback",
    });

    expect(result.success).toBe(false);
  });

  it("rejects disabling local auth while OIDC is disabled", () => {
    const result = envSchema.safeParse({
      AUTH_LOCAL_ENABLED: "false",
      OIDC_ENABLED: "false",
    });

    expect(result.success).toBe(false);
  });
});
