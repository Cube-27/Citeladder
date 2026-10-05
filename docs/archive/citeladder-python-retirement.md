# TypeScript application with Python schema tooling

> Historical implementation plan. PRs 1–5 merged in #263–#266 and #268. Python is retained only for schema/Alembic tooling.
> The original sequence and observations below are retained as dated evidence, not current work.

Requested 4 October 2026. **PRs 1–5 implemented; migration ends at the schema-only Python boundary.**
This is the continuation after the product/API/worker TypeScript migration.
It orders remaining work by increasing complexity and operational risk, subject
to dependencies. It does not resume earlier migration waves or authorize
deployment, provider calls, payment activation or database resets.

## How to implement a selected PR

**Owner instructions, 4 October 2026.** When the user says
`implement plan PR 1` (or another numbered PR), use this document and implement
only that PR. These instructions replace
the implement-plan skill's per-slice test/check cadence and exploration-agent
routine for this plan. Keep changes relevant to the selected PR.

Follow this sequence:

1. **Check previous work.** Read repository instructions, inspect the working
   tree, branch history and the selected PR's current code/callers. Establish
   which prerequisite and selected slices are already implemented and what
   remains. Preserve unrelated work; do not repeat completed migration work
   because the plan's status is stale. Select the affected tests/checks now,
   but do not run them yet.
2. **Implement the whole PR in its internal slice order.** Complete code,
   meaningful test changes, caller cutovers, deletions, necessary wiring and
   affected documentation. Explore and implement with the primary agent.
   Do not run tests, typechecks, lint, builds or the repository check harness
   after each edit or slice. Slice checkpoints track implementation progress;
   they are not validation milestones. Reserve all targeted tests and checks
   for the final validation phase below. Defer commits that invoke checks
   until that phase; keep normal required commit hooks enabled.
3. **Request one Astra Medium diff review.** Once the entire selected PR is
   implemented, spawn exactly one read-only reviewer using
   `model: gpt-6-astra`, `reasoning_effort: medium`. Give it the selected PR
   scope, actual base revision, full cumulative diff (including intended
   uncommitted/new files), relevant invariants and the proposed validation
   commands. Ask for actionable correctness, regression, security, missing
   cutover/deletion and meaningful coverage findings with file evidence.
   The reviewer does not edit, run checks/tests or broaden the project.
   Do not spawn exploration agents or additional/repeated review agents.
4. **Batch fixes, then validate.** Assess the review findings and fix all valid
   issues together. Record a concise reason for any finding not applied.
   Then run the selected targeted checks/tests and the required repository
   completion check as one planned end-of-PR validation phase, sequentially.
   If validation fails, inspect the reported failures together, fix their
   causes in a batch, and rerun only the failed commands and any previously
   passing checks whose evidence those fixes invalidate. Do not rerun all
   checks after every changed line, and do not start another review round.
5. **Finish and stop.** Once the selected PR's requirements, valid review
   findings and affected validation are satisfied, stop editing. Complete the
   authorized commit/PR handoff and report results. Do not start optional
   refactors, extra tests, another full verification pass or the next PR.
   An unresolved failure must be reported with evidence; do not hide it by
   weakening coverage or endlessly repeating the same command.

**No browser testing:** do not launch browsers, browser automation, Playwright,
screenshots or browser-based test suites during this implementation. Use native
unit/component/PostgreSQL tests and the relevant static/build checks at the end.
Existing CI configuration remains intact; do not trigger extra browser runs.

The intended flow is:
**inspect → implement all slices → one Astra Medium review → batch review fixes
→ targeted validation → batch failure fixes/affected reruns if needed → stop.**

This overrides validation timing, not the repository's safety, test-admission or
schema-ownership requirements. A check already passing on the unchanged
relevant code is not rerun merely for a commit, push or handoff.

## Objective and current boundary

Move the remaining supported Python consumers into the existing TypeScript
owners, deleting their Python implementations and exclusive dependencies as
each consumer moves. Do not add another API, queue, entitlement engine, ORM or
configuration authority.

The owner selected this final boundary on 4 October 2026:

| Area                                                                         | Final owner                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| Application API, workers, business rules, validation and application policy  | TypeScript: Hono, Kysely and Zod              |
| Product operators, account bootstrap, login/seed tools and application tests | Existing TypeScript owners and native tooling |
| Database schema metadata, baseline migrations and schema maintenance/checks  | Python: SQLAlchemy, Alembic and asyncpg       |

