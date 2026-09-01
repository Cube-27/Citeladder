# CiteLadder AWS Demo — Owner Runbook

This runbook is for the temporary CiteLadder AWS demo at:

- **Domain:** `citeladder.com`
- **AWS region:** `us-east-1`
- **GitHub repo:** `abhij1306/Citeladder`
- **GitHub environment:** `aws-demo`
- **Access model:** normal CiteLadder login; exactly one dev account
- **Maximum lifetime:** 7 days
- **Final cleanup:** delete everything for this demo, no RDS snapshot

You can destroy the demo earlier at any time.

> **FIRST DEPLOY REQUIRES VERIFICATION.** The repository implementation now
> contains the reviewed workflows and application controls. Do not expose
> `citeladder.com` until the repository gates pass and you have completed the
> external GitHub environment, IAM, state-bucket, ACM, and Cloudflare checks in
> this runbook.
>
> Deployment may proceed only after server-side registration denial, the
> exactly-one-account bootstrap, fixed-expiry login/session enforcement, the
> narrow task-local frontend proxy mode, and all tests required by
> `CITELADDER_AWS_CODEX_IMPLEMENTATION.md` are implemented and passing.

---

# Part A — Target architecture after the completed cutover

Expected AWS resources:

- 1 VPC
- 2 public subnets
- 2 private subnets
- 1 Internet Gateway
- route tables
- 1 Application Load Balancer
- 1 ACM certificate for `citeladder.com`
- 1 ECS cluster
- 1 ECS Fargate service
- 1 ECS task running frontend + API + workers
- 2 ECR repositories
- 1 private RDS PostgreSQL instance
- security groups
- IAM roles/policies
- 1 CiteLadder runtime secret plus the RDS-managed credential secret
- 1 CloudWatch log group
- 1 SSM expiry parameter

Expected **not** to exist:

- NAT Gateway
- Redis / ElastiCache
- EFS
- EKS
- EC2 app server
- CloudFront
- WAF
- Multi-AZ RDS
- read replica

The former `infra/aws/` starter was retired because it used separate private
ECS services and Service Connect. The active authority is `infra/terraform/`.
Its one-task design uses the narrow, tested frontend mode that permits only
`http://127.0.0.1:8000` as the task-local backend.

---

# Part B — Before Codex deployment

## 1. Put `citeladder.com` on Cloudflare DNS

The registrar transfer itself is optional for AWS deployment. What matters is that Cloudflare becomes the authoritative DNS provider.

If the domain is still registered at GoDaddy, you can either:

- transfer the registrar to Cloudflare, or
- keep GoDaddy as registrar and replace the nameservers with the Cloudflare-assigned nameservers.

For the demo, either is fine.

### Cloudflare steps

1. Sign in to Cloudflare.
2. Add `citeladder.com` as a website/zone.
3. Choose the Free plan unless you already use another plan.
4. Let Cloudflare scan existing DNS records.
5. Review the imported records carefully.
6. Cloudflare will show two authoritative nameservers.
7. At the current registrar, replace the old nameservers with those two Cloudflare nameservers.
8. In Cloudflare, wait until the zone status becomes **Active**.

Do not create the final AWS CNAME yet because the ALB does not exist.

### Important

If you use email on `citeladder.com`, preserve the existing MX, SPF, DKIM, and DMARC records during the DNS move.

---

## 2. Confirm AWS region

In the AWS console, top-right region selector:

- choose **US East (N. Virginia) — us-east-1**

Keep this region selected for all checks in this runbook.

---

# Part C — Reuse the existing Terraform backend

The Invoro demo already created the shared Terraform-state S3 bucket.

Do not create another one.

## Find the bucket

1. AWS Console → **S3**.
2. Open the bucket used for the Invoro Terraform state.
3. Confirm it contains the Invoro state path:
   - `invoro-demo/terraform.tfstate`
4. Copy the **bucket name**.

CiteLadder will use the same bucket but a different key:

- `citeladder-demo/terraform.tfstate`

Nothing in the CiteLadder workflows may overwrite the Invoro key.

Before reuse, verify that the shared bucket has Block Public Access enabled,
versioning enabled, enforced TLS, and default encryption. CiteLadder roles may
access only these exact objects:

- `citeladder-demo/terraform.tfstate`
- `citeladder-demo/terraform.tfstate.tflock`

Do not grant `citeladder-demo/*`. Terraform state must never contain database,
JWT, encryption, referral-salt, demo-password, or provider secret values.

---

# Part D — GitHub environment

