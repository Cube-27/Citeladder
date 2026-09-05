# CiteLadder GCP Demo Runbook

This is the operator procedure for the temporary CiteLadder demo. The reviewed
design is fixed to `asia-south1` / `asia-south1-a`, one `e2-standard-2` VM,
Cloudflare in front of Caddy, and the protected `gcp-demo` GitHub environment.
Never place a long-lived Google service-account key in GitHub.

## 1. Prerequisites and fixed values

Install Git, Google Cloud CLI, Terraform 1.10.5 or later, and PowerShell 7.3 or
later. The operator needs permission to create a GCP project, link its billing
account, change billing IAM, and administer `Cube-27/Citeladder`.

Choose once: a globally unique disposable project ID, the billing-account ID,
a globally unique GCS state-bucket name, and the domain (`citeladder.com`). The
host runs until it is torn down deliberately; there is no automatic expiry.

```powershell
gcloud auth login
gcloud auth application-default login
gcloud auth list
gcloud billing accounts list
```

## 2. Bootstrap GCP

Run from reviewed `main` at the repository root:

```powershell
./infra/gcp/bootstrap.ps1 `
  -ProjectId '<PROJECT_ID>' `
  -BillingAccount '<BILLING_ACCOUNT_ID>' `
  -StateBucket '<UNIQUE_STATE_BUCKET>'
```

The script creates or selects the labeled demo project, links billing, enables
the required APIs, protects and versions the state bucket, creates the deploy
identity, and establishes exact Workload Identity Federation trust for
`Cube-27/Citeladder`, `refs/heads/main`, and `gcp-demo`. Save every printed
`NAME=value` line.

## 3. Configure GitHub

Create the `gcp-demo` environment, restrict it to `main`, add the required owner
reviewer, and retain required CI and approval rules.

Add these environment variables:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | Bootstrap project ID |
| `GCP_PROJECT_NUMBER` | Bootstrap output |
| `GCP_REGION` | `asia-south1` |
| `GCP_ZONE` | `asia-south1-a` |
| `GCP_WIF_PROVIDER` | Bootstrap output |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Bootstrap output |
| `GCP_TF_STATE_BUCKET` | Bootstrap state bucket |
| `GCP_BILLING_ACCOUNT` | Billing-account ID |
| `GCP_BUDGET_CURRENCY_CODE` | Billing-account ISO 4217 currency code; currently `INR` |
| `GCP_BUDGET_UNITS` | Positive whole-unit amount; currently `2400` (about USD 25 at review) |
| `DOMAIN_NAME` | Lower-case public DNS hostname |
| `DEMO_MODE` | Optional; `false` (public sign-up) unless set to `true` |
| `DEMO_EXPIRES_AT` | Optional RFC3339 expiry; required only when `DEMO_MODE` is `true` |
| `DEMO_LOGIN_EMAIL` | Optional; defaults to `dev@citeladder.com` |
| `DEFAULT_AGENT_BASE_URL` | HTTPS base URL for the demo's OpenAI-compatible agent provider |
| `DEFAULT_AGENT_MODEL` | Exact provider model identifier used by the Growth Agent |

Add these environment secrets:

- `DEMO_LOGIN_PASSWORD`: a unique password of at least 32 characters;
- `CLOUDFLARE_ORIGIN_CERT`: the complete PEM Origin CA certificate;
- `CLOUDFLARE_ORIGIN_KEY`: the complete PEM private key;
- `DEFAULT_AGENT_API_KEY`: required with `DEFAULT_AGENT_BASE_URL` and
  `DEFAULT_AGENT_MODEL` for Growth Agent features;
- `KEENABLE_API_KEY`: required for external brand-discovery research;
- `TAVILY_API_KEY`: required for commerce-catalog web research;
- `CONTENT_API_KEY`: required for the configured Content generation provider;
- `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE`: optional Logo.dev publishable token. It
  is injected only while building the frontend and becomes public client
  configuration; do not use a Logo.dev secret key here.
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`: required. One Google
  OAuth client serves both sign-in and the Search Console / Analytics connect.
