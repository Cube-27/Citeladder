# CiteLadder Knowledge Kernel and Industry Pack Specification

**Status:** implementation contract  
**Initial packs:** Education v1 and Commerce v1  
**First-customer fixture:** The Asian School  
**Architecture:** extend the existing modular monolith and Site Health pipeline; do not create a parallel crawler, agent store, or industry-specific product fork

## Purpose

This document converts the current growth-intelligence plans into implementable contracts for:

- the stable project-scoped knowledge kernel;
- immutable evidence, versioned working intelligence, and approved memory;
- executable, reviewed `IndustryPack` configuration;
- Education and Commerce role/entity/journey/rule definitions;
- selective context for content, prompts, reports, and the Growth Agent;
- migration from the current `SitePageAnalysis.page_type` and `BrandProfile` implementation.

Every conclusion must answer:

1. What source was observed?
2. What was derived, and by which version?
3. What is explicitly approved as durable project knowledge?
4. Which pack/version made the item relevant?
5. Which exact evidence was included or omitted from the task/report?

## Invariants

1. All IDs are UUIDs and all project-owned tables/queries are directly workspace-scoped.
2. Raw artifacts are immutable; attempts and approval transitions are append-only.
3. Every derived row carries source IDs and analyzer/rule/model versions.
4. Industry configuration lives under `app/core/config`; services do not hardcode roles, thresholds, schema expectations, prompt archetypes, or guardrails.
5. Reports and APIs render persisted projections and never silently re-fetch/recompute evidence.
6. Deterministic extraction/classification/rules run before optional model assistance.
7. Model output is a proposal or bounded adjudication artifact, never automatic approved truth.
8. `unknown`, `unavailable`, `historical`, `conflicting`, and `not_applicable` are distinct states.
9. Customer data never becomes shared pack truth.
10. The Growth Agent orchestrates typed tools and context packages; it is not a second datastore.

## Three layers

### Immutable evidence

Existing owners remain authoritative:

- `SiteFetchArtifact` for fetched site/document evidence;
- `RawResponseArtifact` for answer-engine evidence;
- `IntegrationImportArtifact` and persisted metric rows for integrations;
- append-only provider/generation attempts;
- persisted export/report artifacts when implemented.

Kernel rows reference source IDs and bounded locators; they do not duplicate raw bodies.

### Working intelligence

Versioned derived projections include:

- corpus disposition and temporal state;
- generic page kind and pack-specific industry role;
- page/document understanding and content/question units;
- entities, assertions, relations, contradictions, and unknowns;
- journey definitions and stage coverage;
- findings, opportunities, and grouped actions;
- demand signals, prompt candidates, content briefs, and context packages.

Recomputation produces a new version; it does not rewrite earlier evidence.

### Approved memory

Only explicit user action creates durable memory.

```text
proposed -> approved -> superseded
         -> rejected
approved -> withdrawn
```

Every transition records actor, timestamp, reason, source proposal, evidence, and replacement link when applicable.

## Stable contracts

### `KnowledgeSourceRef`

```json
{
  "source_kind": "site_fetch_artifact",
  "source_id": "uuid",
  "locator": {
    "url": "https://example.com/fees",
    "content_hash": "sha256",
    "page": 4,
    "section": "Fees",
    "start_offset": 100,
    "end_offset": 220
  }
}
```

- `source_kind` is config-owned.
- Locators are source-type-specific, bounded review aids.
- Source ID—not excerpt text—is the authority.

### `CorpusItem`

Represents every discovered owned knowledge surface, even when not deeply analyzed.

Required fields:

- `id`, `workspace_id`, `project_id`;
- `canonical_identity`, `url`, `media_type`, optional `content_hash`;
- `item_kind`: `html_page | document | image | video | feed | other`;
- `disposition`: `analyze | inventory_only | exclude`;
- disposition reason/evidence/version;
- `temporal_state`: `current | historical | future | unknown`;
- optional publication/effective dates;
- source observation/artifact IDs;
- timestamps.

