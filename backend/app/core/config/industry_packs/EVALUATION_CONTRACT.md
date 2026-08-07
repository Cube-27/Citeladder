# Industry Catalog Evaluation Contract

**Status:** normative deterministic gate  
**Initial reviewed candidates:** Education and Commerce  
**Purpose:** make classification, knowledge, generation, and maturity claims falsifiable

## Evaluation layers

A pack is evaluated at four distinct layers:

1. **Structural integrity:** JSON/schema, exact identity/version/hash, namespace uniqueness,
   references, capability compatibility, taxonomy mappings, sources, and summary counts.
2. **Classifier behavior:** positive, negative, unknown, ambiguous, schema-only, historical, and
   conflicting page cases with bounded evidence and deterministic output.
3. **Knowledge/generation safety:** required-question coverage, unsupported/unknown/historical/
   conflicting answer behavior, visible/schema parity, direct evidence, and review gates.
4. **Field validity and operations:** representative opt-in or sanitized corpora, reviewer labels,
   error analysis, scale, persistence, APIs, and recrawl verification.

Passing layers 1–3 is necessary for a `validated_candidate`; it is not proof of field accuracy or
production readiness.

## Role-classification fixtures

Each pack owns
`fixtures/<pack_id>/role-classification.json`. Every fixture must use stable unique case IDs and
cover at least:

| Class | Expected behavior |
|---|---|
| `positive` | Select the expected namespaced role above minimum score and margin |
| `negative` | Abstain when a plausible page lacks sufficient role evidence |
| `unknown` | Explicit no-signal/unknown input; no guessed default role |
| `ambiguous` | Two plausible candidates produce `ambiguous_margin` |
| `schema_only` | Markup without substantive visible/route evidence produces `schema_only` |
| `historical` | Preserve historical temporal state and never imply current truth |
| `conflicting` | Disclose route-visible or other material signal disagreement |

Fixtures must not pass by relying on registration order. The test suite recompiles each exact pack,
replays all cases, checks role/abstention/temporal/conflict expectations, and enforces configured
bounds on evidence, alternatives, conflicts, and secondary roles.

## FAQ and question-safety fixtures

Each pack owns `fixtures/<pack_id>/faq-cases.json`. Required behavior includes:

- supported current evidence may answer within its exact scope;
- unknown facts are requested or omitted;
- historical facts are not presented as current;
- unresolved conflicts block authoritative generation;
- unsupported claims are rejected or requested;
- FAQ structured data must match visible page content exactly enough for the declared parity case.

The validator checks case IDs, required-question references, required classes, safe expected
outcomes, and visible/schema parity. It does not use a model to decide whether a fixture should
pass.

## Education acceptance corpus

Education is a `validated_candidate`, not a production-certified pack. Evaluation includes:

- deterministic role and FAQ fixtures;
- sanitized public-label requirements in
  [`fixtures/education/asian-school-public-labels.json`](fixtures/education/asian-school-public-labels.json);
- an explicit boundary that customer facts do not become shared Education truth;
- roles for institution, programs, admissions, fees, academics, campus/facilities, outcomes,
  policies, news/events, and related reviewed purposes;
- historical/current and conflicting-evidence cases;
- future field comparison against the externally supplied Screaming Frog corpus without treating
  crawler labels as semantic truth.

Technical crawler observations may be compared directly. Industry roles, assertions, questions,
and gaps require reviewed semantic labels. Public-source or customer-provided evidence may support
a project assertion; it does not automatically change the shared pack.

## Commerce acceptance corpus

Commerce is a `validated_candidate`. In addition to generic role/FAQ cases,
[`fixtures/commerce/catalog-scenarios.json`](fixtures/commerce/catalog-scenarios.json) covers:

- category pages with filters;
- PDP current-offer scope;
- variant families;
- discontinued/historical products;
- policy scope;
- visible-versus-structured-data price conflict.

Representative field evaluation should add opt-in merchant cases for shipping, returns, offers,
availability, variants, comparisons, FAQs, and policy boundaries. Prices, inventory, and offers
must be treated as scoped temporal assertions, not timeless product attributes.

## Determinism and purity

For identical pack bytes and normalized facts:

- output must be byte-for-byte equivalent after deterministic JSON serialization;
- input objects must not be mutated;
- no network, filesystem, database, queue, embedding, clock, randomness, or model call may affect
  classification;
- regexes are compiled before the hot loop;
- evidence records preserve stable signal IDs and bounded matched values;
- ties use stable ordering only for display after the classifier has abstained, never to fabricate
  a winner.

The exact manifest in every result makes fixture output attributable to catalog/pack/classifier
versions.

## Adversarial cases

New or changed packs should test:

- empty/malformed URLs and decoded paths;
- very long text and oversized collections at input bounds;
- localized, nested, opaque, and misleading routes;
- duplicated navigation/widget terms;
- schema disagreement, stale schema, multiple schema types, and schema-only pages;
- negative signals and pages matching several roles;
- documents/non-HTML media, excluded corpus items, and not-applicable roles;
- current/historical/future/unknown temporal states;
- scoped numeric/money assertions with missing currency/effective dates;
- customer labels that must remain in project fixtures/overlays.

## Benchmark gate

The required Education and Commerce 10,000-page benchmark commands are documented in
[`PERFORMANCE_CONTRACT.md`](PERFORMANCE_CONTRACT.md). They verify deterministic in-memory
classifier cost and output checksum only. Record results with pack hash and repository revision;
never present them as end-to-end crawler throughput.

## Maturity decision record

A promotion review must record:

- pack/version/content hash;
- source review date and reviewers;
- fixture counts and exact validation commands;
- field-corpus composition and label provenance;
- per-role precision/error distribution, abstention rate, ambiguous-margin rate, schema-only rate,
  and conflict rate;
- known weak roles/locales/site architectures;
- generation-safety failures and resolutions;
- benchmark and scale-test scope;
- decision, limitations, and rollback/migration plan.

`foundation` remains the correct status when representative semantic review is absent.
`validated_candidate` means this repository's reviewed definition and fixtures are credible enough
for controlled shadow evaluation. It does not enable authoritative findings automatically.

## Canonical acceptance commands

From `backend/`:

```bash
uv run python -m app.core.config.industry_packs.validate
uv run pytest tests/unit/test_industry_pack_catalog.py -q
uv run ruff check app/core/config/industry_packs tests/unit/test_industry_pack_catalog.py
uv run python -m app.core.config.industry_packs.benchmark --pack education --pages 10000
uv run python -m app.core.config.industry_packs.benchmark --pack commerce --pages 10000
python -m py_compile app/core/config/industry_packs/*.py tests/unit/test_industry_pack_catalog.py
```

From repository root:

```bash
python docs/validate_documentation.py
git diff --check
```

All commands must pass in the same final filesystem state. Do not delete a failing fixture,
downgrade an expectation, skip repository hygiene, or claim completion from an earlier transient
build.
