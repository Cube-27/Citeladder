# Commerce

Commerce measures how AI answers recommend a business's products and
categories, and turns that measurement into Actions. `/products/overview` is
the Shopping overview and `/products` the Products table (below); every product
holder opens its own page, `/products/:id` (the product detail page, below),
and a category's id opens its competitors and shopping prompts. Commerce reuses
Site Health acquisition and the shared audit system;
it does not own a crawler, response store, prompt store or opportunity store.
Present runtime is not evidence that credentialed manual gates passed.

## Catalog

Site Health's config-versioned extractor, analyzer and classifier emit generic
category and PDP facts. The config-versioned Commerce projector creates catalog
rows from crawled pages only for brands whose confirmed business model, primary
or secondary, sells a catalog; unknown context fails closed. Any business can
add products from a Shopify store, a Merchant Center feed or the CSV template
([catalog import](#catalog-import)). The catalog read reports whether crawl projection is applicable,
not applicable (a recognized model that sells no catalog) or unknown (no
recognized model confirmed); the header and the empty catalog say which instead
of telling every business to run a crawl.

Structured Product price is preferred; when it is absent, a validated visible
PDP price is retained with its evidence path. The normalized, in-scope declared
canonical PDP URL is the catalog identity when present; the final delivered URL
is its resolution base and fallback, or the admitted URL when delivery
provenance lacks one. The admitted URL remains crawler identity. Imports
match existing products by URL, SKU or GTIN (by name and brand when a row has
none of them); projection matches by URL.

A product page with SKU, GTIN, MPN, or a name with a price is a product. An
unidentifiable "product" page that lists product cards is projected as the shelf
it is; one that lists none (a sold-out PDP) is skipped, so its breadcrumb cannot
take over a real category. A category needs a real name: a nameless listing is
skipped, and "Uncategorized" (the platform default) names no category. Products
without a category read as uncategorized; no sentinel row is stored, and rows
named "Uncategorized" from earlier writers are left out of the read.

Imports and explicit edits are append-only observations. Current product
rows are read projections whose `field_sources` identify the exact observation
and version controlling every field. Import authority (field-source kind `csv`
for every import format, with the format beside it) is not silently overwritten
by later crawl projection. Imports are content-hash idempotent, read the
project's products once into an in-memory identifier index, and expose bounded,
row-level outcomes.

### Catalog import

Add products ([sources](../frontend/services/api/src/commerce/catalog-sources.ts),
[admission](../frontend/services/api/src/commerce/import.ts)) takes three
sources into one admission path (CM3):

- **Shopify store**: a domain whose public `/products.json` is fetched page by
  page ([storefront fetch](../frontend/services/api/src/commerce/shopify-store.ts))
  through the shared safe fetcher, only for the project's own hosts or a
  `*.myshopify.com` store (redirects included), within configured page, byte
  and deadline bounds. Variants become a price range (`price` the lowest,
  `price_max` the highest); the first image is the product image; the product
  type and the first configured number of tags become categories. The
  storefront list has no currency, so its prices carry none.
- **Merchant Center feed**: CSV, TSV, XML (RSS or Atom) or Content API JSON with
  Google's field names. Items sharing `item_group_id` become one product with
  its variants and price range (variants priced in two currencies are
  rejected); `product_type` is the category path; prices such as `59.00 EUR`
  are parsed, and ambiguous ones (`$59`, `1,299.00`) are rejected, not guessed.
- **CSV template** (downloadable in the dialog): `title` and `brand` required;
  `description`, `price`, `currency`, `link`, `image_link`, `category` (a path
  `A > B`, several separated by `|`), `sku` and `gtin` optional.

`POST /commerce/catalog/imports` stages the source: it keeps the raw content
(the fetched pages for a store) and returns the proposed category tree, the
products ready and the rows that cannot be imported. Nothing reaches the
catalog yet, and the same content returns the earlier import. A store is
fetched with no transaction open; the import is stored afterwards.
`POST /commerce/catalog/imports/{import_id}/apply` applies it once the person
confirms the tree, leaving out the categories they cleared and everything under
them: products join every category on their kept paths, the categories record
their parents, and the result lists added, updated, unchanged and rejected rows,
rejected first with each row's reason (bounded by `import_error_limit`).
Applying twice returns the first result. A row whose identifiers belong to two
products is rejected (`identity_conflict`). A row matched by an identifier
whose URL differs from the product's keeps the product's URL and records the
new one on its observation as `alias_url` (the SKU merge policy). The applied
import records a catalog revision, which queues the answer backfill.

### Edit and archive

`PATCH /commerce/products/{holder_id}`
([edits](../frontend/services/api/src/commerce/edits.ts)) edits a catalog
product's name, brand, description, price, currency, URL, image, SKU, GTIN, MPN
and category set; only the fields sent change. Each edit appends a
`source_kind = 'edit'` observation with `edit_version` and points the edited
fields' `field_sources` at it. An edited field wins over crawl projection
(scalars, breadcrumb categories and shelf links alike) and over CSV until a
later import changes that field: the edit keeps the value the field last
imported, and an import row repeating it leaves the edit in place while any
other value replaces it (a new category set replaces the edited set whole). A
row naming no current URL, SKU or GTIN still matches the product whose edit
replaced the identifier it repeats, so re-importing a file never splits an
edited product. An edit claiming another product's URL, SKU or GTIN is refused
(409). The image is the product's `image_url`, set by an import or an edit; the
detail read shows it before any shopping card's. An edited price ends an
imported variant range.

`PUT /commerce/products/{holder_id}/lifecycle` archives
(`lifecycle_state = 'archived'`) or restores a product, also as an edit
observation. An archived product leaves the catalog read and its category
counts, the Products table's My catalog and All products (it lists under
`source=archived`), catalog revisions and so new answer matching, audit
prompt context (its approved prompts freeze no target, rather than refusing
the audit), the commerce Actions' product reads and competitor discovery (a
target, 404); its observations and answers stay, and its page still opens with
a Restore control. Every edit, archive and restore records a catalog
revision (`source_kind = 'edit'`) when the matching identity changed. "Add to
tracking" on an AI-observed competitor (an All products row or its page)
approves the candidate through the competitor decision route (CM6).

