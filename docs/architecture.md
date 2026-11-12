# CiteLadder architecture

CiteLadder connects owned-site, demand and answer-engine evidence through:
Connect → Analyze → Act → Improve / Verify → Track → Analyze.

The outcome is observed mention/citation share under comparable audits.
Crawl health, demand coverage and AEO readiness are leading indicators, not
proof that CiteLadder caused later movement. [Product](../PRODUCT.md) owns
positioning; [the index](README.md) routes to substantive feature documents.

## Cross-system ownership

| Owner                    | Writes                                                                                                 | Downstream contract                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Workspace/project access | Identity, membership and project boundaries                                                            | Every product action/read is authorized                                              |
| Onboarding               | Research evidence and reviewed company/competitor context                                              | Confirmed context and a project with an empty prompt set                             |
| Site Health              | Acquisition, normalized facts, classifications, findings, snapshots and bounded internal-link analyses | Persisted site evidence, contextual-link suggestions and change observations         |
| Integrations / Demand    | Imported observations, projections and demand signals                                                  | Exact-window/source evidence                                                         |
| Prompts / Visibility     | Portfolios, frozen audits, answer artifacts, measurements, answer perception, fact checks and answer ads | Comparable observed mentions/citations; perception and accuracy with coverage; ads apart |
| Opportunities            | Ranked actions, target-level Actions, declarations and verification observations                       | One Action per target and one implementation record                                  |
| Commerce                 | Catalog, imports, match passes and product observations from every answer                              | Reuses acquisition, Prompt and audit owners                                          |
| Agent                    | Chats, frozen run context, tool/model attempts and versioned outputs                                   | Reviewable deliverable over shared persisted readers; never automatic business truth |
| MCP                      | OAuth authorization records, change confirmations                                                      | Reads, and changes the user confirms, through the same owners                        |
| Public API               | API keys and replay-safe request records                                                               | Scoped REST access through the same commands and reads as the browser                |
| Billing / Entitlements   | Commercial evidence, grants and ledger                                                                 | Admission, availability and settlement                                               |

TypeScript owns billing checkout, subscription changes, webhook receipt,
leased recovery, invoice issuance, consumable-ledger writes and, under the
`billing-documents` family, receipt list/PDF reads, and commercial operator
administration, identity bootstrap and seed tools. Native owners
use the durable rows and follow the lock order below; see
[Billing and entitlements](billing-entitlements.md) for the owner boundaries.

Site Health, [Content optimization](content-optimization.md), Search Demand
and the Agent are the durable product capabilities; the Agent's skills deliver
content creation, and
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
loop states and one next action. The next action puts measurement first:
prompts, then the first audit (reported as running while one is in flight),
then the top Action, then the site crawl and a search integration. Before an
audit, measurement fields remain unavailable. Report reads return missing state rather than building a report.
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
Background work runs in bounded runner executions of the same image, and a
scheduled tick in the API runs the periodic owners and wakes the runner when
work is due; each lane and the tick's queue recovery own their lease recovery.
Every route family, task kind and table has one writing owner. Every native
OpenAPI operation declares one family from the manifest in
`frontend/packages/contracts/src/route-ownership.ts`.

The schema is `frontend/services/api/migrations/0001_baseline.sql` plus numbered
forward migrations, applied by the TypeScript migrate CLI (`src/cli/migrate.ts`) from the API
image. Product operators, login/seeding and
acquisition controls run under their native owners and use the same PostgreSQL
authorization, provenance and lock contracts. TypeScript tests against real
PostgreSQL cover native owners, schema constraints and the migrate CLI.

`@citeladder/contracts` (`frontend/packages/contracts`) holds the zod response
contracts the browser app validates with (TypeScript routes publish the same
schemas, and each handler's return type is checked against its schema), the route-ownership manifest, and the
hand-owned API error-code vocabulary. Native config owns HTTP status defaults
and retry classification.

Application policy lives in native config, including security, roles,
capabilities, provider catalogs and queue bounds. The migration job applies the
pending SQL migrations in order under an advisory lock (recording each SHA-256 in
`schema_migrations`; an edited applied file or unledgered tables fail the job), then runs native identity/grant/catalog bootstrap; successful job
completion admits API/worker rollout. Auth, workspace, commercial and product writes are native.

The SQL migrations are the only schema author, so the service holds Kysely types
generated from a migrated database.

## Delivery topology

The marketing Worker serves `citeladder.com` as prerendered static pages, with
on-demand pricing, contact and 404 routes, and keeps signed webhook paths on
their established apex identity. The API host Worker serves
`api.citeladder.com`: the public REST API, crawl-log ingest and MCP with its
OAuth endpoints. The product
Worker serves `app.citeladder.com`, including same-origin `/api/v1`, browser
login, callbacks and consent. Each Worker reaches the native API on scale-to-zero
Cloud Run (us-central1) with the origin token. Runner, tick and migration jobs
share its images, and PostgreSQL runs alone on a private free-tier VM. There
are no backups ([Google Cloud hosting](operations/GOOGLE_CLOUD.md)).
The [Workers runbook](operations/WORKERS_RUNBOOK.md) owns the approved release,
production acceptance and recovery order.

Current work is only in [plan status](plans/ACTIVE.md); an architecture document
does not assign a historical delivery wave.

## Combined transaction lock DAG

Billing and entitlement changes preserve each domain's established prefix and
then converge on one acyclic order:

`project -> prompt-set -> domain row (runtime/audit/task) -> account-capacity advisory lock -> billing account -> grants (UUID lock order) -> receipt/intent -> ledger`.

Site Health's prefix is `project -> runtime -> membership -> crawl -> task`,
with the profile after the crawl (`project -> runtime -> profile` when no crawl
is locked). The runtime row is a domain lock: admission and monitored-set
controls hold it first and resolve it from grants under the capacity lock last.
A grant change never writes it inside the billing transaction; the
transaction's owner refreshes the runtime after the commit. Cancellation remains `audit -> task
mutation -> reservation release`. A transaction that has acquired the account
capacity or any billing row must not acquire project, prompt, runtime, audit, or
task locks afterward. Candidate grants are locked in UUID order; commercial
earliest-expiry draw order is computed separately and frozen on reservation
allocations. Provider/network I/O never occurs while a database transaction or
lock is held. Projection refreshes that require domain locks run after the
billing mutation commits, in a new transaction following the domain prefix.