## 1. Create the deployment environment

GitHub:

1. Open `abhij1306/Citeladder`.
2. **Settings**
3. **Environments**
4. **New environment**
5. Name:
   - `aws-demo`
6. Create it.

Restrict deployment branches to `main`. Privileged bootstrap and destroy jobs
require owner approval; typed `DESTROY` confirmation is an additional guard,
not a replacement. Ordinary deploy/control jobs may use separate protected
jobs without a second approval, but they must still execute only the protected
exact `main` commit.

No privileged workflow may accept a branch, tag, pull-request SHA, arbitrary
ref, Terraform directory, state key, AWS account, or role ARN as an input.

---

## 2. Add GitHub environment variables

Inside `aws-demo` → **Environment variables**, add:

### `AWS_REGION`

```text
us-east-1
```

### `TF_STATE_BUCKET`

Set this to the existing S3 bucket name you found in Part C.

Do not put credentials in environment variables.

---

## 3. Add provider secrets needed by CiteLadder

Inside `aws-demo` → **Environment secrets**, add only the external provider secrets the demo actually needs.

Likely examples based on enabled CiteLadder features:

- `MISTRAL_API_KEY`
- `TAVILY_API_KEY`
- `KEENABLE_API_KEY`

Add any other provider secret only if the feature will be demonstrated.

For Google/Microsoft integrations, add their client ID/secret only if you intend to demonstrate those integrations.

Do **not** add dummy keys for unused integrations.

The credentialed deployment job must generate the core values independently on
first provision and reuse them on redeploy:

- `JWT_SECRET_KEY`: at least 64 random bytes before encoding
- `ENCRYPTION_KEY`: at least 64 random bytes before encoding
- `REFERRAL_HASH_SALT`: at least 64 random bytes before encoding
- `DEV_LOGIN_PASSWORD`: at least 32 random bytes

Every value must be pairwise distinct and distinct from the RDS password. Write
them directly to Secrets Manager through a masked temporary file, then delete
that file. Never pass them through Terraform variables, data sources, plans,
state, outputs, command-line arguments, repository variables, or logs. A
credentialed job may merge owner-supplied provider secrets into the runtime
secret only after reading the exact existing secret and preserving every
required key.

---

# Part E — GitHub OIDC / AWS IAM

The Invoro setup already has the GitHub Actions OIDC identity provider in the AWS account.

## 1. Verify the provider exists

AWS Console:

1. **IAM**
2. **Identity providers**
3. Look for the GitHub Actions OIDC provider.
4. Confirm audience includes:
   - `sts.amazonaws.com`

If it already exists, do not create a duplicate.

---

## 2. CiteLadder-specific roles

The implementation should create/use:

- `citeladder-github-bootstrap`
- `citeladder-github-deploy`
- `citeladder-github-control`
- `citeladder-github-destroy`
- `citeladder-ecs-execution`

Do not use AWS access-key secrets in GitHub Actions.

The role trust must be restricted to the CiteLadder repo and GitHub environment `aws-demo`.

Every trust policy requires exact equality for:

- `token.actions.githubusercontent.com:aud = sts.amazonaws.com`
- the immutable environment `sub` shown below

If role assumption fails, correct the exact claim. Never loosen it to a
repository wildcard. The protected `aws-demo` environment supplies the
`main`-only rule because an environment-form subject does not contain a ref.

Known GitHub repository identity:

- owner: `abhij1306`
- owner ID: `246634873`
- repo: `Citeladder`
- repo ID: `1301844997`

Because GitHub OIDC subject behavior changed for newer repositories, Codex should verify the actual token subject before finalizing IAM. The expected immutable environment form is:

```text
repo:abhij1306@246634873/Citeladder@1301844997:environment:aws-demo
```

Role boundaries:

- bootstrap: initial reviewed provisioning only; exact state/lock objects
- deploy: ECR/ECS deployment, exact runtime and RDS-managed secret reads,
  runtime-secret-only write, and the named expiry parameter
- control: only the named demo RDS/ECS start-stop operations and reconciliation
  of Cloudflare HTTP(S) ranges on the named ALB security group
- destroy: only Terraform-managed demo resources and exact state/lock cleanup;
  no IAM creation or modification
- ECS execution: only the two demo ECR repositories, demo log group, and exact
  secret keys required by each container; no application task role

Every AWS workflow must declare only `contents: read` and `id-token: write`,
with all other GitHub permissions set to `none`, and pin every action to a
reviewed full commit SHA.

---

# Part F — First domain/certificate setup

