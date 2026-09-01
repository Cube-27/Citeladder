# Temporary CiteLadder Google Cloud Demo

## Summary

Deploy the existing application unchanged on one Compute Engine VM:

```text
Cloudflare → Caddy → Next.js → FastAPI
                            ├─ PostgreSQL 16
                            └─ Existing workers and schedulers
```

- Repository: private `Cube-27/Citeladder`, initially copied with full Git history.
- GCP: dedicated disposable project in `asia-south1` (Mumbai).
- Runtime: one on-demand `e2-standard-2` VM, 2 vCPU/8 GiB, 30 GiB balanced disk.
- URL: `https://citeladder.com`.
- Lifetime: seven days, with the existing fixed demo expiry and one-account restriction.
- Expected GCP cost: approximately USD $15–25 for seven continuously running days; set a $25 budget alert. Provider/API usage is separate.
- Do not use Cloud Run, Cloud SQL, a load balancer, Kubernetes, Redis, or Spot VMs for this temporary demo.

## Repository and Deployment Changes

- Make `Cube-27/Citeladder` private before copying code. Configure `abhineetjain13` and `abhineet.jain@cube27.com` only as Git commit identity; GitHub authentication continues through the authorized account/session.
- Preserve full history and tags. In the Cube-27 clone, name the old repository `upstream` and Cube-27 `origin`; until the eventual ownership shift, bring application updates in through reviewed merges from `upstream/main`.
- Remove the AWS-demo workflows, Terraform, tests, and active AWS runbooks from the Cube-27 copy. Replace them with GCP infrastructure, GCP deployment workflows, a GCP infrastructure test, and the owner runbook. Update `scripts/validation.json` so GCP infrastructure changes select the replacement test.
- Add a protected GitHub environment named `gcp-demo`. Require `main`, successful CI, and owner approval for deploy and teardown.
- Use Google Workload Identity Federation with exact claims for `Cube-27/Citeladder`, `main`, and `gcp-demo`. Store no GCP service-account keys in GitHub.
- Provision with Terraform under a GCP-specific owner:
  - dedicated VPC, static IPv4, Cloudflare-only ports 80/443, and SSH only through IAP;
  - Shielded VM with Secure Boot, vTPM, integrity monitoring, OS Login, and no default broad service account;
  - Artifact Registry, Secret Manager, private backup bucket, budget alerts, and the VM;
  - Terraform state in a versioned, uniform-access GCS bucket within the disposable project.
- Add a production Compose overlay that:
  - runs the existing API, frontend, migration/bootstrap, PostgreSQL, and all ten background processes;
  - uses host networking but binds PostgreSQL, FastAPI, and Next.js to `127.0.0.1`; only Caddy binds 80/443;
  - enables PostgreSQL TLS and keeps `DB_SSL_MODE=require`;
  - runs `alembic upgrade head && python -m app.demo.bootstrap`;
  - builds the frontend with `BACKEND_ORIGIN=http://127.0.0.1:8000`, `CITELADDER_TASK_LOCAL_BACKEND=true`, and demo mode;
  - throttles demo concurrency to `AUDIT_WORKER_CONCURRENCY=2`, `DB_POOL_SIZE=8`, `DB_MAX_OVERFLOW=0`, and Site Health global/per-host concurrency of 2.
- Build backend and frontend images in GitHub Actions, push immutable digests to Artifact Registry, deploy those exact digests over IAP, and record the source commit and digests in the GitHub deployment summary.
- Keep core credentials, database password, demo password, provider keys, and Cloudflare origin private key in Secret Manager. The frontend receives only public/demo configuration.
- Create a nightly compressed PostgreSQL dump with a ten-day bucket lifecycle. Before each update, take an additional pre-deploy dump.
- Install a systemd expiry timer that stops Compose and powers off the VM at `DEMO_EXPIRES_AT`. Redeployment must reuse—not extend—the original deadline.

No additional GCP-specific public API or database schema changes are required.
The application stack still includes the Site Health API and synchronized
frontend contract changes documented elsewhere in this repository.

## Owner Runbook

### One-time setup