Catalog writers (import, projection, edits, discovery publication, AI-observed
competitors) serialize on the project row with `FOR NO KEY UPDATE`, which still
excludes each other and a project delete but no longer blocks the project's
foreign-key inserts (audits, crawls, queue writes) while a large import runs.
Permanent projection failures (missing source analysis, unreadable facts, no
usable URL) end the task at once with a specific code instead of retrying.

The header shows projections in flight, then failed or cancelled projections of
the latest projected crawl only. While work is in flight it polls only the
projection state, then re-reads the catalog once when that reports nothing in
flight. The catalog read is navigation: product and category names, memberships
and counts, never a row's evidence; products are listed first by name up to the
configured `catalog_product_limit`, beside the full product count. Categories
are ordered by descending product count, then name, each with its `parent_id`;
the Products sidebar nests them. A category's parent
(`parent_category_id`, always a category of the same project, never a cycle)
comes from an applied import's paths, which replace it, or from crawled
breadcrumbs, which only fill a category that has none.

## Products table

`GET /commerce/products?source=catalog|all|archived&category=&window=&engine=&prompt_set=&q=&sort=&cursor=&limit=`
([products read](../frontend/services/api/src/commerce/products.ts)) is one
keyset-paged SQL read of every product holder's metrics. `source=catalog`
lists active catalog products; `all` adds approved competitors and pending
AI-observed competitors (CM6), never rejected, excluded or unreviewed
discovery candidates; `archived` lists archived catalog products alone. A category narrows products to its members and
competitors to those targeting it or one of its products; `q` matches name,
brand or URL.

