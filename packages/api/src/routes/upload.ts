import { Hono } from "hono";
import { uploadBundleFromMultipart } from "@/lib/bundle/upload-service";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { verifyUploadToken } from "@/lib/upload-token";

const upload = new Hono();

upload.post("/:token", async (c) => {
  const verified = verifyUploadToken(c.req.param("token"));
  if (!verified.ok) return c.json({ error: "Invalid or expired upload token" }, 401);

  const workspace = findWorkspaceBySlug(verified.payload.ws);
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);

  const result = await uploadBundleFromMultipart({
    request: c.req.raw,
    workspace,
    uploadedBy: verified.payload.uid,
    pinnedBundleId: verified.payload.b,
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ bundle: result.bundle }, result.status);
});

export const uploadRoutes = upload;