This happens after the repository and external setup gates above pass.

It also happens only after the deployment-blocking application and test gates
at the top of this runbook pass.

## 1. Run the domain bootstrap workflow

GitHub:

1. Open the CiteLadder repository.
2. **Actions**
3. Select:
   - `AWS Demo - Domain`
   - or the equivalent name Codex implements
4. **Run workflow**
5. Use branch `main`.
6. Confirm the job reports that it is executing the protected exact current
   `main` commit.
7. Run it.

The workflow should create/request the ACM certificate and print the required DNS validation record.

---

## 2. Add ACM validation record to Cloudflare

The workflow/AWS ACM console will give you:

- CNAME name
- CNAME value

Cloudflare:

1. `citeladder.com`
2. **DNS**
3. **Records**
4. **Add record**
5. Type: `CNAME`
6. Name: use the ACM validation name shown by AWS
7. Target: use the ACM validation value shown by AWS
8. **Proxy status: DNS only** — grey cloud
9. Save.

Do not proxy the ACM validation record.

---

## 3. Verify the certificate

AWS:

1. **Certificate Manager**
2. Region: `us-east-1`
3. Open the `citeladder.com` certificate.
4. Wait for status:
   - **Issued**

Do not proceed to final application DNS until the certificate is Issued.

---

# Part G — First AWS deploy

Do not begin this part until the workflow proves all of these gates:

- demo registration, one-account bootstrap, login expiry, and existing-session
  expiry tests pass;
- the narrow task-local frontend proxy test passes;
- `DB_SSL_MODE=require` is set;
- `REFERRAL_HASH_SALT` and every other required secret key exist and pass
  production strength/independence validation;
- `TRUSTED_PROXY_CIDRS` is exactly task loopback plus the reviewed Cloudflare
  IPv4/IPv6 ranges, with no catch-all;
- no runtime secret value appears in Terraform configuration, plan, state, or
  output.

## 1. Run the deploy workflow

GitHub:

1. Repository → **Actions**
2. Open:
   - `AWS Demo - Deploy`
3. **Run workflow**
4. Branch:
   - `main`
5. Confirm there is no ref, account, role, state-key, or Terraform-directory input.
6. Choose Apply/Deploy if the workflow provides a Plan/Apply option.
7. Run it.

Expected high-level flow:

1. verify the protected exact current `main` commit,
2. build and test without a GitHub environment, AWS credentials, or secrets,
3. pass only immutable image artifacts/digests and non-secret attestations to
   the credentialed job,
4. authenticate the credentialed job to AWS using OIDC,
5. initialize Terraform against the exact shared-backend key,
6. create/reuse the fixed seven-day expiry timestamp,
7. validate/plan and provision AWS resources,
8. push SHA-tagged images, wait for ECR scanning, and stop on unresolved
   Critical or High findings,
9. resolve and deploy immutable ECR image digests, not tags,
10. run Alembic migration and the one-account bootstrap,
11. wait for RDS/ECS/ALB health,
12. verify Cloudflare-only origin access and non-cacheable API/auth responses.

---

## 2. Record the expiry

At the end of the first successful deploy, the workflow should print:

```text
DEMO_EXPIRES_AT=<UTC timestamp>
```

This is fixed.

A later redeploy must **not** reset or extend it.

The same value is stored in:

- SSM Parameter Store:
  - `/citeladder/demo/expires-at`

You do not need to calculate the expiry yourself.

---

# Part H — Point `citeladder.com` to AWS

After the deploy workflow prints the ALB DNS name:

## Cloudflare DNS

1. Cloudflare → `citeladder.com`
2. **DNS**
3. **Records**
4. Add:
   - Type: `CNAME`
   - Name: `@`
   - Target: the AWS ALB DNS name
   - Proxy status: **Proxied** — orange cloud
5. Save.

Cloudflare supports using a CNAME at the apex through CNAME flattening.

---

## Cloudflare SSL mode

1. Cloudflare → `citeladder.com`
2. **SSL/TLS**
3. **Overview**
4. Set encryption mode:
   - **Full (strict)**

Do not use Flexible SSL.

Do not enable HSTS for this one-week demo unless you independently want it for the domain after the AWS demo is gone.

## Cloudflare API cache and origin controls

Create cache rules that bypass caching for:

- `/api/*`
- every authentication response

Run `AWS Demo - Origin Ranges` once after the apex record is proxied. It must
install only Cloudflare's current published IPv4 and IPv6 ranges on ALB ports
80/443, reject empty/catch-all input, and enable daily reconciliation. A direct
request to the ALB from outside Cloudflare must fail.

