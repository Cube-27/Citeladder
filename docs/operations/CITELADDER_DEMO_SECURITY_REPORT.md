# CiteLadder Demo Security Report

Date: 2026-09-01
Scope: high-risk paths for the temporary `citeladder.com` AWS demo

## Verdict

**GO WITH CONDITIONS for a future AWS deployment.** Repository-level P1
findings are remediated and covered by tests. Deployment remains conditional on
the owner verifying the external GitHub, AWS, and Cloudflare controls listed
below; none were changed or observed during this repository-only assessment.

## Findings

### P1 — Public account registration in demo mode — fixed

The public registration API previously created users, workspaces, and billing
state. It now rejects requests server-side whenever `DEMO_MODE=true`; the
frontend also removes signup affordances in that mode.

Evidence: `backend/app/api/auth.py`, frontend auth pages, and
`backend/tests/component/test_auth_api.py`.

### P1 — Demo sessions survived the seven-day deadline — fixed

Login and the common authenticated-user dependency now fail closed when the
timezone-aware `DEMO_EXPIRES_AT` deadline is absent, invalid, or reached. This
invalidates already-issued sessions as well as new logins.

Evidence: `backend/app/core/config/__init__.py`, `backend/app/api/deps.py`, and
auth component tests.

### P1 — Demo database could contain multiple accounts — fixed

The migration task runs an idempotent bootstrap through the normal auth service.
It creates or resets only the configured demo account and refuses to continue
when any unexpected account exists.

Evidence: `backend/app/demo/bootstrap.py` and
`backend/tests/component/test_demo_bootstrap.py`.

### P1 — Unsafe AWS origin and secret guidance — fixed in repository

The active Terraform restricts ALB ingress to explicit Cloudflare ranges,
exposes only frontend port 3000, keeps PostgreSQL private, uses digest-only ECR
images, gives the application no task role, and keeps secret payloads out of
Terraform state. The deploy workflow generates/merges secrets through a
temporary permission-restricted file and blocks Critical/High ECR findings.

Evidence: `infra/terraform/`, AWS demo workflows, and infrastructure static
tests.

## Verification

- Terraform 1.10.5 `fmt`: passed.
- Terraform 1.10.5 `validate` with AWS provider 6.62.0: passed.
- Focused authentication, bootstrap, production-config, and infrastructure
  tests: 37 passed.
- Workflow YAML parse: 7 files passed.
- Repository `scripts/check.ps1`: passed.
- Final repository-selected tests: 354 backend, 357 frontend, and 3 E2E tests
  passed.

The earlier Codex Security scan ID
`6dafccb9-b62f-4fcb-9554-361eeba26001` failed artifact finalization because its
temporary `scan-manifest.json` was missing. This document records the
repository-validated recovery assessment; it is not the missing canonical scan
artifact.

## Unverified external conditions

Before deployment, the owner must verify:

- the `aws-demo` GitHub environment permits only protected `main` and requires
  approval for bootstrap/destroy;
- OIDC roles use exact audience and immutable environment-subject equality;
- the shared state bucket has public access blocked, versioning, encryption,
  TLS enforcement, and exact state/lock-key policies;
- ACM is Issued and Cloudflare uses Full (strict);
- Cloudflare bypasses caching for `/api/*` and authentication responses;
- the deployed ALB is unreachable directly and accepts only current Cloudflare
  ranges;
- deployed ECR digests have no unresolved Critical/High findings;
- destroy removes only CiteLadder resources and exact state-object versions.
