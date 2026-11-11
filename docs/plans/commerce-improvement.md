# Commerce improvement: product tracking across every answer

Status: planned with the owner, 2026-11-11 (CM1 to CM9 decided). Not started.
It changes the shipped [Commerce](../commerce-intelligence.md) feature, which
remains the owner document; each PR updates it as behavior ships.

**Delivers**

- Products are matched in **every** successful answer (brand and Commerce runs),
  and a catalog import re-matches the stored answers of the last 30 days, so a
  product has numbers the day it is added.
- ChatGPT **shopping carousels** are captured as structured product slots (rank,
  price, merchant), beside the text shelf that the other engines keep.
- A **Products table** (My catalog / All products, nested category sidebar,
  metric columns), a **product detail page**, and a **Shopping overview**,
  replacing today's single split-pane `/products` screen.
- Catalog in from a **Shopify storefront URL**, a **Merchant Center feed file**
  or the **CSV template**, with a category-tree review step and an import
  results view; products can be **edited and archived** in the app.
- **Shopping prompts** generated per category as buyer contexts × intent stages,
  with per-product prompts only for hero products.
- The public site, blog, product docs and changelog describe what shipped (CM9).

**Not in this plan:** time-range comparisons (change vs previous period) and
metric charts over time (CM8, follow-up), product ratings and attribute
extraction (CM4), shopping
carousels from Google AI surfaces, Merchant Center API sync, Shopify OAuth or an
app install, revenue and order facts, feed remediation or publishing, sentiment
per product, and composite product scores.

## Owner decisions

| ID | Decision |
|---|---|
| CM1 | Product metrics read **all runs**: the catalog is matched against brand and Commerce answers alike, and importing or changing the catalog re-derives product observations from the stored answers of the last 30 days as a new versioned pass; raw answers are never rewritten. (Owner, in chat, 2026-11-11: "All runs + 30-day backfill".) |
| CM2 | Structured shopping capture starts with the **ChatGPT carousel**: verify the product-card fields with one live DataForSEO task, then rank products by carousel slot with the card's price and merchant. Text parsing stays for every other engine. (Owner, in chat, 2026-11-11: "ChatGPT carousel first".) |
| CM3 | New catalog sources: **Shopify storefront URL** (public `products.json`), **Merchant Center feed file**, **CSV template with a category-tree review and import results**, and **product edit and archive**. (Owner, in chat, 2026-11-11, all four selected.) |
| CM4 | Per-product answer details: **mentioned vs catalog price** and **merchants**. Ratings and attribute extraction are not in scope. (Owner, in chat, 2026-11-11; ratings were first selected, then removed the same day after the live probes returned no card ratings: "remove rating implementation from plan".) |
| CM5 | Layout: **Shopping overview + Products table + product detail page**; competitor and prompt setup move into the detail page. (Owner, in chat, 2026-11-11.) |
| CM6 | **My catalog / All products**: approved and AI-observed competitor products get rows and detail pages with the same metrics; one click adds a discovered product to tracking. (Owner, in chat, 2026-11-11.) |
| CM7 | Shopping prompts are a **category matrix**: per category, buyer contexts × intent stages, mostly non-branded with about 15–20% branded comparisons; per-product prompts only for hero products the user picks. (Owner, in chat, 2026-11-11.) |
| CM8 | Time-range comparisons (change vs the previous period, charts by day/week/month) come **later**, not in the first release. (Owner, in chat, 2026-11-11.) |
| CM9 | The final phase updates **marketing, blog, docs and changelog** for the shipped feature. This is the owner's request to change public copy for this feature. (Owner, in chat, 2026-11-11: "add updating marketing, blog, docs and changelog as final phase of plan".) |

### Defaults this plan takes (agent proposals, not owner decisions)

Each is the conservative reading of the decisions above; the owner can overturn
any of them before its PR starts.

- **Backfill is deterministic only.** The 30-day re-match (CM1) runs token
  matching and carousel parsing, never the model resolver, so it costs no model
  quota. Live runs keep today's resolver, charged as B9 and the existing quota
  reservation already say.
- **All-runs matching needs the `commerce` capability and a non-empty catalog or
  approved competitor list.** A project without either pays nothing extra.
- **Shopify URLs** are accepted for the project's own hosts and any
  `*.myshopify.com` store, fetched through the shared safe fetcher.
- **Sponsored carousel cards never hold an organic slot.** `chat_gpt_ad` items
  stay with the Ads feature; only organic product cards enter the shelf.
- **A date-range filter ships without deltas.** The table and detail read a
  chosen window (7/30/90 days, from config); CM8's comparisons and charts follow.

## Where we are (verified 2026-11-11)

