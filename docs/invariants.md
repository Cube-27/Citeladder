# CiteLadder invariants

> Review-blocking rules. A change that violates one fails review even if it
> appears to work.

## 1. One concept, one owner

Search before adding. Extend the owning model, service, config, queue, artifact,
API, or component. Do not create a second crawler, page analysis, opportunity
store, prompt resource, content queue, or memory store.

`SitePageAnalysis` is the only page-understanding owner.

## 2. Product policy is configuration

Thresholds, transports, limits, schemas, page kinds, classifier signals,
public checklist membership, AEO pillar weights, rule applicability, context
budgets, models, and templates live under
`backend/app/core/config/*` or the owning frontend config. Services and workers
do not embed alternate policy. A public check has at most one AEO pillar and
equal weight within that pillar. Rule count and page-kind cohort size cannot
manufacture score influence.

## 3. Workspace authorization is mandatory

Every project-owned read and write verifies active workspace membership and
filters by `workspace_id`. IDs alone are never authorization. Product data is
not scoped by `user_id`. IDs are UUIDs.

## 4. Evidence is immutable and is not truth

Raw crawl, integration, answer-engine, generation, and external-source
artifacts are written once. Attempts and observations are append-only.
Persistence means observed, not automatically true.

## 5. Derived artifacts record provenance

Analyses, rule evaluations, scores, demand signals, opportunities, briefs,
prompts, validations, verifications, and agent results reference exact source
IDs and every relevant extractor, classifier, analyzer, rule, scoring, formula,
template, provider, and model version. During disposable pre-launch
development, active semantic versions remain `1`; semantic changes use a fresh
disposable database instead of preserving cross-version history. Resetting an
existing database requires explicit authorization and confirmation that it is
disposable pre-launch development data. Never reset non-disposable, shared,
staging or production environments under this policy.

## 6. Reads are persisted projections

Read endpoints never crawl, sync, classify, score, call a model/provider, or
silently repair state. Missing evidence stays missing.

Site Health active summaries publish progress and completion counts without
numeric scores. One locked terminalization owner appends the final current page
analysis revisions and atomically persists the terminal score summary and
snapshot. Classification coverage, checklist completion, scored-page coverage,
and crawl coverage are distinct persisted facts with exact provenance.

Measurement comparison requires compatible persisted classification and scored
page-kind composition provenance. A changed kind set or count by kind remains
comparable only with the bounded composition-change reason and both
compositions; missing projection or incompatible scope/version is
non-comparable.

## 7. Unknown states remain distinct

`unknown`, `unavailable`, `not_applicable`, `historical`, `future`,
`conflicting`, `excluded`, `failed`, and observed zero are different states.
Never collapse them into zero, false, current, neutral, or pass.

## 8. Page kind drives page-specific analysis

`page_kind` is a stable structural classification. Structured data is only one
signal and cannot self-certify the type whose primary-entity schema contract is
being checked.

Successful acquisition durably records `classification_expected` for selected,
non-excluded supported HTML before page-understanding work begins. Terminal
`other` and post-assignment page-understanding failure remain separate counts
under the same denominator.

`other` is classification abstention, not an inferred `WebPage`. It retains
all independently applicable Web checks but has a null page-purpose AEO score
and coverage with reason `page_purpose_unresolved`. Unsupported classified
purposes use reason `unsupported_purpose_checklist`; evaluator absence is never
reported as `not_applicable`.

AEO checkpoint outcomes are exactly `satisfied`, `partial`, `missing`,
`unknown`, `not_applicable`, or `error`. Unavailable, ambiguous, and conflicting
evidence remain bounded reasons under `unknown`, not additional AEO outcomes.
Content-reading expectations on a JS shell preserve this distinction while the
rendering diagnostic owns the observable delivery limitation. Public scoring is
binary: only `satisfied` and `missing` are determinate; `partial` earns no credit.

