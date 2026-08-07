# Codex Handoff — Knowledge Kernel, Education v1, and Commerce v1

**Read first:** `Agents.md`  
**Canonical plans:**

- `docs/plans/growth-intelligence-platform.md`
- `docs/plans/site-intelligence-primary-product.md`
- `docs/plans/content-intelligence.md`
- `docs/plans/demand-intelligence.md`
- `docs/plans/growth-agent.md`
- `docs/plans/knowledge-kernel-and-industry-pack-spec.md`
- `docs/audits/the-asian-school-growth-intelligence-report-2026-08-05.md`

**Executable pack definitions and validator:**

- `docs/plans/industry-packs/industry-pack.schema.json`
- `docs/plans/industry-packs/education-v1.yaml`
- `docs/plans/industry-packs/commerce-v1.yaml`
- `docs/plans/industry-packs/validate_packs.py`

## Objective

Implement the smallest vertical slice that proves CiteLadder can turn a PDF-heavy school website into:

1. immutable corpus evidence;
2. generic page/document kind plus Education role;
3. typed, sourced knowledge candidates;
4. explicit current/historical/conflicting/unknown state;
5. reviewed approved memory;
6. an admissions journey with content and outcome coverage;
7. an inspectable context package for one content brief and one prompt proposal;
8. a reproducible report/snapshot;
9. the same kernel contracts reused by Commerce v1.

Do not implement a second crawler, separate agent memory, industry-specific persistence tables, or report-time recomputation.

## Repository safety

The worktree already contains unrelated plan edits/untracked plan files. Preserve them. Before each slice:

```bash
git status --short
git diff -- <paths you own>
```

Do not restore, stage, rewrite, or format unrelated paths. Keep implementation commits slice-specific. Per repository policy, fold schema changes into `migrations/versions/0001_initial.py`; do not add a 0002 migration before launch.

## Required architectural decisions

- Reuse `SiteFetchArtifact`, `SiteUrl`, `SitePageAnalysis`, `SiteHealthSnapshot`, `BrandProfile`, `BrandProfileSuggestion`, `Opportunity`, `Prompt`, `Topic`, integration evidence, and the Postgres queue.
- Add direct `workspace_id` and `project_id` to every new project-owned table.
- Freeze pack ID/version on every crawl/snapshot/brief/prompt/context package.
- Keep deterministic extraction/rules ahead of model assistance.
- Persist every model proposal with exact model/template/frozen-input identity.
- Reports read persisted projections only.
- Missing compatible outcomes are `unavailable`, never zero.

## Suggested implementation slices

### S0 — Pack loader and validation

**Goal:** make pack configuration executable, versioned, and testable without touching crawl behavior.

Suggested ownership:

```text
backend/app/core/config/industry_packs/
  __init__.py
  contracts.py
  loader.py
  registry.py
  education_v1.yaml
  commerce_v1.yaml
backend/tests/unit/test_industry_pack_loader.py
```

Tasks:

1. Define typed, frozen Pydantic/dataclass contracts matching the JSON Schema.
2. Validate duplicate IDs and cross-references:
   - role → journey stage;
   - stage → role/question/outcome;
   - relation/predicate → entity types;
   - schema/brief/prompt → role/stage;
   - fixtures have unique IDs.
3. Load only reviewed packs into the active registry; draft/deprecated packs remain inspectable but not auto-selectable.
4. Expose `get_pack(pack_id, version)` with no implicit fallback.
5. Add a registry version and content hash.
6. Add unit tests for invalid references, duplicate IDs, unsupported version, and deterministic content hash.

Acceptance:

- Education and Commerce files validate at import/test time.
- No service code embeds pack roles or thresholds.
- Loading a pack performs no database/network I/O.

### S1 — Corpus inventory and PDF policy split

**Goal:** retain PDFs/documents in Site Intelligence without sending them to the HTML analyzer.

Current blocker: `.pdf` is in `URL_HARD_EXCLUSION_EXTENSIONS` in `backend/app/core/config/site_health.py`.

Tasks:

1. Split config into:
   - hard-dangerous/unsupported asset exclusions;
   - inventory-supported document extensions/media types;
   - analyzable document extensions/media types;
   - HTML-analyzable media types.
2. Add or project `CorpusItem` fields:
   - `item_kind`, `media_type`, `disposition`, reason/version/evidence;
   - `temporal_state`, optional dates;
   - source observation/artifact IDs.
3. Ensure discovery admits supported documents to inventory.
4. Ensure no PDF creates an HTML analyze task.
5. Add bounded document-extraction task plumbing only for `analyze`; `inventory_only` must remain cheap.
6. Freeze document policy version in crawl configuration.
7. Add component tests using a small HTML→PDF fixture.

Acceptance:

- the Asian School fixture retains all expected PDF identities;
- PDFs never enter `analysis/site_health/parser.py`;
- inventory-only documents create no extraction/provider cost;
- unsafe/non-supported assets remain excluded.