---

# Part I — Verify the AWS resources

Use this after the first deployment.

## 1. ECS

AWS Console:

1. **Elastic Container Service**
2. **Clusters**
3. Open `citeladder-demo` or the generated CiteLadder demo cluster.
4. Open **Services**.

Expected:

- desired tasks: `1`
- running tasks: `1`
- failed tasks: `0`

Open the running task.

You should see containers for:

- frontend
- api
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

The migration container may be stopped with successful exit code because it is intentionally one-shot.

---

## 2. Load balancer

AWS:

1. **EC2**
2. **Load Balancers**
3. Open the CiteLadder demo ALB.
4. Confirm:
   - Scheme: internet-facing
   - State: Active
5. Open target group.
6. **Targets**

Expected:

- one healthy target on port `3000`

There should be no external target for port `8000`.

---

## 3. RDS

AWS:

1. **RDS**
2. **Databases**
3. Open CiteLadder demo DB.

Expected:

- engine: PostgreSQL 16
- class: `db.t4g.micro`
- status: Available
- Multi-AZ: No
- Public access: No
- storage: 20 GiB gp3
- deletion protection: Off

---

## 4. Security groups

### ALB security group

Allowed inbound:

- 80 and 443 only from Cloudflare's current published IPv4 and IPv6 ranges

It must **not** contain `0.0.0.0/0`, `::/0`, stale removed Cloudflare ranges,
or any unrelated source.

### ECS security group

Allowed inbound:

- port 3000 from the ALB security group only

It must **not** expose:

- 8000 to internet
- 3000 to `0.0.0.0/0`

### RDS security group

Allowed inbound:

- 5432 from ECS security group only

It must **not** expose 5432 to the internet.

### Runtime and supply-chain controls

Confirm:

- task definitions reference backend/frontend ECR image digests;
- the deployed digests have no unresolved Critical or High ECR findings;
- there is no application `taskRoleArn`;
- the ECS execution role is limited to the two demo repositories, demo logs,
  and exact per-container secret keys;
- `DB_SSL_MODE=require`;
- `REFERRAL_HASH_SALT` is present through Secrets Manager;
- `TRUSTED_PROXY_CIDRS` contains only `127.0.0.1/32`, `::1/128`, and the
  reviewed Cloudflare ranges.

---

## 5. Confirm services that should not exist

AWS search/resource explorer or individual consoles:

There should be no CiteLadder demo:

- NAT Gateway
- ElastiCache/Redis
- EFS
- EKS
- EC2 instance
- CloudFront distribution
- WAF Web ACL

---

# Part J — Verify application login

Open:

```text
https://citeladder.com
```

Expected:

- site loads over HTTPS,
- normal CiteLadder login screen,
- no extra Cloudflare Access screen,
- no public registration flow in demo mode.

Use the configured dev account.

Default email unless implementation deliberately changes it:

```text
dev@citeladder.com
```

Password comes from the configured demo secret.

## Critical registration check

A hidden signup page is not enough.

The backend registration endpoint itself must reject registration in demo mode.

Codex's deployment smoke test should verify this automatically.

The smoke test must also make repeated authenticated and unauthenticated
requests through Cloudflare to `/api/v1/*`. `CF-Cache-Status` must remain
`DYNAMIC` or `BYPASS`, never `HIT`, and responses must not acquire an `Age`
header. A direct HTTPS request to the ALB from outside Cloudflare must fail.

---

# Part K — Normal day-to-day control

The only GitHub workflow you normally need during the demo week is:

- **AWS Demo - Control**

It should accept:

- `start`
- `stop`

---

## STOP

Use this whenever you are finished demonstrating and want to minimize runtime cost.

GitHub:

1. Repository → **Actions**
2. `AWS Demo - Control`
3. **Run workflow**
4. Action:
   - `stop`
5. Run.

The workflow must execute the protected exact `main` commit and expose no ref,
account, role, state-key, or Terraform-directory input.

Expected result:

- ECS desired count becomes `0`
- running ECS tasks become `0`
- RDS is stopped

The following remain, which is expected:

- ALB
- VPC
- ECR
- ACM certificate
- Secrets Manager secret
- CloudWatch log group
- Terraform state

There is no Redis or EFS in the CiteLadder demo.

### Check

AWS ECS:
- desired `0`
- running `0`

AWS RDS:
- `Stopped`

The expiry date must remain unchanged.

---

## START

Before a demo:

