# Razorpay activation — three PRs, then acceptance

Status: approved 24 September 2026. PR A (commercial core) implemented;
PR B and PR C not started. The owner approved this scope. Payments stay
disabled: `BILLING_CHECKOUT_ENABLED` and `BILLING_RAZORPAY_LIVE_READY` remain
false until the go-live sign-off in the acceptance phase. Testing against Razorpay is the last phase, after
everything is implemented.

This plan supersedes the pause in
[provider readiness](../billing-provider-readiness.md) and the retired local
test-integration plan (its original record stays in
[the archive](../archive/plans/citeladder-razorpay-local-test-integration.md)).
Commercial terms come from the
[launch configuration](../operations/CiteLadder_Launch_Config.md)
(`launch-pricing-v1`), as amended by the owner decisions below.

## Owner decisions (24 September 2026)

| Topic | Decision |
|---|---|
| Launch scope | **BYOK plans only.** Funded (Managed AI) checkout stays refused. Funded work (scheduled-coverage reserve, funded INR prices) is deferred to a later plan. |
| Razorpay approvals | Everything is approved: Subscriptions, international payments, and the recurring methods. Record the exact method list from the Dashboard in slice A1. |
| INR pricing | INR prices are **exclusive of GST**. CiteLadder calculates GST itself and adds it. |
| Who pays GST | GST applies to Indian customers only. For international customers, the code applies the CA-approved export-eligibility rule: a USD charge, the buyer's export attestation, and the configured LUT reference frozen on the receipt. A foreign billing address alone does not establish zero-rating. |
| Currency | Chosen from the customer's billing country. Prices are fixed in the catalog, never converted with live FX (see "Currency rule"). |
| Add-ons and top-ups | Included at launch, in **both INR and USD**. Every add-on and top-up is a **one-time purchase**. It stays usable until 30 days after purchase or the end of the paid subscription, whichever comes first. If the plan lapses, they stop working. If the plan is renewed, they work again until their own 30-day expiry. |
| INR rate | Config-owned authoring input (default ₹90/USD). It is applied once when a catalog revision is authored, and the result is frozen. Changing the rate means publishing a new revision; there is no runtime FX. |
| Plan changes | An **upgrade** takes effect immediately and charges the prorated difference for the rest of the period, with its own GST invoice. A **downgrade** takes effect at the next renewal, with no refund. A workspace never has two active base subscriptions. |
| Cancellation | At the end of the period. Paid access continues until the end of the period that has been verified as paid. |
| Refunds | A **full** refund revokes the purchase's remaining grants from the refund time, and credits already used are not clawed back. A **partial** refund keeps access. Every refund issues a credit note. |
| Billing area | A dedicated in-app billing section with invoices and receipts. The current UI needs improvement. |
| Support email | `contact@cube27.com` |
| Support phone | None yet. Keep an optional field; hide it when empty. |
| Contact link | `https://www.cube27.com/contact/` |
| Refund and cancellation policy | A new public page, created in this plan. |
| Seller GSTIN | `27AAJCC0427H1ZU` (Maharashtra, state code 27) |
| Testing | Last phase, after PRs A–C. Use Razorpay test mode, the Razorpay MCP extension, and, if needed, the Dashboard through the browser. |

Razorpay's own GSTIN (`29AANCR6717K1ZN`) only appears on Razorpay's fee
invoices to Cube27. It never appears on CiteLadder customer invoices.

Secrets never go into Git, docs or chat. Test keys go only in the ignored
`billing-test.env`, under the names `BILLING_RAZORPAY_KEY_ID`,
`BILLING_RAZORPAY_KEY_SECRET` and `BILLING_RAZORPAY_WEBHOOK_SECRET`. Live keys go
only in the production secret manager.

Razorpay's generic "Standard Web Checkout" prompt is reference material only. The
repository already has a provider-neutral integration, so this plan extends it.
Do not add parallel `/api/create-order` routes, `NEXT_PUBLIC_*`/`VITE_*` key
variables, or the generic `RAZORPAY_*` environment variable names.

## Currency rule (simplified)

- **Two regions only.** A billing country of `IN` is charged in INR. Every other
  country is charged in USD; the card issuer converts to the customer's local
  currency. `resolve_region` already does this.