- `BING_OAUTH_CLIENT_ID` / `BING_OAUTH_CLIENT_SECRET`: required. Issued by Bing
  Webmaster Tools -> Settings -> API Access, not by an Azure app registration.

The deploy fails before touching the VM if any of the four OAuth values has no
Secret Manager version, because a missing pair leaves sign-in and every connect
button returning 503 to visitors.

### Provider-side setup

Both clients must be registered against the deployed hostname:

| Provider | Registered redirect URI |
|---|---|
| Google sign-in | `https://<DOMAIN_NAME>/api/v1/auth/oauth/google/callback` |
| Search Console | `https://<DOMAIN_NAME>/api/v1/integrations/oauth/gsc/callback` |
| Analytics | `https://<DOMAIN_NAME>/api/v1/integrations/oauth/ga4/callback` |
| Bing | `https://<DOMAIN_NAME>/api/v1/integrations/oauth/bing/callback` |

The Google consent screen must be **published**, not in Testing: a Testing
project admits only its listed test users, which looks exactly like sign-in
being broken for the public. `webmasters.readonly` and `analytics.readonly` are
sensitive scopes, so publishing requires Google's verification review.

The first deployment generates independent database, JWT, encryption, and
referral secrets directly in Secret Manager. They never enter Terraform state.
Provider secrets are copied once from the protected GitHub environment into
dedicated Secret Manager versions. Agent endpoint and model values are
non-secret runtime configuration. The deploy fails closed when either is
missing, rather than accepting an API key that no feature can use.

## 4. Configure Cloudflare

Create an Origin CA certificate for the demo hostname. Set SSL/TLS to **Full
(strict)**. Preserve MX, SPF, DKIM, and DMARC records. After Terraform reports
the static IP, create or update the proxied A record. Bypass caching for
`/api/*` and authentication responses. Keep proxying enabled because the origin
firewall permits web traffic only from current Cloudflare address ranges.

## 5. First deployment and acceptance

Merge the intended commit to `main` and wait for required CI. Run **GCP Demo -
Deploy** from `main` and approve `gcp-demo`. It serializes deployments, safely
reuses immutable images when retrying the same commit, applies Terraform,
installs secrets once, deploys exact digests over IAP, and migrates. With
`DEMO_MODE` unset the deployment is public: visitors register or sign in with
Google and own their own accounts. Set `DEMO_MODE` to `true` to bootstrap the
single development account instead. Project slots remain unprovisioned, which
is the pre-commercial unlimited-project behavior. Each project crawl is capped
at 200 URLs. The crawler runs with eight global and six per-host slots.
Deployment then validates every long-running service and performs smoke
tests.

Set Cloudflare's A record to the static IP in the workflow summary. If DNS was
not ready for the final smoke test, correct DNS and rerun the same workflow.

```powershell
curl.exe --fail --show-error https://citeladder.com/health
curl.exe --fail --show-error https://citeladder.com/api/v1/auth/oauth/providers
```

Health must succeed and the provider catalog must report Google as
`configured`. Register a throwaway account, sign in with Google, connect Search
Console and Bing end to end, then confirm ports 22, 3000, 5432, and 8000 are
not publicly reachable. Only Cloudflare may reach origin 80/443; use
IAP for administration. After deployment and review, make the repository
private as planned and recheck environment reviewers and the WIF claim.

## 6. Daily operation

Use **GCP Demo - Control** with `start` or `stop`; do not bypass its protected
environment. A stopped VM still incurs disk and reserved-address charges.

For emergency read-only inspection:

```powershell
gcloud compute ssh citeladder-demo --project '<PROJECT_ID>' `
  --zone asia-south1-a --tunnel-through-iap
