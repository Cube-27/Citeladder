# Temporary CiteLadder Google Cloud Demo

> **Implementation status:** repository infrastructure is implemented under
> `infra/gcp`; deployment remains operator-gated until the external GCP,
> GitHub environment, Secret Manager, and Cloudflare setup is completed.
> `Cube-27/Citeladder` is temporarily public at the owner's explicit request
> for code review and must be made private after deployment.

Follow [GCP_RUNBOOK.md](GCP_RUNBOOK.md) for the executable owner procedure.
This document remains the deployment design and security contract.

## Summary

The VM retains backend compute and data; frontend delivery uses two Workers:

```text
Marketing Worker (citeladder.com) ─┐
                                    ├─ protected origin → Caddy → FastAPI → PostgreSQL 16
Product Worker (app.citeladder.com) ┘                       └─ workers and schedulers
```

- Repository: `Cube-27/Citeladder`, temporarily public for code review and made
  private immediately after the reviewed deployment.
- GCP: dedicated disposable project in `asia-south1` (Mumbai), with the VM zone
  selected by deployment configuration so capacity failures can use another
  zone in the same region.
- Runtime: one on-demand `e2-standard-2` VM, 2 vCPU/8 GiB, 30 GiB balanced disk.
- URLs: `https://citeladder.com` for marketing and MCP; `https://app.citeladder.com` for product.
- Lifetime: runs until torn down deliberately. Self-serve sign-up and Google sign-in are off by default (`PUBLIC_SIGNUP_ENABLED`, `OAUTH_GOOGLE_ENABLED`); operators create client logins. `DEMO_MODE=true` restores the one-account restriction.
- Expected GCP cost: approximately USD $15–25 for seven continuously running days; set an equivalent alert in the billing-account currency. The reviewed INR account uses INR 2,400. Provider/API usage is separate.
- Do not use Cloud Run, Cloud SQL, a load balancer, Kubernetes, Redis, or Spot VMs for this temporary demo.

## Repository and Deployment Changes

- Keep `Cube-27/Citeladder` public only through code review and the reviewed
  deployment, then make it private immediately. Configure `abhineetjain13` and
  `abhineet.jain@cube27.com` only as Git commit identity; GitHub authentication
  continues through the authorized account/session.
- Preserve full history and tags. In the Cube-27 clone, name the old repository `upstream` and Cube-27 `origin`; until the eventual ownership shift, bring application updates in through reviewed merges from `upstream/main`.
- Remove the AWS-demo workflows, Terraform, tests, and active AWS runbooks from the Cube-27 copy. Replace them with GCP infrastructure, GCP deployment workflows, a GCP infrastructure test, and the owner runbook. Run the replacement infrastructure test directly after changes.
- Add a protected GitHub environment named `gcp-demo`. Require `main`, successful CI, and owner approval for deploy and teardown.
- Use Google Workload Identity Federation with exact claims for `Cube-27/Citeladder`, `main`, and `gcp-demo`. Store no GCP service-account keys in GitHub.
- Provision with Terraform under a GCP-specific owner:
  - dedicated VPC, static IPv4, Cloudflare-only ports 80/443, and SSH only through IAP;
  - Shielded VM with Secure Boot, vTPM, integrity monitoring, OS Login, and no default broad service account;
  - a user-managed VM identity with the recommended `cloud-platform` access scope, constrained by resource-specific IAM roles;
  - Artifact Registry, Secret Manager, private backup bucket, budget alerts, and the VM;
  - Terraform state in a versioned, uniform-access GCS bucket within the disposable project.
- Add a production Compose overlay that:
  - runs the API, migration/bootstrap, PostgreSQL, and all ten background processes;
  - uses host networking but binds PostgreSQL and FastAPI to `127.0.0.1`; only Caddy binds protected origin ingress;
  - enables PostgreSQL TLS and keeps `DB_SSL_MODE=require`;
  - runs `alembic upgrade head && python -m app.demo.bootstrap`;
  - throttles demo concurrency to `AUDIT_WORKER_CONCURRENCY=2`, `DB_POOL_SIZE=8`, `DB_MAX_OVERFLOW=0`, and Site Health global/per-host concurrency of 2.
  - enables the read-only MCP server with stable apex identity; Caddy admits
    authenticated Worker subrequests only and forwards the allowlisted public host.
