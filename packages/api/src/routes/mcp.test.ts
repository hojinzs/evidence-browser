import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { createApiKey } from "@/lib/db/api-keys";
import { createTestDb } from "@/lib/db/index";
import { createUser } from "@/lib/db/users";
import { checkAuth, resolveMcpAuthContext } from "./mcp";

let testDb: Database.Database;

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
  resetEnv();
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("MCP route auth", () => {
  beforeEach(() => {
    testDb = createTestDb();
    process.env.AUTH_BYPASS = "false";
    delete process.env.MCP_API_KEY;
    resetEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns 401 for an invalid eb_ API key", () => {
    const request = new Request("http://localhost/api/mcp", {
      headers: bearer("eb_invalid"),
    });

    expect(checkAuth(request)?.status).toBe(401);
  });

  it("resolves API-key auth context with the key scope", async () => {
    const user = await createUser("member", "password123", "user");
    const key = createApiKey(user.id, "read key", "read").key;
    const request = new Request("http://localhost/api/mcp", {
      headers: bearer(key),
    });

    const authContext = await resolveMcpAuthContext(request);

    expect(authContext).toMatchObject({
      kind: "api-key",
      scope: "read",
      user: {
        id: user.id,
        role: "user",
      },
    });
  });

  it("resolves MCP_API_KEY callers as read-only instance access", async () => {
    process.env.MCP_API_KEY = "mcp-secret";
    resetEnv();
    const missing = new Request("http://localhost/api/mcp");
    const valid = new Request("http://localhost/api/mcp", {
      headers: bearer("mcp-secret"),
    });

    expect(checkAuth(missing)?.status).toBe(401);
    await expect(resolveMcpAuthContext(valid)).resolves.toEqual({
      kind: "instance-key",
    });
  });
});
