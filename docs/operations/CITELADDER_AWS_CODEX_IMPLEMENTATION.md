# CiteLadder AWS Demo — Codex IaC Implementation Plan

> **Status: implemented; verification required before first deploy.** The
> repository now contains the demo auth boundary, fixed-expiry enforcement,
> one-account bootstrap, Terraform, and protected workflows described here.
> Do not expose the application until section 22's repository gates pass and
> the owner has verified the external IAM, state bucket, ACM, and Cloudflare
> controls in the runbook.
>
> The former `infra/aws/` separate-service starter has been retired. The active
> authority is `infra/terraform/`, which uses one public-IP Fargate task for the
> seven-day demo.

## 1. Objective

Build a **temporary, demo-only AWS deployment** for `abhij1306/Citeladder` at:

- **URL:** `https://citeladder.com`
- **AWS Region:** `us-east-1`
- **GitHub environment:** `aws-demo`
- **Intended users:** exactly **one developer/demo account**
- **Lifetime:** maximum **7 days from the first successful provision**
- **Public registration:** disabled
- **Public application access:** normal internet-facing URL; no Cloudflare Access, VPN, WAF, or additional authentication layer
- **End of life:** automatic full AWS destroy after expiry, with an earlier manual Destroy action available
- **Data retention after destroy:** none; no final RDS snapshot

This is not a production architecture. Optimize for:
1. reliable demonstration,
2. low operational complexity,
3. low temporary cost,
4. deterministic start/stop/destroy,
5. minimal changes to the existing CiteLadder runtime.

---

## 2. Repository facts that the AWS implementation must preserve

The current repository already defines the required runtime through Docker Compose:

- Next.js frontend
- FastAPI API
- PostgreSQL 16
- Alembic migration job
- PostgreSQL-backed work queues
- audit worker
- audit scheduler
- site-health worker
- brand-discovery worker
- content worker
- agent worker
- analytics worker
- queue sweeper
- integration worker
- integration dispatcher

The browser is intentionally same-origin. The Next.js server proxies relative `/api/*` requests to the FastAPI API.

Important consequence:

> AWS only needs to expose the **frontend container** through the ALB. The API and worker containers remain internal to the ECS task.

There is currently **no Redis, ElastiCache, EFS, or S3 application-storage requirement** in the Compose architecture.

Do not add those services.

---

## 3. Architecture decision

```text
                         Internet
                            |
                       Cloudflare DNS
                  citeladder.com (proxied)
                            |
                       HTTPS :443
                            |
                 +----------------------+
                 | AWS Application LB   |
                 | internet-facing      |
                 +----------+-----------+
                            |
                      frontend :3000
                            |
                 +----------v-----------+
                 | ECS Fargate Service  |
                 | desired count = 1    |
                 |                      |
                 |  migrate (one-shot)  |
                 |  frontend            |
                 |  api :8000           |
                 |  audit-worker        |
                 |  audit-scheduler     |
                 |  site-health-worker  |
                 |  brand-discovery     |
                 |  content-worker      |
                 |  agent-worker        |
                 |  analytics-worker    |
                 |  queue-sweeper       |
                 |  integration-worker  |
                 |  integration-dispatch|
                 +----------+-----------+
                            |
                         :5432
                            |
                 +----------v-----------+
                 | RDS PostgreSQL 16    |
                 | Single-AZ            |
                 | private              |
                 +----------------------+
```

### Why one ECS service/task

For a one-user demo, do not create a separate ECS service for every worker.

Use **one Fargate task definition** containing all long-running runtime containers. This preserves the existing process separation without multiplying AWS services, load balancers, or deployment controls.

Fargate billing is based on the task CPU/memory allocation, not on how many containers are declared inside that task.

This topology is not compatible with the current production frontend build as
written. `frontend/next.config.ts` rejects a loopback `BACKEND_ORIGIN`, while
containers in one `awsvpc` task communicate through loopback. Before any AWS
apply, add and test a narrow task-local mode that permits only
`http://127.0.0.1:8000`; do not remove the general production loopback guard.

### Default Fargate size

Start with:

- CPU: `2048` (2 vCPU)
- Memory: `4096` MiB
- desired count: `1`

