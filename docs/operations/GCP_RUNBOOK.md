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
              │ Cloud Scheduler every 20 min ─► API POST /internal/tick (OIDC)
              │ deploy only ─► job citeladder-migrate (SQL baseline + catalog bootstrap, API image)
              │ operator only ─► job citeladder-billing (billing CLIs, API image)
              ▼ Direct VPC egress (private IP 10.28.0.10)
         e2-micro VM citeladder-db (free tier, COS, no public IP): PostgreSQL 16 only
```

There are no backups. The database lives on the VM's boot disk; replacing
the VM is the explicit database reset. The GCP project is reused and is never
deleted by automation.

## 1. One-time owner setup

### 1.1 Workstation

Install Google Cloud CLI, Terraform 1.10.5 or later, Node (the repository's
`engines` version) and the GitHub CLI. Then authenticate:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project project-setup-20260711
```

### 1.2 Re-run the bootstrap (us-central1)

From an up-to-date `main` at the repository root, reuse the existing project
and state bucket:

```bash
node infra/gcp/bootstrap.mjs \
  --project-id 'project-setup-20260711' \
  --billing-account '<BILLING_ACCOUNT_ID>' \
  --state-bucket 'project-setup-20260711-tfstate'
```

`gcloud billing projects describe project-setup-20260711` shows the billing
account. The script is idempotent. It enables Cloud Run, Cloud Scheduler and
Cloud Monitoring and grants the deployer its project roles (Cloud Run, Cloud Scheduler,
Artifact Registry and service-account administration; the compute instance,
network and firewall roles; `logging.configWriter` for the API request-log
exclusion and the log-based metrics; the Monitoring alert-policy,
notification-channel and uptime-check editor roles and `monitoring.viewer` for
`monitoring.tf`; and the `citeladderSecretContainers` custom role for Secret Manager
containers without payloads), plus object access on the state bucket only.
It removes the retired SSH/IAP, project-deletion, project-IAM and project-wide
compute, secret and storage administration grants. It creates the database
VM's account if missing and grants its log writer role, which the deployer
cannot. It relabels the project `environment=production` and converges the
GitHub OIDC trust to the `Cube-27/Citeladder` repository (name and ID), the
`gcp-deploy.yml` workflow, `refs/heads/main` and the `gcp-demo` environment.
Its printed `NAME=value` lines are the values for section 1.3.

Order after a change to the deployer's roles: re-run this script first, then
run **GCP - Deploy**. The deploy needs the APIs and roles the script adds (for
example Cloud Monitoring for `monitoring.tf`), and the retired grants it removes
are not needed: `citeladderSecretContainers` keeps
`secretmanager.secrets.setIamPolicy`, so the deploy's first targeted apply
grants the deployer its per-secret version roles before it writes any secret
version.

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
| `GCP_ALERT_EMAIL` | **new**, required | address that receives the monitoring alerts; the deploy refuses to start without it |
| `DEFAULT_AGENT_BASE_URL` | keep, required | HTTPS base URL of the platform Agent provider; `https://api.anthropic.com` selects the Anthropic Messages API, anything else is OpenAI-compatible |
| `DEFAULT_AGENT_MODEL` | keep, required | exact provider model ID |
| `DOMAIN_NAME` | optional | `citeladder.com` (default) |
| `APP_DOMAIN_NAME` | optional | `app.citeladder.com` (default) |
| `DEMO_MODE` | optional | `false` (default); `true` restores the single-account demo |
| `DEMO_EXPIRES_AT` | optional | RFC 3339; required only when `DEMO_MODE=true` |
| `DEMO_LOGIN_EMAIL` | optional | defaults to `dev@citeladder.com`; outside demo mode, the platform admin whose existence lets the migrate job initialize the catalog |
| `DEV_LOGIN_COUNTER_ALLOWANCE` | optional | defaults to `200`; demo and local development only |
| `OAUTH_GOOGLE_ENABLED` | **new**, optional | `false` (default); `true` turns on Google sign-in |
| `PUBLIC_SIGNUP_ENABLED` | **new**, optional | `false` (default); `true` opens self-serve sign-up |
| `TICK_SCHEDULE` | **new**, optional | cron in UTC; default `*/20 * * * *` |
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
| `DEMO_LOGIN_PASSWORD` | demo mode only | 8–128 characters; password of `DEMO_LOGIN_EMAIL` in demo mode. Outside demo mode the deploy disables the `citeladder-demo-password` versions and production carries no development login (BL9); the operator signs in with their own account password |
| `CITELADDER_ORIGIN_TOKEN` | keep, required | at least 32 characters; must equal the Workers' `ORIGIN_TOKEN` |
| `CITELADDER_ORIGIN_TOKEN_PREVIOUS` | optional | only during a token rotation |
| `TURNSTILE_SECRET_KEY` | **new**, required | secret of the Turnstile widget whose site key is the `APP_TURNSTILE_SITE_KEY` repository variable; API only (`citeladder-turnstile-secret`). Without it sign-up and email-link requests answer 503 |
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