- **One authoring rule, frozen in the catalog, with no runtime FX:**
  `INR = ceil(USD × 90 / 100) × 100 − 1`, which gives prices ending in `x,x99`.
  This rule reproduces every INR price the owner already approved:

  | SKU | USD | INR (excl. GST) |
  |---|---:|---:|
  | Starter | 49 | 4,499 |
  | Growth | 99 | 8,999 |
  | Scale | 199 | 17,999 |
  | Extra project | 19 | 1,799 |
  | Extra 10 prompts (BYOK) | 15 | 1,399 |
  | Site Health pack | 19 | 1,799 |
  | Managed answer top-up | 99 | 8,999 |
  | Workflow AI top-up | 25 | 2,299 |

- The catalog-authoring tool computes the INR price once. The published revision
  stores the INR integer paise. Runtime code only reads stored prices.
  `BILLING_USD_INR_RATE` and the sandbox FX re-derivation are retired for this
  revision.
- GST is added on top of the INR price at quote time:
  - seller state 27 = buyer state → CGST 9% + SGST 9%
  - any other Indian state → IGST 18%
  - outside India → zero-rated export under the LUT
  - Minor-unit rounding follows the existing `ROUND_HALF_UP` order.

## Current-state audit summary

The G-rows are the gaps between the code and `launch-pricing-v1`. Each PR below
lists the rows it closes.

- **G1** — The persisted-catalog validator hard-codes Growth at 99/149 and Scale
  at 149/299 (`catalog_revisions.py:277`).
- **G2** — Stale legacy price constants (`billing_contracts.py:155`).
- **G3** — Plans are named "Tier 1/2/3" instead of Starter/Growth/Scale.
- **G4** — Tier 1 audits weekly; the launch config says daily.
- **G5** — `audit_credits` per period is not granted (BYOK = 0, so it only
  matters later for funded).
- **G6** — `ai_credits` is not granted (0/500/1500).
- **G7** — `support_tier` is not granted (Scale = priority).
- **G8** — There is no `site_health_page_fetches_per_period` key or metering.
- **G9** — Funded checkout is refused. **Deferred** (BYOK launch).
- **G10** — Fixed INR prices are only representable for BYOK plans, and are
  FX-validated.
- **G11** — The persisted catalog has no add-ons or top-ups. The legacy builder
  treats add-ons as monthly and lacks the Site Health pack and the Workflow AI
  top-up.
- **G12** and **G13** — The scheduled-coverage reserve and its negative
  economics. **Deferred** (they only affect funded plans).
- **G14** — Trial terms differ. **Deferred** (invite-only).
- **G15** — The GST rate defaults to `0.18` in source with no approval record.
- **G16** — Provisioning only covers BYOK regional plans.
- **G17** — The docs still say Razorpay is "rejected / paused".
- **G18** — One-time purchases use Razorpay Payment Links. The webhook and
  reconciliation coverage for them must be verified.
- **G19** — There is no public refund and cancellation policy page, and no
  CiteLadder support contact block.
- **G20** — The billing UI (`components/settings/billing-settings.tsx` and
  `components/billing/*`) needs a dedicated, improved billing section.

## Delivery: three PRs plus an acceptance phase

Each PR is one branch that carries several committed slices. Every slice has its
own targeted tests, and the full quality gate runs once per PR in CI. Each PR
leaves the app deployable with checkout still switched off, so a merged PR never
exposes a half-built purchase path.

| PR | Theme | Closes | Depends on |
|---|---|---|---|
| **A** | Commercial core: catalog, currency, tax, documents, entitlements | G1–G8, G10, G11, G15, G17 | — |
| **B** | Razorpay payment paths and checkout integration | G16, G18 | A |
| **C** | Customer surfaces: in-app billing section, public pricing, legal, support | G19, G20 | A (B for live purchase buttons) |
| — | Acceptance: Razorpay test mode end to end, then go live | — | A, B, C merged |

B and C can be built in parallel once A has merged. C's purchase buttons use B's
client. Until B merges, C renders them behind the existing checkout-availability
state, so nothing is clickable that cannot complete.

### PR A — Commercial core (backend + docs)

This PR makes `launch-pricing-v1` real inside the application: the catalog,
prices, tax, invoices and grants. It makes no payment-provider changes.

**Slice A1 — Decisions and docs (G17).**
- Record the owner decisions in `razorpay-and-demo-owner-requirements.md`,
  including the list of enabled payment methods read from the Dashboard.
  Non-secret values only.
