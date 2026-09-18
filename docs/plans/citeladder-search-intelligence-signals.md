# Search intelligence signals — relevance, authority, change and differentiation

Owner-selected, queued behind
[Google AI Overview](citeladder-google-ai-overview-surface.md). [Site Health](../site-health.md),
[Opportunities](../opportunities.md) and [Visibility](../visibility-prompt.md)
own shipped behavior. The originating material is an owner-authored analysis of
the 2024 Google Content Warehouse API leak, retained as guidance only; every
capability below was re-scoped against what this codebase can actually observe.
Verified against `main` at `9a34305e`. Listed work is not authorization to
execute it. Scope each slice explicitly before starting it.

## Problem

CiteLadder collects a large amount of owned-site evidence and asks comparatively
shallow questions of it. It knows a title exists but not whether the page
represents the query it ranks for. It knows a page's crawl depth but not how much
internal link equity reaches it. It knows `dateModified` changed but not whether
anything else did. It classifies pages structurally but has no view of the site's
semantic shape.

The leak is not the authority for any of this, and none of its field names appear
in this plan. The authority is what the crawl and the Search Console evidence can
observe deterministically. Where the leak suggested a capability that cannot be
observed or cannot be reproduced honestly, it is excluded.

## Scope decision

Six capabilities were assessed. Four are built, one is deliberately reduced, and
one is scheduled behind a dependency.

| Capability | Decision | Basis |
|---|---|---|
| Internal authority flow | Build | The weighted graph already exists in memory |
| Significant content update | Build | Both crawls' content is already persisted |
| Query → page relevance | Build, lexical | `QueryEvidenceRow` already carries `site_url_id` |
| Anchor quality | Build, reduced, own slice | Anchor text is stored; source-paragraph context is not |
| Topical coherence | Build, lexical only | No embedding infrastructure exists, by design |
| Content differentiation | Build last | Requires the SERP provider from the AIO plan |

Nothing in this plan changes the Site Health score. `AEO_CHECK_PILLAR`
(`core/config/site_health_measurement.py:43`) is config-owned and untouched;
every signal here lands as an evidence-backed diagnostic or opportunity until
real-site calibration exists.

### Excluded outright

A site authority score, an LLM-generated content-effort score, click-quality
metrics that Search Console does not expose, host age, author ranking, any
reproduction of a Google demotion, and any numeric score presented as Google's
own. Each would be pseudo-precision of exactly the kind the Site Health
simplification work removed. Observable evidence of effort — original data,
named sources, stated methodology — may be reported; a number out of 100 may not.

Click behaviour needs no new module. The property-relative CTR-gap detector
(`DEMAND_SIGNAL_CTR_GAP`, `core/config/demand.py:13`) already cohorts pages by
position and compares against a property-level baseline, which is a stronger
construction than a fixed CTR threshold. It is extended by PR 3, not replaced.

## Verified foundations

- **The internal link graph is already complete.** `link_graph.py` builds the full
  edge set per crawl from persisted anchor facts — `_Edge` carries `anchor_count`,
  `main_content`, `has_nofollow`, `followable` and `rel_tokens`
  (`analysis/site_health/link_graph.py:41-51`) — and already runs a BFS for
  `depth_from_home`. `link_metrics.py:50-90` feeds it from
  `SiteFetchArtifact.normalized_facts`. Authority is one more pass over a graph
  that exists.
- **`SitePageLinkMetric`'s unique key includes `formula_version`**
  (`models/site_health/links.py:28-40`), so a new formula coexists with old rows.
- **Page content is persisted and comparable across crawls.**
  `normalized_facts` carries `primary_content_text` (capped at 12,000 chars,
  `core/config/site_health_taxonomy.py:246`), `primary_heading_outline`,
  `body.text` (capped at 200,000), `title`, `headings.h1_texts`, and
  `dates.{published,modified}` (`analysis/site_health/parser.py:670-695`,
  `fact_signals.py:54-108`). Cross-crawl content comparison is therefore
  computable **retroactively on existing crawls**, with no extractor version bump.
  But the caps are silent: neither `_body_text` (`analysis/site_health/parser.py:281-306`)
  nor `primary_content_text` (`fact_signals.py:85-87`) records a pre-truncation
  length or sets a truncation flag, and `extraction.truncated` (`parser.py:765`) is
  an HTML byte-limit flag, not a text-cap flag. Coverage can therefore be reported
  honestly but not precisely on existing crawls. PR 2 turns this into a gate.