A PDF may be excluded from the HTML analyzer, but it must not be excluded from corpus inventory.

### `PageUnderstanding`

One immutable understanding per source artifact and analyzer/pack version:

- source artifact and corpus item IDs;
- generic `page_kind`;
- pack-specific `industry_role`;
- frozen pack ID/version;
- classifier/analyzer versions;
- confidence, alternatives, conflicts, and signal evidence;
- purpose, audience, offerings, primary topics/entities;
- bounded summary, content units, and question units;
- related journey stages;
- temporal state, extraction coverage, and warnings.

`page_kind` answers what the generic page is; `industry_role` answers what job it performs in the active industry. They are separate enums.

### `KnowledgeEntity`

- project-scoped `entity_type` from core/active pack;
- canonical name, normalized identity key, aliases, and observed identifiers;
- status: `observed | approved | superseded | rejected`;
- evidence refs and versions;
- optional parent/container identity.

Deterministic identity keys and an explicit merge/review flow are required. Do not create an entity for every mention.

### `KnowledgeAssertion`

Typed subject–predicate–value claim:

- subject entity ID;
- predicate registry ID;
- typed value: string, number, boolean, date, money, duration, URL, entity reference, or structured object;
- scope/qualifiers, unit/currency, and effective dates;
- evidence refs;
- derivation method/version and confidence;
- review state;
- contradiction-group ID when applicable.

Rules:

- evidence is mandatory for observed/derived assertions;
- missing required facts are `unknown` gaps, not guessed assertions;
- historical evidence cannot replace approved current truth automatically;
- money requires currency plus exact product/program/grade/service/time scope.

### `KnowledgeRelation`

- registry relation type;
- source/target IDs and types;
- direction/cardinality/qualifiers/effective dates;
- evidence refs, versions, and review state.

Examples: campus `part_of` institution; program `offered_by` institution; variant `variant_of` product family; offer `applies_to` product.

### `ApprovedMemoryItem`

- typed entity/assertion/relation reference or strategy/guidance payload;
- scope: `project | entity | journey | content | prompt`;
- state and transition history;
- approval actor/time/reason;
- proposal/evidence refs;
- effective dates and supersession link;
- safe summary for context selection.

The existing `BrandProfile` remains a backward-compatible curated summary projection; it is not the long-term source of truth for typed memory.

### `JourneyDefinition` and immutable versions

- journey identity/name/pack;
- ordered stages and audiences;
- required questions/entities/content roles per stage;
- primary, secondary, and diagnostic outcomes;
- integration event candidates and compatibility state;
- reviewer/source metadata;
- version state: `draft | active | superseded`.

An absent compatible event is `unavailable`, never numeric zero.

### `IntelligenceSnapshot`

Immutable report input:

- source crawl/integration/audit IDs;
- frozen pack/analyzer/rule/formula versions;
- included/excluded corpus counts and reasons;
- entity/assertion/relation IDs;
- issue/opportunity/action IDs;
- coverage/warnings;
- created timestamp.

### `TaskContextPackage`

Frozen selective context for generation/agent tasks:

- task type/subject;
- active pack/version;
- included source/entity/assertion/relation/journey/demand/visibility IDs;
- approved-memory IDs;
- explicit omissions and reasons;
- size/token policy and truncation warnings;
- selection-policy version;
- provider-neutral rendered-context hash.

The context manifest must be inspectable before a cost-bearing or externally visible action.

## Industry registry and profile contract

The canonical executable authority is
[`../../backend/app/core/config/industry_packs/`](../../backend/app/core/config/industry_packs/).
Its exact registry, shared core, capabilities, taxonomy, source snapshot, schema, 16 versioned JSON
packs, fixtures, immutable loader, pure reference classifier, validator, tests, and benchmark have
been implemented. The earlier YAML planning definitions are superseded and the old
[`industry-packs/README.md`](industry-packs/README.md) is now a compatibility pointer only.

