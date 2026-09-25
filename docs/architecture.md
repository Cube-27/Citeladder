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
| Onboarding | Research evidence and reviewed company/competitor context | Confirmed context and initial portfolio |
| Site Health | Acquisition, normalized facts, classifications, findings and snapshots | Persisted site evidence and change observations |
| Integrations / Demand | Imported observations, projections and demand signals | Exact-window/source evidence |
| Prompts / Visibility | Portfolios, frozen audits, answer artifacts and measurements | Comparable observed mentions/citations |
| Opportunities | Ranked actions, target-level Actions, declarations and verification observations | One Action per target and one implementation record |
| Commerce | Catalog projections and target-specific shelf observations | Reuses acquisition, Prompt and audit owners |
| Agent | Chats, frozen run context, tool/model attempts and versioned outputs | Reviewable deliverable over shared persisted readers; never automatic business truth |
| MCP | OAuth authorization records | Read-only access to the same owners |
| Billing / Entitlements | Commercial evidence, grants and ledger | Admission, availability and settlement |

Site Health, Content Intelligence, Demand Intelligence and the Agent are the
durable product capabilities; the Agent's skills deliver content creation, and
AI Visibility is Track. Commerce reuses the same
evidence and measurement owners rather than owning another crawler or runner.

## Evidence and action flow

Sources become immutable evidence/provider attempts, then versioned derived
projections, then user-visible findings, signals, drafts, opportunities and
measurements. Exact source IDs and relevant processing versions make each
derived result attributable. Persisted does not mean verified truth.

Onboarding confirms business context before portfolio generation. Site Health
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

## Delivery topology

The marketing Worker serves `citeladder.com` with Astro SSR and keeps public
MCP and signed webhook paths on their established apex identity. The product
Worker serves `app.citeladder.com`, including same-origin `/api/v1`, browser
login, callbacks and consent. Each Worker reaches FastAPI through authenticated
`origin.citeladder.com` ingress. GCP retains Caddy, FastAPI, PostgreSQL, durable
workers, secrets and backups; its deployment publishes only the backend image.
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
