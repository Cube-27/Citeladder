# CiteLadder demo and production hardening plan

Date: 25 September 2026

Status: approved repository-side Phase 1 subset implemented locally on 26 September
2026 in `codex/production-hardening`, based on main at `bd1faf74`. Deployment,
remaining cloud changes and runtime acceptance are pending. The owner authorized
implementation separately; this document does not authorize deployment.

Repository baseline: `8d079f09c3c682181a89a639378ec5e765d92a56`.

## Implementation status — 26 September 2026

The implementation remains uncommitted in the separate
`Citeladder-production-hardening` worktree. It has not been merged, deployed or
validated by CI. This status supersedes the original planning-time assumptions
below; historical scanner evidence is not a claim about the deployed revision.

| Item | Status | Remaining work |
|---|---|---|
| P1-0 Deployment and scanner evidence | Awaiting access/evidence; read-only inventory partially complete | Record deployed backend SHA and Worker versions, effective inherited ingress and edge configuration; reconcile app cache/header ownership; correct scanner targets and obtain authenticated controls. |
| P1-1 Replay identity / SEC-01 | Implemented — deployment/retest pending | Current Action declarations already authorize and lock the Action before replay. Added explicit stored project/Action identity checks to initial lookup and conflict recovery without changing persisted fingerprints. Real PostgreSQL replay, authorization and race coverage passed; verify the deployed artifact. The original opportunity-route description below is historical. |
| P1-2 Demand admission / SEC-02 | Approved subset implemented — deployment/retest pending; D2 awaiting decision | Saved project windows and one active manual refresh per project are enforced transactionally. Exact retries deduplicate; leased/retry jobs retain capacity; automatic enqueues remain independent. Legacy unmarked active jobs conservatively occupy a manual slot. Workspace aggregate/rate protection is still open. |
| P1-3 CSP / SEC-03 | Implemented — deployment/retest pending | App/direct HTML, marketing and MCP consent policies implemented with external theme initialization and bounded deployed beacon compatibility. Local Worker/browser checks passed. Deploy backend before app and marketing Workers; verify final headers, hydration, consent, integrations and cache behavior. |
| P1-4 TLS / SEC-04 | Awaiting access/evidence | Obtain named cipher/protocol results for both hosts on 443 and 8443; inspect effective edge settings before proposing any change. No TLS setting was changed. |
| P1-5 Closed provisioning / SEC-05 | Local coverage implemented; deployed evidence incomplete | Disabled auth/OAuth paths have no provisioning side effects in tests. Public provider discovery reports Google/GitHub/Apple unconfigured; verify effective password signup and OAuth flags and existing-login behavior. This is not full deployed closure. |
| P1-6 Integration retirement and IAM | Awaiting dependency evidence and concrete cloud change | Gemini identities/API and Peec resources still exist. Peec has a deployed function/Eventarc trigger and its build uses the default Compute identity; complete caller inventory before retirement. Verify exact CodeAnt key use and required deploy/recovery permissions. No identities, keys, APIs or roles were changed. |
| P1-7 Network and state controls | Awaiting evidence; demo exceptions retained | VM metadata and project firewall rules were inspected, but inherited/effective ingress and default-network dependencies are not fully established. State bucket recovery controls were inspected; no network, bucket or retention mutation occurred. |
| Phase 2 / D5 | Awaiting policy decisions | Account admission, customer data/recovery, data-preserving releases, access, retention and capacity acceptance remain pending. Current demo exceptions do not establish readiness for customer production. |
| Security alerts / D6 | Deferred by owner | No new alerts, notification channels or delivery tests; not a hidden release prerequisite. |

Read-only observations on 26 September: both public roots returned 200 without
CSP. The app again returned `CF-Cache-Status: HIT` with `Cache-Control: no-store`;
both hosts advertised HSTS `max-age=2592000`. Identify the serving/cache override
and verify the released response; this observation alone does not establish a
sensitive-data leak. The demo VM is running in `asia-south1-a`, with instance
OS Login enabled and project SSH keys blocked. Project firewall rules permit
Cloudflare HTTP(S) and IAP SSH to its service identity; inherited policies remain
unverified. The state bucket has versioning, enforced public-access prevention,
uniform access and seven-day soft delete, with no lifecycle or locked retention.

### Deployment blockers and acceptance gates

There is no known unresolved application failure in the locally tested slice.
This is not yet a deployable, accepted release:

- Commit/reconcile the isolated branch with current main, obtain required green
  CI, and pass the existing protected release process. Deployment credentials,
  protected environment settings and origin-token alignment have not been
  revalidated; they are unknown prerequisites, not confirmed missing secrets.
- Verify effective closed-provisioning flags before accepting the demo release.
  Resolve the cache/header ownership discrepancy and verify fresh responses
  enforce CSP and intended cache behavior after rollout.
