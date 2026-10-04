# Backend architecture

The application API, health/readiness and executing workers are TypeScript-owned.
Python has no HTTP process. The native queue sweeper backs
up discovery and integration lease recovery. The one-shot migration job runs Alembic upgrade/check, retained Python identity/grant
bootstrap, then native catalog initialization before admitting API rollout.
PostgreSQL owns durable
state and queues. Domain behavior is documented in the feature owners listed in
[the documentation index](README.md); this file owns shared backend mechanics.

Projects, onboarding research/completion, logo refresh and command-center reads
are TypeScript-owned under frontend/services/api/src/projects/. Discovery runs
in its TypeScript worker; the native queue sweeper backs up lease-expiry and retry
reconciliation. Executive PDFs use the TypeScript command-center
projection and shared PDF renderer; receipt list/download reads are also
TypeScript-owned. Ingress routing is
checked against the shared route-ownership manifest.

Audit admission, providers and answer-engine transports, immutable execution
persistence, scoring, funded settlement, scheduling and maintenance are native
TypeScript owners. Search Intelligence review and acquisition use the same
native provider custody and PostgreSQL capacity boundary. Python retains schema
models and policy still consumed by models/operators. Site Health's acquisition,
check catalogs and worker settings are native; its exported Python bridge is
limited to model/read defaults and five operator/entitlement settings.
Native audit config owns lifecycle, scoring, read limits and runtime settings;
native provider/DataForSEO config owns endpoints, capacity, request policy and
pricing. Python keeps frozen route identities and the public provider catalog
for shared schema/seed readers, plus model
defaults and provenance versions. No Python connector executes an answer engine.
Commerce competitor discovery uses the native
analytics worker and Site Health acquisition, parsing and classification owners.
Analytics lease recovery and evidence/outcome settlement belong to that worker;
the independent native sweeper recovers brand-discovery and integration leases
when their workers are down. Discovery charges attempts on completion/recovery;
integrations charge at claim and recovery does not charge a second time.

## Layers and extension

| Layer           | Responsibility                                                  |
| --------------- | --------------------------------------------------------------- |
| Native routes/  | HTTP translation, request validation and coded errors           |
| Python core/    | Shared configuration, database and operator security            |
| models/         | SQLAlchemy persistence and relational integrity                 |
| domain/         | Business policy, authorized mutations and persisted projections |
| connectors/     | External acquisition and provider transports                    |
| analysis/       | Bounded deterministic derivation                                |
| Native workers/ | Lease, I/O/analysis and atomic terminal persistence             |

Search the owning domain, callers, types, configuration and tests before adding
another module. Routers do not acquire evidence during a read; connectors do not
own scoring or entitlement decisions; workers coordinate domain operations
rather than restating them. Business logic does not move into generic utilities
for convenience.

Python 3.12, async SQLAlchemy/asyncpg and Pydantic settings own the remaining
Python runtime; Node 26, Hono and Kysely own the native service and workers.
Compose names the native API `api-service` on port 8100. The Python image runs
one-shot migrations/bootstrap and remaining seed/login tools. Commercial operators
are native and packaged into that same job image. Bounded
provider provisioning, acquisition control, agreement references and interactive
account administration run in the native API package/image. Browser calls stay same-origin
`/api/v1`. Native startup enforces the shared production secret, database, proxy,
demo and redirect-origin admission policy; Python keeps the same safeguards for
migration and operator tooling.
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
recovery with one PostgreSQL pool (at most four connections). It admits one task
per lane per pass and revisits earlier lanes for successors. Its time budget
stops new admission; claimed work finishes before the pool closes. A randomized
starting lane avoids systematically delaying the same owner across executions.
Lane failures leave the job failed after independent owners have had a chance.

`tick.ts` first runs queue recovery, audit maintenance/Search Intelligence
reconciliation, due audit schedules and integration dispatch/revocation once,
then uses the remaining budget for that same drain.
Periodic owners recheck admission before each occurrence, revocation or recovery
unit. The scheduler claims one occurrence at a time under a runner budget, so
stopping never strands a preclaimed batch; admitted units finish settlement.
Worker-owned lease and crawl backstops still run in each lane, including idle
passes. Runner and tick are the only executors; no per-owner daemon remains.
One PostgreSQL advisory lock admits one drain at a time across executions.

With `CLOUD_RUN_RUNNER_JOB` configured, the API observes successful queue/billing
mutations per request at the PostgreSQL connection boundary. Autocommit or
successful COMMIT marks work; rollback, savepoint rollback, aborted transactions
and no-op writes do not. After the request settles, it awaits a bounded Cloud Run
job-start request using service-account metadata credentials. This also covers
requests whose later operation fails after earlier work committed. Reads do not
start jobs; worker writes never recursively start jobs. Duplicate starts are
allowed and existing leases arbitrate claims. A failed start is logged without
tokens/provider bodies and leaves the committed response and work intact for tick.

The Cloud Run API (`K_SERVICE`, or configured runner job) requires the existing
`CITELADDER_ORIGIN_TOKEN` on every request, including health/readiness and MCP;
the previous token may be accepted during rotation. Missing tokens fail startup.
An admitted request must also name an allowlisted public host (the app or apex
host), which MCP origin checks use. Its `X-CiteLadder-Client-IP` becomes the
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
Policy with remaining Python readers stays in `app/core/config/` and reaches
TypeScript through the drift-checked export. Models/Alembic, supported operator
tools and demo/bootstrap remain Python consumers. Moving a policy section
removes its Python definition and exporter builder in the same change.
Opportunity/Action catalogs, source-page inspection and placement policy are
native; Python retains their schema defaults and development enqueue versions.
Commerce acquisition/admission policy and buyer-prompt templates, plus scheduler
runtime settings and the pinned timezone catalog, are native. Commerce persisted
versions and scheduler model defaults remain in the shared export.
Auth HTTP settings, approved policy revisions, workspace denial responses and
brand validation bounds are native. Python retains operator limits, role grants
and persisted identity defaults. The native Agent catalog parses packaged
Markdown; Python no longer parses those model inputs. Opportunity reads preserve
frozen format identifiers, including identifiers retired from the current
catalog. Queue execution bounds are native; schema status vocabulary remains shared.
Billing checkout, reconciliation, webhook policy and provider-display composition
are native. Native configuration owns seller/tax settings, catalog authoring and read-only
Razorpay credentials. Python retains schema vocabulary and the baseline/grant
bridge for identity/bootstrap, local login, seeding and schema fixtures until PR 4.
Entitlement registry/algebra, operator grants and account-capacity locks stay
shared; no exported section remains solely for a native runtime consumer.
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
Python operator commands use standard logging. The retired Python HTTP/worker
Logfire integration and its environment settings are no longer shipped.
