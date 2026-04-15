import type Database from "better-sqlite3";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../lib/db/index";

let testDb: Database.Database;

vi.mock("../lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

import { createApiKey } from "../lib/db/api-keys";
import { createWorkspace, findWorkspaceById } from "../lib/db/workspaces";
import { createUser } from "../lib/db/users";
import { workspaceRoutes } from "./workspace";

async function setup() {
  testDb = createTestDb();

  const admin = await createUser("admin", "password123", "admin");
  const member = await createUser("member", "password123", "user");
  const workspace = createWorkspace("infra", "Infrastructure", "Old description", admin.id);
  const adminKey = createApiKey(admin.id, "admin key", "admin").key;
  const readKey = createApiKey(member.id, "read key", "read").key;

  return { admin, member, workspace, adminKey, readKey };
}

function createTestApp() {
  const app = new Hono();
  app.route("/api/w", workspaceRoutes);
  return app;
}

function patchWorkspace(
  app: ReturnType<typeof createTestApp>,
  id: string,
  body: Record<string, unknown> | undefined,
  authorization?: string
) {
  return app.request(`/api/w/${id}`, {
    method: "PATCH",
    headers: {
      ...(authorization ? { authorization } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("workspace routes", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("requires authentication and admin scope", async () => {
    const { workspace, readKey } = await setup();
    const app = createTestApp();

    const unauthenticated = await patchWorkspace(app, workspace.id, { name: "New Name" });
    expect(unauthenticated.status).toBe(401);

    const forbidden = await patchWorkspace(
      app,
      workspace.id,
      { name: "New Name" },
      `Bearer ${readKey}`
    );
    expect(forbidden.status).toBe(403);
  });

  it("validates request bodies", async () => {
    const { workspace, adminKey } = await setup();
    const app = createTestApp();

    const empty = await patchWorkspace(app, workspace.id, {}, `Bearer ${adminKey}`);
    expect(empty.status).toBe(400);

    const extraField = await patchWorkspace(
      app,
      workspace.id,
      { name: "New Name", slug: "infra-2" },
      `Bearer ${adminKey}`
    );
    expect(extraField.status).toBe(400);

    const invalidName = await patchWorkspace(
      app,
      workspace.id,
      { name: "   " },
      `Bearer ${adminKey}`
    );
    expect(invalidName.status).toBe(400);

    const invalidDescription = await patchWorkspace(
      app,
      workspace.id,
      { description: 123 },
      `Bearer ${adminKey}`
    );
    expect(invalidDescription.status).toBe(400);
  });

  it("returns 404 for missing workspaces", async () => {
    const { adminKey } = await setup();
    const app = createTestApp();

    const res = await patchWorkspace(app, "missing-workspace-id", { name: "Updated" }, `Bearer ${adminKey}`);
    expect(res.status).toBe(404);
  });

  it("updates workspace name and description", async () => {
    const { workspace, adminKey } = await setup();
    const app = createTestApp();

    const res = await patchWorkspace(
      app,
      workspace.id,
      { name: "Updated Infrastructure", description: "Updated description" },
      `Bearer ${adminKey}`
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { workspace: { id: string; name: string; description: string; updated_at: string } };
    expect(payload.workspace.id).toBe(workspace.id);
    expect(payload.workspace.name).toBe("Updated Infrastructure");
    expect(payload.workspace.description).toBe("Updated description");

    const stored = findWorkspaceById(workspace.id);
    expect(stored).toBeDefined();
    expect(stored!.name).toBe("Updated Infrastructure");
    expect(stored!.description).toBe("Updated description");
  });

  it("supports partial updates", async () => {
    const { workspace, adminKey } = await setup();
    const app = createTestApp();

    const res = await patchWorkspace(
      app,
      workspace.id,
      { name: "Renamed only" },
      `Bearer ${adminKey}`
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { workspace: { name: string; description: string } };
    expect(payload.workspace).toMatchObject({
      name: "Renamed only",
      description: "Old description",
    });
  });
});
