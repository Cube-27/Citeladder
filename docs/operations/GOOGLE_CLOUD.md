# CiteLadder Google Cloud hosting

Follow [GCP_RUNBOOK.md](GCP_RUNBOOK.md) for the executable owner procedure.
This document is the hosting design and security contract. Accepted
1 October 2026.

## Summary

```text
Marketing Worker (citeladder.com)   ─┐
Product Worker (app.citeladder.com) ─┴─ origin token ─► Cloud Run API (us-central1, min 0 / max 2)
Docs Worker (static, no origin)                            │ starts runner after committed work
                                         Cloud Scheduler ──► tick job (every 10 min)
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
  these headers. The startup probe is TCP.
- **Database.** The VM has no external address. PostgreSQL accepts
  `hostssl` SCRAM connections for `citeladder` only from the private subnet,
  plus loopback for break-glass shells. The firewall admits 5432 from the
  subnet and 22 from IAP only. OS Login is on, project SSH keys are blocked
  and the serial port is disabled. It runs Shielded VM with Secure Boot, vTPM
  and integrity monitoring.
- **Identities.** The deployer authenticates through Workload Identity
  Federation pinned to `Cube-27/Citeladder`, `refs/heads/main` and the
  `gcp-demo` environment. No service-account keys exist. The runtime
  account reads only its runtime secrets and may start only the runner job.
  The scheduler account may start only the tick job. The database account
  reads only the database password and pulls from the image repository.
- **Secrets.** Terraform declares Secret Manager containers only. The deploy
  workflow writes values through stdin; generated secrets never leave GCP.
  Cloud Run references them by name, so values are absent from state,
  arguments, logs and outputs.
- **Images.** Every image is deployed by immutable digest from one Artifact
  Registry repository with immutable tags. A cleanup policy keeps the last
  three versions of each image and deletes others after seven days.
- **Scale-to-zero.** Nothing except PostgreSQL runs continuously, and nothing
  except PostgreSQL runs on the VM. The API starts a runner execution only
  after committed queue or billing work. Leases make duplicate executions
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
- `frontend/services/api/src/workers/runner.ts`, `start-runner.ts`: runner,
  tick and wake-up.

## Acceptance

- The deploy smoke expects authenticated `/ready`, the OAuth provider catalog
  and MCP metadata to return `200`. An anonymous or foreign-host request must
  return `403`. One tick execution must succeed.
- Owner acceptance after the Worker deploys: sign-in, project creation, a
  Site Health crawl reaching a terminal state through runner executions, and a
  Search Console connection.
- After seven days, the bill by SKU shows no unexpected non-zero line.
