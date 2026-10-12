# Owner requirements — Razorpay billing

> Complete this checklist before CiteLadder enables production checkout. Never
> paste API key secrets or webhook secrets into this file, Git, an issue, or chat.
> Store secrets directly in the deployment secret manager and mark only the
> non-secret completion status here.

Only the free trial is live. Billing runs hidden in production
([B0, B2](../billing-decisions.md)): Razorpay test keys, checkout open only to
allow-listed workspaces. The [decision log](../billing-decisions.md) owns every
billing decision, [billing and entitlements](../billing-entitlements.md) owns the
shipped behavior, the [launch configuration](CiteLadder_Launch_Config.md) owns the
commercial contract, [legal decisions](legal-decisions.md) owns the legal pages and
company details, and the [operator guide](billing-operator-guide.md) owns commands
and incident procedures. This file lists only what the owner or accountant must
supply, and the acceptance evidence still to collect. The
[payment acceptance backlog](../plans/backlog.md#acceptance-calibration-and-rollout)
tracks rollout.

## 0. Recorded merchant facts (24 September 2026)

Non-secret, owner-approved values that code does not hold:

```text
Razorpay approvals: all approved by the owner (Subscriptions, international)
Enabled methods: Visa, Mastercard and RuPay cards; UPI and UPI AutoPay;
                 netbanking (all major banks); eMandate; international payments
Support email: contact@cube27.com (no phone yet)
Contact URL: https://www.cube27.com/contact/
Refund policy URL: https://citeladder.com/refund-policy
Cancellation policy URL: https://citeladder.com/cancellation-policy
Still required: SAC, GST approval reference, LUT reference
```

The seller's legal name, address, email, GSTIN and state are defaults in
`frontend/services/api/src/config/billing.json` ([B45](../billing-decisions.md)).
Razorpay's own GSTIN appears only on its fee invoices to Cube27, never on
CiteLadder customer documents.

## 1. Tax inputs (owner and accountant)

The catalog author (`billing:admin catalog-seed`) derives each India price once
from the published currency rule and freezes the GST-exclusive INR price, the
GST rate and its GST amount in the revision; the Razorpay plan carries their sum.
CiteLadder never reprices an active mandate from an exchange rate, and quotes use
the frozen rate ([B45](../billing-decisions.md)). Non-India checkout is USD. India
prices are not authored until the first two items exist.

- [ ] GST rate for domestic SaaS (`BILLING_INDIA_GST_RATE`; no source default).
- [ ] GST approval reference (`BILLING_INDIA_GST_APPROVAL_REFERENCE`).
- [ ] Service accounting code (`BILLING_SELLER_SAC`).
- [ ] Current LUT reference for zero-rated exports (`BILLING_SELLER_LUT_REFERENCE`).
- [ ] Confirm that consumer-facing prices are GST-exclusive with GST as a separate
      invoice line (the recorded direction) and the exact invoice wording.

## 2. Legal, tax and policy inputs

Obtain India-qualified accounting/legal review; this file is an engineering
checklist, not tax or legal advice. Open legal-page decisions live in
[legal decisions](legal-decisions.md) (L1–L12).

- [ ] Business PAN and GST registration treatment, accountant-approved.
- [ ] Bank account in the legal entity's name and settlement details (Razorpay
      onboarding).
- [ ] Domestic SaaS invoicing treatment.
- [x] International payments approved; zero-rated export treatment still requires
      the transaction conditions, current LUT reference and payment evidence to be
      satisfied and frozen per receipt.
