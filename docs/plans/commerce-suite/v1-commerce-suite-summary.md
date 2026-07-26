# Commerce Suite (M2a, M4 Shopify, M5 A1/A2) — Overview

## What this delivers

Grows the shipped `/products` slice into a Commerce workspace and adds the backend
machinery behind it, in one combined PR:

1. **M2a — Analyzer v2.** Re-scores every persisted answer for price relation
   (match / higher / lower), attribute mentions, buyer-destination merchants, and
   competitor co-placement, plus a win rate. Adds the shopping-surface slot column
   and the (empty, disabled) surface gate so future probe surfaces can never
   contaminate brand metrics. v1 data stays readable and is labelled, never
   re-written.
2. **M5 Layer A1 — GA4 platform attribution.** Reads GA4's already-attributed
   ecommerce aggregates and classifies `(sessionSource, sessionMedium)` with the
   shipped rule table → revenue / orders / AOV / conversion by AI source. Ships
   with **only the GA4 integration — no Shopify required.** Includes a persisted
   per-connection fallback to default-channel-group granularity if GA4 rejects
   `itemId × sessionSource`, always labelled, never silently degraded.
3. **M4 — Shopify catalog + orders.** One read-only Shopify connection (GraphQL
   Admin API, offline token, `read_products` + `read_orders` only). Syncs the
   catalog (adopt/update/never-delete merge), derives feed issues, and lands
   sanitized, immutable `OrderFact` revisions with a per-order monotonic sequence.
   No customer PII is ever persisted.
4. **M5 Layer A2 — order-level referrer.** Classifies each Shopify order's
   sanitized `landing_site` / `referring_site` / UTM keys with the same rule table
   → deterministic per-order, per-SKU revenue. A1 and A2 are **cross-checks, never
   summed**; the plan renders both plus the backend-projected `A1 − A2` delta.

## Frontend

`/products` becomes a three-tab workspace — **Catalog | Visibility | Attribution** —
keeping the route and WAI-ARIA tab behavior, reading only persisted projections.
To avoid long vertical pages, Visibility and Attribution each get **nested
sub-tabs** (Overview / Attributes / Destinations / Co-placement; and Overview /
By source / By product), and the product drill-down gets evidence-kind sub-tabs
(Mentions / Attributes / Destinations). Only one panel renders at a time. Catalog
adds feed-origin badges, per-SKU feed health, and Shopify sync state. All new
metrics render null as an em-dash; the statistical namespace (if ever offered)
renders only in a separate labelled card. Nav label becomes "Commerce" (href stays
`/products`).

## Explicitly out of scope

M2b shopping-intent fanout, M2c probe connectors, all of M3 (Opportunities),
BigCommerce, Google Merchant Center, M5 Layer C / `LiftEstimate`, holdout-geo
incrementality, and any checkout/feed write-back.

## Key locked decisions

- **Fastest-value path** (§1 of the source doc): M2a → A1 → Shopify orders → A2.
- **Shopify = GraphQL Admin API `2026-07` only** (no REST; new greenfield app).
- **Mixed currency partitioned by ISO code** — never converted or summed (no FX source).
- **Attribute seed catalog** `DEFAULT` + `footwear` / `outerwear` / `accessories`
  (matches the existing demo catalog).
- **Single combined PR** for all approved scope.
- **`require_active_workspace`** on all new flat routes (matches `products.py`).

## Verification constraints (this sandbox)

No LLM, GA4, Shopify, or OAuth credentials are configured. All backend
verification uses fixture answer text + persisted `RawResponseArtifact` re-scoring
(M2a) and injected `httpx.MockTransport` connector seams (GA4/Shopify). Frontend
verification uses global-fetch stubs and MSW handlers. No live audit, sync, or
provider call is made.

## Source

Full detail in `v1-commerce-suite.md`. Derived from
`docs/plans/v4-commerce-suite-m2-m5.md` (M2a, M4-Shopify, M5-A1/A2 only).
