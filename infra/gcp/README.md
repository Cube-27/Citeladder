# Google Cloud temporary demo infrastructure

Follow the complete owner procedure in
[`docs/operations/GCP_RUNBOOK.md`](../../docs/operations/GCP_RUNBOOK.md).

This directory is the sole infrastructure owner for the seven-day CiteLadder
demo described in [`docs/operations/GOOGLE_CLOUD.md`](../../docs/operations/GOOGLE_CLOUD.md).
It provisions one Shielded Compute Engine VM in Mumbai, a dedicated VPC,
Cloudflare-only web ingress, IAP-only SSH, Artifact Registry, Secret Manager,
a private backup bucket, and a billing-account-currency budget alert. The
reviewed INR account uses `GCP_BUDGET_CURRENCY_CODE=INR` and
`GCP_BUDGET_UNITS=2400`, approximately USD 25 at review time.

## Bootstrap

Run `bootstrap.ps1` once from an owner workstation authenticated with `gcloud`.
It creates or configures the disposable project, enables the required APIs,
creates the versioned state bucket, and establishes an exact GitHub OIDC trust
for `Cube-27/Citeladder`, `refs/heads/main`, and `gcp-demo`.

The script prints the non-secret GitHub environment variables. Configure them
on the protected `gcp-demo` environment, add the fixed `DEMO_EXPIRES_AT`,
`GCP_BILLING_ACCOUNT`, matching `GCP_BUDGET_CURRENCY_CODE` and
`GCP_BUDGET_UNITS`, and `DOMAIN_NAME`, then add the protected
`DEMO_LOGIN_PASSWORD` secret. Install the Cloudflare Origin CA certificate and
key directly in Secret Manager; never pass them through Terraform.

## State and secrets

Terraform state uses the bootstrap-created GCS bucket. Terraform declares
Secret Manager containers only; workflows add values through stdin, so secret
payloads never enter state, command arguments, logs, or workflow outputs.

## Runtime

`runtime/compose.gcp.yml` uses host networking while PostgreSQL, FastAPI, and
Next.js bind loopback. Caddy alone binds ports 80/443. The deployer uploads the
runtime files through IAP, pulls backend/frontend images by digest, takes a
quiesced pre-deploy backup, migrates, and installs the nightly-backup systemd
timer. The host never tears itself down; use the destroy workflow. `DEMO_MODE`
defaults to `false` (public sign-up) and bootstraps the single demo account
only when set to `true`.
