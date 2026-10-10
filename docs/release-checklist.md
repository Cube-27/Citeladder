# Release checklist

This checklist is for maintainers preparing a release after the change set has merged. It does
not authorize a release by itself: do **not** create a tag, GitHub release, or package publication
until every applicable gate is complete and the release owner approves the exact commit.

## 1. Select the candidate

- [ ] The candidate is a merged commit on the protected release branch.
- [ ] The version and scope are agreed, and the GitHub release notes for the candidate are
      drafted from its merged pull requests.
- [ ] Open dependency PRs are reviewed independently; grouped Dependabot patch/minor updates do
      not bypass normal CI or review.
- [ ] Required security fixes, migrations, configuration changes, and rollback notes are known.

## 2. Verify from a clean clone

Use a new directory with no inherited application files, local databases, or dependency caches as
the release evidence. Do not substitute an already-running development stack.

```bash
git clone <repository-url> citeladder-release-check
cd citeladder-release-check
git checkout <candidate-commit>
cp .env.example .env
# Edit only local or deployment-specific values; do not commit this file.

env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)" \
  docker compose --env-file .env -f docker-compose.yml \
  up -d --build --force-recreate

env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)" \
  docker compose --env-file .env -f docker-compose.yml ps
# The Workers may still be starting; retry until they answer.
curl -fsS --retry 20 --retry-delay 3 --retry-all-errors --max-time 10 http://127.0.0.1:3000/
curl -fsS --retry 20 --retry-delay 3 --retry-all-errors --max-time 10 http://127.0.0.1:3001/health
node scripts/frontend-ingress-smoke.mjs http://127.0.0.1:3000 http://127.0.0.1:3001
curl -fsS http://localhost:8100/health
```

- [ ] Compose reports the migration job completed successfully and the API/frontend services are
      healthy or running as designed.
- [ ] Marketing loads through port 3000, where `/login` and `/api/*` return 404.
      `/login`, direct app refreshes and their CSS/JS load through port 3001;
      missing assets return 404. Browser requests use relative `/api/*` routes on 3001.
- [ ] The local Workerd marketing runtime serves initial HTML and the public
      catalog through the disposable Compose upstream. Production Worker Custom
      Domains and split-origin callbacks are verified separately through the
      [Workers runbook](operations/WORKERS_RUNBOOK.md).
- [ ] Both hosts refuse machine paths: `/v1/*` is 404 on ports 3000 and 3001 (the smoke
      checks it). After a production deploy, rerun the smoke with the API host as the third
      argument (`https://api.citeladder.com`) so it also checks that the API host refuses
      `/`, `/pricing` and `/api/v1/*`; see the
      [API host section](operations/WORKERS_RUNBOOK.md#api-host-apiciteladdercom).
- [ ] The API health endpoint responds at port 8100.
- [ ] Smoke-test the appropriate authenticated and worker-backed flows with non-production data.
- [ ] Stop the evidence stack when finished: `env -u POSTGRES_PASSWORD -u POSTGRES_USER
      -u POSTGRES_DB -u DATABASE_URL POSTGRES_PASSWORD="$(grep -E
      '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)" docker compose --env-file .env -f
      docker-compose.yml down` (use `down -v` only when deleting disposable data).

## 3. Run repository gates

Use the canonical repository completion and CI owners from
[`DEVELOPMENT.md`](DEVELOPMENT.md). For an explicit local release diagnostic,
run all static checks and use CI for full test suites; do not maintain a second
partial gate recipe here.

```powershell
.\scripts\check.ps1
```

- [ ] Required backend, frontend, security, migration, and end-to-end checks pass.
- [ ] CI passes for the exact candidate commit.
- [ ] Deployment settings use real deployment secrets and origins; no `.env` file or local secret
      has entered the candidate.
- [ ] Rollback owner, target, and verification steps are recorded for production changes.

## Outstanding feature acceptance

Retiring implementation plans from the working queue does not establish release
acceptance. The following recorded requirements remain unresolved unless actual
evidence for the release candidate satisfies them:

- Site Health PR4: observed Searchable and Flourist live crawls; offline labelled
  cases do not substitute for those observations.
- Commerce: disposable-database migration/crawl/CSV and 100-product reference
  evaluation, a bounded credentialed Tavily check with call count, and
  credentialed audit/schedule validation.
- AI Visibility: bounded live DataForSEO acceptance for both scrapers, all-six
  coexistence, citations, available ChatGPT fanouts, costs and partial failure.
  Enable selection only after the full path and focused checks pass; native tests
  alone do not establish live acceptance. On rollback, disable new admission,
  retain historical evidence and allow accepted paid tasks to finish retrieval.
- Billing: commercial/tax confirmation, real provider test-mode acceptance,
  separate live-readiness approval and observed production alert delivery.
  [Provider readiness](billing-provider-readiness.md) and the
  [operator guide](operations/billing-operator-guide.md) govern execution.
- Infrastructure: durability, backup/restore, observability and deployment
  acceptance remain operational requirements, not completed work inferred from
  a retired hardening proposal.
  [Google Cloud acceptance](operations/GOOGLE_CLOUD.md) and the
  [runbook](operations/GCP_RUNBOOK.md) remain live procedures.

These gates authorize no provider call, reset, deployment or payment. A separate
operation must identify its target and scope explicitly.

## 4. Create the release only after approval

- [ ] Obtain release-owner approval for the candidate commit, version, and final release notes.
- [ ] Create the annotated tag and release from that exact approved commit.
- [ ] Publish artifacts only after the tag/release exists and deployment verification is recorded.
