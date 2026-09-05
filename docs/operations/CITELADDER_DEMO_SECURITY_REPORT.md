# CiteLadder GCP demo launch report

Scope: repository controls for the temporary `citeladder.com` Google Cloud demo.

## Verdict

**NO-GO until the external setup and fresh-deployment acceptance checks in
`GOOGLE_CLOUD.md` are completed.** The repository now contains the intended
GCP controls, but repository evidence cannot prove the live GitHub environment,
GCP project, Cloudflare configuration, secret versions, backup restore, or
deployed runtime.

## Repository controls

- PASS: dedicated VPC; Cloudflare-only ports 80/443; IAP-only SSH; no public
  ingress for PostgreSQL, FastAPI, Next.js, or SSH.
- PASS: Shielded VM with Secure Boot, vTPM, integrity monitoring, OS Login,
  blocked project SSH keys, a dedicated service account, and a balanced 30 GiB
  disk.
- PASS: Terraform declares secret containers but no payloads. GitHub uses OIDC
  Workload Identity Federation and sends initial secret values through stdin.
- PASS: backend and frontend image inputs require immutable digests. Deployment
  summaries record the commit and exact digests.
- PASS: PostgreSQL, FastAPI, and Next.js bind loopback under host networking;
  PostgreSQL TLS is required; only Caddy binds public web ports.
- PASS: the runtime includes all ten worker/scheduler processes, a quiesced
  pre-deploy dump, nightly backups, and a ten-day object lifecycle. The
  self-terminating expiry timer was removed; teardown is the destroy workflow.
- PASS: AWS demo workflows, Terraform, infrastructure tests, and active AWS
  runbooks were removed rather than retained as a second deployment authority.

## External launch blockers

- P1 / UNVERIFIED: `gcp-demo` must require protected `main`, successful CI, and
  owner approval. WIF must be read back with exact repository, ref, and
  environment claims.
- P1 / UNVERIFIED: Cloudflare must use Full (strict), preserve mail records,
  proxy the root record, disable caching for auth and `/api/*`, and install the
  reviewed Origin CA material in Secret Manager.
- P1 / UNVERIFIED: a fresh deployment must prove registration denial, exactly
  one account, public-port isolation, non-Cloudflare origin rejection, login,
  worker recovery, restart persistence, representative crawls, backup/restore,
  and forwarded-header spoof resistance.
- P1 / UNVERIFIED: the disposable-project deletion rehearsal must prove that no
  separately billed resources or images remain.

## Required verification

Run `./scripts/check.ps1` and `./scripts/test.ps1` on the exact deployment
commit, then complete every First deployment and Tests and Acceptance Criteria
check in `GOOGLE_CLOUD.md`. Change this verdict only from observed evidence.