```

On the VM:

```bash
cd /opt/citeladder
sudo docker compose --env-file runtime.env -f compose.gcp.yml ps
sudo docker compose --env-file runtime.env -f compose.gcp.yml logs --tail=200 web frontend caddy
sudo systemctl status citeladder-backup.timer
sudo journalctl -u citeladder-backup.service --since '24 hours ago'
df -h /
bucket=$(sudo sed -n "s/^BACKUP_BUCKET='\(.*\)'$/\1/p" runtime.env)
gcloud storage ls "gs://${bucket}/nightly/"
```

Daily, check VM and container state, restart counts, disk usage, worker logs,
the latest backup, and GCP billing. Treat any worker restart or a
missing nightly backup as an incident before presenting.

## 7. Updates, backups, and rollback

Merge an update to `main`, wait for CI, and rerun **GCP Demo - Deploy**. The VM
stops write-capable services, takes a `predeploy` dump, pulls exact digests,
migrates, and validates the frontend, API, database, migration, Caddy, and all
ten workers. A failed backup restores the old runtime; a later deployment
failure also attempts to restore prior digests and services.

Record the previous backend/frontend digests and `predeploy` object. If a
migration makes an image-only rollback unsafe, stop write-capable services,
explicitly accept loss of writes after the dump, restore the dump to a clean
schema, restore prior digests in `runtime.env`, recreate the stack, and repeat
all acceptance checks.

Example database restore on the VM (replace the object exactly):

```bash
cd /opt/citeladder
services=(caddy frontend web audit-worker audit-scheduler site-health-worker brand-discovery-worker content-worker agent-worker analytics-worker queue-sweeper integration-worker integration-dispatcher)
sudo docker compose --env-file runtime.env -f compose.gcp.yml stop "${services[@]}"
bucket=$(sudo sed -n "s/^BACKUP_BUCKET='\(.*\)'$/\1/p" runtime.env)
gcloud storage cp "gs://${bucket}/predeploy/<TIMESTAMP>.sql.gz" /tmp/citeladder-restore.sql.gz
sudo docker compose --env-file runtime.env -f compose.gcp.yml exec -T db psql -U citeladder -d citeladder -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c /tmp/citeladder-restore.sql.gz | sudo docker compose --env-file runtime.env -f compose.gcp.yml exec -T db psql -U citeladder -d citeladder -v ON_ERROR_STOP=1
sudo docker compose --env-file runtime.env -f compose.gcp.yml up -d --force-recreate
rm -f /tmp/citeladder-restore.sql.gz
```

## 8. Incidents and teardown

The host does not expire or power itself off. Stop it with **GCP Demo -
Control** and remove it with **GCP Demo - Destroy Project**, both from `main`
through the protected environment.

For suspected credential exposure, stop the VM, disable and rotate the affected
Secret Manager version or provider key, review GitHub/GCP audit logs, and
redeploy. Never paste secrets into issues, workflow inputs, commands, or logs.

At the end, export any backup that must survive project deletion. Run **GCP Demo
- Destroy Project** from `main`, approve the environment, and enter the exact
project ID. The workflow verifies the `project=citeladder`, `environment=demo`,
and `managed_by=terraform` labels before deleting the project. Confirm deletion,
then remove obsolete Cloudflare DNS/Origin CA material, GitHub environment
values, and provider keys.

## Troubleshooting

- **WIF fails:** compare repository, `main` ref, and environment with the exact
  bootstrap trust. Never substitute a downloaded service-account key.
- **IAP SSH fails:** confirm the VM runs, OS Login is enabled, the caller has OS
  Admin Login and IAP tunnel access, and `35.235.240.0/20` can reach port 22.
- **Cloudflare 522/525:** confirm the proxied A record, static IP, Full (strict),
  complete Origin CA PEM values, and successful Cloudflare CIDR retrieval.
- **Deployment fails after backup:** inspect workflow logs and Compose status.
  Automatic recovery is attempted; keep traffic closed until compatibility and
  every worker are verified.
- **Budget alert:** stop the VM, inspect Billing and active resources, and
  destroy the project if it is no longer needed.