- Release backend, app Worker, then marketing Worker using the existing runbook.
  Capture artifact/configuration references and rollback targets; run bounded
  deployed acceptance. No new schema migration, reset, queue service or secret
  is required by this slice.

D2 workspace limits are explicitly deferred by the owner's instruction to
implement saved windows and one refresh per project. They do not block shipping
that approved demo subset, but SEC-02 is only partially addressed. Pending TLS,
cloud retirement/IAM and authenticated scanner evidence prevent declaring
Phase 1 complete. Phase 2 policy and recovery requirements prevent declaring
customer-production readiness; they do not automatically prevent this demo
hardening deployment.

Local verification includes real PostgreSQL owner coverage, focused frontend
tests, app/marketing builds, local HTTPS Worker browser checks and unchanged
generated Worker bindings. The repository check script completed with an initial
Ruff line-length failure corrected by its formatter; the focused Ruff recheck
passed, as did its other gates. Exact commands, exit statuses and logs are in
the worktree Git directory for the PR/release record. Full CI, deployed DAST/TLS,
restore drills and live payment/provider acceptance have not run.

## 1. Scope and decisions

The owner selected **Phase 1: harden the current demo**, followed by
**Phase 2: customer-production hardening once policies are in place**.
Security alert implementation is explicitly deferred in both phases unless
separately requested. This includes new security metrics/alert policies,
notification channels, delivery tests and a new alert-response process.
Preserve existing logging and any existing alerts.

Phase 1 retains the single GCP environment, PostgreSQL queue/database,
Cloudflare Workers and protected origin, current deployment identities and
approvals, CodeAnt scanning, subscription behavior and single-baseline migration
policy. No reset, live provider call, cloud mutation, account provisioning,
paid upgrade, new environment or deployment is authorized by saving this plan.
Disposable demo data does not make Terraform state, credentials, backups or
the running environment disposable.

The supplied GCP report records Gemini/Peec retirement and continued CodeAnt use
as owner decisions. Carry those into the plan, subject to exact dependency
verification; do not interpret them as permission to remove product AI engines.

This plan owns the scoped remediation sequence. Existing feature documents and
[invariants](../invariants.md) remain authoritative. Phase 2 consumes the policies
and decisions from the separately queued
audit remediation plan (`citeladder-audit-remediation.md`); it does not start that
plan or duplicate its policy work.

## 2. Evidence and limitations

Inputs supplied as text:

- **GCP** — “CiteLadder GCP demo-hardening plan”, 25 September 2026.
  References scan `ae1b86b1-ff95-4396-aea6-5a4612429d5e` and original JSON
  SHA-256 `25d20cc785cbaac05b85ae533994bb803f6e15bc0ab206cf37395a12db0d0a24`.
- **DAST** — “CiteLadder — DAST triage and remediation report”, 25 September 2026.
  APP scan `ed4f9c36-61c3-4221-bc4b-61841f55b0f0`;
  WEB scan `dc1e7db4-6954-415f-8d15-6910a9ba5e7b`.
  Its code baseline was `65abce811aeedbfda3dd9c13c2feb438c280a613`.

- **Original DAST report text, supplied subsequently** — the inline message
  contains APP findings 1–7; the attached `Pasted text.txt` contains WEB findings
  1–10. Their hostnames and scan IDs match the identifiers above. APP records
  2 routes, 21 checks and no attached repository; WEB records 30 routes and
  23 checks. The legible finding labels total 8 High, 7 Medium and 2 Low;
  disregard corrupted cover-art text when interpreting severity counts.

Original DAST report text now supports the finding register directly, including
the scanner's captured HTTP response excerpts. Those excerpts are truncated;
the original PDF files, GCP findings JSON and raw TLS negotiation output have
not been supplied. GCP counts remain secondary report evidence. The source
review below uses the recorded repository baseline, not an assumed deployed SHA.
At the original planning stage, no live GCP/Cloudflare configuration, Terraform
state, secrets or deployed application was inspected, and no exploit, test suite
or runtime scan was executed. The implementation status above records subsequent
local checks and bounded read-only inspection; it does not claim a runtime scan.

No applicable `SECURITY.md` was found by policy resolution for the inspected
backend, frontend and infrastructure scopes. Boundary assessments instead use
[workspace access](../workspace-access.md), [invariants](../invariants.md),
[connected data](../integrations-traffic-analytics.md) and the
[Workers runbook](../operations/WORKERS_RUNBOOK.md). This is scoped static
triage, not a complete security audit or production-readiness certification.

### Findings retained after source review

