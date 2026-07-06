import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { createTestDb } from "@/lib/db/index";
import { findSession } from "@/lib/db/sessions";
import { createUser } from "@/lib/db/users";
import { login, signSessionId, verifySignedCookie } from "./index";

let testDb: Database.Database;

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

describe("auth session signing and login", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    testDb = createTestDb();
    process.env.AUTH_SECRET = "test-auth-secret-for-signing";
    resetEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    testDb.close();
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
    resetEnv();
  });

  it("round-trips signed session IDs through cookie verification", () => {
    const sessionId = "session-123";

    const signed = signSessionId(sessionId);

    expect(signed).toMatch(/^session-123\.[a-f0-9]{64}$/);
    expect(verifySignedCookie(signed)).toBe(sessionId);
  });

  it("rejects tampered, malformed, and wrong-length signed cookies", () => {
    const signed = signSessionId("session-123");
    const lastChar = signed.at(-1);
    const tampered = `${signed.slice(0, -1)}${lastChar === "0" ? "1" : "0"}`;

    expect(verifySignedCookie(tampered)).toBeNull();
    expect(verifySignedCookie("session-123-without-dot")).toBeNull();
    expect(verifySignedCookie("session-123.abc")).toBeNull();
  });

  it("returns null for invalid passwords", async () => {
    await createUser("admin", "correct-password", "admin");

    await expect(login("admin", "wrong-password")).resolves.toBeNull();
  });

  it("returns a signed session and public user on successful login", async () => {
    const user = await createUser("admin", "correct-password", "admin");

    const result = await login("admin", "correct-password");

    expect(result).not.toBeNull();
    expect(result?.user).toEqual({
      id: user.id,
      username: "admin",
      role: "admin",
    });
    expect(result?.user).not.toHaveProperty("password");

    const sessionId = verifySignedCookie(result!.signedSessionId);
    expect(sessionId).toEqual(expect.any(String));
    expect(findSession(sessionId!)).toMatchObject({
      id: sessionId,
      user_id: user.id,
    });
  });
});
