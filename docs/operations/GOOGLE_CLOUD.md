# CiteLadder Google Cloud hosting

Follow [GCP_RUNBOOK.md](GCP_RUNBOOK.md) for the executable owner procedure.
This document is the hosting design and security contract. Accepted
1 October 2026.

## Summary

```text
Marketing Worker (citeladder.com)   ─┐
Product Worker (app.citeladder.com) ─┴─ origin token ─► Cloud Run API (us-central1, min 0 / max 2)
Docs Worker (static, no origin)                            │ starts runner after committed work
                         Cloud Scheduler (OIDC) ──► API /internal/tick (every 20 min)
                                                           ▼ Direct VPC egress (API and jobs)
                                                 e2-micro PostgreSQL 16 VM (no public IP)
```

- Current application/database hosting: Google Cloud, United States (`us-central1`).
  One reused GCP project; there is no project-creation or
  project-deletion automation.
- Target under ₹500 a month in fixed hosting. The e2-micro with a 30 GB
  standard disk is free-tier, and Cloud Run scales to zero. A monthly budget
  alerts at 50%, 90% and 100% and on forecast spend. Provider usage (models,
  JEV, DataForSEO) and the domain are excluded.
- Availability is single-database and best-effort. No backups are kept: a
  database reset replaces the VM. The owner accepted this pre-launch.
- us-central1 adds about 250 ms per API round trip from India (owner
  decision, 1 October 2026).

## Security contract

- **Ingress.** Cloud Run accepts all traffic at the network edge but disables
  IAM invocation checks. The API admits a request only with the Workers'
  origin token (current or rotating previous). It also requires an allowlisted
  public host (`citeladder.com` or `app.citeladder.com`), and that applies to
  `/health`, `/ready` and MCP too. The admitted host drives MCP origin checks.
  The admitted `X-CiteLadder-Client-IP` (Cloudflare's `CF-Connecting-IP`)
  drives per-visitor rate limits. Workers strip any client-supplied copies of
  these headers. The startup probe is TCP. The single exception is
  `POST /internal/tick`: it skips the origin token and admits only a
  Google-signed ID token for the scheduler account with the configured
  audience, and it is served only when both are configured.
- **Database.** The VM has no external address. PostgreSQL accepts
  `hostssl` SCRAM connections for `citeladder` only from the private subnet,
  plus loopback for break-glass shells. The firewall admits 5432 from the
  subnet and 22 from IAP only, for the owner's own account (the break-glass
  database shell and the operator account tool's tunnel); the deployer holds
  no SSH or IAP role. OS Login is on, project SSH keys are blocked and the
  serial port is disabled. It runs Shielded VM with Secure Boot, vTPM and
  integrity monitoring.
- **Identities.** The deployer authenticates through Workload Identity
  Federation pinned to `Cube-27/Citeladder`, `refs/heads/main` and the
  `gcp-demo` environment. No service-account keys exist. The API account
  (`citeladder-api`) and the job account (`citeladder-runtime`, for the
  runner, migrate and billing jobs) read the shared runtime secrets; only the
  API account reads the origin tokens and the Turnstile secret. Each may
  start only the runner job and mint crawl-log reader tokens. The scheduler
  account holds no grant; its ID token admits only the API's tick route. The
  database account reads only the database password, pulls from the image
  repository and writes logs.
- **Secrets.** Terraform declares Secret Manager containers only. The deploy
  workflow writes values through stdin; generated secrets never leave GCP.
  Cloud Run references them by name at `latest`, so values are absent from
  state, arguments, logs and outputs. After synchronizing a secret the deploy
  destroys its superseded versions; a rotation's old value lives in its own
  `-previous` secret, never in an older version.
- **Images.** Every image is deployed by immutable digest from one Artifact
  Registry repository. Tags stay mutable because immutable tags block the
  cleanup policy, which keeps the last three versions of each image and
  deletes others after seven days.
- **Scale-to-zero.** Nothing except PostgreSQL runs continuously, and nothing
  except PostgreSQL runs on the VM. The API starts a runner execution only
  after committed queue or billing work, or when the scheduled tick finds a
  lane with work due; the tick itself never starts a job. Leases make duplicate executions
  harmless, and a single drain lock bounds database connections.
- **No self-mutation.** Automation never deletes the project, never stops the
  database on a timer, and never publishes the Workers. The Workers deploy
  through their own protected workflows.

## Implemented owners

- `infra/gcp/*.tf`, `infra/gcp/postgres-vm.sh`, `infra/gcp/postgres/Dockerfile`:
  the environment ([README](../../infra/gcp/README.md)).
- `infra/gcp/bootstrap.ps1`: APIs, state bucket, deployer and WIF trust.
- `.github/workflows/gcp-deploy.yml`: green `ci.yml` run for the exact commit,
  images, secrets, migration, Terraform and smoke.
- `frontend/services/api/src/http/origin-token.ts`: origin admission, public
  host and client address.
- `frontend/services/api/src/workers/runner.ts`, `start-runner.ts`,
  `scheduled-tick.ts`: runner, periodic owners, wake-up and the scheduled tick.

## Acceptance

- The deploy smoke expects authenticated `/ready`, the OAuth provider catalog
  and MCP metadata to return `200`. An anonymous or foreign-host request must
  return `403`, and so must an unauthenticated `POST /internal/tick`. A forced
  run of the tick scheduler must succeed.
- Owner acceptance after the Worker deploys: sign-in, project creation, a
  Site Health crawl reaching a terminal state through runner executions, and a
  Search Console connection.
- After seven days, the bill by SKU shows no unexpected non-zero line.
