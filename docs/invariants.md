# CiteLadder invariants

> Review-blocking rules. A change that violates one fails review even if it
> appears to work. Behaviour and mechanics live in the feature owners in
> [the documentation index](README.md); repeated failures and their checks are
> in [engineering guidelines](engineering-guidelines.md).

## 1. One concept, one owner

Search before adding. Extend the owning model, service, config, queue, artifact,
API, or component. Do not create a second crawler, page analysis, opportunity
store, prompt resource, content queue, or memory store.
`SitePageAnalysis` is the only page-understanding owner.

A route family, task kind or table has exactly one TypeScript application writer.
The SQL baseline defines tables and never writes application rows. The
route-ownership manifest (`services/api/scripts/check-route-ownership.ts`) lists
every route family once, the table-writer allowlist (`scripts/table-writers.mjs`)
records each table's writers and may only tighten, and the kind registry in
`services/api/src/workers/analytics-kinds.ts` owns task execution, compensation
and lease.

### Replacement and retirement

Before replacing, redesigning, consolidating or retiring behavior, inventory
its routes, symbols, schemas, callers, tasks, flags, tests, fixtures, navigation
and active documentation. Choose an atomic cutover or a behavior-preserving
seam followed by cutover; keep one read/write authority throughout.

Update every caller and delete superseded implementations, contracts, tests,
fixtures and flags. Update or retire obsolete active instructions; preserve
historical evidence deliberately, not as a second active specification.
Search for old names afterward and inspect the changed/deleted paths. A
replacement diff with no deletions merits re-checking, not automatic rejection.

A compatibility bridge needs a current external contract, an identified caller,
a focused test and a concrete deletion condition recorded in the change review.
Do not relax repository gates to accommodate a split.

## 2. Product policy is configuration

Thresholds, transports, limits, schemas, page kinds, classifier signals,
checklist membership, AEO pillar weights, rule applicability, context budgets,
models and templates live under `frontend/services/api/src/config/` or the
owning frontend config. Services and workers do not embed alternate policy.
A public check has at most one AEO pillar and equal weight within it; rule count
and page-kind cohort size cannot manufacture score influence. The SQL baseline
carries only structural defaults and constraints; native writes supply
policy-dependent values explicitly.

## 3. Workspace authorization is mandatory

Every project-owned read and write verifies active workspace membership and
filters by `workspace_id`. IDs alone are never authorization. Product data is
not scoped by `user_id`. IDs are UUIDs. A project-owned table carries
`workspace_id`, and its key to the project (or to the owning parent) names
both, so PostgreSQL refuses a row whose project belongs to another workspace.

## 4. Evidence is immutable and is not truth

Raw crawl, integration, answer-engine, generation, and external-source
artifacts are written once. Attempts and observations are append-only.
Persistence means observed, not automatically true.

## 5. Derived artifacts record provenance

Analyses, rule evaluations, scores, demand signals, opportunities, briefs,
prompts, validations, verifications, and agent results reference exact source
IDs and every relevant extractor, classifier, analyzer, rule, scoring, formula,
template, provider, and model version.