- Rewrite `billing-provider-readiness.md` to say "approved, being activated".
- Amend the launch config: BYOK launch, INR prices for add-ons and top-ups,
  funded plans deferred.
- Update `plans/ACTIVE.md` and retire the pending local-test plan into this one.

**Slice A2 — Catalog schema v2.**
- Per-plan `prices[region][mode]`, stored as explicit integer minor units.
  The payload has no FX field.
- Persisted `addons[]` and `topups[]`. Each carries its cadence (one-time),
  eligible plans and modes, per-unit grants, quantity bounds, and expiry.
- `support_contact`: email, optional phone, contact URL.
- Structural validation replaces the hard-coded `_validate_approved_plan_terms`
  (G1); the approved amounts live in the seeded revision.
- Schema v1 revisions stay readable.
- `commercial_catalog_from_row` returns the add-ons and top-ups.
- Delete the stale legacy constants (G2).

**Slice A3 — Currency rule and seeding (G3–G7, G10, G11).**
- An authoring helper applies the currency rule once, at authoring time.
- A `billing_admin.py seed` command creates the `launch-pricing-v1` draft with:
  - the names Starter, Growth and Scale (keys `tier_*` unchanged)
  - the product's `audit_cadence` grant set to `daily` for every plan. This is
    how often audits run. It is **not** the billing period. Razorpay
    `period`/`interval` stays `monthly`/`1` for every recurring plan.
  - `ai_credits` 0/500/1500
  - `support_tier` priority for Scale
  - BYOK `audit_credits` 0
  - funded prices present but not purchasable
- All add-ons and top-ups priced in INR and USD.
- Retire `BILLING_USD_INR_RATE` and the sandbox FX re-derivation.

**Slice A4 — Tax engine (G15).**
- The GST rate becomes a required, approved setting with an approval reference.
  The `0.18` source default is removed; checkout stays unavailable while unset.
- The quote splits tax by buyer state against seller state 27: CGST + SGST
  within Maharashtra, IGST elsewhere in India.
- International sales apply the CA-approved export-eligibility rule: a USD
  charge, the buyer's export attestation, and the configured LUT reference,
  which is frozen on each receipt. Neither currency nor billing country alone
  decides export treatment.
- Rounding stays `ROUND_HALF_UP`, applied to the base first, then the tax.

**Slice A5 — Invoices, receipts and credit notes.**
- Each paid event issues an invoice and a receipt: the first subscription
  charge, each renewal, each upgrade proration charge, and each one-time order.
  Each refund, full or partial, issues a credit note that references the
  original invoice.
- Numbering is sequential per financial year under `BILLING_INVOICE_PREFIX`.
  - It comes from the row-locked counter inside the settlement transaction.
  - Invoice and receipt numbers are backed by DB uniqueness constraints.
  - A payment or refund can produce at most one document, enforced by a
    unique `payment_id`.
  - Documents are immutable, with a stored payload digest.

  This behaviour already exists for invoices; credit notes adopt the same
  rules.
- Each document shows the seller GSTIN, and the buyer GSTIN when supplied.
  Line descriptions use the catalog display name frozen with the purchase.
- List and PDF download endpoints, scoped to the billing owner. The PDFs render
  on desktop and mobile.
- Documents are generated from a provider-neutral "paid event" input, so this
  slice can be tested before PR B with the existing test doubles.

**Slice A6 — Entitlements, SKU lifecycle and metering (G8).**
- Add the registry key `site_health_page_fetches_per_period`. Scheduled and
  manual fetches meter against one shared allowance.
- Per-SKU lifecycle, recorded in the existing append-only grant ledger. Every
  grant is recorded with its purchase source, amount, `valid_from`,
  `valid_until` and any revocation reference. Consumables draw the
  earliest-expiring grant first.

  | SKU | Grants | Lifecycle |
  |---|---|---|
  | Plan (Starter/Growth/Scale) | plan bundle | the verified paid period, renewed each period |
  | Extra project | project_slots +1 per unit | one-time; valid until 30 days after purchase or the subscription end, whichever is earlier |
  | Extra 10 prompts (BYOK) | prompt_slots +10 per unit | same as extra project |
  | Site Health pack | monitored_urls +250 and page fetches +2,500 per unit | same as extra project |
  | Managed answer top-up | audit_credits +1,000 per unit | same, and the credits are consumed |
  | Workflow AI top-up (Growth and Scale only) | ai_credits +1,000 per unit | same, and the credits are consumed |

