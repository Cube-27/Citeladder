# CiteLadder GCP Runbook

## Self-serve authentication release gate

Keep `PUBLIC_SIGNUP_ENABLED=false` until verified-auth, trial, expiry and abuse
acceptance are complete. The deploy workflow accepts protected `RESEND_API_KEY`
and injects its optional Secret Manager value into server processes. Verify the
Resend domain for `notifications@citeladder.com`; replies use
`contact@citeladder.com`. Provider acceptance is not inbox delivery. Controlled
inbox and live Google checks require explicit authorization.

Google sign-in uses explicit server client credentials and
`https://app.citeladder.com/api/v1/auth/oauth/google/callback`; register that exact
URI in Google Console. Existing Google login can remain enabled while signup is
closed. Coordinate API creation with both Workers' `SELF_SERVE_SIGNUP` builds.
Keep `BILLING_CHECKOUT_AUDIENCE=allow_list` for this release, so checkout serves
only allow-listed workspaces (section 3.1).

The schema baseline adds identity verification, auth challenges and billing
registration provenance. It does **not** upgrade an already migrated database.
Inventory deployed schema/data before rollout; retained production data requires
an explicit migration-policy decision and additive procedure. Never reset shared
data to apply the greenfield baseline. Rollback closes signup and hides CTAs;
it must retain verification/access enforcement and compatible schema/data.

This is the owner procedure for production hosting. The design target is under
₹500 a month in fixed hosting, excluding provider usage (models, JEV,
DataForSEO) and the domain. The current topology and operating procedures follow below.
Terraform lives in [`infra/gcp`](../../infra/gcp/README.md). Never place a
long-lived Google service-account key in GitHub.

```text
Browser ─► Cloudflare Workers (marketing citeladder.com, app app.citeladder.com, docs, api api.citeladder.com)
              │ /api/* and MCP, signed with the origin token (HMAC)
              ▼
         Cloud Run us-central1: citeladder-api (min 0, max 2)
              │ commits work, then starts ─► job citeladder-runner (drain, exit)
              │ Cloud Scheduler every 10 min ─► job citeladder-tick
              │ deploy only ─► job citeladder-migrate (SQL baseline + dev bootstrap, API image)
              │ operator only ─► job citeladder-billing (billing CLIs, API image)
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
grants the deployer `run.admin`, `cloudscheduler.admin` and
`logging.configWriter` (for the API request-log exclusion), and removes the
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
| `DEFAULT_AGENT_BASE_URL` | keep, required | HTTPS base URL of the platform Agent provider; `https://api.anthropic.com` selects the Anthropic Messages API, anything else is OpenAI-compatible |
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
| `BILLING_CHECKOUT_ENABLED` | optional | `false` (default); `true` admits new checkout for the audience below. Webhooks and reconciliation run either way |
| `BILLING_CHECKOUT_AUDIENCE` | optional | `allow_list` (default) sells only to workspaces holding the `billing_checkout` grant; `everyone` opens checkout (test-mode keys still serve allow-listed workspaces only) |
| `BILLING_RAZORPAY_MODE` | optional | `disabled` (default), `test` or `live`; any other mode needs `BILLING_RAZORPAY_KEY_ID` plus the key and webhook secrets, or the deploy fails |
| `BILLING_RAZORPAY_KEY_ID` | optional | public key ID matching the mode (`rzp_test_…` or `rzp_live_…`); empty by default |
| `BILLING_RAZORPAY_TEST_READY` | optional | `false` (default); `true` once test-mode acceptance passes |
| `BILLING_RAZORPAY_TEST_INTERNATIONAL_READY` | optional | `false` (default); opens the USD route in test mode |
| `BILLING_RAZORPAY_TEST_INDIA_READY` | optional | `false` (default); opens the INR route in test mode |
| `BILLING_RAZORPAY_LIVE_READY` | optional | `false` (default); `true` after live sign-off |
| `BILLING_RAZORPAY_INTERNATIONAL_READY` | optional | `false` (default); opens the USD route in live mode (the live INR route needs only `LIVE_READY`) |
| `BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET_STARTED_AT` / `…_EXPIRES_AT` | optional pair | RFC 3339 window, at most 24 hours, in which the previous webhook secret is still accepted; empty by default |
| `BILLING_INDIA_GST_RATE` | optional | approved decimal GST rate; empty by default, which leaves India prices unauthored |
| `BILLING_INDIA_GST_APPROVAL_REFERENCE` | optional | approval record for the rate; required with it |
| `BILLING_SELLER_SAC` / `BILLING_SELLER_LUT_REFERENCE` | optional | receipt SAC and current LUT reference; empty by default. The rest of the seller identity defaults in `billing.json` |
| `BILLING_FUNDED_MONTHLY_BUDGET_MINOR` | optional | managed-plan monthly platform spend ceiling in US cents; app default `50000` |
| `PROVIDER_PLATFORM_OPENAI_CREDENTIAL_REF` / `…_GOOGLE_…` / `…_ANTHROPIC_…` | optional | opaque reference that the platform connection for that engine stores; it must match for the platform key to be used. Empty by default |
| `DATAFORSEO_PLATFORM_CREDENTIAL_REF` | optional | the same for the platform DataForSEO connection, which uses the `DATAFORSEO_API_*` pair |
| `ORIGIN_DOMAIN_NAME` | **delete** | no longer used |
| `API_DB_POOL_SIZE` | **delete** | Cloud Run uses a fixed pool of 4 |
| `GCP_PROJECT_NUMBER` | delete (optional) | unused |