- **Change Intelligence already pairs comparable crawls.** `change_intel.py`
  selects the comparable prior crawl, pairs pages, and diffs a `_field_values`
  dict of six metadata fields (`domain/site_health/change_intel.py:204-219`,
  `core/config/site_change_intel.py:41-48`). Adding content-comparison fields is
  an extension of that dict and the pure `compare_crawls` over it.
- **Query evidence already joins to crawled pages.** `QueryEvidenceRow` carries
  `site_url_id` directly alongside `normalized_query`, `impressions`, `clicks`,
  `ctr` and `position` (`models/demand.py:238-254`), resolved through
  `page_equivalence.py` with an explicit `resolution_outcome`. Query → page facts
  is one join, not a new pipeline.
- **Demand detectors are pure and config-registered.** `load_query_detector_inputs`
  (`domain/demand/detector_source.py:16-60`) assembles bounded inputs; detectors
  are pure functions; `DEMAND_SIGNAL_TYPES` and `DEMAND_OPPORTUNITY_SIGNAL_TYPES`
  (`core/config/demand.py:16-35`) gate which signals become opportunities via
  `demand_hits.py`. A new signal type is a config entry plus a pure function.
- **A deterministic lexical scorer exists, but it is a selection policy, not a
  measurement.** `website_context.py` ranks pages against an instruction using
  token overlap weighted per field, and its docstring states the choice
  explicitly: "Relevance is deliberately a deterministic lexical score — no
  embeddings, no vector store" (`domain/content/website_context.py:11-14`). Its
  primitives are reusable; its scoring is not. `_overlap` (`:193-198`) returns a
  raw matched-term count with no normalisation for query length; `_tokens`
  (`:183-190`) discards tokens of two characters or fewer, including "AI"; and
  `CONTENT_SCORE_TARGET_URL = 1000` short-circuits before any content is read,
  with `CONTENT_SCORE_MONITORED = 5` added after. Correct for choosing context,
  wrong for measuring how a page represents a query. See PR 3.
- **There is no embedding infrastructure.** No pgvector, no embedding provider, no
  vector column anywhere. Combined with the invariant that models "never become
  raw truth or change deterministic metrics" (`docs/invariants.md:103`), an
  embedding-derived site radius would be both new infrastructure and an invariant
  amendment. It is out of scope; the lexical construction is not.
- **Anchors store text and region, not surrounding prose.** `_anchor_assets`
  persists `href`, `rel`, `anchor_text` and `region` per anchor
  (`analysis/site_health/fact_links.py:32-68`). Anchor-to-destination relevance is
  computable today; source-paragraph context relevance would need a new extractor
  field and would only apply to future crawls.
- **There is no SERP provider yet.** `grep -ri dataforseo backend/` returns
  nothing on `main`. Content differentiation is scheduled after the
  [Google AI Overview](citeladder-google-ai-overview-surface.md) plan lands that
  connector.

## Naming

Every signal is named for what CiteLadder measures, never for what Google is
believed to compute. **Internal Authority** or **Link Equity Distribution**, not
PageRank. **Query Relevance**, not a title-match score. **Topical Coherence** and
**Topical Outlier**, not a site focus score or a site radius number.
**Content Differentiation**, not an originality score. Where a percentage is
shown, it is a share of something CiteLadder measured — share of internal link
equity within the observed crawl, measured text divergence over the compared
portion of a page — not a rating, and never described as more than the evidence
supports. “Low lexical alignment” is not “semantic mismatch”; “text divergence”
is not “percent of the page edited”; “unique contribution” means absent from the
pages actually inspected, not original on the internet.

## Slices

Ordered by cost, which is the reverse of the originating analysis. Authority and
Change are self-contained inside one domain each; Query Relevance crosses Demand
and Site Health; Topical Coherence introduces a new surface; Differentiation has
an external dependency.

**Six pull requests.** Anchor diagnostics were split out of the original
combined slice so they do not wait on clustering, which moves content
differentiation from PR 5 to PR 6. It remains the last slice, as intended.

### PR 1 — Internal authority

- `core/config/site_health_link_metrics.py`: damping factor, iteration ceiling,
  convergence epsilon, and edge weights — main-content over navigation, follow
  over nofollow, unique source page over repeated anchor. Bump
  `LINK_METRIC_FORMULA_VERSION`.
