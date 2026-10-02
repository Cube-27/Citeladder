# Backend architecture

The application API and executing workers are TypeScript-owned. Python's web
process currently serves only health/readiness; its sweeper retains discovery
and integration recovery, and its migration job runs Alembic and demo bootstrap.
PostgreSQL owns durable
state and queues. Domain behavior is documented in the feature owners listed in
[the documentation index](README.md); this file owns shared backend mechanics.

Projects, onboarding research/completion, logo refresh and command-center reads
are TypeScript-owned under frontend/services/api/src/projects/. Discovery runs
in its TypeScript worker; the Python queue sweeper retains lease-expiry and retry
reconciliation. Executive PDFs use the TypeScript command-center
projection and shared PDF renderer; receipt list/download reads are also
TypeScript-owned. Ingress routing is
checked against the shared route-ownership manifest.

Audit admission, providers and answer-engine transports, immutable execution
persistence, scoring, funded settlement, scheduling and maintenance are native
TypeScript owners. Search Intelligence review and acquisition use the same
native provider custody and PostgreSQL capacity boundary. Python retains schema
models and exported policy. Commerce competitor discovery uses the native
analytics worker and Site Health acquisition, parsing and classification owners.
Analytics lease recovery and evidence/outcome settlement belong to that worker;
the Python sweeper retains brand-discovery and integration recovery.

## Layers and extension

| Layer | Responsibility |
|---|---|
| api/ | HTTP translation, dependencies, request validation and coded errors |
| core/ | Configuration, database, security and telemetry |
| models/ | SQLAlchemy persistence and relational integrity |
| domain/ | Business policy, authorized mutations and persisted projections |
| connectors/ | External acquisition and provider transports |
| analysis/ | Bounded deterministic derivation |
| workers/ | Lease, I/O/analysis and atomic terminal persistence |

Search the owning domain, callers, types, configuration and tests before adding
another module. Routers do not acquire evidence during a read; connectors do not
own scoring or entitlement decisions; workers coordinate domain operations
rather than restating them. Business logic does not move into generic utilities
for convenience.

Python 3.12, async SQLAlchemy/asyncpg and Pydantic settings own the remaining
Python runtime; Node 26, Hono and Kysely own the native service and workers.
Compose names the API service web; the frontend's server-only proxy destination
is http://web:8000. Browser calls remain same-origin /api/v1.
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
Do not introduce Redis without measured need.

Backend schemas own the wire contract. Coordinate frontend schemas and API
clients when a DTO changes. [API errors](api-error-contract.md) owns coded
cross-stack error shapes; domain errors are translated at the HTTP boundary,
not leaked as provider bodies or secret-bearing diagnostics.
[Invariants](invariants.md) owns correctness, provenance and the single-baseline
migration policy. Setup and validation commands live in
[Development](DEVELOPMENT.md).

## Observability

Telemetry is optional and fails open. `app/core/telemetry.py` owns both the
structured-logging setup and the Pydantic Logfire wiring; nothing ships to
Logfire unless `LOGFIRE_ENABLED` is true AND `LOGFIRE_TOKEN` is set, and tests
stay local unless `LOGFIRE_ENABLED_IN_TESTS` is also set. A missing token,
missing SDK, or unavailable instrumentor degrades to the JSON stdout logs
alone — telemetry never fails an import, a test run, or a process start.

- Each runnable process configures Logfire once, under its own service name:
  `instrument_fastapi(app)` reports as `<LOGFIRE_SERVICE_NAME>-api`, and each
  worker's `instrument_worker("<role>")` reports as
  `<LOGFIRE_SERVICE_NAME>-<role>`. Compose hands every service the same
  environment block, so the role suffix has to come from the process entrypoint.
- Shared instrumentation per process: system metrics, HTTPX, SQLAlchemy (bound
  to the app engine), and a `LogfireLoggingHandler` added ALONGSIDE the
  structlog stdout handler. Database spans come from SQLAlchemy only; adding
  the asyncpg instrumentor on top would double every query span.
- HTTPX instrumentation records method, URL, status, and timing. Request and
  response bodies stay out of telemetry, so answer-engine prompts and
  completions are never shipped off-box (invariant 6).
- `LOGFIRE_BASE_URL` selects the region ingest endpoint; the write token lives
  in `.env` or the deployment secret store and is never committed.