Until customers exist, every processing base version stays at 1 (a derived
suffix such as the classifier's input digest still changes with its inputs): a
semantic change does not bump it, because pre-launch data is not compared across
versions. Once customers exist, a semantic change bumps the affected version
once per release, so results from before and after are never compared as like
for like, and production data is never reset to avoid a bump. Resetting an
existing database requires explicit authorization and confirmation that it is
disposable development data; never reset shared, staging or production
environments.

## 6. Reads are persisted projections

Read endpoints never crawl, sync, classify, score, call a model/provider, or
silently repair state. Missing evidence stays missing.

Site Health active summaries publish provisional scores from analyzed pages,
marked as a partial audit. One leased terminalization owner (the crawl's
`finalize` task) appends the final page analysis revisions in short replay-safe
batches, then persists the issue currency, terminal score summary, snapshot and
status in one final commit ([Site Health](site-health.md)). Classification
coverage, checklist completion, scored-page coverage and crawl coverage are
distinct persisted facts.

Measurement comparison requires compatible persisted classification and
scored-page-kind composition provenance. A changed kind set, or a kind share
moved by at least the configured threshold, is comparable only with the
composition-change reason and both compositions; smaller drift is plainly
comparable; a missing projection or incompatible scope/version is
non-comparable.

## 7. Unknown states remain distinct

`unknown`, `unavailable`, `not_applicable`, `historical`, `future`,
`conflicting`, `excluded`, `failed`, and observed zero are different states.
Never collapse them into zero, false, current, neutral, or pass.

## 8. Page kind drives page-specific analysis

`page_kind` is a stable structural classification. Structured data is only one
signal and cannot self-certify the type whose primary-entity schema contract is
being checked. Successful acquisition durably records `classification_expected`
for selected, non-excluded supported HTML before page-understanding work begins;
terminal `other` and post-assignment page-understanding failure remain separate
counts under the same denominator.

`other` is classification abstention, not an inferred `WebPage`. Page kind
governs rule applicability, not score eligibility: independently applicable
Web and AEO checks can score any kind. Evaluator absence is unresolved
evidence, never `not_applicable`.

AEO checkpoint outcomes are exactly `satisfied`, `partial`, `missing`,
`unknown`, `not_applicable`, or `error`; unavailable, ambiguous and conflicting
evidence are bounded reasons under `unknown`. Public scoring is binary: only
`satisfied` and `missing` are determinate, `partial` earns no credit, and
unresolved checks stay in coverage and keep page, pillar and crawl measurement
partial even when a score exists.

A check moves a score only when failing it affects crawlability, indexing,
AI-answer eligibility or page performance, and every scored check surfaces as a
visible finding; a hidden diagnostic is never scored. The catalog's
`score_roles` is the single source of membership. A purpose penalty needs
page-owned evidence of that purpose, never the URL or title alone. Site-scoped
checks apply to every page of the crawl, and each final page manifest names the
site evaluations it used.

## 9. Deterministic code owns measurable facts

Code owns URL/media disposition, parsing, exact identifiers, dates, units,
schema syntax, configured signal scoring, validation, and lifecycle state.
Models may explain, generate, plan, or adjudicate explicitly bounded ambiguity.
Every model judgement records confidence, model, and template version.

## 10. Automation stays bounded

Site Health acquisition begins only from an explicit user **Run new crawl**
decision, or a crawl schedule the person turned on, admitted the same way. Its
discovery and deterministic analysis phases then progress automatically, but
analysis admission stays bounded by the frozen entitlement/runtime allowance.
Other configured classification, opportunity creation, demand imports, prompt
generation and scheduled measurement may run automatically.

Explicit user decisions are required for content save/publish claims, external
mutations, prompt activation, billing changes, declaring an Opportunity
implemented, and any durable-memory promotion. Later verification is a bounded
observation over persisted evidence, never a causal claim or an inferred
workflow status.

A write through a public API key is an explicit user decision when the key holds
the matching scope and its Owner or Admin creator's current role allows it
([Public API](public-api.md)). A write through MCP is one when the grant holds
`citeladder:write`, the member's live role allows it, and the change is a
bounded direct edit or was confirmed through `confirm_change` against its
preview; the in-app Agent stays read-only ([MCP](mcp.md#changes)).

## 11. Context is selected and inspectable

Generative and agent tasks receive an authorized, task-specific bounded context
package that records included sources, omissions, limitations, budgets, and a
frozen manifest before provider I/O. Embeddings rank evidence; they are not
truth or authorization.

## 12. Generated content cannot fabricate facts

Generative paths constrain factual claims to the context actually supplied. A
provider does not choose its citations: the sources shown are the records the
run actually read, and generated content never becomes a fact automatically.
Each Agent run freezes one versioned context manifest before its first model
call; crawl text stays untrusted observation, and one shared operating contract
forbids invented company, product, customer, price, policy, statistic and
competitor facts. A turn's sources are the records its executed reads supplied,
plus the attached or mentioned Actions, never records a size bound dropped. A
fact from a web search is attributed to its page and shown as a web source,
never as a CiteLadder record. The output remains a reviewable deliverable, and
the UI labels the context actually used. Where structured data mirrors visible
content (such as `FAQPage`), markup is generated from reviewed visible content.

## 13. The Agent is bounded orchestration

The Agent uses the shared registered read tools on a server-pinned project and
config-owned budgets frozen per run (model calls, tool calls, parallel reads,
result size, time). Every call is authorized as the chat member, bounded,
versioned, and idempotent where required. The Agent has no write tool,
arbitrary SQL, unrestricted URL access, provider impersonation, private data
store, autonomous recursion, or unapproved external mutation. Its one reach
outside CiteLadder data is the provider's hosted web search, within a
config-owned per-turn budget that each call's funding hold covers; the Agent
never fetches, submits to or changes a page it found. Persisted run transcripts
are run records replayed to the model, never a knowledge store: no read returns
them and they are never shown. Generating an output never declares
implementation or claims an improvement without new measured evidence.

## 14. Secrets and private evidence do not leak

Credentials are encrypted at rest, resolved only by the owning connector, and
excluded from DTOs, logs, snapshots, context packages, and artifacts. Provider
identity for measurement stays separate from analysis and generation provider
identity.

## 15. PostgreSQL is the durable queue

Workers claim with `FOR UPDATE SKIP LOCKED`, commit before network I/O,
heartbeat leases, and terminalize atomically and idempotently. Do not add Redis
without measured need.

## 16. Billing authority and evidence are append-only

A published persisted catalog is the only commercial runtime authority. Catalog
recovery is forward-publication of a new immutable revision; accepted
subscription/period terms never follow the current catalog retroactively.
Checkout, the no-card campaign and card trial are separate controls and never
imply one another; billing stays operational but hidden ([decisions](decisions.md)).

Entitlement resolution selects one primary profile and deliberate supplements.
Grants, revocations, consumable reservations/releases/debits/refunds, normalized
payment/refund receipts, model attempts, and introductory claims are immutable
evidence. Redirects, checkout callbacks, receipts, webhook delivery or provider
Dashboard state alone never grant access; webhook and reconciliation settle
through the same idempotent activation owner. A workspace's own provider keys
(BYOK) consume no platform credits and never silently fall back to platform
keys. Every platform model call spends AI credits at the serving model's
configured token price and is refused without one; the sole exception is the
local development login's unmetered `development` Agent funding, which still
records every model attempt. The [billing decision log](billing-decisions.md)
records each rule's owner decision.

Every trusted billing mutation is explicit-target, active-admin authorized,
reasoned, idempotent, dry-run reviewed, and redacted. Operators correct by
append-only grant/revocation/refund evidence or catalog forward-publication,
never by mutating historical rows.

## 17. Schema changes are forward migrations

The schema is `frontend/services/api/migrations/0001_baseline.sql` followed by
numbered forward migrations (`0002_<name>.sql`, …, no gaps). Every schema change
is a new file that applies cleanly to the existing production schema and rows;
an applied file, the baseline included, never changes, and production never
needs a reset to take a schema change. The only exceptions are owner-authorized
baseline refolds with an owner-run reset ([decisions](decisions.md#platform-and-schema)). The migrate CLI (`pnpm migrate`) applies
pending files in order in one transaction under an advisory lock and records each
SHA-256 in `schema_migrations`; a changed applied file, a recorded version the
release lacks, a skipped version or unledgered tables fail the migrate job.
Verify from an empty disposable database with `pnpm migrate` and
`pnpm db:types:check`.

The migration files are the only schema author: services hold generated Kysely
types and no other DDL. Only the migrate job connects as the schema owner;
services connect as the least-privilege `citeladder_app` role, and a migration
adding an append-only evidence, attempt or ledger table revokes UPDATE and
DELETE on it from that role, or, when the code row-locks it, DELETE plus the
`refuse_app_role_update` trigger (invariants 4 and 16).

## 18. Input and extraction boundaries

- Normalize and reject blank text at the request-schema boundary; bound headers
  and query values to their persisted limits; reject malformed UTF-8 uploads
  instead of replacing bytes silently.
- Treat third-party numbers as untrusted: reject booleans, non-finite values,
  overflow, and ambiguous currency notation rather than publishing a guess.
- Preserve parser sanitization order where it affects observed text: closed
  non-text subtrees, then comments, then unterminated subtrees. Bind extracted
  facts through the page role's primary entity and identity key.
- Scope mutation status to the active workspace/project. Global visual rules
  belong to `frontend/apps/app/src/globals.css`, and each rendered page has one `h1`.
- Billing webhook conflicts follow the owning idempotent settlement contract
  rather than leaking an unhandled 500.