- `analysis/site_health/link_graph.py`: `authority_share: float` and
  `authority_rank: int` on `PageLinkMetricResult`; weighted power iteration over
  the existing `_Edge` set, with explicit dangling-node handling. Pure, no I/O.
- Two columns on `site_page_link_metrics`, folded into `0001_initial.py` per the
  greenfield reset.
- `domain/site_health/link_metrics.py` persists them;
  `domain/site_health/service/pages.py:258` exposes them.
- Coverage: a known-graph fixture asserting converged shares, nofollow damping,
  dangling nodes, a disconnected component, and the mixed-edge case below.

**Required correction — the edge flags are OR-merged independently.**
`link_graph.py:147-150` accumulates `main_content`, `has_nofollow` and
`followable` with separate `or` operations per source/destination pair. Two links
from A to B — one main-content nofollow, one navigation follow — produce an edge
carrying `main_content = True`, `has_nofollow = True` **and** `followable = True`,
although no main-content followable link exists. This is harmless for the counts
shipped today and fatal for a weight formula that reads the flags as a
combination. Compute the weight from the actual anchor combinations before
aggregation, or define an explicit mixed-edge rule in config. Do not build a
second graph; this is a small change inside the existing accumulation.

**Required framing — modelled authority within the observed crawl.** The output
is a normalised share over the pages this crawl actually observed. It is not a
measurement of Google link equity, and a share summing to one does not establish
that the whole site was seen. Specify, and record per crawl: how uncrawled
destinations are treated, how redirects and canonical duplicates collapse, and how
an incomplete or sampled crawl is flagged on every derived figure.

**Deferred from this slice.** The "commercial hub receives 0.7% of internal
authority" and "23 supporting articles, 2 link to the hub" comparisons require
knowing which pages are hubs and which are supporting, and the graph establishes
neither. In PR 1, restrict such comparisons to pages already classified or
explicitly configured as commercial. The topical form of the comparison moves to
PR 5, which is where topical relationships first exist.

### PR 2 — Significant content update

- `core/config/site_change_intel.py`: comparison thresholds — primary-content
  delta ratio, section add/remove counts, and the ceiling below which a change is
  cosmetic. Bump `CHANGE_ANALYZER_VERSION`.
- `domain/site_health/change_intel.py::_field_values`: add a **content comparison
  record**, not a single hash. A hash establishes equality or inequality and
  cannot yield a delta. Persist the retained shingle set (or an equivalent bounded
  similarity representation) so crawl N and N−1 can be compared quantitatively,
  alongside the heading-outline tuple and word count. Keep text-change evidence
  **separate** from `dates.modified` and internal-link-count changes rather than
  bundling all three into one fingerprint.
- `analysis/site_health/change_intel.py::compare_crawls`: emit
  `content_delta_ratio`, `sections_added`, `sections_removed` and
  `comparison_coverage`.

**Two independent outputs, not one overlapping vocabulary.** A substantial update
with an unchanged modification date is both a real content change and a metadata
discrepancy; a single enum forces a false choice. Emit:

- a **content-change classification**: `substantial_change`, `minor_change`,
  `unchanged`, or `insufficient_evidence`; and
- a separate **metadata-consistency flag**: whether `dates.modified` moved in a
  way consistent with the observed content change.

A missing or invalid date yields `unknown` on the flag, never "stale metadata".
`cosmetic_refresh` — date moved, content did not — and the inverse are then
derived combinations rather than competing enum members.

**Comparison coverage is recorded from evidence that exists, not inferred.**
`primary_content_text` is capped at 12,000 characters
(`core/config/site_health_taxonomy.py:246`) and `_body_text` slices to
`max_chars` (`analysis/site_health/parser.py:281-306`). Verified: **neither
records a pre-truncation length, and neither sets a truncation flag.** The
existing `extraction.truncated` (`parser.py:765`) is
`len(body) > settings.max_html_bytes` — an HTML byte-limit flag, unrelated to the
text cap. `word_count` is computed *after* the slice.

Therefore the plan cannot promise an exact proportion of the page compared on
existing crawls, and must not manufacture one from the cap. Coverage is assigned
from evidence, on this table:

| Coverage | Evidence required |
|---|---|
| `complete` | Both compared representations are known complete for the declared scope, with compatible extractor versions |
| `partial` | Available evidence **establishes** truncation or incomplete extraction |
| `unknown` | Completeness cannot be established — including every legacy crawl whose stored text merely sits at the cap |