Expose these as Terraform variables so memory can be raised to `8192` MiB without redesign if crawler workloads show memory pressure.

Do not autoscale for this demo.

---

## 4. Explicit non-goals

Do **not** add:

- EKS / Kubernetes
- EC2 application hosts
- Redis / ElastiCache
- EFS
- S3 application artifact storage unless a new verified runtime dependency requires it
- NAT Gateway
- CloudFront
- AWS WAF
- Cloudflare Access
- Route 53 migration
- Multi-AZ RDS
- RDS read replicas
- autoscaling
- blue/green deployment
- production backup policy
- complex secret rotation
- production monitoring stack
- public signup
- more than one application user

If a new dependency is discovered during implementation, document the concrete code path requiring it before adding infrastructure.

---

## 5. Networking

Create one VPC, for example:

- VPC CIDR: `10.27.0.0/16`

Across two Availability Zones in `us-east-1`:

### Public subnets

- `10.27.0.0/24`
- `10.27.1.0/24`

Used by:

- Application Load Balancer
- ECS Fargate tasks

Attach:

- Internet Gateway
- public route table with `0.0.0.0/0 -> IGW`

ECS tasks must use `assign_public_ip = true`.

This is intentional. CiteLadder workers need outbound internet access to crawl sites and call configured external APIs. Public task ENIs avoid a NAT Gateway.

### Private subnets

- `10.27.10.0/24`
- `10.27.11.0/24`

Used only by RDS.

No NAT route is required.

### Security groups

#### `citeladder-demo-alb`

Inbound:
- TCP 80 and 443 only from the current published Cloudflare IPv4 and IPv6
  egress ranges

The Cloudflare range set must be an explicit reviewed Terraform input. The
deploy workflow refreshes or verifies it against Cloudflare's published list
before apply and fails closed on an empty, catch-all, or stale set. A daily
scheduled reconciliation compares the deployed rules with the published list
and updates only this ALB security group through the narrowly scoped control
role. Do not open the ALB to `0.0.0.0/0` or `::/0`; that would allow direct
origin bypass.

Outbound:
- TCP 3000 to ECS task security group

#### `citeladder-demo-ecs`

Inbound:
- TCP 3000 from ALB security group only

No public inbound rule for port 8000.

Outbound:
- allow all

The task receives no application `taskRoleArn`. It does not call AWS APIs;
Secrets Manager injection and log delivery belong to the ECS execution role.
Adding a task role later requires a concrete consumer and least-privilege
resource policy.

The FastAPI API is reached by the frontend over the shared task network at `127.0.0.1:8000`.

#### `citeladder-demo-rds`

Inbound:
- TCP 5432 from ECS task security group only

No public ingress.

---

## 6. Load balancer and TLS

Create:

- internet-facing Application Load Balancer
- target type: `ip`
- target port: `3000`
- health check against the frontend
- HTTP listener port 80: redirect to HTTPS
- HTTPS listener port 443: forward to frontend target group

Create an ACM public certificate in `us-east-1` for:

- `citeladder.com`

Use DNS validation.

Cloudflare must use **Full (strict)** encryption. Flexible or non-validating
origin TLS is prohibited. Add cache rules that bypass caching for `/api/*` and
all authentication responses. After the proxied record is active, verify both
that the public hostname works and that a direct non-Cloudflare request to the
ALB is rejected by its security group.

Cloudflare DNS is managed manually by the owner; do not add the Cloudflare Terraform provider.

Terraform should output:

- ACM validation CNAME name
- ACM validation CNAME value
- ALB DNS name
- final URL

### Certificate bootstrapping

Do not make a first full `terraform apply` hang waiting for a DNS record that does not yet exist.

Implement a domain/bootstrap workflow or documented targeted bootstrap step that:

1. creates the ACM certificate,
2. prints the validation CNAME,
3. stops,
4. owner adds the CNAME to Cloudflare as **DNS only**,
5. owner verifies ACM becomes `Issued`,
6. full deploy continues.

The final apex Cloudflare record will be:

- type: CNAME
- name: `@`
- target: ALB DNS name
- proxy: enabled

Cloudflare supports apex CNAME flattening.