- [x] Public Terms, Privacy, Refund and Cancellation pages published
      ([legal decisions](legal-decisions.md#published-pages)).
- [x] Public support email.
- [x] Billing-data retention and deletion policy
      ([R11](legal-decisions.md#resolved-decisions-reference)).
- [ ] Recurring-payment consent and cancellation copy at checkout, reviewed.
- [ ] Payment-dispute commitment ([B51](../billing-decisions.md), L6).

Checkout collects normalized customer name, address, country, Indian GST state,
optional GSTIN and an export attestation. CiteLadder determines tax before calling
Razorpay and owns the GST/export receipt. Until sandbox evidence proves that the
selected INR/USD route charges the exact application total, keep
`BILLING_RAZORPAY_LIVE_READY=false` and `BILLING_CHECKOUT_AUDIENCE=allow_list`.

## 3. Razorpay account readiness

- [ ] Account created for the approved legal entity, KYC complete, Dashboard shows
      **Activated**, not merely test-enabled.
- [ ] Subscriptions enabled for the live account.
- [ ] Live methods match section 0; record what Razorpay enabled for this merchant
      category rather than relying on generic documentation.
- [ ] Mandate amount limits cover every enabled self-serve price.
- [ ] Settlement schedule, fees, refunds, disputes and reserve terms confirmed.
- [ ] Business name, logo, support details and invoice settings configured.
- [ ] Automatic capture enabled for Standard Checkout payments (an order settles
      only on a captured payment).
- [ ] Confirm whether Razorpay or CiteLadder sends customer subscription
      notifications ([B46](../billing-decisions.md) assumes Razorpay's UPI
      AutoPay pre-debit notice).
- [ ] At least two named Razorpay Dashboard users with strong MFA; no shared owner
      login.

| Launch route | Currency | Cards                                                    | UPI AutoPay                                                             | eMandate                                                                |
| ------------ | -------- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| India        | INR      | Allowed only when enabled for the live merchant          | India/INR only and only when enabled                                    | India/INR only and only when enabled                                    |
| Non-India    | USD      | Allowed only after international cards/currency approval | Excluded unless Razorpay gives written support for this exact USD route | Excluded unless Razorpay gives written support for this exact USD route |

Do not infer one method's approval from another. The live USD route requires
`BILLING_RAZORPAY_INTERNATIONAL_READY=true`; the live INR route needs no regional
flag.

## 4. Secrets and non-secret identifiers

Production has one deployment. Test keys run there while billing is hidden; the
enable change swaps in live keys. The names stay the same in both modes.

Secrets (GitHub `gcp-demo` environment **secrets**, copied by every deploy into
Secret Manager):

```text
BILLING_RAZORPAY_KEY_SECRET               # required when the mode is not disabled
BILLING_RAZORPAY_WEBHOOK_SECRET           # required when the mode is not disabled
BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET  # only during the bounded rotation overlap
```

`BILLING_QUOTE_SIGNING_SECRET` is generated once in Secret Manager
(`citeladder-billing-quote-secret`) and never passes through GitHub; checkout is
unavailable if it equals a Razorpay secret. The deploy fails when
`BILLING_RAZORPAY_MODE` is `test` or `live` without the key ID and both required
secrets.

Non-secret values (GitHub `gcp-demo` environment **variables**; the deploy
workflow passes exactly these):

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
BILLING_INDIA_GST_RATE=<approved-decimal-rate>
BILLING_INDIA_GST_APPROVAL_REFERENCE=<approval record reference>
BILLING_SELLER_SAC=<approved service accounting code>
BILLING_SELLER_LUT_REFERENCE=<current LUT reference>
BILLING_FUNDED_MONTHLY_BUDGET_MINOR=<optional managed-plan monthly spend ceiling>
```

Every other setting in `billing.json` keeps its default in production
(`BILLING_SUBSCRIPTION_TOTAL_CYCLES` 1,200, `BILLING_INVOICE_PREFIX` `CL`,
`BILLING_CANCELLATION_SEND_LEAD_SECONDS` two days); the workflow does not pass
them, so changing one is a code change to its default.

Rules:

- Never reuse live keys or webhook secrets as test values, or the reverse.
- The Razorpay API key secret is not the webhook secret.
- Never send a secret to the browser or place it in a `NEXT_PUBLIC_*` variable.
- `0.18` in application source is not evidence of tax approval; India prices
  are authored only with a GST rate and approval reference.
- Webhook-secret rotation is a bounded overlap of at most 24 hours; follow the
  [operator guide](billing-operator-guide.md#webhook-secret-rotation). Rotate
  immediately on suspected compromise.
- Plan IDs are not credentials. They live in the published catalog revision,
  keyed by plan, mode and region, each bound to the provider mode it was created
  in, so test and live cannot be crossed.

## 5. Production URLs and webhook setup

The webhook URL is served by the marketing (apex) Worker, which forwards only
`POST` on this path to the API; the app and API hosts refuse it:

```text
https://citeladder.com/api/v1/billing/webhooks/razorpay
```

Use the same URL for the test-mode and live webhooks, each with its own secret,
a monitored alert email and an incident owner (section 9). Subscribe to exactly
the events the endpoint handles:

```text
subscription.authenticated   subscription.activated   subscription.charged
subscription.pending         subscription.halted      subscription.cancelled
subscription.completed       subscription.expired     subscription.paused
subscription.resumed         order.paid               payment.captured
payment.failed               refund.processed
```

Order and payment events settle one-time orders (add-ons, top-ups and upgrade
charges); a payment that belongs to a subscription invoice, or has no order (a
payment link or QR code), is acknowledged and ignored. `refund.processed` records
a Dashboard refund and issues its credit note. Dispute events are not handled
([B51](../billing-decisions.md)).

The endpoint verifies the signature over the exact raw body before parsing. Valid
events, ignored events and duplicate event IDs return `204`; an authentication
failure, malformed payload, missing event ID or a reused event ID with a
different body returns `400`, so it shows as a delivery failure.

The URL must use modern HTTPS/TLS and stay reachable independently of the
frontend deployment. Add monitoring for invalid signatures, non-2xx delivery,
reconciliation drift and webhook deactivation.

## 6. Razorpay plan creation

Follow the [operator guide](billing-operator-guide.md#author-the-launch-revision):
`billing:admin catalog-seed`, `billing:plans propose`, create exactly the printed
plans in the Razorpay Dashboard, then `billing:plans bind`. A plan is needed per
recurring plan, mode (BYOK and managed) and region ([B37](../billing-decisions.md));
add-ons, top-ups and upgrade charges are one-time orders and need none.

Razorpay plans cannot be edited or deleted. If a value changes, create a new plan,
bind it in a new catalog revision and verify against that ID before use. Existing
subscribers stay pinned to the plan they authorised.

## 7. Enterprise demo funnel

No owner input is outstanding. "Book a demo" links go to CiteLadder's own
`/contact` page (`DEMO_HREF` in `frontend/lib/marketing-content/nav.ts`); contact
intake is handled by the marketing Worker. There is no `/demo` route and no
booking-URL or sales-email setting.

## 8. Required sandbox acceptance evidence

Run in production through the allow-list with test keys (billing improvement plan,
operator acceptance), then repeat the live lifecycle. Attach or record non-secret
evidence for:

- [ ] Each provisioned test plan verified against the catalog by `billing:plans
      bind`, and the CiteLadder receipt reconstructs the taxable value and
      CGST/SGST or IGST allocation from the exact amount Razorpay charged.
- [ ] Subscription authorization through Razorpay checkout; the initial payment
      produces webhook-confirmed grants and the redirect alone grants nothing.
- [ ] Duplicate and reordered events change nothing twice.
- [ ] A renewal charge produces a distinct period and receipt.
- [ ] A halted subscription is cancelled at Razorpay by the sweep and stays
      current until confirmed ([B24](../billing-decisions.md)).
- [ ] A scheduled cancellation is held, can be resumed, and is sent to Razorpay
      `BILLING_CANCELLATION_SEND_LEAD_SECONDS` before renewal
      ([B46](../billing-decisions.md)); paid time stays usable.
- [ ] Upgrade charges the prorated order and then switches the provider plan;
      downgrade applies at renewal with no charge.
- [ ] Add-on and top-up purchases grant inside the current period; one paid
      outside a period is flagged for refund ([B25, B30](../billing-decisions.md)).
- [ ] A full Dashboard refund of the current period's payment cancels the
      subscription at once and issues a credit note; a partial refund changes
      nothing ([B52](../billing-decisions.md)).
- [ ] Completed or expired subscription ends its grants and reads
      `subscription_lapsed`, not an expired trial ([B26](../billing-decisions.md)).
- [ ] Settled finding 16 of the [billing improvement plan](../plans/billing-improvement.md):
      Razorpay `updated_at` and `cancel_at_cycle_end` behave as assumed, and
      `PATCH /subscriptions` works for UPI and eMandate mandates (or the fallback
      is chosen).
- [ ] Invited users see the workspace's plan; existing audit and site evidence
      stays readable after downgrade.
- [ ] No secret, external customer id, full webhook payload or billing PII in API
      responses or logs.
- [ ] Checkout kill switch blocks new checkout while webhooks still process; every
      other workspace and the public site still show checkout unavailable.

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
General launch approval/date:
```

If any approval, live lifecycle, webhook monitoring or rollback control is
missing, the correct state is `BILLING_CHECKOUT_AUDIENCE=allow_list`, or
`BILLING_CHECKOUT_ENABLED=false` to stop checkout entirely; that switch blocks
new checkout but never webhook ingestion or reconciliation. There is no in-place
catalog rollback; the [operator guide](billing-operator-guide.md#rollback-means-forward-publish)
owns forward-publication. The signed India launch record must show
`BILLING_RAZORPAY_LIVE_READY=true` before checkout is enabled; USD checkout
additionally requires `BILLING_RAZORPAY_INTERNATIONAL_READY=true`. The enable
change is configuration only ([enable PR](../plans/billing-improvement.md#enable-pr)).