**Stored length equal to the cap is supporting evidence, not proof.** A page whose
text is exactly 12,000 characters may have been exactly that long or may have been
truncated; length alone cannot separate them. Cap-equality is recorded as an
observation and yields `unknown`, never `partial`.

**Provenance fields ship in this slice, not "prospectively".** The gate requires
`complete` coverage before any Opportunity is promoted, and no existing crawl can
reach `complete`. Shipping the gate without the evidence that opens it would be a
feature that can never fire. PR 2 therefore adds `primary_content_truncated` and
the pre-truncation length to the extractor, under a new extractor version, so
crawls from this release forward can establish completeness. Legacy crawls stay
`unknown` and stay suppressed — they are never retroactively assumed complete.

The reduced alternative, if the owner prefers a smaller slice: ship comparison
history only and leave content-change Opportunities unavailable until the
provenance fields exist. What is not acceptable is promising actionable coverage
while leaving the evidence that establishes it optional.

**Hard evidence gate on promotion.** When comparison evidence is truncated,
extractor-incompatible, or of unknown completeness, the observed text differences
are still recorded — and every metadata-inconsistency and cosmetic-refresh
Opportunity is **suppressed**. The failure this prevents is concrete: the stored
first 12,000 characters are identical, the page changed below that boundary, and
`dates.modified` advanced. From the stored excerpt that is indistinguishable from
a date-only refresh, and recommending one would be wrong.

**Say only what was inspected.** Even a complete text comparison does not inspect
images, embedded media or non-text changes. The evidence statement is
"modification date changed; no change detected in inspected text", never "the page
did not change".

**Say what the number measures.** A shingle-dissimilarity ratio is not the
percentage of the page a human edited. Label it as measured text divergence over
the compared portion, and do not present it as an edit percentage.

**Promotion rule.** A legitimate substantial update is history, not a problem.
Only metadata-inconsistency and cosmetic-refresh cases are promoted to
Opportunities through `domain/opportunities/change_hits.py`, and only when
coverage is `complete`. `substantial_change` alone is recorded as a change
observation and surfaced in Change Intelligence without becoming an action item.

Coverage: fixture crawl pairs for substantial change, cosmetic refresh, metadata
inconsistency, boilerplate-only change, an extractor-version-incompatible pair,
and the gate case — identical stored excerpt at the cap with an advanced
`dates.modified`, which must record the date change and produce **no**
Opportunity.

### PR 3 — Query relevance

**Extract primitives, not the existing score.** `_relevance_score`
(`domain/content/website_context.py:206-238`) is a page-*selection* policy for
content generation and is unfit as a diagnostic measure. Verified against the
repo: `_overlap` (`:193-198`) returns a raw count of matched terms with no
normalisation for query length, so a six-term query outscores a three-term query
regardless of coverage; `_tokens` (`:183-190`) drops every token of two characters
or fewer, which silently discards "AI"; and `CONTENT_SCORE_TARGET_URL = 1000`
short-circuits before any content is examined, with `CONTENT_SCORE_MONITORED = 5`
added afterwards. Those behaviours are correct for choosing context and wrong for
measuring representation.

Move only the shared primitives — the tokeniser, the stop-word set, the
normalisation — into one pure module. **`website_context.py` keeps its selection
policy, its bonuses and its current behaviour unchanged.**

The new measure, defined independently:

- **Normalised field coverage**: the share of usable query terms present in each
  of title, H1 and primary content, so the result is comparable across queries of
  different lengths.
- **Short terms are preserved** when they are meaningful query terms. Dropping
  "AI" from a query about AI is a defect in this context even though it is
  acceptable noise-filtering in the other.
- **Unknown when no usable terms remain** after normalisation. A query reduced to
  nothing scores nothing; it does not score zero.

Wiring:

- `core/config/demand.py`: `DEMAND_SIGNAL_QUERY_PAGE_RELEVANCE`, registered in
  both `DEMAND_SIGNAL_TYPES` and `DEMAND_OPPORTUNITY_SIGNAL_TYPES`, with
  impression floor and coverage thresholds.
- `domain/demand/detector_source.py`: extend the loader to join `SiteUrl` → current
  `SitePageAnalysis` → `SiteFetchArtifact.normalized_facts`, taking `title`,
  `headings.h1_texts` and `primary_content_text`.
