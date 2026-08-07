# CiteLadder Industry Knowledge Catalog

**Status:** canonical machine-readable authority  
**Catalog version:** `1.0.0`  
**Runtime status:** exact loader, reference classifier, fixtures, validator, tests, and benchmark are implemented; production Site Health wiring is intentionally not part of this catalog slice

This directory is the single source of truth for CiteLadder's reusable industry knowledge. A
shared pack defines how an industry is understood; it never contains customer facts, crawl
results, approved project memory, or model-written summaries.

## Authority and layout

| Path | Contract |
|---|---|
| [`registry.json`](registry.json) | Exact active pack ID, version, file, maturity, aliases, and canonical content hash |
| [`core.json`](core.json) | Cross-industry concepts, states, classifier fields/operators, provenance, and generation invariants |
| [`capabilities.json`](capabilities.json) | Reusable capability modules and explicit compatible pack IDs |
| [`taxonomy.json`](taxonomy.json) | Industry/subindustry lookup nodes mapped to one primary pack plus compatible capabilities |
| [`schema-terms.json`](schema-terms.json) | Reviewed Schema.org type/property snapshot used by pack validation |
| [`sources.json`](sources.json) | Official source registry and review scope |
| [`schema/industry-pack.schema.json`](schema/industry-pack.schema.json) | Structural JSON contract for every pack |
| [`packs/`](packs/) | Sixteen immutable, namespaced pack definitions |
| [`fixtures/`](fixtures/) | Role, FAQ, safety, public-label, and Commerce scenario fixtures |
| [`catalog.py`](catalog.py) | Exact immutable loader, resolver, hash verification, and frozen manifest |
| [`reference.py`](reference.py) | Pure deterministic reference classifier with explicit abstention and bounded evidence |
| [`validate.py`](validate.py) | Offline catalog, cross-reference, fixture, safety, summary, and repository-hygiene validation |
| [`benchmark.py`](benchmark.py) | Reproducible in-memory classifier benchmark; loading/compilation are outside the timed loop |

The canonical data set contains 16 packs, 232 page roles, 158 entity types, 230 assertion
predicates, 139 relation types, 347 required-question contracts, 185 analysis rules, 48 brief
templates, 80 prompt archetypes, and 154 taxonomy nodes. The validator recomputes these counts;
[`catalog-summary.json`](catalog-summary.json) is a checked projection, not an independent source.

## Pack maturity

| Maturity | Packs | Meaning |
|---|---|---|
| `validated_candidate` | `education`, `commerce` | Definition and synthetic/sanitized fixtures pass this repository's deterministic gates; production accuracy still requires reviewed field evaluation |
| `foundation` | `general_business`, `saas`, `professional_services`, `healthcare`, `financial_services`, `real_estate`, `hospitality`, `local_services`, `manufacturing`, `automotive`, `restaurants`, `nonprofit`, `media_publishing`, `recruiting_staffing` | Structurally complete reusable starting point; authoritative findings remain disabled until domain review and representative evaluation justify promotion |

No pack currently enables authoritative findings. Maturity is not inferred from the amount of JSON,
a successful schema validation, or a model's confidence.

## Stable separation

CiteLadder keeps generic structure and industry purpose distinct:

```text
page_kind      = generic structural purpose such as article, product, FAQ, or document
industry_role  = active-pack business purpose such as program detail, admissions, PDP, or returns policy
```

The catalog's classifier returns an industry role only. The shipped Site Health `page_type`
classifier remains the current generic page-kind implementation until the migration handoff is
executed. Do not overwrite `page_type` with an industry role or use a pack role as a substitute for
a generic content shape.

## Exact loading and provenance

Load by an exact ID/version whenever reproducibility matters:

```python
from app.core.config.industry_packs import (
    classify_page,
    compile_pack,
    load_pack,
    pack_manifest,
)

pack = load_pack("education", "1.0.0")
compiled = compile_pack(
    pack,
    manifest=pack_manifest("education", "1.0.0"),
)
result = classify_page(compiled, extracted_page_facts)
```

`load_pack` verifies the registry identity and canonical SHA-256 content hash, freezes nested data,
and caches only the exact `(pack_id, version)` result. `load_resolved_pack` may resolve reviewed
aliases and taxonomy labels, but it does not inspect filenames or select a guessed latest version.
Unknown identifiers fail closed unless the caller explicitly opts into the registered
`general_business` fallback.