Every deploy copies these into Secret Manager. Changed values create a new
version, and every older version of that secret is destroyed: Cloud Run reads
only `latest`, and a rotation keeps the old value in its own `…_PREVIOUS`
secret. An emptied optional secret has its versions disabled and is dropped
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
  the deterministic Cloud Run URL for this project number. There is no origin
  hostname or Origin CA certificate.

### 1.7 Legal hosting location

The DPA and subprocessor list (`frontend/lib/marketing-content/legal-dpa.ts`)
describe the current Google Cloud application/database hosting in the
United States (`us-central1`). Cloudflare delivers the website, product and
documentation through its global Worker network.

## 2. Deploy acceptance

After a deploy:

```bash
curl --fail https://app.citeladder.com/health
curl --fail https://app.citeladder.com/api/v1/auth/oauth/providers
curl --fail https://api.citeladder.com/.well-known/oauth-authorization-server
```

After the first deploy with monitoring, confirm alert delivery once: Cloud
Monitoring → Alerting → a `citeladder` policy → **Send test notification**
reaches `GCP_ALERT_EMAIL`, and Uptime checks shows `citeladder-api /health`
passing.

Sign in as `DEMO_LOGIN_EMAIL` (outside demo mode, with that account's own
password), create a project, start a Site Health crawl
and confirm it progresses (a runner execution appears under Cloud Run →
Jobs → `citeladder-runner`). A week after an infrastructure change, check
Billing → Reports grouped by SKU and remove anything unexpectedly non-zero.

## 3. Daily operation

- **Logs:** Cloud Run → `citeladder-api`, and Jobs → `citeladder-runner`,
  `citeladder-migrate` and `citeladder-billing` → Logs. The database container
  logs reach Cloud Logging under the `citeladder-db` instance.
- **Database shell** (break-glass, IAP):

  ```bash
  gcloud compute ssh citeladder-db --zone us-central1-a --tunnel-through-iap \
    --command 'sudo docker exec -it citeladder-postgres psql -U citeladder -d citeladder'
  ```