- **Two independent eligibility gates, both required.** A confident
  `resolution_outcome` establishes *which* page the query belongs to; it does not
  establish that the page has usable content. A page whose fetch failed, whose
  analysis did not complete, or whose extraction produced no usable text is
  **unknown**, not zero coverage — scoring it would report weak relevance for a
  page never actually read. Unresolved rows are likewise unknown.
- New pure detector in `domain/demand/query_detectors.py`, emitting the coverage
  figures plus the list of query terms absent from title and H1.

**Firing rule and scope.** The signal fires only where impressions clear the floor
**and** the existing CTR-gap detector is firing on the same query and page, over
the **same country, device and date scope**. A mismatch in scope between the two
inputs invalidates the pairing.

**Enrich, do not duplicate.** This becomes additional evidence on the existing
CTR-gap opportunity rather than a second opportunity describing the same case.
`core/config/opportunities.py` maps it accordingly.

**Correlational wording, enforced in copy.** The permitted statement is "this
query underperforms its CTR baseline, and important query terms are poorly
represented in the inspected page". The forbidden statement is that the missing
terms caused the decline. A current page snapshot cannot explain historical CTR;
the page may have changed since.

### PR 4 — Anchor diagnostics

Split out of the original combined slice so it does not wait on clustering. It
needs only the existing anchor facts, PR 1's resolved edges and PR 3's primitives.

- Generic anchors: "click here", "read more", bare URLs, and the configured
  generic set.
- One anchor text pointing at many distinct destinations.
- **Low lexical alignment** between anchor text and the destination's `title` /
  `h1_texts`, using PR 3's normalised coverage.
- Persisted as a JSONB column on `site_page_link_metrics`.

**Diagnostic by default; promotion is explicit and configured.** Findings do not
become Opportunities one per link. Repeated patterns are grouped to the pattern,
not enumerated per occurrence — forty "View product" links across a product grid
are one observation about a template, not forty action items. Promotion requires a
configured rule using the region and destination evidence already available, and
**low lexical alignment alone never promotes**: anchors are often two or three
words and frequently navigational, so overlap is weak evidence and wording alone
will not keep the queue clean. **Until a promotion rule is explicitly configured,
the default is no promotion at all** — the diagnostics ship, the queue stays empty,
and the rule is chosen with real data rather than guessed now. The value of this
slice is useful Opportunities, not a larger count of findings.

**Wording.** Where the evidence is token overlap, the finding is "low lexical
alignment", never "semantic mismatch". Anchors are often two or three words and
frequently navigational; overlap is weak evidence and the label must not overstate
it.

**Excluded.** Source-paragraph context relevance needs a new extractor field
(`analysis/site_health/fact_links.py:32-68` stores `href`, `rel`, `anchor_text`
and `region` only) and would apply solely to future crawls. Anchor keyword density
is not built at all. Related-page-to-hub recommendations move to PR 5, where topic
grouping exists.

### PR 5 — Topical coherence

The lexical, no-new-provider direction is settled; the contract is not. Nothing is
built until the following are explicit in config and in this document.

| Contract | What must be decided before implementation |
|---|---|
| Algorithm | The clustering method, its distance measure, and its determinism guarantee under identical input |
| Cluster count | How it is chosen, and its bounds |
| Corpus | Minimum page count below which the analysis is unavailable rather than approximate |
| Eligibility | Which pages are scored at all, and the explicit state for the rest |
| Language | Behaviour on mixed-language and non-English corpora |
| Persistence | Where vectors, centroids and assignments live, and their configuration version |
| Bounds | A hard ceiling on the computation; no all-pairs similarity in a request path |

**Eligibility, correcting an inconsistency in the earlier draft.** Only indexable
pages with sufficient extracted text are clustered. Empty, failed, non-indexable
and insufficient-text pages receive an explicit `ineligible` or `unknown` state —
never an arbitrary cluster. The acceptance criterion is coverage of the eligible
corpus with every other page explicitly accounted for, not a cluster for every
page in the crawl.

**Interpretation stays narrow.** Lexical distance from a site centroid does not
establish that a page is commercially irrelevant, low quality or harmful. The
output is a topic inventory and a bounded list of lexical outliers for a human to
judge. Cluster identifiers and centroids are crawl-dependent, so a change in them
between crawls is not evidence of page deterioration; comparing across crawls
requires a stated identity contract or it is not offered at all.