| ID | Verdict and confidence | Current evidence and qualification | Priority |
|---|---|---|---|
| SEC-01 | Confirmed project-binding defect; high confidence. Cross-workspace breach is not established. | `implementation_events.py:243–320` selects replay by workspace/key and compares a fingerprint that omits the path project; replay returns before project/opportunity validation. Route requires WRITE membership. All projects share the workspace access boundary, so do not inflate this into proven access to another tenant. | First code fix |
| SEC-02 | Confirmed missing manual admission controls; high confidence in the gap, exhaustion impact unmeasured. | `demand/schemas.py:17` checks ordering only; `api/demand.py:118` authorizes, computes revision and enqueues without rate/capacity admission. `analytics/enqueue.py:165` includes window/revision in task identity, so different windows bypass exact deduplication. RUN capability is required. Existing worker/build bounds do not bound the number of accepted jobs. | Phase 1; policy partly pending |
| SEC-03 | Confirmed missing CSP in checked-in HTML response owners; high confidence. | `frontend/apps/app/worker.ts:4` and `frontend/apps/marketing/src/middleware.ts:5` omit CSP. Original APP #1 and WEB #4 report missing CSP and include GET `/` HTTP 200 response excerpts at 11:39:14 and 11:39:42 UTC on 25 September 2026. These support the scan-time observation, not current deployment state. Missing defense, not demonstrated XSS. | Phase 1 |
| SEC-04 | Needs review; low confidence in specific weak-TLS claims. | Twelve entries omit named cipher/SNI/negotiation evidence in the supplied text. Repository code cannot establish current visitor-facing Cloudflare TLS settings. | Early evidence collection; conditional fix |
| SEC-05 | Needs deployment verification; conditional provisioning risk. | Password signup defaults off in `core/config/__init__.py:85`; `api/auth.py:48` rejects disabled/demo registration. Compose defaults Google sign-in off. OAuth new-account creation checks demo mode, independently of the password-signup flag. | Verify early; preserve closed provisioning |
| QA-01 | Valid scan-coverage correction; high confidence in source routing, deployed coverage unverified. | Marketing `apex-route.ts` rejects general product APIs; app `worker.ts` proxies them. Reported marketing 404s do not test backend authorization. | Baseline prerequisite |

SEC-01 violates project-scoped mutation identity and invariant 18; it does not
establish a new project-level membership model. SEC-02 exposes shared work
admission to authenticated tenant input. SEC-03 is browser defense in depth.
SEC-04 concerns the public edge; SEC-05 concerns anonymous durable provisioning
only when configured open. Prioritize confirmed defects separately from
unresolved scanner severity.

The original WEB report explicitly marks registration exploitation **Not
confirmed** and the Demand/replay probes **Inconclusive**: controls and attack
variants returned 404; the latter used fabricated project identifiers. It does
not establish live account creation, queue growth or cross-project disclosure.
Both original reports still omit named weak ciphers and raw TLS/SNI evidence,
so their six TLS entries per hostname do not change SEC-04's review status.

## 3. Phase 1 — current demo hardening

### P1-0. Establish deployment and scanner evidence

Identify project `project-setup-20260711`, actual VM zone, deployed backend SHA,
app/marketing Worker versions and matching source configuration. Capture
redacted before-state: resource IDs, policy bindings, effective firewall,
instance/project metadata, enabled APIs, existing jobs, state ownership and
CodeAnt credential identifiers. Never capture secret values.

Reconcile the original response observations with the deployed header/cache
owners: APP reports both `cf-cache-status: HIT` and `cache-control: no-store`;
both hostnames report HSTS `max-age=2592000`, differing from the reviewed
response owners' one-year/includeSubDomains setting. These are verification
leads, not proof of sensitive response caching or a separate HSTS vulnerability.
Identify the serving layer and any header/cache override before changing it.

Use the existing infrastructure and deployment owners under `infra/gcp/`,
`.github/workflows/gcp-demo-*.yml` and the Workers runbook. Check
`infra/gcp/bootstrap.ps1` as well as Terraform: bootstrap grants deployer IAM
and creates/protects the state bucket. A Terraform-only edit can miss the source
that would recreate a grant.

Correct CodeAnt targets: marketing HTML and deliberate MCP/OAuth/webhook
exceptions on `citeladder.com`; product HTML and intended `/api/v1` on
`app.citeladder.com`. Attach the repository to the app scan where supported.
Use authorized disposable fixtures with two projects, valid opportunities,
WRITE/RUN and denied/revoked membership cases. Establish a successful control
request before interpreting negative probes. Preserve intentional apex 404s,
protected origin checks and private schema exposure.

**Acceptance:** resource/route map, deployed revision, per-finding evidence gaps
and a concrete intended change/rollback for each cloud item. Missing access
blocks that item, not independent code work. No live scanning occurs merely
because this plan exists.

### P1-1. Repair implementation-event replay identity (SEC-01)

Owner:
[implementation events](../../backend/app/domain/opportunities/implementation_events.py)
and [API](../../backend/app/api/opportunities.py).
Keep the workspace/key uniqueness contract. Authorize the requested project in
the active workspace before returning a replay, and compare stored project and
opportunity identity as well as declaration identity. Apply the same contract
to initial lookup and insert-conflict recovery.

