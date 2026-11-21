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
  public host (`citeladder.com`, `app.citeladder.com` or `api.citeladder.com`,
  from `PUBLIC_WEBSITE_URL`, `FRONTEND_URL` and `PUBLIC_API_URL`), and that applies to
  `/ready` and MCP too. The admitted host drives MCP origin checks.
  The admitted `X-CiteLadder-Client-IP` (Cloudflare's `CF-Connecting-IP`)
  drives per-visitor rate limits. Workers strip any client-supplied copies of
  these headers. There are two exceptions. `GET /health` answers the constant
  `{"status":"ok"}` without the origin token, because the HTTP liveness probe
  and the uptime check cannot sign (owner, AR-10); it reads nothing. The startup
  probe stays TCP. `POST /internal/tick` skips the origin token and admits only a
  Google-signed ID token for the scheduler account with the configured
  audience, and it is served only when both are configured.
- **Monitoring.** An uptime check calls `GET /health` every five minutes from
  three regions. Email alerts, to the address in the `gcp-demo` environment's
  `GCP_ALERT_EMAIL` variable, fire on: a failing uptime check; any API 5xx response in
  five minutes; any failed job execution; a billing webhook entering quarantine;
  and a database larger than `database_size_alert_gb` (20 GB of the 30 GB disk).
  The webhook and database alerts read log-based metrics from the API's
  structured logs, which carry Cloud Logging `severity`.
- **Database.** The VM has no external address. PostgreSQL accepts
  `hostssl` SCRAM connections to the `citeladder` database only from the
  private subnet, plus loopback for break-glass shells, for two roles: the
  bootstrap superuser `citeladder`, which owns the schema and which only the
  migrate job uses (`citeladder-migration-database-url`), and the
  least-privilege `citeladder_app` that the API, runner and billing jobs use
  (`citeladder-database-url`). `citeladder_app` reads and writes rows only: no
  DDL, and no UPDATE or DELETE on append-only evidence, attempt and ledger
  tables. The migrate job sets its password from `citeladder-db-app-password`
  on every run. The firewall admits 5432 from the
  subnet and 22 from IAP only, for the owner's own account (the break-glass
  database shell and the operator account tool's tunnel); the deployer holds
  no SSH or IAP role. OS Login is on, project SSH keys are blocked and the
  serial port is disabled. It runs Shielded VM with Secure Boot, vTPM and
  integrity monitoring.
- **Database flags.** The container arguments in `infra/gcp/postgres-vm.sh`
  fit the planner and memory to a 1 GB, 0.25 vCPU VM whose database fits in
  RAM: no parallel query workers (on a quarter vCPU they only add CPU
  contention), `random_page_cost=1.5` with `effective_cache_size=512MB` (at the
  default 4 the planner seq-scanned `site_urls` rather than probe its indexes)
  and `work_mem=8MB` (4 MB spilled crawl-time sorts to temp files).
  `max_connections` is 40: two API instances at `DB_POOL_SIZE` 6
  (`infra/gcp/locals.tf`) plus each runner execution's `RUNNER_DB_POOL_SIZE` 4
  and its drain-lock session. The arguments also turn JIT off (short OLTP
  statements only paid its compile cost), preload `pg_stat_statements` with
  planning time tracked, and turn on `track_io_timing`, lock-wait logging,
  logging of autovacuum runs of 1 s or longer and slow-statement logging at
  500 ms without bind values. The start script creates the extension
  in its own `monitoring` schema, since the migrate job refuses a first apply
  over a non-empty `public`; read it as `monitoring.pg_stat_statements` from
  the read-only `citeladder` session of the
  [daily operation](GCP_RUNBOOK.md#3-daily-operation) tunnel (a superuser, so
  it already sees every role's statements; no `pg_read_all_stats` grant
  needed). GCP Deploy restarts the VM when the script changes, which recreates
  the container: about a minute of downtime, so deploy it with no crawl running.
  Owner trials, not shipped: `wal_compression=lz4`, `checkpoint_timeout=15min`
  and `max_wal_size=2GB`. Add one at a time and keep it only if WAL bytes per
  analyzed page fall without the VM's CPU rising; otherwise remove it.
- **Identities.** The deployer authenticates through Workload Identity
  Federation pinned to the `Cube-27/Citeladder` repository (name and immutable
  ID), the `gcp-deploy.yml` workflow, `refs/heads/main` and the `gcp-demo`
  environment; no other workflow can obtain credentials. No service-account
  keys exist. The deployer is still powerful: it administers Cloud Run, Cloud
  Scheduler, Artifact Registry and the project's service accounts, may act as
  any of them, manages the database VM, VPC and firewall rules, and edits the
  logging exclusion, log-based metrics, uptime checks, alert policies,
  notification channels and the billing budget. It cannot edit project IAM. On
  Secret Manager it manages containers and their IAM project-wide, and reads
  and writes versions only of the CiteLadder runtime secrets. On Cloud
  Storage it holds only the Terraform state bucket. The API account
  (`citeladder-runtime`, an account ID older than the split), the job
  account (`citeladder-jobs`, for the runner and billing jobs) and the migrate
  account (`citeladder-migrate`) read the shared runtime secrets; only the
  API account reads the origin tokens and the Turnstile secret, and only the
  migrate account reads the schema owner's database URL. The API and job
  accounts may start only the runner job and mint crawl-log reader tokens;
  only the job account may start it with environment overrides
  (`roles/run.jobsExecutorWithOverrides`, for the runner handover). The
  migrate account holds no other grant. The scheduler
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

## Acceptance

- The deploy creates each API revision with no traffic and smokes it at its
  tagged URL: authenticated `/ready`, the OAuth provider catalog and MCP
  metadata must return `200`, and so must an anonymous `GET /health`. An
  anonymous or foreign-host `/ready` must return `403`, and so must an
  unauthenticated `POST /internal/tick`. A failed smoke
  leaves the previous revision serving all traffic. After the shift, a forced
  run of the tick scheduler must succeed.
- Owner acceptance after the Worker deploys: sign-in, project creation, a
  Site Health crawl reaching a terminal state through runner executions, and a
  Search Console connection.
- After seven days, the bill by SKU shows no unexpected non-zero line.