- Add-ons and top-ups require an active paid plan, both at purchase and while
  in use. The resolver's existing top-up rule, effective expiry =
  `min(valid_until, subscription end)`, is extended to add-ons.
- A full refund revokes the purchase's remaining grants from the refund time,
  and credits already consumed are not clawed back. A partial refund does not
  change access.
- Every limit is enforced server-side on the UI, API, scheduler, MCP and agent
  paths.
- The add-on purchase path moves from provider subscriptions to one-time
  payments, reusing the top-up path. Retire the add-on subscription and
  add-on cancellation routes under the replacement gate.

**Exit criteria:**
- A `launch-pricing-v1` draft can be seeded, validated and published locally.
- Quotes produce the correct INR+GST and USD totals for every SKU.
- Invoice, receipt and credit-note PDFs reconcile to those quotes.
- Grants, expiry and revocation behave as specified in the lifecycle table.
- Checkout is still off.

### PR B — Razorpay payment paths

This PR connects the commercial core to Razorpay for every sellable SKU.

**Slice B1 — Integration audit, with the findings fixed in place.**
- Adapter, callback and webhook verification: raw-body HMAC, the event
  allow-list, the dual-secret rotation window, and 204 vs non-2xx responses.
- The `total_cycles` guard, timeouts, and error mapping.
- Test/live mode separation and log redaction.
- The webhook must be reachable through the Cloudflare Workers ingress, and
  `infra/billing-webhook.nginx.conf` must be current.

**Slice B2 — Subscriptions for base plans.**
- BYOK plans in INR and USD. Every recurring provider plan is billed
  `monthly` / interval `1`.
- The international-ready flags gate the USD route.
- The subscription amount equals the quote gross (base + GST for India).
- Paid-period evidence comes only from the webhook or reconciliation, and it
  feeds the paid-event input of slice A5.

**Slice B3 — Subscription lifecycle.**
- **Cancel** at the end of the period. The existing
  `schedule_base_cancellation` behaviour is kept, and access continues until
  the end of the period verified as paid.
- **Upgrade** takes effect immediately:
  - Charge the prorated difference for the rest of the period as a
    server-computed one-time charge, with its own GST invoice.
  - Move the subscription to the higher plan's provider plan from the next
    cycle.
  - Issue the higher-plan grant bundle once the prorated charge has settled.
- **Downgrade** is scheduled for the next renewal, with no refund and no
  mid-period grant change.
- Pending, halted, grace, cancelled and expired states follow the existing
  projector (`apply_subscription_state`).
- A workspace never has two active base subscriptions. `reject_existing_base`,
  plus one pending plan change at a time, enforces this.

**Slice B4 — One-time orders for add-ons, top-ups and upgrade proration.**
- Use Razorpay Orders with Standard Checkout, replacing Payment Links (G18).
- Signature verification uses the **order id stored on CiteLadder's pending
  intent**, never an order id supplied by the browser:
  `HMAC_SHA256(stored_order_id|payment_id, key_secret)`.
- A verified callback grants nothing. Grants come only from `payment.captured`,
  `order.paid` or reconciliation.

**Slice B5 — Webhooks, reconciliation and idempotency.**
- Extend the allow-list to the one-time events, and extend bounded
  reconciliation to orders.
- **Two layers of idempotency:**
  1. Event deduplication per (provider, mode, event id), as today.
  2. Business idempotency per purchase. One pending intent or provider order
     yields exactly one activation, one grant bundle, one payment receipt and
     one document, even when both `payment.captured` and `order.paid` arrive.
     This is backed by the existing pending-activation claim, the grant
     idempotency keys, and the unique payment and document constraints.
     Component tests cover the two-events-one-purchase case.
- Cover abandoned and interrupted checkouts.

**Slice B6 — Versioned provider plans.**
- Provider plan ids are immutable artifacts keyed by
  `(catalog_revision, sku, region, mode)`. They are stored in that revision's
  price entry, together with the amount and currency they were verified
  against.
- Existing subscribers stay pinned to the provider plan and frozen terms they
  authorised (`BillingSubscription.external_price_id`, `frozen_terms`).
- A new revision (price, GST or FX change) provisions new provider plans for
  new customers only. Republishing never changes an existing subscription's
  economics.
