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

Billing owners follow the lock order below; see
[Billing and entitlements](billing-entitlements.md) for the owner boundaries.

Commerce reuses the same evidence and measurement owners rather than owning
another crawler or runner; the Agent's skills deliver content creation
([Content optimization](content-optimization.md)).

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

The Overview's next action (`projects/command-center.ts`) puts measurement
first: prompts, then the first audit, then the top Action, then the site crawl
and a search integration. The Agent and MCP reuse these projections and own no
second knowledge store.

## Shared execution and automation

[Backend architecture](backend-architecture.md) owns shared worker/API
mechanics; [frontend architecture](frontend-architecture.md) owns shell, query
and URL state; [invariants](invariants.md) is the correctness authority.

## Languages and the TypeScript service

TypeScript owns every application route, protocol endpoint and executing worker.
`frontend/services/api` runs Node, Hono and Kysely against PostgreSQL.
Background work runs in bounded runner executions of the same image, and a
scheduled tick in the API runs the periodic owners and wakes the runner when
work is due; each lane and the tick's queue recovery own their lease recovery.
Every route family, task kind and table has one writing owner. Every native
OpenAPI operation declares one family from the manifest in
`frontend/packages/contracts/src/route-ownership.ts`.

A successful migration and bootstrap job admits API/worker rollout
([migrations](DEVELOPMENT.md#migrations-forward-only)). Operator tools use the
same PostgreSQL authorization, provenance and lock contracts as the API.
`@citeladder/contracts` holds the zod response contracts, the route-ownership
manifest and the hand-owned error-code vocabulary; each handler's return type is
checked against its schema.

## Delivery topology

Three Workers front the one native API on scale-to-zero Cloud Run: marketing
(`citeladder.com`, prerendered, plus on-demand `/pricing`, the contact intake and
`/health`), the API host (`api.citeladder.com`: public REST API, crawl-log
ingest, MCP and its OAuth endpoints) and the product app
(`app.citeladder.com`, same-origin `/api/v1`). Each reaches the API with the
origin token. [Google Cloud hosting](operations/GOOGLE_CLOUD.md) and the
[Workers runbook](operations/WORKERS_RUNBOOK.md) own hosting, release,
acceptance and recovery.

## Combined transaction lock DAG

Billing and entitlement changes preserve each domain's established prefix and
then converge on one acyclic order:

`project -> prompt-set -> domain row (runtime/audit/task) -> account-capacity advisory lock -> billing account -> grants (UUID lock order) -> receipt/intent -> ledger`.

Site Health's prefix is `project -> runtime -> membership -> crawl -> task`,
with the profile after the crawl (`project -> runtime -> profile` when no crawl
is locked). The runtime row is a domain lock: admission and monitored-set
controls hold it first and resolve it from grants under the capacity lock last.
A grant change never writes it inside the billing transaction; the
transaction's owner refreshes the runtime after the commit.
Inserting a row that references a project takes a key-share lock on the
project row through its foreign key, so that implicit lock is a project lock
too. Only project deletion locks the row `FOR UPDATE`, which blocks those
inserts; every other project writer serializes with `FOR NO KEY UPDATE`, which
does not. The same holds for a crawl row: every child insert key-shares it, so
crawl writers lock it `FOR NO KEY UPDATE`. An analyze task commit writes no
crawl column and takes it `FOR SHARE` in the same place, so commits share it
while Stop and the reconcile wait for them. A path that inserts project rows after the capacity lock (an audit
launch) takes the project's key-share lock before the capacity lock. Cancellation remains `audit -> task
mutation -> reservation release`. An Agent proposal confirm takes `membership (share) -> proposal outcome insert` (which key-shares the project, chat and message) before the change kind's own prefix, so the outcome row adds no lock after a billing row. A live change kind first takes a session advisory try-lock on the proposal, outside any transaction, and never waits on it. A run ending takes its probe launch's advisory
lock after its own audit row; nothing takes it before an audit row
(`probes/launch-end.ts`). A transaction that has acquired the account
capacity or any billing row must not acquire project, prompt, runtime, audit, or
task locks afterward. Candidate grants are locked in UUID order; commercial
earliest-expiry draw order is computed separately and frozen on reservation
allocations. Provider/network I/O never occurs while a database transaction or
lock is held. Projection refreshes that require domain locks run after the
billing mutation commits, in a new transaction following the domain prefix.