### S2 — Generic page kind plus industry role

**Goal:** preserve current page classification while adding pack-specific meaning.

Modify `SitePageAnalysis` safely:

- add `page_kind`, initially nullable;
- backfill from existing `page_type` in baseline migration/setup;
- add `industry_role`, `industry_pack_id`, `industry_pack_version`, `industry_role_evidence`;
- add bounded `knowledge_summary` for first-slice candidates/content/question units;
- keep `page_type` as a deprecated compatibility alias for one window.

Suggested ownership:

```text
backend/app/analysis/site_health/industry_roles.py
backend/app/domain/site_health/service/...
backend/app/core/config/industry_packs/...
backend/tests/unit/test_industry_role_classifier.py
backend/tests/component/test_site_understanding.py
```

Classifier requirements:

- pure/deterministic;
- fixed signal order/weights from pack config;
- bounded evidence, alternatives, conflicts, confidence;
- no LLM in the deterministic classifier;
- a model adjudication may create a separate immutable proposal when configured confidence is insufficient;
- historical rows retain their frozen classifier/pack version.

Acceptance:

- admissions, fees, curriculum, disclosure, FAQ, events, contact, and archive fixtures get expected Education roles;
- category/PDP/offer/comparison/policy fixtures get expected Commerce roles;
- generic kind and industry role are independently visible in API/detail views.

### S3 — Knowledge candidates, contradictions, and approved memory

**Goal:** create a reviewable project knowledge layer without replacing source artifacts.

Suggested models:

```text
backend/app/models/knowledge.py
  KnowledgeEntity
  KnowledgeAssertion
  KnowledgeRelation
  ApprovedMemoryItem
  ApprovedMemoryTransition
```

Required columns:

- UUID PKs;
- direct workspace/project scope;
- source refs and version fields;
- normalized identity/value hashes where needed;
- status/effective dates;
- contradiction group/supersession links;
- created/updated timestamps.

Tasks:

1. Start with deterministic candidate extraction from existing normalized facts.
2. Normalize identifiers, dates, money, units, and entity references.
3. Group overlapping incompatible current assertions.
4. Block unresolved conflict from approved-authority context.
5. Implement explicit approve/reject/supersede/withdraw transitions.
6. Keep `BrandProfile` as a summary projection:
   - accepting a compatible brand-profile suggestion also creates approved-memory transitions;
   - direct summary edits create manual approved-memory items or update their projection mapping;
   - do not make the deterministic visibility scorer read broad knowledge memory.
7. Add workspace isolation and history tests.

Acceptance:

- a current HTML fee and historical PDF fee remain separate evidence;
- a contradiction group is created;
- neither becomes current approved truth automatically;
- a reviewer resolution is append-only and reproducible.

### S4 — Journey definitions and outcome coverage

**Goal:** model the admissions/purchase journey independently of analytics availability.

Suggested models:

```text
backend/app/models/journey.py
  JourneyDefinition
  JourneyDefinitionVersion
```

Tasks:

1. Seed a draft from the active pack; require explicit activation.
2. Store ordered stages, required roles/questions, outcomes, audiences, and project overrides in immutable versions.
3. Resolve compatible events from persisted integration catalogs/metric rows.
4. Represent event state as `available | unavailable | incompatible | disabled`.
5. Build deterministic role/question/event coverage projections.
6. Never create a zero metric for unavailable evidence.
7. Add APIs described in the kernel spec.

Acceptance:

- the Education fixture exposes discovery→fit→cost→trust→enquiry→application→enrollment;
- missing `confirm_enrollment` remains unavailable;
- activating a new journey version does not mutate reports tied to the old version.

### S5 — Selective context and one content/prompt flow

**Goal:** prove reusable knowledge improves output while keeping provider context bounded and inspectable.

Suggested model:

```text
TaskContextPackage
```

Tasks:

1. Implement deterministic selection by task/subject/journey.
2. Include approved memory, current non-conflicting assertions, relevant source IDs, role/page understanding, and optional aligned demand/visibility IDs.
3. Record omitted IDs/reasons, size budget, selection-policy version, and rendered-context hash.
4. Create one `ContentBrief` path (admissions overview or fee guide) before broad draft generation.
5. Create provisional prompts from pack archetypes + approved context.
6. Require review before active prompt status.
7. Do not auto-write context output to memory.

Acceptance:

- unrelated pages/raw analytics rows/secrets/rejected memory are excluded;
- unresolved fee conflicts block authoritative fee copy;
- brief and prompt show the exact context manifest used.

### S6 — Snapshot/report and Asian School fixture

**Goal:** reproduce the client diagnostic from persisted evidence.

Tasks:

1. Create sanitized fixtures from the supplied summary—not customer raw bodies or sensitive values.
2. Include baseline counts:
   - 90 successful internal HTML;
   - 180 PDFs;
   - 0 structured-data pages;
   - 38 missing H2;
   - 21 low-content;
   - 8 redirects and sitewide `/calendar/` references;
   - 2 unidentified 5xx represented as incomplete source coverage.
3. Persist a versioned intelligence snapshot.
4. Render Markdown/JSON projection with evidence/interpretation/recommendation labels.
5. Verify rerender equality and no provider/network call.

Acceptance:

- report output is reproducible;
- source limitations remain visible;
- it never claims the crawl proved paid-media causality;
- recrawl creates a second snapshot rather than mutating the first.

### S7 — Commerce proof

**Goal:** demonstrate no Education-specific branching in the kernel.

Tasks:

1. Run Commerce fixtures through the same corpus/understanding/entity/assertion/relation/journey/context/report contracts.
2. Add Product/Offer/variant/policy parity and temporal-offer rules from `commerce-v1.yaml`.
3. Reuse existing Product/CompetitorProduct and product visibility rows where identity aligns; do not duplicate catalog truth.
4. Prove category/PDP/variant/offer/shipping/return/purchase-stage coverage.

Acceptance:

- no `education_*` persistence table is required;
- one kernel API shape serves both packs;
- commerce role/predicate/rule config remains outside service code.

## API sequence

Implement in this order:

```text
GET /projects/{id}/corpus
PATCH /projects/{id}/corpus/{item_id}/disposition
GET /projects/{id}/pages/{site_url_id}/understanding

GET /projects/{id}/knowledge/overview
GET /projects/{id}/knowledge/entities
GET /projects/{id}/knowledge/assertions
GET /projects/{id}/knowledge/contradictions
GET /projects/{id}/knowledge/memory
POST /projects/{id}/knowledge/memory/proposals/{proposal_id}/approve
POST /projects/{id}/knowledge/memory/{memory_id}/withdraw

GET /projects/{id}/journeys
POST /projects/{id}/journeys
POST /projects/{id}/journeys/{journey_id}/activate-version

GET /task-context-packages/{id}
GET /projects/{id}/intelligence-snapshots
```

Use thin routers, Pydantic DTOs, typed error codes in config, pagination, workspace authorization, and idempotency for repeatable transitions.

## Frontend sequence

Extend the existing Knowledge Base route; do not create a competing product shell.

1. Approved memory.
2. Evidence candidates.
3. Contradictions and unknowns.
4. Industry/journey configuration.
5. Source drawer using persisted evidence.
6. Context-manifest review for brief/prompt/agent actions.

Status vocabulary must distinguish approved, proposed, historical, conflicting, unknown, unavailable, superseded, rejected, and withdrawn.

## Focused verification

From `backend/`:

```bash
uv run pytest tests/unit/test_industry_pack_loader.py -q
uv run pytest tests/unit/test_industry_role_classifier.py -q
uv run pytest tests/unit/test_knowledge_assertions.py -q
uv run pytest tests/unit/test_context_selection.py -q
uv run pytest tests/component/test_site_document_inventory.py -q
uv run pytest tests/component/test_knowledge_api.py -q
uv run pytest tests/component/test_journey_api.py -q
uv run pytest tests/component/test_growth_intelligence_snapshot.py -q
uv run ruff check app/core/config/industry_packs app/analysis/site_health app/domain/knowledge app/domain/journeys app/models/knowledge.py app/models/journey.py
uv run alembic upgrade head
uv run alembic check
```

From `frontend/`:

```bash
pnpm test -- components/knowledge-base
pnpm lint
pnpm build
```

Run focused subsets as slices land; do not use unrelated in-progress failures to rewrite other agents’ work. Pack-schema and cross-reference validation must pass before an active registry accepts a pack.

## First Codex prompt

Use this exact scope for the first implementation change:

> Read `Agents.md`, `docs/plans/knowledge-kernel-and-industry-pack-spec.md`, and the two pack YAML files. Implement **S0 only**: typed pack contracts, deterministic loader/registry, semantic-version lookup with no fallback, cross-reference validation, content hashing, and focused unit tests. Put all configurable values under `backend/app/core/config/industry_packs`. Do not change persistence, crawling, APIs, frontend, or the existing dirty plan files. Validate both Education v1 and Commerce v1 and report focused test/lint results.

Then proceed one slice at a time. Do not ask Codex to implement the whole platform in a single patch.

## Final cross-slice definition of done

- pack files are executable, reviewed, validated, versioned config;
- PDF inventory and HTML analysis are separated;
- generic page kind and pack role are separate and frozen;
- knowledge retains exact evidence and temporal/conflict state;
- approved memory requires explicit transitions;
- journey coverage and event availability are distinct;
- content/prompts/agent tasks use inspectable selective context;
- reports are reproducible projections;
- Education and Commerce share the same persistence and API contracts;
- existing visibility/product/site-health invariants remain intact.