To open sign-up, set `OAUTH_GOOGLE_ENABLED` and `PUBLIC_SIGNUP_ENABLED` here
and the `SELF_SERVE_SIGNUP` repository variable used by the Worker builds.
Then redeploy the backend and both Workers.

The billing and platform-credential variables reach every Cloud Run workload
through Terraform's `billing_env`; an empty variable keeps the app default from
`frontend/services/api/src/config/billing.json` or `providers.json`, which
leaves checkout closed. The deploy refuses a name ending in `SECRET`,
`API_KEY` or `PASSWORD` there; those belong in section 1.4.

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
| `BILLING_RAZORPAY_KEY_SECRET` | **new**, optional | Razorpay API key secret for `BILLING_RAZORPAY_MODE`; required when the mode is not `disabled` |
| `BILLING_RAZORPAY_WEBHOOK_SECRET` | **new**, optional | Razorpay webhook signing secret, never the API key secret; required when the mode is not `disabled` |
| `BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET` | **new**, optional | only during a webhook-secret rotation, with the window variables in section 1.3 |
| `PROVIDER_PLATFORM_OPENAI_API_KEY` / `…_GOOGLE_…` / `…_ANTHROPIC_…` | **new**, optional | platform engine keys that managed plans measure on; each is used only while its `…_CREDENTIAL_REF` matches |
| `CLOUDFLARE_ORIGIN_CERT` / `CLOUDFLARE_ORIGIN_KEY` | **delete** | the Origin CA path is retired |

Every deploy copies these into Secret Manager. Changed values create a new
version; an emptied optional secret has its versions disabled and is dropped
from Cloud Run. The database, JWT, encryption, referral, API key pepper
(`API_KEY_PEPPER`, `citeladder-api-key-pepper`) and checkout quote-signing
(`BILLING_QUOTE_SIGNING_SECRET`, `citeladder-billing-quote-secret`) secrets are
generated once in Secret Manager. They never pass through GitHub or Terraform.
Rotating the API key pepper invalidates every public API key. The Razorpay and
platform engine secrets reach every Cloud Run workload, because billing
recovery runs in the runner.

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

### 1.7 Legal hosting location

The DPA and subprocessor list (`frontend/lib/marketing-content/legal-dpa.ts`)
describe the current Google Cloud application/database hosting in the
United States (`us-central1`). Cloudflare delivers the website, product and
documentation through its global Worker network.

## 2. Deploy acceptance