- `provision_razorpay_plans.py` proposes and verifies every recurring
  SKU × region for a revision. One-time SKUs need no Razorpay plan.
- Update the operator guide.

**Slice B7 — Frontend checkout client.**
- `lib/billing/razorpay-checkout.ts` loads `checkout.js` and uses the key id
  issued by the server, with no build-time key variable.
- It handles dismissal, `payment.failed`, and a pending or polling state.
- It never treats the redirect or modal callback as proof of payment.

**Slice B8 — Provider contract smoke test (test mode).**
- Run one real test-mode subscription and one real test-mode Orders payment
  through the local `billing-test` environment.
- Confirm that the real payloads match the adapter's parsing before PR C
  builds on them.
- The exhaustive acceptance matrix stays in the final phase.

**Exit criteria:**
- Every SKU and lifecycle transition can be purchased or applied against mocked
  Razorpay responses in component tests, including duplicate, reordered and
  two-events-one-purchase deliveries.
- The smoke test passed.
- The kill switch blocks new checkout while webhooks keep processing.

### PR C — Customer surfaces

This PR covers everything a customer sees.

**Slice C1 — In-app billing section (G20).**
- A dedicated billing route in the app shell, replacing the settings sub-panel.
- Shows the current plan, its status, the renewal date, and cancellation.
- Usage meters.
- Upgrades (immediate, showing the prorated quote) and downgrades (scheduled).
- Buying add-ons and top-ups with a quantity picker, showing each item's
  expiry.
- A quote summary: base price, GST split and total, in the customer's currency.
- Billing details: name, address, state, and optional GSTIN.
- Invoices, receipts and credit notes, with download.
- Honest pending, failed and grace states.
- Built from the design system, works on mobile, covered by tests.

**Slice C2 — Public pricing.**
- Names and prices come from the published catalog.
- The page shows a **display region only**: it may use request geolocation to
  show INR (with an "excl. GST" label) or USD.
- The server quote, resolved from the billing details at checkout, is always
  the authority for currency and tax.
- Add-ons and top-ups are listed on the page.

**Slice C3 — Legal and support (G19).**
- A Refund & Cancellation Policy page in `lib/marketing-content/legal.ts`. The
  terms come from the owner; engineering builds the structure.
- Link it from the footer, the checkout consent copy, and the billing section.
- A support block with the email, the phone when it is set, and the contact URL.
- Recurring-payment consent copy at checkout.

**Exit criteria:**
- Browser acceptance passes on desktop and mobile, with no hard-coded prices
  and a truthful unavailable state while checkout is off.

### Acceptance phase — test mode, then go live

This phase is operational, not a code PR. Anything it finds is fixed in a
follow-up PR.

1. **Test mode, in the local `billing-test` environment.** Webhooks reach it
   through a `cloudflared` tunnel.
   - Provision the test plans and publish a test revision.
   - Pay with the Razorpay test card and with UPI (`test@razorpay`).
   - Run every item in the owner-requirements §8 checklist, plus the one-time
     orders and refunds.
   - Cross-check with the Razorpay MCP extension or the Dashboard that the
     charged amount equals the quote and the invoice.
2. **Live.**
   - Provision the live plans, publish the live revision, register the live
     webhook, and switch on monitoring.
   - Record the sign-off. Then set `LIVE_READY`, and after it
     `CHECKOUT_ENABLED`.
   - Make one small internal purchase and refund it.
   - Open to the allow-list, then launch generally.
3. **Rollback.** Set `BILLING_CHECKOUT_ENABLED=false`. Webhooks and
   reconciliation keep running.

## Open inputs (needed before the slice noted)

- **Before configuring a real environment (A4/A5):**
  - the registered legal name and address
  - the SAC code
  - the GST rate approval reference
  - the CA-approved export-eligibility rule and the LUT reference

  These come from the CA or the company's registration records; engineering
  will not guess them. The code fails closed until they are set, and tests use
  fixtures.
- **Before C3:** the public policy wording. The mechanics are already decided:
  cancellation takes effect at the end of the period, and refunds follow the
  rules in the decisions table. Still to decide: the refund window, and whether
  customers can request refunds for top-ups.

## Out of scope

- Funded plans (G9, G12, G13)
- currencies other than INR and USD
- annual and lifetime plans
- automatic top-ups or overage
- a public trial
- Grok, Perplexity and Copilot
- SSO
- an SLA
