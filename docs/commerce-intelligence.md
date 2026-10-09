# Commerce Intelligence

Commerce measures how AI answers recommend a business's products and
categories, and turns that measurement into Actions. It has one `/products`
workspace: the catalog is the navigation, and the selected target (`?target=`,
validated as `category|product:<uuid>`) shows its AI Shelf, competitors and buyer
prompts. Commerce reuses Site Health acquisition and the shared audit system;
it does not own a crawler, response store, prompt store or opportunity store.
Present runtime is not evidence that credentialed manual gates passed.

## Catalog

Site Health's config-versioned extractor, analyzer and classifier emit generic
category and PDP facts. The config-versioned Commerce projector creates catalog
rows from crawled pages only for brands whose confirmed business model, primary
or secondary, sells a catalog; unknown context fails closed. Any business can
import a CSV. The catalog read reports whether crawl projection applies, and the
empty catalog says so instead of telling every business to run a crawl.

Structured Product price is preferred; when it is absent, a validated visible
PDP price is retained with its evidence path. The normalized, in-scope declared
canonical PDP URL is the catalog identity when present; the final delivered URL
is its resolution base and fallback, or the admitted URL when delivery
provenance lacks one. The admitted URL remains crawler identity. CSV imports
match existing products by URL, SKU or GTIN; projection matches by URL.

A product page with SKU, GTIN, MPN, or a name with a price is a product. An
unidentifiable "product" page that lists product cards is projected as the shelf
it is; one that lists none (a sold-out PDP) is skipped, so its breadcrumb cannot
take over a real category. A category needs a real name: a nameless listing is
skipped, and "Uncategorized" (the platform default) names no category. Products
without a category read as uncategorized; no sentinel row is stored, and rows
named "Uncategorized" from earlier writers are left out of the read.

CSV imports and explicit edits are append-only observations. Current product
rows are read projections whose `field_sources` identify the exact observation
and version controlling every field. CSV authority is not silently overwritten
by later crawl projection. Imports are content-hash idempotent, read the
project's products once into an in-memory identifier index, and expose bounded,
row-level outcomes; an identifier conflict names its row.

Catalog writers (import, projection, discovery publication, AI-observed
competitors) serialize on the project row with `FOR NO KEY UPDATE`, which still
excludes each other and a project delete but no longer blocks the project's
foreign-key inserts (audits, crawls, queue writes) while a large import runs.
Permanent projection failures (missing source analysis, unreadable facts, no
usable URL) end the task at once with a specific code instead of retrying.

The header shows projections in flight, then failed or cancelled projections of
the latest projected crawl only, and polls only while work is in flight. The
rail renders products beneath every category they belong to, keeps products
without a category under `Uncategorized`, and keeps catalog search pinned while
the list scrolls. Categories are ordered by descending product count, then
name; they are collapsed initially except the one holding a deep-linked product.
Bulk checking a category includes its products.

## Competitors

Discovery runs as a queued, versioned attempt whose status is exposed until it
terminalizes. After admission the browser starts a separate authorized POST for
the returned task IDs, using the analytics worker with bounded search and page
acquisition. A request names at most `COMMERCE_TARGETS_MAX` (10) targets, the
limit the shared contract owns; the bulk bar refuses a larger selection and
says why, and a failed request is shown. The screen tracks every discovery it
launched, so a second run does not drop the first one's progress, and refreshes
candidates as each run finishes.

