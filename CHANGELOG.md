# Changelog

## Unreleased

### Features

- Adopt SPEC-001 for the MCP agent access epic: `/api/mcp` now enforces per-tool scope
  checks, mints short-lived capability upload URLs for upload/admin scoped callers, and
  exposes bundle overview/tree/file read tools plus filtered bundle listing for
  read-capable agents.