1. Repository → **Actions**
2. `AWS Demo - Control`
3. **Run workflow**
4. Action:
   - `start`
5. Run.

The workflow must execute the protected exact `main` commit.

Expected sequence:

1. workflow checks the seven-day deadline,
2. RDS starts,
3. workflow waits for RDS to become Available,
4. ECS desired count becomes `1`,
5. ECS waits until stable,
6. ALB target becomes healthy,
7. smoke test runs.

If the seven-day deadline has passed, Start must refuse to start the environment.

A Start must never create a new expiry date.

---

# Part L — Updating CiteLadder code during the demo

For a code update:

1. merge/push the intended commit to `main`,
2. GitHub → **Actions**
3. run `AWS Demo - Deploy`,
4. confirm the job uses that protected exact `main` commit and offers no ref input,
5. it builds/tests without credentials or secrets,
6. images are tagged with the commit SHA and scanned,
7. unresolved Critical/High findings stop the deploy,
8. ECS receives a new task definition referencing resolved image digests,
9. deployment stabilizes.

A redeploy must reuse the original:

- `/citeladder/demo/expires-at`

It must not add seven more days.

---

# Part M — Logs and troubleshooting

## Application/worker logs

AWS:

1. **CloudWatch**
2. **Log groups**
3. Open:
   - `/ecs/citeladder-demo`

Use container/stream names to separate:

- frontend
- api
- individual workers

Retention should be seven days.

---

## If site returns Cloudflare 52x

Check in this order:

1. ECS service running task = 1
2. ALB target = Healthy
3. ALB HTTPS listener exists
4. ACM certificate = Issued
5. Cloudflare apex CNAME target exactly matches ALB DNS
6. Cloudflare SSL mode = Full (strict)
7. `AWS Demo - Origin Ranges` is passing and the ALB allowlist exactly matches
   Cloudflare's current IPv4/IPv6 ranges

---

## If ALB target is unhealthy

Check:

1. ECS task is Running
2. frontend container is Running
3. frontend container logs
4. frontend health-check path
5. ECS security group allows port 3000 from ALB SG
6. task has enough memory

If the task was OOM-killed, raise the Terraform Fargate memory variable from 4096 MiB to 8192 MiB. Do not redesign the infrastructure.

---

## If login fails

Check:

1. current time is before `DEMO_EXPIRES_AT`
2. SSM `/citeladder/demo/expires-at`
3. migration container succeeded
4. bootstrap command succeeded
5. only one user exists
6. configured dev email/password match Secrets Manager
7. API logs

Do not make registration public, extend `DEMO_EXPIRES_AT`, weaken secret
validation, or widen `TRUSTED_PROXY_CIDRS` as a troubleshooting shortcut.

## If API responses appear stale

Check the Cloudflare cache-bypass rules for `/api/*` and authentication
responses. Repeated requests must never report `CF-Cache-Status: HIT` or an
`Age` header. Do not fix staleness by making the API cross-origin.

---

## If crawling/model calls fail

Remember ECS tasks need outbound internet.

Check:

1. ECS task is in a public subnet
2. Assign public IP = Enabled
3. public subnet route table has `0.0.0.0/0 -> Internet Gateway`
4. ECS SG outbound allows internet
5. required provider key is present
6. worker logs show the relevant error

Do not add a NAT Gateway as the first fix.

---

## If migration container fails

Do not bypass migrations.

Check its CloudWatch logs.

The API and workers should not start until migration exits successfully.

---

# Part N — Destroy early

If you finish the demo before seven days, use Destroy.

## GitHub

1. Repository → **Actions**
2. `AWS Demo - Destroy`
3. **Run workflow**
4. Enter the required confirmation:
   - `DESTROY`
5. Confirm the workflow is the protected exact `main` commit and uses the
   destroy role, not the bootstrap role.
6. Run.

Expected:

- Terraform destroy completes,
- RDS is deleted,
- no final snapshot is created,
- ECS/ALB/ECR/ACM/VPC demo resources are deleted,
- Secrets Manager runtime secret is deleted,
- CloudWatch demo log group is deleted,
- SSM expiry parameter is deleted,
- CiteLadder Terraform state and lock objects are removed after successful
  teardown.

When the shared bucket retains versions, the workflow must remove versions and
delete markers for only the two exact CiteLadder keys. It must never use a
`citeladder-demo/*` delete or touch the shared bucket itself. If any secret ever
entered state, rotate it and verify version-aware exact-key cleanup.

The shared Terraform backend bucket remains.

