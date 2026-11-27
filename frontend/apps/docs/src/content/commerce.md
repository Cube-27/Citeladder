---
title: 'Commerce and AI Shelf'
description: 'See how AI answers recommend your products: the Shopping overview, the Products table, each product page, catalog import and shopping prompts.'
group: 'Measure and understand'
order: 170
updated: '2026-11-11'
---

Commerce shows how AI answers recommend your products and your competitors' products. Open **Commerce** in the sidebar: **Overview** is the Shopping overview, and **Products** is the table of every product with its own page.

CiteLadder matches your catalog in every successful answer, from brand visibility runs and Commerce runs alike. When you add or change products, it also re-reads the stored answers of the last 30 days, so a new product has numbers the day it is added. Re-reading stored answers uses no credits.

## Add your catalog

Site Health crawls fill the catalog for businesses that sell a product catalog. Any business can also choose **Add products** and pick a source:

- **Shopify store:** enter your store's domain (your own site or its `myshopify.com` address). CiteLadder reads the store's public product list; no app install or sign-in is needed. Variants become a price range, the first image is the product image, and the product type and tags become categories. The public list carries no currency, so set it afterwards if you need it.
- **Merchant Center feed:** upload a feed file (CSV, TSV, XML or JSON) with Google's field names. Items that share an `item_group_id` become one product with a price range, `product_type` becomes the category path, and prices such as `59.00 EUR` are read with their currency. Ambiguous prices, such as `$59` or `1,299.00`, are rejected rather than guessed.
- **CSV:** download the sample, fill it in and upload it. `title` and `brand` are required; `description`, `price`, `currency`, `link`, `image_link`, `category`, `sku` and `gtin` are optional. Write a category as a path, `Shoes > Running`, and separate several with `|`.

The feed and CSV options each offer a **Download sample CSV** in the format they read. Files must be UTF-8: a file saved in another encoding is refused before anything is imported, so save it as CSV UTF-8 and upload it again.

Choose **Review categories** to see the proposed category tree before anything is saved. Clear any category you don't want; everything under it is left out too. Then choose **Import**. The results list added, updated, unchanged and rejected rows, rejected first, each with its reason. Importing the same content again shows the first import's results.

A row matches an existing product by its URL, SKU or GTIN, or by name and brand when it has none of them.

## Edit and archive products

Choose **Edit product** on a product's page or row to change its name, brand, description, price, currency, URL, image, identifiers or categories. Your edit wins over later crawls. A later import that repeats the field's earlier imported value keeps your edit; one with a new value replaces it.

**Archive** takes a product out of **My catalog**, new answer matching and prompt generation. Its history and answers stay, and it lists under **Archived**, where its page offers **Restore**.

## Read the Products table

**Products** lists one row per product, with the categories and their product counts beside the table. Use the strip above it to choose:

- **My catalog** (your products), **All products** (adding approved competitors and products seen only in AI answers) or **Archived**;
- a search over name, brand or URL;
- the **Window** (7, 30 or 90 days), **Engine** and **Prompt set**;
- **Columns** to show or hide.

**Export** downloads the rows on screen. Check catalog products and choose **Find competitors** to start competitor discovery for up to 10 at once. On a product seen only in AI answers, **Add to tracking** approves it as a competitor.

| Metric          | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| Visibility      | Answers in scope that named the product, divided by all answers in scope                     |
| Appearances     | Answers that named the product; 0 is a real zero                                             |
| Win rate        | Ordered appearances at first place, divided by ordered appearances                           |
| Position        | Mean best place over ordered appearances                                                     |
| Mentioned price | Median price the answers quoted, in the catalog currency; other currencies are counted apart |
| Catalog price   | Your catalog price, or its range across variants                                             |
| Merchants       | The merchant sites the answers send shoppers to                                              |

A product counts once per answer, at its best place. Win rate only counts answers the product appears in, so a product named in 3% of answers can still win a third of those. A recommendation in prose or an unordered list has no place, so position and win rate can be unavailable even when a product appears. With no answer in scope, visibility is unavailable rather than zero. Branded comparison prompts stay out of these numbers, because they name your brand by design.

There are no comparisons with the previous period yet.

## ChatGPT shopping carousels

When ChatGPT answers with a product carousel, CiteLadder reads each card as a ranked slot: its place in the carousel, title, ChatGPT's label (such as "Best overall value"), price, currency, merchant and link. Fields ChatGPT leaves empty stay empty rather than zero, and card ratings are not read. A carousel's order decides first place in that answer. Sponsored cards are not counted. Other engines' products are read from the answer text.

## Open a product's page

Choose a row to open the product's page: its brand, image, description and link, the same metrics as the table, and:

- **Competing products:** products named in the same answers, with how often each ranked above this one;
- **Merchants**, **Sources** (the pages those answers cited) and **Query fan-outs** (the searches those answers ran);
- **Prompts:** visibility, win rate and position per prompt;
- **Answers:** each answer it appeared in, marked won, lost or unranked, opening the full answer.

For your own products, the page also holds setup: the product's open Actions with **Work with agent**, competitor discovery and review, and hero-product prompts. Discovered competitors do not enter measurement until you approve them. A category's page holds its competitors and its shopping prompts. **Back to Products** returns to the table with your filters.

## Prepare shopping prompts

On a category's page, open **Shopping prompts matrix** and choose **Generate matrix**. CiteLadder writes one question for each buyer context and buying stage in the category (three contexts, at the consideration and decision stages), plus a few branded comparisons, at most a fifth of the set. Coverage shows which cells are filled. See [Prompts](/prompts/#shopping-prompts).

For a product that matters most, open its page and choose **Generate 3 for this hero product**. Other products are covered by their category's prompts.

Generated prompts stay disabled until you choose **Approve**. **Review and launch** opens the audit launcher with the approved prompts, where you review engines, repetitions and the estimated cost. The audit freezes the catalog and competitors it measured, so later edits do not reinterpret old answers.

## Read the Shopping overview

**Overview** ranks brands and products by appearances for the window, with visibility, win rate and position, and Share of Shelf for brands: a brand's product slots divided by every product slot in scope. It also lists your most and least visible products, the top merchants and the top fan-out queries from answers that held a product.

Choose a category to narrow every list and to see its category shelf from the latest Commerce audit:

| Metric                  | Meaning                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Product Visibility      | Successful target executions with an owned appearance, divided by successful target executions |
| Share of Shelf          | Owned recognized slots, divided by owned plus approved-competitor slots                        |
| Average Shelf Position  | Mean owned rank where recommendations have an explicit order                                   |
| First-Position Win Rate | Ordered executions whose first slot is owned, divided by ordered executions                    |

## Decide what to improve

CiteLadder raises Actions for your products from the last 30 days of answers:

- **Catalog product never mentioned by answer engines:** the product appeared in none of the window's answers (at least five);
- **Answers quote a different price than your catalog:** the median quoted price is more than 10% outside your catalog price or range;
- **Product is visible but rarely ranked first:** it wins less than 20% of its ordered appearances;
- **Answers send shoppers only to other merchants:** answers name merchants for the product, but never your own site.

A product with too few answers or quotes to judge raises nothing, and one without a catalog price raises no price Action.

Open an Action from the product's page to prepare a change, alone or with the Agent. After you [declare it implemented](/agent/actions/#declare-implementation), later answers measure the same reading. Publishing and later measurement remain separate decisions.
