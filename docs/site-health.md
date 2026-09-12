# Site Health runtime

> **Status:** current authority for crawl acquisition, page analysis, public
> checks, findings, terminal results and Site Health consumers.

Site Health owns URL discovery, secure acquisition, immutable fetch evidence,
bounded normalized facts, page-kind classification, deterministic checks,
scores, grouped issues, snapshots and exports. Content owns drafts and review.
Opportunities owns implementation declarations and verification events.

## Pipeline and ownership

```text
explicit Run new crawl
  -> PostgreSQL discovery/setup/analyze tasks
  -> SSRF-safe, DNS-pinned acquisition
  -> immutable attempts and artifacts
  -> bounded facts with availability, truncation, region and locators
  -> page kind plus independent traits
  -> applicable evaluations and evidence-backed findings
  -> locked crawl finalization and final page-analysis revisions
  -> persisted snapshot and equal-page cohort summaries
  -> read-only API, UI, exports, Content and Opportunities consumers
  -> explicit implementation declaration
  -> fresh comparable crawl evidence
```

Read endpoints only render persisted projections. They never acquire, classify,
score, call a model/provider or repair state.

## Acquisition and evidence guarantees

- Crawls begin only from an explicit user request.
- PostgreSQL is the queue. Tasks use leases, heartbeats, retries, idempotency and
  `FOR UPDATE SKIP LOCKED`; claims commit before network I/O.
- The URL-policy, fetcher and curl transport owners retain SSRF checks, DNS
  pinning, redirect revalidation, TLS validation, response limits and redaction.
- Fetch attempts and artifacts are append-only. `normalized_facts` remains the
  bounded evidence store; Site Health does not persist a second raw-HTML copy.
- Artifacts identify crawl, task, capture time, final URL, region and extractor
  version. Derived rows retain exact artifact/evaluation IDs and relevant
  classifier, analyzer, rule and scoring versions.
- Declared canonicals remain observations. They never replace crawler identity.
  Commerce may consume a canonical only when its declaration is unambiguous.
- HTML facts distinguish `available` from parser failure, unsupported media,
  client-rendering uncertainty and truncation. An absence verdict requires the
  relevant region to have been observed successfully.
- Static accessible-name extraction follows AccName 1.1 for directly referenced
  hidden naming nodes. Unreferenced hidden content and template content do not
  enter names or visible heading outlines. CSS/runtime-only behavior remains
  unavailable rather than guessed.
- Cancellation and partial completion preserve all evidence already committed.

## Page kind and traits

The stable taxonomy is:

`homepage`, `article`, `product`, `category`, `pricing`, `docs`, `faq`,
`about_contact`, `service`, `local`, `guide`, `comparison`,
`case_study_review`, `trust_policy`, `other`.

The classifier reads page-owned structure before route/title suggestions.
Structured data can suggest a type but cannot certify the type whose markup is
being checked. The root-path homepage exception is exact. Recommendation cards
and shared chrome cannot replace primary purpose. If incompatible kinds have
strongest-tier evidence, the classifier returns `other` and preserves all
alternatives, conflicts and reasons.

Traits remain additive observations. They distinguish FAQ blocks, listings,
variants, reviews, local/contact/about intent, case-study/comparison content and
procedural pages without multiplying kinds. Route/title evidence may suggest
inventory classification but cannot by itself activate a mandatory purpose
penalty.

Completed AEO checklists are supported for:

- editorial articles;
- public-sale and affirmative quote-led products;
- commerce collections and editorial/docs hubs;
- FAQs with identifiable question/answer relationships;
- non-procedural concept documentation.

Other purposes retain applicable Web checks, present-artifact validation and
findings but have a null AEO score with `unsupported_purpose_checklist`.
Unresolved purpose uses `page_purpose_unresolved`. Procedural and API-reference
docs are unsupported in this cutover.

## Public checks and findings

One config-owned catalog declares each check's claim, execution phase, scope,
applicability, required evidence, Web membership, optional single AEO pillar,
finding class, remediation and supported action.

Applicability is resolved before field presence. `not_applicable` needs positive
evidence of irrelevance. `unknown` covers unavailable, ambiguous, truncated or
conflicting evidence. `error` records evaluator failure. Legacy `partial` may be
read from old evidence but is incomplete and receives no public score credit.

Findings are independent of score membership. An established applicable defect
or improvement can create a `SiteIssue` even when unscored or unsupported by a
generator. Diagnostics describe limitations and do not assert defects. Grouping
occurrences never multiplies score influence or claims a shared template fix
without template evidence.

The Web checklist initially uses equal-weight checks for title presence,
indexability intent/blocker evidence, HTTPS, declared-canonical integrity,
bounded image alternatives, form names, document language, viewport, mixed
content and strong page-owned soft-error evidence.

Canonical integrity merges declaration conflict and target resolution. All
bounded declarations are preserved. No declaration is N/A. Multiple or invalid
declarations fail. An unavailable target is unresolved. A healthy redirect can
be consolidation guidance and does not automatically fail.