Every consumer must load an exact pack ID/version, verify its canonical content hash, and freeze
the catalog/pack/classifier manifest on each new crawl or immutable intelligence snapshot. The
library is available, but production Site Health does not yet select or persist an `industry_role`;
it remains generic until
[`codex-site-intelligence-wiring-handoff.md`](codex-site-intelligence-wiring-handoff.md) is executed.
No industry-specific production page-analysis claim is valid merely because the catalog files
exist.

The registry contains:

- one stable cross-industry core contract;
- reusable business-model modules such as lead generation, appointments, local presence,
  document-heavy compliance, catalog commerce, subscriptions, B2B sales, hospitality booking,
  publishing, events, membership, marketplaces, and multi-location networks;
- versioned industry profiles with compatibility, maturity, migration behavior, aliases, and
  module composition;
- page roles and deterministic classifier signals;
- entity/attribute/relation registries;
- assertion predicates and conflict policies;
- journey templates, stages, outcomes, and required questions;
- FAQ/question families and role-aware answer requirements;
- role-aware schema expectations and visible/schema parity fields;
- deterministic/model/hybrid analysis rules;
- report modules, action families, content/creative brief policies, and prompt archetypes;
- sanitized acceptance-fixture requirements.

### Composition, maturity, and versioning

Use exactly:

```text
core contract + reusable modules + one active industry profile + project-owned overrides
```

Avoid arbitrary multi-level inheritance. Project overrides are versioned and reviewable; they do
not mutate shared registry data.

Profile maturity gates behavior:

- `validated_candidate` currently applies to Education and Commerce. Their reviewed definitions
  and deterministic fixtures support controlled shadow evaluation, but authoritative findings
  still require representative field calibration and an explicit activation decision;
- `foundation` applies to the other 14 packs. These packs are structurally complete reusable
  starting points but cannot silently claim production-calibrated finding precision;
- taxonomy coverage without a canonical pack is not represented as an active pack or maturity
  stub.

- semantic-version the registry and each active profile;
- freeze exact profile ID/version plus registry/core/module versions onto crawls, snapshots,
  briefs, prompts, schedules, and context packages;
- bump the profile/rule/classifier version when behavior changes;
- declare whether old snapshots remain renderable and whether recomputation is recommended;
- never rewrite prior findings, audits, briefs, or task manifests during upgrade.

## Current repository mapping

| Current owner | Evolution |
|---|---|
| `SiteFetchArtifact` | Remains immutable site/document evidence owner |
| `SiteUrl`/observations | Identity/admission base for corpus-item projection |
| `SitePageAnalysis` | Extend; do not create a competing per-page analysis table |
| `SiteHealthSnapshot` | Keep as crawl projection; add intelligence snapshot only where lifecycle/scope differs |
| `BrandProfile` | Keep as curated summary/read model projected from approved memory during transition |
| `BrandProfileSuggestion` | Immutable proposal source; acceptance creates memory transitions and updates the summary projection |
| `Opportunity`/`OpportunitySnapshot` | Reuse for deterministic actions; add role/journey evidence instead of parallel recommendation storage |
| `Prompt`/`Topic` | Reuse for provisional/evidence-prioritized/active lifecycle |
| `ContentGeneration` | Keep basic generation; add FAQ-first `ContentBrief` and frozen context package before broad workflows |
| `backend/app/core/config/industry_packs/` | Canonical executable catalog, immutable loader, classifier, fixtures, validator, benchmark, audit, and extension/evaluation contracts |
| Integration/traffic/analytics models | Reuse persisted evidence and snapshots; reports never re-fetch |

### `SitePageAnalysis` compatibility migration

1. Add nullable `page_kind`.
2. Backfill `page_kind = page_type` for existing rows.
3. Add `industry_role`, `industry_pack_id`, `industry_pack_version`, and `industry_role_evidence`.
4. Add bounded `knowledge_summary` for initial extracted candidates/content units.
5. Update analyzers/DTOs to use `page_kind` and role separately.
6. Keep API `page_type` as a deprecated alias for one compatibility window.
7. Do not reinterpret historical `page_type` values under a new pack.