Prefer explicit row-identity validation where it preserves existing persisted
fingerprints. If changing fingerprint composition, account for existing retry
keys without rewriting append-only events or requiring a database reset.
Separate authorization/replay identity from new-declaration eligibility:
a valid retry must not need a new current snapshot or repeat target resolution
and verification side effects.

**Acceptance:** extend
`backend/tests/component/test_opportunity_implementation_events.py` at the real
PostgreSQL boundary. Cover first create/identical replay (201/200), wrong project
including nonexistent/foreign path, changed opportunity/body, foreign workspace,
revoked membership, and concurrent create/retry/conflict recovery. Wrong identity
returns the established 404/409 contract without foreign event data. One event
and one set of verification effects survive concurrency. Preserve append-only
provenance and existing legitimate retries. Do not claim that every concurrency
scenario is exploitable before reproducing it.

**Rollback:** last accepted backend artifact; no schema/data rewrite expected.
Do not roll back a security correction without recording the reopened risk.
Prompt-ready fix handoff: repair both replay paths at this service boundary;
preserve workspace authorization, project identity, persisted retry semantics
and one-time side effects; prove behavior with isolated PostgreSQL tests.

### P1-2. Bound manual Demand recompute (SEC-02)

Owners:
[request](../../backend/app/domain/demand/schemas.py),
[route](../../backend/app/api/demand.py),
[enqueue](../../backend/app/domain/analytics/enqueue.py),
[abuse controls](../../backend/app/domain/abuse/service.py),
`backend/app/core/config/demand.py` and `abuse.py`.

The actual UI at `frontend/components/demand/demand-projection.tsx:169`
resubmits the persisted snapshot window. It has no recompute date-range picker.
The owner approved refreshing that saved data window with at most one
queued/running manual refresh per project. Validate that the requested window
belongs to a persisted Demand snapshot in the authorized project; arbitrary
custom windows are outside this manual endpoint's Phase 1 contract. Inventory
non-UI callers before implementation and report any incompatible dependency.
Do not invent a supported “largest preset” from unrelated analytics screens.

Validate allowed dates/windows before source-revision work. Retain exact
window/revision deduplication; duplicate retries neither insert a second job nor
consume another durable job slot/budget unit. Add transactional project/workspace
admission and a rate/work budget so fast completed jobs cannot evade protection.
Bound expensive admission attempts as needed without charging a duplicate as a
new job. Use existing PostgreSQL locks/counters, with one documented lock order
and admission/enqueue transaction. The generic
`reserve_workspace_capacity` counts all rows of the selected model by workspace:
do not reuse it against the shared analytics table without the required task
kind/project/manual-origin scope. `enforce_and_commit` commits; blindly calling
the API limiter would split the intended transaction.

Review every automatic/sync caller and worker payload validator. Manual quotas
must not accidentally suppress legitimate sync projections; worker safety
validation remains independent. Store tunable values in the owning config.
Return existing structured validation/capacity errors with useful retry guidance.
No paid entitlement, Redis or second queue.

**Acceptance:** isolated PostgreSQL tests for allowed/rejected windows before
revision queries, exact retries, concurrent distinct requests, per-project and
workspace isolation, terminal-state capacity recovery, rate-window behavior,
rollback of failed enqueue/reservation, and automatic enqueue regressions.
Preserve source IDs/version provenance. Use small test-only limits.
Numeric budgets remain unresolved until D2; do not call partial admission fixed.

**Rollback:** previous backend/config artifact; never delete durable work or
counters just to roll back. Keep queued payloads compatible.
Prompt-ready fix handoff: close RUN-member admission before costly revision and
enqueue, using the existing transaction/queue owners and approved policy values.

### P1-3. Enforce compatible CSP on both HTML surfaces (SEC-03)

