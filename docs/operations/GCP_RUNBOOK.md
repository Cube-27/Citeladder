# CiteLadder GCP Runbook

This is the owner procedure for production hosting. The design target is under
₹500 a month in fixed hosting, excluding provider usage (models, JEV,
DataForSEO) and the domain. Background and decisions are in the
[low-cost hosting plan](../plans/citeladder-typescript-migration.md#9-low-cost-hosting-prs-2124-proposed-1-october-2026).
Terraform lives in [`infra/gcp`](../../infra/gcp/README.md). Never place a
long-lived Google service-account key in GitHub.

```text
Browser ─► Cloudflare Workers (marketing citeladder.com, app app.citeladder.com, docs)
              │ /api/* and MCP, with X-CiteLadder-Origin-Token
              ▼
         Cloud Run us-central1: citeladder-api (min 0, max 2)
              │ commits work, then starts ─► job citeladder-runner (drain, exit)
              │ Cloud Scheduler every 10 min ─► job citeladder-tick
              │ deploy only ─► job citeladder-migrate (Alembic + dev bootstrap)
              ▼ Direct VPC egress (private IP 10.28.0.10)
         e2-micro VM citeladder-db (free tier, COS, no public IP): PostgreSQL 16 only
```

There are no backups. The database lives on the VM's boot disk; replacing
the VM is the explicit database reset. The GCP project is reused and is never
deleted by automation.

## 1. One-time owner setup

### 1.1 Workstation

Install Google Cloud CLI, Terraform 1.10.5 or later, PowerShell 7.3 or later,
and the GitHub CLI. Then authenticate:

```powershell
gcloud auth login
gcloud auth application-default login
gcloud config set project project-setup-20260711
```

### 1.2 Re-run the bootstrap (us-central1)

From an up-to-date `main` at the repository root, reuse the existing project
and state bucket:

```powershell
./infra/gcp/bootstrap.ps1 `
  -ProjectId 'project-setup-20260711' `
  -BillingAccount '<BILLING_ACCOUNT_ID>' `
  -StateBucket 'project-setup-20260711-tfstate'
```

`gcloud billing projects describe project-setup-20260711` shows the billing
account. The script is idempotent. It enables Cloud Run and Cloud Scheduler,
grants the deployer `run.admin` and `cloudscheduler.admin`, and removes the
retired SSH/IAP and project-deletion grants. It also relabels the project
`environment=production` and keeps the existing GitHub OIDC trust for
`Cube-27/Citeladder`, `refs/heads/main` and the `gcp-demo` environment. Its
printed `NAME=value` lines are the values for section 1.3.

### 1.3 GitHub `gcp-demo` environment: variables

GitHub → `Cube-27/Citeladder` → Settings → Environments → `gcp-demo` →
Environment variables. Keep the environment restricted to `main` with the
owner as required reviewer.

| Variable | Action | Value |
|---|---|---|
| `GCP_PROJECT_ID` | keep | `project-setup-20260711` |
| `GCP_REGION` | **change** | `us-central1` (also the default) |
| `GCP_ZONE` | **change** | `us-central1-a` (any `us-central1-*` zone) |
| `GCP_WIF_PROVIDER` | keep | bootstrap output |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | keep | bootstrap output |
| `GCP_TF_STATE_BUCKET` | keep | `project-setup-20260711-tfstate` |
| `GCP_BILLING_ACCOUNT` | keep | billing-account ID |
| `GCP_BUDGET_CURRENCY_CODE` | keep | `INR` (default) |
| `GCP_BUDGET_UNITS` | **change** | `500` (default) |
| `DEFAULT_AGENT_BASE_URL` | keep, required | HTTPS base URL of the platform Agent provider |
| `DEFAULT_AGENT_MODEL` | keep, required | exact provider model ID |
| `DOMAIN_NAME` | optional | `citeladder.com` (default) |
| `APP_DOMAIN_NAME` | optional | `app.citeladder.com` (default) |
| `DEMO_MODE` | optional | `false` (default); `true` restores the single-account demo |
| `DEMO_EXPIRES_AT` | optional | RFC 3339; required only when `DEMO_MODE=true` |
| `DEMO_LOGIN_EMAIL` | optional | defaults to `dev@citeladder.com` |
| `DEV_LOGIN_COUNTER_ALLOWANCE` | optional | defaults to `200` |
| `OAUTH_GOOGLE_ENABLED` | **new**, optional | `false` (default); `true` turns on Google sign-in |
| `PUBLIC_SIGNUP_ENABLED` | **new**, optional | `false` (default); `true` opens self-serve sign-up |
| `TICK_SCHEDULE` | **new**, optional | cron in UTC; default `*/10 * * * *` |
| `ORIGIN_DOMAIN_NAME` | **delete** | no longer used |
| `API_DB_POOL_SIZE` | **delete** | Cloud Run uses a fixed pool of 4 |
| `GCP_PROJECT_NUMBER` | delete (optional) | unused |

To open sign-up, set `OAUTH_GOOGLE_ENABLED` and `PUBLIC_SIGNUP_ENABLED` here
and the `SELF_SERVE_SIGNUP` repository variable used by the Worker builds.
Then redeploy the backend and both Workers.

### 1.4 GitHub `gcp-demo` environment: secrets

| Secret | Action | Notes |
|---|---|---|
| `DEMO_LOGIN_PASSWORD` | keep, required | 8–128 characters; password of `DEMO_LOGIN_EMAIL` |
| `CITELADDER_ORIGIN_TOKEN` | keep, required | at least 32 characters; must equal the Workers' `ORIGIN_TOKEN` |
| `CITELADDER_ORIGIN_TOKEN_PREVIOUS` | optional | only during a token rotation |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | keep, required | one client for sign-in and GSC/GA4 connect |
| `DEFAULT_AGENT_API_KEY` | keep | platform Agent features |
| `KEENABLE_API_KEY` | keep | brand-discovery research |
| `TAVILY_API_KEY` | keep | commerce research |
| `JEV_API_KEY` | keep | prompt and internal-link quality judgments |
| `BING_OAUTH_CLIENT_ID` / `BING_OAUTH_CLIENT_SECRET` | optional pair | Bing Webmaster Tools → Settings → API Access |
| `DATAFORSEO_API_LOGIN` / `DATAFORSEO_API_PASSWORD` | **new**, optional pair | DataForSEO platform credentials; set both or neither |
| `CLOUDFLARE_ORIGIN_CERT` / `CLOUDFLARE_ORIGIN_KEY` | **delete** | the Origin CA path is retired |

Every deploy copies these into Secret Manager. Changed values create a new
version; an emptied optional secret has its versions disabled and is dropped
from Cloud Run. The database, JWT, encryption and referral secrets are
generated once in Secret Manager. They never pass through GitHub or Terraform.

### 1.5 Provider redirect URIs

`FRONTEND_URL` is `https://app.citeladder.com`, so register these URIs:

| Provider | Registered redirect URI |
|---|---|
| Google sign-in | `https://app.citeladder.com/api/v1/auth/oauth/google/callback` |
| Search Console | `https://app.citeladder.com/api/v1/integrations/oauth/gsc/callback` |
| Analytics | `https://app.citeladder.com/api/v1/integrations/oauth/ga4/callback` |
| Bing | `https://app.citeladder.com/api/v1/integrations/oauth/bing/callback` |

The Google consent screen must be **published**, not in Testing, for public
users. `webmasters.readonly` and `analytics.readonly` need Google's
verification review.

### 1.6 Cloudflare

- Workers keep their existing `ORIGIN_TOKEN` secret. It must equal
  `CITELADDER_ORIGIN_TOKEN`. `ORIGIN_UPSTREAM` is committed in each
  `wrangler.jsonc` as `https://citeladder-api-44437656491.us-central1.run.app`,
  the deterministic Cloud Run URL for this project number.
- After the first successful cutover, delete the `origin.citeladder.com` DNS
  record and revoke its Cloudflare Origin CA certificate.

### 1.7 Before go-live: legal hosting location (owner action)

The published DPA (`frontend/lib/marketing-content/legal-dpa.ts`) states
"CiteLadder is hosted in India" and lists "India (Mumbai region)". After
cutover, data is stored in the United States (`us-central1`). Have the legal
pages and subprocessor list updated and approved before customer data is
accepted. Automation does not change this copy.

## 2. First deployment (clean rebuild)

1. Merge the hosting PR to `main` and wait for CI.
2. Actions → **GCP - Deploy** → Run workflow from `main` and approve
   `gcp-demo`. Leave `reset_database` unchecked: the database starts empty
   anyway.
3. The first run is the clean rebuild. Terraform reuses the project, state,
   identities and secret values, and permanently deletes the following:
   - the Mumbai `citeladder-demo` VM and its disk (the old database);
   - the static IP, the old VPC and firewalls;
   - the `asia-south1` `citeladder-demo` Artifact Registry repository and all
     its images;
   - the backup bucket, the Storage data-access audit configuration and the
     retired Origin CA secrets.

   It then creates the network, the database VM, the Cloud Run API and jobs,
   the scheduler and the budget. It migrates an empty database and bootstraps
   `DEMO_LOGIN_EMAIL`. Last, it smoke-tests the origin (authenticated `200`,
   anonymous and foreign-host `403`) and runs one tick.
4. Deploy both Workers: Actions → **Product Worker delivery**, then
   **Marketing Worker delivery** (see the [Workers runbook](WORKERS_RUNBOOK.md)).
   The static **Documentation Worker delivery** has no origin and needs a
   deploy only when its content changes.
5. Acceptance:

   ```powershell
   curl.exe --fail https://app.citeladder.com/health
   curl.exe --fail https://app.citeladder.com/api/v1/auth/oauth/providers
   curl.exe --fail https://citeladder.com/.well-known/oauth-authorization-server
   ```

   Sign in as `DEMO_LOGIN_EMAIL`, create a project, start a Site Health crawl
   and confirm it progresses (a runner execution appears under Cloud Run →
   Jobs → `citeladder-runner`). Connect Search Console end to end.
6. Complete sections 1.6 and 1.7.
7. Seven days later, check Billing → Reports grouped by SKU and remove
   anything unexpectedly non-zero.

## 3. Daily operation

- **Logs:** Cloud Run → `citeladder-api`, and Jobs → `citeladder-runner`,
  `citeladder-tick` and `citeladder-migrate` → Logs. The database container
  logs reach Cloud Logging under the `citeladder-db` instance.
- **Database shell** (break-glass, IAP):

  ```powershell
  gcloud compute ssh citeladder-db --zone us-central1-a --tunnel-through-iap `
    --command 'sudo docker exec -it citeladder-postgres psql -U citeladder -d citeladder'
  ```

- **Operator account tool:** forward the database over the same SSH session.
  Then run the interactive tool from `backend/` against `127.0.0.1:15432`
  with the production secrets exported in that shell only:

  ```powershell
  gcloud compute ssh citeladder-db --zone us-central1-a --tunnel-through-iap -- -N -L 15432:127.0.0.1:5432
  ```

- **Runner and tick:** a committed API write starts `citeladder-runner`. A
  burst starts several executions, and all but one exit after a short wait for
  the single drain lock. The scheduler starts `citeladder-tick` every
  10 minutes; it recovers leases, runs due schedules and dispatch, then drains.
  To process work immediately:
  `gcloud run jobs execute citeladder-tick --region us-central1 --wait`.

## 4. Updates and rollback

Merge to `main`, wait for CI, and rerun **GCP - Deploy**. Each run builds
digests (reused on retry), applies secrets, migrates before the API rolls
forward, applies Terraform and smokes. A migration that fails `alembic check`
stops the deploy before the API changes.

- **API rollback:** Cloud Run → `citeladder-api` → Revisions, then route
  100% to the previous revision (or
  `gcloud run services update-traffic citeladder-api --region us-central1 --to-revisions <REVISION>=100`).
  The next deploy from `main` takes traffic back.
- **Database reset (pre-launch only):** rerun **GCP - Deploy** with
  `reset_database` checked and the exact project ID. It replaces the VM, which
  deletes every row with no backup, and then migrates. It refuses demo mode.
  This is how a changed pre-launch baseline (`0001_initial`) is applied.
- **PostgreSQL image update:** a deploy that changes `infra/gcp/postgres/Dockerfile`
  updates the VM's startup script in place. The new image runs after the next
  restart (`gcloud compute instances reset citeladder-db --zone us-central1-a`),
  which keeps the data directory. Expect about a minute of database downtime.
- **Database password rotation:** the secret is the source of truth, and the
  VM applies it to the role on every boot. Add a new `citeladder-db-password`
  version, then restart the VM
  (`gcloud compute instances reset citeladder-db --zone us-central1-a`) and
  redeploy, which rewrites `citeladder-database-url`. Connections fail between
  the two steps, so rotate during a quiet window.
- **Origin token rotation:** set `CITELADDER_ORIGIN_TOKEN_PREVIOUS` to the old
  value and `CITELADDER_ORIGIN_TOKEN` to the new one, then deploy. Next, update
  both Workers' `ORIGIN_TOKEN` and deploy them. Finally, clear the previous
  secret and deploy again.

## 5. Incidents

### Budget and log controls

The existing Terraform `google_billing_budget.monthly` remains alert-only.
[`logging.tf`](../../infra/gcp/logging.tf) excludes only API Cloud Run request
logs with HTTP 403; application logs and other request statuses remain.
Applying the exclusion requires a separately authorized deployment. It removes
that ingestion cost, not request fees or all Cloud Logging costs.

**Deferred owner action, console only:** if available, create a separate monthly
Cloud Run spend-cap budget for this project at roughly ₹8,500 ($100), keeping
the existing hosting-alert budget. It is not configured by this change.
[Google's spend-cap guidance](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
describes this Preview control; an alerts-only budget cannot be converted in place.
The cap pauses new Cloud Run usage across the project, including API and jobs,
so the product becomes unavailable. Persistent VM/storage costs continue;
enforcement can overshoot. Cloud Logging is outside this service cap.

After a cap triggers, the owner first investigates the abuse and estimated
costs. In Billing → Budgets & alerts, edit the spend-cap budget and manually lift
the cap to restore usage. Recovery can take up to one hour; then verify the API
and next scheduled tick recover. A cap lifted in the same billing month will
not trigger again that month unless the owner increases its target. The owner
must choose a higher target or another incident guard for the rest of the month;
the cap resets for the next monthly period. Do not delete resources or reset
the database to restore service.

- **Suspected credential exposure:** disable the affected Secret Manager
  version or provider key, rotate it in GitHub, redeploy, and review GitHub and
  GCP audit logs. Never paste secrets into issues, inputs, commands or logs.
- **Budget alert:** inspect Billing by SKU first. To stop all application
  compute, pause the scheduler (`gcloud scheduler jobs pause citeladder-tick
  --location us-central1`) and close the API
  (`gcloud run services update citeladder-api --region us-central1 --ingress internal`).
  The next deploy reopens it. The database VM is free-tier.
- **Cost guard:** the API scales to zero; jobs run only when started. Nothing
  except PostgreSQL runs continuously.

## Troubleshooting

- **WIF fails:** compare the repository, `main` ref and `gcp-demo` environment
  with the bootstrap trust. Never substitute a service-account key.
- **Migrate job cannot connect:** the database VM may still be initializing.
  The job waits up to 5 minutes. Check the `citeladder-db` serial or Cloud
  Logging output for `citeladder-db:` lines (secret access, image pull, swap).
- **Workers return 502/504:** confirm `ORIGIN_UPSTREAM` equals the
  `api_url` shown in the deploy summary, and that both tokens match.
- **API returns 403 to the Workers:** the token, or the public host
  (`citeladder.com` / `app.citeladder.com`), does not match the deployment.
- **A Cloud Run deploy fails on a secret:** a required secret has no enabled
  version. Add the GitHub secret named in the workflow error and rerun.
