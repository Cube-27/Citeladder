# Owner requirements — Razorpay billing and enterprise demos

> Complete this checklist before CiteLadder enables production checkout. Never
> paste API key secrets or webhook secrets into this file, Git, an issue, or chat.
> Store secrets directly in the deployment secret manager and mark only the
> non-secret completion status here.

Runtime commercial authority is the single published
`BillingCatalogRevision`, validated by
`frontend/services/api/src/billing/admin.ts`; emergency/provider readiness
switches live in native `frontend/services/api/src/config/billing.json`. The billing domain, connector code,
`frontend/services/api/src/cli/billing-admin.ts`, and
`frontend/services/api/src/cli/provision-razorpay-plans.ts` own their respective operations.
Earlier V6/V8 plans are historical context and do not override the published catalog or
API contracts. Follow the tested command and incident procedures in
[`billing-operator-guide.md`](billing-operator-guide.md).

## 0. Recorded owner decisions (24 September 2026)

A dated record. Managed plans have since become purchasable
([B32](../billing-decisions.md)); the [decision log](../billing-decisions.md)
supersedes this block wherever they differ. Non-secret values only. The [launch configuration](CiteLadder_Launch_Config.md)
owns the commercial contract; the
[payment acceptance backlog](../plans/backlog.md#acceptance-calibration-and-rollout)
tracks remaining acceptance and sign-off.

```text
Catalog version: launch-pricing-v1
Enabled self-serve plans: Starter (tier_1), Growth (tier_2), Scale (tier_3), BYOK only
Monthly BYOK USD: 49 / 99 / 199; funded prices published, not sold
INR rule: INR = ceil(USD x 90 / 100) x 100 - 1, GST-exclusive, frozen per revision
Add-ons/top-ups: one-time; 30 days or plan end, whichever is earlier; INR and USD
Plan change: upgrade immediate with prorated charge; downgrade at renewal
Cancellation: end of period
Refunds: full refund revokes remaining grants (no clawback); partial keeps access;
         every refund issues a credit note
Razorpay approvals: all approved by the owner (Subscriptions, international)
Enabled methods: Visa, Mastercard and RuPay cards; UPI and UPI AutoPay;
                 netbanking (all major banks); eMandate; international payments
Support email: contact@cube27.com
Support phone: none yet (optional field)
Contact URL: https://www.cube27.com/contact/
Seller GSTIN: 27AAJCC0427H1ZU (Maharashtra, state code 27)
Seller legal name: CUBE27 IT PRIVATE LIMITED
Seller registered address: Plot No 12, Mulberry Garden 1, Magarpatta City,
                 Hadapsar, Pune, Maharashtra 411013
Still required: SAC, GST approval reference, LUT reference
Refund policy URL: https://citeladder.com/refund-policy
Cancellation policy URL: https://citeladder.com/cancellation-policy
```

Razorpay's own GSTIN appears only on Razorpay's fee invoices to Cube27, never
on CiteLadder customer documents.

## 1. Blocking commercial decisions

Record the approved values in a dated decision record (amounts are examples of
fields, not suggested values):

```text
Catalog version:
Effective date:
Enabled self-serve catalog plan keys/display names:
Per-plan monthly USD base amounts verified against the shipped catalog:
USD/INR provisioning rate and source/date:
Per-plan derived monthly INR GST-exclusive base amounts and gross provider amounts:
GST is displayed as a separate invoice tax line for India: yes (approved direction)
GST rate/treatment approved by, approval date, and tax metadata/version:
Trial enabled? yes/no; if yes, exact duration and first-charge behavior:
Past-due grace duration:
Cancellation: end of period or immediate:
Refund policy and entitlement effect:
Selected billing period/interval and total cycles (monthly interval 1: at most
1200; annual interval 1: at most 100; all combinations: at most 100 years):
Annual plan at launch? no/yes; if yes, exact amount, interval, cycles, and policy:
Customer communications handled by Razorpay? yes/no:
```

Why this is a live-plan gate: Razorpay requires a concrete amount and currency.
The catalog author (`billing:admin catalog-seed`) derives each India price once
with the published rule at the recorded authoring rate and freezes the
**GST-exclusive INR price and its GST amount** in the revision; the Razorpay
plan carries their sum as the final charge. CiteLadder never reprices an active recurring mandate from an exchange
rate. GST is calculated from the frozen INR base with the approved rate and
rounded once to paise with `ROUND_HALF_UP`.
Razorpay collects that final total but does not determine the tax allocation.
Non-India launch checkout is USD; a
cardholder's issuer may convert that charge into the card account currency.

## 2. Legal, tax, invoice, and policy inputs

Obtain India-qualified accounting/legal review and provide the approved outcome:

- [ ] Legal entity/business type and registered legal name.
- [ ] Business PAN and GST registration/GSTIN treatment.
- [ ] Registered business and billing address, state/place-of-supply handling.
- [ ] Bank account in the legal entity's name and settlement details.
- [ ] Whether consumer-facing prices include GST and the exact invoice wording.
- [ ] Domestic SaaS invoicing treatment.
- [x] International payments approved; zero-rated export treatment still
      requires the transaction conditions, current LUT reference, and payment
      evidence to be satisfied and frozen per receipt.
- [ ] Public Terms of Service URL.
- [ ] Public Privacy Policy URL.
- [ ] Public Refund and Cancellation Policy URL.
- [ ] Public customer-support email and, if required, phone/address.
- [ ] Recurring-payment consent and cancellation copy.
- [ ] Data retention and deletion policy for billing records.

This document is an engineering checklist, not tax or legal advice.

The legal entity, PAN/GSTIN, settlement bank, registered address, and merchant
support details belong in Razorpay onboarding and the approved legal documents;
the exact supplier invoice fields are also deployment configuration frozen into
each CiteLadder receipt. Checkout collects normalized customer name, address,
country, Indian GST state, optional GSTIN, and export attestation. CiteLadder
determines tax before calling Razorpay and owns the GST/export receipt. Provider
payment reconciliation remains a live-launch gate: until sandbox evidence proves
that the selected INR/USD route charges the exact application total, keep
`BILLING_RAZORPAY_LIVE_READY=false` and `BILLING_CHECKOUT_AUDIENCE=allow_list`.

## 3. Razorpay account readiness

- [ ] Create the Razorpay account for the approved legal entity.
- [ ] Complete sign-up and KYC. Razorpay's Dashboard must show the account as
      **Activated**, not merely test-enabled.
- [ ] Confirm Razorpay Subscriptions is enabled for the live account.
- [ ] Confirm the live account's approved methods: Cards, UPI AutoPay, and/or
      eMandate. Do not rely on generic documentation; record what Razorpay enabled
      for this merchant category.
- [ ] Confirm mandate amount limits cover every enabled self-serve catalog price.
- [ ] Confirm settlement schedule, fees, refunds, disputes, and reserve terms.
- [ ] Configure the customer-facing business name, logo, support details, and
      invoice settings in Razorpay.
- [ ] Confirm whether Razorpay or CiteLadder sends customer subscription
      notifications.
- [ ] Name at least two Razorpay Dashboard users and enable strong MFA/access
      controls; avoid a shared owner login.

Record the merchant-specific approval against this launch matrix:

| Launch route | Currency | Cards                                                    | UPI AutoPay                                                             | eMandate                                                                |
| ------------ | -------- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| India        | INR      | Allowed only when enabled for the live merchant          | India/INR only and only when enabled                                    | India/INR only and only when enabled                                    |
| Non-India    | USD      | Allowed only after international cards/currency approval | Excluded unless Razorpay gives written support for this exact USD route | Excluded unless Razorpay gives written support for this exact USD route |

Do not infer one method's approval from another. The USD route requires
`BILLING_RAZORPAY_INTERNATIONAL_READY=true`; the India/INR route does not.

## 4. Secrets and non-secret identifiers

Production has one deployment. Razorpay test keys run there while billing is
hidden: a test-mode checkout serves only allow-listed workspaces, whatever the
audience. The enable change swaps in live keys. The names stay the same in both
modes.

Secret values — GitHub `gcp-demo` environment **secrets**, which every deploy
copies into Secret Manager:

```text
BILLING_RAZORPAY_KEY_SECRET               # required when the mode is not disabled
BILLING_RAZORPAY_WEBHOOK_SECRET           # required when the mode is not disabled
BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET  # only during the bounded rotation overlap
```

`BILLING_QUOTE_SIGNING_SECRET` is generated once in Secret Manager
(`citeladder-billing-quote-secret`) and never passes through GitHub; checkout
stays unavailable if it equals any Razorpay secret. The deploy fails when
`BILLING_RAZORPAY_MODE` is `test` or `live` without the key ID and both
required secrets.

Non-secret values — GitHub `gcp-demo` environment **variables**:

```text
BILLING_RAZORPAY_MODE=disabled                  # disabled | test | live
BILLING_RAZORPAY_KEY_ID=<rzp_test_… or rzp_live_…, matching the mode>
BILLING_CHECKOUT_ENABLED=false                  # new-checkout kill switch
BILLING_CHECKOUT_AUDIENCE=allow_list            # allow_list | everyone
BILLING_RAZORPAY_TEST_READY=false               # test-mode acceptance passed
BILLING_RAZORPAY_TEST_INTERNATIONAL_READY=false # USD route in test mode
BILLING_RAZORPAY_TEST_INDIA_READY=false         # INR route in test mode
BILLING_RAZORPAY_LIVE_READY=false               # live lifecycle passed
BILLING_RAZORPAY_INTERNATIONAL_READY=false      # USD route in live mode
BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET_STARTED_AT=<RFC 3339, rotation only>
BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET_EXPIRES_AT=<RFC 3339, at most 24 h later>
BILLING_INDIA_GST_RATE=<approved-decimal-rate>  # no source default
BILLING_INDIA_GST_APPROVAL_REFERENCE=<approval record reference> # required with the rate
BILLING_SELLER_SAC=<approved service accounting code>
BILLING_SELLER_LUT_REFERENCE=<current LUT reference>
```

The seller's legal name, address, email, GSTIN and GST state default to the
values recorded in section 0
(`frontend/services/api/src/config/billing.json`); only SAC, the LUT reference
and the GST approval reference remain owner inputs. Other settings in that
file keep their defaults in production, including
`BILLING_SUBSCRIPTION_TOTAL_CYCLES` (1,200 monthly cycles, Razorpay's 100-year
maximum), `BILLING_INVOICE_PREFIX` (`CL`) and
`BILLING_CANCELLATION_SEND_LEAD_SECONDS` (two days: how long before renewal a
held cancellation is sent to Razorpay). The deploy workflow does not pass them,
so changing one is a code change to its default.

Rules:

- Never reuse live keys or webhook secrets as test values, or the reverse.
- The Razorpay API key secret is not the webhook secret.
- Never send a secret to the browser or place it in a `NEXT_PUBLIC_*` variable.
- Provisioning must fail while the GST rate, treatment, approval reference, or
  effective tax metadata/version is unset; `0.18` in application source is not
  evidence of tax approval.
- Before subscription creation, validate that the selected
  `billing_period × interval × total_cycles` never exceeds Razorpay's 100-year
  maximum. For interval 1 this permits at most 1,200 monthly or 100 annual
  cycles; recompute the limit for every other period/interval.
- For a planned webhook-secret rotation, set the previous secret and its
  started/expires window in the same deploy as the new active secret. The
  endpoint accepts the previous secret only inside that window, and never for
  longer than **24 hours**, with the same event-ID and provider-state
  idempotency checks for both. At expiry, clear the previous secret and window
  and redeploy, which disables its Secret Manager versions; record the rotation
  evidence. Rotate immediately on suspected compromise; do not extend the
  overlap, and reconcile any failed old-secret delivery explicitly.
- Plan IDs are not credentials. They live in the published catalog revision,
  keyed by plan, mode and region, and each one is bound to the provider mode it
  was created in, so test and live cannot be crossed.

## 5. Production URLs and webhook setup

Provide:

```text
Canonical production frontend origin:
Canonical production backend origin (server-only):
Checkout return route/origin:
Razorpay live webhook URL:
Razorpay test/staging webhook URL:
Webhook alert email:
Operations incident email/channel:
```

The webhook URL is served by the marketing (apex) Worker, which forwards only
`POST` on this path to the API; the app and API hosts refuse it:

```text
https://citeladder.com/api/v1/billing/webhooks/razorpay
```

Use the same URL for the test-mode and live webhooks, each with its own secret.
Subscribe to exactly the events the endpoint handles:

```text
subscription.authenticated
subscription.activated
subscription.charged
subscription.pending
subscription.halted
subscription.cancelled
subscription.completed
subscription.expired
subscription.paused
subscription.resumed
order.paid
payment.captured
payment.failed
refund.processed
```

Order and payment events settle one-time orders (add-ons, top-ups and upgrade
charges); a payment that belongs to a subscription invoice, or has no order (a
payment link or QR code), is acknowledged and ignored. `refund.processed`
records a Dashboard refund and issues its credit note.

The endpoint verifies every signature over the exact raw body before dispatch. A validly
signed event outside this list is acknowledged with `204` and does not mutate billing
state. An allow-listed event for an unknown external subscription is recorded as `unmatched`,
acknowledged with `204`, and does not mutate entitlements. Duplicate event ids and stale
provider-state versions are also acknowledged idempotently. Malformed payloads and invalid
signatures remain non-2xx so they are visible as configuration or delivery failures.

The webhook URL must use modern HTTPS/TLS and remain reachable independently of
the frontend deployment. Add monitoring for invalid signatures, non-2xx delivery,
duplicate/reordered events, reconciliation drift, and webhook deactivation.

## 6. Razorpay plan creation procedure

Use the isolated local procedure in [billing operator guide](billing-operator-guide.md#isolated-local-razorpay-test).
The provisioning CLI requires --revision and --environment. Proposal reads that
persisted revision without provider I/O; verification fetches provider plans and
compares item name, gross amount, currency, cadence and interval. Create plans
explicitly in the Dashboard/API. Import their private references in a reviewed
immutable regional catalog payload, verify, then publish with the audited CLI.
Empty verification sets and mismatched terms fail closed.
Razorpay plans cannot be edited or deleted after creation. If a value changes or
a plan was created outside this process, create or duplicate a new plan, record
the new plan ID, install it in the matching environment, and run verification
against that ID before use. Keep the old plan ID in the audit record for existing
subscriptions; never pretend it was modified in place.

## 7. Enterprise demo funnel inputs

Provide the launch destination and public contact details:

```text
Public sales email:
Approved HTTPS booking URL (Cal.com, Calendly, or other approved provider):
Booking provider/vendor:
Demo duration:
Availability owner/time zone:
Expected response-time copy:
Privacy Policy URL covering the booking vendor:
Cookie/consent requirement for this vendor:
Optional analytics allowed on /demo? yes/no and approved tool:
```

Install the approved values only on the Next.js server (never as
`NEXT_PUBLIC_*`):

```text
DEMO_BOOKING_URL=https://<approved-provider>/...
PUBLIC_SALES_EMAIL=sales@<approved-domain>
```

Launch behavior:

- CiteLadder owns a stable public `/demo` route.
- Every public “Book a demo”/Enterprise sales CTA points to `/demo` through the
  centralized `DEMO_HREF`.
- `/demo` opens the approved external HTTPS booking destination.
- Without a booking URL, `/demo` truthfully offers `mailto:<public-sales-email>`;
  it does not show a fake scheduler.
- CiteLadder does not persist demo-lead PII in the first release. If a first-party
  form/CRM is desired later, approve its fields, lawful basis/consent, retention,
  deletion, anti-spam controls, notification provider, and processor agreement in
  a separate change.

## 8. Required sandbox acceptance evidence

Attach or record non-secret evidence for:

- [ ] Provisioned test plan verified against the approved catalog, including
      evidence that its gross recurring amount equals the application quote's
      final charge and the CiteLadder receipt reconstructs the taxable value and
      CGST/SGST or IGST allocation after the documented minor-unit rounding.
- [ ] The selected billing period, interval, and total cycles pass the 100-year
      maximum calculation before subscription creation (including separate
      monthly and annual fixtures when both are offered).
- [ ] Subscription authorization through hosted Razorpay checkout.
- [ ] Initial payment produces webhook-confirmed grants; redirect alone does not.
- [ ] Duplicate event is acknowledged without duplicate mutation.
- [ ] Reordered event does not downgrade/upgrade incorrectly.
- [ ] Failed renewal enters grace, then recovers or downgrades as approved.
- [ ] Halted subscription fails closed for new plan-gated work.
- [ ] End-of-period cancellation preserves access only through verified paid time.
- [ ] Completed/expired subscription removes expired grants and resolves to the
      unentitled baseline.
- [ ] Invited user sees the active workspace sponsor's entitlement.
- [ ] Existing audit/site evidence remains readable after downgrade.
- [ ] No secret, external customer id, full webhook payload, or billing PII appears
      in API responses or logs.
- [ ] Checkout kill switch blocks new checkout but webhooks still process.
- [ ] Every demo CTA reaches `/demo`, and `/demo` reaches the approved booking URL
      or honest email fallback.

## 9. Live go/no-go sign-off

Record names and dates; no secrets:

```text
Product/catalog approval:
Accounting/tax approval:
Legal/policy approval:
Security review:
Engineering verification:
Razorpay account/KYC verified by:
Live payment + invoice + settlement verified by:
Support/refund owner:
Incident owner:
Allow-list launch date:
General India launch approval/date:
```

If any required approval, live lifecycle, webhook monitoring, or rollback control
is missing, the correct state is `BILLING_CHECKOUT_AUDIENCE=allow_list`, or
`BILLING_CHECKOUT_ENABLED=false` to stop checkout entirely. That switch
blocks new checkout but must not disable webhook ingestion or bounded
reconciliation for already-created intents. A no-card campaign incident requires
an independent reviewed catalog forward-publication with the campaign
ended/disabled; the checkout switch does not control it. There is no in-place
catalog rollback. The signed
India launch record must show `BILLING_RAZORPAY_LIVE_READY=true` before checkout
is set true. USD checkout additionally requires
`BILLING_RAZORPAY_INTERNATIONAL_READY=true`; do not require that international
flag for the India/INR route.

## 10. India-first alternatives retained as contingency

Razorpay is the selected launch provider, but the provider boundary should remain
neutral. Current alternatives worth a sandbox evaluation if Razorpay activation,
methods, or commercials fail are:

1. **Cashfree Subscriptions** — its current documentation exposes subscription
   status/auth/payment/refund webhooks and hosted/custom checkout surfaces.
2. **PayU recurring payments / Zion** — its current documentation covers plans,
   subscriptions, cards, UPI consent/mandates, pre-debit notifications, recurring
   transactions, cancellation, and lifecycle webhooks.
3. **PhonePe PG AutoPay** — its current developer documentation exposes AutoPay
   subscription setup, authorization, redemption, status, pause/unpause, revoke,
   and cancel APIs. It would require a separate adapter and commercial/onboarding
   evaluation.

Primary sources:

- [Cashfree subscription webhook events](https://www.cashfree.com/docs/payments/subscription/webhooks)
- [PayU recurring payments overview](https://docs.payu.in/docs/introduction-recurring-payments-integration)
- [PayU plans/subscription automation](https://docs.payu.in/docs/understanding-plan)
- [PhonePe PG AutoPay introduction](https://developer.phonepe.com/payment-gateway/autopay/api-integration/introduction)

Do not switch a live customer between providers silently. A migration remains an
explicit cancel/re-subscribe operation with owner approval.