Per `Agents.md`, fold schema changes into `migrations/versions/0001_initial.py`; do not create a 0002 pre-launch migration.

### PDF admission correction

`backend/app/core/config/site_health.py` currently includes `.pdf` in `URL_HARD_EXCLUSION_EXTENSIONS`. Split policy:

- HTML page admission: PDF never enters the HTML analyzer;
- corpus inventory admission: supported documents are admitted as `item_kind=document`;
- document extraction admission: bounded and configurable for `analyze` items;
- `inventory_only`: retain identity/observations/disposition without extraction cost;
- genuinely unsafe/unsupported assets remain hard exclusions.

Create separate config for hard-excluded assets, inventory-supported document extensions, and analyzable document media types. Do not blindly remove `.pdf` from every guardrail.

## Persistence plan

### Phase A — prove the flow with current projections

- extend `SitePageAnalysis` as above;
- add corpus item/disposition and document temporal state;
- freeze pack snapshot on crawl/configuration/snapshot rows;
- add approved-memory item and transition rows;
- add journey definition/version rows;
- add task context package rows;
- add bounded `knowledge_summary` candidate payload per analyzed artifact.

### Phase B — normalize query-critical knowledge

When cross-page review/contradiction/approval/selective retrieval requires it, add:

- `knowledge_entities`;
- `knowledge_assertions`;
- `knowledge_relations`;
- `approved_memory_items`;
- `approved_memory_transitions`;
- `journey_definitions` and `journey_definition_versions`;
- `task_context_packages`;
- `content_briefs` and `intelligence_snapshots` only if their lifecycle differs from existing owners.

Every project-owned table has direct `workspace_id` and `project_id`, source IDs, versions, and timestamps. Use partial unique indexes only for live/current identities; preserve superseded history.

### Do not add

- a separate agent-memory store;
- `education_pages` or `commerce_pages` tables;
- another raw website artifact store;
- report-only recommendations detached from `Opportunity` and evidence;
- a vector database as canonical truth.

Embeddings may be disposable retrieval indexes over persisted IDs; they do not replace authorization, provenance, or approval state.

## Deterministic and model-assisted boundaries

### Deterministic first

- URL/media/disposition classification;
- generic page-kind and configured role signals;
- structured-data parsing and visible/schema parity;
- content/heading/question-unit extraction;
- exact identifiers, dates, prices, units, and internal links;
- journey role/question/outcome coverage;
- event compatibility and persisted metric joins;
- rule evaluation, priority formulas, coverage metrics;
- context-manifest assembly from selected IDs.

### Model-assisted proposals

- ambiguous industry-role adjudication;
- entity-merge suggestions;
- assertion candidates from complex prose/documents;
- current/historical adjudication when dates conflict;
- semantic question/gap clustering;
- opportunity explanations;
- briefs, drafts, and prompt candidates.

Every model artifact records provider/host/model, template version, frozen inputs, bounded raw output, validation result, and acceptance state.

## Contradiction policy

A contradiction exists when active assertions share subject, predicate, and overlapping scope/effective period but have incompatible normalized values.

1. preserve all evidence;
2. assign a contradiction group;
3. block automatic approval/publishing as current truth;
4. prefer no answer over an invented resolution;
5. let a reviewer approve one, narrow scope, mark historical, or reject both;
6. preserve transition reasons/source IDs.

Pack config defines predicate-specific compatibility, such as multiple campuses or tiered offers.

## Context selection

Select by task, not by dumping the knowledge base.

Order:

1. explicit subject/task scope;
2. relevant approved memory;
3. current assertions with strongest direct evidence;
4. relevant page/document understandings;
5. aligned demand/visibility observations;
6. required pack instructions/claim policy;
7. bounded supporting excerpts.

