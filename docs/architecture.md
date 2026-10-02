# CiteLadder architecture

CiteLadder connects owned-site, demand and answer-engine evidence through:
Connect → Analyze → Act → Improve / Verify → Track → Analyze.

The outcome is observed mention/citation share under comparable audits.
Crawl health, demand coverage and AEO readiness are leading indicators, not
proof that CiteLadder caused later movement. [Product](../PRODUCT.md) owns
positioning; [the index](README.md) routes to substantive feature documents.

## Cross-system ownership

| Owner | Writes | Downstream contract |
|---|---|---|
| Workspace/project access | Identity, membership and project boundaries | Every product action/read is authorized |
| Onboarding | Research evidence and reviewed company/competitor context | Confirmed context and a project with an empty prompt set |
| Site Health | Acquisition, normalized facts, classifications, findings, snapshots and bounded internal-link analyses | Persisted site evidence, contextual-link suggestions and change observations |
| Integrations / Demand | Imported observations, projections and demand signals | Exact-window/source evidence |
| Prompts / Visibility | Portfolios, frozen audits, answer artifacts and measurements | Comparable observed mentions/citations |
| Opportunities | Ranked actions, target-level Actions, declarations and verification observations | One Action per target and one implementation record |
| Commerce | Catalog projections and target-specific shelf observations | Reuses acquisition, Prompt and audit owners |
| Agent | Chats, frozen run context, tool/model attempts and versioned outputs | Reviewable deliverable over shared persisted readers; never automatic business truth |
| MCP | OAuth authorization records | Read-only access to the same owners |
| Billing / Entitlements | Commercial evidence, grants and ledger | Admission, availability and settlement |

TypeScript owns billing checkout, subscription changes, webhook receipt,
leased recovery, invoice issuance, consumable-ledger writes and, under the
`billing-documents` family, receipt list/PDF reads. Python retains
catalog/operator administration and metering/admission bridges for the audit,
Site Health and Agent workers until their migrations (PRs 17–19). Both stacks
use the same durable rows and follow the lock order below; see
[Billing and entitlements](billing-entitlements.md) for the owner boundaries.

Site Health, Content Intelligence, Demand Intelligence and the Agent are the
durable product capabilities; the Agent's skills deliver content creation, and
AI Visibility is Track. Commerce reuses the same
evidence and measurement owners rather than owning another crawler or runner.

## Evidence and action flow

Sources become immutable evidence/provider attempts, then versioned derived
projections, then user-visible findings, signals, drafts, opportunities and
measurements. Exact source IDs and relevant processing versions make each
derived result attributable. Persisted does not mean verified truth.

Onboarding confirms business context and creates no prompts; the user then
chooses what to track. Site Health
and integrations acquire evidence within their configured bounds. Opportunities
groups actions by target into Actions. The Agent freezes context from durable
identifiers, reads further evidence through bounded tools and returns a
reviewable deliverable attached to the target's Action. Only an explicit
implementation declaration starts the Act → Verify record; later observations
remain separate from that declaration.

Command Center composes these persisted owners into Facts, evidence-labelled
loop states and one next action. Before an audit, measurement fields remain
unavailable. Report reads return missing state rather than building a report.
The Agent and MCP reuse these projections and own no second knowledge store.

## Shared execution and automation

PostgreSQL is durable state and queue. Workers claim with SKIP LOCKED, commit
before I/O, maintain leases and terminalize idempotently. Reads never acquire,
sync, score or repair. [Backend architecture](backend-architecture.md) owns
shared worker/API mechanics; [frontend architecture](frontend-architecture.md)
owns shell, query and URL state.

Acquisition and deterministic processing may progress automatically after their
authorized initiation and within frozen bounds. Models may explain, classify
bounded ambiguity, plan or generate; they do not change deterministic metrics.
Publishing, prompt activation, external mutation, billing changes and future
durable-memory promotion retain their explicit user-decision boundaries.
[Invariants](invariants.md) is the correctness authority.

## Languages and the TypeScript service

TypeScript owns every application route, protocol endpoint and executing worker.
`frontend/services/api` runs Node, Hono and Kysely against PostgreSQL.
Audit maintenance, the analytics/Agent/Site Health workers, and the independent
native discovery/integration sweeper own their respective lease recovery.
Every route family, task kind and table has one writing owner. The route-family
manifest in `frontend/packages/contracts/src/route-ownership.ts` and the native
OpenAPI declarations are checked against all three ingress Caddyfiles.

Python retains SQLAlchemy models, Alembic, deploy-time bootstrap, supported
offline operators and policy still read by those consumers. It has no web
process or executing queue worker. The root Dockerfile builds this schema and
operator image; the API image supplies all long-running application processes.

Python code a moved route still shares with Python callers stays until its last
Python caller moves. Acquisition, URL admission, suppression and failure reads
are native; Python persistence fixtures supply explicit canonical test URLs.
The supported Python acquisition-control operator still writes the durable stop
switch consumed by native per-hop authorization. TypeScript owners are covered by their own TypeScript and
PostgreSQL tests; no golden files compare them with Python.

`@citeladder/contracts` (`frontend/packages/contracts`) holds the zod response
contracts the browser app validates with (TypeScript routes publish the same
schemas, and each handler's return type is checked against its schema), the route-ownership manifest, and the
hand-owned API error-code vocabulary. Native config owns HTTP status defaults
and retry classification; neither is generated from Python.

Native-only policy lives in TypeScript config. Shared Python policy reaches the
service through a generated, drift-checked export. Site Health catalogs and
worker policy are native; Python retains its model defaults, terminal statuses
and supported operator/entitlement allowance settings.
The auth and workspace HTTP families
are TypeScript-owned, including session issuance, Google identity sign-in,
membership/invitation mutations, policy acceptance and product-tour state.
Both stacks verify the same session claims and persisted session version;
remaining Python/operator bridges and their lock orders are recorded in
[workspace access](workspace-access.md) and the migration plan.
Alembic stays the only schema author, so the service holds Kysely types
generated from the migrated schema.

## Delivery topology

The marketing Worker serves `citeladder.com` with Astro SSR and keeps public
MCP and signed webhook paths on their established apex identity. The product
Worker serves `app.citeladder.com`, including same-origin `/api/v1`, browser
login, callbacks and consent. Each Worker reaches the native API through authenticated
`origin.citeladder.com` ingress. GCP retains Caddy, the native API, PostgreSQL, durable workers, secrets and
backups; deployment uses separate API and Python schema/operator images.
The [Workers runbook](operations/WORKERS_RUNBOOK.md) owns the approved release,
production acceptance and recovery order.

Current work is only in [plan status](plans/ACTIVE.md); an architecture document
does not assign a historical delivery wave.

## Combined transaction lock DAG

Billing and entitlement changes preserve each domain's established prefix and
then converge on one acyclic order:

`project -> prompt-set -> domain row (runtime/audit/task) -> account-capacity advisory lock -> billing account -> grants (UUID lock order) -> receipt/intent -> ledger`.

Site Health's existing prefixes remain `project -> runtime -> profile` and
`runtime -> membership -> crawl -> task`. Cancellation remains `audit -> task
mutation -> reservation release`. A transaction that has acquired the account
capacity or any billing row must not acquire project, prompt, runtime, audit, or
task locks afterward. Candidate grants are locked in UUID order; commercial
earliest-expiry draw order is computed separately and frozen on reservation
allocations. Provider/network I/O never occurs while a database transaction or
lock is held. Projection refreshes that require domain locks run after the
billing mutation commits, in a new transaction following the domain prefix.