After a deploy:

```powershell
curl.exe --fail https://app.citeladder.com/health
curl.exe --fail https://app.citeladder.com/api/v1/auth/oauth/providers
curl.exe --fail https://api.citeladder.com/.well-known/oauth-authorization-server
```

Sign in as `DEMO_LOGIN_EMAIL`, create a project, start a Site Health crawl
and confirm it progresses (a runner execution appears under Cloud Run →
Jobs → `citeladder-runner`). A week after an infrastructure change, check
Billing → Reports grouped by SKU and remove anything unexpectedly non-zero.

## 3. Daily operation

- **Logs:** Cloud Run → `citeladder-api`, and Jobs → `citeladder-runner`,
  `citeladder-tick`, `citeladder-migrate` and `citeladder-billing` → Logs. The database container
  logs reach Cloud Logging under the `citeladder-db` instance.
- **Database shell** (break-glass, IAP):

  ```powershell
  gcloud compute ssh citeladder-db --zone us-central1-a --tunnel-through-iap `
    --command 'sudo docker exec -it citeladder-postgres psql -U citeladder -d citeladder'
  ```

- **Operator account tool:** forward the database over the same SSH session.
  For the complete interactive platform account manager, run
  `./scripts/provision-dev-login.ps1` from the repository root. It opens and
  closes its own tunnel; [Workspace access](../workspace-access.md#operator-account-management)
  owns the menu, previews and deletion rules. The manual workspace-scoped tool
  below remains available.
  Then run `pnpm --filter @citeladder/api account:manage --actor <email>
  --workspace-id <uuid>` from `frontend/` against `127.0.0.1:15432`
  with the production secrets exported in that shell only:

  ```powershell
  gcloud compute ssh citeladder-db --zone us-central1-a --tunnel-through-iap -- -N -L 15432:127.0.0.1:5432
  ```

- **Runner and tick:** a committed API write starts `citeladder-runner`. A
  burst starts several executions, and all but one exit after a short wait for
  the single drain lock. The scheduler starts `citeladder-tick` every
  10 minutes; it runs maintenance, due schedules and dispatch, then drains.
  Cloud Run takes one to three minutes to start an execution. To process work
  immediately:
  `gcloud run jobs execute citeladder-tick --region us-central1 --wait`.
  A failed lane or tick phase logs `runner_lane_failed` or `tick_phase_failed`
  with its exception, and `runner_completed` names the failed lanes.
- **Stuck work:** in the database shell, list pending and leased work per queue:

  ```sql
  select 'site_crawl_tasks' as queue, status, count(*), min(available_at) as next_due,
         min(lease_expires_at) as next_lease_expiry
  from site_crawl_tasks where status not in ('succeeded', 'failed', 'cancelled') group by status
  union all
  select 'audit_tasks', status, count(*), min(available_at), min(lease_expires_at)
  from audit_tasks where status not in ('succeeded', 'failed', 'cancelled') group by status
  union all
  select 'analytics_tasks', status, count(*), min(available_at), min(lease_expires_at)
  from analytics_tasks where status not in ('succeeded', 'failed', 'cancelled') group by status
  union all
  select 'integration_sync_runs', status, count(*), min(available_at), min(lease_expires_at)
  from integration_sync_runs where status not in ('succeeded', 'failed', 'cancelled') group by status
  order by 1, 2;
  ```

  A `next_due` or `next_lease_expiry` well in the past means no execution has
  drained that queue since; run the tick and read its log.

- **Crawl-log reader:** Terraform creates `citeladder-log-reader`, a service
  account with no key and no role in this project, and grants the runtime
  service account `roles/iam.serviceAccountTokenCreator` on it alone. Its email
  (`terraform output crawl_log_reader_email`) reaches every Cloud Run workload
  as `CRAWL_LOG_READER_EMAIL`; customers grant it subscriber and viewer on
  their own Pub/Sub subscription. Empty hides the Google Cloud connector. The
  bootstrap enables `pubsub.googleapis.com` and `iamcredentials.googleapis.com`.
  `crawl_log_pull` rows on `analytics_tasks` drain those subscriptions on the
  tick's cadence; a source stalled as `verification_failed` is a customer-side
  label, subscription or IAM change, not an outage here. A failed token mint
  shows as an `unavailable` pull that retries without stalling the source.

### 3.1 Billing operator commands

The `citeladder-billing` job runs `node` in the API image against the private
database with the production configuration; it has no files and its default
arguments only print help. Pass the whole command line as `--args`, one
comma-separated list that replaces those defaults, and read the result in
Cloud Run → Jobs → `citeladder-billing` → Logs. Every mutation needs an active
admin `--actor`, a `--reason` and a stable `--idempotency-key`, and is a dry run
until the same command is repeated with `--apply`. The
[billing operator guide](billing-operator-guide.md) owns what each command does.

Put a workspace on the checkout allow-list (dry run, then add `--apply`):

```powershell
gcloud run jobs execute citeladder-billing --region us-central1 --wait `
  '--args=src/cli/billing-admin.ts,grant,--workspace-id,<workspace-uuid>,--account-id,<billing-account-uuid>,--key,billing_checkout,--value,1,--valid-from,2026-10-11T00:00:00Z,--actor,<admin-email>,--reason,checkout-allow-list,--idempotency-key,grant:checkout:<workspace-uuid>'
```