Scope is the successful executions completed in the window (7, 30 or 90 days,
`products` in `config/commerce.ts`; no previous-period deltas, CM8), of one
engine and one prompt set when filtered, whose answer has a match pass. Each
answer counts once, through its latest pass; branded comparisons stay out, as
they stay out of the AI Shelf. A holder holds at most one slot per execution,
at its best rank (a ranked slot beats an unranked one, a carousel card's rank
wins over a text-list rank). Per holder (formula version 1):

- Visibility: executions with a slot ÷ executions in scope; null with none.
- Appearances: executions with a slot; 0 is a real zero.
- Win rate: ordered appearances at rank 1 ÷ ordered appearances; null with none.
- Position: mean best rank over ordered appearances; null with none.
- Mentioned price: per execution the best-placed quoted price, then the median
  of those in the catalog currency (a competitor or a product without one uses
  the most quoted currency); other currencies are counted, not converted.
- Catalog price: the catalog price as a min–max pair (variants carry no price
  yet); null is unknown.
- Merchants: distinct merchant domains the answers name, by executions, up to
  `merchant_limit`.

Sorts are visibility, win rate, position (each best first) or name; the cursor
is bound to the filters and a cursor from other filters is refused (422).

The screen puts the My catalog / All products / Archived switch, search, window, engine,
prompt set and column settings in the top control strip; the catalog's
categories with their product counts sit beside the table, and the chosen
category's own page opens from there. Hidden columns are a per-browser
preference and leave the read unchanged. Export writes the rows on screen in
the shown columns, a missing value as an empty field and a count of quotes in
other currencies in brackets after the price, as the table shows it beside the
price (even when none was quoted in the row's own currency). Checked catalog products
start competitor discovery (at most `COMMERCE_TARGETS_MAX`); competitor rows
cannot be checked. Every row links to its holder's page with the table's
window, engine and prompt set, and the page's Back link returns them.
Unavailable, unknown, none and zero render as different values.

## Product detail page

`GET /commerce/products/{holder_id}?window=&engine=&prompt_set=`
([detail read](../frontend/services/api/src/commerce/product-detail.ts)) reads
one holder over the same executions as the table: its row is the table's read
narrowed to that holder, so the two never disagree, and a holder the table
would not list (rejected, unreviewed discovery, another project's) is not found
(404); an archived catalog product still has its page. Beside the row it
returns, from the same scoped slots and bounded by `products.detail` in
`config/commerce.ts`:

- the catalog description, and the image an edit set, else that of the
  holder's latest shopping card (null when neither has one);
- for a catalog product, its editable record (lifecycle state, price,
  currency, identifiers, edited image and category names); null for a
  competitor;
- competing products: holders with a slot in the same executions, by shared
  executions, with how often each ranked above this one and its mean rank;
  only holders the table lists, so a competitor rejected after the answers
  drops out and every row opens a page;
- merchants, the citations of the executions it appeared in (by URL) and their
  fan-out queries (from each answer's settled analysis), each by executions;
- per prompt (it appeared for, or targets it): executions, appearances,
  visibility, win rate and position over that prompt's executions;
- the executions it appeared in, newest first, with best rank and `won`,
  `lost` or `unranked`, and their total;
- for an owned product, the Actions not done or dismissed whose live commerce
  Opportunities target it.

The page shows the header (brand, holder, image, description, link), the KPIs
(visibility, win rate, position, appearances, mentioned and catalog price,
with the table's missing states), the sections above (an answer opens the
shared execution evidence drawer), and the window, engine and prompt-set
filters. An owned product adds Setup: its Actions (each with Work with the
agent, and Work with the agent on the product's page), competitor discovery
and review, and hero-product prompts. Commerce Actions come from measured
answers, so the page has no Generate action of its own. A category's page
holds its competitor discovery and shopping-prompt matrix.

## Shopping overview

`GET /commerce/overview?window=&category=`
([overview read](../frontend/services/api/src/commerce/overview.ts)) reads the
same scope, answers and slots as the Products table and the product detail
page (their shared `scopedSlots` CTEs) over the catalog and its approved and AI-observed competitors, in one
SQL read. `/products/overview` draws it; the sidebar's Commerce group holds
Overview and Products. Per window (the table's windows):

- Ranking: brands, then products, by appearances, up to `ranking_limit`
  (`overview` in `config/commerce.ts`), with visibility, win rate and position
  as the table defines them. A brand folds its products' slots to one per
  execution at the best rank. Share of Shelf is for brands only: the brand's
  product slots ÷ every product slot in scope, null when no answer held a
  product. A holder with no brand is unknown, not a brand: it stays out of the
  brand ranking and its slots stay in the denominator.
- Most and least visible: catalog products by appearances, up to
  `extremes_limit` each; the two lists never share a product.
- Top merchants: merchant domains by answers naming them, with the number of
  holders sent there, up to `merchant_limit`.
- Top fan-out queries: of the answers that held a product, the search queries
  their latest response analysis captured, by answers, up to
  `fanout_query_limit`, beside how many of those answers exposed their
  queries and how many ran no search; the rest (searched without exposing
  queries, or not analyzed yet) are unknown.

A category narrows every list to its holders (as the table's category filter
does) and reads its latest Commerce audit snapshot: the category-target metrics
(Product Visibility, Share of Shelf, Average Shelf Position, First-Position Win
Rate) keep their definitions and are not windowed. A category outside the
project is not found (404); a category no audit measured has no snapshot
(null, "not measured"), and one measured with no successful answer reports
visibility unavailable. The overview shows no previous-period deltas (CM8).

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
bounded and rejects owned-name leakage; a category's branded comparisons are the
one bounded exception (below). Admission binds a prompt to the target
through the category's own name, its products and category terms, and for a
product its name and description. Archived products never feed the context.
Generated and manual prompts use the shared Prompt owner and stay disabled until
approval. Generation reserves one workspace model-call quota unit per target
before dispatch, closes the context read before model I/O and revalidates
targets and capacity before writing. Each target keeps the prompts it admitted:
a weak batch or a later model failure does not discard earlier targets' paid
prompts, and only a request that admitted nothing is unavailable (503). The
screen says when fewer prompts than asked were usable.

**Category matrix.** A category target generates a shopping matrix in one
bounded model call: buyer contexts × intent stages (configured: 3 contexts ×
`consideration` and `decision`), one non-branded prompt per cell, plus branded
comparisons so that branded prompts stay within `branded_share` (0.2) of the
batch. All of these numbers live in `buyer_prompts.matrix` in
`config/commerce.ts`. The context is stored as the prompt's persona and the
stage as its buyer stage; admission keeps at most one prompt per cell and the
configured number of contexts. Non-branded prompts keep the owned-name
rejection. A branded comparison must name the owned brand and is filed in the
shared `comparison` cohort, so `prompts.branded` is true and it stays out of
organic Visibility and the AI Shelf snapshot (no schema change). The Buyer Prompts read returns `branded`,
`buyer_stage` and `context` per prompt.

**Hero products.** Per-product prompts exist only for hero products the user
picks (configured 3 each, `buyer_prompts.default`). A generate request naming a
product target must set `hero: true` or it is refused (422
`commerce_prompt_hero_required`) before any quota or model call; every other
product is covered by its category's matrix. The hero pick is a per-request
choice, not stored on the product.

The category's prompts section opens the standalone matrix sheet
(`category-matrix-sheet.tsx`), which generates the matrix, shows coverage
(contexts × stages filled, branded count) and approves prompts one at a time.

For one target, the prompts section opens the shared audit launcher over only
its approved prompt IDs and explains why launch is disabled until one is
approved; provider selection, repetitions, estimate, capacity and execution stay
with the audit owner. Audit creation freezes approved prompts, the current
catalog identity of each distinct target once, approved competitors and the
parser, matcher, formula and template versions. Scheduled Commerce runs enter
the same freeze, execution, observation and snapshot path. After a launch the
section follows the run's event stream and refreshes the product metrics and
Actions when it finishes. Typed text belongs to one page and resets on leaving it.

## Catalog matching in every answer

Products are matched in every successful answer, brand and Commerce runs alike
(CM1), for a project whose plan grants `commerce` and whose catalog or approved
competitor list is non-empty; any other project records nothing extra.

A **catalog revision** (`commerce_catalog_revisions`) is an immutable, numbered
copy of the project's matching identity: active products with their category
memberships, and approved competitors with their targets. It records what
created it (`import`, `projection`, `competitor_decision` or `audit`) and is
written only when that identity's hash changed. CSV imports and competitor
decisions record one in their own transaction; crawl projection, which writes
one page per task, asks through a coalesced request that keeps the earliest
deadline, so a long crawl records at most one revision per
`projection_delay_seconds` (120); every audit admission, of
any scope, records one when the catalog changed since the last and freezes it
as `configuration.commerce_catalog`.

A **match pass** (`commerce_match_passes`) is one derivation of observations
from one stored answer under one revision and one parser/matcher version pair,
unique on those four, so a repeated derivation is a no-op. Every observation
references its pass. `live` passes are written with the answer; a buyer
prompt's answer is matched against its target's frozen products and approved
competitors (the AI Shelf below, resolver included), and any other answer
against the whole frozen revision. An answer no buyer prompt targets has no
`target_*`, keeps only the spans that name a catalog product or approved
competitor plus every organic carousel card, never calls the resolver and
creates no AI-observed competitor.

Each new revision queues one `commerce_answer_matching` analytics task. It
re-matches the successful answers of the last `backfill_days` (30) that have
no pass for that revision, `batch_size` answers per transaction, as `backfill`
passes. Backfill is deterministic only: token and URL matching and carousel
cards, never the model resolver, so a span that would need it reads
`unavailable`. A revision a newer one superseded stops before its next batch,
since the newer revision's task covers the same answers. Leases, retries and cancellation stay
with the shared analytics worker. Raw answers are never rewritten: reads use
the latest pass per answer (highest revision, then newest) and keep older
passes as history. Policy lives in `answer_matching` in `config/commerce.ts`.

## AI Shelf

Successful Commerce executions create append-only recommendation observations
linked to the raw response artifact, their match pass and any persisted
Citations. Answers split
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
quota-refused output preserves unresolved evidence. Each observation records the
resolver outcome (`resolved`, `omitted` by the call, `not_needed`, `failed` or
`unavailable`), the model called and the resolver template version. An
AI-observed competitor is created only from a resolved PDP URL that the answer
itself contains, that is not merely a citation, and that is not on the
business's own hosts. Its observation is classified by the candidate's state
when the answer is recorded: approved holds a slot like a frozen competitor,
pending is `ai_observed_competitor` (shown, outside the share) and rejected is
excluded from the shelf.

ChatGPT shopping carousels are read from the stored provider response
([parsing](../frontend/services/api/src/search-surfaces/parsing.ts)), beside the
text spans: each organic `chat_gpt_products` card becomes one ordered slot with
`surface_kind = 'shopping_result'`, ranked by its one-based position among the
organic cards of its carousel; text spans stay `recommendation`. A card records
its title, tag, price and currency, merchant name, link and host, ChatGPT's
product key and first image URL; every field but the title is optional and an
absent one is stored as absent, not zero. The card's rating is never read.
Sponsored items stay with Ads and never hold a slot or a position. Cards are
matched deterministically and never sent to the resolver: first by link
(canonical page, tracking parameters ignored) to a frozen product or approved
competitor, then by the product key a card in the project was matched to before
this answer was captured (used only when that holder is on this target's frozen shelf or is this
target's AI-observed candidate), then by the name rules above over the title.
An unmatched card whose link is off the business's hosts creates or reuses an
AI-observed competitor; the card is that evidence.

The persisted, formula-versioned snapshot per target and audit exposes:

- Product Visibility: successful target executions with an owned appearance
  divided by all successful target executions.
- Share of Shelf: owned slots divided by owned plus approved-competitor slots;
  pending AI-observed competitors hold no slot.
- Average Shelf Position: mean owned rank across ordered observations.
- First-Position Win Rate: ordered executions whose first slot is owned divided
  by ordered executions.

A snapshot reads each answer's latest match pass, so a backfill that lands
before an audit finalizes is the pass it counts; a persisted snapshot keeps the
exact observation IDs it was computed from.

A slot is one product or competitor per execution, at its best rank, so an
answer naming a product three times recommends it once. In an execution with a
carousel, a card's rank wins over a text-list rank: the carousel orders the
slots and names the execution's first slot. Only executions of unbranded
prompts count: a branded comparison names the owned brand by design, so its
executions and observations stay out of the snapshot, as branded cohorts stay
out of organic Visibility. A target with no
successful execution reads Product Visibility as unavailable, not zero, and
raises no `cited_alternatives` Opportunity; other metrics without a
denominator are unavailable.

Category snapshots feed the `cited_alternatives` Opportunity. The per-product
Opportunities read the Products read instead, over the configured window
(`PRODUCT_METRICS` in the [opportunity config](../frontend/services/api/src/config/opportunity.ts))
for every active owned product, ending when the refresh resolved its sources:

- `product_not_mentioned`: no appearance in the window's answers;
- `price_mismatch`: the median quoted price in the catalog currency is
  outside the catalog price (or variant range) by more than the configured
  share; quotes in other currencies are not converted;
- `losing_position`: the win rate over ordered appearances is below the
  configured rate;
- `merchant_absent`: the answers name merchants for the product and none is an
  owned host (the project website or an owned domain).

Each rule needs a configured number of samples (executions, quotes in the
catalog currency, ordered appearances, merchant answers); below it the product
has too little data and raises nothing, and a product without a catalog price
raises no price finding. A finding stores the window, the reading, the
threshold and the row's figures, with the observation IDs it was read from. A
declared Action freezes each finding's rule as a `product_metric` check that
reads the same metric over the answers completed after go-live
([Opportunities](opportunities.md)).

No route reads one target's snapshot any more (`GET ai-shelf` and the
target detail were retired with the product detail page). The MCP and Agent
tool `read_ai_shelf` returns the Products read's per-product metrics (with
the categories and their counts), or, given a `holder_id`, the product detail
read.

## Entry points and lifecycle

The [TypeScript Commerce API](../frontend/services/api/src/routes/commerce.ts)
authorizes persisted reads, catalog imports and explicit decisions using active
workspace membership and run/write capabilities. The
[discovery executor](../frontend/services/api/src/commerce/discovery.ts) uses the
shared Site Health safe fetcher, acquisition controls, robots policy, parser and
classifier. Provider calls and candidate verification finish before the worker
locks the live claim and appends the attempt, pending candidates and queue
outcome; no transaction spans network I/O. A target removed before execution or
publication terminalizes with `commerce_target_unavailable`.
[Catalog projection](../frontend/services/api/src/commerce/projection.ts) consumes
persisted Site Health analyses through analytics tasks the Site Health
[analyze executor](../frontend/services/api/src/site-health/analyze-task.ts)
enqueues for catalog page kinds. Project and target IDs are re-authorized; an
object ID alone is never a catalog boundary.

[Audit context](../frontend/services/api/src/commerce/audit-context.ts) freezes
target identity and the catalog revision before shared audit execution;
[catalog revisions](../frontend/services/api/src/commerce/catalog-revisions.ts)
own revision recording and [answer matching](../frontend/services/api/src/commerce/answer-matching.ts)
the backfill;
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
publishing, JavaScript rendering, snapshot
trends, merchant dashboards, family aggregation, sentiment and composite
product scores are not part of the shipped feature.
