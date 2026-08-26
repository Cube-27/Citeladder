# Best&Less Commerce Catalog Eval — 100 products

Crawled: 2026-08-26 | Locale: en-AU

## Scope

- 10 live Best&Less leaf commerce categories
- 10 products per category
- 100 products total
- 100 unique PDP URLs
- Product selection is the first 10 **real product cards** in each category's live `Recommended` order.

## Categories

1. Women's Dresses — `https://www.bestandless.com.au/womens-dresses`
2. Women's Tops & T-Shirts — `https://www.bestandless.com.au/womens-tops-tshirts`
3. Women's Pants — `https://www.bestandless.com.au/womens-pants`
4. Women's Flannelette Pyjamas — `https://www.bestandless.com.au/womens-flannelette-pyjamas`
5. Men's T-Shirts — `https://www.bestandless.com.au/mens-tshirts`
6. Men's Underwear — `https://www.bestandless.com.au/mens-underwear`
7. Baby Pyjamas — `https://www.bestandless.com.au/baby-pyjamas`
8. Baby Blankets — `https://www.bestandless.com.au/baby-blankets`
9. School Jumpers — `https://www.bestandless.com.au/school-jumpers`
10. School Hats — `https://www.bestandless.com.au/school-hats`

## Ground-truth contract

The reference set asserts only values observed from live category-grid crawl output: category, product order, title, PDP URL, displayed current/original price, sale/badge state, and the stable identifier encoded in the PDP URL.

`description`, `sku`, and `barcode_gtin` are intentionally null in this v1 catalog-discovery eval. They should **not** be treated as expected null outputs from CiteLadder; they are simply outside the asserted ground truth because fabricating them would weaken the eval. A later PDP-schema eval can enrich these fields from live PDP extraction.

## Suggested scoring

- **Category discovery precision:** selected category URLs must be true product-grid categories, not editorial hubs.
- **Product classification precision:** product slots must contain PDPs, never subcategory/filter/navigation URLs.
- **Top-10 recall:** how many of the 10 reference PDP URLs are discovered for each category.
- **Top-10 ordering:** compare discovered order against `product_rank` when CiteLadder claims to preserve site order.
- **URL deduplication:** one canonical product URL per row.
- **Title accuracy:** normalized title should preserve the reference product identity.
- **Price accuracy:** exact AUD price is a hard field; do not hallucinate, average, or infer.
- **Identifier accuracy:** preserve `product_identifier`; `style_code`/`catalog_numeric_id` are deterministic derived helpers.

## Important negative case discovered during crawl

`https://www.bestandless.com.au/baby-rompers` is an editorial/category hub with subcategory tiles rather than a product grid. A commerce discovery pipeline should classify it as a category/hub and **must not** promote those subcategory URLs as products. This was intentionally excluded from the 100 positive product references but is a useful regression case.