**Stop at schema-only Python. Schema migration to TypeScript is out of scope.**
The remaining Python package targets those three direct schema dependencies;
transitive dependencies and meaningful schema test/static-analysis tools remain
separate. The Python environment and one-shot migration image are retained.

[Invariant 17](../invariants.md#17-the-migration-baseline-remains-singular) and
D4 of the [earlier migration plan](citeladder-typescript-migration.md#4-decisions)
continue to require Alembic as sole schema author. Kysely types remain generated
from the Alembic-migrated database. The accepted boundary is recorded in
[decisions](../decisions.md#typescript-application-python-schema-tooling).
The owner assigned PRs 1 and 2 on 4 October 2026; this decision does not assign later PRs.

Reuse the existing Node services, PostgreSQL database and deployment jobs.
Do not add always-on services or provision infrastructure for this migration.
Build and job duration can vary; the target adds no recurring infrastructure
requirement and does not promise an identical bill.

The [backend owner](../backend-architecture.md), [invariants](../invariants.md)
and [agent workflow](../../AGENTS.md) remain authoritative. Existing TypeScript
API, worker, billing and authentication behavior is reused.

## Baseline inventory

Audited local `main` at `b761385c3`. The evaluation retirement is already
present in this tree and is excluded from the remaining work.

Counts below are tracked `*.py` files and physical lines, including comments,
blank lines and empty package files. They are scope measurements, not executable
LOC or GitHub language percentages.

| Remaining area                                      |   Files |      Lines | Why it remains                                             |
| --------------------------------------------------- | ------: | ---------: | ---------------------------------------------------------- |
| SQLAlchemy models, `backend/app/models/`            |      51 |     11,426 | Schema metadata, defaults, constraints and ORM consumers   |
| Alembic, `migrations/`                              |       2 |      8,061 | Canonical baseline and migration environment               |
| Python tests/support, `backend/tests/`              |      40 |      7,080 | Operator, security, entitlement and persistence coverage   |
| Retained domain code, `backend/app/domain/`         |      29 |      4,239 | Operators, bootstrap, grants and fixture consumers         |
| Operator/export/quality scripts, `backend/scripts/` |      26 |      3,958 | Supported commands, shared policy export and Python checks |
| Core/config, `backend/app/core/`                    |      43 |      2,972 | Shared model/operator policy, database and crypto          |
| Python helpers inside native API tests              |       5 |        588 | Four persistence helpers plus crypto interoperability      |
| Root `reset-db.py`                                  |       1 |        288 | Destructive development reset and provisioning             |
| Deploy bootstrap, `backend/app/demo/`               |       2 |        164 | Configured development/demo account                        |
| Connectors, `backend/app/connectors/`               |       5 |         79 | Read-only Razorpay plan transport and retained contracts   |
| Empty application initializer                       |       1 |          0 | Package structure                                          |
| **Total**                                           | **205** | **38,855** |                                                            |

Models plus migrations account for 19,487 lines, about half of the remaining
Python. That schema code is deliberately retained. Success is the ownership
boundary above, not a zero-Python repository or a particular language percentage.

Other dependencies that a file-extension count misses:

- `frontend/services/api/src/generated/python-config.json`, produced by
  `backend/scripts/export_ts_platform.py` and its policy builders.
- Native Agent assets still packaged from
  `backend/app/core/config/agent_skills/`.
- Compose, Cloud Run migration commands, CI, the root Dockerfile,
  `scripts/quality.mjs`, `scripts/billing-test.ps1` and database type generation.
- Embedded Python in `infra/gcp/run.tf` and
  `.github/workflows/gcp-deploy.yml`.
- Nine declared runtime dependencies in `backend/pyproject.toml`; their
  retirement depends on actual importers, not just command migration.

## Review findings incorporated

The owner-supplied review was checked against the current source on 4 October 2026. Findings about the old schema-replacement stage are already resolved by
the chosen schema-only endpoint; that stage stays removed.

| Finding                                               | Disposition and source evidence                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep Alembic; target three direct Python dependencies | Retained. `migrations/env.py` imports application Settings today; PR 5 replaces that dependency with migration-only configuration.                                                    |
| Remove obsolete ORM normalization behavior            | Retained, conditional on no Python writers. `models/prompt.py` has `@validates("text")` calling `domain/prompts/normalization.py`; this is not required to construct schema metadata. |
| Catalog cutover must include bootstrap wiring         | Accepted in PR 3, including image/runtime availability, local and deployment entrypoints, and fresh-database coverage. It cannot wait for PR 4.                                       |
| Split seed migration                                  | Accepted as PR 4 internal slices: static identities/state, injected evidence/transports, then execution and bounded draining.                                                         |
| Enterprise agreement tooling is high risk             | Accepted: medium implementation complexity, high authorization/legal-evidence risk. `enterprise_agreements.py` checks actor/signatory authority and immutable replay under locks.     |
| Start with native fixture helpers, then Agent assets  | Retained as PR 1a → 1b → 1c.                                                                                                                                                          |

One correction to the suggested bootstrap ordering: the current
`ensure_initial_catalog(..., operator=user)` requires an existing active admin,
and `ensure_configured_dev_account` creates that identity before publishing.
PR 3 must preserve that prerequisite. Simply inserting a native catalog command
before all identity provisioning would break initialization on an empty database.

## PR sequence

Use the five PRs below in dependency order, with internal slices for manageable
implementation checkpoints. Keep each PR coherent and focused on its stated
outcome. There are no file quotas, allocation tables or file-count gates.

Check actual main/branch state before starting. Base a later PR on the completed
prerequisite work, and do not mix unrelated changes into its diff. This planning
document does not authorize merging or starting an unassigned PR.

| PR  | Result                                                                                   | Complexity / risk                                    |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Native persistence fixtures and Agent assets                                             | Low–medium / low–moderate                            |
| 2   | Provider metadata, acquisition controls, enterprise evidence and account manager         | Medium / high for identity and legal evidence        |
| 3   | Catalog and plan tooling, grants, baseline/backfill and coherent bootstrap sequencing    | High / high commercial and concurrency risk          |
| 4   | Local login, seed tooling, native deployment bootstrap and remaining application bridges | High breadth / high startup and identity risk        |
| 5   | Final application-policy export removal and schema-only Python isolation                 | High coupling / highest remaining configuration risk |

Retire exclusive code and tests with their actual owners rather than collecting
all removals in PR 5. Keep structural schema constants and shared fixture data
in place where appropriate; avoid cosmetic model/directory rewrites.

Each PR's tests and exit criteria below describe what the final validation phase
must prove, not instructions to run tests between slices.

## PR 1 — Remove native test/build dependence on Python helpers

Order: **1a → 1b → 1c**. No product mutation owner changes in this PR.

**1a: Action and Commerce persistence fixtures.**
Replace `frontend/services/api/test/action-fixture.py` and
`commerce-island.py` with native fixtures beside `action-support.ts` and
`commerce-support.ts`. Update their consumers, including Action, Commerce,
internal-link, project and MCP-evidence tests as needed.

**1b: Opportunity refresh and verification fixtures.**
Replace `refresh-fixture.py` and `verification-fixture.py`; update
`opportunity-refresh.test.ts` and `opportunity-verification.test.ts`.
Use the native enqueue owner for enqueue assertions and explicit persisted
rows for reader assertions. Delete the four Python helpers (564 lines in the
baseline) and only support proven exclusive to them.

Keep real PostgreSQL workspace-denial, provenance, idempotency and terminal-state
coverage. Explicitly account for ORM-created UUIDs, timestamps, hashes and
defaults. Preserve any remaining Python schema-test helper callers.

Keep `auth-interop.py` until PR 4: supported Python bootstrap still hashes
passwords and issues/verifies tokens. It is a real compatibility check.

**1c: Native Agent asset packaging.**
Move the 14 Markdown files under `backend/app/core/config/agent_skills/` to a
native API-owned asset directory. Preserve bodies and content-derived versions.
The owner subsequently authorized formatting the two moved methodologies on
4 October 2026 and accepting the resulting catalog fingerprint change; do not
add formatter exemptions.
Update `src/config/skill-inputs.ts`, the API Dockerfile, package-data declarations,
change selection, `agent-skills.test.ts` and the Agent owner document. Remove
the empty Python asset package only after all packaging references move.

**Exit gate:** the affected native persistence suites run without those four
Python subprocesses; the packaged API loads its skill catalog without backend
source paths. Tests still use disposable PostgreSQL and recorded inputs.

## PR 2 — Transfer bounded operators and identity administration

Order: **2a → 2b → 2c → 2d**. Preserve their existing explicit operator admission;
do not expose new HTTP endpoints.

**2a: Platform provider metadata.**
Move `scripts/provision_platform_provider_connections.py` under native
`src/providers/` and a CLI entrypoint. Preserve system-workspace scope,
approved route identities, opaque secret references, credential-revision
rotation, pause clearing and repeatable preview/apply behavior.
Do not route platform provisioning through a customer BYOK helper.
Native PostgreSQL coverage replaces
`test_provision_platform_provider_connections.py`; no provider calls or raw
credential input.

**2b: Acquisition stop/resume.**
Move `scripts/acquisition_control.py` beside the native acquisition control
owner. Reuse normalization and `src/auth/security-events.ts`.
Preserve active-admin authorization, bounded reason, global `*` and domain
controls, explicit apply and security events. Test preview rollback, denied
actors, invalid/bare-TLD rejection, stop propagation and resume.
The command never starts a crawl.

**2c: Enterprise agreement references — high risk.**
Move `scripts/enterprise_agreement.py` and
`domain/auth/enterprise_agreements.py` under native workspace/policy ownership.
Replace `test_enterprise_agreements.py` with PostgreSQL cases for active admin
and target-workspace signatory authority, signed-time validation, identical
replay, conflicting replay, preview rollback and append-only reference/digest
evidence. Preserve actor/workspace/member lock order and bounded security events.
Never store a contract body. Medium code complexity does not lower this risk.

**2d: Interactive account manager.**
Move `scripts/account_manager.py` onto native auth/password, workspace and
invitation owners. Preserve terminal-only password input, explicit workspace,
operator authentication and membership rechecks after confirmation, role bounds,
hashed invitations and session-version invalidation. Creating an invited
identity must not accidentally run public-signup billing.
Replace `test_account_manager.py` with native revocation-between-steps and
workspace-isolation cases.

Retire exclusive invitation/member and agreement bridges with their tests.
Keep auth, abuse, workspace policy and billing helpers still called by Python
bootstrap or schema-test setup; list those remaining callers and their PR 4/5
removal conditions. Transfer only config whose final Python reader has gone.
Change the root image's account-manager copy/default command when that CLI moves;
keep the image usable for Alembic.

**Exit gate:** all four commands run natively and their authorization/persistence
decisions are covered. Document native invocations in the existing operator/
development owners. Preserve meaningful schema tests.

## PR 3 — Commercial operators and coherent bootstrap sequencing

Order: **3a → 3b → 3c → 3d → 3e**, with the **3f wiring included in the same
cutover as 3c**, not deferred to PR 4. Each activation switches all its callers.

**3a: Catalog authoring/validation.**
Transfer `domain/billing/launch_catalog.py`, authoring/validation in
`catalog_revisions.py`, and exclusively authoring portions of
`core/config/billing_catalog.py`, `billing_pricing.py` and `billing_tax.py`
to existing native billing/config owners.
Extend `src/billing/catalog.ts` where appropriate. Runtime parsing does not
replace authoring validation. Test capability bundles, currency/tax consistency
and exact rounding with integer minor units/native monetary helpers, preserving
the decisions currently implemented with Decimal.

**3b: Read-only Razorpay plan commands.**
Move `scripts/provision_razorpay_plans.py` and
`connectors/billing/razorpay.py`. Keep propose, verify and bind separate.
Preserve fixed-origin/no-redirect credentialed requests, bounded responses,
provider-mode admission, contained output paths and exact amount/cadence checks.
Bind emits a new revision payload; it does not create provider plans or change
accepted terms. Use injected recorded transport; no live Razorpay calls.
Keep `httpx` until PR 4 removes its seeder importer.

**3c: Catalog mutations.**
Move catalog validate/diff/seed/import/publish from `scripts/billing_admin.py`
and `domain/billing/admin.py`. Test active-admin authority, explicit reason/
idempotency, default dry-run, replay/conflict, competing publication and immutable
revisions. Old subscriptions remain pinned to frozen terms.
Remove every Python catalog author, including bootstrap's
`ensure_initial_catalog` implementation, with the 3f entrypoint changes.

**3d: Grants, revocations and Site Health allowance.**
Move remaining billing-admin mutations and
`scripts/set_site_health_entitlement.py` onto native entitlement grants,
resolution and projection owners. Preserve explicit account/workspace targeting,
actor/reason, dry-run, idempotency and append-only evidence.
PostgreSQL tests prove one effective lifecycle-version bump, replay/conflict,
same-transaction revocation visibility, expiry boundaries, invalid capability
rejection and Site Health projection under the existing lock order.

**3e: Billing baseline/backfill.**
Move `scripts/backfill_billing.py` and shared operator provisioning into the
native bootstrap owner. Native `src/entitlements/bootstrap.ts` already covers
free signup; add required operator/development behaviors under that owner,
without changing public signup's access.
Test concurrent first use, repeated baseline issuance, frozen registration cohort,
development top-ups and isolation from another workspace's grants.
Retain the existing Python grant/baseline bridge only for named Python bootstrap/
seed consumers until PR 4; preserve its shared lock/idempotency contract and do
not expand it into a second new entitlement authority.

**3f: Make catalog cutover independently runnable.**
The current migration image is Python-only. A Node command in the source tree
is not enough: package the built native CLI/runtime in the existing one-shot
migration/bootstrap image and update its actual commands. Keep API/worker images
Python-free and add no service/job resource.

For the configured-development bootstrap branch, preserve the required order:
Alembic upgrade/check → remaining Python identity/account provisioning with its
catalog author removed → native catalog initialization using the persisted active
admin → successful job completion. Both bootstrap stages must finish before API/
worker rollout. The demo-only and unconfigured-local skip branches retain their
existing admission and catalog behavior; do not publish a catalog unconditionally.

Wire `Dockerfile`, `docker-compose.yml`, `infra/gcp/run.tf`, relevant deploy/
smoke workflows and local provisioning/reset entrypoints in this PR. Update
`scripts/billing-test.ps1` and operator instructions with the new commands.
Use job/entrypoint orchestration; Python domain code must not shell out to Node.
If native catalog initialization fails after account creation, fail the job and
allow an idempotent retry; do not roll the API forward.

Test the composed sequence on an empty disposable database, repeated runs,
missing/unauthorized actors and catalog failure. Verify the image has its native
entrypoint and dependencies. PR 4 later replaces the remaining Python bootstrap,
not the missing half of a currently broken deployment.

**Exit gate:** commercial commands and catalog writing are native, the intermediate
deployment/local flow works from empty, and the remaining grant bridge has only
the documented consumers. Retire exclusive billing tests/code now. Prune
authoring-only config/export members with this cutover where readers permit;
keep schema constants in place.

## PR 4 — Seed tooling, deployment bootstrap and application bridge retirement

Order: **4a → 4b → 4c → 4d → 4e → 4f → 4g**.
Seed slices are separate implementation checkpoints inside this single PR.
They use native owner functions introduced in PRs 2–3.

**4a: Local development login.**
Move `scripts/provision_dev_login.py`, preserving development-environment plus
loopback-host admission, explicit allowance, unexpected-identity refusal and
repeatability. Update reset/provision orchestration in the same slice.

**4b: Seed identities and static state.**
Transfer the user/workspace/project/prompt/provider-metadata construction from
`seed_dev_data.py`. Use explicit identities, correct workspace scope and native
owners for meaningful writes. Verify repeatable static seeding in isolation.

**4c: Seed external evidence and injected transports.**
Transfer GSC/GA4 and answer-engine fixture support from
`seed_dev_support.py` and the relevant seeder sections.
All transports must be explicit deterministic stubs; clear inherited credentials.
Verify evidence shape/provenance and prevent fall-through to live services.
Retain existing shared HTML/JSON fixtures rather than moving them cosmetically.

**4d: Seed execution/orchestration.**
Transfer `seed_dev_runs.py` and final seeder execution. Reuse
`src/cli/seed-audit.ts`, `scripts/seed-site-health.ts` and the existing bounded
worker/queue owners. Cover audit, Site Health and Opportunity refresh in separate
focused paths. Test bounded draining, timeout/failure, terminal waits and exact
source IDs; do not add another worker loop.
Delete all three Python seed scripts and the exclusive Opportunity enqueue
bridge once the native pipeline is wired. Remove `httpx` after its final import.

**4e: Deployment bootstrap.**
Move `app/demo/bootstrap.py` using the native auth/catalog/grant owners.
Preserve configured identity checks, demo expiration, password rotation,
development transport policy, baseline/override behavior and idempotent catalog
initialization. Public signup never gets development access.
Replace `test_demo_bootstrap.py` with native empty-database, repeated/concurrent
startup, unexpected-identity and failure cases.

Update the PR 3 job sequence to Alembic upgrade/check → native account/catalog
bootstrap → rollout admission. Keep the same job/image boundary and remove its
Python application bootstrap entrypoint. Verify actual packaged commands.

Keep Python reset tooling limited to protected database reset/Alembic operations.
A native or PowerShell wrapper sequences reset and native login provisioning.
Preserve target authorization, identifier quoting, redaction and bounded failure/
timeout handling; destructive tests use explicitly disposable databases only.

**4f: Remaining application tests and schema-only fixtures.**
Move residual business-behavior tests by owner, reusing native coverage for
identity/abuse, entitlements, Site Health and provenance. Every removed test needs
a retained native case, retired behavior or contract-free assertion rationale.
Retain Python tests of real schema decisions, including workspace foreign keys,
uniqueness, delete restrictions and provenance constraints.

Remove Python business-service calls from retained schema fixture builders:
`conftest.py`, `occupancy_helpers.py`, `opportunity_helpers.py`,
`site_health_helpers.py` and `site_health_crawl_seed.py` as applicable.
Use minimal schema-only fixture rows rather than preserving auth/grant engines
just to seed tests. Do not replace constraint tests with source-string assertions
or generated-type presence checks.

**4g: Retire exclusive domain/crypto bridges immediately.**
Once bootstrap, seed and application test callers are gone, delete the unused
Python auth/workspace/abuse/billing/entitlement/Site Health service code and
exclusive tests. Retain only explicitly named exporter/schema dependencies for
PR 5, not a large unassigned cleanup queue.
Retire `auth-interop.py` and Python crypto when the last supported importer is
gone; keep native stored-hash, JWT/session-version and Fernet compatibility
coverage where those persisted formats remain readable.

Remove `models/prompt.py`'s application-only normalization callback and
`domain/prompts/normalization.py` after verifying no Python Prompt writer still
depends on it, including schema fixtures. Native Prompt writers must already
compute the persisted hash. Preserve metadata/default/constraint semantics.

**Exit gate:** every product operator, seed/login tool and account bootstrap is
native. Remaining Python reads are schema tooling or explicitly listed shared
policy/export readers assigned to PR 5. No Python business implementation exists
only for tests. Actual deployment of this cutover remains separately authorized.

## PR 5 — Isolate the permanent Python schema boundary

Order: **5a → 5b → 5c**. Alembic remains the sole schema author throughout.

**5a: Separate schema constants from application policy.**
Review remaining model imports, particularly environment-aware settings in
analytics, discovery, integrations and Site Health queue defaults.
Keep structural schema vocabulary/defaults in small dependency-free Python
modules; existing paths may remain. Do not rewrite all model imports for
cosmetic consolidation.

Move the final application policy into existing native config owners and retire
the corresponding export sections. Remove application-only model behavior after
a final writer/importer check; do not silently change durable defaults or DDL.
No schema declaration should import an application business service, crypto, or
the full Pydantic application Settings object just to construct metadata.

**5b: Minimal migration configuration and exporter retirement.**
Replace `migrations/env.py`'s dependency on `app.core.config.settings` and
isolate `app/core/database.py` as required for schema tooling. Use standard-library
configuration and SQLAlchemy URL handling where sufficient, preserving database
URL/TLS behavior, redaction, relevant migration admission and disposable-test
isolation. Native startup owns application-secret/runtime policy validation.

Remove `scripts/export_ts_platform.py`, its remaining policy builders,
`python-config.json` and exporter-only tests after all application policy
consumers transfer. Do not rename the artifact into a manually maintained copy.
Kysely database type generation remains independent, against the canonical
Alembic-migrated database. Verify native writes agree with database defaults and
constraints at the real PostgreSQL boundary.

**5c: Dependencies, image and checks.**
Target exactly three direct Python schema dependencies:
`sqlalchemy[asyncio]`, `alembic` and `asyncpg`.
Remove Pydantic/settings, HTTP and crypto declarations/lock entries only after
the importer/dynamic-loader inventory is empty. If a specific importer survives,
name it and keep the dependency temporarily; do not claim this PR complete
until it is resolved or the owner explicitly changes the target.

Retain schema tests and relevant Ruff/mypy/import/dependency/complexity/test-shape
checks as development tooling. Do not port Python AST/Radon tooling or weaken
gates to improve the language ratio. Update `quality.mjs`, change selection,
CI, packaging and existing development/architecture/operator docs for the narrow
boundary. Keep the Python environment, SQLAlchemy models, Alembic environment,
canonical baseline and migration image/runtime. Existing Python connection-wait
utilities may remain because they are schema tooling.

The same migration job still runs `alembic upgrade head` and `alembic check`
before native bootstrap/API rollout. A changed baseline on a stamped database
must fail closed. No reset, deployment or schema-authority change is authorized.

**Exit gate:** clean-checkout native application/operators/fixtures need no
Python runtime or Python policy exporter; schema initialization/drift checks and
generated Kysely types pass on disposable PostgreSQL. Python runs only schema/
migration maintenance and its checks. Application images remain Python-free.
No new service/job resource or additional schema author is introduced.

## Dependency retirement checkpoints

| Dependency                               | Earliest justified removal                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `httpx`                                  | Razorpay plan transport moved in PR 3 and seed support moved in PR 4                                    |
| `argon2-cffi`, `joserfc`, `cryptography` | Last Python identity/crypto consumer/probe retired in PR 4; any config/export importer resolved by PR 5 |
| `pydantic`, `pydantic-settings`          | Native application policy and migration-only configuration isolated in PR 5                             |
| `sqlalchemy`, `asyncpg`, `alembic`       | **Retain permanently under this plan**                                                                  |
| Python test/static-analysis dependencies | Retain those guarding schema tooling; retire only obsolete application tools                            |

Re-scan direct imports, dynamic CLI/driver loading, images and CI at each
checkpoint. Remove declarations and resolved lock entries together; no
unused-dependency exemptions for incomplete cutovers.

## Retirement disposition

PR 5 transfers the remaining exported policy into existing native config owners
and deletes the exporter/builders/artifact, workspace-role bridge and Python
capability registry. Python queue metadata uses fixed defaults; native writers
freeze configured limits explicitly. `core/database.py` retains only `Base`;
Alembic uses standard-library schema configuration and SQLAlchemy URL/TLS
handling. The direct runtime dependencies are SQLAlchemy, Alembic and asyncpg.

Removed Python production-security and referral-secret tests retain coverage in
native `production-security.test.ts` and `config.test.ts`. Crawl-control behavior
is covered by native `site-health-config.test.ts` and `entitlement-config.test.ts`.
Registry-construction tests transfer to native capability validation; literal
vocabulary/type/mapping assertions have no independent contract. Exporter parity
and duplicate native/shared-owner checks retire with the exporter. Dotenv
isolation is tested at the schema configuration boundary; schema constraint and
static-tooling tests remain. No application bridge remains for a future PR.
Deployment/provider/payment acceptance remains separately authorized.

## Final validation and handoff

Use the execution sequence at the top of this plan. Prepare meaningful tests
during implementation, but execute them only after the full PR, Astra review
and review fixes are complete.

Choose the smallest affected native owner suites. Persistence, authorization and
concurrency changes require real PostgreSQL; clear dotenv/inherited provider
credentials and use recorded transports and disposable data. No local full
backend suite, browser tests or E2E run is part of this workflow.

Run `./scripts/check.ps1 -CheckOnly` once in that final validation phase when
required by [AGENTS.md](../../AGENTS.md#validation). Use `-All` only for
shared-config changes or an explicitly requested release check. Do not overlap
check/test processes. On failure, inspect the failures, repair them together
and rerun affected stages only; do not restart the entire successful check
matrix after every repair. Normal commit hooks remain enabled and are not a
reason for extra manual validation runs.

The handoff records the selected PR/slices, changed owners and removals,
remaining bridges, Astra findings and their resolution, exact validation
commands/results, checks not run and any unresolved blocker. Update
[plan status](../plans/ACTIVE.md) and changed owner documentation once; do not create
progress sidecars. Honor the user's publication instructions and stop after
the assigned PR.

Finish the migration after PR 5 at the accepted schema-only Python boundary.
Do not target zero Python, restore retired evaluations or remove meaningful
safety coverage to improve a percentage.
