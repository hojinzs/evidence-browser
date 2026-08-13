# SPEC-001: MCP Agent Access — Read Tools + Capability-URL Upload

| | |
|---|---|
| **Status** | Draft |
| **Epic** | [#153](https://github.com/hojinzs/evidence-browser/issues/153) |
| **Created** | 2026-08-13 |
| **Owner** | hojinzs |

Status lifecycle: `Draft` → `In Progress` (first WP merged) → `Adopted` (WP4 merged; epic closes).

This document is the single source of truth for the E9 epic. Work-package issues link to
sections here and must not duplicate the contract. **Every implementation PR that deviates
from this spec updates the affected section and appends a Delta Log row in the same PR.**

## Delta Log

| Date | PR | Change |
|------|----|--------|
| 2026-08-13 | — | Initial draft |

---

## 1. Background & Decision

Evidence Browser exposes two programmatic surfaces today:

- The **`eb` CLI** (`packages/cli`) — full-featured: auth, workspace CRUD, bundle
  create/validate/upload/info/tree/download, API-key management.
- A **remote MCP endpoint** at `POST /api/mcp` (Streamable HTTP, stateless;
  `packages/api/src/routes/mcp.ts`, `packages/api/src/lib/mcp/server.ts`) — five
  informational tools only (`get_bundle_schema`, `get_storage_info`,
  `get_upload_instructions`, `list_workspaces`, `list_bundles`) plus the
  `evidence://llm.txt` resource.

Two things changed:

**Purpose shift.** The MCP surface was designed for one consumer story: *an agent wants to
upload its work evidence and needs instructions*. The consumer story now includes
judgment: *an agent wants to inspect prior history and other agents' uploaded work
(bundle contents, not just bundle listings) to inform its own decisions.* The remote MCP
has no bundle-content access; only the CLI and web UI do.

**Upload over MCP.** MCP tool payloads cannot reasonably carry ZIP bytes (base64 blows up
context and payload limits for bundles containing screenshots). Decision: a
`create_upload_url` tool that mints a **short-lived, HMAC-signed capability URL against
our own upload endpoint** — the presigned-URL pattern, self-hosted ("lightweight
presigned"). The bytes still flow through the existing multipart upload pipeline, so ZIP
validation and DB recording are unchanged and behavior is identical for `local` and `s3`
storage. The value is credential scoping: the MCP connection holds the durable auth; the
agent only ever touches a single-purpose, expiring URL.

**Security gate.** The MCP route currently authenticates `eb_` API keys by existence only
(`checkAuth` → `getApiKeyUser`) and ignores the key's scope; `MCP_API_KEY` grants blanket
access. The scope system (`read | upload | admin`, `requireScope` in
`packages/api/src/middleware/auth.ts`) already exists and is enforced on REST routes.
Scope enforcement on MCP must land **before** any write-capable tool.

## 2. Goals

- **G1** — Per-tool scope enforcement on `/api/mcp`, reusing the existing auth helpers
  (no third auth implementation). → [WP1 #154](https://github.com/hojinzs/evidence-browser/issues/154)
- **G2** — Bundle upload for MCP-connected agents via short-lived signed capability URLs,
  preserving the existing validation pipeline. → [WP2 #155](https://github.com/hojinzs/evidence-browser/issues/155)
- **G3** — Bundle-content read tools so agents can inspect prior/others' work through MCP
  alone. → [WP3 #156](https://github.com/hojinzs/evidence-browser/issues/156)
- **G4** — This spec reconciled to shipped reality and flipped to `Adopted`.
  → [WP4 #157](https://github.com/hojinzs/evidence-browser/issues/157)

## 3. Non-Goals

- **S3 direct presigned URLs.** Bundle sizes (markdown + screenshots) do not yet justify
  offloading upload bandwidth from the API server, and direct-to-S3 requires a
  create/put/finalize protocol plus orphan cleanup. The capability-URL interface is
  forward-compatible with it (the agent contract stays "receive URL, PUT/POST bytes"), so
  it can be added later without breaking consumers.
- **`eb mcp` stdio server in the CLI.** A local stdio MCP would serve no-shell hosts
  (zip + upload from the local filesystem). Deferred; revisit after this epic ships.
- **Single-use / revocable upload tokens.** v1 tokens are stateless HMAC with a short TTL
  (§4.2). If revocation or one-shot semantics become necessary, follow the existing
  DB-backed `bundle_share_tokens` pattern (hashed, listable, revocable).
- **Frontend changes.** No web UI work in this epic.
- **MCP write tools beyond upload-URL minting** (workspace CRUD, bundle delete, API-key
  management over MCP). The CLI remains the surface for those.

## 4. Design

### 4.1 Scope enforcement on `/api/mcp` (WP1 · #154)

Today `createMcpServer()` takes no arguments and tool handlers run with no caller
identity. The transport is already constructed per-request with
`sessionIdGenerator: undefined`, so per-request context is cheap.

**Contract:**

- `checkAuth` resolves an **auth context** — `{ kind: "api-key", user, scope }` |
  `{ kind: "instance-key" }` | `{ kind: "bypass" }` — and passes it to
  `createMcpServer(authContext)`. Token parsing and key verification reuse
  `extractBearerToken` / `authenticateApiKey` from `middleware/auth.ts`.
- Each tool declares a required capability, checked in the handler before any work.
  Insufficient scope returns an in-protocol tool error (`isError: true`) naming the
  required scope — not a transport-level 403, since the MCP handshake has already
  succeeded.

**Per-tool capability table** (updated by WP2/WP3 as tools land):

| Tool | Required |
|------|----------|
| `get_bundle_schema`, `get_upload_instructions`, `get_storage_info` | any authenticated caller |
| `list_workspaces`, `list_bundles` | read access |
| read tools (§4.3) | read access |
| `create_upload_url` (§4.2) | **write access** |

Where: *read access* = `eb_` key with `read \| upload \| admin`, or `MCP_API_KEY`, or
bypass; *write access* = `eb_` key with `upload \| admin`, or bypass. **`MCP_API_KEY` is
downgraded to read-only** — it is an instance-level shared secret with no user identity,
so it cannot mint upload URLs (§4.2 records an issuer). `AUTH_BYPASS=true` keeps full
access (dev/test only, unchanged).

Transport-level auth (401 for missing/invalid credentials) is unchanged.

### 4.2 `create_upload_url` tool + signed upload route (WP2 · #155)

**MCP tool:**

```
create_upload_url({
  workspace: string,        // workspace slug (must exist)
  bundleId?: string,        // optional; pins the bundle ID (validated by the shared bundleId validator)
  ttlSeconds?: number       // default 600, max 3600
})
→ {
  uploadUrl: string,        // absolute URL: {origin}/api/upload/{token}
  method: "POST",           // multipart/form-data, field "file" (+ optional "bundleId" if not pinned)
  expiresAt: string,        // ISO-8601
  instructions: string      // one-paragraph curl example for the consuming agent
}
```

Requires write access (§4.1). Unknown workspace → tool error before minting.

**Token format** — stateless, HMAC-SHA256 with `AUTH_SECRET` (same secret and
constant-time-compare discipline as `signSessionId`/`verifySignedSessionId` in
`lib/auth/index.ts`; the signing helper is generalized or paralleled, not duplicated):

```
ebu1.<base64url(payload-json)>.<base64url(hmac-sha256(payload))>

payload: {
  v: 1,
  ws: string,            // workspace slug — the token is workspace-bound
  b?: string,            // optional pinned bundleId
  uid: string,           // issuing user id — recorded as uploader
  exp: number            // unix seconds
}
```

No DB row, no new env vars. Rotating `AUTH_SECRET` invalidates outstanding tokens (and
sessions) — acceptable for ≤1h TTLs.

**Upload route** — `POST /api/upload/:token`:

1. Parse + verify signature (constant-time) → 401 on malformed/tampered.
2. `exp` check → 401 on expired.
3. Resolve workspace by slug → 404 if since deleted.
4. Delegate to the **same** multipart handling + validation pipeline as
   `POST /api/w/:ws/bundle` (`lib/bundle/upload-validation.ts` and the existing route
   internals — extracted into a shared handler, not copied). Size/count limits
   (`MAX_BUNDLE_SIZE`, `MAX_FILE_COUNT`, `MAX_SINGLE_FILE_SIZE`) apply unchanged.
5. Uploader recorded as `payload.uid`. If `payload.b` is set it wins over any form field;
   mismatched form `bundleId` → 400.

The route itself performs no session/API-key auth — the token *is* the authorization
(capability URL). It must be mounted outside the `authenticate` middleware chain.

### 4.3 Read tools (WP3 · #156)

Purpose: an agent connected only to MCP can orient itself in a bundle and read its
contents. All tools require read access (§4.1) and **reuse the DB-guarded bundle read
path** — the same libs behind `GET /api/w/:ws/bundles/:bundleId/{meta,tree,file}`
(workspace/bundle resolved via DB, extractor security guards intact). No new extraction
or path-resolution logic.

- **`get_bundle_overview(workspace, bundleId)`** — one-call orientation: manifest,
  upload metadata (uploader, createdAt, size), full file tree, and the manifest's `index`
  file content inline. Serialized llm-oriented (extending the `lib/mcp/llm-text.ts`
  approach), not raw JSON-of-everything.
- **`get_bundle_tree(workspace, bundleId)`** — file tree only.
- **`read_bundle_file(workspace, bundleId, path)`** — content of one text file.
  Size cap: 256 KB inline; larger files and binary types return metadata (size, detected
  type) plus the web URL (`/w/{ws}/b/{bundleId}/f?path=...`) instead of bytes.
- **`list_bundles` filters** — optional `uploadedBy`, `since`, `until` (ISO-8601),
  `limit` (default 50, max 200), enabling judgment queries like "what did the QA agent
  upload this week".

The `llm.txt` guide (`generateLlmText`) is updated in the same WP to list the final tool
set and the capability requirements.

## 5. Security Requirements

- Scope table (§4.1) enforced on every tool; no tool executes work before the check.
- Auth reuses `extractBearerToken` / `authenticateApiKey`; `MCP_API_KEY` comparison stays
  constant-time (`timingSafeEqual`). No new parallel auth implementation.
- Upload token: constant-time signature verification; `exp` mandatory; TTL capped at
  3600s; payload carries no secrets; workspace-bound; issuer recorded for audit.
- Token upload route feeds the unmodified validation pipeline (bounded ZIP validation,
  extractor traversal/size/count guards).
- `read_bundle_file` path handling goes through the existing extractor security guards
  (`lib/bundle/security.ts`); traversal attempts must be covered by tests.
- Error responses from MCP tools must not leak storage paths or config beyond what
  `get_storage_info` already intentionally exposes.

## 6. Acceptance Criteria

Each WP passes the standard team cycle (backend-engineer → code-reviewer → qa-engineer
with a `.evidence/{session}` bundle uploaded and verified).

**WP1 (#154)**
- [ ] Tool handlers receive an auth context; per-tool capability table enforced.
- [ ] `MCP_API_KEY` callers can invoke read/informational tools but no write tool.
- [ ] Tests: 401 invalid key; scope-denial tool error; read-scope happy path; bypass mode.

**WP2 (#155)**
- [ ] `create_upload_url` denied without write access; happy path returns a working URL.
- [ ] Token tests: round-trip, expiry, payload tamper, signature tamper, workspace
      binding, pinned-bundleId conflict → 400.
- [ ] End-to-end: bundle uploaded via minted URL passes validation, is DB-recorded with
      the issuer as uploader, and renders in the web UI.
- [ ] QA dogfoods the full flow over MCP (mint → curl upload → verify render).

**WP3 (#156)**
- [ ] Overview/tree/file tools work against an uploaded bundle; not-found and traversal
      cases covered; binary/oversize fallback returns metadata + URL.
- [ ] `list_bundles` filters behave as specified.
- [ ] QA dogfoods: answers a content question about a previously uploaded bundle using
      only MCP tools.

**WP4 (#157)**
- [ ] Spec reconciled with shipped behavior; Status → `Adopted`; delta log complete.
- [ ] AGENTS.md / CHANGELOG / README-CLI docs updated. **Merge closes epic #153.**

## 7. Rollout

- No DB schema migration (tokens are stateless).
- No new env vars; `AUTH_SECRET` production guard already exists in `config/env.ts`.
- MCP server version bumps `0.2.0` → `0.3.0` when WP2/WP3 land.
- Order: WP1 → (WP2 ∥ WP3) → WP4.

## 8. Open Questions

- Should `create_upload_url` optionally return a `metaUrl` for post-upload verification
  (agent confirms its own upload)? Cheap to add in WP2; decide during implementation.
- Whether `get_bundle_overview` should inline *all* small text files rather than just the
  index (context-budget tradeoff). WP3 may tune; record the decision in the delta log.
