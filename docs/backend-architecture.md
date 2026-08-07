# CiteLadder backend architecture

> **Status:** current runtime authority and migration boundary
> **Shape:** FastAPI modular monolith plus separate workers
> **Durable state and queue:** PostgreSQL
> **Target product:** Site, Content, and Demand Intelligence orchestrated by the Growth Agent

The backend already contains valuable foundations built during the visibility-first phase. Those
foundations are retained where they have a clear owner and extended into the Growth Intelligence
architecture. The backend is not “the visibility slice”; Visibility is one mature subsystem inside
a broader evidence and knowledge platform.

## Runtime stack

- Python 3.12, FastAPI app factory, async SQLAlchemy and asyncpg.
- Pydantic settings and DTOs; all operational and product policy under `app/core/config/*`.
- PostgreSQL for product data, immutable evidence, projections, and durable task queues.
- Separate workers for audits, Site Health, content, integrations, analytics, and future agent work.
- Fernet-encrypted provider/OAuth secrets with least-privilege worker environments.
- Thin routers under `/api/v1`; domain services own business rules.

## Architectural layers

```text
api/          HTTP translation, dependencies, coded errors
core/         configuration, database, security, telemetry
models/       SQLAlchemy persistence
schemas/      shared DTOs where applicable
domain/       canonical business owners
connectors/   external acquisition/provider boundaries
orchestration/shared queue mechanics
analysis/     deterministic and bounded derived projections
workers/      lease -> I/O/analysis -> atomic terminal write
```

A new capability goes into the existing owner or a deliberately named new domain. Convenience is
not a reason to put business logic in routers, connectors, workers, or generic utility modules.

## Current subsystem map

| Subsystem | Current state | Growth Intelligence role |
|---|---|---|
| Auth/workspaces/projects | Shipped | Tenant and project boundary |
| Brand identity/profile | Shipped/partial | Transitional curated summary; evolves into approved typed memory |
| Site Health | Shipped | Acquisition and deterministic foundation for Site Intelligence |
| Content generation | Basic v1 shipped | Retained queue/result owner; extended with strategy, briefs, FAQ-first workflows, review, and verification |
| Integrations/Traffic/Analytics | Shipped | Persisted source evidence and projections for Demand Intelligence |
| Prompts/Audits/Visibility | Shipped | Reviewed prompt resources and answer-engine measurement loop inside Demand Intelligence |
| Opportunities | Shipped | One action store and supersede-not-mutate history across all intelligence systems |
| Commerce catalog/product analysis | Shipped/partial | Specialized identity source consumed by the shared Commerce industry profile |
| Knowledge domain | Planned | Entities, assertions, relations, contradictions, approved memory, and selective retrieval |
| Growth Agent domain | Planned | Task runs, typed tools, context packages, approvals, and conversations |

## Canonical data layers

### Evidence

Existing immutable owners remain authoritative: site fetch artifacts and attempts, integration
import artifacts and normalized metric rows, answer-engine raw artifacts and analyses, and content
provider attempts. New document extractors and creative generators use the same append-only model.

### Working projections

Current `SitePageAnalysis`, snapshots, metrics, opportunities, traffic/analytics snapshots, prompt
generation evidence, and content outputs are extended rather than duplicated. New projections
carry direct source IDs and all relevant pack/analyzer/rule/formula/model versions.

### Approved memory

`BrandProfile` remains a compatibility summary. The target knowledge owner stores typed approved
items and transition history. Crawls and models create proposals; only an explicit user transition
promotes durable memory.

## Site Intelligence migration

- Keep `connectors/web_evidence` as the only site acquisition boundary.
- Reuse Site Health crawl, URL, task, attempt, artifact, evaluation, issue, snapshot, and export
  owners.
- Separate corpus inventory admission from HTML analysis admission so supported documents such as
  PDFs can be inventoried and selectively extracted.
- Split `SitePageAnalysis.page_type` into generic `page_kind` and pack-specific `industry_role`.
- Freeze industry registry/version and classifier evidence on the crawl and derived rows.
- Add typed knowledge only when cross-page query, contradiction, approval, or context selection
  cannot be represented cleanly by current projections.

## Content Intelligence migration

`ContentGeneration` and `ContentGenerationAttempt` remain the queue/result owners. Add, in order:

1. persisted content inventory and strategy snapshot;
2. immutable `ContentBrief`;
3. frozen `TaskContextPackage`;
4. FAQ-first skill and validation;
5. mutable review revision with append-only transitions;
6. publication claim separate from publication observation;
7. recrawl, demand, and visibility verification.

Generated bodies never become knowledge automatically and never mutate earlier output.

## Demand Intelligence migration

Integration imports stay provider-specific evidence. Demand Intelligence creates normalized,
time-bounded observations and `DemandSignal` projections over GSC, GA4, Site, Content, and
Visibility sources. Page identity and event/journey configuration must be correct before signal
or conversion interpretation.

Prompt resources retain proposed/active/archived lifecycle. Generated candidates carry source
signal/knowledge/context provenance and require review before activation. Scheduled Visibility
runs create new immutable audits through the existing queue.

## Growth Agent migration

The agent does not call arbitrary internal URLs or query the database directly. A typed tool
registry wraps domain services. Every substantial task persists:

- task type, scope, policy version, and approvals;
- frozen context package;
- bounded plan and steps;
- provider/model/capability versions;
- tool inputs, bounded outputs, retries, errors, and result artifact IDs.

Long-running tool calls return task IDs and converge through persisted state; no database
transaction or model turn remains open while a crawl, sync, audit, or generation executes.

## Task queue contract

All queue implementations follow the shared PostgreSQL lease rules:

1. select eligible rows in deterministic priority order;
2. lock using `FOR UPDATE SKIP LOCKED`;
3. set lease owner and expiry;
4. commit before external I/O;
5. heartbeat while active;
6. write append-only attempts and one atomic terminal result;
7. release expired work to bounded retry or terminal failure;
8. create a new identity for explicit reruns.

Queue specifications and limits are config-owned. Redis may later accelerate coordination but
never replaces canonical PostgreSQL task state.

## API rules

- All routes are `/api/v1` and workspace-authorized.
- Read routes project persisted data only.
- Mutations that can be retried use idempotency keys and coded errors.
- Lists are bounded and paginated; coverage/truncation are explicit.
- DTOs never expose secrets, raw unbounded bodies, or unrelated private evidence.
- The canonical error envelope is documented in [`api-error-contract.md`](api-error-contract.md).

## Provider boundaries

Answer-engine measurement adapters execute and normalize only; deterministic analysis owns
visibility metrics. Analysis/generation models use a separate provider-neutral gateway and can
access only a frozen context package. Exact active routes and models are owned by runtime config,
not this document.

## Persistence rules

- UUID primary keys and direct workspace/project scope for project-owned rows.
- Immutable artifacts and append-only attempts/transitions.
- Source IDs and versions on every derived row.
- Greenfield schema changes remain in `migrations/versions/0001_initial.py` while that repository
  policy is active; verify against a disposable database.
- JSONB is appropriate for bounded provider/source payloads and frozen manifests, not for data
  that requires relational filtering, identity, integrity, or approval transitions.

## Verification

Every implementation slice includes pure deterministic tests, component persistence and
workspace-isolation tests, fake-provider tests, reproducible fixtures, API contract tests, and
focused lint/migration checks. Live sites, live Google properties, and live models are opt-in
acceptance sources, never CI dependencies.

Detailed visibility-era runtime notes are archived under `archive/architecture/` and
`archive/subsystems/`; inspect code rather than treating those files as current authority.