Every crawl or immutable analysis snapshot that uses a pack must persist:

- catalog version;
- pack ID and exact version;
- pack content hash;
- classifier/analyzer/rule versions;
- source artifact IDs and timestamps.

A later catalog release never changes the meaning of an earlier analysis.

## Classifier contract

[`reference.py`](reference.py) is intentionally pure after compilation. It performs no database,
network, queue, embedding, or model call. Inputs are bounded normalized facts; outputs contain:

- selected primary role and optional secondary roles;
- total score and winner margin;
- bounded matched-signal evidence;
- bounded alternatives and conflicts;
- temporal state;
- explicit abstention reason;
- frozen pack/classifier manifest.

Supported abstention reasons include `invalid_input`, `pack_not_eligible`, `not_applicable`,
`no_signal`, `schema_only`, `below_minimum_score`, and `ambiguous_margin`. Schema is one signal and
cannot classify by itself. Negative signals reduce scores. Ties and insufficient margins abstain
instead of choosing by registration order.

## Knowledge and generation safety

The shared kernel distinguishes `unknown`, `unavailable`, `historical`, `conflicting`,
`not_applicable`, and `excluded`. Pack generation policies require:

- unknown facts to be requested or omitted;
- authoritative generation to stop on unresolved conflicts;
- historical facts never to be presented as current;
- numeric claims to have direct scoped evidence;
- visible FAQ answers and FAQ structured data to remain in parity;
- no rich-result or search-appearance guarantee.

Pack definitions may describe predicates and requirements. They do not prove that a project has a
fact. Project assertions require observed evidence or an explicit approved-memory transition.

## Shared pack versus project extension

Customer evidence, labels, overrides, and approved memory stay workspace/project scoped. The
sanitized Asian School fixture demonstrates public semantic labels without moving customer facts
into shared Education JSON. A project overlay may add reviewed aliases, mappings, local labels, or
project-only expectations; it may not mutate the shared file, weaken safety controls, silently
change IDs, or affect another workspace. See [`EXTENSION_CONTRACT.md`](EXTENSION_CONTRACT.md).

## Source snapshot

The catalog records a reviewed Schema.org 30.0 snapshot and official Google Search structured-data
guidance current during the August 2026 review. These sources define available vocabulary and
published eligibility guidance; they do not establish that markup is correct for a specific page
or guarantee a search feature. Re-review [`sources.json`](sources.json) and regenerate a new
versioned snapshot before adopting later vocabulary.

## Validation

From `backend/`:

```bash
uv run python -m app.core.config.industry_packs.validate
uv run pytest tests/unit/test_industry_pack_catalog.py -q
uv run ruff check app/core/config/industry_packs tests/unit/test_industry_pack_catalog.py
uv run python -m app.core.config.industry_packs.benchmark --pack education --pages 10000
uv run python -m app.core.config.industry_packs.benchmark --pack commerce --pages 10000
python -m py_compile app/core/config/industry_packs/*.py tests/unit/test_industry_pack_catalog.py
```

The validator also rejects known duplicate/transient catalog locations. A copied pack that parses
but is not registered, hash-matched, namespaced, cross-reference-valid, fixture-backed, and free of
customer leakage is not an accepted catalog release.

## Companion contracts

- [`PAGE_ANALYSIS_AUDIT.md`](PAGE_ANALYSIS_AUDIT.md) — shipped generic classifier audit and exact migration boundary.
- [`PERFORMANCE_CONTRACT.md`](PERFORMANCE_CONTRACT.md) — hot-loop, crawler, persistence, and benchmark requirements.
- [`EXTENSION_CONTRACT.md`](EXTENSION_CONTRACT.md) — shared releases, capabilities, and project overlays.
- [`EVALUATION_CONTRACT.md`](EVALUATION_CONTRACT.md) — fixture classes, safety gates, maturity, and regression policy.
- [`../../../../../docs/plans/codex-site-intelligence-wiring-handoff.md`](../../../../../docs/plans/codex-site-intelligence-wiring-handoff.md) — next implementation slice for persistence and production wiring.
