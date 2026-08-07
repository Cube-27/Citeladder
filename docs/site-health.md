# Site Health: shipped foundation for Site Intelligence

> **Current owner:** `backend/app/domain/site_health`, `analysis/site_health`, Site Health workers,
> and the `/site-health` frontend
> **Target owner:** Site Intelligence, as specified in
> [`plans/site-intelligence-primary-product.md`](plans/site-intelligence-primary-product.md)

Site Health is the existing first-party crawler and deterministic issue engine. It remains the
only owner of URL discovery, secure acquisition, crawl tasks, immutable fetch attempts/artifacts,
normalized HTML facts, rule evaluations, issues, snapshots, exports, and page/crawl projections.
The Site Intelligence implementation extends this subsystem; it does not create a new crawler or
parallel page-analysis pipeline.

## Current guarantees

- workspace-scoped UUID resources and projection-only reads;
- config-owned URL admission, acquisition, parser, classifier, rule, and scoring versions;
- SSRF-safe acquisition with validated redirects, resource bounds, robots handling, and redacted
  diagnostics;
- PostgreSQL queue leases, heartbeats, retries, cancellation, and persisted events;
- immutable fetch artifacts and attempt provenance;
- deterministic generic page classification and page-level rule evaluation;
- grouped issues, per-URL evidence/history, snapshots, and authenticated exports;
- explicit null/unavailable states rather than fabricated scores.

## Required corrections before Site Intelligence

1. Terminal crawl/discovery/analysis state must agree with drained task state.
2. Stop/continue controls must be idempotent and cannot imply work without a non-terminal task.
3. A URL failure must not be counted twice across discovery and analysis.
4. Acquisition documentation/config must match the actual active transport ladder.
5. Irrelevant, utility, historical, and document content needs first-class corpus disposition.
6. `page_type` must split into generic `page_kind` and pack-specific `industry_role`.
7. Supported documents, especially PDFs, must be admitted to corpus inventory without entering the
   HTML analyzer.

## Target evidence flow

```text
seed, sitemap, links, uploads, catalog
  -> URL/document inventory
  -> analyze | inventory_only | exclude
  -> safe acquisition or document extraction
  -> immutable normalized artifact
  -> page kind + industry role
  -> entities, assertions, questions, sections, schema, journey support
  -> deterministic findings and grouped actions
  -> Site Intelligence snapshot/report
  -> recrawl comparison and verification
```

The active industry profile contributes role checks and expectations but never bypasses URL safety,
workspace authorization, evidence immutability, or deterministic hard validation.

## Page classification

Classification uses configured URL, title, headings, visible content, forms/CTAs, internal-link
context, media type, and structured-data signals. Structured data is optional evidence; missing
schema is itself a possible gap after role classification.

Existing historical `page_type` values retain their classifier version. New implementation stores
`page_kind`, `industry_role`, active profile/version, confidence, alternatives, conflicts, and
bounded signal evidence. A user override creates a versioned reviewed projection; it does not
rewrite the source artifact.

## Documents

Separate policies govern:

- unsafe/unsupported hard exclusions;
- inventory-supported document types;
- document types eligible for bounded extraction;
- project/pack disposition and temporal state.

A historical fee PDF can remain useful evidence while being prohibited from supplying current fee
truth without review. Extraction coverage and source coordinates are explicit.

## APIs and compatibility

Existing crawl, pages, issues, detail, events, monitored URL, Site Health projection, and export
routes remain compatible during migration. New Site Intelligence reads project only persisted
snapshots and evidence. No read route crawls, classifies, calls a model, or repairs lifecycle state.

The detailed visibility-era runtime reference is archived at
`archive/subsystems/site-health-detailed-runtime-reference.md`; use it only for historical
comparison and verify every implementation claim against code.