Tavily is optional; an unavailable provider produces an explicit unavailable
state. Product queries include bounded product type, attribute and price-band
context; category queries keep their merchant-intent form. Candidate URLs pass
deterministic path/domain filters (including the business's own hosts), the
shared safe fetcher and target-aware classification before persistence: product
discovery requires a PDP and category discovery a listing page. Verification
stops once enough pages verify to fill the accept limit; unfetched results are
`excluded_limit`. Candidates stay pending until approved or rejected and cannot
enter measurement before approval. Rows show the product, brand and host;
states and discovery failures read as sentences.

## Buyer Prompts

Every Commerce prompt has a typed category or product target. Generation is
bounded and rejects owned-name leakage; admission binds a prompt to the target
through the category's own name, its products and category terms, and for a
product its name and description. Archived products never feed the context.
Generated and manual prompts use the shared Prompt owner and stay disabled until
approval. Generation reserves one workspace model-call quota unit per target
before dispatch, closes the context read before model I/O and revalidates
targets and capacity before writing. Each target keeps the prompts it admitted:
a weak batch or a later model failure does not discard earlier targets' paid
prompts, and only a request that admitted nothing is unavailable (503). The
screen says when fewer prompts than asked were usable.

For one target, the prompts section opens the shared audit launcher over only
its approved prompt IDs and explains why launch is disabled until one is
approved; provider selection, repetitions, estimate, capacity and execution stay
with the audit owner. Audit creation freezes approved prompts, the current
catalog identity of each distinct target once, approved competitors and the
parser, matcher, formula and template versions. Scheduled Commerce runs enter
the same freeze, execution, observation and snapshot path. After a launch the
section follows the run's event stream and refreshes AI Shelf and Actions when
it finishes. Typed text belongs to one target and resets on switch.

## AI Shelf

Successful Commerce executions create append-only recommendation observations
linked to the raw response artifact and any persisted Citations. Answers split
into list items (ordered items carry a one-based rank) or, without a list,
prose sentences (unranked). Deterministic matching reads the catalog and
approved competitors frozen into the audit: names and identifiers match whole
tokens of at least three characters; a brand names one owned product only with
a textual attribute no other same-brand product on the shelf shares; when a
span names both an owned product and a competitor, the one named first holds
the slot.

Unmatched spans that carry a product signal (a list item, a URL, a price or a
capitalized name after the first word) go
to the configured structured-model resolver in one call per answer, charged to
the workspace model quota before the call. Unavailable, malformed or
quota-refused output preserves unresolved evidence. An AI-observed competitor is
created only from a resolved PDP URL that the answer itself contains, that is
not merely a citation, and that is not on the business's own hosts.

The persisted, formula-versioned snapshot per target and audit exposes:

- Product Visibility: successful target executions with an owned appearance
  divided by all successful target executions.
- Share of Shelf: owned slots divided by all recognized slots.
- Average Shelf Position: mean owned rank across ordered observations.
- First-Position Win Rate: ordered executions whose first slot is owned divided
  by ordered executions.

A slot is one product or competitor per execution, at its best rank, so an
answer naming a product three times recommends it once. A target with no
successful execution reads Product Visibility as unavailable, not zero, and
raises no `product_not_mentioned` or `cited_alternatives` Opportunity; other
metrics without a denominator are unavailable.

The AI Shelf read requires a target and returns its latest snapshot with the
measurement date and sample size, the holders folded from exactly the
observations that snapshot was computed from (you, approved competitors,
AI-observed competitors; appearances and best rank), the count of unresolved
recommendations, and the Actions not done or dismissed whose live commerce
Opportunities target it. The target detail shows the metrics with one-line
definitions, one guided next step (find competitors, review them, generate and
approve prompts, launch, then the Actions), the Actions with links, and who
held the shelf.

## Entry points and lifecycle

The [TypeScript Commerce API](../frontend/services/api/src/routes/commerce.ts)
authorizes persisted reads, CSV imports and explicit decisions using active
workspace membership and run/write capabilities. The
[discovery executor](../frontend/services/api/src/commerce/discovery.ts) uses the
shared Site Health safe fetcher, acquisition controls, robots policy, parser and
classifier. Provider calls and candidate verification finish before the worker
locks the live claim and appends the attempt, pending candidates and queue
outcome; no transaction spans network I/O. A target removed before execution or
publication terminalizes with `commerce_target_unavailable`.
[CSV admission](../frontend/services/api/src/commerce/import.ts) and
[catalog projection](../frontend/services/api/src/commerce/projection.ts) consume
persisted Site Health analyses through analytics tasks the Site Health
[analyze executor](../frontend/services/api/src/site-health/analyze-task.ts)
enqueues for catalog page kinds. Project and target IDs are re-authorized; an
object ID alone is never a catalog boundary.

[Audit context](../frontend/services/api/src/commerce/audit-context.ts) freezes
target identity before shared audit execution;
[shelf parsing](../frontend/services/api/src/commerce/shelf-parsing.ts) owns
matching and resolution, and [shelf metrics](../frontend/services/api/src/commerce/shelf-metrics.ts)
the formulas. No browser aggregate or current-catalog lookup may reinterpret an
old answer. Queue leases, bounded retries and cancellation remain with the
shared analytics and audit workers. Native tests cover projection, routes,
shelf parsing and persistence, discovery and buyer prompts against PostgreSQL
with deterministic provider doubles.

Manual migration/crawl/CSV, reference-evaluation, Tavily and audit/schedule
gates remain unverified; applicable acceptance remains in
[release readiness](release-checklist.md).

## Current limits

Revenue attribution, order facts, feed remediation and publishing, autonomous
publishing, JavaScript rendering, product edit and archive flows, snapshot
trends, merchant dashboards, family aggregation, sentiment and composite
product scores are not part of the shipped feature.