Implement at the app Worker and marketing middleware response owners. Inventory
actual build output, scripts, inline bootstraps, styles, fonts, images, frames,
browser connections and consent HTML first. Cover dynamic responses and direct
HTML assets. Both original response excerpts omit script bodies and include
`speculation-rules: "/cdn-cgi/speculation"`; inspect actual deployed/injected
resources before choosing hashes, nonces or allowlists. The report excerpts
alone cannot supply a compatible policy. Cloudflare documents that static `_headers` rules do not apply to
Worker-generated responses, so a static header file alone is insufficient.
[Cloudflare headers](https://developers.cloudflare.com/workers/static-assets/headers/)

Define separate compatible policies: restrictive script/resource destinations,
`object-src 'none'`, constrained `base-uri` and `frame-ancestors`, with
`connect-src`, `form-action` and frame allowances derived from enabled behavior.
Use build hashes for stable inline code or per-response unpredictable nonces for
dynamic templates; preserve body/header/cache alignment. Do not use reusable
nonces, indiscriminate script noncing, script wildcards, blanket `https:`,
`unsafe-eval` or blanket script `unsafe-inline`. Evaluate style allowances
separately. No vendor or disabled checkout activation for CSP testing.

**Acceptance:** behavioral browser checks for app root/deep links, marketing
pages, direct HTML, consent/error pages, hydration, auth, fonts/charts/downloads
and enabled integrations. Prove an unauthorized script is blocked in a controlled
local fixture. Verify final GET headers, one intentional enforced policy per
response, app noindex, public marketing indexability and cache behavior.
Report-only is an intermediate compatibility step, not closure; no new hosted
reporting service or alert implementation.

**Rollback:** previous compatible Worker artifact/policy; retain version and
configuration references. Closure requires deployed response verification.

### P1-4. Resolve TLS evidence, then change the responsible edge (SEC-04)

For each app/apex hostname on 443 and 8443, obtain raw CodeAnt enumeration or
separately authorized bounded checks. Record time, DNS/IP, SNI, certificate,
IPv4/IPv6 applicability, protocol, named cipher and tool capability. A client
that cannot offer TLS 1.0/1.1 does not prove server rejection.

If hostname-specific deprecated TLS is confirmed, set the applicable
visitor-facing minimum to TLS 1.2, preserve TLS 1.3, and inspect other hostnames
before a zone-wide change. Minimum TLS and origin Full (strict) are different
controls. Zone-wide minimum TLS is available across Cloudflare plans; per-host
settings and cipher customization have separate account requirements.
[Minimum TLS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/),
[cipher configuration](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/cipher-suites/customize-cipher-suites/)

Recheck named TLS 1.2 suites after removing old protocols. If a paid control is
needed, bring the exact suite, affected host/port, account limitation and options
to the owner before purchase. Shared-edge port 8443 alone does not prove an
origin/admin service; an HTTP block also cannot fix a TLS handshake.
[Cloudflare network ports](https://developers.cloudflare.com/fundamentals/reference/network-ports/)

**Acceptance:** explicit outcomes for all four host/port combinations; supported
modern handshakes work, legacy rejection is attributable to the server, and
each claimed weak suite is resolved or remains open. Generic enumeration entries
link to their precise outcomes rather than becoming independent High exploits.

**Rollback:** captured zone/hostname TLS configuration. A rollback that restores
weak TLS reopens the finding; it is not an accepted compatibility exception.

### P1-5. Verify closed public provisioning (SEC-05)

Preserve the current documented policy: operator-created accounts until public
policies are ready. Verify effective password and OAuth settings without
printing secrets. The `gcp-demo` workflow requires `DEMO_MODE=false`; its name
does not establish a single-account demo gate. Password signup defaults false;
Compose defaults `OAUTH_GOOGLE_ENABLED=false`. OAuth `_create_account` checks
demo mode but does not share the password-signup flag, consistently with
[workspace access](../workspace-access.md).

If deployed configuration contradicts the intended closed policy, identify its
owner/change history before repair; preserve existing-account access. Do not
enable OAuth to test it, set demo mode globally as a shortcut, or invent an
invitation/CAPTCHA/email/billing policy. If the owner intentionally opened
provisioning, resolve D3 before changing it.

**Acceptance:** isolated auth/OAuth tests show disabled paths cannot provision
user/workspace/billing/grant rows; existing login and intended operator/invitation
flows remain usable. Verify trusted-proxy handling and rejection of forged
forwarding headers from untrusted peers. Current per-client controls are not a
global signup-capacity guarantee. No mass live-account creation.
**Rollback:** captured non-secret flags/configuration; preserve account data.
“Not exposed in verified configuration” is narrower than globally remediated.

### P1-6. Retire obsolete cloud integrations and narrow justified IAM

After P1-0 dependency inventory, retire only the two reported Gemini identities,
`peec-cdn-processor@project-setup-20260711.iam.gserviceaccount.com`, their
exclusive callers and `generativelanguage.googleapis.com`. Exact Gemini account
IDs must come from inventory; a name prefix is insufficient. Stop obsolete
callers, disable accounts reversibly, smoke-test, then consider removal of
dedicated resources/bindings. Do not force-disable dependent APIs, shared service
agents, function buckets or unrelated product integrations.

Retain `codeant-cspm@project-setup-20260711.iam.gserviceaccount.com` and its
working credential. Match the specific flagged key to configured authentication.
Account usage does not establish key usage; `last_used: null` does not establish
safe deletion. Verify needed permissions and credential storage; the report
does not support an overdue-rotation claim. No forced federation migration.

Review default Compute, App Engine and GitHub deploy identities individually.
The default Compute account is reported used; the VM's custom identity does not
make it disposable. Review project-wide `roles/iam.serviceAccountUser` and
scope actAs to actual target accounts when that supports the existing workflow.
Do not invent a Token Creator finding.

`infra/gcp/bootstrap.ps1:104` grants broad deploy roles, including
`projectDeleter`; `.github/workflows/gcp-demo-destroy.yml` uses project deletion.
Required permissions are workflow decisions, not automatically excess grants.
Inventory build, deploy, state, control, recovery and destroy dependencies;
update the grant owner so removed access is not recreated. Do not run destroy
or reset to test permissions; use permission analysis/disposable validation.
Avoid authoritative IAM replacement that removes unrelated bindings.

**Acceptance:** exact principal/role/resource/caller matrix, evidence for each
removal or exception, application/worker health, permitted deploy/state operations
and a successful CodeAnt scan. Validate destructive workflows without executing
them against the demo.
**Rollback:** restore exact changed bindings and re-enable accounts from captured
state. Deleted keys/accounts are not reliably reversible; irreversible removal
requires completed dependency evidence and specific execution authorization.

### P1-7. Verify origin exposure, unused networking and state protection

Checked-in `infra/gcp/network.tf` creates a custom VPC with Cloudflare web
80/443 and IAP SSH 22 rules targeted to the VM service account.
`compute.tf` enables instance OS Login, blocks project SSH keys and disables
serial console. These are real counterevidence to blanket “OS Login absent” or
“public IP means unrestricted ingress” claims, not proof of effective live rules.

Inspect inherited/effective ingress, targets, IPv4/IPv6, VM bindings and
Cloudflare-to-origin authentication. Verify intended app/owner access and that
database/internal/admin services are not unintentionally public. Repair proven
exposure without opening the origin broadly. Keep the public-IP topology.
Instance and project OS Login settings must be assessed together; changing login
mechanisms can invalidate existing SSH access.
[Google OS Login](https://docs.cloud.google.com/compute/docs/oslogin/set-up-oslogin)

Remove the default VPC/subnets/firewalls only if attachments, routes, peerings,
connectors, forwarding resources and other workloads prove unused. Forty-two
default-subnet Flow Log findings are not forty-two independent application
vulnerabilities. No migration of active workloads or speculative network deletion.

Protect `project-setup-20260711-tfstate` separately from demo data. Preserve
private access, locking, versioning and reported soft delete; verify live
settings. No age rule deleting current state/lock objects or locked retention
policy. The GCS backend supports locking and recommends versioning for recovery.
[HashiCorp GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs)

Preserve existing backup behavior in Phase 1. Current `storage.tf` configures
backup versioning, a 10-day age lifecycle and `force_destroy=true`; this is an
existing configuration, not a newly approved production retention policy.
VM deletion protection is false and boot-disk auto-delete true. Carry those
explicitly into Phase 2 policy review. Inspect function upload/source ownership
before changing versioning or removing buckets.

**Acceptance:** intended access works, unintended exposure is closed if found,
only demonstrably unused networking is removed, state operations still work,
and existing backups are preserved. No reset or VM recreation.
**Rollback:** exact metadata/firewall changes and configuration baseline.
Do not delete networks/resources in reliance on a speculative recreation.

## 4. Original finding disposition register

The DAST report lists 17 entries. Retain each reference; shared work packages
avoid duplicate fixes, not duplicate evidence accountability.

| Original entry | Disposition |
|---|---|
| APP #1 | SEC-03: retained missing-CSP hardening |
| APP #2 | SEC-04: 443 enumeration; unresolved, no standalone exploit established |
| APP #3 | SEC-04: verify 443 deprecated protocols |
| APP #4 | SEC-04: obtain named 443 weak cipher evidence |
| APP #5 | SEC-04: 8443 enumeration; unresolved, no standalone exploit established |
| APP #6 | SEC-04: verify 8443 deprecated protocols |
| APP #7 | SEC-04: obtain named 8443 weak cipher evidence |
| WEB #1 | SEC-05: conditional registration risk, deployed gates unverified |
| WEB #2 | SEC-02: retained admission gap |
| WEB #3 | SEC-01: retained project-binding defect; cross-tenant impact unsupported |
| WEB #4 | SEC-03: retained missing-CSP hardening |
| WEB #5 | SEC-04: 443 enumeration; unresolved, no standalone exploit established |
| WEB #6 | SEC-04: verify 443 deprecated protocols |
| WEB #7 | SEC-04: obtain named 443 weak cipher evidence |
| WEB #8 | SEC-04: 8443 enumeration; unresolved, no standalone exploit established |
| WEB #9 | SEC-04: verify 8443 deprecated protocols |
| WEB #10 | SEC-04: obtain named 8443 weak cipher evidence |

GCP FAIL counts below are copied from the supplied plan. They are not live
verification. “Deferred” means a reported control gap remains visible;
“exception” does not authorize destructive action.

| GCP check ID | Reported FAILs | Phase 1 disposition / next evidence |
|---|---:|---|
| cloudstorage_audit_logs_enabled | 1 | Verify current Data Access settings; broader logging waits for Phase 2 policy |
| cloudstorage_bucket_lifecycle_management_enabled | 1 | State lifecycle decision deferred; preserve live state and recovery |
| cloudstorage_bucket_logging_enabled | 4 | Usage/Storage Logs deferred; no blanket new logging |
| cloudstorage_bucket_sufficient_retention_period | 4 | Demo exception; Phase 2 purpose-specific retention decision |
| cloudstorage_bucket_versioning_enabled | 1 | Inspect function upload bucket ownership; conditional control, not automatic deletion |
| cloudstorage_uses_vpc_service_controls | 1 | Optional architecture control, no selected requirement |
| compute_instance_confidential_computing_enabled | 1 | No selected Confidential VM requirement; no replacement |
| compute_instance_deletion_protection_enabled | 1 | Source confirms false; demo exception, revisit before customer data |
| compute_instance_disk_auto_delete_disabled | 1 | Source confirms auto-delete; demo exception, revisit before customer data |
| compute_instance_encryption_with_csek_enabled | 1 | Not evidence of unencrypted disk; no selected CSEK requirement |
| compute_instance_public_ip | 1 | Source confirms topology; conditional exception after effective-ingress verification |
| compute_network_default_in_use | 1 | Live dependencies unresolved; remove only if unused |
| compute_network_dns_logging_enabled | 2 | Unused-network cleanup where proven; active logging deferred |
| compute_project_os_login_2fa_enabled | 1 | Effective human access/2FA unverified; no automatic rollout |
| compute_project_os_login_enabled | 1 | VM source enables OS Login; verify live effective setting before classifying |
| compute_subnet_flow_logs_enabled | 43 | 42 default plus one demo per report; dependency cleanup / logging deferral |
| gemini_api_disabled | 1 | Dependency-aware retirement P1-6 |
| iam_audit_logs_enabled | 1 | Distinguish Data Access from Admin Activity; verify / defer expansion |
| iam_no_service_roles_at_project_level | 1 | Validate exact actAs principal and narrower working scope |
| iam_role_sa_enforce_separation_of_duties | 1 | Current workflow exception; no new identities/approval layers |
| iam_sa_no_administrative_privileges | 3 | Separate identity/caller review; required deploy roles remain explicit exceptions |
| iam_sa_no_user_managed_keys | 1 | Retain required CodeAnt credential; scoped exception |
| iam_sa_user_managed_key_unused | 1 | Exact-key usage proof missing; no speculative revocation |
| iam_service_account_unused | 4 | Gemini x2/Peec retirement; App Engine usage investigation |
| logging_log_metric_filter_and_alert_for_audit_configuration_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_bucket_permission_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_compute_configuration_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_custom_role_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_project_ownership_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_sql_instance_configuration_changes_enabled | 1 | Deferred; SQL applicability also unknown, never create SQL for this finding |
| logging_log_metric_filter_and_alert_for_vpc_firewall_rule_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_vpc_network_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_log_metric_filter_and_alert_for_vpc_network_route_changes_enabled | 1 | Security alert implementation deferred by owner |
| logging_sink_created | 1 | New all-logs export deferred; preserve existing routing |

Google distinguishes always-generated Admin Activity logs from separately
configured Data Access logs. Deferring alerts/log expansion must not be reported
as “auditing disabled” or “all activity monitored.”
[Cloud Audit Logs](https://docs.cloud.google.com/logging/docs/audit)
The CSEK check names a key-management mode: Google provides default disk
encryption, and CSEK is deprecated. This plan does not adopt CSEK/CMEK to clear
a scanner score. [Disk encryption](https://docs.cloud.google.com/compute/docs/disks/disk-encryption)

## 5. Phase 2 — production hardening after policies are in place

**Entry gate:** owner-approved policies identify customer data classes, account
admission, retention/deletion, recovery expectations, access responsibilities
and allowable operating costs. Phase 1 critical evidence and unresolved defects
must be reviewed; policy publication alone does not close technical issues.
Do not carry demo exceptions into customer production by default.

| Work package | Required decision/evidence | Result and acceptance |
|---|---|---|
| P2-1 Public account admission | Approved signup model, verification/consent needs and capacity budget; password/OAuth creation map | Implement approved bounded provisioning before expensive durable creation across all enabled paths. Test concurrency, abuse, existing-user access and authorized invitations. No automatic signup activation. |
| P2-2 Customer data and recovery | Maximum tolerable data loss (RPO), recovery time (RTO), backup frequency/retention, deletion commitments and spend | Review VM/disk deletion and backup force-destroy settings; implement chosen protections and safe lifecycle. Restore into an isolated target, measure recovery and verify encrypted credentials/required configuration recover with data. Never restore over the live environment for a drill. |
| P2-3 Safe data-preserving releases | Approved transition away from disposable baseline/reset assumptions and maintenance constraints | Update migration/release authority before first customer data; define tested schema evolution, compatible releases and forward recovery. Prevent accidental customer reset/destruction. No incremental migration history until that policy change is accepted. |
| P2-4 Production access and IAM | Human MFA/access model, break-glass owner, deployment/recovery duties, key lifecycle | Revisit broad deploy/destroy roles, project-wide actAs and CodeAnt key exception against actual permissions. Apply approved human OS Login/2FA without lockout; verify recovery/deploy access. Do not presume a new identity or process is required. |
| P2-5 Purpose-specific logs and retention | Investigative needs, sensitive data exclusions, log retention/access and budget | Select only justified Storage Data Access, DNS/Flow Logs, bucket logging or export controls. Verify routing, redaction, access and cost. Security alerts remain deferred, even here. |
| P2-6 Capacity and final acceptance | Measured load, expected tenants/concurrency, availability target and budget | Revisit Demand and signup limits using bounded workload tests; determine whether current single VM can meet agreed needs. Architecture changes require an evidence-backed proposal, not a presumed HA/staging/network redesign. Repeat authenticated DAST and TLS checks against deployed artifacts. |

VPC Service Controls, Confidential VMs, customer-managed encryption, private
network redesign and paid security tiers remain conditional options. Adopt one
only for a specific accepted requirement and documented tradeoff.

**Phase 2 exit:** customer-facing promises match tested retention/recovery/access
behavior, data-preserving release rules are in force, applicable Phase 1 findings
are closed or explicitly accepted with a review trigger, and runtime acceptance
is recorded. A clean scanner score is neither required nor sufficient.

## 6. Pending decisions and evidence gates

| ID | Decision | Current status |
|---|---|---|
| D0 | Demo now versus customer production now | Resolved by owner: Phase 1 current demo; Phase 2 production after policies |
| D1 | Manual recompute windows and per-project concurrency | Resolved by owner: refresh the saved data window shown on screen; at most one queued/running manual refresh per project. No arbitrary custom-window expansion. |
| D2 | Manual recompute workspace rate budget and aggregate capacity | Deferred from the current implementation by the owner on 26 September: implement approved saved windows and one refresh per project only. Measured demo capacity and owner-selected workspace limits remain pending; SEC-02 is partially addressed, not closed. |
| D3 | Public provisioning policy | Current docs/config intend closed password and Google signup until policies are ready. Ask only if live evidence shows an intentional different policy. |
| D4 | Paid TLS control or legacy-client exception | Conditional: ask only after an exact unacceptable cipher and account limitation are demonstrated. No purchase assumed. |
| D5 | Phase 2 data/recovery/access/logging/cost policies | Deliberately pending the policy work; no invented retention, downtime, RPO/RTO or spending values. |
| D6 | Alert implementation | Deferred by explicit owner instruction; not a prerequisite or a hidden Phase 2 commitment. |

Technical unknowns (live IAM, key use, subnet dependencies, deployed flags and
cipher attribution) are investigation work, not questions for the owner to guess.
Resolve independent work while policy-dependent items stay visibly pending.

## 7. Delivery, verification and closure

Sequence: P1-0 evidence and signup gates; P1-1 replay fix; P1-3 CSP; P1-2
admission once decisions are resolved. TLS evidence and cloud inventory can be
collected independently. Apply cloud retirement/IAM changes in reversible slices;
remove unused networking last after dependencies are established. Security-alert
setup is not a prerequisite. Phase 2 starts only after its policy entry gate.

For each implementation slice follow [AGENTS.md](../../AGENTS.md) and
[Review.md](../../Review.md): preserve unrelated work, inspect owners/callers,
select meaningful native tests, use isolated deterministic configuration without
live provider credentials, and test authorization/concurrency against real
disposable PostgreSQL. Existing starting points include implementation-event,
Demand, auth/OAuth component tests; app Worker/apex route tests; and focused
browser verification for CSP. Do not test literal source/config strings.

Run `./scripts/check.ps1` once after the intended executable diff is complete;
CI owns full selected suites and release validation. Do not overlap checks or
repeat passing runs solely for milestones. Keep test logs in the worktree Git
directory; report exact commands, exit status and failure tails. Documentation
only requires whitespace/reference checks. Inspect diff check/stat/name-status
and review the final diff before handoff.

Every cloud change needs resource/binding before-state, ownership location,
dependency proof, exact proposed diff, acceptance and rollback. Use the existing
protected release process only when implementation/deployment is authorized.
No code PR alone establishes deployed TLS/IAM or runtime closure.

Track each item as **Planned**, **Awaiting decision**, **Awaiting access/evidence**,
**Implemented — deployment/retest pending**, **Fixed and verified**,
**Not exposed in verified configuration**, or **Deferred/accepted exception**.
For exceptions record scope, reason and review trigger; do not call an unverified
claim a false positive. Closure requires original finding references, changed
files/resources, executed test results, deployed artifact/config references,
bounded retest results and unresolved owner actions in the PR/release record.

The repository implementation status and remaining items are recorded above.
Local verification does not establish deployed closure of the reported findings;
no deployment or cloud mutation has been performed as part of this work.