- Build the backend image in GitHub Actions, push its immutable digest to Artifact Registry and deploy it over IAP. Publish each frontend Worker independently through its protected workflow.
- Keep core credentials, database password, demo password, provider keys, and Cloudflare origin private key in Secret Manager. Worker secrets hold the matching dedicated ingress token.
- Create a nightly compressed PostgreSQL dump with a ten-day bucket lifecycle. Before each update, take an additional pre-deploy dump. The VM can create, list, and read backup objects for monitoring and restore, but cannot delete or overwrite them; lifecycle policy owns routine deletion.
- Do not install any self-teardown timer. Stopping and destroying the host are deliberate acts run through the protected control and destroy workflows.

The baseline schema includes MCP OAuth clients, one-time authorization state,
and revocable grants. Because pre-launch migrations remain a single folded
baseline, an existing disposable demo database must be rebuilt or explicitly
recreated before deploying this change. The application stack still includes
the Site Health API and synchronized frontend contract changes documented
elsewhere in this repository.

### Implemented owners

- `infra/gcp/*.tf`: VPC, firewall rules, static address, Shielded VM, dedicated
  VM service account, Artifact Registry, Secret Manager containers, backup
  bucket, and budget alert.
- `infra/gcp/bootstrap.ps1`: disposable-project APIs, versioned GCS state
  bucket, deploy service account, and exact GitHub Workload Identity trust.
- `infra/gcp/runtime/`: loopback-only production Compose stack, Caddy, database
  TLS, IAP deployment, and backup scripts.
- `.github/workflows/gcp-demo-*.yml`: protected deployment, VM control, and
  authoritative project teardown.
- `backend/tests/unit/test_gcp_demo_infrastructure.py`: deterministic security
  and deployment-contract checks run through the native test runners.

### Protected GitHub environment values

Configure these variables on `gcp-demo`: `GCP_PROJECT_ID`,
`GCP_PROJECT_NUMBER`, `GCP_REGION`, `GCP_ZONE`, `GCP_WIF_PROVIDER`,
`GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_TF_STATE_BUCKET`, `GCP_BILLING_ACCOUNT`,
`GCP_BUDGET_CURRENCY_CODE`, `GCP_BUDGET_UNITS`, `DOMAIN_NAME`, and optionally
`DEMO_MODE`, `DEMO_EXPIRES_AT` (demo mode only), and `DEMO_LOGIN_EMAIL`.

Configure these environment secrets: `DEMO_LOGIN_PASSWORD`, <!-- pragma: allowlist secret -- variable name, not a value -->
`CLOUDFLARE_ORIGIN_CERT`, `CLOUDFLARE_ORIGIN_KEY`, the four OAuth client
values (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`BING_OAUTH_CLIENT_ID`, `BING_OAUTH_CLIENT_SECRET`), and only the provider keys
needed for the demonstration. The deploy workflow creates independent database,
JWT, encryption, and referral secrets directly in Secret Manager on first use.

## Owner Runbook

### One-time setup

1. Preserve the reviewed `main` history and tags, enable branch protection, and
   create the protected `gcp-demo` environment. Make the temporarily public
   repository private immediately after deployment and review.
2. Create a new globally unique GCP project, link billing, label it
   `project=citeladder`, `environment=demo`, and `managed_by=terraform`, and
   select Mumbai.
3. Run the checked-in owner bootstrap to enable billing, Compute, IAM, IAP, Artifact Registry, Secret Manager, Cloud Build, and Storage APIs; create the state bucket and exact GitHub WIF trust.
4. Set GitHub environment variables for project ID, project number, region, zone, WIF provider, deploy service account, state bucket, and domain.
5. Generate the demo login password in a password manager and install it as a protected environment secret. Allow the first deployment to generate independent database, JWT, encryption, and referral secrets directly into Secret Manager.
6. Add the Google and Bing OAuth client pairs, plus any other provider credentials needed. Publish the Google consent screen and register the sign-in and connect redirect URIs against the deployed hostname. Leave billing checkout and unused providers disabled.
7. In Cloudflare:
   - preserve all MX, SPF, DKIM, and DMARC records;
   - create an Origin CA certificate covering `citeladder.com` and `*.citeladder.com`;
   - store its certificate and private key in Secret Manager;
   - use Full (strict), proxy `origin.citeladder.com` to the static IP and leave it free of Worker routes;
   - attach the apex and app Custom Domains to their respective Workers during the approved release, preserving email DNS records. [Cloudflare Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)