## 9. Deterministic code owns measurable facts

Code owns URL/media disposition, parsing, exact identifiers, dates, units,
schema syntax, configured signal scoring, validation, and lifecycle state.
Models may explain, generate, plan, or adjudicate explicitly bounded ambiguity.
Every model judgement records confidence, model, and template version.

## 10. Automation stays bounded

Site Health acquisition begins only from an explicit user **Run new crawl**
decision. Its durable discovery and deterministic analysis phases may then
progress automatically, but analysis admission remains bounded by the frozen
entitlement/runtime allowance. Other configured classification, opportunity
creation, demand imports, prompt generation, and scheduled measurement may run
automatically. Explicit user decisions are required for content save/publish
claims, external mutations, prompt activation, billing changes, and any future
durable-memory promotion. Declaring an Opportunity implemented is also an
explicit user action. Later verification is a bounded observation over
persisted evidence and never a causal claim or an inferred workflow status.

## 11. Context is selected and inspectable

Generative and agent tasks receive an authorized, task-specific bounded context
package. It records included sources, omissions, limitations, budgets, and a
frozen manifest before provider I/O. Embeddings rank evidence; they are not
truth or authorization.

## 12. Generated content cannot fabricate facts

Generative paths constrain factual claims to the context actually supplied. A
provider cannot cite an absent artifact, and generated content never becomes a
fact automatically.

Content generation freezes one versioned `ContentContext` from authorized
durable brand memory, optional target/origin evidence, and bounded persisted
crawl fragments. Crawl text stays untrusted observation. One fixed system
instruction forbids invented company, product, customer, price, policy,
statistic, and competitor facts; there is no second model call or deterministic
claim-validator layer. The output remains a reviewable draft, and the UI labels
the context actually used.

Where structured data mirrors visible content, such as `FAQPage`, markup is
generated from reviewed visible content rather than substituted for it.

## 13. The Growth Agent is bounded orchestration

The agent uses a config-owned task catalog and typed domain tools. Every call is
authorized, bounded, versioned, and idempotent where required. The agent has no
arbitrary SQL, unrestricted URL access, provider impersonation, private data
store, autonomous recursion, or unapproved external mutation.

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
Checkout, the no-card campaign, and card trial are separate controls and must
never imply one another. Checkout and the seeded no-card campaign default to
disabled; card trial remains unavailable until a separately implemented and
verified provider flow exists.

Entitlement resolution selects one primary profile and deliberate supplements.
Grants, revocations, consumable reservations/releases/debits/refunds, normalized
payment/refund receipts, model attempts, and introductory claims are immutable
evidence. Redirects, Payment Links, receipts, webhook delivery, or provider
Dashboard state alone never grant access; webhook and reconciliation must settle
through the same idempotent activation owner. Customer BYOK consumes zero
platform credits and never silently falls back. Platform-funded model work is
unavailable without an explicit persisted finite rate/cap policy and allowance.

Every trusted billing mutation is explicit-target, active-admin authorized,
reasoned, idempotent, dry-run reviewed, and redacted. Operators correct by
append-only grant/revocation/refund evidence or catalog forward-publication,
never ad-hoc mutation of historical rows.

## 17. The migration baseline remains singular

Before launch, schema changes are folded into
`migrations/versions/0001_initial.py`. Verify from an empty disposable database
with `alembic upgrade head` and `alembic check`; do not add `0002+` without an
explicit policy change. All active development semantic versions remain `1`
under the same reset policy.

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
  belong to `frontend/app/globals.css`, and each rendered page has one `h1`.
- Billing webhook conflicts must follow the owning idempotent settlement
  contract rather than leaking an unhandled 500. Framework-required packages,
  annotations, and CLI entry points count as dependency use even without a
  direct import.

Feature explanations and source entry points live in the canonical owners in
[the documentation index](README.md). These constraints apply at the affected
boundary; they are not a second feature implementation specification.
