# Backend architecture

The application API, health/readiness, executing workers and schema tooling are
TypeScript-owned. The one-shot migration job
runs the migrate CLI (the SQL schema baseline) and native identity/grant/catalog
bootstrap from the API image before admitting API rollout.
PostgreSQL owns durable
state and queues. Domain behavior is documented in the feature owners listed in
[the documentation index](README.md); this file owns shared backend mechanics.

Projects, onboarding research/completion, logo refresh and command-center reads
are TypeScript-owned under frontend/services/api/src/projects/. Discovery runs
in its TypeScript worker, whose runner lane recovers expired leases and retries.
Interactive onboarding invokes that same worker through an
awaited, bounded API mutation scoped to one authorized discovery; background
execution remains its recovery path. Executive PDFs use the TypeScript command-center
projection and shared PDF renderer; receipt list/download reads are also
TypeScript-owned. Ingress routing is
checked against the shared route-ownership manifest.

Audit admission, providers and answer-engine transports, immutable execution
persistence, scoring, funded settlement, scheduling and maintenance are native
TypeScript owners. Search Intelligence review and acquisition use the same
native provider custody and PostgreSQL capacity boundary. Site Health acquisition,
check catalogs, allowance projections and worker settings are native.
Native audit config owns lifecycle, scoring, read limits and runtime settings;
native provider/DataForSEO config owns endpoints, capacity, request policy and
pricing, frozen route identities and the public provider catalog. The SQL
baseline carries only structural column defaults and constraints.
Commerce competitor discovery uses the native
analytics worker and Site Health acquisition, parsing and classification owners.
Analytics lease recovery and evidence/outcome settlement belong to that worker.
Discovery charges attempts on completion/recovery;
integrations charge at claim and recovery does not charge a second time.

## Layers and extension

| Layer           | Responsibility                                                         |
| --------------- | ---------------------------------------------------------------------- |
| Native routes/  | HTTP translation, request validation and coded errors                  |
| SQL baseline    | Tables, constraints and relational integrity (`migrations/`)          |
| Native services/ | Business policy, authorized mutations and persisted projections       |
| Native acquisition/ | External acquisition and provider transports                       |
| Native analysis/ | Bounded deterministic derivation                                      |
| Native workers/ | Lease, I/O/analysis and atomic terminal persistence                    |

A product write that the public API also exposes goes through a command in
`src/commands/`: it takes an `Actor` (`src/auth/actor.ts`; a member, or an API
key acting for its creator with the live role), calls `requireCapability`, then
the owner. Browser and public routes call the same command; no route repeats
its validation or limits ([Public API](public-api.md)). Other browser writes
authorize in the route middleware.

Search the owning domain, callers, types, configuration and tests before adding
another module. Routers do not acquire evidence during a read; connectors do not
own scoring or entitlement decisions; workers coordinate domain operations
rather than restating them. Business logic does not move into generic utilities
for convenience.

Node 26, Hono and Kysely own the native service, workers and schema tooling.
Compose names the native API `api-service` on port 8100; its `migrate` service
runs the same image's one-shot migration/bootstrap. Seed/login tools run natively
from the local checkout. Commercial operators are packaged into that image. Bounded
provider provisioning, acquisition control, agreement references and interactive
account administration run in the native API package/image. Browser calls stay same-origin
`/api/v1`. Native startup enforces the shared production secret, database, proxy,
demo and redirect-origin admission policy. The migrate CLI reads only the
database connection settings, so it needs no application secrets.
Fernet-encrypted provider/OAuth secrets and least-privilege worker environments
keep credential custody separate from product projections.

The default agent is one OpenAI-compatible chat-completions client configured by
`DEFAULT_AGENT_API_KEY`, `DEFAULT_AGENT_BASE_URL` and `DEFAULT_AGENT_MODEL`;
there is no per-provider adapter. Requests use the portable subset: messages,
an output cap sent as `max_completion_tokens` (retried once as `max_tokens` when
the provider rejects the former by name), and JSON Schema instructions in the
prompt rather than a provider-specific response format. Customer (BYOK) app
routes and their connection test follow the same rules through
`frontend/services/api/src/models/`. Callers validate the returned JSON against
their own schemas and evidence contracts before persistence.

## Task queue contract

The bounded `runner.ts` process composes all six native task lanes and billing
recovery with one PostgreSQL pool (at most four connections) plus one session
holding the drain lock. Each pass gives every lane one admission (Site Health
keeps a pool-bounded batch in flight; billing and Agent recovery take a bounded
batch) and revisits earlier lanes for successors. Its time budget stops new
admission; claimed work finishes before the pool closes, except integration
syncs, which yield at the deadline and resume from their committed pages. A
randomized starting lane avoids systematically delaying the same owner across
executions. A failed lane is skipped for the rest of the drain while independent
owners continue; the job still fails, and the error is logged with the lane.

Every lane reclaims its own expired leases on each pass, including idle ones,
and reports when its next task is due: the earliest claimable row or lease
expiry (Agent: when an unclaimed turn passes its grace). Billing has no probe;
its retries wait for tick.

