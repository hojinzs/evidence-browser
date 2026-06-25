# Technical-Debt Backlog — Evidence Browser

_Generated 2026-06-25 from a multi-agent code-hygiene & technical-debt sweep (9 lenses → adversarial verification, 1 false positive dropped). 83 findings, each with file:line evidence verified against the working tree._

**Dominant theme:** the `legacy → api/web/shared/cli` migration cutover is effectively done (root `workspaces`, `Dockerfile`, `docker-compose`, changesets all exclude `legacy`), but the cleanup never happened — dead code, stale docs, and duplicated logic remain, and no real engineering gates (ESLint, CI tests on critical paths) were ever added.

## Priority & counts

- 🔴 P1 (high): **22**  ·  🟡 P2 (medium): **28**  ·  ⚪ P3 (low): **33**  ·  total **83**

## Epics (suggested registration units)

| # | Epic | Items | Suggested order |
|---|------|-------|-----------------|
| E2 | Realign docs & agent specs to the post-cutover (Hono+Vite) reality | 11 | 1 |
| E1 | Retire the dead `packages/legacy` package | 3 | 2 |
| E3 | Install real lint / CI / build gates + a shared TS-config baseline | 15 | 3 |
| E5 | Add test coverage for security-critical paths | 12 | 4 |
| E4 | Consolidate duplication into `@evidence-browser/shared` (one SSOT) | 8 | 5 |
| E6 | Backend runtime hardening & operational hygiene | 17 | 6 |
| E8 | CLI & shared-library packaging robustness | 7 | 7 |
| E7 | Web SPA hygiene (pre-rebuild, mostly deferrable) | 10 | 8 |

> Sequencing rationale: **E2 then E1** (repoint references, then delete legacy) clears misdirection and dead weight first. **E3** (gates) locks in hygiene before churn. **E5/E4** (tests + dedup) make refactors safe. **E6** hardens the runtime. **E8** secures CLI releases. **E7** rides the planned web rebuild.

## Registered (2026-06-25)

Filed as **8 epic issues** on `hojinzs/evidence-browser` + Moncher Stack Project #14 (Status: Backlog). Sub-items are checklists inside each issue, not separate issues:

| Epic | Issue |
|---|---|
| E1 Retire dead `packages/legacy` | [#58](https://github.com/hojinzs/evidence-browser/issues/58) |
| E2 Realign docs & agent specs | [#59](https://github.com/hojinzs/evidence-browser/issues/59) |
| E3 Lint/CI/build gates + tsconfig | [#60](https://github.com/hojinzs/evidence-browser/issues/60) |
| E4 Dedup into shared SSOT | [#61](https://github.com/hojinzs/evidence-browser/issues/61) |
| E5 Test coverage (security-critical) | [#62](https://github.com/hojinzs/evidence-browser/issues/62) |
| E6 Backend runtime hardening | [#63](https://github.com/hojinzs/evidence-browser/issues/63) |
| E7 Web SPA hygiene (pre-rebuild) | [#64](https://github.com/hojinzs/evidence-browser/issues/64) |
| E8 CLI & shared packaging robustness | [#65](https://github.com/hojinzs/evidence-browser/issues/65) |

E7.1 was not filed (duplicate of #49 / PR #57); Korean-string items route to #47.

## Conflict check vs currently-open issues / PRs

Checked against open issues **#45, #46, #47, #48, #49, #55** and open PRs **#56, #57** (as of 2026-06-25). Adjust before registering:

| Finding(s) | Open item | Relationship | Action |
|---|---|---|---|
| **E7.1** infinite "Loading bundle…" | **#49** (bug) + **PR #57** | **Exact duplicate** — already in progress | **Do not file.** Drop E7.1. |
| **E7.2/E7.3** error boundary / query-error surfacing | **PR #57** `fix(web): handle bundle load failures` | Very likely in PR scope | Verify against the #57 diff; file only the gaps it leaves. |
| **E4.4 / E8.1** "make CLI depend on `@evidence-browser/shared`" | **#55** + **PR #56** | **⚠️ Conflict** — #55 mandates the *opposite*: **vendor** shared into the tarball and *assert the CLI does NOT depend on the private package* | **Reframe**: dedup CLI types/validators by **vendoring at build time** (align with #56's prepack), not by adding a workspace dependency. |
| **E5.11 / E8.3** CLI test-against-dist, no build-before-publish guarantee | **#55** (packed-install smoke test) | Overlap | Let #55 own the smoke test; file only the residual `prepublishOnly` build guard if #55 doesn't add it. |
| **E5.12** `test:cli` passes vacuously / fail-fast | **#55** | Adjacent (CLI test infra) | Fold into #55 or keep as a tiny tooling sub-item. |
| **E6.14** Korean string `routes/bundle.ts:116` · **E8.6** Korean in shared validators | **#47** (i18n) | **Subset** — #47 owns "English-ize all user-facing strings"; it lists the shared ones but **misses `bundle.ts:116`** | **Don't file separately.** Add `bundle.ts:116` to #47's checklist. |
| **E1 / E1.2** delete legacy + safe-removal | **#45** Part A | **Cross-dep** — #45 sources hero screenshots from `packages/legacy/tests/fixtures/figma/*.png` (confirmed to exist) | E1.2 checklist must also **preserve/relocate the figma PNGs**; sequence #45 (capture) before deleting legacy. |
| **E2** internal docs/agent-spec realignment | **#45** (README/CLI.md/PRD) | Adjacent, **different docs** — no overlap | File E2 independently; note #45 covers user-facing docs only. |

Everything else (**E3**, most of **E4**, **E5**, **E6**, **E2**) is net-new and untouched by open issues.

---

## E2 · Realign docs & agent specs to the post-cutover (Hono+Vite) reality

Docs, AGENTS.md, the `.claude`/`.agents` specs and skills still describe/route into the Next.js `src/app` monolith. They actively misdirect human and AI contributors into dead code and are the prerequisite for safely deleting legacy.

_11 item(s)._

### E2.1 backend-engineer.md is written entirely for Next.js 16 / src/app/api, not the live Hono API
- **Priority:** **P1·high** · **Effort:** M · **Category:** docs-process · **Pkg:** root · **Tags:** blocked-by-legacy-removal
- **Problem:** The backend-engineer agent spec describes a framework and file tree (Next.js App Router, src/app/api/**/route.ts, Pages Router docs) that the live backend no longer uses. An agent following it will read non-existent docs, look for non-existent files, and apply Next.js Route Handler patterns to a Hono codebase. This is the single most misleading spec for backend work.
- **Fix:** Rewrite backend-engineer.md for the Hono stack: domain = packages/api/src/routes/** + middleware/** + lib/** and packages/shared/src/**; replace the Next.js pre-flight with Hono/@hono/node-server guidance; update Key project knowledge to cite packages/api/src/middleware/auth.ts and packages/api/src/routes/bundle.ts.
- **Evidence:** `.claude/agents/backend-engineer.md:3`, `.claude/agents/backend-engineer.md:12-27`, `.claude/agents/backend-engineer.md:56-61`, `packages/api/src/routes/bundle.ts:79`

### E2.2 frontend-engineer.md targets Next.js src/app pages instead of the Vite/TanStack web SPA
- **Priority:** **P1·high** · **Effort:** M · **Category:** docs-process · **Pkg:** root · **Tags:** blocked-by-legacy-removal, blocked-by-web-rebuild
- **Problem:** The frontend-engineer spec describes the Next.js App Router page/layout/globals.css layout, but the live SPA is Vite + TanStack Router under packages/web/src with file-based routes (e.g. routes/w/$ws/...). An agent following this looks for src/app/**/page.tsx and Next.js docs that are not present, and applies Server/Client Component rules that do not apply to a pure Vite SPA.
- **Fix:** Rewrite frontend-engineer.md for packages/web: domain = packages/web/src/routes/**, packages/web/src/components/**, and the web Tailwind entry; drop the Next.js App Router pre-flight; reference TanStack Router/Query patterns instead of Server Components. Note the user's planned web rebuild so the spec is not over-invested.
- **Evidence:** `.claude/agents/frontend-engineer.md:3`, `.claude/agents/frontend-engineer.md:11`, `.claude/agents/frontend-engineer.md:13`, `.claude/agents/frontend-engineer.md:39-47`

### E2.3 evidence-upload skill is hard-wired to the legacy script, including in allowed-tools
- **Priority:** **P1·high** · **Effort:** M · **Category:** tooling-ci-build · **Pkg:** root · **Tags:** blocked-by-legacy-removal
- **Problem:** The canonical QA upload path executes packages/legacy/scripts/qa-evidence-upload.ts via tsx. legacy is excluded from workspaces and not installed in CI/Docker, so this only works because the source files still sit in the tree; it depends on the archiver/tsx toolchain of an unbuilt package and on legacy auth internals (SESSION_COOKIE_NAME) the skill itself flags (L81). The moment legacy is deleted, every QA run's mandatory final step breaks, even though the eb CLI can already do the upload.
- **Fix:** Re-point the skill at the eb CLI: change the invocation to `eb upload` and update allowed-tools to the eb binary (or the evidence-browser skill). Move any session-dir validation logic the script provides into shared/CLI. Remove the legacy script dependency.
- **Evidence:** `.claude/skills/evidence-upload/SKILL.md:5`, `.claude/skills/evidence-upload/SKILL.md:44-46`, `.claude/skills/evidence-upload/SKILL.md:86-95`, `packages/cli/src/commands/upload.ts`

### E2.4 docs/ARCHITECTURE.md claims to reflect 'current implementation' but documents the legacy Next.js monolith layout
- **Priority:** **P1·high** · **Effort:** M · **Category:** docs-process · **Pkg:** root · **Tags:** blocked-by-legacy-removal
- **Problem:** ARCHITECTURE.md is the doc that explicitly bills itself as the source of truth for the real implementation, yet it describes the pre-cutover Next.js App Router monolith (proxy.ts, Server Components, src/app/api). It does not mention the Hono backend or the Vite SPA split at all (verified: zero occurrences of packages/api|packages/web|packages/shared|Hono|Vite|TanStack in the 421-line file). A maintainer reading it concludes the app is a Next.js monolith and looks for src/app — directories that only exist inside the frozen legacy package.
- **Fix:** Rewrite ARCHITECTURE.md to document the live monorepo: packages/api (Hono + @hono/node-server, routes/middleware/lib), packages/web (Vite + TanStack Router SPA served as static files by the API), packages/shared (validation SSOT), packages/cli (eb). Remove the Next.js proxy/App Router/Server Components description, or relocate it under a 'legacy (deprecated)' appendix.
- **Evidence:** `docs/ARCHITECTURE.md:4`, `docs/ARCHITECTURE.md:14-27`, `docs/ARCHITECTURE.md:35-65`

### E2.5 AGENTS.md mandates reading node_modules/next/dist/docs that no longer exists post-cutover
- **Priority:** **P1·high** · **Effort:** S · **Category:** docs-process · **Pkg:** root · **Tags:** quick-win, blocked-by-legacy-removal
- **Problem:** The first instruction every agent (and human) sees orders them to read a Next.js docs path that does not exist in the installed tree (verified: `ls node_modules/next/dist/docs` -> No such file or directory). The live backend is Hono and the live frontend is Vite/TanStack; Next.js is gone except in the unbuilt legacy package. Agents obeying this either error out or hallucinate Next.js conventions that do not apply.
- **Fix:** Replace the nextjs-agent-rules block in AGENTS.md with stack-correct guidance: backend = Hono (packages/api), frontend = Vite + TanStack Router/Query (packages/web), shared validation in packages/shared. Drop the node_modules/next/dist/docs pre-flight entirely, or scope it explicitly to legacy-only work.
- **Evidence:** `AGENTS.md:1-5`, `package.json:5-10`, `packages/legacy/package.json:26`

### E2.6 AGENTS.md routes engineers to edit packages/legacy paths that are excluded from build/deploy
- **Priority:** **P1·high** · **Effort:** S · **Category:** docs-process · **Pkg:** root · **Tags:** quick-win, blocked-by-legacy-removal
- **Problem:** AGENTS.md still tells both engineer agents that part of their domain is packages/legacy/**. Since the cutover is done (Dockerfile, docker-compose, workspaces all exclude legacy), any edit there is dead work that ships nothing and can never be validated by CI. Future contributors waste effort modifying the abandoned monolith instead of packages/api or packages/web.
- **Fix:** Rewrite the roster rows to scope backend-engineer to packages/api/src/** and packages/shared/src/**, and frontend-engineer to packages/web/src/**. Remove all 'plus legacy ...' clauses, or replace with an explicit 'legacy is frozen/extraction-only; do not edit' note.
- **Evidence:** `AGENTS.md:17`, `AGENTS.md:18`, `Dockerfile:12-14`, `package.json:5-10`

### E2.7 tech-lead, code-reviewer, qa-engineer, release-notes-writer specs all dispatch against Next.js src/app paths
- **Priority:** P2·med · **Effort:** M · **Category:** docs-process · **Pkg:** root · **Tags:** blocked-by-legacy-removal
- **Problem:** The whole agent team's routing/review/QA/citation conventions are keyed to the pre-cutover Next.js src/app file layout. tech-lead decomposes work into directories that no longer exist, code-reviewer's security checklist triggers never match the live Hono files, and release-notes-writer is taught to cite legacy paths. The team collectively misroutes against a dead tree.
- **Fix:** Update path globs across all four specs to the live monorepo layout: backend -> packages/api/src/{routes,middleware,lib}/**, packages/shared/src/**; frontend -> packages/web/src/**. Re-key code-reviewer security sections to packages/api/src/routes/bundle.ts, middleware/auth.ts, routes/auth.ts, routes/mcp.ts.
- **Evidence:** `.claude/agents/tech-lead.md:18-19`, `.claude/agents/code-reviewer.md:65-88`, `.claude/agents/qa-engineer.md:130`, `.claude/agents/release-notes-writer.md:71`

### E2.8 TEST.md fixture matrix points QA at packages/legacy/fixtures
- **Priority:** P2·med · **Effort:** M · **Category:** docs-process · **Pkg:** root · **Tags:** blocked-by-legacy-removal
- **Problem:** TEST.md is the root QA source of truth for PR verification, and it routes every fixture-based test at packages/legacy/fixtures. Those fixtures exist today only because the legacy tree is still physically present; they are not part of any active package's test setup. When legacy is removed, the documented QA fixture matrix has no backing files and QA loses its canonical bundles, with no pointer to a maintained location.
- **Fix:** Move/copy the fixture set into a maintained location (e.g. packages/shared/fixtures or a top-level test/fixtures) and update TEST.md to reference it. Until moved, add a note that the fixtures currently reside under the legacy package pending relocation.
- **Evidence:** `TEST.md:196`, `TEST.md:201-212`

### E2.9 TEAM_WORKFLOW.md still names the legacy upload script and Next.js legacy references as live infrastructure
- **Priority:** P2·med · **Effort:** S · **Category:** docs-process · **Pkg:** root · **Tags:** quick-win, blocked-by-legacy-removal
- **Problem:** The canonical team-workflow spec describes the legacy script as the live upload mechanism 'until CLI upload commands land', but the eb CLI upload command already exists (packages/cli/src/commands/upload.ts). It also points the E2E reference at packages/legacy/playwright.config.ts. This keeps the whole team anchored to legacy infra that is on the chopping block and misrepresents the current state as still mid-migration.
- **Fix:** Update TEAM_WORKFLOW.md to state the eb CLI is the upload mechanism, retarget the upload references to the CLI/skill, replace the legacy playwright.config.ts reference with the live web/api test setup, and drop or generalize the machine-specific /home/hojinzs plan path.
- **Evidence:** `docs/TEAM_WORKFLOW.md:134`, `docs/TEAM_WORKFLOW.md:217`, `docs/TEAM_WORKFLOW.md:220-221`

### E2.10 TEAM_WORKFLOW upload contract states admin-only auth, contradicting the live requireUpload scope
- **Priority:** P2·med · **Effort:** S · **Category:** docs-process · **Pkg:** root · **Tags:** quick-win
- **Problem:** The documented upload auth contract (admin session, requireAdminFromRequest) does not match the implemented authorization (requireUpload accepts upload-scoped API keys and admin). A contributor or reviewer trusting the doc would wrongly reject valid upload-scoped key usage as a bug, or wrongly assume admin is mandatory. Note: requireAdminFromRequest does still exist in packages/legacy/src/lib/auth/require-auth.ts (used by legacy routes), but NOT in the live packages/api — so the doc cites a helper from the dead tree, not the live one.
- **Fix:** Correct the contract in TEAM_WORKFLOW.md to: 'Auth: requireUpload — API key with scope upload|admin, or an admin session (packages/api/src/middleware/auth.ts).' Remove the requireAdminFromRequest name (it belongs to legacy, not the live api).
- **Evidence:** `docs/TEAM_WORKFLOW.md:124`, `packages/api/src/routes/bundle.ts:79`, `packages/api/src/middleware/auth.ts:67-86`

### E2.11 docs/refactor-plan.md reads as in-progress though every phase (incl. Dockerfile cutover) is done
- **Priority:** P2·med · **Effort:** S · **Category:** docs-process · **Pkg:** root · **Tags:** quick-win, blocked-by-legacy-removal
- **Problem:** refactor-plan.md is the most detailed architecture doc in docs/ and reads as an active migration plan with phases yet to execute, but the migration is finished (workspaces, Dockerfile, changeset config all reflect the post-cutover state). A new contributor or AI treats it as current marching orders and may try to re-run completed phases, re-create the legacy Dockerfile, or assume legacy is still the runtime.
- **Fix:** Add a prominent status banner at the top ('COMPLETED — migration shipped; retained for historical context') or move it to docs/archive/. Optionally annotate each phase as Done and point to docs/ARCHITECTURE.md for current state.
- **Evidence:** `docs/refactor-plan.md:14`, `docs/refactor-plan.md:76-78`, `docs/refactor-plan.md:805-858`, `Dockerfile:51`

---

## E1 · Retire the dead `packages/legacy` package

~8.7k LOC of the old Next.js monolith is excluded from every build/test/deploy path yet still sits in the tree, misdirecting contributors and carrying an unpatched, never-tested dependency surface. Depends on E2 repointing the few live references first.

_3 item(s)._

### E1.1 Delete ~8.7k LOC dead packages/legacy package fully excluded from build, test, and deploy
- **Priority:** **P1·high** · **Effort:** M · **Category:** dead-code · **Pkg:** legacy · **Tags:** blocked-by-legacy-removal, quick-win-after-repointing
- **Problem:** ~8.7k LOC of the old Next.js monolith physically remains in the tree but is excluded from every build, test, lint, typecheck, and deploy path (workspaces, lockfile, Dockerfile, CI, changesets). It is pure dead weight: it misdirects contributors (AGENTS.md still routes engineers INTO legacy files), inflates clone/checkout size, and carries an unpatched, never-tested security surface (Next 16, react-markdown/rehype-sanitize, @aws-sdk/client-s3, better-sqlite3, argon2) that no CI exercises. The duplicated bundle/upload/auth logic also invites accidental edits to the wrong (dead) copy.
- **Fix:** Remove packages/legacy from the tree after completing the safe-removal checklist (separate finding) that repoints every live reference. Concretely: (1) relocate the only live runtime dependency — scripts/qa-evidence-upload.ts and the fixtures/ dir — out of legacy; (2) git rm -r packages/legacy; (3) confirm npm ci && npm run lint && npm test && npm run build still pass (they should be unaffected since legacy is already excluded).
- **Evidence:** `package.json:5-10`, `package-lock.json:n/a`, `Dockerfile:5-14`, `.github/workflows/ci.yml:21-24`, `.changeset/config.json:10-14`, `packages/legacy/package.json:1-4`

### E1.2 Safe-removal checklist: repoint live references into packages/legacy BEFORE deleting it
> ⚠️ **Cross-dep with #45:** the checklist below is INCOMPLETE — #45 Part A also sources the README hero/screenshots from `packages/legacy/tests/fixtures/figma/{login,home,workspace,bundle-viewer,admin}.png` (confirmed present). Either land #45's screenshot capture first, or relocate those PNGs as part of removal. Add them to the checklist.
- **Priority:** **P1·high** · **Effort:** M · **Category:** docs-process · **Pkg:** legacy · **Tags:** blocked-by-legacy-removal
- **Problem:** Deleting packages/legacy will break the LIVE evidence-upload skill (its only runtime dependency on legacy is scripts/qa-evidence-upload.ts, pinned in allowed-tools and invoked directly) and orphan the QA fixture corpus that TEST.md depends on. Multiple docs/skills also point at legacy files as 'contract' or 'SSOT' that have already been superseded by api/shared, plus AGENTS.md actively routes engineers into the dead tree. The references are split across two skill trees (.claude/ and .agents/) that have drifted (differing only in path strings), so a blind delete leaves dangling tool pins and broken agent instructions.
- **Fix:** Before git rm: (1) Move packages/legacy/scripts/qa-evidence-upload.ts to a maintained home (e.g. packages/cli/scripts/ or root scripts/), add `archiver` as a real dependency there, and update BOTH .claude/skills/evidence-upload/SKILL.md and .agents/skills/evidence-upload/SKILL.md allowed-tools+invocation (lines 5,45) plus docs/TEAM_WORKFLOW.md lines 134/136/217 to the new path. (2) Move packages/legacy/fixtures/ to a kept location (e.g. packages/api/fixtures or tests/fixtures) and update TEST.md line 196. (3) Repoint the bundle 'contract'/auth SSOT pointers (evidence-browser SKILL.md line 128, evidence-upload SKILL.md lines 100/81 in both .claude and .agents) to packages/api/src/routes/bundle.ts and packages/api auth. (4) Rewrite AGENTS.md lines 17-18 to drop legacy paths. (5) Mark docs/refactor-plan.md legacy move-source refs as completed. Then delete legacy and reconcile the duplicated skill trees.
- **Evidence:** `.claude/skills/evidence-upload/SKILL.md:5`, `.agents/skills/evidence-upload/SKILL.md:5`, `docs/TEAM_WORKFLOW.md:134`, `packages/legacy/scripts/qa-evidence-upload.ts:24-27`, `TEST.md:196`, `AGENTS.md:17-18`, `.claude/skills/evidence-browser/SKILL.md:128`, `docs/refactor-plan.md:160-208`

### E1.3 evidence-upload skill depends on a script whose archiver dep is never installed by npm ci
- **Priority:** P3·low · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** legacy · **Tags:** blocked-by-legacy-removal, quick-win
- **Problem:** The canonical QA evidence-upload path executes a legacy script that imports `archiver`, but because legacy is excluded from workspaces and the lockfile, a clean `npm ci` does not install archiver (verified: not resolvable from root, no legacy node_modules present). The skill works today only by relying on `npx` fetching archiver ad-hoc (network-dependent, version-unpinned). NOTE: the original finding also claimed `tsx` is missing — that is FALSE: tsx is declared by packages/api (a live workspace), lands in the root lockfile, and resolves from root. So the gap is narrower (archiver-only) and the script's `npx tsx` runner itself is fine. Still a hidden, fragile dependency that can fail unpredictably on fresh CI runners.
- **Fix:** As part of relocating qa-evidence-upload.ts (see safe-removal checklist), move it into an installed workspace (e.g. packages/cli) and declare `archiver` as that package's dependency so it lands in the root lockfile and is provisioned by `npm ci`. tsx is already available via packages/api, so no action needed there. Verify the /evidence-upload skill runs against a freshly installed tree with no legacy node_modules present.
- **Evidence:** `.claude/skills/evidence-upload/SKILL.md:45`, `packages/legacy/package.json:52`, `package-lock.json:n/a`

---

## E3 · Install real lint / CI / build gates + a shared TS-config baseline

`npm run lint` is just `tsc` for two of five packages; no ESLint runs anywhere on live code; `test:cli` passes vacuously; the root `build` does a fragile `rm -rf web && cp -R`; tsconfigs have drifted with no shared base. Nothing enforces hygiene.

_15 item(s)._

### E3.1 Add real ESLint to live packages (api/web/cli/shared); only legacy has a lint config
- **Priority:** **P1·high** · **Effort:** M · **Category:** tooling-ci-build · **Pkg:** multi · **Tags:** quick-win, eslint, ci
- **Problem:** The four packages that actually ship (api, web, cli, shared) have zero lint coverage: no ESLint config, no eslint dependency, no lint script. The repo's only ESLint setup lives in packages/legacy, which is excluded from the workspace and not built/deployed. Nothing catches unused vars, no-floating-promises, import hygiene, accidental `any`, console.log leftovers, etc. — tsc only validates types, not lint rules. As the codebase grows post-migration this is a steadily compounding quality gap.
- **Fix:** Add a shared flat eslint.config.mjs at the repo root (typescript-eslint + react/react-hooks for web), wire a real `lint` script per live package (`eslint .`) and a root aggregate `lint:eslint`, then fold it into the root `lint` alongside typecheck. Port the useful parts of packages/legacy/eslint.config.mjs rather than leaving lint stranded in the dead package.
- **Evidence:** `package.json:19`, `packages/legacy/eslint.config.mjs:1-18`, `packages/api/package.json:5-13`

### E3.2 Root `lint` script only typechecks api/web — cli and shared are never typechecked or linted in CI
- **Priority:** **P1·high** · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** root · **Tags:** quick-win
- **Problem:** Both packages ship `typecheck` scripts, but the aggregate `lint` task and therefore CI never invoke them. A type error in packages/cli/src or packages/shared/src would not fail `npm run lint`; it would only surface if it also broke the build or tests. Note shared/api/web ARE built/tested in CI (build:shared runs before build:api/web; npm test includes test:shared and test:cli which runs `npm run build` first), so a shared/cli type error that breaks compilation would still be caught by `npm test`/`npm run build`. The genuine gap is the dedicated typecheck (e.g. unused-symbol / strict-only errors with noEmit) being skipped for exactly the SSOT and the published binary.
- **Fix:** Add `typecheck:cli` and `typecheck:shared` root scripts and include them in `lint` (e.g. `"lint": "npm run typecheck:shared && npm run typecheck:api && npm run typecheck:web && npm run typecheck:cli"`). No new tooling needed since both packages already expose the scripts.
- **Evidence:** `package.json:19`, `packages/cli/package.json:21`, `packages/shared/package.json:40`, `.github/workflows/ci.yml:22-24`

### E3.3 CI runs no real linting and no e2e — `npm run lint` is just tsc, and the Playwright suite is never executed
- **Priority:** P2·med · **Effort:** L · **Category:** tooling-ci-build · **Pkg:** root · **Tags:** blocked-by-web-rebuild, e2e, ci
- **Problem:** ci.yml gives a false sense of coverage. The `lint` step performs no static lint analysis (see separate finding); there is no end-to-end/browser test in CI even though the project's whole value prop is rendering uploaded bundles in a browser and a working Playwright harness already exists (stranded in legacy). Regressions in actual page rendering, routing, or the upload->view flow can only be caught by the manual qa-engineer loop, not by CI. The separate docker.yml workflow builds and pushes the image but never starts it, so there is also no CI coverage of the Docker image actually booting.
- **Fix:** Once real ESLint is added, split CI into `lint` + `test` + `build` jobs so a lint failure is distinct and blocking. Port a minimal Playwright smoke (load app, upload a fixture bundle via /api/w/{ws}/bundle, assert it renders) into a live package and run it in CI, optionally gated behind the Docker image via a `docker compose up` healthcheck step (the Dockerfile already defines a HEALTHCHECK at line 49 that CI never exercises). Track the full suite as blocked on the planned web rebuild, but the API+upload smoke can land now.
- **Evidence:** `.github/workflows/ci.yml:22-24`, `packages/legacy/package.json:11`, `.github/workflows/ci.yml:10-11`

### E3.4 Root `build` does a fragile `rm -rf web && cp -R packages/web/dist web` filesystem dance
- **Priority:** P2·med · **Effort:** M · **Category:** tooling-ci-build · **Pkg:** root · **Tags:** blocked-by-web-rebuild, build
- **Problem:** The build hand-rolls an `rm -rf web` + `cp -R` against a top-level path. `rm -rf web` is unguarded — if `build:web` fails or is skipped, the previous `web/` is destroyed leaving no artifact; the copy is non-incremental and platform-coupled (cp -R semantics). The resulting `web/` duplicates packages/web/dist and is wired differently from the Docker image (which copies dist straight in), so the directory the API serves locally vs in production come from divergent steps. Brittle, easy to break silently, and a footgun if `web/` ever gains real contents.
- **Fix:** Drop the rm/cp dance: have the API serve static files directly from `packages/web/dist` (configurable static root) so there is one canonical SPA output for both local and Docker. If a copy is genuinely needed, replace the shell with a cross-platform Node step (e.g. `node -e fs.cpSync` or a tiny build script) that no-ops safely and only runs after a successful web build.
- **Evidence:** `package.json:15`, `.gitignore:23`, `Dockerfile:39`

### E3.5 No actual linting in any live package: eslint-disable comments present but eslint isn't installed and root `lint` only typechecks
- **Priority:** P2·med · **Effort:** M · **Category:** tooling-ci-build · **Pkg:** root · **Tags:** tooling-ci-build, ci-gap
- **Problem:** Confirmed CI/quality-gate gap. Three live packages carry eslint-disable directives, but grep shows none of api/web/cli/shared declares eslint or ships an eslint config (only dead legacy does, eslint ^9 + eslint-config-next). The root `lint` script is a partial typecheck (api+web only; cli+shared get neither lint nor typecheck via this script). Disable comments give a false impression of lint coverage and cli/shared have no lint gate.
- **Fix:** Either (a) add a shared flat eslint config + @typescript-eslint to the live packages and wire a genuine `lint` across all four, or (b) if linting is intentionally dropped, remove the meaningless eslint-disable comments and rename root `lint` to `typecheck`, including cli+shared. Don't leave the half-state.
- **Evidence:** `package.json:19`, `packages/cli/src/index.ts:8`, `packages/api/src/lib/bundle/extractor.ts:79`, `packages/web/src/components/viewers/image-viewer.tsx:20`

### E3.6 `lint` never typechecks cli or shared — two live packages skip the gate
- **Priority:** P2·med · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** multi · **Tags:** quick-win, ci
- **Problem:** Both cli and shared expose `typecheck` scripts, but the root `lint` (which CI runs) calls neither. cli — the published `eb` binary — is therefore never type-checked in CI. shared is only partially checked via api's and web's import graphs (both tsconfigs map @evidence-browser/shared to ../shared/src/index.ts), so any shared export not reached from those entry points (e.g. upload-validation.ts / validate-zip.ts surface not imported) can rot a type error undetected. A breaking type change in shared or cli ships green.
- **Fix:** Add `typecheck:cli` and `typecheck:shared` root scripts that delegate to each package's existing `typecheck`, and include all four in `lint` (e.g. `npm run typecheck:shared && typecheck:api && typecheck:web && typecheck:cli`). Trivial since the per-package scripts already exist.
- **Evidence:** `package.json:19`, `package.json:26-27`, `packages/cli/package.json:21`, `packages/shared/package.json:40`

### E3.7 `test:cli` silently passes when no test files are discovered (node --test exits 0 on empty glob)
- **Priority:** P2·med · **Effort:** S · **Category:** test-gap · **Pkg:** cli · **Tags:** quick-win
- **Problem:** Verified empirically (node v24, `node --test` with no path arguments printed `tests 0 ... fail 0` and EXIT CODE 0). cli's test command derives its file list from `find test -name '*.test.js'`. If the test file is ever renamed, moved, or the dir restructured (it sits at test/cli.test.js, an outlier vs the other packages' `vitest run src`), the command degrades to a no-op that still reports success — masking total loss of cli coverage in the exact package that is npm-published. There is also no fail-on-empty guard.
- **Fix:** Make empty discovery fail loudly: either use node's built-in directory mode (`node --test test/`) plus a guard like `test -n "$(find test -name '*.test.js')"` before running, or migrate cli to vitest like the other packages so `vitest run` errors on `No test files found`. Add at least a smoke assertion that the suite count is > 0.
- **Evidence:** `packages/cli/package.json:22`, `packages/cli/test/cli.test.js:1`, `package.json:20`

### E3.8 tsconfig compiler-option drift across packages: no shared base config (isolatedModules, declaration, casing, target)
- **Priority:** P3·low · **Effort:** M · **Category:** config · **Pkg:** multi · **Tags:** tsconfig-drift
- **Problem:** Confirmed: no root tsconfig.base.json exists; each package re-specifies overlapping options that have quietly diverged (isolatedModules only in web, casing flag only in web, mixed declaration/noEmit, ES2017 in legacy). Without a base these keep drifting, and a developer can't assume cross-package behavior parity (e.g. a re-export that compiles under api can break under web's isolatedModules).
- **Fix:** Introduce a root tsconfig.base.json with common options (target ES2020, strict, esModuleInterop, skipLibCheck, isolatedModules where safe) and have each package `extends` it, overriding only the genuinely package-specific bits (web: jsx/lib/Bundler/noEmit; shared: declaration; api/cli: outDir/rootDir). Collapses the drift surface.
- **Evidence:** `packages/web/tsconfig.json:15`, `packages/shared/tsconfig.json:8`, `packages/legacy/tsconfig.json:3`, `packages/web/tsconfig.json:11`

### E3.9 Dead eslint-disable directive in CLI with no ESLint anywhere in the package
- **Priority:** P3·low · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** cli · **Tags:** quick-win, dead-code
- **Problem:** The CLI carries an eslint-disable comment for @typescript-eslint/no-var-requires that is never enforced: there is no .eslintrc / eslint.config in cli or shared (only legacy has one), and neither package depends on eslint. The comment is cargo-culted dead config implying lint coverage that does not exist. The require() hack itself only exists because the package emits CommonJS (tsconfig module: CommonJS) yet wants package.json version at runtime; with resolveJsonModule:true + esModuleInterop:true (both set) it could `import pkg from "../package.json"`, removing the need for the disable.
- **Fix:** Replace the require()+eslint-disable with `import pkg from "../package.json"` (resolveJsonModule and esModuleInterop are already true in packages/cli/tsconfig.json) and read pkg.version. Then delete the eslint-disable line. Separately decide whether CLI/shared should be linted at all; if yes add a flat eslint config and wire it into a lint script, else remove stray disable comments.
- **Evidence:** `packages/cli/src/index.ts:8-9`, `packages/cli/package.json:30-33`, `packages/shared/package.json:46-50`

### E3.10 Standardize moduleResolution: api/shared use deprecated "Node" while web uses "Bundler"
- **Priority:** P3·low · **Effort:** S · **Category:** config · **Pkg:** multi · **Tags:** tsconfig-drift, module-resolution
- **Problem:** The moduleResolution drift is real: shared/api use the legacy node10 "Node" alias while web uses "Bundler"; TS recommends NodeNext/Bundler. However the survey's central alarm — that the shared `exports` map causes type-time vs runtime divergence — is FALSE. I confirmed by building api: compiled output is `require("../../../../shared/src/bundle/validate-zip")` (relative, exports-map bypassed at runtime), and web's vite.config.ts:15-17 aliases @evidence-browser/shared to ../shared/src (exports-map bypassed at build). Both consumers also have tsconfig `paths` to ../shared/src. So the exports map is consistently bypassed at BOTH compile and runtime by both live packages — there is no production divergence hazard. What remains is plain tsconfig drift plus a dead/unused exports map.
- **Fix:** Migrate api/shared/cli off the deprecated "Node" alias (to "Node10" or, with matching module, "NodeNext"), and keep web on "Bundler". Separately, either delete shared's now-unused `exports` map or actually wire consumers to use it (drop the path aliases) so it stops being dead config. Low risk since nothing currently resolves through it.
- **Evidence:** `packages/api/tsconfig.json:5`, `packages/shared/tsconfig.json:5`, `packages/web/tsconfig.json:13`, `packages/shared/package.json:7-36`

### E3.11 api tsconfig rootDir:".." produces dist/api/src/ nesting hardcoded in start script and Dockerfile
- **Priority:** P3·low · **Effort:** S · **Category:** config · **Pkg:** api · **Tags:** tsconfig-drift
- **Problem:** The nesting and its coupling to start/Dockerfile are real. BUT the survey's premise that rootDir:".." 'is almost certainly accidental' and 'buys nothing' is FALSE. I built api and confirmed rootDir:".." is load-bearing: it causes shared to be compiled INTO packages/api/dist/shared/src/, and the compiled api imports it via relative require("../../../../shared/src/..."). The Dockerfile deliberately exploits this — it copies ONLY packages/api/dist and its own comment (line 35) says 'includes shared via relative paths in dist/shared/'. The naive remediation (set rootDir to ./src) would stop shared from being emitted and BREAK the Docker runtime image, not just the start path. So this is real-but-low debt (brittle/surprising layout), and any fix must preserve the self-contained-dist behavior.
- **Fix:** Do NOT simply switch rootDir to ./src — that removes dist/shared and breaks the container. Either (a) accept the layout and add a one-line comment in tsconfig explaining rootDir:".." is intentional for self-contained dist, or (b) restructure the build to copy a separately-built shared dist into the image and then flatten api's rootDir, updating start (package.json:8), Dockerfile CMD (line 51) and the dist/shared assumption (Dockerfile line 35-36) together. Option (a) is the quick win.
- **Evidence:** `packages/api/tsconfig.json:7`, `packages/api/package.json:8`, `Dockerfile:51`, `packages/cli/tsconfig.json:7`

### E3.12 Dead ambient declaration: packages/api/src/types/pngjs.d.ts declares a module the api neither depends on nor imports
- **Priority:** P3·low · **Effort:** S · **Category:** dead-code · **Pkg:** api · **Tags:** blocked-by-legacy-removal, quick-win, dead-code
- **Problem:** Confirmed dead code. grep of packages/api/src for 'pngjs' matches only the .d.ts file itself — no source imports pngjs, and api has no pngjs dependency. The file was copied verbatim from legacy (byte-identical). It misleads readers and would shadow real @types if pngjs were ever added.
- **Fix:** Delete packages/api/src/types/pngjs.d.ts. Nothing references it.
- **Evidence:** `packages/api/src/types/pngjs.d.ts:1`, `packages/api/package.json:14-32`, `packages/legacy/src/types/pngjs.d.ts:1`

### E3.13 Hand-written yauzl-promise.d.ts ambient declaration triplicated across api/shared/legacy
- **Priority:** P3·low · **Effort:** S · **Category:** duplication · **Pkg:** multi · **Tags:** duplication, blocked-by-legacy-removal, quick-win
- **Problem:** Confirmed: three byte-identical hand-rolled ambient declarations for the untyped yauzl-promise package. Both live consumers (api extractor.ts:7, shared validate-zip.ts:1) import it. api already depends on shared, so the declaration could live once in shared; triplication means a yauzl-promise API change requires editing N copies that will drift.
- **Fix:** Keep the single copy in shared, ensure api picks it up transitively (or ships it via shared's published types), delete packages/api/src/types/yauzl-promise.d.ts, and drop the legacy copy when legacy is removed.
- **Evidence:** `packages/shared/src/types/yauzl-promise.d.ts:1`, `packages/api/src/types/yauzl-promise.d.ts:1`, `packages/legacy/src/types/yauzl-promise.d.ts:1`

### E3.14 Stale Next.js eslint-disable comment in the Vite web app (rule does not exist, no eslint at all)
- **Priority:** P3·low · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** web · **Tags:** quick-win, blocked-by-web-rebuild
- **Problem:** Confirmed: image-viewer.tsx:20 suppresses the Next-specific @next/next/no-img-element rule inside a Vite/TanStack SPA that has no eslint, no Next, and no such rule. Inert noise that misleads readers and signals unfinished migration cleanup.
- **Fix:** Remove the stale eslint-disable-next-line comment at image-viewer.tsx:20 (the <img> is legitimate in Vite). Optionally add a real flat eslint config for web if linting is desired.
- **Evidence:** `packages/web/src/components/viewers/image-viewer.tsx:20`, `packages/web/package.json:1`, `packages/legacy/package.json:54`

### E3.15 vitest minor-version drift: web ^4.1.9 vs api/shared ^4.1.2 (and cli uses node:test instead)
- **Priority:** P3·low · **Effort:** S · **Category:** dependency · **Pkg:** multi · **Tags:** dependency, version-drift
- **Problem:** Confirmed: three packages share vitest but pin two different minor floors (4.1.9 vs 4.1.2), and cli uses node:test. Two test frameworks plus a vitest floor split is avoidable config drift that complicates a single `npm test` story and shared vitest config reuse. Low severity.
- **Fix:** Align vitest specifiers to a single floor (e.g. ^4.1.9) across api/shared/web. Separately decide whether cli should adopt vitest for consistency or whether node:test is a deliberate zero-dep choice (document it if so).
- **Evidence:** `packages/web/package.json:46`, `packages/api/package.json:31`, `packages/shared/package.json:49`, `packages/cli/package.json:22`

---

## E5 · Add test coverage for security-critical paths

The highest-risk code — upload route, auth/scope enforcement, session signing, API-key hashing/expiry, ZIP extraction guards, the shared bundle gatekeeper, S3, MCP — is untested in the live packages; the only security/e2e suite lives in excluded legacy and never runs.

_12 item(s)._

### E5.1 Security/e2e suite exists only in excluded legacy package and never runs in CI
- **Priority:** **P1·high** · **Effort:** L · **Category:** test-gap · **Pkg:** legacy · **Tags:** blocked-by-legacy-removal, blocked-by-web-rebuild
- **Problem:** The repository's entire security regression and e2e suite lives in packages/legacy, which is excluded from workspaces and Docker and is therefore never run by CI. The live api/web packages have no e2e coverage. The security guarantees these specs encode (sanitization, CSP, traversal, auth-401, upload limits) are unverified end-to-end against the actual shipping server.
- **Fix:** Port the security and upload-edge-case specs to a Playwright suite that boots the live Hono api + Vite web (or supertest-style requests against the Hono app), add a playwright.config to web or a top-level e2e package, and add an e2e job to ci.yml. Until ported, do not delete legacy/tests as it is the only record of these acceptance criteria.
- **Evidence:** `packages/legacy/tests/e2e/security.spec.ts:118-451`, `.github/workflows/ci.yml:22-24`

### E5.2 Core bundle upload POST route (POST /:ws/bundle) has no test coverage
- **Priority:** **P1·high** · **Effort:** M · **Category:** test-gap · **Pkg:** api · **Tags:** quick-win
- **Problem:** The single most important endpoint of the application (bundle upload) is completely untested. Regressions in bundleId validation, size-limit enforcement, multipart parsing, validateBundleZip gating, or the storage+DB write sequence would ship undetected. This is the path that ingests untrusted user-supplied ZIPs, so it is also security-sensitive.
- **Fix:** Add a bundle.test.ts case (or upload.test.ts) that POSTs a real multipart form with a small fixture ZIP through the Hono app, asserting: 201 on valid bundle, 400 on malicious/empty bundleId, 400 on validateBundleZip failure, 413 over MAX_BUNDLE_SIZE, and that a DB row + storage object are created. Reuse the createTestApp + app.request in-memory pattern from workspace.test.ts.
- **Evidence:** `packages/api/src/routes/bundle.ts:79-138`, `packages/api/src/routes/bundle.test.ts:38-96`

### E5.3 Auth middleware scope enforcement (read/upload/admin) is entirely untested and mocked away where it matters
- **Priority:** **P1·high** · **Effort:** M · **Category:** test-gap · **Pkg:** api
- **Problem:** Authorization is the security boundary for every protected route, yet the scope-enforcement logic (API key scope vs route requirement, admin role checks, Bearer-token extraction) has zero direct tests and is stubbed out in the route tests that depend on it. A bug that, e.g., let a read-scoped key upload or delete bundles would not be caught.
- **Fix:** Add packages/api/src/middleware/auth.test.ts that mounts each middleware on a throwaway Hono route and asserts 401 (no/invalid token), 403 (insufficient scope), and 200 (correct scope) for read/upload/admin keys and for session users of role user vs admin. Mock only findApiKeyByHash/validateSessionFromRequest, not the middleware itself.
- **Evidence:** `packages/api/src/middleware/auth.ts:29-86`, `packages/api/src/routes/bundle.test.ts:7-16`

### E5.4 Session signing/login auth library (lib/auth/index.ts) has no tests
- **Priority:** **P1·high** · **Effort:** M · **Category:** test-gap · **Pkg:** api
- **Problem:** Hand-written crypto (HMAC signing + constant-time compare) and the full login/session-validation flow are untested. A subtle bug — e.g. accepting an unsigned cookie, a length-mismatch edge in the compare loop, or returning a user for an expired/forged session — directly produces an authentication bypass.
- **Fix:** Add auth/index.test.ts: round-trip signSessionId->verifySignedCookie; assert verifySignedCookie rejects tampered signatures, missing dots, and wrong-length signatures; test login() returns null on bad password and a signed session on success (mock users/sessions DB modules). Set AUTH_SECRET via env in the test.
- **Evidence:** `packages/api/src/lib/auth/index.ts:22-48`, `packages/api/src/lib/auth/index.ts:51-89`

### E5.5 API-key hashing, expiry, and scoped-delete logic (db/api-keys.ts) untested
- **Priority:** **P1·high** · **Effort:** M · **Category:** test-gap · **Pkg:** api
- **Problem:** API keys are credentials. The hashing, expiry-rejection, and owner-scoped deletion are untested, while sibling DB modules (users, sessions, bundles, workspaces) all have tests — this file is a conspicuous, high-risk gap. Bugs could expose keys, honor expired keys, or allow cross-user key deletion.
- **Fix:** Add api-keys.test.ts against an in-memory better-sqlite3 (mirror the existing db test setup): assert createApiKey returns an eb_-prefixed key whose hash matches the stored row, findApiKeyByHash returns undefined for expired/unknown keys, and deleteApiKey only deletes own key when isAdmin=false but any key when isAdmin=true.
- **Evidence:** `packages/api/src/lib/db/api-keys.ts:27-29`, `packages/api/src/lib/db/api-keys.ts:69-86`, `packages/api/src/lib/db/api-keys.ts:117-134`

### E5.6 ZIP extractor with path-traversal/size/count guards (lib/bundle/extractor.ts) is untested in the live api
- **Priority:** **P1·high** · **Effort:** M · **Category:** test-gap · **Pkg:** api · **Tags:** blocked-by-legacy-removal
- **Problem:** The extractor handles untrusted ZIPs and is the primary defense against zip-slip path traversal and zip-bomb resource exhaustion. It has no automated test in the live api package; the asserting comment lives in legacy and points at the legacy extractor test, masking the live gap.
- **Fix:** Add packages/api/src/lib/bundle/extractor.test.ts that builds small fixture ZIPs (including '../' entries, an over-MAX_FILE_COUNT archive, and an oversized member) and asserts traversal entries are skipped, FileCountLimitError is thrown past the cap, oversized members are skipped, and the resulting fileTree/paths are correct. Mock getStorageAdapter to stream the fixture. (The legacy extractor.test.ts is a portable starting point.)
- **Evidence:** `packages/api/src/lib/bundle/extractor.ts:86-106`, `packages/legacy/tests/e2e/security.spec.ts:4-5`

### E5.7 Shared validate-zip.ts (bundle gatekeeper) has no test in the shared package
- **Priority:** **P1·high** · **Effort:** S · **Category:** test-gap · **Pkg:** shared · **Tags:** quick-win
- **Problem:** validate-zip is the shared bundle-acceptance gate consumed by the api on every upload, but it is the one bundle module in shared without a test. Manifest parsing/zod errors, missing-manifest handling, and missing-index detection are unverified.
- **Fix:** Add packages/shared/src/bundle/validate-zip.test.ts using yauzl-readable fixtures: assert ManifestNotFoundError when manifest.json absent, ManifestValidationError on invalid JSON and on schema failures, IndexFileNotFoundError when the manifest index path is missing, and a successful {title} return for a valid bundle.
- **Evidence:** `packages/shared/src/bundle/validate-zip.ts:9-54`, `packages/api/src/lib/bundle/extractor.ts:8`

### E5.8 No coverage thresholds configured in any package — silent test-coverage erosion
- **Priority:** P2·med · **Effort:** M · **Category:** test-gap · **Pkg:** multi
- **Problem:** With ~16 live test files against ~90 source files and no coverage thresholds (and no coverage run at all), there is no signal when new code lands without tests or when coverage regresses. CI cannot fail on under-tested PRs, so the gaps above will keep growing.
- **Fix:** Add @vitest/coverage-v8 and a test:coverage script per package, set modest enforced thresholds (e.g. lines/branches 60-70%) in each vitest config (add one to shared), and add a coverage step to .github/workflows/ci.yml. Start with a low floor and ratchet up.
- **Evidence:** `packages/api/vitest.config.ts:11-14`, `packages/web/vite.config.ts:10-13`, `packages/shared/package.json:39`

### E5.9 S3 and local storage adapters: S3 path completely untested
- **Priority:** P2·med · **Effort:** M · **Category:** test-gap · **Pkg:** api
- **Problem:** Production deployments using STORAGE_TYPE=s3 run an entirely untested code path. Bugs in key derivation, stream conversion (Readable.toWeb handling), HeadObject existence checks (NotFound/NoSuchKey mapping), or the adapter-selection logic would only surface in production. The local adapter is tested, creating a false sense of storage coverage.
- **Fix:** Add s3.test.ts using aws-sdk-client-mock to stub S3Client responses and assert getBundleInfo maps Head/NotFound correctly, putBundle/deleteBundle issue the right commands, and streams convert. Add storage/index.test.ts asserting createStorageAdapter returns the correct adapter per env.STORAGE_TYPE (and throws on unknown).
- **Evidence:** `packages/api/src/lib/storage/s3.ts:21-122`, `packages/api/src/lib/storage/index.ts:8-33`

### E5.10 MCP server and llm-text serializer untested despite being an external-facing surface
- **Priority:** P2·med · **Effort:** M · **Category:** test-gap · **Pkg:** api
- **Problem:** The MCP endpoint is a programmatic, externally consumed interface (agents call it). Its tool registration, argument handling, and the llm-text serialization have no tests, so contract regressions (renamed tools, broken output shape, leaked paths) would break downstream agents silently.
- **Fix:** Add unit tests for llm-text.ts (deterministic input -> expected serialized output, including edge cases like empty trees and binary files) and a smoke test for the MCP server that lists registered tools/resources and invokes one with a mocked extractor.
- **Evidence:** `packages/api/src/lib/mcp/server.ts:1-167`, `packages/api/src/lib/mcp/llm-text.ts:1-133`

### E5.11 CLI tests run only against compiled dist (require build) and live as untyped .js
- **Priority:** P3·low · **Effort:** M · **Category:** test-gap · **Pkg:** cli
- **Problem:** The CLI has a real 43-case suite written in plain JS against the built dist/ tree. Consequences: (1) tests can't catch type regressions in code under test (they run post-build JS), (2) the test files are untyped and outside any tsconfig, (3) `npm test` always pays a full tsc build, and (4) the `find ... | sort` shell glob is non-portable. This diverges from shared/api/web which use vitest on TS sources, so the published binary has the weakest test ergonomics in the repo.
- **Fix:** Migrate the CLI suite to vitest (already a repo-wide dev dependency) running against src/*.ts, matching shared/api/web. This drops the mandatory pre-build, lets tests typecheck, removes the brittle find|sort glob, and unifies the runner. Keep a small separate integration test where the built bin is genuinely needed.
- **Evidence:** `packages/cli/package.json:22`, `packages/cli/test/cli.test.js:21`, `packages/cli/tsconfig.json:14`

### E5.12 Root 'npm test' is fail-fast across packages, hiding downstream failures
- **Priority:** P3·low · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** root · **Tags:** quick-win
- **Problem:** Because the test stages are &&-chained, the first failing package short-circuits the rest. A red shared test masks whether api/web/cli also have failures, lengthening fix cycles (fix-rerun-discover-next), and CI reports an incomplete failure picture per run.
- **Fix:** Run package test suites independently in CI — either as separate ci.yml steps (each `npm -w <pkg> run test`) or a matrix job per package — so all failures surface in a single run. Keep the chained script for local convenience if desired.
- **Evidence:** `package.json:20`

---

## E4 · Consolidate duplication into `@evidence-browser/shared` (one SSOT)

Validation regexes, file-type detection, wire/HTTP types, ambient decls and utilities are copy-pasted across api/web/cli (and have already drifted), so security rules and contracts can silently diverge.

_8 item(s)._

### E4.1 Move files/detect + FileType into shared; they are duplicated api↔web and have already drifted
- **Priority:** **P1·high** · **Effort:** M · **Category:** duplication · **Pkg:** multi · **Tags:** quick-win, ssot, drift
- **Problem:** detectFileType/getMimeType/getShikiLanguage and the FileType type are copy-pasted into both packages/api/src/lib/files and packages/web/src/lib/files (~110 lines each, ~95% identical) instead of living in @evidence-browser/shared like every other bundle helper (api re-exports url, bundle/security, bundle/manifest, bundle/upload-validation, bundle/types from shared — verified by grep). The copies have already diverged: web maps .html to a dedicated 'html' FileType (load-bearing — file-viewer.tsx:47 routes 'html' to HtmlViewer for the safe HTML preview feature) while api still maps .html to 'code', and the api FileType union does not even contain 'html'. The two test suites assert contradictory behavior for 'reports/index.html', so neither package can be fixed to match the other without breaking its own tests — a divergence trap. Additionally the api copy uses node 'path' while web uses hand-rolled helpers, so they are not even byte-portable.
- **Fix:** Create packages/shared/src/files/detect.ts and types.ts as SSOT (use web's no-node-path basename/extname so it runs in browser+node; adopt the superset FileType union including 'html'). Add ./files/detect + ./files/types to shared's exports map and barrel. Replace both api and web detect.ts/types.ts with thin re-exports (mirroring url.ts / bundle/security.ts). Decide canonical .html once (web's 'html' is the live intent), update the single api test, and keep one test suite in shared.
- **Evidence:** `packages/web/src/lib/files/detect.ts:29`, `packages/api/src/lib/files/detect.ts:30`, `packages/web/src/lib/files/types.ts:1`, `packages/api/src/lib/files/types.ts:1`, `packages/web/src/lib/files/detect.test.ts:6`, `packages/api/src/lib/files/detect.test.ts:24`, `packages/web/src/components/viewers/file-viewer.tsx:47`, `packages/shared/package.json:12-35`, `packages/api/src/lib/files/detect.ts:1`

### E4.2 bundleId/storageKey validation regex duplicated three times and can silently drift
- **Priority:** **P1·high** · **Effort:** S · **Category:** duplication · **Pkg:** shared · **Tags:** security-hygiene
- **Problem:** The same security-critical bundleId predicate (path-traversal / case / percent-encoding / charset rules) is hand-copied in two functions inside the SSOT package itself. storageKey() builds the on-disk storage path, so if validateBundleId rules are tightened (e.g. to block a new traversal trick) but the storageKey copy is missed, the validation gate and the path-construction gate diverge — exactly the class of bug that leads to traversal. The title says 'three times' but the evidence shows TWO copies of the bundleId predicate (upload-validation + url); the storageKey workspace check is a separate, smaller predicate.
- **Fix:** Extract one `isValidBundleId(id: string): boolean` (or reuse validateBundleId) and have storageKey() call it before composing the key, so there is a single regex/predicate. Add a test asserting storageKey throws for every input validateBundleId rejects to lock the two together.
- **Evidence:** `packages/shared/src/bundle/upload-validation.ts:47-56`, `packages/shared/src/url.ts:46-57`

### E4.3 Web re-declares api wire/HTTP-contract types instead of importing a shared SSOT
- **Priority:** P2·med · **Effort:** M · **Category:** duplication · **Pkg:** multi · **Tags:** ssot, blocked-by-web-rebuild, wire-contract
- **Problem:** The HTTP response contract types (Workspace, WorkspaceWithBundleCount, ApiKeyPublic, ApiKeyScope, UserPublic) crossing the api↔web boundary are hand-maintained field-for-field in BOTH packages/web/src/lib/types.ts AND the api db layer. There is NO shared SSOT for these envelope types specifically — shared owns Manifest/TreeNode and url helpers (web DOES import those: url.ts:9 imports ParsedSegments, bundle/types.ts:1 re-exports Manifest/TreeNode), but the API response shapes are duplicated. Any change to a wire field (rename, new field, scope enum value) must be edited in two places with no compiler link, so the frontend can silently disagree with the backend payload. CORRECTION: the survey's claim that 'web imports nothing from shared for types' / 'zero import from shared' is false — the gap is specifically the API response envelopes, not all types.
- **Fix:** Add a shared API-contract module (e.g. packages/shared/src/api/types.ts) exporting Workspace, WorkspaceWithBundleCount, ApiKeyScope, ApiKeyPublic, ApiKeyWithUser, UserPublic, AuthUser, Bundle, BundleMetaResponse. Have the api db layer and web both import from it (db row types can extend the shared public type). At minimum share ApiKeyScope and Workspace (highest churn) so a wire-shape change is one compiler-enforced edit. Note: packages/web is slated for a separate rebuild, so consider whether to land this in shared now and wire the api side first.
- **Evidence:** `packages/web/src/lib/types.ts:29-41`, `packages/api/src/lib/db/workspaces.ts:4-12`, `packages/web/src/lib/types.ts:12-23`, `packages/api/src/lib/db/api-keys.ts:11-17`, `packages/web/src/lib/types.ts:7-10`

### E4.4 CLI re-declares shared types (TreeNode, Manifest, ApiKeyScope) instead of depending on @evidence-browser/shared
> ⚠️ **CONFLICT with #55/PR #56:** the project deliberately keeps the CLI tarball free of the private `@evidence-browser/shared` dependency. Dedup by **vendoring types/validators at build time** (prepack), NOT by adding a workspace dependency.
- **Priority:** P2·med · **Effort:** M · **Category:** duplication · **Pkg:** cli
- **Problem:** shared is documented as the SSOT for bundle/manifest/url logic, yet the published CLI consumes nothing from it and maintains parallel copies of TreeNode, the manifest shape, and the ApiKeyScope union. If the manifest/tree shape evolves in shared/api, the CLI's hand-written types won't follow and `eb bundle info/tree` can silently misrepresent server responses. It also means the CLI cannot reuse shared's bundleId validation or URL builders (bundleLandingUrl is reimplemented inline at upload.ts:41 as `${url}/w/${ws}/b/${bundleId}`).
- **Fix:** Add @evidence-browser/shared as a CLI dependency and import TreeNode/Manifest/ApiKeyScope (and the url builders) from it, deleting the local copies in api-client.ts. Note this forces resolving shared's private:true status — see the publishability finding.
- **Evidence:** `packages/cli/src/lib/api-client.ts:49-64`, `packages/cli/src/lib/api-client.ts:32`, `packages/cli/package.json:27-29`, `packages/shared/src/bundle/types.ts:1-13`

### E4.5 Inline-redeclare of shared Manifest shape inside web BundleMetaResponse
- **Priority:** P3·low · **Effort:** S · **Category:** duplication · **Pkg:** web · **Tags:** quick-win, ssot
- **Problem:** packages/web/src/lib/types.ts redeclares the Manifest object shape inline (lines 56-61) rather than referencing the shared Manifest type, even though the same file (line 62) already pulls TreeNode from @/lib/bundle/types which re-exports shared. If a field is added to the canonical Manifest, this inline copy drifts silently — a small instance of the SSOT pattern.
- **Fix:** Import Manifest from '@/lib/bundle/types' (forwards @evidence-browser/shared/bundle/types — already re-exports Manifest, verified) and set BundleMetaResponse.manifest: Manifest.
- **Evidence:** `packages/web/src/lib/types.ts:55-62`, `packages/shared/src/bundle/types.ts:1-6`, `packages/web/src/lib/bundle/types.ts:1`

### E4.6 cn() utility duplicated byte-for-byte between api and web
- **Priority:** P3·low · **Effort:** S · **Category:** duplication · **Pkg:** multi · **Tags:** quick-win, dead-code
- **Problem:** packages/api/src/lib/utils.ts and packages/web/src/lib/utils.ts are byte-identical (the shadcn cn Tailwind class merger). The api is a Hono backend with no JSX/className usage (grep confirms zero references), so the api copy is dead code carried along during extraction; even setting that aside it is duplicated rather than shared.
- **Fix:** Delete packages/api/src/lib/utils.ts (confirmed unused: no cn() call, no lib/utils import, no className in packages/api/src). Leaves web as the single owner. If a shared use ever emerges, hoist cn into @evidence-browser/shared rather than keeping two copies.
- **Evidence:** `packages/web/src/lib/utils.ts:1-6`, `packages/api/src/lib/utils.ts:1-6`, `packages/api/src/lib:n/a`

### E4.7 yauzl-promise type declaration duplicated verbatim in shared and api
- **Priority:** P3·low · **Effort:** S · **Category:** duplication · **Pkg:** shared · **Tags:** dead-code
- **Problem:** Both packages depend on yauzl-promise@^4 and each ships its own ambient .d.ts that is character-for-character identical. The declaration only exposes uncompressedSize/compressedSize/openReadStream and a subset of the real API; if a consumer later needs another field (e.g. for zip-bomb guarding) the two copies must be updated in lockstep or silently diverge. shared is the natural owner since it exports validateBundleZip which uses these types.
- **Fix:** Keep the declaration only in shared and have api reference it via a project reference or shared tsconfig types include, deleting packages/api/src/types/yauzl-promise.d.ts. Alternatively switch to upstream bundled types if v4 ships them and drop both.
- **Evidence:** `packages/shared/src/types/yauzl-promise.d.ts:1-17`, `packages/api/src/types/yauzl-promise.d.ts:1-17`

### E4.8 printJson and handleCommandError copy-pasted across CLI command modules
- **Priority:** P3·low · **Effort:** S · **Category:** duplication · **Pkg:** cli · **Tags:** quick-win
- **Problem:** printJson is duplicated in 3 command files and handleCommandError in 4, all byte-identical. Every command action body is the same `try { ... } catch (err) { handleCommandError(err) }` shape. This duplication is also why error-to-exit-code behavior is inconsistent across commands (see exit-code finding): there is no single place defining how a command failure maps to stderr + exit code.
- **Fix:** Move printJson and handleCommandError into packages/cli/src/lib (e.g. output.ts) and import them everywhere. Consider a small `runAction(fn)` wrapper that standardizes the try/catch so individual actions stop hand-rolling it.
- **Evidence:** `packages/cli/src/commands/bundle.ts:18-20,37-40`, `packages/cli/src/commands/workspace.ts:26-33`, `packages/cli/src/commands/api-key.ts:21-28`, `packages/cli/src/commands/auth.ts:7-10`

---

## E6 · Backend runtime hardening & operational hygiene

The live Hono API lacks a global error handler, request logging, graceful shutdown, a DB-migration mechanism and zip-bomb guards, plus several smaller correctness/robustness gaps on the upload/extract/auth surface.

_17 item(s)._

### E6.1 Add a global app.onError handler — unhandled route errors leak default 500s with no logging
- **Priority:** **P1·high** · **Effort:** M · **Category:** error-handling · **Pkg:** api · **Tags:** quick-win, cross-cutting
- **Problem:** With no centralized error boundary, an unexpected throw anywhere (DB error, storage failure, programmer bug, the setup.ts rethrow) returns Hono's default unshaped 500 and, in most routes, is never logged at all. The 4 read routes each hand-roll the same error-class-to-status mapping; the rest log nothing. This is a cross-cutting reliability + consistency gap.
- **Fix:** Add app.onError((err, c) => {...}) in createApp(): log with method/path context, map known error classes (BundleNotFoundError/ManifestValidationError/etc.) to status via a shared helper, and return a generic JSON 500 in prod. Move the per-route try/catch mapping in bundle.ts into that shared helper so routes stop duplicating it.
- **Evidence:** `packages/api/src/app.ts:14-51`, `packages/api/src/routes/setup.ts:50-55`, `packages/api/src/routes/bundle.ts:153,165,196,231`

### E6.2 DB schema is an inlined CREATE TABLE IF NOT EXISTS blob with no migration mechanism
- **Priority:** **P1·high** · **Effort:** M · **Category:** config · **Pkg:** api · **Tags:** data-safety
- **Problem:** IF-NOT-EXISTS-only schema means the SQLite database can never evolve against existing user data: any future column/constraint change needs manual SQL on every deployment's persisted volume, with no versioning, ordering, or rollback. For a self-hosted product that carries a SQLite volume across upgrades, this is a real data-safety/maintainability gap distinct from the test-coverage items already filed.
- **Fix:** Introduce a lightweight migration runner: a schema_version pragma/table plus an ordered list of migration steps applied in a transaction on getDb(). Make the current SCHEMA migration 0 and delete the stale Next.js comment at line 5.
- **Evidence:** `packages/api/src/lib/db/index.ts:6-63`, `packages/api/src/lib/db/index.ts:5`, `packages/api/src/lib/db/index.ts:79`

### E6.3 extractBundle has a check-then-act race: concurrent first-time requests extract into the same cacheDir
- **Priority:** P2·med · **Effort:** M · **Category:** complexity · **Pkg:** api · **Tags:** resource-leak
- **Problem:** The cache population has a classic check-then-act gap. Two concurrent requests for the same uncached bundle both miss the cache (cache.set is only at the very end, line 121), both write to the same cacheDir and the same __bundle.zip path, and both run the extraction loop concurrently — racing on the same files and the shared zip path. One request can unlink __bundle.zip (line 108) while the other is still opening it (line 84), yielding corrupt/half-written served files. There is no in-flight promise map to dedupe extraction.
- **Fix:** Store an in-flight Promise<CacheEntry> in the map keyed by cacheKey so concurrent callers await the same extraction; extract into a unique temp dir and atomically rename into place on success.
- **Evidence:** `packages/api/src/lib/bundle/extractor.ts:65-81`, `packages/api/src/lib/bundle/extractor.ts:82-122`

### E6.4 validateBundleZip reads entries with no file-count / total-size / per-entry guard (zip-bomb surface in shared)
- **Priority:** P2·med · **Effort:** M · **Category:** security-hygiene · **Pkg:** shared · **Tags:** security-hygiene
- **Problem:** validateBundleZip is the shared reusable 'is this a valid bundle zip' gate (the natural one a future CLI-side pre-flight would call). It walks every entry and buffers manifest.json fully into memory with zero bounds: a crafted zip with a huge declared manifest, millions of entries, or a high compression ratio is only caught later by the api extractor's limits — any other consumer (CLI, a script) calling validateBundleZip alone gets no protection. The size/count error types already live in shared but aren't wired into this function.
- **Fix:** Add bounds to validateBundleZip: cap manifest read size, cap entry count, optionally check uncompressedSize/compressedSize ratio, throwing the existing FileCountLimitError/BundleSizeLimitError. Accept limits as parameters (with sane defaults) so api can pass its env-configured values and keep one validation path.
- **Evidence:** `packages/shared/src/bundle/validate-zip.ts:14-30`, `packages/api/src/lib/bundle/extractor.ts:61-98`, `packages/shared/src/bundle/types.ts:30-44`

### E6.5 Three near-identical auth middleware blocks duplicate the API-key-vs-session branching
- **Priority:** P2·med · **Effort:** S · **Category:** duplication · **Pkg:** api · **Tags:** quick-win
- **Problem:** The bearer-token parsing, eb_ detection, getApiKeyUser call, 401 handling, and session fallback are copy-pasted across three middlewares. Any change to auth handling (rate-limiting, logging, a new key prefix) must be made in three places, and they can silently drift.
- **Fix:** Factor a single helper like requireScope(opts: { apiKeyScopes: ScopedApiKeyScope[]; sessionRoles: Role[] }) that performs the shared parsing/branching once, and define authenticate/requireAdmin/requireUpload as thin configurations of it.
- **Evidence:** `packages/api/src/middleware/auth.ts:29-44`, `packages/api/src/middleware/auth.ts:46-65`, `packages/api/src/middleware/auth.ts:67-86`

### E6.6 MCP route reimplements bearer/API-key auth separately from the auth middleware
- **Priority:** P2·med · **Effort:** S · **Category:** duplication · **Pkg:** api · **Tags:** quick-win
- **Problem:** There are two independent implementations of API-key authentication. The MCP one parses the bearer token differently (slice('Bearer '.length) with no trim vs extractBearerToken), does a non-constant-time === compare for MCP_API_KEY, and ignores scope entirely. A fix to one path (trimming, scope enforcement, expiry handling) will not reach the other.
- **Fix:** Reuse extractBearerToken/getApiKeyUser from middleware/auth.ts inside mcp.ts, and use crypto.timingSafeEqual for the MCP_API_KEY comparison instead of ===.
- **Evidence:** `packages/api/src/routes/mcp.ts:7-35`, `packages/api/src/middleware/auth.ts:9-27`

### E6.7 No request logging or request-id middleware — the API is operationally blind
- **Priority:** P2·med · **Effort:** S · **Category:** tooling-ci-build · **Pkg:** api · **Tags:** quick-win
- **Problem:** A deployed HTTP server with zero request logging and no correlation id cannot be debugged in production: you cannot tell which requests 404/500, how slow they are, or tie a user-reported failure to a log line. Baseline observability gap for the live server.
- **Fix:** Add app.use('*', logger()) (hono/logger) and app.use('*', requestId()) in createApp(); emit one structured startup line in server.ts (port/host/env); thread the request id into the bundle.ts error logs.
- **Evidence:** `packages/api/src/app.ts:14-48`, `packages/api/src/routes/bundle.ts:153,165,196,231`, `packages/api/src/server.ts:9-13`

### E6.8 No graceful shutdown — SIGTERM kills the process mid-request and leaks the better-sqlite3 handle
- **Priority:** P2·med · **Effort:** S · **Category:** error-handling · **Pkg:** api · **Tags:** quick-win
- **Problem:** Without a SIGTERM/SIGINT handler the server cannot drain in-flight requests on deploy/scale-down — long-running bundle uploads/extractions are cut off, and the WAL-mode SQLite connection is never closed cleanly. Standard production-readiness gap for a containerized service.
- **Fix:** Capture the http.Server returned by serve() in server.ts; on SIGTERM/SIGINT call server.close(() => { close DB singleton; process.exit(0) }) with a timeout fallback. Expose a closeDb() (or reuse resetDb's close path) for the shutdown handler.
- **Evidence:** `packages/api/src/server.ts:9-13`, `packages/api/src/lib/db/index.ts:92-98`, `Dockerfile:51`

### E6.9 Bundle extract cache leaks tmp directories across restarts (no boot cleanup, eviction state is in-memory only)
- **Priority:** P2·med · **Effort:** S · **Category:** complexity · **Pkg:** api · **Tags:** quick-win
- **Problem:** Each process restart strands all previously-extracted bundle directories under tmpdir because eviction relies entirely on volatile in-memory Map state and there is no boot reconciliation. Over many deploys on a long-lived volume this is a slow disk leak — a lifecycle/cleanup issue distinct from any concurrency finding.
- **Fix:** On startup, rm -rf CACHE_BASE (or scan it and reconcile against the Map). Alternatively namespace CACHE_BASE per-process via mkdtemp and clean the parent on boot so stale runs are reclaimed.
- **Evidence:** `packages/api/src/lib/bundle/extractor.ts:20-21`, `packages/api/src/lib/bundle/extractor.ts:36-53`, `packages/api/src/lib/bundle/extractor.ts:74-75`

### E6.10 Upload validates declared file.size, not actual bytes, while buffering the whole file in memory and on disk
- **Priority:** P3·low · **Effort:** M · **Category:** error-handling · **Pkg:** api · **Tags:** resource-leak
- **Problem:** The size guard runs against the multipart-declared file.size before bytes are read, and the persisted size_bytes is that same unverified number. The whole file is then materialized in a Buffer and re-written to a temp zip, so a large upload (up to MAX_BUNDLE_SIZE = 500MB default) is held entirely in RAM and duplicated to disk. Memory/throughput hygiene gap plus a recorded size that can diverge from reality.
- **Fix:** Stream the upload to the temp file and measure actual bytes written, enforcing MAX_BUNDLE_SIZE on the real size; persist the measured size. At minimum, set size_bytes from the on-disk stat of tmpZip rather than file.size.
- **Evidence:** `packages/api/src/routes/bundle.ts:94`, `packages/api/src/routes/bundle.ts:103-109`, `packages/api/src/routes/bundle.ts:130`

### E6.11 Bundle read routes skip DB/workspace existence checks, trusting URL-derived storage key
- **Priority:** P3·low · **Effort:** S · **Category:** error-handling · **Pkg:** api · **Tags:** quick-win
- **Problem:** The four read endpoints never verify the workspace exists or that a bundle row is registered; they map URL params straight to a storage key and serve whatever storage holds. This diverges from the write paths (list/upload/delete) which authoritatively check the DB. Practical risk: a storage object orphaned from the DB (or written outside the app) becomes readable, and behaviour depends on storage state rather than the authoritative DB. Note: a genuinely-missing key still 404s via BundleNotFoundError, so the survey's 'returns 200 instead of 404' framing is overstated — the delete path removes both DB row and storage object together, so true orphans are rare. The defensible debt is the inconsistent read-vs-write contract, not a live data-leak.
- **Fix:** Add a findWorkspaceBySlug + findBundle(workspace.id, bundleId) guard at the top of the meta/tree/file/preview handlers (mirroring delete) and 404 before touching storage; extract the lookup into a shared helper to avoid repetition.
- **Evidence:** `packages/api/src/routes/bundle.ts:140-156`, `packages/api/src/routes/bundle.ts:158-234`, `packages/api/src/routes/bundle.ts:43-83`

### E6.12 bundleId validation regex and path-traversal checks are duplicated across two shared modules
- **Priority:** P3·low · **Effort:** S · **Category:** duplication · **Pkg:** shared · **Tags:** quick-win
- **Problem:** The identical bundleId allow-list (same regex literal /^[a-z0-9][a-z0-9._-]{0,127}$/ and same reject conditions) lives in two shared modules: validateBundleId (upload time) and storageKey (storage-key construction). If the rules tighten (e.g. to block a newly discovered traversal vector), one copy can be missed, producing an inconsistent validation boundary. The api file is merely a re-export, so the survey's 'triplicated' wording is inaccurate.
- **Fix:** Extract a single isValidBundleId(id): boolean in shared and have both validateBundleId and storageKey() call it; keep only the differing error-shaping local.
- **Evidence:** `packages/shared/src/bundle/upload-validation.ts:44-67`, `packages/shared/src/url.ts:46-58`, `packages/api/src/lib/bundle/upload-validation.ts:1-11`

### E6.13 DATA_DIR, PORT and HOSTNAME bypass the validated env schema
- **Priority:** P3·low · **Effort:** S · **Category:** config · **Pkg:** api · **Tags:** quick-win
- **Problem:** Config is meant to flow through the zod envSchema (getEnv), but DATA_DIR is re-read raw in the DB layer (duplicating the './data' default → drift risk) and PORT/HOSTNAME are pulled directly from process.env in server.ts, so they get no validation or documentation in the schema, weakening the 'one place for config' guarantee.
- **Fix:** Add PORT and HOSTNAME to envSchema (with numeric coercion for PORT) and read DATA_DIR from getEnv() in db/index.ts instead of process.env.
- **Evidence:** `packages/api/src/lib/db/index.ts:70`, `packages/api/src/server.ts:6`, `packages/api/src/config/env.ts:17-50`

### E6.14 Hardcoded Korean error string in an otherwise English API surface
> ⚠️ **Belongs to #47 (i18n).** #47 lists the shared Korean strings but MISSES `routes/bundle.ts:116` ("번들 검증 실패"). Add this line to #47's checklist rather than filing separately.
- **Priority:** P3·low · **Effort:** S · **Category:** docs-process · **Pkg:** api · **Tags:** quick-win
- **Problem:** Every other error message in the API is English ('Workspace not found', 'Invalid form data', 'Bundle not found', etc.), but the bundle-validation fallback emits a Korean string. This inconsistency leaks into API responses/clients and complicates future i18n or log-grepping.
- **Fix:** Replace the literal with an English message such as 'Bundle validation failed' (or route it through a shared message catalog if one is introduced).
- **Evidence:** `packages/api/src/routes/bundle.ts:116`

### E6.15 Cookie Max-Age and session TTL are magic numbers duplicated across files
- **Priority:** P3·low · **Effort:** S · **Category:** complexity · **Pkg:** api · **Tags:** quick-win
- **Problem:** The 7-day session window is encoded as a magic literal in three cookie sites plus a separate constant for the DB expiry. They must be kept in sync manually; if one is changed (e.g. to 30 days) the cookie and the DB session can disagree, producing cookies that outlive their server-side session or vice versa.
- **Fix:** Define a single SESSION_TTL_SECONDS constant (derive hours from it) in the auth module and import it into auth/index.ts, routes/auth.ts, routes/setup.ts, and db/sessions.ts.
- **Evidence:** `packages/api/src/lib/auth/index.ts:113`, `packages/api/src/routes/auth.ts:22`, `packages/api/src/routes/setup.ts:46`, `packages/api/src/lib/db/sessions.ts:11`

### E6.16 API-key expiry is enforced only in JS, and the find+touch pair is duplicated across middleware and MCP
- **Priority:** P3·low · **Effort:** S · **Category:** error-handling · **Pkg:** api · **Tags:** quick-win
- **Problem:** The survey's original title ('Expired API keys still get last_used_at bumped on the MCP path') is FALSE: findApiKeyByHash returns undefined for expired keys (lines 78-83), so updateApiKeyLastUsed is never reached for an expired key on either the MCP or middleware path. The real, smaller debt is twofold: (1) expiry is enforced purely in JS — the SQL never filters expires_at, so any future caller that queries the table directly bypasses the guard; and (2) the find-then-touch pair is duplicated, non-atomic, in both getApiKeyUser and mcp.ts checkAuth.
- **Fix:** Push the expiry predicate into SQL (AND (expires_at IS NULL OR expires_at > datetime('now'))) in findApiKeyByHash as defense-in-depth, and consolidate the find+touch into a single authenticateApiKey() helper used by both middleware and mcp routes.
- **Evidence:** `packages/api/src/lib/db/api-keys.ts:69-86`, `packages/api/src/lib/db/api-keys.ts:137-142`, `packages/api/src/routes/mcp.ts:12-21`

### E6.17 S3 stream body cast to Readable with no runtime guard
- **Priority:** P3·low · **Effort:** S · **Category:** type-safety · **Pkg:** api · **Tags:** quick-win
- **Problem:** The S3 adapter blindly casts result.Body to a Node Readable, and the extractor casts the web stream to any. The AWS SDK Body type is environment-dependent; if it ever yields a Blob or web stream, toWeb(body) throws an opaque error rather than a typed/handled one. The any-cast in the extractor disables type checking on the exact stream boundary where shape matters most.
- **Fix:** Narrow result.Body with an instanceof Readable check (throwing a clear adapter error otherwise) and replace the `as any` in extractor.ts with the proper Web ReadableStream type from node:stream/web.
- **Evidence:** `packages/api/src/lib/storage/s3.ts:98-100`, `packages/api/src/lib/bundle/extractor.ts:79-80`

---

## E8 · CLI & shared-library packaging robustness

The published `eb` CLI has no build-before-publish guarantee, brittle string-matched error handling, scattered exit codes, and is blocked from depending on `shared` because `shared` is private + changeset-ignored.

_7 item(s)._

### E8.1 Natural fix (CLI depending on shared) is blocked: @evidence-browser/shared is private and changeset-ignored
> ⚠️ **CONFLICT with #55/PR #56:** "depend on shared" is the rejected approach — #55 asserts the published CLI must NOT depend on the private package. Reframe as: vendor shared code into the tarball at prepack. The real remaining debt is making that vendoring guaranteed/tested (see #55), not adding the dependency.
- **Priority:** P2·med · **Effort:** M · **Category:** dependency · **Pkg:** cli
- **Problem:** Today the CLI dodges this by duplicating types and depending only on commander. But the natural fix for the duplication above (depend on @evidence-browser/shared) is currently unshippable: shared is private:true and changeset-ignored, so a published evidence-browser-cli that imported it would fail at install with an unresolvable dependency. This is latent coupling debt: the SSOT package is structurally unable to back the one artifact that is actually published.
- **Fix:** Decide the boundary explicitly: either (a) make shared publishable (drop private, remove from changeset ignore, add version + publishConfig) so the CLI can depend on it, or (b) bundle shared into the CLI at build time (tsup/rollup noExternal) so the published CLI carries the code without a runtime npm dependency. Document the choice in release docs.
- **Evidence:** `packages/shared/package.json:4`, `.changeset/config.json:13`, `.github/workflows/release.yml:39-43`, `packages/cli/package.json:25`

### E8.2 validateApiKey detects auth failures by regex-matching the error message string
- **Priority:** P2·med · **Effort:** M · **Category:** error-handling · **Pkg:** cli
- **Problem:** The only way the CLI distinguishes 'bad key' (401) from 'server unreachable' is by string-matching the generated error message, and a second call site then string-compares the rethrown message ('Invalid API key'). Any change to the message format in api-client.request() (localizing it, changing parenthesization) silently breaks login/whoami status detection with no type error. Brittle control-flow-by-message-text.
- **Fix:** Throw a typed error from api-client.request() carrying the numeric status (e.g. class ApiError extends Error { constructor(public status: number, message: string) }), and have validateApiKey/whoami branch on err.status === 401. Update CLI tests that assert message text to assert on status.
- **Evidence:** `packages/cli/src/commands/auth.ts:104-108`, `packages/cli/src/lib/api-client.ts:143-146`, `packages/cli/src/commands/auth.ts:192`

### E8.3 CLI publishes with no build guarantee — `npm publish` can ship a stale or empty dist
- **Priority:** P2·med · **Effort:** S · **Category:** dependency · **Pkg:** cli · **Tags:** quick-win, release-integrity
- **Problem:** The published artifact's integrity depends on an out-of-band CI step rather than the package's own lifecycle scripts. A fresh clone + manual publish would ship a tarball whose bin/eb and main point at non-existent files, breaking the installed CLI. Packaging/release-correctness gap separate from changeset-visibility items already filed.
- **Fix:** Add a prepublishOnly (or prepare) script to packages/cli/package.json that runs `npm run build`, so dist is always rebuilt as part of `npm publish` and the artifact is self-contained regardless of caller.
- **Evidence:** `packages/cli/package.json:11-18`, `packages/cli/package.json:19-26`, `.github/workflows/release.yml:42-49`

### E8.4 Inconsistent exit-code / error handling: process.exit scattered through async actions, no shared convention
- **Priority:** P3·low · **Effort:** M · **Category:** error-handling · **Pkg:** cli
- **Problem:** There are three patterns for turning a failure into an exit code (bin.ts top-level catch, per-command handleCommandError, and ad-hoc console.error+process.exit in upload/whoami). For a scriptable CLI exit-code consistency is a contract (this repo's evidence-upload skill branches on success/failure). Mixed conventions make it easy to introduce a command that exits 0 on a soft failure or prints errors to stdout. NOTE: the survey's framing that whoami's exit 'inside the try cannot be caught' is misleading — those exits are intentional and run after the inner catch; the real issue is convention drift, not an uncatchable-exit bug.
- **Fix:** Standardize on one wrapper (e.g. runAction in lib/output.ts) that runs the action, prints errors to stderr, and sets a single non-zero exit code; have every command use it. Move whoami's status-based exits into the same path. Add a CLI test asserting exit codes for representative failure paths.
- **Evidence:** `packages/cli/src/commands/auth.ts:201,203`, `packages/cli/src/commands/upload.ts:22-29,42-45`, `packages/cli/src/commands/bundle.ts:37-40`, `packages/cli/src/bin.ts:4-9`

### E8.5 updateWorkspace makes a redundant GET to resolve slug->id before every PATCH
- **Priority:** P3·low · **Effort:** S · **Category:** complexity · **Pkg:** cli
- **Problem:** Every `eb workspace update` issues two HTTP round-trips: a GET to translate slug->id then the PATCH. This doubles latency and the failure surface (the GET can 404/timeout independently) and encodes an undocumented assumption that PATCH only accepts an id, not a slug — which the list/delete endpoints don't share (they accept slug directly).
- **Fix:** If the API can PATCH by slug, do so and drop the lookup. If it requires an id, expose a slug-PATCH endpoint, or at minimum reuse the already-fetched workspace object. Add a test covering the two-call path so a future single-call API doesn't silently keep the extra round-trip.
- **Evidence:** `packages/cli/src/lib/api-client.ts:251-274`

### E8.6 Mixed-language (Korean) error messages baked into shared validation/manifest errors
> ⚠️ **Already covered by #47 (i18n)** — #47 explicitly lists these shared validator strings. Don't re-file; this is the "centralize + English" half of #47.
- **Priority:** P3·low · **Effort:** S · **Category:** complexity · **Pkg:** shared · **Tags:** quick-win
- **Problem:** Within the same SSOT package, some error messages are Korean (manifest/types/validate-zip) and others English (upload-validation, url). These strings are thrown raw and surface in the CLI (which prints err.message to stderr) and in API responses. The identical Korean literals ('유효한 JSON이 아닙니다', '필수 필드 누락') are hard-duplicated across validate-zip.ts and manifest.ts, so edits must be made in two places. Structural debt (hard-coded, duplicated, language-inconsistent error copy) distinct from the separately-tracked i18n usability issues.
- **Fix:** Centralize these messages (constants or a small message map) so the duplicated literal exists once, and pick one language for thrown errors in shared (English is the lingua franca for the published CLI/API); if localized user-facing copy is needed, do it at the presentation layer, not in thrown Error messages.
- **Evidence:** `packages/shared/src/bundle/types.ts:48,55,62`, `packages/shared/src/bundle/validate-zip.ts:40,46`, `packages/shared/src/bundle/manifest.ts:35,44`, `packages/shared/src/bundle/upload-validation.ts:19`

### E8.7 shared barrel re-exports every module while package.json exposes granular subpaths — two import styles, barrel unused
- **Priority:** P3·low · **Effort:** S · **Category:** config · **Pkg:** shared
- **Problem:** shared exposes two parallel public surfaces: a root barrel (src/index.ts -> '.') and a hand-maintained subpath exports map. Every real consumer (api, web) imports only via subpaths; the root barrel is exercised by nobody (verified: zero non-subpath imports). Latent inconsistency: the barrel can drift from the exports map with no consumer catching it, muddying what the SSOT's public API is.
- **Fix:** Pick one convention. Recommended: keep the granular subpath exports (tree-shakeable, already how everyone imports) and either drop the root barrel or add a CI check that every module in the exports map stays in sync with the barrel. Document the intended import style for future consumers (incl. the CLI once it depends on shared).
- **Evidence:** `packages/shared/src/index.ts:1-6`, `packages/shared/package.json:7-36`, `packages/api/src/lib/bundle/security.ts:1`, `packages/web/src/lib/url.ts:8`

---

## E7 · Web SPA hygiene (pre-rebuild, mostly deferrable)

Error/loading-state gaps and dead code in the current Vite SPA. The SPA is slated for a separate rebuild, so most items are tagged `blocked-by-web-rebuild`; a few correctness gaps (infinite-loading on error) are worth fixing now.

_10 item(s)._

### E7.1 BundleView shows infinite "Loading bundle..." on meta/file fetch error (issue #49 still present)
> ⚠️ **DUPLICATE of #49 — in progress in PR #57. Do not register.**
- **Priority:** **P1·high** · **Effort:** S · **Category:** error-handling · **Pkg:** web · **Tags:** blocked-by-web-rebuild, quick-win
- **Problem:** A deleted, renamed, or access-denied bundle (or a bad ?path= file) renders a perpetual 'Loading bundle...' card with no error, no 404, and no recovery path. This is the exact symptom tracked in issue #49 and it is still unfixed. Admin pages and Settings handle query errors but the bundle viewer -- the core feature -- does not.
- **Fix:** In BundleView read metaQuery.isError/error and render an error/not-found Card (distinguish 404 via ApiError.status) instead of the loading fallback; likewise surface fileQuery.error in the content branch. Reuse the existing AdminQueryState pattern.
- **Evidence:** `packages/web/src/router.tsx:323-350`, `packages/web/src/router.tsx:331`, `packages/web/src/router.tsx:483-491`

### E7.2 No app-level error boundary or router errorComponent/notFoundComponent — any thrown error white-screens the SPA
> ⚠️ **Likely in scope of PR #57 (#49). Verify against that diff before filing.**
- **Priority:** P2·med · **Effort:** S · **Category:** error-handling · **Pkg:** web · **Tags:** blocked-by-web-rebuild
- **Problem:** Any render-time exception or unhandled query throw (e.g. malformed manifest from a corrupt bundle, a viewer crash) unmounts the whole app to a blank page with no message and no way back. There is no global safety net.
- **Fix:** Add a defaultErrorComponent and defaultNotFoundComponent to createRouter, and/or wrap AppRouter in a React error boundary that renders a recoverable fallback.
- **Evidence:** `packages/web/src/router.tsx:973`, `packages/web/src/main.tsx:7-11`

### E7.3 WorkspacePage and its bundle list never surface query errors (silent failure / possible redirect churn)
> ⚠️ **Possibly in scope of PR #57 (#49). Verify against that diff before filing.**
- **Priority:** P2·med · **Effort:** S · **Category:** error-handling · **Pkg:** web · **Tags:** blocked-by-web-rebuild
- **Problem:** Backend/network errors are indistinguishable from empty results: a failed bundle fetch masquerades as 'no bundles', and a failed workspace fetch silently redirects away from a valid URL. This erodes trust and makes incidents hard to diagnose from the UI.
- **Fix:** Read bundlesQuery.error and render a distinct error Card; gate the line-227 redirect on `!workspacesQuery.isError` (only redirect when the list loaded successfully and the slug truly isn't present).
- **Evidence:** `packages/web/src/router.tsx:226-230`, `packages/web/src/router.tsx:270-291`

### E7.4 File-extension classification duplicated across detect.ts and tree-node.tsx (and diverged from legacy)
- **Priority:** P2·med · **Effort:** S · **Category:** duplication · **Pkg:** web · **Tags:** blocked-by-web-rebuild
- **Problem:** Three independent copies of the same extension->type knowledge. Adding/changing a supported file type requires editing detect.ts AND tree-node.tsx (and they can silently disagree, e.g. the file tree showing the wrong icon for a type detect.ts handles). The legacy divergence on .html is concrete evidence this drifts.
- **Fix:** Have tree-node.tsx's getFileIcon derive its icon from detectFileType(name) from @/lib/files/detect instead of maintaining its own Sets; collapse to one source of truth.
- **Evidence:** `packages/web/src/lib/files/detect.ts:3-46`, `packages/web/src/components/file-tree/tree-node.tsx:11-18`, `packages/legacy/src/lib/files/detect.ts:30`

### E7.5 Upload flow re-implements api.uploadBundle with raw XHR, hardcoding the endpoint
- **Priority:** P3·low · **Effort:** M · **Category:** duplication · **Pkg:** web · **Tags:** blocked-by-web-rebuild
- **Problem:** Two divergent code paths for the same upload endpoint: the form duplicates the URL, credential handling, and error parsing that the typed api layer centralizes. The endpoint path is now hardcoded in two places, so a route change must be made twice, and the form's ad-hoc error parsing won't match ApiError semantics used elsewhere.
- **Fix:** Either route the upload through api.uploadBundle (acceptable if progress isn't required), or extract a single api.uploadBundleWithProgress(ws, formData, onProgress) helper in lib/api.ts and have the form call it so the endpoint and error handling live in one place.
- **Evidence:** `packages/web/src/components/bundle/upload-form.tsx:36-59`, `packages/web/src/lib/api.ts:58-62`

### E7.6 Dead API method api.getBundleTree is never called
- **Priority:** P3·low · **Effort:** S · **Category:** dead-code · **Pkg:** web · **Tags:** blocked-by-web-rebuild, quick-win
- **Problem:** Unused public API surface that suggests a second data path for the file tree which doesn't exist, misleading future maintainers and keeping the corresponding backend route 'load-bearing' by appearance only.
- **Fix:** Remove getBundleTree from the api object (or wire the tree to use it if that was the intent), eliminating the dead inline import() type as well.
- **Evidence:** `packages/web/src/lib/api.ts:67-68`

### E7.7 Unused barrel re-exports in component index files
- **Priority:** P3·low · **Effort:** S · **Category:** dead-code · **Pkg:** web · **Tags:** blocked-by-web-rebuild, quick-win
- **Problem:** Barrel files imply a public module boundary that callers don't actually use, adding maintenance surface and a small risk of pulling extra modules into a chunk. The layout barrel is entirely unused.
- **Fix:** Delete packages/web/src/components/layout/index.ts (unused) and trim viewers/index.ts to the symbols actually imported through it, or standardize on the barrel and import through it consistently.
- **Evidence:** `packages/web/src/components/layout/index.ts:1-3`, `packages/web/src/components/viewers/index.ts:1-7`

### E7.8 Markdown sanitizer drops the src protocol allowlist, weakening defense-in-depth
- **Priority:** P3·low · **Effort:** S · **Category:** security-hygiene · **Pkg:** web · **Tags:** blocked-by-web-rebuild, quick-win
- **Problem:** Removing the src protocol allowlist broadens what the sanitizer accepts on any src-bearing element rendered outside the custom img renderer (defense-in-depth regression). href protocols remain restricted so this is not a confirmed XSS, but it loosens the sanitizer for no functional gain since the img renderer handles relative paths itself.
- **Fix:** Keep the default src allowlist intact (don't strip it) — the custom img component already resolves relative bundle paths, so relax nothing at the schema level. If a relative img must survive sanitization pre-render, add 'data'/relative handling narrowly rather than removing the allowlist.
- **Evidence:** `packages/web/src/components/viewers/markdown-viewer.tsx:26-33`, `packages/web/src/components/viewers/markdown-viewer.tsx:54-61`

### E7.9 Stale Next.js "use client" directives copied into Vite SPA (18 files)
- **Priority:** P3·low · **Effort:** S · **Category:** dead-code · **Pkg:** web · **Tags:** blocked-by-web-rebuild, quick-win, blocked-by-legacy-removal
- **Problem:** These directives are meaningless in a Vite SPA and signal the components were copied wholesale from the Next.js legacy app without cleanup. They mislead readers into thinking RSC/client-boundary semantics apply and are a marker of unfinished migration hygiene.
- **Fix:** Remove all 'use client' directives from packages/web/src (single mechanical sweep); optionally add an ESLint rule to forbid them in this package.
- **Evidence:** `packages/web/src/components/viewers/markdown-viewer.tsx:1`, `packages/web/src/components/file-tree/tree-context.tsx:1`

### E7.10 FileTree's `bundleId` prop is actually a display title, not an id — misleading typing
- **Priority:** P3·low · **Effort:** S · **Category:** type-safety · **Pkg:** web · **Tags:** blocked-by-web-rebuild, quick-win
- **Problem:** A prop named bundleId that carries the manifest title invites bugs the moment someone trusts the name (e.g. building a URL from it). It's a small but real correctness trap in shared viewer plumbing.
- **Fix:** Rename the prop to `title` (or `label`) in FileTreeProps and update the single caller in router.tsx; the actual id already comes from context.
- **Evidence:** `packages/web/src/components/file-tree/file-tree.tsx:8-14`, `packages/web/src/router.tsx:336`

---

## Method note

Findings were produced by 9 parallel survey agents (one per lens: legacy dead-code, duplication, tooling/CI, backend quality, shared/CLI quality, web quality, types/config/deps, test coverage, docs/process) and then each lane was re-checked by an independent adversarial verifier that opened the cited files; a completeness critic added 6 cross-cutting items (runtime hygiene, migrations, CLI release). One finding ("CLI command modules untested") was rejected as already-covered. Pure README/onboarding/usability items were intentionally excluded — they are covered by the prior PO audit (issues #40–#49).