### First deployment

1. Run the repository gates on the exact `main` commit.
2. Follow the [Workers runbook](WORKERS_RUNBOOK.md) release order and protected approvals for backend, product Worker, then marketing Worker.
3. Confirm protected origin rejects unauthenticated traffic, both public hosts have valid HTTPS, app login and workspace isolation work, apex MCP identity remains stable, and internal ports are unreachable publicly. `DEMO_MODE=true` alone enables the single-account restriction.
4. Create the few required demo projects and run representative crawls before the live presentation.

### Daily operation

- Check VM status, disk usage, container health, failed worker logs, last successful backup, and the GCP billing report.
- Start or stop the VM through the protected control workflow. Stopped VMs do not incur VM usage charges, though their disk and static IP remain billable. [Google Compute Engine stop behavior](https://docs.cloud.google.com/compute/docs/reference/rest/v1/instances/stop)
- After starting, wait for backend `/ready`, confirm workers are running, and perform one app-host login before presenting.
- For backend updates, merge the selected commit and run CI, then use the
  protected GCP workflow to quiesce writes, take a pre-deploy dump, deploy the
  pinned backend digest and validate the stack. Worker updates do not restart
  the database or backend writers.
- For rollback, quiesce writes again before changing images or data. Restore the
  recorded prior digests and, when a migration makes application rollback
  unsafe, restore the pre-deploy dump before reopening Caddy, the API, workers,
  or schedulers. Any writes accepted after that backup are outside the dump and
  may be lost when it is restored; confirm that loss window explicitly before
  proceeding.

### Incident and teardown

- If anything appears compromised, disable the Cloudflare record, stop the VM, rotate the affected secrets, and inspect logs before restarting.
- To take the demo down, stop the VM through the control workflow and then destroy the project.
- Export only explicitly required evidence; otherwise retain no demo data.
- Remove the Cloudflare A record and revoke the Origin CA certificate.
- Delete the dedicated GCP project, then verify no separately billed resources or Artifact Registry images remain. Project deletion is the authoritative teardown.

## Tests and Acceptance Criteria

- Replace the AWS infrastructure test with deterministic checks proving:
  - no public 22, 3000, 8000, 5432, or database ingress;
  - Cloudflare-only 80/443 and IAP-only SSH;
  - exact WIF repository/environment claims;
  - no service-account key files or secret payloads in Git, Terraform, outputs, logs, or workflow arguments;
  - immutable image digests, Shielded VM controls, no self-teardown timer, and least-privilege service accounts.
- Validate rendered backend Compose configuration, PostgreSQL TLS, demo-mode bootstrap idempotency, and protected Caddy routing.
- Run `.\scripts\check.ps1` and focused native-runner tests; CI runs the full selected suites.
- On the deployed stack, verify operator-created login, Search Console and Bing connect, persisted data after VM restart, two or more representative site crawls reaching terminal state, worker recovery, backup/restore, and spoofed forwarded-header handling.
- Production acceptance follows the Workers runbook; teardown needs separate authorization.

## Assumptions

- The owner keeps `Cube-27/Citeladder` public only for review and the reviewed
  deployment, then makes it private immediately afterward.
- `citeladder.com` can be temporarily repointed through Cloudflare.
- Seven days and Mumbai are the default deployment window and location.
- Availability is demo-grade: one VM, no HA, no SLA, and brief downtime during updates is acceptable.
- The $25 budget is an alert, not a hard spending cap; GCP budgets do not automatically stop resources.
- OS Login is used instead of persistent metadata SSH keys, following Google’s access guidance. [Google OS Login best practices](https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/login-access)
