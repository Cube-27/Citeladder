# Google Cloud temporary demo infrastructure

Follow the complete owner procedure in
[`docs/operations/GCP_RUNBOOK.md`](../../docs/operations/GCP_RUNBOOK.md).

This directory is the sole infrastructure owner for the seven-day CiteLadder
demo described in [`docs/operations/GOOGLE_CLOUD.md`](../../docs/operations/GOOGLE_CLOUD.md).
It provisions one Shielded Compute Engine VM in Mumbai, a dedicated VPC,
Cloudflare-only web ingress, IAP-only SSH, Artifact Registry, Secret Manager,
a private backup bucket, and a USD 25 billing-budget alert.

## Bootstrap

Run `bootstrap.ps1` once from an owner workstation authenticated with `gcloud`.
It creates or configures the disposable project, enables the required APIs,
creates the versioned state bucket, and establishes an exact GitHub OIDC trust
for `Cube-27/Citeladder`, `refs/heads/main`, and `gcp-demo`.

The script prints the non-secret GitHub environment variables. Configure them
on the protected `gcp-demo` environment, add the fixed `DEMO_EXPIRES_AT`,
`GCP_BILLING_ACCOUNT`, and `DOMAIN_NAME`, then add the protected
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
quiesced pre-deploy backup, migrates and bootstraps the single demo account,
and installs nightly-backup and fixed-expiry systemd timers.