Lengths, heading outline, H1 counts, HSTS, TTFB, compression, `llms.txt`, Open
Graph, initial-HTML rendering and optional schema presence remain facts,
diagnostics or improvements. They do not claim Google limits, Core Web Vitals,
general security, indexability or general AI readiness.

Broken links, hreflang and sitemap relationships retain checked, unchecked and
rate-limited counts and remain unscored. Incomplete target resolution cannot
pass. Architecture retains its separate post-terminal projection and scoped
findings; depth, parentlessness, missing hubs, duplicates and orphans do not
penalize a public score in this release.

## AEO pillars and scoring

The AEO pillars and baseline weights are:

| Pillar | Weight |
|---|---:|
| Answerability | 20 |
| Structure | 15 |
| Evidence | 15 |
| Machine readability | 20 |
| Provenance | 10 |
| Freshness | 5 |
| Crawlability | 15 |

Checks are binary and equal weight inside their role/pillar.

```text
Web = 100 * passed applicable checks / applicable checks
Pillar = 100 * passed applicable checks / applicable checks
AEO = sum(completed applicable pillar score * pillar weight)
      / sum(applicable pillar weights)
```

A page role publishes a score only when every applicable public check for that
role is `satisfied` or `missing`. Unknown/error/partial checks remain in exact
completion counts and make the role score null. A pillar can complete while the
overall AEO checklist remains partial. Zero applicable checks is null.

Crawl Web and AEO results are separate equal means of finalized page scores in
the selected crawl cohort. A page with 1/1 and a page with 0/9 average to 50;
the implementation does not pool them to 10. Page-kind means use the same page
arithmetic and reconcile to the cohort when weighted by scored-page count.
Full precision is persisted and display rounding happens at the edge.

Check completion, scored-page coverage, classification coverage and discovery
limits are separate. The UI uses **Complete checklist**, **Partial audit** and
**Unsupported purpose checklist**; it does not infer confidence from coverage.
The positive access-gate label is **No observed blocker**, which does not claim
actual indexing or engine eligibility.

## Terminal publication and provenance

Analyze tasks append an initial `SitePageAnalysis` with facts, classification,
traits and source evaluation IDs. Its scores and `finalized_at` are null.

Once work drains, the existing crawl lock owns the only publication sequence:

1. fence active work and resolve aliases;
2. evaluate bounded finalize checks from persisted evidence;
3. persist evaluations/issues against their original initial analysis;
4. append one final analysis per retained URL with `supersedes_analysis_id`;
5. freeze the direct checklist, applicability/outcomes, memberships, weights,
   audit time, versions, source evaluation IDs and artifact IDs;
6. switch `is_current`, persist snapshot and matching crawl score summary, then
   terminalize;
7. continue link metrics, Architecture, Change/Demand/Opportunity and
   verification orchestration.

Evaluations and issues are never cloned or reparented. Consumers resolve the
final manifest's evaluation UUIDs. Workspace authorization is required for
every source UUID, including supersession. Active summaries expose progress and
completion without numeric scores. Terminal cancellation/partial completion
still writes a null or partial snapshot; retry cannot create a second current
row or snapshot.

Comparisons require compatible checklist descriptors, versions, purpose and
cohort provenance. Missing descriptors and changed applicability semantics are
non-comparable.

## Consumers and actions

Page detail, Issues, history, Changes, snapshots, exports, Growth Agent and MCP
read the same persisted final-result contract. Browser requests use same-origin
`/api/v1` through the frontend proxy.

Content selects one current finalized analysis per URL from the explicit source
crawl. A Site Health handoff carries exact analysis, evaluation and artifact
IDs, target field, captured value, expected condition and limitations. Initial
grounded drafts are limited to missing title and meta description. Accessible
names, indexing, canonicals, price/stock, legal text, broken links and uncertain
template changes remain manual or investigation actions. Draft generation,
review or export never resolves the live finding or changes a score.

Opportunities keeps explicit implementation declarations and append-only
verification events. Verification needs evidence captured after implementation,
the same target/entity, compatible check semantics and applicable purpose.
Missing pages, reclassification, N/A, unavailable capture or changed rules do
not verify a repair. Ranking and citation movement remain separate observed
outcomes.

## Validation and operations

Parser/classifier/evaluator tests use deterministic fixtures. Finalization
concurrency and workspace isolation use PostgreSQL. Tests disable dotenv and
cannot receive provider credentials. Pre-launch schema changes are folded into
`migrations/versions/0001_initial.py` and exercised only on disposable data.

Semantic changes use a fresh disposable pre-launch database. Resetting an
existing database requires explicit authorization and confirmation that it is
disposable pre-launch development data. Never reset non-disposable, shared,
staging or production environments under this policy. Do not backfill historical
evidence, run an old scorer against new rows or keep a runtime formula switch.
Deployment and external-provider execution require separate explicit authorization.

The current limitation is real-site calibration: no current local crawl rows or
original historical response bodies are available. Fixture and retained audit
evidence support bounded defect reproduction, not customer-site precision or a
score-suppression estimate.