- **Operator account tool:** forward the database over the same SSH session.
  For the complete interactive platform account manager, run
  `node scripts/provision-dev-login.mjs` from the repository root. It opens and
  closes its own tunnel; [Workspace access](../workspace-access.md#operator-account-management)
  owns the menu, previews and deletion rules. The manual workspace-scoped tool
  below remains available.
  Then run `pnpm --filter @citeladder/api account:manage --actor <email>
  --workspace-id <uuid>` from `frontend/` against `127.0.0.1:15432`
  with the production secrets exported in that shell only:

  ```bash
  gcloud compute ssh citeladder-db --zone us-central1-a --tunnel-through-iap --ssh-flag="-N" --ssh-flag="-L 15432:127.0.0.1:5432"
  ```

- **Runner and tick:** a committed API write starts `citeladder-runner`. A
  burst starts several executions, and all but one exit after a short wait for
  the single drain lock. A runner drains for up to 50 minutes and starts its
  successor about three minutes before that ends while work remains due.
  Every 20 minutes the `citeladder-tick` scheduler calls
  the API's `/internal/tick`, which runs maintenance, due schedules and dispatch
  inside the request (`SCHEDULER_TICK_BUDGET_SECONDS`, 20 s) and starts the
  runner only when a lane has work due. A job per tick paid a cold start each
  time and outran the Cloud Run free tier. Cloud Run takes one to three
  minutes to start an execution. To process work immediately:
  `gcloud scheduler jobs run citeladder-tick --location us-central1`, or
  `gcloud run jobs execute citeladder-runner --region us-central1` to drain.
  A failed lane or tick phase logs `runner_lane_failed` or `tick_phase_failed`
  with its exception; `runner_completed` names the failed lanes and
  `scheduled_tick_completed` reports each tick.
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
  account with no key and no role in this project, and grants the API
  (`citeladder-runtime`) and job (`citeladder-jobs`) service accounts
  `roles/iam.serviceAccountTokenCreator` on it alone. Its email
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

```bash
gcloud run jobs execute citeladder-billing --region us-central1 --wait \
  '--args=src/cli/billing-admin.ts,grant,--workspace-id,<workspace-uuid>,--account-id,<billing-account-uuid>,--key,billing_checkout,--value,1,--valid-from,2026-10-11T00:00:00Z,--actor,<admin-email>,--reason,checkout-allow-list,--idempotency-key,grant:checkout:<workspace-uuid>'
```

`revoke` takes `--grant-id` and `--effective-from` the same way, and
`account-inspect` reads the account's grants first.

Grant the operator's own workspace its controls (BL9: advanced Site Health crawl
controls and page limit, unmetered crawl fetches). Production carries no
development login, so this explicit grant is the only way the operator's
workspace gets them; do it once after the first deploy that ships it (dry run,
then add `--apply`):

```bash
gcloud run jobs execute citeladder-billing --region us-central1 --wait \
  '--args=src/cli/billing-admin.ts,grant,--workspace-id,<operator-workspace-uuid>,--account-id,<billing-account-uuid>,--key,operator_controls,--value,1,--valid-from,<now-rfc3339>,--actor,<admin-email>,--reason,operator-controls,--idempotency-key,grant:operator-controls:<operator-workspace-uuid>'
```

Bind Razorpay plan IDs to a revision, store the result as a draft and publish
it. The job's `BILLING_RAZORPAY_MODE` must equal `--environment`. The refs JSON
contains commas, so switch gcloud's list delimiter with its `^;^` prefix and
separate arguments with `;`; single quotes keep the JSON intact. First the dry run, which verifies
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