The shared GitHub OIDC provider remains.

---

# Part O — Automatic seven-day destruction

After the implementation and launch gates pass, you should not need to do anything.

The scheduled workflow:

- `AWS Demo - Expiry`

runs periodically and reads:

- `/citeladder/demo/expires-at`

At or after expiry it runs the same destruction path as manual Destroy.

The application also rejects demo authentication/session use at the deadline, so the account expires even if GitHub's scheduled workflow starts slightly late.

Important: stopping the demo does **not** pause the seven-day clock.

The scheduled job must execute the protected `main` workflow and use the
dedicated destroy role. A manual dispatch follows the same boundary.

---

# Part P — Cloudflare cleanup after destroy

AWS Terraform cannot remove the manually-created Cloudflare records.

After the environment is destroyed:

Cloudflare → `citeladder.com` → **DNS**.

Remove:

1. apex `@` CNAME that pointed to the AWS ALB
2. ACM validation CNAME if you no longer need the AWS certificate/redeployment

Do not delete unrelated domain/email DNS records.

The domain registration itself remains yours.

---

# Part Q — Final AWS cleanup verification

After Destroy/Expiry, keep AWS region on `us-east-1`.

## Resource Groups / Tag Editor

Search tags:

- `Project = CiteLadder`
- `Environment = demo`

Expected:
- no application-specific resources remain.

Then spot-check:

### ECS
- no CiteLadder demo service/tasks/cluster that Terraform owned

### RDS
- no CiteLadder demo DB
- no retained final snapshot

### EC2 → Load Balancers
- no CiteLadder demo ALB

### EC2 → Target Groups
- no CiteLadder demo target group

### ECR
- no `citeladder-demo-backend`
- no `citeladder-demo-frontend`

### Secrets Manager
- no `citeladder/demo/runtime`

### Systems Manager → Parameter Store
- no `/citeladder/demo/expires-at`

### CloudWatch → Log Groups
- no `/ecs/citeladder-demo`

### ACM
- no CiteLadder demo certificate

### VPC
- no CiteLadder demo VPC/subnets/security groups/IGW

### S3 Terraform backend
Shared bucket still exists.

Confirm these CiteLadder objects are gone:

- `citeladder-demo/terraform.tfstate`
- `citeladder-demo/terraform.tfstate.tflock`, if it existed

If bucket versioning is enabled and policy requires no retained state metadata,
also confirm there are no versions or delete markers for either exact key.

Do not delete:

- Invoro state
- shared state bucket
- shared account OIDC provider

---

# Part R — What not to delete accidentally

The demo destroy is scoped to CiteLadder.

Do not manually delete:

- the AWS account
- the shared Terraform-state bucket
- Invoro state objects
- GitHub OIDC provider used by other repos
- unrelated IAM roles
- Cloudflare zone/domain itself
- unrelated Cloudflare DNS records
- email DNS records

---

# Part S — Demo-day short checklist

Before the meeting:

- [ ] Cloudflare zone Active
- [ ] `citeladder.com` apex points to AWS ALB
- [ ] Cloudflare SSL = Full (strict)
- [ ] `AWS Demo - Origin Ranges` is passing; ALB ingress is Cloudflare-only
- [ ] direct ALB access from outside Cloudflare fails
- [ ] GitHub `AWS Demo - Start` completed successfully
- [ ] RDS = Available
- [ ] ECS desired = 1
- [ ] ECS running = 1
- [ ] ALB target = Healthy
- [ ] `https://citeladder.com` loads
- [ ] dev login works
- [ ] registration is disabled
- [ ] repeated API/auth responses are `DYNAMIC`/`BYPASS`, never `HIT`, with no `Age`
- [ ] deployed image digests have no unresolved Critical/High ECR findings
- [ ] expiry/session and exactly-one-account deployment gates passed
- [ ] key demo flows exercised once
- [ ] expiry date is still in the future

After the meeting, if keeping the demo:

- [ ] run `AWS Demo - Control` → `stop`

If finished permanently:

- [ ] run `AWS Demo - Destroy`
- [ ] verify AWS cleanup
- [ ] remove stale Cloudflare AWS DNS records

---

# Part T — The three controls to remember

For normal operation you only need these:

```text
DEPLOY  -> build/push/apply new CiteLadder code
START   -> start RDS + set ECS desired count to 1
STOP    -> set ECS desired count to 0 + stop RDS
DESTROY -> permanently delete the whole CiteLadder demo
```

The seven-day expiry automatically performs the final Destroy if you have not done it earlier.