`tick.ts` first runs MCP and usage-window cleanup, audit maintenance, Search
Intelligence reconciliation, due audit schedules, integration dispatch/revocation
and crawl-log maintenance once, logging each phase's duration, then uses the
remaining budget for that same drain.
Periodic owners recheck admission before each occurrence, revocation or recovery
unit. The scheduler claims one occurrence at a time under a runner budget, so
stopping never strands a preclaimed batch; admitted units finish settlement.
Worker-owned lease and crawl backstops still run in each lane, including idle
passes. Runner and tick own background execution. After durable admission, the
browser starts a separate authorized POST for onboarding discovery, Site Health,
Internal Links, audits, Agent turns, integration syncs, Performance range
projections and Commerce competitor discovery. These requests reuse existing
workers scoped to the admitted work, with bounded admission and provider
deadlines, so initial progress does not require a new Cloud Run job. PostgreSQL
leases arbitrate concurrent API and runner claims. Interactive crawls and
competitor discovery also honor the shared drain lock to preserve crawler pacing.
Reads remain persisted-only;
large workloads, future retries and scheduled work retain background execution.
No per-owner daemon remains.
One PostgreSQL advisory lock admits one drain at a time across executions.

With `CLOUD_RUN_RUNNER_JOB` configured, the API observes successful queue/billing
mutations per request at the PostgreSQL connection boundary. Autocommit or
successful COMMIT marks work; rollback, savepoint rollback, aborted transactions
and no-op writes do not. After the request settles, it awaits a bounded Cloud Run
job-start request using service-account metadata credentials. This also covers
requests whose later operation fails after earlier work committed. Reads do not
start jobs; background worker writes never start jobs. Instead, an execution
that idles keeps its drain while a lane's earliest pending task (Site Health
deferrals and retry backoff) becomes due within its budget, polling for new work
meanwhile. After releasing the drain lock, an execution whose pending work is due
within a fresh budget starts one successor, even when a lane failed (the failed
lanes are left out of that probe); work due later waits for tick. Cloud Run
takes one to three minutes to start an execution (measured October 2026), so a
successor is not an immediate pickup. Request-bound
discovery suppresses wake-up because it has no successors. Other interactive
workers keep observation active so successors committed after a
background drain exits still wake the runner. Duplicate starts are
allowed and existing leases arbitrate claims. A failed start is logged without
tokens/provider bodies and leaves the committed response and work intact for tick.

The Cloud Run API (`K_SERVICE`, or configured runner job outside a job
execution) requires the existing
`CITELADDER_ORIGIN_TOKEN` on every request, including health/readiness and MCP;
the previous token may be accepted during rotation. Missing tokens fail startup.
An admitted request must also name an allowlisted public host (the app, apex
or API host), which MCP origin checks use. Only the API host serves `/v1/...`
and the MCP protocol paths, and it serves nothing else. Its `X-CiteLadder-Client-IP` becomes the
client identity for rate limits. Cloud Run uses a TCP startup probe;
authenticated HTTP probes must send the origin and public-host headers. Runtime commands and environment settings are owned by
[Development](DEVELOPMENT.md#scale-to-zero-runtime).

1. Claim bounded work with `FOR UPDATE SKIP LOCKED`.
2. Persist the lease and commit before network I/O.
3. Heartbeat long work and recover expired leases.
4. Write terminal state and derived rows atomically.
5. Make cancellation, retries, and reconciliation idempotent.
6. Never hold database transactions open across provider calls.

The combined cross-domain lock order is owned by
[architecture](architecture.md#combined-transaction-lock-dag). Domain-specific
lease, cancellation, retry and terminalization details belong to the affected
feature owner. PostgreSQL concurrency needs its real boundary; an in-memory
mock cannot establish lock safety.

## API and persistence rules

Every project query is workspace-authorized and product IDs are UUIDs.
[Workspace access](workspace-access.md) owns the role and membership model.
Reads project existing state without provider I/O, acquisition or repair.
Raw evidence and provider attempts are append-only; derived rows retain direct
source IDs and relevant versions. Native policy lives under
`frontend/services/api/src/config/` and the owning service config modules.
Opportunity/Action catalogs and source-page inspection policy are native.
Commerce acquisition/admission policy and buyer-prompt templates, plus scheduler
runtime settings and the pinned timezone catalog, are native. Commerce persisted
versions and scheduler policy belong to native config.
Auth HTTP settings, approved policy revisions, workspace denial responses and
brand validation bounds are native. Native workspace config owns the role matrix.
The native Agent catalog parses packaged Markdown. Opportunity reads preserve
frozen format identifiers, including identifiers retired from the current
catalog. Queue execution bounds are native; schema status vocabulary remains shared.
Billing checkout, reconciliation, webhook policy and provider-display composition
are native. Native configuration owns seller/tax settings, catalog authoring and read-only
Razorpay credentials. Native entitlement resolution, operator grants and
account-capacity locks are the sole business authority. Native config owns the
capability registry; native PostgreSQL tests cover the schema's constraints.
Do not introduce Redis without measured need.

Backend schemas own the wire contract. Coordinate frontend schemas and API
clients when a DTO changes. [API errors](api-error-contract.md) owns coded
cross-stack error shapes; domain errors are translated at the HTTP boundary,
not leaked as provider bodies or secret-bearing diagnostics.
[Invariants](invariants.md) owns correctness, provenance and the single-baseline
migration policy. Setup and validation commands live in
[Development](DEVELOPMENT.md).

## Observability

Native structured JSON logging lives in `frontend/services/api/src/logging.ts`;
API errors carry the request ID into server logs and the safe response envelope.