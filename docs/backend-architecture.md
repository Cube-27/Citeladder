# Backend architecture

FastAPI is a modular monolith with separate workers. PostgreSQL owns durable
state and queues. Domain behavior is documented in the feature owners listed in
[the documentation index](README.md); this file owns shared backend mechanics.

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

Python 3.12, async SQLAlchemy/asyncpg and Pydantic settings are the runtime base.
Compose names the API service web; the frontend's server-only proxy destination
is http://web:8000. Browser calls remain same-origin /api/v1.
Fernet-encrypted provider/OAuth secrets and least-privilege worker environments
keep credential custody separate from product projections.

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
source IDs and relevant versions. Product policy lives under app/core/config/.
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