---

## 7. RDS

Use:

- engine: PostgreSQL
- engine major version: `16`
- instance: `db.t4g.micro`
- allocated storage: `20 GiB`
- storage type: `gp3`
- Single-AZ
- publicly accessible: `false`
- deletion protection: `false`
- backup retention: `0`
- storage encryption: enabled
- auto minor version upgrade: acceptable
- final snapshot on deletion: **skip**
- delete automated backups on deletion: enabled

Create a DB subnet group from the two private subnets.

Database name:

- `citeladder`

Database user:

- `citeladder`

Generate a strong random database password.

Use RDS-managed master credentials where supported. Terraform must not receive
the database password, application cryptographic keys, demo password, or
provider keys as variables, locals, outputs, resource arguments, or data-source
results. Terraform manages secret containers, ARNs, and access policies only;
secret payloads are written by a separate trusted workflow step.

---

## 8. Terraform remote state

Reuse the same S3 Terraform-state bucket already used for the Invoro AWS demo.

Do **not** create another state infrastructure stack unless the existing bucket is unavailable.

Use:

```hcl
terraform {
  required_version = ">= 1.10"

  backend "s3" {
    key          = "citeladder-demo/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

Pass the bucket name during `terraform init` using partial backend configuration or a generated backend config file.

Do not use DynamoDB locking.

Before reuse, verify the shared bucket has Block Public Access enabled,
versioning enabled, enforced TLS, and default encryption. Prefer the bucket's
existing customer-managed KMS key when one is already the shared-state policy.
The deploy/bootstrap roles receive `s3:ListBucket` only for the exact
CiteLadder key plus `s3:GetObject`/`s3:PutObject` on
`citeladder-demo/terraform.tfstate`, and get/put/delete only on its `.tflock`.
The destroy role alone receives exact-key deletion and, when version cleanup is
required, exact-key version listing/deletion. Do not grant any role the broad
`citeladder-demo/*` object prefix.

On final successful destroy, remove only:

- `citeladder-demo/terraform.tfstate`
- `citeladder-demo/terraform.tfstate.tflock` if present

Never delete the shared Invoro/CiteLadder state bucket.

Terraform state must contain infrastructure metadata only, never runtime secret
values. If a prior apply ever persisted a secret payload, rotate that secret
and remove the affected state-object versions through an exact-key,
version-aware cleanup; deleting only the current object is not remediation.

---

## 9. ECR

Create two repositories:

- `citeladder-demo-backend`
- `citeladder-demo-frontend`

Requirements:

- immutable or SHA-based image tagging
- scan on push enabled
- `force_delete = true` for demo teardown
- lifecycle rule retaining only a small number of recent images

After push, wait for the ECR scan and fail deployment on any unresolved
Critical or High image finding. Resolve the pushed tag to an ECR image digest
and place the digest, not a mutable tag, in the ECS task definition.

Build once per deploy:

- backend image from repository root `Dockerfile`
- frontend image from `frontend/Dockerfile`

Tag both with the Git commit SHA.

Do not deploy `latest` as the task definition's immutable release reference.

---

## 10. ECS task definition

Use Fargate:

- network mode: `awsvpc`
- runtime platform: Linux
- one task definition family: `citeladder-demo`
- one ECS service: `citeladder-demo`
- desired count: `1`
- deployment minimum healthy percent can be `0` for this demo
- deployment maximum percent can be `100` or `200`

### Containers

#### `migrate`

Backend image.

Non-essential, one-shot command:

```text
alembic upgrade head
then
python -m app.demo.bootstrap
```

The bootstrap command must be added as part of this implementation.

#### `api`

Backend image.

Command equivalent to current Compose:

```text
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health check: existing `/ready`.

Must depend on `migrate` with condition `SUCCESS`.

#### `frontend`

Frontend image.

Port `3000`.

Build argument:

```text
BACKEND_ORIGIN=http://127.0.0.1:8000
```

This is deliberately different from Compose's `http://web:8000`, because containers in the same Fargate task communicate over the task's shared network namespace.

This exact value is permitted only by the task-local frontend mode described in
section 3. A generic production allowance for loopback origins is not
acceptable.

Depend on the API being healthy.

#### Long-running worker containers

Use the current backend image and existing commands:

- `python -m app.workers.audit_worker`
- `python -m app.workers.audit_scheduler`
- `python -m app.workers.site_health_worker`
- `python -m app.workers.brand_discovery_worker`
- `python -m app.workers.content_worker`
- `python -m app.workers.agent_worker`
- `python -m app.workers.analytics_worker`
- `python -m app.workers.queue_sweeper`
- `python -m app.workers.integration_worker`
- `python -m app.workers.integration_dispatcher`

Each depends on migration success.

Do not expose worker ports.

---

## 11. Demo-only authentication changes

This is a required part of the deployment implementation, not an optional UI tweak.

The pre-cutover backend exposed registration. A public URL with only a hidden
signup button would still allow direct calls to that API, so the demo boundary
is enforced server-side.

Add deployment settings:

```text
DEMO_MODE=true
DEMO_EXPIRES_AT=<UTC ISO-8601 timestamp>
DEV_LOGIN_EMAIL=dev@citeladder.com
DEV_LOGIN_PASSWORD=<secret>
```

### Required behavior

When `DEMO_MODE=true`:

1. `/auth/register` must reject registration server-side.
2. Frontend signup/register affordances should be removed or disabled.
3. A bootstrap command must ensure the demo DB contains exactly one user.
4. Login must fail once `DEMO_EXPIRES_AT` is reached.
5. Existing authenticated sessions must also stop working once `DEMO_EXPIRES_AT` is reached.

Do not rely only on the login endpoint for expiry because an already-issued cookie can remain valid.

The common authenticated-user dependency must enforce demo expiry.

### Idempotent user bootstrap

Add a small command, for example:

```text
python -m app.demo.bootstrap
```

Behavior:

- query existing users,
- if zero: create `DEV_LOGIN_EMAIL` using the normal auth service so workspace creation/invariants are preserved,
- if the only user is the configured dev account: make sure it is active and update/reset the configured password safely,
- if any other account exists: **fail**, do not silently delete data,
- result after successful bootstrap: exactly one account.

Do not add a database column purely for the seven-day expiry. `DEMO_EXPIRES_AT` is an environment/deployment deadline.

Add focused tests for all of the above.

---

## 12. Application environment

Use:

```text
APP_ENV=production
DEMO_MODE=true

NEXT_PUBLIC_SITE_URL=https://citeladder.com
FRONTEND_URL=https://citeladder.com
FRONTEND_ORIGINS=https://citeladder.com

# Exact trusted chain for this topology: task loopback plus the reviewed
# Cloudflare egress CIDRs seen in X-Forwarded-For. Never use a catch-all.
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128,<cloudflare-cidrs>

DB_SSL_MODE=require

JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24
```

Preserve existing Site Health defaults unless the demo requires a smaller crawl cap.

Do not put backend secrets in the frontend container.

### Core secret values

Store backend-only values in AWS Secrets Manager, including:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `ENCRYPTION_KEY`
- `REFERRAL_HASH_SALT`
- `DEV_LOGIN_PASSWORD`
- provider/API keys actually needed for the demo

Never expose these as `NEXT_PUBLIC_*`.

### Optional provider values

The repo currently supports configuration for Mistral/default agent, content generation, Tavily, Keenable, Google/Microsoft integrations, and observability.

Only inject providers actually needed by the demo.

Empty/unused integrations should remain disabled rather than being given dummy values.

---

## 13. Secrets Manager

Create one logical secret resource:

- `citeladder/demo/runtime`

Use JSON keys for runtime secret values.

Core cryptographic values must be generated independently at first provision
with a cryptographically secure generator. `JWT_SECRET_KEY`, `ENCRYPTION_KEY`,
and `REFERRAL_HASH_SALT` each require at least 64 random bytes before encoding;
`DEV_LOGIN_PASSWORD` requires at least 32 random bytes and must be independent
of every application and database secret. Validate strength and pairwise
non-equality before writing any value. On later deploys, reuse the existing
values rather than silently rotating sessions or encrypted data.

Generate runtime values in a trusted credentialed workflow step and write them
directly to Secrets Manager without printing them. Terraform creates only the
secret resource and policy; it must not manage a `secret_version` payload.
Use a masked temporary file on the ephemeral runner for the JSON update, delete
it immediately after the AWS call, and never pass the JSON on a command line.
Merge updates without dropping existing required keys.

Provider API keys must **not** be committed to Terraform files, workflow YAML, or repository variables.

Preferred handling:

- repository/environment **GitHub Secrets** for user-owned provider keys,
- deployment workflow writes/merges those into AWS Secrets Manager,
- ECS receives them through the task definition's `secrets` mappings.

If Codex chooses a different mechanism, it must preserve the same invariant: provider secret values must not enter source control or normal workflow logs.

---

## 14. IAM and GitHub OIDC

Reuse the existing AWS GitHub OIDC provider if it already exists:

- issuer: GitHub Actions token service
- audience: AWS STS

Create CiteLadder-specific roles rather than broadening application permissions unnecessarily:

- `citeladder-github-bootstrap`
- `citeladder-github-deploy`
- `citeladder-github-control`
- `citeladder-github-destroy`
- `citeladder-ecs-execution`

Use GitHub environment:

- `aws-demo`

The OIDC trust must be restricted to the CiteLadder repository and `aws-demo` environment.

The `aws-demo` GitHub environment must allow deployments from `main` only.
Privileged bootstrap and destroy jobs require owner approval. No privileged
workflow may accept a branch, tag, pull-request SHA, arbitrary ref, Terraform
directory, backend key, role ARN, or AWS account as a dispatch input.

Because this repository was created in the era of GitHub immutable OIDC subject claims, Codex must verify the actual subject format rather than blindly copying an older Invoro trust policy.

Known repository identity:

- owner login: `abhij1306`
- owner ID: `246634873`
- repository: `Citeladder`
- repository ID: `1301844997`

Expected immutable environment subject form:

```text
repo:abhij1306@246634873/Citeladder@1301844997:environment:aws-demo
```

Verify this against GitHub's current OIDC behavior before finalizing the trust policy.

Require both exact `sub` equality and
`token.actions.githubusercontent.com:aud = sts.amazonaws.com`. If role
assumption fails, inspect the job's non-secret OIDC claim metadata and correct
the exact trust value; never loosen it to a repository wildcard. Environment
branch protection supplies the `main` restriction because an environment-form
subject does not include a ref.

### Role purposes

#### Bootstrap role

May perform the initial reviewed provision only. It is not used by ordinary
deploy, control, expiry, or destroy jobs and receives access only to the exact
CiteLadder state and lock objects.

#### Deploy role

Narrower permissions for:

- ECR push
- ECS task definition/service updates
- read required Terraform state if workflow design requires it
- `secretsmanager:GetSecretValue` on the exact RDS-managed and demo-runtime
  secret ARNs, and `secretsmanager:PutSecretValue` only on the demo-runtime ARN
- SSM read/write for the demo expiry marker

#### Control and destroy roles

The control role may only start/stop the named demo RDS instance, set the named
ECS service's desired count, and reconcile ingress on the named demo ALB
security group with the published Cloudflare HTTP(S) ranges. The destroy role
may destroy only the Terraform-managed demo resources and exact state/lock
objects. Neither role may create or modify IAM identities or policies.

The ECS execution role may pull only the two demo ECR repositories, write only
the demo log group, and resolve only the named runtime secret keys required by
each container definition.

Do not use permanent AWS access keys in GitHub.

---

## 15. CloudWatch

Create:

- log group `/ecs/citeladder-demo`
- retention: `7 days`

Use distinct stream prefixes/container names so API and worker failures are distinguishable.

No external observability service is required for infrastructure acceptance.

If Logfire is already desired for the demo, treat it as an optional application integration, not a deployment dependency.

---

## 16. Seven-day expiry design

The expiry is measured from the **first successful provision**, not every redeploy.

Use SSM Parameter Store:

```text
/citeladder/demo/expires-at
```

Value:

- UTC ISO-8601 timestamp
- first deployment time + 7 days

### First deploy

Deployment workflow:

1. try to read `/citeladder/demo/expires-at`,
2. if it exists, reuse it,
3. if absent, calculate `now + 7 days`,
4. pass it to Terraform/application as `demo_expires_at`,
5. persist it to SSM.

Therefore a code redeploy does **not** extend the demo.

### Application expiry

The same timestamp is injected as `DEMO_EXPIRES_AT`.

The app rejects authentication/session use after that timestamp even if infrastructure teardown is delayed.

### Infrastructure expiry

Create `.github/workflows/aws-demo-expiry.yml`.

Schedule it hourly.

Workflow:

1. assume the repo-scoped AWS role via OIDC,
2. read `/citeladder/demo/expires-at`,
3. if absent: exit successfully,
4. compare with current UTC time,
5. if not expired: exit successfully,
6. if expired:
   - run the same verified Terraform destroy path as manual destroy,
   - delete the CiteLadder state object/lock object after successful destroy,
   - do not touch the shared state bucket.

GitHub scheduled workflows can be delayed; app-level expiry is the immediate guard and the scheduled workflow is the cleanup mechanism.

Do not attempt to keep an RDS instance stopped forever. This demo destroys the stack at expiry.

---

## 17. GitHub Actions

Add these workflows.

All AWS workflows use explicit job permissions: `contents: read` and
`id-token: write`, with every other permission set to `none`. Pin every action
to a reviewed full commit SHA. Build and test the exact `main` commit in an
unprivileged job that has no GitHub environment, AWS credentials, or secrets;
then pass only immutable image digests and non-secret attestations into the
credentialed deploy job. Repository-controlled Terraform or helper code runs
with AWS credentials only from that protected exact commit.

### `aws-demo-domain.yml`

`workflow_dispatch`

Purpose:
- bootstrap/request ACM cert,
- output the Cloudflare validation CNAME,
- verify certificate state.

Do not deploy application resources until certificate is issued.

### `aws-demo-origin-ranges.yml`

Daily schedule + `workflow_dispatch`.

Fetch the published Cloudflare IPv4/IPv6 lists over TLS, reject an empty or
catch-all result, compare them with the Terraform-owned expected set, and use
the control role to reconcile only TCP 80/443 ingress on the named demo ALB
security group. Emit no credentials and fail visibly rather than broadening
ingress when reconciliation cannot be completed.

### `aws-demo-deploy.yml`

`workflow_dispatch`

Inputs may include:
- action `plan` or `apply`, if useful

Flow:

1. verify the workflow is running the protected exact `main` SHA
2. build and test backend + frontend without environment secrets or AWS credentials
3. OIDC-authenticate only the credentialed deployment job
4. Terraform init with the exact shared-bucket key and verify the backend identity
5. determine/reuse the fixed 7-day expiry
6. Terraform validate/plan
7. bootstrap ECR repositories if first deployment
8. push SHA-tagged images, complete the Critical/High scan gate, and resolve digests
9. Terraform apply using those exact image digests
10. wait for ECS service stable
11. verify ALB target healthy and direct-origin rejection
12. smoke test:
    - `/`
    - API `/ready` through same-origin path if applicable
    - login with demo account
    - repeated authenticated and unauthenticated `/api/v1/*` responses remain
      `DYNAMIC`/`BYPASS`, never `HIT`, and do not acquire an `Age` header
13. print:
    - final URL
    - expiry timestamp
    - ECS service status
    - RDS status

### `aws-demo-control.yml`

`workflow_dispatch` input:

- `start`
- `stop`

#### Stop

1. set ECS desired count to `0`
2. wait until tasks stop
3. stop RDS
4. verify status

Leave these running because they are cheap/control-plane resources or needed for restart:

- ALB
- VPC/subnets
- ECR
- ACM
- CloudWatch
- Secrets Manager
- Terraform state

There is no Redis or EFS to manage.

#### Start

1. check `expires-at`
2. if expired: refuse start
3. start RDS
4. wait for RDS `available`
5. set ECS desired count to `1`
6. wait for ECS stable and target healthy
7. smoke test URL

Start must never reset the expiry timestamp.

### `aws-demo-destroy.yml`

`workflow_dispatch`

Require a typed confirmation input such as:

```text
DESTROY
```

Flow:

1. OIDC auth with the destroy role
2. Terraform init
3. Terraform plan `-destroy`
4. Terraform destroy
5. verify no CiteLadder ECS/RDS/ALB/ECR demo resources remain
6. remove only the exact CiteLadder state key and stale lock key from the shared
   S3 bucket; if policy requires no retained state metadata, remove versions and
   delete markers for only those exact keys
7. report Cloudflare records the owner should remove

No final RDS snapshot.

### `aws-demo-expiry.yml`

Scheduled hourly + `workflow_dispatch`.

Use the same destroy implementation as manual destroy. Avoid duplicating destructive shell logic; put common destroy steps in a reusable workflow or script.

---

## 18. Terraform file layout

Recommended:

```text
infra/
  terraform/
    versions.tf
    providers.tf
    backend.tf
    variables.tf
    locals.tf
    data.tf
    network.tf
    security.tf
    ecr.tf
    iam.tf
    secrets.tf
    rds.tf
    logs.tf
    acm.tf
    alb.tf
    ecs.tf
    expiry.tf
    outputs.tf
    terraform.tfvars.example

.github/
  workflows/
    aws-demo-domain.yml
    aws-demo-origin-ranges.yml
    aws-demo-deploy.yml
    aws-demo-control.yml
    aws-demo-destroy.yml
    aws-demo-expiry.yml

backend/
  app/
    demo/
      __init__.py
      bootstrap.py
      policy.py
```

Do not disturb the existing CI and Compose smoke workflows.

---

## 19. Terraform tags

Apply to every supported AWS resource:

```text
Project     = CiteLadder
Environment = demo
ManagedBy   = Terraform
Ephemeral   = true
Owner       = Cube27
```

Add expiry tag where supported:

```text
ExpiresAt = <UTC timestamp>
```

This makes console cleanup verification trivial.

---

## 20. Start/stop semantics

The owner requested Invoro-style control:

### START means

- RDS running
- ECS desired count 1
- ALB target healthy
- application reachable

### STOP means

- ECS desired count 0
- RDS stopped
- no application compute running

### DESTROY means

- all CiteLadder demo AWS resources deleted
- no RDS snapshot retained
- ECR images removed
- runtime secret removed
- log group removed
- ACM certificate removed
- ALB removed
- VPC/subnets/security groups removed
- SSM expiry marker removed
- CiteLadder Terraform state key removed

The shared Terraform-state S3 bucket and shared GitHub OIDC provider remain because they are account-level/shared resources.

---

## 21. Deployment safety

Required guardrails:

- never run destroy on an unscoped/shared Terraform state
- backend key must be exactly the CiteLadder demo key
- resource names/tags must contain `citeladder` and `demo`
- destroy workflow requires explicit confirmation
- start refuses when expired
- registration remains disabled in demo mode
- no provider secret appears in Actions logs
- no secret payload appears in Terraform configuration, plan, state, output, or
  command-line arguments
- no privileged workflow accepts or checks out a caller-selected ref
- `aws-demo` permits deployments from `main` only; bootstrap and destroy require approval
- privileged actions are pinned by full commit SHA and job permissions are explicit
- ECR Critical/High findings block deployment; ECS uses image digests
- Cloudflare uses Full (strict), `/api/*` is not cached, and direct ALB access is rejected
- the scheduled Cloudflare range check can reconcile the exact ALB ingress set
- no database port is publicly reachable
- API port 8000 is not an ALB listener/target
- only frontend port 3000 is reachable from ALB
- RDS `publicly_accessible=false`
- no NAT Gateway
- no Multi-AZ database
- no final snapshot

---

## 22. Tests Codex must add

### Application tests

- demo mode rejects `/auth/register`
- normal non-demo behavior remains unchanged
- bootstrap creates one dev account on an empty DB
- bootstrap is idempotent
- bootstrap fails if an unexpected user exists
- login succeeds before expiry
- login fails after expiry
- existing authenticated session fails after expiry
- non-demo auth behavior remains intact

### IaC/static checks

- `terraform fmt -check`
- `terraform validate`
- lint workflow YAML if repo tooling exists
- no committed secret values
- no `0.0.0.0/0` ingress to ECS port 3000 or RDS 5432
- no resource for Redis/ElastiCache/EFS/NAT Gateway
- no Terraform-managed secret payload or secret-bearing output
- first provision rejects weak, reused, or missing application/database/demo
  secrets before any Secrets Manager write
- deploy-role IAM simulation proves exact read access to the RDS/runtime
  secrets and write access only to the runtime secret
- exact state and lock object IAM resources; no `citeladder-demo/*` wildcard
- no arbitrary workflow ref inputs; protected jobs use the `aws-demo` environment
- all privileged actions are full-SHA pinned with minimal permissions
- ALB ingress contains no `0.0.0.0/0` or `::/0`
- task definition has no application task role and references images by digest

### Deployment smoke

After apply:

- ACM = Issued
- ALB target = healthy
- ECS desired = 1, running = 1
- RDS = available
- homepage returns successfully
- demo login succeeds
- registration API rejects
- repeated API/auth responses through Cloudflare are never cache hits and have no `Age`
- direct ALB access from outside Cloudflare is rejected
- DB cannot be reached from public internet

After stop:

- ECS running = 0
- RDS = stopped/stopping
- expiry marker unchanged

After start:

- RDS available
- ECS running = 1
- target healthy
- demo login works if not expired

After destroy:

- no resources matching tags `Project=CiteLadder, Environment=demo` except explicitly shared account-level resources
- no CiteLadder ECR repositories
- no CiteLadder RDS instance
- no CiteLadder ALB
- no CiteLadder runtime secret
- no CiteLadder SSM expiry parameter
- CiteLadder Terraform state object removed

---

## 23. Cost invariants

This is a one-week demo.

Keep these cost decisions fixed:

- one Fargate task only
- one small Single-AZ RDS instance
- one ALB
- no NAT Gateway
- no Redis
- no EFS
- no Multi-AZ
- no replicas
- seven-day CloudWatch retention
- stop action available whenever demo is idle
- automatic destroy at seven days

Do not optimize by compromising demo reliability; if the 4 GiB task proves insufficient, increase only the Fargate memory variable.

---

## 24. Implementation order

Codex should implement in this order:

1. Read repository architecture/invariants and current Compose/runtime configuration.
2. Add demo-mode configuration and auth expiry policy.
3. Add idempotent demo-user bootstrap + tests.
4. Add Terraform skeleton/backend.
5. Add networking/security.
6. Add ECR/IAM/logging/secrets.
7. Add RDS.
8. Add ACM/ALB.
9. Add ECS task/service preserving Compose process layout.
10. Add domain bootstrap workflow.
11. Add Cloudflare origin-range reconciliation workflow.
12. Add deploy workflow.
13. Add start/stop workflow.
14. Add destroy workflow.
15. Add automatic expiry workflow.
16. Add AWS demo documentation.
17. Run focused tests + full existing repository gates.
18. Produce a final resource inventory and exact owner inputs still required.

Do not weaken existing repository validation gates to make this pass.

---

## 25. Definition of done

The implementation is complete only when:

- `https://citeladder.com` can serve the AWS-hosted app through Cloudflare,
- only one dev account can exist in demo mode,
- public registration is blocked at the API,
- all existing sessions become invalid at the fixed 7-day deadline,
- a redeploy does not extend the deadline,
- Start and Stop work from GitHub Actions,
- Destroy works from GitHub Actions,
- expiry automatically invokes the same destroy path,
- the demo has no Redis, EFS, or NAT Gateway,
- RDS is private and Single-AZ,
- only the frontend is exposed through the ALB,
- all app-specific AWS resources can be verified as removed after destroy,
- no final database snapshot remains,
- the current public registration and fixed-expiry findings have passing backend
  tests and are absent from the deployed image,
- Terraform state has been inspected to confirm it contains no runtime secret values,
- the deployed workflow SHA is the protected `main` SHA and no arbitrary ref can
  obtain AWS credentials,
- Cloudflare Full (strict) is active and direct origin access is rejected,
- API and authentication responses are verified non-cacheable through Cloudflare,
- the scheduled Cloudflare range reconciliation is enabled and passing,
- production secret validation and demo bootstrap reject weak or reused values.
