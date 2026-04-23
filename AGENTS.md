<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:team-workflow -->
# Agent Team Workflow

This project uses a Claude Code sub-agent team. Do not try to do everything from the main conversation — route work through the tech-lead.

## Roster

| Agent | When to use |
|-------|-------------|
| `tech-lead` | First touch for any non-trivial request. Triages, decomposes, and dispatches to specialists. |
| `backend-engineer` | `packages/api/src/routes/**`, `packages/api/src/lib/**`, `packages/shared/src/**` for shared bundle/upload logic, plus legacy upload flow files in `packages/legacy/src/app/api/**` and `packages/legacy/scripts/**`. Uses `/codex:rescue`. |
| `frontend-engineer` | `packages/web/src/**` for the SPA, plus legacy Next.js UI files in `packages/legacy/src/app/**`, `packages/legacy/src/components/**`, and `packages/legacy/src/app/globals.css`. Uses `/frontend-design` with `docs/DESIGN_GUIDE.md` as the SSOT. |
| `code-reviewer` | Independent diff review + security checklist between implementation and QA. |
| `qa-engineer` | Test case design, Playwright MCP browser tests, `.evidence/{session}/` bundle, upload to local Evidence Browser, recursive verification (max 3 attempts). |
| `release-notes-writer` | AGENTS.md / README / CHANGELOG after a team cycle completes. |

## Standard flow

```
user request
  └─ tech-lead (triage)
       ├─ backend-engineer   ┐
       └─ frontend-engineer  ┘
              └─ code-reviewer (diff + security)
                     └─ qa-engineer (TCs + browser + .evidence upload + recursive)
                            └─ release-notes-writer (docs + CHANGELOG)
```

## Recursive QA loop (max 3 attempts)

`qa-engineer` packages results into `.evidence/{session}/`, uploads the bundle to `POST /api/w/{ws}/bundle`, then opens the uploaded bundle via Playwright MCP to verify it actually renders. On failure the loop re-dispatches via tech-lead. After 3 failed attempts the loop stops and a human decides next steps.

## Where to read more

- `docs/TEAM_WORKFLOW.md` — full spec: `.evidence/{session}` layout, session ID format, upload API contract, recursive loop state machine
- `.claude/agents/*.md` — per-agent specs with tool lists, constraints, and handoff rules
- `docs/DESIGN_GUIDE.md` — design tokens, Figma variable mapping (frontend-engineer SSOT)
<!-- END:team-workflow -->
