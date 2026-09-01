# CiteLadder seven-day AWS demo

This is the active AWS deployment for `citeladder.com`. It creates one Fargate
service/task, private PostgreSQL 16 RDS, an ALB restricted to Cloudflare's
published ranges, two immutable ECR repositories, ACM, CloudWatch, one runtime
secret container, and the fixed expiry marker. It creates no NAT gateway,
Redis, EFS, application S3 bucket, or application task role.

## One-time owner setup

Before running a workflow, configure the protected GitHub environment
`aws-demo` to allow only `main`. Require owner approval for Domain and Destroy.
Add these environment variables:

- `TF_STATE_BUCKET`: existing shared, encrypted and versioned state bucket
- `AWS_BOOTSTRAP_ROLE_ARN`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_CONTROL_ROLE_ARN`
- `AWS_DESTROY_ROLE_ARN`

Each role trust policy must require audience `sts.amazonaws.com` and the exact
GitHub environment subject documented in the owner runbook. Do not use access
keys. The role policies and state-bucket policy must follow the boundaries in
the owner runbook; these account-level identities are intentionally not in the
application Terraform state because a destroy job cannot safely destroy its
own active role.

Optional provider credentials belong in GitHub environment secrets. Currently
the deploy workflow imports `MISTRAL_API_KEY` and `DEFAULT_AGENT_API_KEY` when
present. Empty values keep those integrations disabled.

## Deployment

1. Run `AWS Demo - Domain` from `main`.
2. Add its ACM validation CNAME in Cloudflare as DNS-only and wait for Issued.
3. Run `AWS Demo - Deploy` from `main`.
4. Point the proxied apex CNAME to the emitted ALB hostname.
5. Set Cloudflare SSL to Full (strict), bypass `/api/*` caching, then run
   `AWS Demo - Origin Ranges`.

The first deploy stores a fixed timestamp in
`/citeladder/demo/expires-at`. Redeploys reuse it. Runtime secret values are
generated or merged by the credentialed workflow through a temporary file;
Terraform manages only the secret container and therefore does not place
payloads in state.

Use `AWS Demo - Control` for start/stop and `AWS Demo - Destroy` for early
teardown. `AWS Demo - Expiry` invokes the same exact-state destroy path after
the deadline.

## Local validation

```powershell
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
.\scripts\check.ps1
.\scripts\test.ps1
```

Provider settings, DNS/TLS state, IAM trust, bucket policy, deployed ECR scan
results, and direct-origin rejection remain runtime controls and must be
verified in AWS/Cloudflare rather than inferred from this repository.
