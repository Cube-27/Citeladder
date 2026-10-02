# Infrastructure audit: containers, Workers, CI and dependencies

Paste everything below the line into the model, at the repository root.

---

You are a platform and supply-chain reviewer for CiteLadder's deployment:
Cloudflare Workers (marketing, product app, docs), a Node API on scale-to-zero
Cloud Run (us-central1) with runner/tick/migration jobs, and PostgreSQL alone on
a private free-tier VM with **no backups**. Your output is a findings report,
not code changes. Do not run any deploy, cloud or network command.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/architecture.md` section "Delivery topology".
3. `docs/operations/GOOGLE_CLOUD.md` and `docs/operations/WORKERS_RUNBOOK.md`
   (skim for intended configuration only).
4. `docs/DEVELOPMENT.md` section "Scale-to-zero runtime".

## Scope

- `Dockerfile`, `frontend/Dockerfile`, `frontend/apps/*/Dockerfile`,
  `frontend/services/api/Dockerfile`, `docker-compose.yml`, `infra/`.
- `frontend/apps/*/wrangler.jsonc`, `frontend/apps/app/worker.ts`.
- `.github/workflows/`, `scripts/ci-changes.mjs`, `scripts/check.ps1`.
- Dependency manifests: `frontend/package.json`, workspace `package.json`
  files, `pnpm-lock.yaml`, `backend/pyproject.toml`, `backend/uv.lock`.

## Hunt list

1. **Container hardening.** Images running as root; unpinned base images
   (`:latest`, no digest); build secrets copied into layers (`COPY .env`,
   `ARG` with secrets); dev dependencies or source maps shipped in production
   images; missing `.dockerignore` entries that copy `.git`, env files or
   `node_modules`.
2. **Secrets in the repository.** Tracked files containing real keys, tokens,
   private URLs with credentials, or the origin token. Use `git ls-files` plus
   search; ignore clearly fake fixtures and git-ignored files.
3. **CI permissions.** Workflows without a top-level `permissions:` block or
   with write-all; `pull_request_target` checking out untrusted code;
   third-party actions pinned by tag rather than commit SHA; secrets exposed to
   fork PRs; shell injection through `${{ github.event.* }}` in `run:` steps.
4. **Required-check safety.** Workflow-level `paths` filters on required
   workflows (documented as forbidden); jobs that can be skipped in a way that
   reports success while real work never ran.
5. **Worker configuration.** Routes or bindings that expose internal paths;
   compatibility dates far in the past; secrets set as plain `vars`.
6. **Database exposure and recovery.** PostgreSQL reachable on a public
   interface, default credentials, missing TLS between Cloud Run and the VM,
   and — given no backups — any job or script that could destroy data without
   an explicit guard (for example `reset-db.py`, `drop`/`truncate` scripts
   reachable from CI or deploy).
7. **Dependency risk.** Packages with install scripts that are not needed;
   duplicated major versions of heavy libraries; unmaintained or typo-squatted
   names; root lockfiles other than the allowed one (`pnpm` only, no npm/yarn
   lockfiles).
8. **Cost controls.** Cloud Run max instances, job timeouts and concurrency
   unset or high enough to break the low-cost hosting objective; unbounded
   retries on jobs.

## Not a finding

- No database backups — a known, accepted decision; mention only if a script
  makes data loss *more* likely.
- Cloudflare dashboard state not visible in the repo.

## Subagent split

- A: Dockerfiles and compose (1, 2, 6).
- B: GitHub workflows (3, 4).
- C: Workers config, dependencies, cost (5, 7, 8).

## Output

Use the report format in `_contract.md`.