Merge to `main`, wait for CI and the Compose smoke, and rerun **GCP - Deploy**.
Each run builds digests (reused on retry), applies secrets, migrates before the
API rolls forward, and applies Terraform with the API's traffic pinned to the
serving revision. It smokes the new revision at its `candidate` tagged URL and
only then moves traffic to it; a failed smoke leaves the previous revision
serving. The migrate job applies the pending
numbered migrations in `frontend/services/api/migrations/` in order, in place on
the existing database, and is a no-op when every file is recorded. An edited
applied file, a missing or skipped version, or unledgered tables fail the job,
which stops the deploy before the API changes; the log names the cause. A
migration statement that waits on a lock longer than
`MIGRATION_LOCK_TIMEOUT_MS` (3 s), or runs longer than
`MIGRATION_STATEMENT_TIMEOUT_MS` (5 min), fails the job the same way and rolls
the whole apply back. A lock timeout means a serving request or runner held the
table: rerun **GCP - Deploy**. A statement timeout recurs on a rerun: the
migration has to raise its own bound
([migrations](../DEVELOPMENT.md#migrations-forward-only)); the job's
environment is Terraform-managed, so do not edit it in the console.

The migrate job runs while the previous API revision and any running runner
execution still serve, so every migration must work with the code already
deployed. A migration that drops or renames a column or table, or adds
`NOT NULL`, ships one release after the code stops using that name
([expand and contract](../DEVELOPMENT.md#migrations-forward-only)).

- **Rollback:** first check whether any release after the target added a
  migration (`git log <target-sha>..<serving-sha> -- frontend/services/api/migrations/`).
  The schema never rolls back: an older revision runs on the newer schema.
  - **No migration in between, or only expanding ones** (new tables, nullable
    columns, indexes): roll back the API and both jobs to the same image.
    Route traffic with
    `gcloud run services update-traffic citeladder-api --region us-central1 --to-revisions <REVISION>=100`,
    read that revision's image digest
    (`gcloud run revisions describe <REVISION> --region us-central1 --format='value(spec.containers[0].image)'`),
    and point the jobs at it with
    `gcloud run jobs update citeladder-runner --region us-central1 --image <digest>` and the same for
    `citeladder-billing`. A service-only rollback leaves the runner on the new
    code.
  - **A contracting migration in between** (a drop, rename or `NOT NULL`):
    the older code fails against the schema, so do not roll back. Fix forward:
    revert the faulty change on `main` (never the migration) and deploy.
  - Artifact Registry keeps the three most recent images; an older one may be
    deleted after 7 days, so roll back only to a recent revision.

  The next deploy from `main` moves the API and the jobs back to its image.
- **Database reset (disposable data only):** rerun **GCP - Deploy** with
  `reset_database` checked and the exact project ID. It replaces the VM, which
  deletes every row with no backup, and then migrates. It refuses demo mode.
  Schema changes never need it: they arrive as forward migrations. Production
  is reset only for an owner-authorized baseline refold
  ([decisions](../decisions.md#platform-and-schema)); afterwards run
  `~/citeladder-ops/provision-team.mjs` (outside git) to recreate the operator
  and team accounts.
- **PostgreSQL image or startup-script update:** a deploy that changes
  `infra/gcp/postgres/Dockerfile` or `infra/gcp/postgres-vm.sh` updates the
  VM's startup script in place, then restarts the VM before the migrate job,
  so the new image and access rules apply. The restart keeps the data
  directory; expect about a minute of database downtime.
- **Database password rotation:** each secret is the source of truth. For the
  schema owner, add a new `citeladder-db-password` version, then restart the VM
  (`gcloud compute instances reset citeladder-db --zone us-central1-a`), which
  applies it to the `citeladder` role, and redeploy, which rewrites
  `citeladder-migration-database-url`; only the migrate job uses it, so
  serving traffic is unaffected. For the services' `citeladder_app` role, add
  a new `citeladder-db-app-password` version and redeploy: the deploy rewrites
  `citeladder-database-url` and the migrate job sets the role's password.
  New API or runner instances fail to connect between those two steps, so
  rotate during a quiet window.
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
the existing hosting-alert budget. Terraform does not configure it.
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

- **WIF fails:** compare the repository and its ID, the `gcp-deploy.yml`
  workflow, `main` ref and `gcp-demo` environment with the bootstrap trust.
  Never substitute a service-account key.
- **Migrate job cannot connect:** the database VM may still be initializing.
  The job waits up to 5 minutes. Check the `citeladder-db` serial or Cloud
  Logging output for `citeladder-db:` lines (secret access, image pull, swap).
- **Workers return 502/504:** confirm `ORIGIN_UPSTREAM` equals the
  `api_url` shown in the deploy summary, and that both tokens match.
- **API returns 403 to the Workers:** the token, or the public host
  (`citeladder.com` / `app.citeladder.com`), does not match the deployment.
- **A Cloud Run deploy fails on a secret:** a required secret has no enabled
  version. Add the GitHub secret named in the workflow error and rerun.