Once clusters exist, the two deferred comparisons land here: related pages that do
not link to a topic hub, and internal authority weighed against topical support.

### PR 6 — Content differentiation

Depends on the DataForSEO connector delivered by the
[Google AI Overview](citeladder-google-ai-overview-surface.md) plan. Do not start
this slice until that connector is merged and its credential, lifecycle and cost
paths are proven in production.

**Architectural boundary, and it is the important part.** This slice reuses the
DataForSEO *transport* and the source-page *inspection* infrastructure
(`domain/source_pages/`). It is not a visibility measurement. Organic results
fetched for content comparison must never become `Citation` rows, never increase
Sources usage counts, and never touch a visibility score. The AIO plan excludes
`organic` parsing on purpose; this slice opens it for one named purpose, and the
data flow must keep that purpose separate end to end.

**Narrow V1.** Ship the features whose extraction rules are unambiguous —
headings, tables, and outbound cited sources. Entities, statistics, questions
answered and first-party evidence markers are added only once their extraction and
uncertainty rules are written down, because each is a judgement call disguised as
a count.

Contracts that must be explicit before implementation:

| Contract | What must be decided |
|---|---|
| Comparison set | How many results, duplicate-domain treatment, canonical deduplication, the search context, and result freshness |
| Usable evidence | How many selected pages were actually fetched and successfully extracted, recorded per report |
| Features | Exact extraction and normalisation rules per supported feature type |
| "Most competing pages" | A stated threshold over successfully inspected, comparable pages |
| Percentages | The numerator and denominator of every published figure |
| Unknowns | Blocked, failed, truncated or under-extracted pages are never evidence that a feature is absent |

**Unknown is not absence.** If three of ten selected pages were inspectable, the
report says the comparison covers three. It may not imply that the seven unseen
pages lacked a feature. Likewise **"unique contribution" means not found in the
inspected comparison set** — not original on the internet — and the copy must say
so.

Retrieval is bounded by the existing source-page inspection budget and queue, not
a new crawler. This is not an originality score and no number is presented as
Google's.

## Acceptance

1. Every page in a completed crawl carries an internal authority share summing to
   one across the observed graph, with nofollow and navigation links weighted below
   main-content follow links, dangling nodes handled explicitly, and a mixed-edge
   pair never treated as a main-content follow link.
2. Every authority figure states that it is modelled over the observed crawl, and
   an incomplete or sampled crawl is flagged on the figures derived from it.
3. Content change emits a content-change classification and a separate
   metadata-consistency flag, plus a coverage state assigned from evidence:
   `partial` only where truncation is established, `unknown` wherever completeness
   cannot be, and cap-equality alone never yielding `partial`. A crawl pair that
   crossed extractor versions reports `insufficient_evidence`, never `unchanged`.
   Crawls predating the provenance fields are `unknown` and are never assumed
   complete.
4. Opportunities are suppressed whenever coverage is not `complete`. The fixture
   case — identical stored excerpt at the cap, `dates.modified` advanced — records
   the date change and produces no recommendation. No evidence statement claims a
   page did not change when only the inspected text did not change.
5. Query relevance reports normalised coverage rather than a raw term count,
   preserves meaningful short terms, returns unknown when no usable terms remain
   **and when the page itself has no usable extracted content**, fires only
   alongside the CTR-gap detector over a matching scope, and enriches that
   opportunity instead of creating a second one. `website_context.py`'s selection
   behaviour is unchanged.
6. No user-facing copy claims that missing query terms caused a CTR decline.
7. Anchor diagnostics identify generic, repeated and low-lexical-alignment anchors
   without depending on topical clustering, and never use the word "semantic" for
   a token-overlap finding.
8. Repeated anchors promote as one grouped observation, never one Opportunity per
   link, and low lexical alignment alone never promotes.
9. Topical coherence covers the eligible corpus, gives every ineligible page an
   explicit state, is deterministic under identical input, and is bounded so that
   no request path performs an all-pairs comparison.
10. Content differentiation reports parity, gaps and unique contribution with every
    denominator stated and the count of successfully inspected pages shown; an
    uninspectable page never counts as evidence of absence.
11. Organic results retrieved for differentiation produce no citation row, no
    Sources usage and no change to any visibility score.
12. No Site Health pillar, check weight or score formula changed in any slice.
13. No signal in the product presents a number as Google's own metric, and no
    feature name claims to reproduce a Google system.