`revoke` takes `--grant-id` and `--effective-from` the same way, and
`account-inspect` reads the account's grants first.

Bind Razorpay plan IDs to a revision, store the result as a draft and publish
it. The job's `BILLING_RAZORPAY_MODE` must equal `--environment`. The refs JSON
contains commas, so switch gcloud's list delimiter with its `^;^` prefix and
separate arguments with `;`. Run this from a POSIX shell such as Cloud Shell,
where single quotes keep the JSON intact. First the dry run, which verifies
every plan at Razorpay and previews the import:

```bash
gcloud run jobs execute citeladder-billing --region us-central1 --wait \
  '--args=^;^src/cli/provision-razorpay-plans.ts;bind;--revision;launch-pricing-v1;--environment;test;--plans-json;{"tier_1:byok:international":"plan_…","tier_1:funded:international":"plan_…"};--import;launch-pricing-v1-test;--actor;<admin-email>;--reason;bind-test-plans;--idempotency-key;catalog-bind:launch-pricing-v1-test'
```

The refs object needs one `plan:mode:region` key per recurring price in the
revision. A dry-run import is rolled back, so there is nothing yet to publish;
after review, repeat the same command with `;--publish;--apply` appended.
Other operator entry points under `src/cli/` (for example `catalog-seed` in
`billing-admin.ts`, or `provision-platform-providers.ts`) run the same way.

## 4. Updates and rollback

Merge to `main`, wait for CI, and rerun **GCP - Deploy**. Each run builds
digests (reused on retry), applies secrets, migrates before the API rolls
forward, applies Terraform and smokes. The migrate job applies
`frontend/services/api/migrations/0001_baseline.sql` to an empty database and is a
no-op when the recorded checksum matches. A changed baseline or
unledgered tables fail the job, which stops the deploy before the API
changes; the log names the cause and says to redeploy with `reset_database`.

- **API rollback:** Cloud Run → `citeladder-api` → Revisions, then route
  100% to the previous revision (or
  `gcloud run services update-traffic citeladder-api --region us-central1 --to-revisions <REVISION>=100`).
  The next deploy from `main` takes traffic back.
- **Database reset (pre-launch only):** rerun **GCP - Deploy** with
  `reset_database` checked and the exact project ID. It replaces the VM, which
  deletes every row with no backup, and then migrates. It refuses demo mode.
  This is how a changed pre-launch baseline is applied: a database that has
  tables but no `schema_migrations` ledger is refused by the migrate job.
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
Every deploy applies it. It removes that ingestion cost, not request fees or
all Cloud Logging costs. The budget excludes credits, so a free trial or
promotion cannot hide hosting spend.

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
