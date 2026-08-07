# CiteLadder invariants

> Review-blocking rules for the current Growth Intelligence architecture. A change that violates
> any rule fails review even when it appears to work.

## 1. One concept, one owner

Search before adding. Extend the owning model, service, config, queue, artifact, API, component, or
knowledge registry. Do not create a second crawler, page analysis, opportunity store, prompt
resource, content queue, knowledge graph, agent memory, or industry taxonomy.

## 2. Configuration and industry knowledge are data, not service literals

Thresholds, models, transports, limits, schemas, page roles, classifier signals, entity and
predicate registries, journey templates, question expectations, claim policies, context budgets,
and prompt/content archetypes live in `backend/app/core/config/*` or the canonical versioned
industry registry. Domain and worker code reads frozen configuration; it does not embed it.

## 3. Workspace authorization on every project-owned operation

All project-owned reads and writes verify active workspace membership and filter by
`workspace_id`. IDs alone are never authorization. Project data is not scoped by `user_id`.
All IDs are UUIDs. Billing ownership may use an account owner only through the explicit workspace
billing boundary.

## 4. Evidence is immutable and is not truth

Raw crawl, document, integration, answer-engine, generation, and external-source artifacts are
written once. Attempts and source observations are append-only. Persistence means “observed,” not
“approved.” Reruns produce new identities.

## 5. Every derived artifact has provenance and versions

Page understanding, knowledge assertions, relations, findings, scores, demand signals,
opportunities, briefs, prompts, content validation, verifications, and agent results reference
exact source IDs plus the relevant extractor, analyzer, pack, rule, formula, template, provider,
and model versions. A derived artifact without reproducible provenance is invalid.

## 6. Reports and reads are persisted projections

Read endpoints and report renderers never crawl, sync, call a model/provider, or silently repair
state. They render persisted evidence and projections. Missing evidence stays missing.

## 7. Unknown states remain distinct

`unknown`, `unavailable`, `not_applicable`, `historical`, `future`, `conflicting`, `excluded`,
`failed`, and observed zero have different meanings. Do not collapse them into zero, false,
neutral, current, or pass. Composite scores expose and renormalize for coverage.

## 8. Generic page kind and industry role are separate

`page_kind` is a stable cross-industry structural classification. `industry_role` is defined by a
frozen industry profile. No new industry extends the generic enum to encode its business roles,
and no industry gets a parallel page-analysis table.

## 9. Classification is deterministic-first and schema-independent

Code owns URL/media disposition, parsing, exact identifiers, dates, units, schema syntax,
deduplication, and configured signal scoring. Structured data is one signal and one expectation;
its absence cannot prevent visible-evidence classification. Model adjudication is bounded,
versioned, persisted, and never silently authoritative.

## 10. Customer knowledge never mutates shared industry knowledge

Project evidence, conversations, approvals, analytics, and model output stay tenant-scoped.
Generalized improvements enter a reviewed industry-registry release with version, migration notes,
fixtures, and tests. There is no automatic cross-customer training or pack mutation.

## 11. Durable memory requires explicit approval

Crawls and models may create working assertions or memory proposals. Only an audited user
save/approve transition creates Approved Memory. Rejection, withdrawal, effective dates, and
supersession are preserved. Raw chat and generated content are not brand truth.

## 12. Context is selected, bounded, frozen, and inspectable

Generative and agent tasks receive a task-specific `TaskContextPackage` after authorization and
structured eligibility. The package includes contradictions and limitations, enforces section and
total budgets, redacts secrets and prohibited data, records omissions, and freezes a manifest
hash before provider I/O. Embeddings are optional ranking projections, not truth or authorization.

## 13. Generated content cannot fabricate knowledge

Every draft is grounded in a frozen brief and context package. Unsupported, conflicting,
historical-as-current, regulated, numeric, price, fee, date, policy, safety, and identity claims
are validated. Generation never changes approved memory, scores, findings, prompts, or
publication state. A later crawl or integration observation verifies outcomes.

## 14. FAQ structured data mirrors visible reviewed content

`FAQPage` markup is never a substitute for visible questions and answers. Generate visible FAQ
content first, review it, then generate matching markup. Unknown or unsupported answers are
omitted or requested from the reviewer.

## 15. The Growth Agent is bounded orchestration

The agent uses an explicit task catalog and typed tools. Every tool call is separately authorized,
idempotent where required, bounded, versioned, and approval-classified. The agent has no arbitrary
SQL, unrestricted URL access, provider impersonation, private memory silo, autonomous recursion,
or external mutation without explicit approval.

## 16. Provider secrets and private evidence never leak

Credentials are encrypted at rest, resolved only by the owning connector, and excluded from DTOs,
logs, snapshots, context packages, and artifacts. Raw OAuth data and unrelated private evidence
are not sent to models. Measurement provider identity remains separate from analysis/generation
provider identity.

## 17. PostgreSQL queue leasing is authoritative

Workers claim with `FOR UPDATE SKIP LOCKED`, commit before network I/O, heartbeat leases, use
bounded retries, and reconcile expired work. Succeeded work is not re-executed under the same
identity. Cancellation is cooperative. Domain code depends on the queue protocol, not a concrete
future broker.

## 18. Active prompts and historical evidence are immutable in context

A prompt audit freezes prompt text, provider route, mode, versions, and other inputs. New demand
evidence proposes new candidates or priorities; it never rewrites an active historical audit.
Scheduled runs create new audit identities.

## 19. Same-origin and frontend contract rules remain mandatory

The browser calls relative `/api/*` through Next.js rewrites. Response contracts are validated,
unknown additive response fields are tolerated according to the current API policy, and every
ID remains a UUID. Frontend state never becomes a competing backend source of truth.

## 20. Archive is not authority

`docs/archive/` is excluded from implementation decisions and active-link validation. Historical
content must be restated in a current owner before it affects code. New docs must link to the
canonical document map rather than revive archived roadmaps.

## Operational gotchas

- Shell `POSTGRES_*` and `DATABASE_URL` values can override Docker Compose interpolation; use the
  documented `env -u ...` invocation in [`DEVELOPMENT.md`](DEVELOPMENT.md).
- Browser preview must use same-origin rewrites; `curl` does not reproduce duplicate-CORS browser
  failures.