- One `/products` screen ("Commerce Suite", Analyze group): a catalog rail and
  one target's AI Shelf (4 tiles), guided next step, Actions, holders,
  competitors and prompts (`frontend/components/products/`). No table, no
  charts, no cross-catalog read; `GET ai-shelf` requires a target.
- Observations come only from Commerce audits, parsed from answer text
  (`commerce/shelf-parsing.ts`); `surface_kind = 'shopping_result'` is only a
  label the resolver may return. Snapshots are one per audit and target
  (`commerce_shelf_snapshots`).
- `search-surfaces/parsing.ts` keeps only `chat_gpt_ad` items (including those
  inside `chat_gpt_carousel`); organic product cards are dropped today.
- **Verified live, 2026-11-11** (two DataForSEO ChatGPT LLM-scraper tasks, US /
  English, `force_web_search`, $0.0012 each, model reported `gpt-6`): shopping
  prompts return a `chat_gpt_products` item (its own `rank_absolute` in the
  answer) whose `items` are `chat_gpt_products_element` cards with `title`,
  `tag` (ChatGPT's label, e.g. "Best overall value"), `price` (number),
  `currency`, `merchants` (one merchant name as a string), `url` (with
  `utm_source=chatgpt.com`), `domain`, `images`, `product_id` (ChatGPT's own
  product key), `rating`, `product_ids` and `id_to_token_map`. Field presence
  varies: a running-shoes answer filled price, currency, merchant, URL, domain
  and `product_id` on all five cards; a whey-protein answer filled only `title`
  and `tag` on four cards. `rating` was null on every card in both. The result
  also carries `brand_entities` (category `product` for carousel items),
  `fan_out_queries`, `search_results` and `item_types`.
- Observations already store `observed_price`, `observed_currency`,
  `merchant_url` and `merchant_domain`; there is no category
  hierarchy (`commerce_categories` is flat) and `lifecycle_state`,
  `edit_version`, `observed_external_id` and `source_kind = 'edit'` have no writer.
- Buyer prompt admission rejects owned names, so branded prompts (CM7) need a
  bounded exception.
- Backlog "Commerce review" items folded in here: the slim catalog read, the
  import outcome view, the SKU merge policy and product edit/archive. Tavily
  country targeting stays in the backlog.

## Metric definitions (per product holder, formula version 1)

Scope is the filtered set of successful executions: window, engine, prompt set
or topic. Each holder (owned product, approved competitor, AI-observed
competitor) holds at most one slot per execution, at its best rank.

| Metric | Definition | Empty state |
|---|---|---|
| Visibility | Executions where the holder has a slot ÷ executions in scope | Unavailable with no execution in scope |
| Appearances | Executions where the holder has a slot | 0 is a real zero |
| Win rate | Ordered appearances at rank 1 ÷ ordered appearances | Unavailable with no ordered appearance |
| Position | Mean best rank over ordered appearances; a carousel rank wins over a text-list rank in the same execution | Unavailable with no ordered appearance |
| Mentioned price | Median observed price in the catalog currency; other currencies are counted, not converted | Unavailable when none was quoted |
| Catalog price | Price, or min–max across variants | Unknown when the catalog has none |
| Merchants | Distinct merchant domains the answers send shoppers to, with counts | Empty list |

Win rate is conditional on appearing, so a product seen in 3% of answers can
win 34% of the answers it is in. The category-target metrics that ship today
(Product Visibility, Share of Shelf, Average Shelf Position, First-Position Win
Rate) keep their definitions and move to the overview's category view.

## PRs, in dependency order

### PR 1: ChatGPT carousel capture

- Fixtures: the two verified responses (see "Where we are"), trimmed and with
  image URLs replaced, under `test/fixtures/chatgpt-products/`: one with full
  cards, one with title-and-tag-only cards.
- `search-surfaces/parsing.ts`: parse each `chat_gpt_products` block into
  `shopping_result` items: card position (one-based within the block), title,
  tag, price, currency, merchant name, URL, domain, ChatGPT `product_id` and
  first image URL. Every field but title is optional; the card's `rating` is not
  read (CM4); ads keep their path.
- `commerce/shelf-parsing.ts`: cards become ranked slots with
  `surface_kind = 'shopping_result'`; text spans stay `recommendation`. Matching
  order: URL, then ChatGPT `product_id` (remembered on a matched product or
  AI-observed competitor), then the existing name rules. A card with a URL off
  the business's hosts can create an AI-observed competitor as today.
- Migration `0021_commerce_carousel.sql`: `observed_tag`,
  `observed_merchant_name`, `observed_external_product_id`,
  `observed_image_url` on `commerce_recommendation_observations`.
- Tests: parser against both fixtures; shelf parsing ranks carousel slots,
  matches a repeat card by `product_id`, and excludes sponsored cards.

### PR 2: Match the catalog in every answer, with a 30-day backfill

- Migration `0022_commerce_match_passes.sql`: `commerce_catalog_revisions`
  (project, revision number, product/competitor identity snapshot, created
  from which import, edit or decision) and `commerce_match_passes` (artifact,
  catalog revision, parser and matcher versions, mode `live|backfill`, unique
  on artifact + revision + versions). Observations reference a pass; `target_*`
  becomes nullable for answers that no buyer prompt targets.
- Audit context freezes the current catalog revision for **every** audit scope
  in a project with the capability and a catalog (default above), so brand runs
  produce observations too.
- New analytics kind `commerce_answer_matching`: on a new catalog revision, it
  re-matches successful executions of the last `backfill_days` (config, 30) in
  bounded batches, deterministic only, idempotent on the unique key, leased and
  retried by the shared analytics worker.
- Reads use the latest pass per artifact; older passes stay as history.
- Tests (PostgreSQL): a brand-run answer yields observations; an import
  backfills earlier answers once; a second backfill of the same revision is a
  no-op; workspace isolation on passes and observations.

### PR 3: Product metrics read and the Products table

- `GET /commerce/products?source=catalog|all&category=&window=&engine=&prompt_set=&q=&sort=&cursor=`:
  one keyset-paged SQL read over persisted observations returning the metric
  columns above per holder; the slim catalog read from the backlog.
- `/products` becomes the table: the category sidebar with counts (the
  current rail's categories, flat until PR 6 adds the tree), search, My catalog
  / All products, window, engine and prompt-set filters in the top control
  strip, column settings, CSV export, bulk find-competitors (limit unchanged).
  Clicking a catalog row opens `/products/:holderId`, which in this PR still
  renders today's target detail.
- No migration: the category-tree migration moved to PR 6 (the migration slot
  was held by other work when PR 3 ran).
- Replacement gate: inventory every `?target=` link (Actions, Agent, MCP,
  next-step links) before coding; all move to `/products/:id`; `?target=` is
  deleted, not redirected.

### PR 4: Product detail page

Header with name, brand, image, description and catalog price, then KPIs
(visibility, win rate, position, appearances, mentioned price, catalog price)
and:

- **Competing products**: holders that share executions with this one, by
  co-appearance.
- **Merchants**: where answers send shoppers for it.
- **Sources**: citations of the executions it appeared in.
- **Fan-out queries**: the queries those executions ran (from the existing
  fan-out capture).
- **Prompts**: per-prompt visibility, position and win rate.
- **Answers**: each execution with win/loss and rank, opening the existing
  answer viewer.
- **Setup**: competitor discovery and review, hero-product prompts, and the
  Actions with Generate action / Work with the agent.

The `target-*` components and `GET ai-shelf` are retired (the split-pane
workspace already went in PR 3). `read_ai_shelf` (MCP/Agent) returns the per-product metrics.

### PR 5: Shopping overview

`/products/overview`: Brands / Products ranking by visibility, win rate and
position for the window, with Share of Shelf for brands only; the most and least
visible products; top merchants; top fan-out queries from answers holding a
product; category filter, where the category-target metrics live. Navigation:
Commerce becomes a group with Overview and Products. The read is
`GET /commerce/overview` over PR 3's shared answer and slot CTEs; no migration.

### PR 6: Catalog ingestion

- Add products dialog with three tabs: **Shopify store** (domain → paginated
  `products.json` through the safe fetcher; variants → price range, images,
  product type and tags → categories), **Merchant Center feed** (CSV, TSV, XML
  or JSON with Google's field names; `item_group_id` → variants, `product_type`
  → category path, `price` "59.00 EUR" parsed), **CSV** (downloadable template:
  `title`, `brand` required; `description`, `price`, `currency`, `link`,
  `image_link`, `category` as `A > B`, `sku`, `gtin` optional).
- One admission path in `commerce/import.ts` for all three, keeping content-hash
  idempotency, append-only observations and URL/SKU/GTIN matching. The SKU merge
  policy from the backlog: a SKU match with a different URL updates the
  existing product and records the new URL as an alias observation.
- Migration `commerce_category_tree` (next free number; moved here from
  PR 3): `parent_category_id` on `commerce_categories`; projection and import
  write the parent from breadcrumb or `A > B` paths, and the Products sidebar
  nests by it.
- **Category review step**: the proposed tree is shown for confirmation before
  products go live; confirming writes the categories.
- **Import results**: added, updated, unchanged and rejected rows, rejected
  first, with each row's reason.
- A new catalog revision triggers PR 2's backfill.

### PR 7: Product edit and archive

Edit name, brand, description, price, currency, URL, image, identifiers and
categories as `source_kind = 'edit'` observations with `edit_version`; an edit
wins over CSV and crawl until a later explicit import changes that field.
Archive sets `lifecycle_state = 'archived'`: the product leaves My catalog, new
matching and prompt context, and keeps its history; restore reverses it. "Add to
tracking" on an All products row approves the competitor candidate (CM6).

### PR 8: Category-matrix shopping prompts

- Per category: buyer contexts (config default 3) × intent stages (config
  default 2) generated in one bounded call, plus branded comparisons up to
  `branded_share` (config 0.2). Branded prompts are the bounded exception to the
  owned-name rejection and carry a `branded` flag.
- Hero products: the user picks products for per-product prompts (config 3
  each); other products are covered by their category's prompts.
- Same approval, quota reservation and shared Prompt owner as today; the sheet
  opens from a category in the sidebar and shows coverage as categories ×
  contexts × stages.

### PR 9: Actions from the new metrics

`product_not_mentioned` reads the per-product metrics over the window. New
rules, each with a config threshold: `price_mismatch` (median mentioned price
differs from the catalog price by more than a set share), `losing_position`
(visible but rarely first), and `merchant_absent` (answers send shoppers to
third-party merchants only). Verification reads later windows of the same
metric.

### PR 10: Marketing, blog, docs and changelog (CM9)

Runs after PR 9 merges and describes only what shipped; if a PR above is cut
or deferred, its feature is left out of the copy, not promised.

- **Marketing** (`frontend/lib/marketing-content/`):
  - `platform-pages-outcomes.ts`, the Product Visibility page
    (`/platform/product-visibility`): the new metrics and their definitions, the
    ChatGPT carousel, all-runs matching with the 30-day backfill, the Products
    table, detail page and overview. It also fixes the Share of Shelf text at
    line 166, which says only ordered answers count when all recognized slots
    do, and the FAQ "Do I need a Shopify connection?", which today says no
    Shopify sync is offered.
  - `platform-pages-improve.ts`: the "Is there a native Shopify sync?" FAQ
    (line 440) now names the storefront URL and Merchant Center feed imports
    (still no OAuth sync).
  - The other modules that mention Commerce, checked and updated only where
    they now say something untrue: `solutions.ts`, `platform-guides.ts`,
    `pricing.ts`, `nav.ts`, `llms.ts` and `ai-reference.ts`.
- **Blog** (`frontend/lib/marketing-content/blog-posts/`): one new post on
  tracking products in ChatGPT shopping answers, built on the shipped feature
  and our own probe findings (what a carousel card carries, why field fill
  varies), with no customer data. `buyer-prompts.ts` is updated for the
  category-matrix prompts (CM7).
- **Product docs** (`frontend/apps/docs/src/content/`): `commerce.md` rewritten
  for the Overview, Products table, detail page, catalog import (Shopify,
  Merchant Center, CSV template and fields), edit and archive, and the metric
  definitions; `prompts.md` for shopping prompts; `mcp.md` for the changed
  `read_ai_shelf` result.
- **Changelog** (`frontend/apps/docs/src/content/changelog.md`): one dated
  entry, in the existing format, summarizing the release.
- **Internal docs**: a final pass over [Commerce](../commerce-intelligence.md)
  (its "Current limits" in particular), [MCP](../mcp.md),
  [Agent](../agents.md), [Opportunities](../opportunities.md) and
  [Prompts and Visibility](../visibility-prompt.md) for anything a feature PR
  missed; this plan moves to complete in [plan status](ACTIVE.md).
- Validation: the marketing content and docs tests for the touched modules
  (`content.test.ts`, `blog-index.test.ts`, `count-words.test.ts`), following
  the `validate-change` skill for copy and docs.

## Validation

Per PR, only the focused native tests for the changed owners (`pnpm test:api
<files>` and the touched component tests); persistence work uses the real
PostgreSQL boundary with workspace isolation and provenance. CI runs the rest.
The commerce release gates in [release readiness](../release-checklist.md)
remain open and are not closed by this plan.

## Risks and open questions

- Price and merchant are filled only on some carousels; the empty states above
  cover the rest.
- ChatGPT's card `title` often carries variant noise ("in Grey, Size: 14 | …"),
  so name matching must tolerate it; URL and `product_id` matches come first.
- All-runs matching adds resolver calls to brand runs on catalog projects.
  B9 covers them as part of the run; if real usage shows a cost problem, the
  resolver can be limited to Commerce runs by config.
- The marketing page says Share of Shelf counts only ordered answers
  (`frontend/lib/marketing-content/platform-pages-outcomes.ts:166`), but the
  code counts all recognized slots. PR 10 corrects it (CM9); until then the
  public page stays as it is.