Always exclude unrelated pages/raw analytics rows, secrets, rejected/superseded memory unless reviewing history, unresolved conflicts from authoritative output, historical facts presented as current, and out-of-scope tenant data.

## API contract

Thin `/api/v1` routes delegate to new `domain/knowledge`, `domain/journeys`, and current owners.

```text
GET  /projects/{id}/knowledge/overview
GET  /projects/{id}/knowledge/entities
GET  /projects/{id}/knowledge/assertions
GET  /projects/{id}/knowledge/contradictions
GET  /projects/{id}/knowledge/memory
POST /projects/{id}/knowledge/memory/proposals/{proposal_id}/approve
POST /projects/{id}/knowledge/memory/{memory_id}/withdraw

GET   /projects/{id}/corpus
PATCH /projects/{id}/corpus/{corpus_item_id}/disposition
GET   /projects/{id}/pages/{site_url_id}/understanding

GET  /projects/{id}/journeys
POST /projects/{id}/journeys
POST /projects/{id}/journeys/{journey_id}/activate-version

GET /projects/{id}/intelligence-snapshots
GET /task-context-packages/{id}
```

All lists are paginated and expose coverage/truncation. Writes are workspace-authorized and idempotent where retries could duplicate transitions.

## UI contract

Extend Knowledge Base into separate review modes:

1. **Approved memory** — durable facts/guidance and transitions.
2. **Evidence review** — observed entities/assertions with persisted source previews.
3. **Contradictions and unknowns** — explicit review or missing-fact requests.
4. **Industry and journey** — active pack, role coverage, stages, outcomes, and event mappings.

Approved, proposed, historical, conflicting, unknown, and unavailable need distinct labels. “AI generated” is insufficient without model/template and source context.

## Report contract

A canonical growth-intelligence report includes:

- scope, methodology, pack/version, and evidence coverage;
- corpus/disposition and temporal-state breakdown;
- current knowledge, unknowns, and contradictions;
- role/question/journey coverage;
- grouped findings/opportunities/actions;
- content and prompt recommendations;
- demand/outcome coverage;
- aligned before/after observations;
- limitations and provenance appendix.

Every section distinguishes observed evidence, deterministic calculation, model/analyst interpretation, approved memory, and recommended action.

## Testing contract

### Unit

- pack schema/registry/reference validation;
- page-kind/role classifiers;
- document disposition/temporal rules;
- entity identity/assertion normalization;
- contradiction grouping;
- memory transitions;
- context inclusion/exclusion;
- unavailable-event semantics;
- pack upgrade/snapshot behavior.

### Component

- workspace isolation;
- crawl → understanding → snapshot persistence;
- PDF inventory without HTML analysis;
- proposal acceptance → approved memory + `BrandProfile` projection;
- report reads persisted projections only;
- frozen inspectable context package;
- superseded history remains queryable.

### Education fixtures

- admissions, fees, curriculum, disclosure, FAQ, event, leadership HTML;
- current prospectus PDF;
- historical fee PDF conflicting with current HTML;
- transfer-certificate/archive documents;
- unknown facts that remain unknown;
- visible/schema parity pass/fail.

### Commerce fixtures

- category, PDP, product family, variant, offer, comparison, and policy pages;
- inconsistent SKU/GTIN/price/availability;
- shipping/return-policy relationships;
- discontinued/out-of-stock temporal states;
- visible/schema parity pass/fail.

## Definition of done

- a crawl freezes Education v1 and inventories HTML plus PDFs;
- every analyzed artifact has generic kind and Education role evidence;
- entities/assertions/relations retain exact provenance;
- historical/current conflicts cannot auto-promote;
- reviewers can approve, supersede, reject, and withdraw memory;
- the admissions journey shows content and event coverage separately;
- a brief and prompt proposal use inspectable selective context;
- a recrawl creates a new snapshot without mutating the first;
- the report is reproducible with no provider call;
- Commerce v1 passes the same kernel contracts without industry-specific tables or branches.