1. Make `Cube-27/Citeladder` private, copy the reviewed `main` history and tags, enable branch protection, and create the protected `gcp-demo` environment.
2. Create a new globally unique GCP project, link billing, label it `project=citeladder, environment=demo`, and select Mumbai.
3. Run the checked-in owner bootstrap to enable billing, Compute, IAM, IAP, Artifact Registry, Secret Manager, Cloud Build, and Storage APIs; create the state bucket and exact GitHub WIF trust.
4. Set GitHub environment variables for project ID, project number, region, zone, WIF provider, deploy service account, state bucket, domain, and the fixed RFC3339 expiry.
5. Generate the demo login password in a password manager and install it as a protected environment secret. Allow the first deployment to generate independent database, JWT, encryption, and referral secrets directly into Secret Manager.
6. Add only provider credentials needed for the demonstration. Leave billing checkout, OAuth integrations, and unused providers disabled.
7. In Cloudflare:
   - preserve all MX, SPF, DKIM, and DMARC records;
   - create an Origin CA certificate for `citeladder.com`;
   - store its certificate and private key in Secret Manager;
   - use Full (strict), proxy the root record, disable caching for `/api/*` and authentication responses, and point the root A record to the provisioned static IP. Origin CA supports this proxied/strict configuration. [Cloudflare Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)

### First deployment

1. Run the repository gates on the exact `main` commit.
2. Approve the `gcp-demo` workflow. It must build images, push digests, apply Terraform, deploy Compose, migrate, bootstrap exactly one account, and verify health.
3. Confirm:
   - `https://citeladder.com` is valid HTTPS;
   - `/api/v1/auth/register` returns 403;
   - the configured account can log in;
   - the database contains exactly one user;
   - API, database, and worker ports are unreachable publicly;
   - Cloudflare proxying is enabled and the origin IP does not answer non-Cloudflare traffic.
4. Create the few required demo projects and run representative crawls before the live presentation.

### Daily operation

- Check VM status, disk usage, container health, failed worker logs, last successful backup, and the GCP billing report.
- Start or stop the VM through the protected control workflow. Stopped VMs do not incur VM usage charges, though their disk and static IP remain billable. [Google Compute Engine stop behavior](https://docs.cloud.google.com/compute/docs/reference/rest/v1/instances/stop)
- After starting, wait for `/ready`, confirm workers are running, and perform one login before presenting.
- For updates, merge the selected upstream commit and run CI, then quiesce writes
  by stopping Caddy, the API, workers, and schedulers (or by enforcing an
  equivalent read-only maintenance mode). Take the pre-deploy dump only after
  writes are quiesced, deploy the pinned digests, run migrations, restart the
  stack, and perform the smoke test.
- For rollback, quiesce writes again before changing images or data. Restore the
  recorded prior digests and, when a migration makes application rollback
  unsafe, restore the pre-deploy dump before reopening Caddy, the API, workers,
  or schedulers. Any writes accepted after that backup are outside the dump and
  may be lost when it is restored; confirm that loss window explicitly before
  proceeding.

### Incident and teardown

- If anything appears compromised, disable the Cloudflare record, stop the VM, rotate the affected secrets, and inspect logs before restarting.
- At demo expiry, verify login is rejected and the VM has powered off.
- Export only explicitly required evidence; otherwise retain no demo data.
- Remove the Cloudflare A record and revoke the Origin CA certificate.
- Delete the dedicated GCP project, then verify no separately billed resources or Artifact Registry images remain. Project deletion is the authoritative teardown.

## Tests and Acceptance Criteria

- Replace the AWS infrastructure test with deterministic checks proving:
  - no public 22, 3000, 8000, 5432, or database ingress;
  - Cloudflare-only 80/443 and IAP-only SSH;
  - exact WIF repository/environment claims;
  - no service-account key files or secret payloads in Git, Terraform, outputs, logs, or workflow arguments;
  - immutable image digests, Shielded VM controls, fixed expiry, and least-privilege service accounts.
- Validate rendered Compose configuration, PostgreSQL TLS, one-account bootstrap idempotency, frontend secret isolation, and Caddy routing.
- Run `.\scripts\check.ps1` followed by `.\scripts\test.ps1`.
- On the deployed stack, verify login, registration denial, expiry behavior, persisted data after VM restart, two or more representative site crawls reaching terminal state, worker recovery, backup/restore, and spoofed forwarded-header handling.
- Acceptance requires a successful fresh deployment and a successful disposable-project teardown rehearsal.

## Assumptions

- The owner makes `Cube-27/Citeladder` private before any code or deployment material is pushed.
- `citeladder.com` can be temporarily repointed through Cloudflare.
- Seven days and Mumbai are the default deployment window and location.
- Availability is demo-grade: one VM, no HA, no SLA, and brief downtime during updates is acceptable.
- The $25 budget is an alert, not a hard spending cap; GCP budgets do not automatically stop resources.
- OS Login is used instead of persistent metadata SSH keys, following Google’s access guidance. [Google OS Login best practices](https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/login-access)
